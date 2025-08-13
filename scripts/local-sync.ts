// scripts/local-sync.ts

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import matter from 'gray-matter';
import chalk from 'chalk';
import { createDbConnection } from '../src/db';
import {
    findOrCreateAuthor,
    findOrCreateCategory,
    findOrCreateLanguage,
    findOrCreateEditor,
    upsertArticle,
    type AuthorData,
    type CategoryData,
    type LanguageData,
    type ArticleData,
    type EditorData
} from '../src/services/database';
import { batchTransliterateTexts, normalizeText, getLanguageName } from '../src/utils/transliteration';

// Enhanced logging with colors
const log = {
    info: (msg: string) => console.log(chalk.blue(`[INFO] ${msg}`)),
    warn: (msg: string) => console.log(chalk.yellow(`[WARN] ${msg}`)),
    error: (msg: string) => console.log(chalk.red(`[ERROR] ${msg}`)),
    success: (msg: string) => console.log(chalk.green(`[OK] ${msg}`)),
    alert: (msg: string) => console.log(chalk.red.bold(`[ALERT] ${msg}`)),
    section: (msg: string) => console.log(chalk.cyan.bold(`\n📋 ${msg}`)),
    progress: (msg: string) => console.log(chalk.gray(`   ${msg}`))
};

type SyncMode = 'all' | 'changed' | 'recent';

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
    action: string;
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
 * Get editor information from environment variables
 */
function getEditorFromEnvironment(): EditorData {
    const editorName = process.env.EDITOR_NAME;
    const editorGithubUsername = process.env.EDITOR_GITHUB_USERNAME;

    if (!editorName) {
        throw new Error('EDITOR_NAME environment variable is required for local sync');
    }

    return {
        name: editorName,
        githubUserName: editorGithubUsername || null
    };
}


/**
 * Parse command line arguments
 */
function parseArguments(): { mode: SyncMode; verbose: boolean; dryRun: boolean; since?: string } {
    const args = process.argv.slice(2);
    let mode: SyncMode = 'changed';
    let verbose = false;
    let dryRun = false;
    let since: string | undefined;

    for (let i = 0;i < args.length;i++) {
        switch (args[i]) {
            case '--all':
                mode = 'all';
                break;
            case '--changed':
                mode = 'changed';
                break;
            case '--recent':
                mode = 'recent';
                break;
            case '--verbose':
            case '-v':
                verbose = true;
                break;
            case '--dry-run':
                dryRun = true;
                break;
            case '--since':
                since = args[++i];
                break;
            case '--help':
            case '-h':
                printUsage();
                process.exit(0);
        }
    }

    return { mode, verbose, dryRun, since };
}

function printUsage() {
    console.log(chalk.cyan.bold('📚 Local Content Sync - Usage'));
    console.log('');
    console.log('Sync modes:');
    console.log('  --all           Process all markdown files in content/');
    console.log('  --changed       Process only git changed files (default)');
    console.log('  --recent        Process files changed in last commit');
    console.log('');
    console.log('Options:');
    console.log('  --verbose, -v   Enable verbose logging');
    console.log('  --dry-run       Show what would be done without making changes');
    console.log('  --since <ref>   Process changes since specific git reference');
    console.log('  --help, -h      Show this help message');
    console.log('');
    console.log('Examples:');
    console.log('  pnpm sync:local --all --verbose');
    console.log('  pnpm sync:local --changed --dry-run');
    console.log('  pnpm sync:local --since HEAD~5');
    console.log('  tsx scripts/local-sync.ts --recent');
}

/**
 * Detect changed files using git commands
 */
function getChangedFiles(mode: SyncMode, since?: string): FileChange[] {
    const changes: FileChange[] = [];

    try {
        if (mode === 'all') {
            // Get all markdown files
            const allFiles = execSync(
                'find content/ -name "*.md" -o -name "*.mdx" 2>/dev/null || true',
                { encoding: 'utf-8' }
            ).trim().split('\n').filter(f => f);

            return allFiles.map(file => ({
                filename: file,
                status: 'modified' as const,
                action: 'process'
            }));
        }

        let gitCommand = '';
        if (mode === 'recent') {
            gitCommand = 'git diff-tree --no-commit-id --name-status -r HEAD';
        } else if (since) {
            gitCommand = `git diff --name-status ${since} HEAD`;
        } else {
            // Default: detect uncommitted changes + last commit
            gitCommand = 'git diff --name-status HEAD~1 HEAD';
        }

        const output = execSync(gitCommand, { encoding: 'utf-8' }).trim();

        if (!output) {
            log.info('No changes detected via git');
            return [];
        }

        output.split('\n').forEach(line => {
            if (!line.trim()) return;

            const [status, ...fileParts] = line.split('\t');
            const filename = fileParts.join('\t');

            // Only process content files
            if (!filename.match(/^content\/.*\.(md|mdx)$/)) return;

            const fileStatus = mapGitStatus(status);
            if (fileStatus) {
                changes.push({
                    filename,
                    status: fileStatus,
                    action: fileStatus === 'removed' ? 'delete' : 'process'
                });
            }
        });

        return changes;
    } catch (error) {
        log.warn(`Git command failed: ${error}`);
        return [];
    }
}

