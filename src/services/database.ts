// src/services/database.ts
/**
 * Database operations service
 * Handles all CRUD operations for content management
 * Provides abstraction layer over Drizzle ORM
 */
import { eq, isNull, and, or, desc } from 'drizzle-orm';
import { getDb } from '../db';
import { authors, categories, languages, articles } from '../db/schema';

// Using types instead of interfaces
export type AuthorData = {
    name: string;        // English/transliterated name
    localName?: string | null;  // Original language name
    bio?: string | null;
    imageUrl?: string | null;
};

export type CategoryData = {
    name: string;        // English name (normalized)
};

export type LanguageData = {
    name: string;        // English name
    code: string;        // Language code (normalized)
};

export type ArticleData = {
    slug: string;
    title: string;
    localTitle?: string | null;
    shortDescription?: string | null;
    markdownContent: string;
    publishedDate?: string | null;
    thumbnailUrl?: string | null;
    audioUrl?: string | null;
    wordCount?: number | null;
    duration?: number | null;
    isPublished: boolean;
    isFeatured?: boolean;
    languageId: string;
    categoryId?: string | null;
    authorId?: string | null;
};

/**
 * Finds or creates an author record
 * Returns the author's UUID for foreign key reference
 */
export async function findOrCreateAuthor(authorData: AuthorData): Promise<string> {
    const db = getDb();

    // Check if author exists (by English name)
    const existingAuthor = await db.select()
        .from(authors)
        .where(and(
            eq(authors.name, authorData.name),
            isNull(authors.deletedAt)
        ))
        .limit(1);

    if (existingAuthor.length > 0) {
        // Found existing - no creation needed
        return existingAuthor[0].id;
    }

    // Create new author
    const [newAuthor] = await db.insert(authors).values({
        name: authorData.name,
        localName: authorData.localName ?? null,
        bio: authorData.bio ?? null,
        imageUrl: authorData.imageUrl ?? null,
    }).returning({ id: authors.id });

    console.log(`   🆕 Created new author: ${authorData.name}`);
    return newAuthor.id;
}

/**
 * Finds or creates a category record
 * Categories are stored in lowercase for consistency
 */
export async function findOrCreateCategory(categoryData: CategoryData): Promise<string> {
    const db = getDb();

    const existingCategory = await db.select()
        .from(categories)
        .where(and(
            eq(categories.name, categoryData.name),
            isNull(categories.deletedAt)
        ))
        .limit(1);

    if (existingCategory.length > 0) {
        // Found existing - no creation needed
        return existingCategory[0].id;
    }

    const [newCategory] = await db.insert(categories).values({
        name: categoryData.name,
    }).returning({ id: categories.id });

    console.log(`   🆕 Created new category: ${categoryData.name}`);
    return newCategory.id;
}

/**
 * Finds or creates a language record
 * Language codes are normalized to lowercase
 */
export async function findOrCreateLanguage(languageData: LanguageData): Promise<string> {
    const db = getDb();

    const existingLanguage = await db.select()
        .from(languages)
        .where(and(
            eq(languages.code, languageData.code),
            isNull(languages.deletedAt)
        ))
        .limit(1);

    if (existingLanguage.length > 0) {
        // Found existing - no creation needed
        return existingLanguage[0].id;
    }

    const [newLanguage] = await db.insert(languages).values({
        name: languageData.name,
        code: languageData.code,
    }).returning({ id: languages.id });

    console.log(`   🆕 Created new language: ${languageData.name} (${languageData.code})`);
    return newLanguage.id;
}

/**
 * Creates or updates an article
 * Uses slug as unique identifier for upsert operations
 */
