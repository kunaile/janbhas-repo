// scripts/github-sync.ts

import { readFileSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import { createDbConnection } from '../src/db';
import {
    findOrCreateAuthor,
    findOrCreateCategory,
    findOrCreateLanguage,
    findOrCreateEditor, // Add this
    upsertArticle,
    type AuthorData,
    type CategoryData,
    type LanguageData,
    type ArticleData,
    type EditorData // Add this
} from '../src/services/database';

import { batchTransliterateTexts, normalizeText, getLanguageName } from '../src/utils/transliteration';

const log = {
    info: (msg: string) => console.log(`[INFO] ${msg}`),
    warn: (msg: string) => console.log(`[WARN] ${msg}`),
    error: (msg: string) => console.log(`[ERROR] ${msg}`),
    success: (msg: string) => console.log(`[OK] ${msg}`),
    alert: (msg: string) => console.log(`[ALERT] ${msg}`)
};

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

type FileChange = {
    filename: string;
    status: 'added' | 'modified' | 'removed';
};

type ProcessedMetadata = {
    frontmatter: Frontmatter;
    markdownContent: string;
    filePath: string;
    transliteratedAuthor: string;
    transliteratedTitle: string;
    slug: string;
    normalizedLang: string;
    languageName: string;
};

/**
 * Get editor information from Git commit
 */
function getEditorFromCommit(): EditorData {
    // These should be set by GitHub Actions
    const commitAuthor = process.env.COMMIT_AUTHOR_NAME;
    const commitUsername = process.env.COMMIT_AUTHOR_USERNAME;

    if (!commitAuthor) {
        throw new Error('COMMIT_AUTHOR_NAME not found in environment');
    }

    return {
        name: commitAuthor,
        githubUserName: commitUsername || null
    };
}




/**
 * Get changed files from GitHub Actions environment variables
 */
function getChangedFiles(): FileChange[] {
    const changedFiles = process.env.CHANGED_FILES;
    const removedFiles = process.env.REMOVED_FILES;

    if (!changedFiles && !removedFiles) {
        throw new Error('No changed files information found in environment variables');
    }

    const changes: FileChange[] = [];

    if (changedFiles) {
        const files = changedFiles.split('\n').filter(f => f.trim());
        for (const file of files) {
            if (file.endsWith('.md') || file.endsWith('.mdx')) {
                changes.push({
                    filename: file.trim(),
                    status: 'modified' // GitHub Actions doesn't distinguish between added/modified in CHANGED_FILES
                });
            }
        }
    }

    if (removedFiles) {
        const files = removedFiles.split('\n').filter(f => f.trim());
        for (const file of files) {
            if (file.endsWith('.md') || file.endsWith('.mdx')) {
                changes.push({
                    filename: file.trim(),
                    status: 'removed'
                });
            }
        }
    }

    return changes;
}

function extractShortDescription(markdownContent: string): string {
    const lines = markdownContent
        .replace(/^#+\s+/gm, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    const firstParagraph = lines[0] || '';
    return firstParagraph.length <= 150 ? firstParagraph : firstParagraph.substring(0, 147) + '...';
}

function parseDuration(duration: string | number | undefined): number | null {
    if (!duration) return null;
    if (typeof duration === 'number') return duration;

    const durationStr = duration.toString();
    if (durationStr.includes(':')) {
        const parts = durationStr.split(':');
        if (parts.length === 2) {
            const minutes = parseInt(parts[0], 10);
            const seconds = parseInt(parts[1], 10);
            if (!isNaN(minutes) && !isNaN(seconds)) {
                return minutes * 60 + seconds;
            }
        }
        // Handle HH:MM:SS format
        if (parts.length === 3) {
            const hours = parseInt(parts[0], 10);
            const minutes = parseInt(parts[1], 10);
            const seconds = parseInt(parts[2], 10);
            if (!isNaN(hours) && !isNaN(minutes) && !isNaN(seconds)) {
                return hours * 3600 + minutes * 60 + seconds;
            }
        }
    }

    const parsed = parseInt(durationStr.replace(/[^\d]/g, ''), 10);
    return isNaN(parsed) ? null : parsed;
}

function parseMarkdownFile(filePath: string): Omit<ProcessedMetadata, 'transliteratedAuthor' | 'transliteratedTitle' | 'slug'> | null {
    try {
        const fileContent = readFileSync(filePath, 'utf8');
        const { data: frontmatter, content: markdownContent } = matter(fileContent);
        const fm = frontmatter as Frontmatter;

        const missingFields: string[] = [];
        if (!fm.author) missingFields.push('author');
        if (!fm.title) missingFields.push('title');
        if (!fm.lang) missingFields.push('lang');
        if (!fm.category) missingFields.push('category');

        if (missingFields.length > 0) {
            throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
        }

        const normalizedLang = normalizeText(fm.lang);
        const languageName = getLanguageName(normalizedLang);

        return {
            frontmatter: fm,
            markdownContent,
            filePath,
            normalizedLang,
            languageName
        };
    } catch (error) {
        log.error(`Failed to parse ${filePath}: ${error}`);
        return null;
    }
}

async function handleFileRemoval(filename: string): Promise<void> {
    try {
        log.info(`Processing file removal: ${filename}`);
        // TODO: Implement soft delete logic here
        // You would need to identify the article by slug and call softDeleteArticle
        log.warn(`File removed: ${filename} - soft delete logic needs implementation`);
    } catch (error) {
        log.error(`Error handling file removal ${filename}: ${error}`);
    }
}

async function batchProcessTransliterations(
    parsedFiles: Array<Omit<ProcessedMetadata, 'transliteratedAuthor' | 'transliteratedTitle' | 'slug'>>
): Promise<ProcessedMetadata[]> {
    log.info('Starting batch transliteration with Gemini API');

    const items: Array<{ text: string; type: 'title' | 'author'; language: string }> = [];

    for (const file of parsedFiles) {
        items.push(
            { text: file.frontmatter.title, type: 'title', language: file.normalizedLang },
            { text: file.frontmatter.author, type: 'author', language: file.normalizedLang }
        );
    }

    const results = await batchTransliterateTexts(items);
    const processedFiles: ProcessedMetadata[] = [];

    for (const file of parsedFiles) {
        const transliteratedTitle = results.get(file.frontmatter.title);
        const transliteratedAuthor = results.get(file.frontmatter.author);

        if (!transliteratedTitle || !transliteratedAuthor) {
            throw new Error(`Transliteration incomplete for ${file.filePath}`);
        }

        const titleSlug = transliteratedTitle.replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const authorSlug = transliteratedAuthor.replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const slug = `${titleSlug || 'untitled'}_by_${authorSlug || 'unknown'}`;

        processedFiles.push({
            ...file,
            transliteratedAuthor,
            transliteratedTitle,
            slug
        });
    }

    log.success(`Batch transliteration completed for ${processedFiles.length} files`);
    return processedFiles;
}

async function populateReferenceTablesFirst(processedFiles: ProcessedMetadata[]): Promise<{
    languageMap: Map<string, string>;
    authorMap: Map<string, string>;
    categoryMap: Map<string, string>;
    editorId: string; // Add this
}> {
    log.info('PHASE 1: Populating reference tables');

    // Get editor from commit info
    const editorInfo = getEditorFromCommit();
    const editorId = await findOrCreateEditor(editorInfo);
    log.success(`Editor processed: ${editorInfo.name}${editorInfo.githubUserName ? ` (${editorInfo.githubUserName})` : ''}`);

    const languageMap = new Map<string, string>();
    const authorMap = new Map<string, string>();
    const categoryMap = new Map<string, string>();

    // Extract unique values
    const uniqueLanguages = new Set<string>();
    const uniqueAuthors = new Set<string>();
    const uniqueCategories = new Set<string>();

    for (const file of processedFiles) {
        uniqueLanguages.add(file.normalizedLang);
        uniqueAuthors.add(file.frontmatter.author);
        uniqueCategories.add(normalizeText(file.frontmatter.category));
    }

    log.info(`Found ${uniqueLanguages.size} languages, ${uniqueAuthors.size} authors, ${uniqueCategories.size} categories`);

    // Process languages
    for (const langCode of uniqueLanguages) {
        const languageName = getLanguageName(langCode);
        const languageData: LanguageData = {
            name: languageName,
            code: langCode
        };
        const languageId = await findOrCreateLanguage(languageData);
        languageMap.set(langCode, languageId);
    }
    log.success('Languages processed');

    // Process authors
    for (const file of processedFiles) {
        const authorKey = file.frontmatter.author;
        if (!authorMap.has(authorKey)) {
            const authorData: AuthorData = {
                name: file.transliteratedAuthor,
                localName: file.frontmatter.author
            };
            const authorId = await findOrCreateAuthor(authorData);
            authorMap.set(authorKey, authorId);
        }
    }
    log.success('Authors processed');

    // Process categories
    for (const category of uniqueCategories) {
        const categoryData: CategoryData = { name: category };
        const categoryId = await findOrCreateCategory(categoryData);
        categoryMap.set(category, categoryId);
    }
    log.success('Categories processed');

    return { languageMap, authorMap, categoryMap, editorId };
}

async function processArticles(
    processedFiles: ProcessedMetadata[],
    languageMap: Map<string, string>,
    authorMap: Map<string, string>,
    categoryMap: Map<string, string>,
    editorId: string
): Promise<{ processed: number; errors: number; warnings: number }> {
    log.info('PHASE 2: Processing articles');

    let processed = 0;
    let errors = 0;
    let warnings = 0;

    for (const file of processedFiles) {
        try {
            // Get IDs from maps
            const languageId = languageMap.get(file.normalizedLang);
            const authorId = authorMap.get(file.frontmatter.author);
            const categoryId = categoryMap.get(normalizeText(file.frontmatter.category));

            if (!languageId || !authorId || !categoryId) {
                log.warn(`Missing reference IDs for ${file.filePath}`);
                warnings++;
                continue;
            }

            // Parse duration properly
            const duration = parseDuration(file.frontmatter.duration);
            if (file.frontmatter.duration && duration === null) {
                log.warn(`Invalid duration format in ${file.filePath}: ${file.frontmatter.duration}`);
                warnings++;
            }

            // Create article data
            const articleData: ArticleData = {
                slug: file.slug,
                title: file.transliteratedTitle,
                localTitle: file.frontmatter.title,
                shortDescription: extractShortDescription(file.markdownContent),
                markdownContent: file.markdownContent,
                publishedDate: file.frontmatter.date ? new Date(file.frontmatter.date).toISOString().split('T')[0] : null,
                thumbnailUrl: file.frontmatter.thumbnail || null,
                audioUrl: file.frontmatter.audio || null,
                wordCount: file.frontmatter.words || null,
                duration: duration,
                isPublished: file.frontmatter.published === true,
                isFeatured: false,
                languageId,
                categoryId,
                authorId,
                editorId
            };

            await upsertArticle(articleData);
            processed++;

        } catch (error) {
            log.alert(`Failed to process article ${file.filePath}: ${error}`);
            errors++;
        }
    }

    return { processed, errors, warnings };
}

async function processChangedFiles(changes: FileChange[]): Promise<void> {
    log.info(`Processing ${changes.length} changed files from commit`);

    const filesToProcess = changes.filter(c => c.status !== 'removed');
    const filesToRemove = changes.filter(c => c.status === 'removed');

    // Handle removals
    for (const removal of filesToRemove) {
        await handleFileRemoval(removal.filename);
    }

    if (filesToProcess.length === 0) {
        log.info('No files to process after filtering');
        return;
    }

    // Parse changed files
    const parsedFiles: Array<Omit<ProcessedMetadata, 'transliteratedAuthor' | 'transliteratedTitle' | 'slug'>> = [];

    for (const change of filesToProcess) {
        const fullPath = join(process.cwd(), change.filename);
        const parsed = parseMarkdownFile(fullPath);
        if (parsed) {
            parsedFiles.push(parsed);
        }
    }

    if (parsedFiles.length === 0) {
        log.warn('No valid markdown files to process');
        return;
    }

    log.info(`Successfully parsed ${parsedFiles.length} changed files`);

    // Process with Gemini API
    const processedFiles = await batchProcessTransliterations(parsedFiles);

    // main database function call
    const { languageMap, authorMap, categoryMap, editorId } = await populateReferenceTablesFirst(processedFiles);
    const { processed, errors, warnings } = await processArticles(processedFiles, languageMap, authorMap, categoryMap, editorId);

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('GITHUB COMMIT SYNC SUMMARY:');
    console.log(`Changed files in commit: ${changes.length}`);
    console.log(`Files processed: ${processed}`);
    console.log(`Files removed: ${filesToRemove.length}`);
    console.log(`Warnings: ${warnings}`);
    console.log(`Errors: ${errors}`);

    if (errors > 0) {
        throw new Error(`${errors} files failed to process`);
    }

    log.success('Changed files processed successfully');
}

async function main() {
    try {
        log.info('Starting GitHub commit-based content sync');

        // Validate environment variables
        if (!process.env.GOOGLE_GEMINI_API_KEY) {
            throw new Error('GOOGLE_GEMINI_API_KEY not configured');
        }

        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL not configured');
        }

        // Connect to database
        await createDbConnection();
        log.success('Database connected');

        // Get changed files from environment
        const changes = getChangedFiles();
        if (changes.length === 0) {
            log.info('No markdown files changed in this commit');
            process.exit(0);
        }

        log.info(`Found ${changes.length} changed files in commit`);

        // Process the changes
        await processChangedFiles(changes);

        log.success('GitHub sync completed successfully');
        process.exit(0);

    } catch (error) {
        log.alert(`GitHub sync failed: ${error}`);
        process.exit(1);
    }
}

main();
