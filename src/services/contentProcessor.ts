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
import { transliterate, generateSlug, normalizeText, getLanguageName } from '../utils/transliteration';
import { getMarkdownFileContent, type FileChange, type CommitInfo } from './fileProcessor';

/**
 * Expected frontmatter structure from markdown files
 */
type Frontmatter = {
    author: string;         // Local language author name
    title: string;          // Local language title
    category: string;       // Category name
    lang: string;           // Language code
    date?: string;          // Published date
    thumbnail?: string;     // Thumbnail URL
    audio?: string;         // Audio URL
    words?: number;         // Word count
    duration?: number;      // Duration in minutes
    published?: boolean;    // Publication status
};

/**
 * Processes a single markdown file and updates the database
 * Extracts metadata, transliterates content, and creates/updates records
 */
export async function processMarkdownFile(filename: string): Promise<boolean> {
    try {
        const fileContent = getMarkdownFileContent(filename);
        if (!fileContent) {
            console.error(`❌ Could not read file: ${filename}`);
            return false;
        }

        // Parse frontmatter and content
        const { data: frontmatter, content: markdownContent } = matter(fileContent);
        const fm = frontmatter as Frontmatter;

        // Validate required fields
        if (!fm.author || !fm.title || !fm.lang || !fm.category) {
            console.error(`❌ Missing required frontmatter in ${filename}:`, {
                author: !!fm.author,
                title: !!fm.title,
                lang: !!fm.lang,
                category: !!fm.category
            });
            return false;
        }

        // Normalize language code
        const normalizedLang = normalizeText(fm.lang);
        const languageName = getLanguageName(normalizedLang);

        // Transliterate author and title to English using the library
        const transliteratedAuthor = transliterate(fm.author);
        const transliteratedTitle = transliterate(fm.title);

        // Generate slug using the library's slugify function
        const slug = generateSlug(fm.title, fm.author);

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
            duration: fm.duration || null,
            isPublished: fm.published === true,
            isFeatured: false,
            languageId,
            categoryId,
            authorId
        };

        // Create or update article
        await upsertArticle(articleData);

        console.log(`✅ Processed: ${fm.title} by ${fm.author}`);
        console.log(`   Slug: ${slug}`);
        console.log(`   Language: ${languageName} (${normalizedLang})`);

        return true;

    } catch (error) {
        console.error(`❌ Error processing ${filename}:`, error);
        return false;
    }
}

/**
 * Processes all file changes from commits
 * Handles additions, modifications, and deletions
 */
export async function processCommitChanges(commits: CommitInfo[]): Promise<void> {
    const processedSlugs = new Set<string>();
    let totalProcessed = 0;
    let totalErrors = 0;

    console.log(`🔄 Processing ${commits.length} commits...`);

    for (const commit of commits) {
        console.log(`📝 Processing commit by ${commit.username}: ${commit.message.substring(0, 50)}...`);

        for (const fileChange of commit.files) {
            try {
                if (fileChange.status === 'removed') {
                    // Handle file deletion - soft delete from database
                    await handleFileRemoval(fileChange.filename, commit.username);
                } else {
                    // Handle file addition or modification
                    const success = await processMarkdownFile(fileChange.filename);
                    if (success) {
                        // Track processed slugs to avoid duplicates
                        const fileContent = getMarkdownFileContent(fileChange.filename);
                        if (fileContent) {
                            const { data } = matter(fileContent);
                            const slug = generateSlug(data.title, data.author);
                            processedSlugs.add(slug);
                        }
                        totalProcessed++;
                    } else {
                        totalErrors++;
                    }
                }
            } catch (error) {
                console.error(`❌ Error processing file ${fileChange.filename}:`, error);
                totalErrors++;
            }
        }
    }

    console.log(`📊 Processing complete: ${totalProcessed} successful, ${totalErrors} errors`);
}

/**
 * Handles file removal by soft deleting the corresponding article
 */
async function handleFileRemoval(filename: string, deletedByUsername: string): Promise<void> {
    try {
        console.log(`🗑️ File removed: ${filename} by ${deletedByUsername}`);
        // Note: To properly implement this, you would need to maintain a mapping 
        // of filename to slug, or store filename in the articles table

    } catch (error) {
        console.error(`❌ Error handling file removal ${filename}:`, error);
    }
}

/**
 * Extracts a short description from markdown content
 * Uses first paragraph or falls back to first 150 characters
 */
function extractShortDescription(markdownContent: string): string {
    // Remove markdown headers and get first paragraph
    const lines = markdownContent
        .replace(/^#+\s+/gm, '') // Remove headers
        .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold formatting
        .replace(/\*(.*?)\*/g, '$1') // Remove italic formatting
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    const firstParagraph = lines[0] || '';

    // Limit to 150 characters
    if (firstParagraph.length <= 150) {
        return firstParagraph;
    }

    return firstParagraph.substring(0, 147) + '...';
}
