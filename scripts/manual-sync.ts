// scripts/manual-sync.ts
import { readFileSync, readdirSync, statSync } from 'fs';
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
import { transliterate, generateSlug, normalizeText, getLanguageName } from '../src/utils/transliteration';

type Frontmatter = {
    author: string;
    title: string;
    category: string;
    lang: string;
    date?: string;
    thumbnail?: string;
    audio?: string;
    words?: number;
    duration?: number;
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

    if (firstParagraph.length <= 150) {
        return firstParagraph;
    }

    return firstParagraph.substring(0, 147) + '...';
}

function parseMarkdownFile(filePath: string): ProcessedMetadata | null {
    try {
        const fileContent = readFileSync(filePath, 'utf8');
        const { data: frontmatter, content: markdownContent } = matter(fileContent);
        const fm = frontmatter as Frontmatter;

        // Validate required fields
        if (!fm.author || !fm.title || !fm.lang || !fm.category) {
            console.error(`❌ Missing required frontmatter in ${filePath}`);
            return null;
        }

        // Process metadata
        const normalizedLang = normalizeText(fm.lang);
        const languageName = getLanguageName(normalizedLang);
        const transliteratedAuthor = transliterate(fm.author);
        const transliteratedTitle = transliterate(fm.title);
        const slug = generateSlug(fm.title, fm.author);

        return {
            frontmatter: fm,
            markdownContent,
            filePath,
            transliteratedAuthor,
            transliteratedTitle,
            slug,
            normalizedLang,
            languageName
        };

    } catch (error) {
        console.error(`❌ Error parsing ${filePath}:`, error);
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
        console.error(`❌ Error reading directory ${dir}:`, error);
    }

    return files;
}

async function populateReferenceTablesFirst(processedFiles: ProcessedMetadata[]): Promise<{
    languageMap: Map<string, string>;
    authorMap: Map<string, string>;
    categoryMap: Map<string, string>;
}> {
    console.log('\n🏗️ PHASE 1: Populating Reference Tables...\n');

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

    console.log(`📊 Found ${uniqueLanguages.size} unique languages, ${uniqueAuthors.size} unique authors, ${uniqueCategories.size} unique categories`);

    // 1. POPULATE LANGUAGES FIRST (no dependencies)
    console.log('\n1️⃣ Processing Languages...');
    for (const langCode of uniqueLanguages) {
        const languageName = getLanguageName(langCode);
        const languageData: LanguageData = {
            name: languageName,
            code: langCode,
        };

        const languageId = await findOrCreateLanguage(languageData);
        languageMap.set(langCode, languageId);
        console.log(`   🌐 ${languageName} (${langCode}) → ${languageId.substring(0, 8)}...`);
    }

    // 2. POPULATE AUTHORS (no dependencies)
    console.log('\n2️⃣ Processing Authors...');
    for (const file of processedFiles) {
        const authorKey = file.frontmatter.author;

        if (!authorMap.has(authorKey)) {
            const authorData: AuthorData = {
                name: file.transliteratedAuthor,
                localName: file.frontmatter.author
            };

            const authorId = await findOrCreateAuthor(authorData);
            authorMap.set(authorKey, authorId);
            console.log(`   👤 ${file.frontmatter.author} → ${file.transliteratedAuthor} → ${authorId.substring(0, 8)}...`);
        }
    }

    // 3. POPULATE CATEGORIES (no dependencies)
    console.log('\n3️⃣ Processing Categories...');
    for (const category of uniqueCategories) {
        const categoryData: CategoryData = {
            name: category
        };

        const categoryId = await findOrCreateCategory(categoryData);
        categoryMap.set(category, categoryId);
        console.log(`   📂 ${category} → ${categoryId.substring(0, 8)}...`);
    }

    console.log('\n✅ All reference tables populated!\n');

    return { languageMap, authorMap, categoryMap };
}

async function processArticles(
    processedFiles: ProcessedMetadata[],
    languageMap: Map<string, string>,
    authorMap: Map<string, string>,
    categoryMap: Map<string, string>
): Promise<{ processed: number; errors: number }> {
    console.log('🏗️ PHASE 2: Processing Articles...\n');

    let processed = 0;
    let errors = 0;

    for (const file of processedFiles) {
        try {
            // Get IDs from maps (no database calls needed)
            const languageId = languageMap.get(file.normalizedLang);
            const authorId = authorMap.get(file.frontmatter.author);
            const categoryId = categoryMap.get(normalizeText(file.frontmatter.category));

            if (!languageId || !authorId || !categoryId) {
                console.error(`❌ Missing reference IDs for ${file.filePath}`);
                errors++;
                continue;
            }

            // Create article data using pre-populated IDs
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
                duration: file.frontmatter.duration || null,
                isPublished: file.frontmatter.published === true,
                isFeatured: false,
                languageId,
                categoryId,
                authorId
            };

            await upsertArticle(articleData);

            console.log(`✅ ${file.frontmatter.title} by ${file.frontmatter.author} → ${file.slug}`);
            processed++;

        } catch (error) {
            console.error(`❌ Error processing article ${file.filePath}:`, error);
            errors++;
        }
    }

    return { processed, errors };
}

async function main() {
    try {
        console.log('🚀 Starting Manual Content Sync...');
        console.log('='.repeat(50));

        // Connect to database
        await createDbConnection();
        console.log('💾 Database connected');

        // Find and parse all markdown files
        const contentDir = join(process.cwd(), 'contents');
        const markdownFiles = findMarkdownFiles(contentDir);

        console.log(`📚 Found ${markdownFiles.length} markdown files`);

        // Parse all files first
        console.log('\n📖 Parsing markdown files...');
        const processedFiles: ProcessedMetadata[] = [];

        for (const file of markdownFiles) {
            const processed = parseMarkdownFile(file);
            if (processed) {
                processedFiles.push(processed);
            }
        }

        console.log(`📝 Successfully parsed ${processedFiles.length} files`);

        if (processedFiles.length === 0) {
            console.log('❌ No valid files to process');
            process.exit(1);
        }

        // PHASE 1: Populate all reference tables first
        const { languageMap, authorMap, categoryMap } = await populateReferenceTablesFirst(processedFiles);

        // PHASE 2: Process articles using pre-populated reference IDs
        const { processed, errors } = await processArticles(processedFiles, languageMap, authorMap, categoryMap);

        // Final summary
        console.log('\n' + '='.repeat(50));
        console.log('📊 FINAL SUMMARY:');
        console.log(`📚 Total files found: ${markdownFiles.length}`);
        console.log(`📝 Valid files parsed: ${processedFiles.length}`);
        console.log(`🌐 Languages processed: ${languageMap.size}`);
        console.log(`👤 Authors processed: ${authorMap.size}`);
        console.log(`📂 Categories processed: ${categoryMap.size}`);
        console.log(`✅ Articles processed: ${processed}`);
        console.log(`❌ Errors: ${errors}`);
        console.log('='.repeat(50));

        if (errors > 0) {
            console.log('⚠️  Some files had errors. Check logs above for details.');
            process.exit(1);
        } else {
            console.log('🎉 All files processed successfully!');
            process.exit(0);
        }

    } catch (error) {
        console.error('❌ Manual sync failed:', error);
        process.exit(1);
    }
}

main();