function mapGitStatus(status: string): 'added' | 'modified' | 'removed' | null {
    switch (status.charAt(0)) {
        case 'A': return 'added';
        case 'M': return 'modified';
        case 'D': return 'removed';
        case 'R': return 'modified'; // Treat renames as modifications
        case 'C': return 'modified'; // Treat copies as modifications
        default: return null;
    }
}

/**
 * Get all content files for full sync
 */
function getAllContentFiles(): string[] {
    try {
        const command = 'find content/ -name "*.md" -o -name "*.mdx" 2>/dev/null';
        const output = execSync(command, { encoding: 'utf-8' }).trim();
        return output ? output.split('\n').filter(f => f.trim()) : [];
    } catch (error) {
        log.error(`Failed to scan content directory: ${error}`);
        return [];
    }
}

/**
 * Enhanced file parsing with better error handling
 */
function parseMarkdownFile(filePath: string): Omit<ProcessedMetadata, 'transliteratedAuthor' | 'transliteratedTitle' | 'slug'> | null {
    try {
        if (!existsSync(filePath)) {
            log.warn(`File not found: ${filePath}`);
            return null;
        }

        const fileContent = readFileSync(filePath, 'utf8');
        const { data: frontmatter, content: markdownContent } = matter(fileContent);
        const fm = frontmatter as Frontmatter;

        // Validate required fields
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

/**
 * Extract description from content
 */
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

/**
 * Parse duration format
 */
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

/**
 * Local sync main processing function
 */
async function performLocalSync(options: { mode: SyncMode; verbose: boolean; dryRun: boolean; since?: string }) {
    const startTime = Date.now();

    log.section('Local Content Sync Started');
    log.info(`Mode: ${options.mode}`);
    log.info(`Dry run: ${options.dryRun ? 'Yes' : 'No'}`);
    log.info(`Verbose: ${options.verbose ? 'Yes' : 'No'}`);

    // Get files to process
    const changes = getChangedFiles(options.mode, options.since);

    if (changes.length === 0) {
        log.info('No files to process');
        return;
    }

    log.success(`Found ${changes.length} files to process`);

    if (options.verbose) {
        changes.forEach(change => {
            const icon = change.status === 'removed' ? '🗑️' : change.status === 'added' ? '➕' : '📝';
            log.progress(`${icon} ${change.filename} (${change.status})`);
        });
    }

    if (options.dryRun) {
        log.section('Dry Run Complete');
        log.info('No changes made to database');
        return;
    }

    // Process files
    const filesToProcess = changes.filter(c => c.action === 'process');
    const filesToRemove = changes.filter(c => c.action === 'delete');

    // Handle removals
    if (filesToRemove.length > 0) {
        log.section('Processing Removals');
        for (const removal of filesToRemove) {
            log.warn(`File removed: ${removal.filename} - soft delete logic needed`);
        }
    }

    if (filesToProcess.length === 0) {
        log.info('No files to process after filtering');
        return;
    }

    // Parse files
    log.section('Parsing Files');
    const parsedFiles: Array<Omit<ProcessedMetadata, 'transliteratedAuthor' | 'transliteratedTitle' | 'slug'>> = [];

    for (const change of filesToProcess) {
        const parsed = parseMarkdownFile(change.filename);
        if (parsed) {
            parsedFiles.push(parsed);
            if (options.verbose) {
                log.progress(`✅ Parsed: ${change.filename}`);
            }
        }
    }

    if (parsedFiles.length === 0) {
        log.warn('No valid markdown files to process');
        return;
    }

    log.success(`Successfully parsed ${parsedFiles.length} files`);

    // Transliteration
    log.section('Transliteration');
    const processedFiles = await batchProcessTransliterations(parsedFiles, options.verbose);

    // Database operations
    log.section('Database Operations');
    const { languageMap, authorMap, categoryMap, editorId } = await populateReferenceTablesFirst(processedFiles, options.verbose);
    const { processed, errors, warnings } = await processArticles(processedFiles, languageMap, authorMap, categoryMap, editorId, options.verbose);

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    log.section('Sync Summary');
    console.log(chalk.cyan('┌' + '─'.repeat(40) + '┐'));
    console.log(chalk.cyan('│') + ' Local Content Sync Results'.padEnd(39) + chalk.cyan('│'));
    console.log(chalk.cyan('├' + '─'.repeat(40) + '┤'));
    console.log(chalk.cyan('│') + ` Files found: ${changes.length}`.padEnd(39) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + ` Files processed: ${processed}`.padEnd(39) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + ` Files removed: ${filesToRemove.length}`.padEnd(39) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + ` Warnings: ${warnings}`.padEnd(39) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + ` Errors: ${errors}`.padEnd(39) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + ` Duration: ${duration}s`.padEnd(39) + chalk.cyan('│'));
    console.log(chalk.cyan('└' + '─'.repeat(40) + '┘'));

    if (errors > 0) {
        log.alert(`${errors} files failed to process`);
        process.exit(1);
    }

    log.success('Local sync completed successfully! 🎉');
}

// Reuse the same helper functions from github-sync.ts
async function batchProcessTransliterations(
    parsedFiles: Array<Omit<ProcessedMetadata, 'transliteratedAuthor' | 'transliteratedTitle' | 'slug'>>,
    verbose: boolean = false
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

        if (verbose) {
            log.progress(`✅ Transliterated: ${file.frontmatter.title} → ${transliteratedTitle}`);
        }
    }

    log.success(`Batch transliteration completed for ${processedFiles.length} files`);
    return processedFiles;
}

async function populateReferenceTablesFirst(
    processedFiles: ProcessedMetadata[],
    verbose: boolean = false
): Promise<{ languageMap: Map<string, string>; authorMap: Map<string, string>; categoryMap: Map<string, string>; editorId: string }> {
    log.info('Populating reference tables');

    // Get editor from environment
    const editorInfo = getEditorFromEnvironment();
    const editorId = await findOrCreateEditor(editorInfo);
    log.success(`Editor processed: ${editorInfo.name}`);

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

    log.info(`Processing ${uniqueLanguages.size} languages, ${uniqueAuthors.size} authors, ${uniqueCategories.size} categories`);

    // Process languages
    for (const langCode of uniqueLanguages) {
        const languageName = getLanguageName(langCode);
        const languageData: LanguageData = { name: languageName, code: langCode };
        const languageId = await findOrCreateLanguage(languageData);
        languageMap.set(langCode, languageId);
        if (verbose) log.progress(`✅ Language: ${languageName} (${langCode})`);
    }

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
            if (verbose) log.progress(`✅ Author: ${file.frontmatter.author} → ${file.transliteratedAuthor}`);
        }
    }

    // Process categories
    for (const category of uniqueCategories) {
        const categoryData: CategoryData = { name: category };
        const categoryId = await findOrCreateCategory(categoryData);
        categoryMap.set(category, categoryId);
        if (verbose) log.progress(`✅ Category: ${category}`);
    }

    log.success('Reference tables populated');
    return { languageMap, authorMap, categoryMap, editorId };
}

