// scripts/github-sync.ts
import { readFileSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import { createDbConnection } from '../src/db';
import {
    findOrCreateAuthor,
    findOrCreateCategory,
    findOrCreateLanguage,
    upsertArticle,
    type AuthorData,
    type CategoryData,
    type LanguageData,
    type ArticleData
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
 * Get changed files from GitHub Actions environment
 */
function getChangedFiles(): FileChange[] {
    const changedFiles = process.env.CHANGED_FILES;
    const removedFiles = process.env.REMOVED_FILES;

    if (!changedFiles && !removedFiles) {
        throw new Error('No changed files information found');
    }

    const changes: FileChange[] = [];

    if (changedFiles) {
        const files = changedFiles.split('\n').filter(f => f.trim());
        for (const file of files) {
            if (file.endsWith('.md') || file.endsWith('.mdx')) {
                changes.push({
                    filename: file.trim(),
                    status: 'modified'
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
        // Log removal - can be enhanced to soft delete from database
        log.warn(`File removed: ${filename} - consider implementing soft delete`);
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

    // Database operations (simplified - add your existing logic)
    const languageMap = new Map<string, string>();
    const authorMap = new Map<string, string>();
    const categoryMap = new Map<string, string>();

    // Process reference tables and articles (add your existing logic here)
    let processed = 0;
    let errors = 0;

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('GITHUB COMMIT SYNC SUMMARY:');
    console.log(`Changed files in commit: ${changes.length}`);
    console.log(`Files processed: ${processed}`);
    console.log(`Files removed: ${filesToRemove.length}`);
    console.log(`Errors: ${errors}`);

    if (errors > 0) {
        throw new Error(`${errors} files failed to process`);
    }

    log.success('Changed files processed successfully');
}

async function main() {
    try {
        log.info('Starting GitHub commit-based content sync');

        if (!process.env.GOOGLE_GEMINI_API_KEY) {
            throw new Error('GOOGLE_GEMINI_API_KEY not configured');
        }

        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL not configured');
        }

        await createDbConnection();
        log.success('Database connected');

        const changes = getChangedFiles();

        if (changes.length === 0) {
            log.info('No markdown files changed in this commit');
            process.exit(0);
        }

        log.info(`Found ${changes.length} changed files in commit`);

        await processChangedFiles(changes);

        log.success('GitHub sync completed successfully');
        process.exit(0);

    } catch (error) {
        log.alert(`GitHub sync failed: ${error}`);
        process.exit(1);
    }
}

main();