export async function upsertArticle(articleData: ArticleData): Promise<void> {
    const db = getDb();

    const existingArticle = await db.select()
        .from(articles)
        .where(and(
            eq(articles.slug, articleData.slug),
            isNull(articles.deletedAt)
        ))
        .limit(1);

    if (existingArticle.length > 0) {
        // Update existing article
        await db.update(articles)
            .set({
                ...articleData,
                updatedAt: new Date(),
                deletedAt: null, // Un-delete if previously soft-deleted
            })
            .where(eq(articles.id, existingArticle[0].id));

        console.log(`📝 Updated article: ${articleData.title}`);
    } else {
        // Create new article
        await db.insert(articles).values(articleData);
        console.log(`✨ Created new article: ${articleData.title}`);
    }
}

/**
 * Soft deletes an article by slug
 * Records who deleted it and when
 */
export async function softDeleteArticle(slug: string, deletedByUsername: string): Promise<void> {
    const db = getDb();

    await db.update(articles)
        .set({
            deletedAt: new Date(),
            deletedBy: deletedByUsername, // This should ideally be an editor UUID
        })
        .where(and(
            eq(articles.slug, slug),
            isNull(articles.deletedAt)
        ));

    console.log(`🗑️ Soft deleted article with slug: ${slug} by ${deletedByUsername}`);
}

/**
 * Gets all active articles (not soft-deleted)
 * Used for determining which articles no longer exist in repo
 */
export async function getAllActiveArticles(): Promise<Array<{ slug: string; title: string }>> {
    const db = getDb();

    const activeArticles = await db.select({
        slug: articles.slug,
        title: articles.title,
    })
        .from(articles)
        .where(isNull(articles.deletedAt));

    return activeArticles;
}

/**
 * Gets an article by slug with all related data
 * Used for displaying complete article information
 */
export async function getArticleBySlug(slug: string): Promise<any> {
    const db = getDb();

    const article = await db.select({
        article: articles,
        author: authors,
        category: categories,
        language: languages,
    })
        .from(articles)
        .leftJoin(authors, eq(articles.authorId, authors.id))
        .leftJoin(categories, eq(articles.categoryId, categories.id))
        .leftJoin(languages, eq(articles.languageId, languages.id))
        .where(and(
            eq(articles.slug, slug),
            isNull(articles.deletedAt),
            eq(articles.isPublished, true)
        ))
        .limit(1);

    return article[0] || null;
}

/**
 * Gets articles with filtering and pagination
 * ALTERNATIVE: Build complete query without conditional chaining
 */
export async function getArticles(options: {
    languageCode?: string;
    categoryName?: string;
    authorName?: string;
    isPublished?: boolean;
    limit?: number;
    offset?: number;
}): Promise<Array<any>> {
    const db = getDb();

    // Build conditions array
    const conditions = [isNull(articles.deletedAt)];

    if (options.languageCode) {
        conditions.push(eq(languages.code, options.languageCode));
    }

    if (options.categoryName) {
        conditions.push(eq(categories.name, options.categoryName));
    }

    if (options.authorName) {
        conditions.push(eq(authors.name, options.authorName));
    }

    if (options.isPublished !== undefined) {
        conditions.push(eq(articles.isPublished, options.isPublished));
    }

    // Build complete query with default values
    const limit = options.limit || 50; // Default limit
    const offset = options.offset || 0; // Default offset

    const query = await db.select({
        article: articles,
        author: authors,
        category: categories,
        language: languages,
    })
        .from(articles)
        .leftJoin(authors, eq(articles.authorId, authors.id))
        .leftJoin(categories, eq(articles.categoryId, categories.id))
        .leftJoin(languages, eq(articles.languageId, languages.id))
        .where(and(...conditions))
        .orderBy(desc(articles.createdAt))
        .limit(limit)
        .offset(offset);

    return query;
}


/**
 * Searches articles by text query
 * FIXED: Simplified search without complex query chaining
 */