async function processArticles(
    processedFiles: ProcessedMetadata[],
    languageMap: Map<string, string>,
    authorMap: Map<string, string>,
    categoryMap: Map<string, string>,
    editorId: string,
    verbose: boolean = false
): Promise<{ processed: number; errors: number; warnings: number }> {
    log.info('Processing articles');

    let processed = 0;
    let errors = 0;
    let warnings = 0;

    for (const file of processedFiles) {
        try {
            const languageId = languageMap.get(file.normalizedLang);
            const authorId = authorMap.get(file.frontmatter.author);
            const categoryId = categoryMap.get(normalizeText(file.frontmatter.category));

            if (!languageId || !authorId || !categoryId) {
                log.warn(`Missing reference IDs for ${file.filePath}`);
                warnings++;
                continue;
            }

            const duration = parseDuration(file.frontmatter.duration);
            if (file.frontmatter.duration && duration === null) {
                log.warn(`Invalid duration format in ${file.filePath}: ${file.frontmatter.duration}`);
                warnings++;
            }

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

            if (verbose) {
                log.progress(`✅ Article: ${file.frontmatter.title}`);
            }

        } catch (error) {
            log.error(`Failed to process article ${file.filePath}: ${error}`);
            errors++;
        }
    }

    return { processed, errors, warnings };
}

/**
 * Main function
 */
async function main() {
    try {
        const options = parseArguments();

        // Validate environment
        if (!process.env.GOOGLE_GEMINI_API_KEY) {
            throw new Error('GOOGLE_GEMINI_API_KEY not configured');
        }

        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL not configured');
        }

        // Connect to database
        await createDbConnection();
        log.success('Database connected');

        // Perform sync
        await performLocalSync(options);

    } catch (error) {
        log.alert(`Local sync failed: ${error}`);
        process.exit(1);
    }
}

main();
