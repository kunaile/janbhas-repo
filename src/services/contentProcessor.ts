// src/services/contentProcessor.ts
import matter from 'gray-matter';
import {
    findOrCreateAuthor,
    findOrCreateCategory,
    findOrCreateLanguage,
    upsertArticle,
    softDeleteArticle,
    getAllActiveArticles,
    type AuthorData,
    type CategoryData,
    type LanguageData,
    type ArticleData
} from './database';
import { transliterateAuthorName, transliterate, generateSlug, normalizeText, getLanguageName } from '../utils/transliteration';
import { getMarkdownFileContent, type FileChange, type CommitInfo } from './fileProcessor';

// Clean logging utilities
const log = {
    info: (msg: string) => console.log(`[INFO] ${msg}`),
    warn: (msg: string) => console.log(`[WARN] ${msg}`),
    error: (msg: string) => console.log(`[ERROR] ${msg}`),
    success: (msg: string) => console.log(`[OK] ${msg}`),
    alert: (msg: string) => console.log(`[ALERT] ${msg}`)
};

/**
 * Expected frontmatter structure from markdown files
 */
type Frontmatter = {
    author: string;
    title: string;
    category: string;
    lang: string;
    date?: string;
    thumbnail?: string;
    audio?: string;
    words?: number;
    duration?: string | number;
    published?: boolean;
};

/**
 * Converts duration from MM:SS format to total seconds
 */
function parseDuration(duration: string | number | undefined): number | null {
    if (!duration) return null;

    if (typeof duration === 'number') return duration;

    const durationStr = duration.toString().trim();

    // Handle MM:SS format (e.g., "09:43")
    if (durationStr.includes(':')) {
        const parts = durationStr.split(':');
        if (parts.length === 2) {
            const minutes = parseInt(parts[0], 10);
            const seconds = parseInt(parts[1], 10);
            if (!isNaN(minutes) && !isNaN(seconds)) {
                return minutes * 60 + seconds;
            }
        }
        // Handle HH:MM:SS format (e.g., "1:09:43")
        if (parts.length === 3) {
            const hours = parseInt(parts[0], 10);
            const minutes = parseInt(parts[1], 10);
            const seconds = parseInt(parts[2], 10);
            if (!isNaN(hours) && !isNaN(minutes) && !isNaN(seconds)) {
                return hours * 3600 + minutes * 60 + seconds;
            }
        }
    }

    // Handle plain number string
    const parsed = parseInt(durationStr.replace(/[^\d]/g, ''), 10);
    return isNaN(parsed) ? null : parsed;
}

/**
 * Extracts a short description from markdown content
 */
