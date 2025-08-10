// scripts/manual-sync.ts
import { readFileSync, readdirSync } from 'fs';
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

// Logging utilities
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

        // Validate required fields - FIXED: Explicitly type as string[]
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

function findMarkdownFiles(dir: string): string[] {
    const files: string[] = [];

    try {
        const items = readdirSync(dir, { withFileTypes: true });

        for (const item of items) {
            const fullPath = join(dir, item.name);

            if (item.isDirectory()) {
                files.push(...findMarkdownFiles(fullPath));
            } else if (item.isFile() && (item.name.endsWith('.md') || item.name.endsWith('.mdx'))) {
                files.push(fullPath);
            }
        }
    } catch (error) {
        log.error(`Error reading directory ${dir}: ${error}`);
    }

    return files;
}

/**
 * Batch process all transliterations using Gemini API
 * FIXED: Explicit typing for arrays to avoid TypeScript 'never' errors
 */
async function batchProcessTransliterations(
    parsedFiles: Array<Omit<ProcessedMetadata, 'transliteratedAuthor' | 'transliteratedTitle' | 'slug'>>
): Promise<ProcessedMetadata[]> {
    log.info('Starting batch transliteration with Gemini API');

    // FIXED: Explicitly type the items array to avoid 'never' type error
    const items: Array<{ text: string; type: 'title' | 'author'; language: string }> = [];

    // Collect all texts for batch processing
    for (const file of parsedFiles) {
        items.push(
            { text: file.frontmatter.title, type: 'title', language: file.normalizedLang },
            { text: file.frontmatter.author, type: 'author', language: file.normalizedLang }
        );
    }

    // Process all transliterations in one batch
    const results = await batchTransliterateTexts(items);

    // Apply results back to files
    const processedFiles: ProcessedMetadata[] = [];

    for (const file of parsedFiles) {
        const transliteratedTitle = results.get(file.frontmatter.title);
        const transliteratedAuthor = results.get(file.frontmatter.author);

        if (!transliteratedTitle || !transliteratedAuthor) {
            throw new Error(`Transliteration incomplete for ${file.filePath}`);
        }

        // Generate slug
        const titleSlug = transliteratedTitle
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9\-]/g, '')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');

        const authorSlug = transliteratedAuthor
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9\-]/g, '')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');

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
}> {
    log.info('PHASE 1: Populating reference tables');

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

    return { languageMap, authorMap, categoryMap };
}

async function processArticles(
    processedFiles: ProcessedMetadata[],
    languageMap: Map<string, string>,
    authorMap: Map<string, string>,
    categoryMap: Map<string, string>
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
                authorId
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

async function main() {
    try {
        log.info('Starting manual content sync with Gemini API transliteration');

        // Validate Gemini API key
        if (!process.env.GOOGLE_GEMINI_API_KEY) {
            throw new Error('GOOGLE_GEMINI_API_KEY not configured in environment');
        }

        await createDbConnection();
        log.success('Database connected');

        const contentDir = join(process.cwd(), 'content');
        const markdownFiles = findMarkdownFiles(contentDir);
        log.info(`Found ${markdownFiles.length} markdown files`);

        // FIXED: Explicitly type the parsedFiles array to avoid 'never' type error
        const parsedFiles: Array<Omit<ProcessedMetadata, 'transliteratedAuthor' | 'transliteratedTitle' | 'slug'>> = [];

        // Parse all files
        for (const file of markdownFiles) {
            const parsed = parseMarkdownFile(file);
            if (parsed) {
                parsedFiles.push(parsed);
            }
        }

        log.info(`Successfully parsed ${parsedFiles.length} files`);

        if (parsedFiles.length === 0) {
            throw new Error('No valid files to process');
        }

        // Batch process transliterations - FAIL IF THIS FAILS
        const processedFiles = await batchProcessTransliterations(parsedFiles);

        // Continue with database operations
        const { languageMap, authorMap, categoryMap } = await populateReferenceTablesFirst(processedFiles);
        const { processed, errors, warnings } = await processArticles(processedFiles, languageMap, authorMap, categoryMap);

        // Final summary
        console.log('\n' + '='.repeat(50));
        console.log('SYNC SUMMARY:');
        console.log(`Total files found: ${markdownFiles.length}`);
        console.log(`Valid files parsed: ${parsedFiles.length}`);
        console.log(`Languages uploaded: ${languageMap.size}`);
        console.log(`Authors uploaded: ${authorMap.size}`);
        console.log(`Categories uploaded: ${categoryMap.size}`);
        console.log(`Articles uploaded: ${processed}`);

        if (warnings > 0) {
            log.warn(`${warnings} warnings (missing/invalid fields)`);
        }

        if (errors > 0) {
            throw new Error(`${errors} articles failed to process`);
        }

        log.success('All files processed successfully');
        process.exit(0);

    } catch (error) {
        log.alert(`Manual sync failed: ${error}`);
        process.exit(1);
    }
}

main();