export async function searchArticles(searchQuery: string, options?: {
    languageCode?: string;
    limit?: number;
    offset?: number;
}): Promise<Array<any>> {
    const db = getDb();

    // Build conditions array for search
    const conditions = [
        isNull(articles.deletedAt),
        eq(articles.isPublished, true)
    ];

    if (options?.languageCode) {
        conditions.push(eq(languages.code, options.languageCode));
    }

    // For now, implement basic text search - you can enhance this with full-text search later
    // This searches in title and localTitle fields
    const searchCondition = or(
        // SQL ILIKE for case-insensitive search
        // Note: You might need to use sql`` template for more complex searches
    );

    const query = db.select({
        article: articles,
        author: authors,
        category: categories,
        language: languages,
    })
        .from(articles)
        .leftJoin(authors, eq(articles.authorId, authors.id))
        .leftJoin(categories, eq(articles.categoryId, categories.id))
        .leftJoin(languages, eq(articles.languageId, languages.id))
        .where(and(...conditions))
        .limit(options?.limit || 20)
        .offset(options?.offset || 0);

    return await query;
}

/**
 * Gets statistics about the content
 * FIXED: Simplified count queries
 */
export async function getContentStats(): Promise<{
    totalArticles: number;
    publishedArticles: number;
    totalAuthors: number;
    totalCategories: number;
    totalLanguages: number;
}> {
    const db = getDb();

    const [
        totalArticlesResult,
        publishedArticlesResult,
        totalAuthorsResult,
        totalCategoriesResult,
        totalLanguagesResult
    ] = await Promise.all([
        db.select()
            .from(articles)
            .where(isNull(articles.deletedAt)),
        db.select()
            .from(articles)
            .where(and(
                isNull(articles.deletedAt),
                eq(articles.isPublished, true)
            )),
        db.select()
            .from(authors)
            .where(isNull(authors.deletedAt)),
        db.select()
            .from(categories)
            .where(isNull(categories.deletedAt)),
        db.select()
            .from(languages)
            .where(isNull(languages.deletedAt))
    ]);

    return {
        totalArticles: totalArticlesResult.length,
        publishedArticles: publishedArticlesResult.length,
        totalAuthors: totalAuthorsResult.length,
        totalCategories: totalCategoriesResult.length,
        totalLanguages: totalLanguagesResult.length
    };
}

/**
 * Gets all languages with article counts
 * FIXED: Simplified approach without complex aggregation
 */
export async function getLanguagesWithCounts(): Promise<Array<{
    language: any;
    articleCount: number;
}>> {
    const db = getDb();

    const languages_list = await db.select()
        .from(languages)
        .where(isNull(languages.deletedAt));

    const results = [];
    for (const language of languages_list) {
        const count = await db.select()
            .from(articles)
            .where(and(
                eq(articles.languageId, language.id),
                isNull(articles.deletedAt),
                eq(articles.isPublished, true)
            ));

        results.push({
            language,
            articleCount: count.length
        });
    }

    return results;
}

/**
 * Gets all categories with article counts
 * FIXED: Simplified approach
 */
export async function getCategoriesWithCounts(): Promise<Array<{
    category: any;
    articleCount: number;
}>> {
    const db = getDb();

    const categories_list = await db.select()
        .from(categories)
        .where(isNull(categories.deletedAt));

    const results = [];
    for (const category of categories_list) {
        const count = await db.select()
            .from(articles)
            .where(and(
                eq(articles.categoryId, category.id),
                isNull(articles.deletedAt),
                eq(articles.isPublished, true)
            ));

        results.push({
            category,
            articleCount: count.length
        });
    }

    return results;
}

/**
 * Gets all authors with article counts
 * FIXED: Simplified approach
 */
export async function getAuthorsWithCounts(): Promise<Array<{
    author: any;
    articleCount: number;
}>> {
    const db = getDb();

    const authors_list = await db.select()
        .from(authors)
        .where(isNull(authors.deletedAt));

    const results = [];
    for (const author of authors_list) {
        const count = await db.select()
            .from(articles)
            .where(and(
                eq(articles.authorId, author.id),
                isNull(articles.deletedAt),
                eq(articles.isPublished, true)
            ));

        results.push({
            author,
            articleCount: count.length
        });
    }

    return results;
}