function extractShortDescription(markdownContent: string): string {
    if (!markdownContent) return '';

    const lines = markdownContent
        .replace(/^#+\s+/gm, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    const firstParagraph = lines[0] || '';

    if (firstParagraph.length <= 150) {
        return firstParagraph;
    }

    return firstParagraph.substring(0, 147) + '...';
}

/**
 * Validates required frontmatter fields
 */
function validateFrontmatter(fm: Frontmatter): string[] {
    const required = ['author', 'title', 'lang', 'category'];
    const missing: string[] = [];

    for (const field of required) {
        if (!fm[field as keyof Frontmatter]) {
            missing.push(field);
        }
    }

    return missing;
}

/**
 * Processes a single markdown file and updates the database
 * UPDATED: Now handles async transliteration
 */
export async function processMarkdownFile(filename: string): Promise<boolean> {
    try {
        log.info(`Processing: ${filename}`);

        const fileContent = getMarkdownFileContent(filename);
        if (!fileContent) {
            log.error(`Could not read file: ${filename}`);
            return false;
        }

        // Parse frontmatter and content
        const { data: frontmatter, content: markdownContent } = matter(fileContent);
        const fm = frontmatter as Frontmatter;

        // Validate required fields
        const missingFields = validateFrontmatter(fm);
        if (missingFields.length > 0) {
            log.warn(`Missing required fields in ${filename}: ${missingFields.join(', ')}`);
            return false;
        }

        // Process metadata
        const normalizedLang = normalizeText(fm.lang);
        const languageName = getLanguageName(normalizedLang);

        // UPDATED: Use async transliteration with Promise.all for better performance
        const [transliteratedAuthor, transliteratedTitle] = await Promise.all([
            transliterateAuthorName(fm.author, normalizedLang),
            transliterate(fm.title, { lang: normalizedLang })
        ]);

        const slug = await generateSlug(fm.title, fm.author, normalizedLang);

        // Parse duration properly
        const duration = parseDuration(fm.duration);
        if (fm.duration && duration === null) {
            log.warn(`Invalid duration format in ${filename}: ${fm.duration}`);
        }

        // Create/find language record
        const languageData: LanguageData = {
            name: languageName,
            code: normalizedLang,
        };
        const languageId = await findOrCreateLanguage(languageData);

        // Create/find author record
        const authorData: AuthorData = {
            name: transliteratedAuthor,
            localName: fm.author
        };
        const authorId = await findOrCreateAuthor(authorData);

        // Create/find category record  
        const categoryData: CategoryData = {
            name: normalizeText(fm.category)
        };
        const categoryId = await findOrCreateCategory(categoryData);

        // Prepare article data
        const articleData: ArticleData = {
            slug,
            title: transliteratedTitle,
            localTitle: fm.title,
            shortDescription: extractShortDescription(markdownContent),
            markdownContent,
            publishedDate: fm.date ? new Date(fm.date).toISOString().split('T')[0] : null,
            thumbnailUrl: fm.thumbnail || null,
            audioUrl: fm.audio || null,
            wordCount: fm.words || null,
            duration: duration,
            isPublished: fm.published === true,
            isFeatured: false,
            languageId,
            categoryId,
            authorId
        };

        // Create or update article
        await upsertArticle(articleData);

        log.success(`Processed: ${fm.title} by ${fm.author}`);
        return true;

    } catch (error) {
        log.error(`Error processing ${filename}: ${error}`);
        return false;
    }
}

/**
 * Processes all file changes from commits
 * UPDATED: Handles async transliteration
 */
export async function processCommitChanges(commits: CommitInfo[]): Promise<void> {
    const processedSlugs = new Set<string>();
    let totalProcessed = 0;
    let totalErrors = 0;
    let totalWarnings = 0;

    log.info(`Processing ${commits.length} commits`);

    for (const commit of commits) {
        log.info(`Processing commit by ${commit.username}: ${commit.message.substring(0, 50)}...`);

        for (const fileChange of commit.files) {
            try {
                if (fileChange.status === 'removed') {
                    await handleFileRemoval(fileChange.filename, commit.username);
                } else {
                    const success = await processMarkdownFile(fileChange.filename);
                    if (success) {
                        const fileContent = getMarkdownFileContent(fileChange.filename);
                        if (fileContent) {
                            const { data } = matter(fileContent);
                            if (data.title && data.author) {
                                const slug = await generateSlug(data.title, data.author, data.lang || 'hi');
                                processedSlugs.add(slug);
                            }
                        }
                        totalProcessed++;
                    } else {
                        totalWarnings++;
                    }
                }
            } catch (error) {
                log.alert(`Failed to process file ${fileChange.filename}: ${error}`);
                totalErrors++;
            }
        }
    }

    // Final summary
    log.info('Processing summary:');
    log.success(`Articles processed: ${totalProcessed}`);
    if (totalWarnings > 0) {
        log.warn(`Warnings: ${totalWarnings} (missing/invalid fields)`);
    }
    if (totalErrors > 0) {
        log.alert(`Errors: ${totalErrors} (processing failures)`);
    }
}

/**
 * Handles file removal by soft deleting the corresponding article
 */
async function handleFileRemoval(filename: string, deletedByUsername: string): Promise<void> {
    try {
        log.info(`File removed: ${filename} by ${deletedByUsername}`);
        // Future enhancement: implement proper article identification and soft delete
    } catch (error) {
        log.error(`Error handling file removal ${filename}: ${error}`);
    }
}

/**
 * Batch processes multiple markdown files
 * UPDATED: Handles async transliteration
 */
export async function batchProcessMarkdownFiles(filePaths: string[]): Promise<{
    processed: number;
    errors: number;
    warnings: number;
}> {
    let processed = 0;
    let errors = 0;
    let warnings = 0;

    log.info(`Batch processing ${filePaths.length} files`);

    for (const filePath of filePaths) {
        try {
            const success = await processMarkdownFile(filePath);
            if (success) {
                processed++;
            } else {
                warnings++;
            }
        } catch (error) {
            log.alert(`Batch processing failed for ${filePath}: ${error}`);
            errors++;
        }
    }

    return { processed, errors, warnings };
}

/**
 * Validates all markdown files in a directory
 */
export async function validateMarkdownFiles(filePaths: string[]): Promise<{
    validFiles: string[];
    invalidFiles: Array<{ file: string; issues: string[] }>;
}> {
    const validFiles: string[] = [];
    const invalidFiles: Array<{ file: string; issues: string[] }> = [];

    for (const filePath of filePaths) {
        try {
            const fileContent = getMarkdownFileContent(filePath);
            if (!fileContent) {
                invalidFiles.push({
                    file: filePath,
                    issues: ['Could not read file']
                });
                continue;
            }

            const { data: frontmatter } = matter(fileContent);
            const fm = frontmatter as Frontmatter;

            const missingFields = validateFrontmatter(fm);
            const issues: string[] = [];

            if (missingFields.length > 0) {
                issues.push(`Missing fields: ${missingFields.join(', ')}`);
            }

            if (fm.duration && parseDuration(fm.duration) === null) {
                issues.push(`Invalid duration format: ${fm.duration}`);
            }

            if (issues.length > 0) {
                invalidFiles.push({ file: filePath, issues });
            } else {
                validFiles.push(filePath);
            }

        } catch (error) {
            invalidFiles.push({
                file: filePath,
                issues: [`Parse error: ${error}`]
            });
        }
    }

    return { validFiles, invalidFiles };
}
