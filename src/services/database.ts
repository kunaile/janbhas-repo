// src/services/database.ts

/**
 * Database operations service
 * Handles all CRUD operations for content management
 * Provides abstraction layer over Drizzle ORM
 */
import { eq, isNull, and, or, desc } from 'drizzle-orm';
import { getDb } from '../db';
import {
  authors, authorTranslations, categories, categoryTranslations,
  languages, articles, series, editors, subCategories, subCategoryTranslations,
  tags, tagTranslations, articleTags, publicationEvents
} from '../db/schema';

// Using types instead of interfaces
export type AuthorData = {
  name: string;        // English/transliterated name
  localName?: string | null;  // Original language name
  bio?: string | null;
  imageUrl?: string | null;
};

export type LanguageData = {
  name: string;        // English name
  code: string;        // Language code (normalized)
};

export type EditorData = {
  name: string;
  email?: string | null;
  imageUrl?: string | null;
  githubUserName?: string | null;
};

export type CategoryData = {
  name: string; // Transliterated
  localName?: string | null; // Original vernacular
};

export type SubCategoryData = {
  name: string; // Transliterated
  localName?: string | null; // Original vernacular
  categoryId: string;
};

export type TagData = {
  name: string; // Transliterated
  localName?: string | null; // Original vernacular
  slug: string;
};

export type ArticleData = {
  slug: string;
  title: string;
  localTitle?: string | null;
  shortDescription?: string | null;
  markdownContent: string;
  thumbnailUrl?: string | null;
  audioUrl?: string | null;
  wordCount?: number | null;
  isPublished: boolean;
  isFeatured?: boolean;
  languageId: string;
  categoryId?: string | null;
  subCategoryId?: string | null;
  authorId?: string | null;
  editorId: string;
  tags?: string[];
  seriesId?: string | null;
  episodeNumber?: number | null;
  articleType?: 'standard' | 'original' | 'original_pro';
};

// Series data type
export type SeriesData = {
  slug: string;
  title: string;
  localTitle?: string | null;
  shortDescription?: string | null;
  markdownContent: string;
  thumbnailUrl?: string | null;
  isComplete?: boolean;
  isPublished: boolean;
  isFeatured?: boolean;
  languageId: string;
  categoryId?: string | null;
  subCategoryId?: string | null;
  authorId?: string | null;
  editorId: string;
  authorName: string;
  authorLocalName?: string | null;
  categoryName: string;
  categoryLocalName?: string | null;
  subCategoryName?: string | null;
  subCategoryLocalName?: string | null;
};

// Current editor context for audit fields
let currentEditorId: string | null = null;

export function setCurrentEditorId(editorId: string): void {
  currentEditorId = editorId;
}

export function getCurrentEditorId(): string {
  if (!currentEditorId) {
    throw new Error('No editor context set. Call setCurrentEditorId() before database operations.');
  }
  return currentEditorId;
}

/**
 * Finds or creates an editor record by GitHub username or name
 * Returns the editor's UUID for foreign key reference
 */
export async function findOrCreateEditor(editorData: EditorData): Promise<string> {
  const db = getDb();

  // First try to find by GitHub username if provided
  if (editorData.githubUserName) {
    const existingByGithub = await db.select()
      .from(editors)
      .where(and(
        eq(editors.githubUserName, editorData.githubUserName),
        isNull(editors.deletedAt)
      ))
      .limit(1);

    if (existingByGithub.length > 0) {
      return existingByGithub[0].id;
    }
  }

  // Then try to find by email if provided
  if (editorData.email) {
    const existingByEmail = await db.select()
      .from(editors)
      .where(and(
        eq(editors.email, editorData.email),
        isNull(editors.deletedAt)
      ))
      .limit(1);

    if (existingByEmail.length > 0) {
      return existingByEmail[0].id;
    }
  }

  // Then try to find by name
  const existingByName = await db.select()
    .from(editors)
    .where(and(
      eq(editors.name, editorData.name),
      isNull(editors.deletedAt)
    ))
    .limit(1);

  if (existingByName.length > 0) {
    return existingByName[0].id;
  }

  // Create new editor (editors table doesn't use baseTable, so no audit fields needed)
  const [newEditor] = await db.insert(editors).values({
    name: editorData.name,
    email: editorData.email ?? null,
    imageUrl: editorData.imageUrl ?? null,
    githubUserName: editorData.githubUserName ?? null,
  }).returning({ id: editors.id });

  console.log(`🆕 Created new editor: ${editorData.name}${editorData.githubUserName ? ` (${editorData.githubUserName})` : ''}${editorData.email ? ` <${editorData.email}>` : ''}`);
  return newEditor.id;
}

/**
 * Create slug from text
 */
function createSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Process article tags (with proper audit fields and translation support)
 */
export async function processArticleTags(articleId: string, tagNames: string[]): Promise<void> {
  const db = getDb();

  if (!tagNames || tagNames.length === 0) return;

  const editorId = getCurrentEditorId();

  // First, remove existing tags for this article
  await db.delete(articleTags)
    .where(eq(articleTags.articleId, articleId));

  // Create or find tags and create relationships
  for (const tagName of tagNames) {
    const tagData: TagData = {
      name: tagName.trim(),
      slug: createSlug(tagName.trim())
    };

    const tagId = await findOrCreateTag(tagData);

    // Include required audit fields
    await db.insert(articleTags).values({
      articleId,
      tagId,
      createdBy: editorId,
      updatedBy: editorId,
    });
  }
}

/**
 * Find editor by GitHub username
 */
export async function findEditorByGithubUsername(githubUsername: string): Promise<string | null> {
  const db = getDb();

  const existingEditor = await db.select()
    .from(editors)
    .where(and(
      eq(editors.githubUserName, githubUsername),
      isNull(editors.deletedAt)
    ))
    .limit(1);

  return existingEditor.length > 0 ? existingEditor[0].id : null;
}

/**
 * Get all editors with article counts
 */
export async function getEditorsWithCounts(): Promise<Array<{
  editor: typeof editors.$inferSelect;
  articleCount: number;
}>> {
  const db = getDb();

  const editors_list = await db.select()
    .from(editors)
    .where(isNull(editors.deletedAt));

  const results = [];

  for (const editor of editors_list) {
    const count = await db.select()
      .from(articles)
      .where(and(
        eq(articles.editorId, editor.id),
        isNull(articles.deletedAt),
        eq(articles.isPublished, true)
      ));

    results.push({
      editor,
      articleCount: count.length
    });
  }

  return results;
}

/**
 * Finds or creates an author record (Translation table support)
 * Returns the author's UUID for foreign key reference
 */
export async function findOrCreateAuthor(authorData: AuthorData): Promise<string> {
  const db = getDb();
  const editorId = getCurrentEditorId();

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

  // Create new author with required audit fields
  const [newAuthor] = await db.insert(authors).values({
    name: authorData.name,
    bio: authorData.bio ?? null,
    imageUrl: authorData.imageUrl ?? null,
    createdBy: editorId,
    updatedBy: editorId,
  }).returning({ id: authors.id });

  console.log(`   🆕 Created new author: ${authorData.name}`);
  return newAuthor.id;
}

/**
 * Finds or creates a category record (Using translation tables)
 * Categories are stored in lowercase for consistency
 */
export async function findOrCreateCategory(categoryData: CategoryData): Promise<string> {
  const db = getDb();
  const editorId = getCurrentEditorId();

  // Try to find by transliterated name first
  const existingByName = await db.select()
    .from(categories)
    .where(and(
      eq(categories.name, categoryData.name),
      isNull(categories.deletedAt)
    ))
    .limit(1);

  if (existingByName.length > 0) {
    return existingByName[0].id;
  }

  // Create new category with required audit fields
  const [newCategory] = await db.insert(categories).values({
    name: categoryData.name,
    createdBy: editorId,
    updatedBy: editorId,
  }).returning({ id: categories.id });

  return newCategory.id;
}

/**
 * Finds or creates a sub-category record (Using translation tables)
 * Sub-categories are linked to categories
 */
export async function findOrCreateSubCategory(subCategoryData: SubCategoryData): Promise<string> {
  const db = getDb();
  const editorId = getCurrentEditorId();

  // Check by transliterated name and category
  const existingByName = await db.select()
    .from(subCategories)
    .where(and(
      eq(subCategories.name, subCategoryData.name),
      eq(subCategories.categoryId, subCategoryData.categoryId),
      isNull(subCategories.deletedAt)
    ))
    .limit(1);

  if (existingByName.length > 0) {
    return existingByName[0].id;
  }

  // Create new sub-category with required audit fields
  const [newSubCategory] = await db.insert(subCategories).values({
    name: subCategoryData.name,
    categoryId: subCategoryData.categoryId,
    createdBy: editorId,
    updatedBy: editorId,
  }).returning({ id: subCategories.id });

  return newSubCategory.id;
}

/**
 * Finds or creates a tag record (using translation tables)
 * Tags are stored in lowercase for consistency
 */
export async function findOrCreateTag(tagData: TagData): Promise<string> {
  const db = getDb();
  const editorId = getCurrentEditorId();

  // Check by transliterated name
  const existingByName = await db.select()
    .from(tags)
    .where(and(
      eq(tags.name, tagData.name),
      isNull(tags.deletedAt)
    ))
    .limit(1);

  if (existingByName.length > 0) {
    return existingByName[0].id;
  }

  // Create new tag with required audit fields
  const [newTag] = await db.insert(tags).values({
    name: tagData.name,
    slug: tagData.slug,
    createdBy: editorId,
    updatedBy: editorId,
  }).returning({ id: tags.id });

  return newTag.id;
}

/**
 * Finds or creates a language record (with audit fields)
 * Language codes are normalized to lowercase
 */
export async function findOrCreateLanguage(languageData: LanguageData): Promise<string> {
  const db = getDb();
  const editorId = getCurrentEditorId();

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

  // Create new language with required audit fields
  const [newLanguage] = await db.insert(languages).values({
    name: languageData.name,
    code: languageData.code,
    createdBy: editorId,
    updatedBy: editorId,
  }).returning({ id: languages.id });

  console.log(`   🆕 Created new language: ${languageData.name} (${languageData.code})`);
  return newLanguage.id;
}

// Series functions

/**
 * Find series by slug for episode linking
 */
export async function findSeriesBySlug(slug: string): Promise<{ id: string; title: string; totalEpisodes: number } | null> {
  const db = getDb();

  const result = await db.select({
    id: series.id,
    title: series.title,
    totalEpisodes: series.totalEpisodes
  })
    .from(series)
    .where(and(
      eq(series.slug, slug),
      isNull(series.deletedAt)
    ))
    .limit(1);

  return result[0] || null;
}

/**
 * Get next episode number for a series
 */
export async function getNextEpisodeNumber(seriesId: string): Promise<number> {
  const db = getDb();

  const result = await db.select({
    maxEpisode: articles.episodeNumber
  })
    .from(articles)
    .where(and(
      eq(articles.seriesId, seriesId),
      isNull(articles.deletedAt)
    ))
    .orderBy(desc(articles.episodeNumber))
    .limit(1);

  return (result[0]?.maxEpisode || 0) + 1;
}

/**
 * Upsert series
 */
export async function upsertSeries(seriesData: SeriesData): Promise<string> {
  const db = getDb();
  const editorId = getCurrentEditorId();

  // Check if series exists
  const existing = await db.select()
    .from(series)
    .where(and(
      eq(series.slug, seriesData.slug),
      isNull(series.deletedAt)
    ))
    .limit(1);

  const seriesValues = {
    slug: seriesData.slug,
    title: seriesData.title,
    localTitle: seriesData.localTitle,
    shortDescription: seriesData.shortDescription,
    markdownContent: seriesData.markdownContent,
    thumbnailUrl: seriesData.thumbnailUrl,
    isComplete: seriesData.isComplete || false,
    isPublished: seriesData.isPublished,
    isFeatured: seriesData.isFeatured || false,
    languageId: seriesData.languageId,
    categoryId: seriesData.categoryId,
    subCategoryId: seriesData.subCategoryId,
    authorId: seriesData.authorId,
    editorId: seriesData.editorId,
    authorName: seriesData.authorName,
    authorLocalName: seriesData.authorLocalName,
    categoryName: seriesData.categoryName,
    categoryLocalName: seriesData.categoryLocalName,
    subCategoryName: seriesData.subCategoryName,
    subCategoryLocalName: seriesData.subCategoryLocalName,
    createdBy: editorId,
    updatedBy: editorId,
  };

  if (existing.length > 0) {
    // Update existing series
    await db.update(series)
      .set({ ...seriesValues, updatedAt: new Date() })
      .where(eq(series.id, existing[0].id));
    return existing[0].id;
  } else {
    // Insert new series
    const [newSeries] = await db.insert(series)
      .values(seriesValues)
      .returning({ id: series.id });
    return newSeries.id;
  }
}


/**
 * Portable helper: compute denormalized names for an article from base and translation tables.
 * Queries only the references provided (author/category/subCategory), with safe fallbacks.
 */
type DBConn = ReturnType<typeof getDb>;
type DenormResult = {
  authorName: string;
  authorLocalName: string | null;
  categoryName: string;
  categoryLocalName: string | null;
  subCategoryName: string | null;
  subCategoryLocalName: string | null;
};

export async function computeArticleDenormalizedFields(
  db: DBConn,
  args: { languageId: string; authorId?: string | null; categoryId?: string | null; subCategoryId?: string | null; }
): Promise<DenormResult> {
  const unknownAuthor = 'Unknown';
  const uncategorized = 'Uncategorized';

  // Defaults
  let authorName = unknownAuthor;
  let authorLocalName: string | null = null;
  let categoryName = uncategorized;
  let categoryLocalName: string | null = null;
  let subCategoryName: string | null = null;
  let subCategoryLocalName: string | null = null;

  // Author base + translation
  if (args.authorId) {
    const [aBase] = await db.select({ name: authors.name })
      .from(authors)
      .where(and(eq(authors.id, args.authorId), isNull(authors.deletedAt)))
      .limit(1);

    if (aBase?.name) authorName = aBase.name;

    const aTr = await db.select()
      .from(authorTranslations)
      .where(and(
        eq(authorTranslations.authorId, args.authorId),
        eq(authorTranslations.languageId, args.languageId),
        isNull(authorTranslations.deletedAt)
      ))
      .limit(1);

    const aLocal = aTr[0] ? ((aTr[0] as any).localName ?? (aTr[0] as any).local_name ?? null) : null;
    authorLocalName = aLocal ?? authorName;
  }

  // Category base + translation
  if (args.categoryId) {
    const [cBase] = await db.select({ name: categories.name })
      .from(categories)
      .where(and(eq(categories.id, args.categoryId), isNull(categories.deletedAt)))
      .limit(1);

    if (cBase?.name) categoryName = cBase.name;

    const cTr = await db.select()
      .from(categoryTranslations)
      .where(and(
        eq(categoryTranslations.categoryId, args.categoryId),
        eq(categoryTranslations.languageId, args.languageId),
        isNull(categoryTranslations.deletedAt)
      ))
      .limit(1);

    const cLocal = cTr[0] ? ((cTr[0] as any).localName ?? (cTr[0] as any).local_name ?? null) : null;
    categoryLocalName = cLocal ?? categoryName;
  }

  // Sub-category base + translation (optional)
  if (args.subCategoryId) {
    const [scBase] = await db.select({ name: subCategories.name })
      .from(subCategories)
      .where(and(eq(subCategories.id, args.subCategoryId), isNull(subCategories.deletedAt)))
      .limit(1);

    if (scBase?.name) subCategoryName = scBase.name ?? null;

    const scTr = await db.select()
      .from(subCategoryTranslations)
      .where(and(
        eq(subCategoryTranslations.subCategoryId, args.subCategoryId),
        eq(subCategoryTranslations.languageId, args.languageId),
        isNull(subCategoryTranslations.deletedAt)
      ))
      .limit(1);

    const scLocal = scTr[0] ? ((scTr[0] as any).localName ?? (scTr[0] as any).local_name ?? null) : null;
    subCategoryLocalName = scLocal ?? subCategoryName;
  }

  return {
    authorName,
    authorLocalName,
    categoryName,
    categoryLocalName,
    subCategoryName,
    subCategoryLocalName,
  };
}


/**
 * Updated upsert article - CLEANED (removed publishedDate and duration)
 * Populates denormalized names via computeArticleDenormalizedFields (portable, reusable).
 */
export async function upsertArticle(articleData: ArticleData): Promise<void> {
  const db = getDb();
  const editorId = getCurrentEditorId();

  // Check if article exists
  const existing = await db.select()
    .from(articles)
    .where(and(
      eq(articles.slug, articleData.slug),
      isNull(articles.deletedAt)
    ))
    .limit(1);

  // Compute denormalized names once (queries only what IDs exist)
  const denorm = await computeArticleDenormalizedFields(db, {
    languageId: articleData.languageId,
    authorId: articleData.authorId ?? null,
    categoryId: articleData.categoryId ?? null,
    subCategoryId: articleData.subCategoryId ?? null,
  });

  const articleValues = {
    slug: articleData.slug,
    title: articleData.title,
    localTitle: articleData.localTitle ?? null,
    shortDescription: articleData.shortDescription ?? null,
    markdownContent: articleData.markdownContent,
    thumbnailUrl: articleData.thumbnailUrl ?? null,
    audioUrl: articleData.audioUrl ?? null,
    wordCount: articleData.wordCount ?? null,
    isPublished: articleData.isPublished,
    isFeatured: articleData.isFeatured || false,
    languageId: articleData.languageId,
    categoryId: articleData.categoryId ?? null,
    subCategoryId: articleData.subCategoryId ?? null,
    authorId: articleData.authorId ?? null,
    editorId: articleData.editorId,
    seriesId: articleData.seriesId ?? null,
    episodeNumber: articleData.episodeNumber ?? null,
    articleType: articleData.articleType || 'standard',

    // Denormalized names (canonical + local)
    authorName: denorm.authorName,
    categoryName: denorm.categoryName,
    subCategoryName: denorm.subCategoryName ?? null,
    authorLocalName: denorm.authorLocalName,
    categoryLocalName: denorm.categoryLocalName,
    subCategoryLocalName: denorm.subCategoryLocalName,

    createdBy: editorId,
    updatedBy: editorId,
  };

  let articleId: string;

  if (existing.length > 0) {
    // Update existing article
    await db.update(articles)
      .set({ ...articleValues, updatedAt: new Date() })
      .where(eq(articles.id, existing[0].id));
    articleId = existing[0].id;
  } else {
    // Insert new article
    const [newArticle] = await db.insert(articles)
      .values(articleValues)
      .returning({ id: articles.id });
    articleId = newArticle.id;
  }

  // Process tags if provided
  if (articleData.tags && articleData.tags.length > 0) {
    await processArticleTags(articleId, articleData.tags);
  }
}

/**
 * Create publication event
 */
export async function createPublicationEvent(eventData: {
  articleId?: string;
  seriesId?: string;
  eventType: 'published' | 'unpublished' | 'featured' | 'unfeatured';
  performedBy: string;
  reason?: string;
  metadata?: any;
}): Promise<void> {
  const db = getDb();

  await db.insert(publicationEvents).values({
    articleId: eventData.articleId || null,
    seriesId: eventData.seriesId || null,
    eventType: eventData.eventType,
    performedBy: eventData.performedBy,
    reason: eventData.reason || null,
    metadata: eventData.metadata || null,
  });
}

/**
 * Soft deletes an article by slug
 */
export async function softDeleteArticle(slug: string, deletedByUsername: string): Promise<void> {
  const db = getDb();

  await db.update(articles)
    .set({
      deletedAt: new Date(),
      deletedBy: deletedByUsername,
    })
    .where(and(
      eq(articles.slug, slug),
      isNull(articles.deletedAt)
    ));

  console.log(`🗑️ Soft deleted article with slug: ${slug} by ${deletedByUsername}`);
}

/**
 * Gets all active articles (not soft-deleted)
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
  const limit = options.limit || 50;
  const offset = options.offset || 0;

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
 */
export async function getContentStats(): Promise<{
  totalArticles: number;
  publishedArticles: number;
  totalSeries: number;
  totalAuthors: number;
  totalCategories: number;
  totalLanguages: number;
}> {
  const db = getDb();

  const [
    totalArticlesResult,
    publishedArticlesResult,
    totalSeriesResult,
    totalAuthorsResult,
    totalCategoriesResult,
    totalLanguagesResult
  ] = await Promise.all([
    db.select().from(articles).where(isNull(articles.deletedAt)),
    db.select().from(articles).where(and(isNull(articles.deletedAt), eq(articles.isPublished, true))),
    db.select().from(series).where(isNull(series.deletedAt)),
    db.select().from(authors).where(isNull(authors.deletedAt)),
    db.select().from(categories).where(isNull(categories.deletedAt)),
    db.select().from(languages).where(isNull(languages.deletedAt))
  ]);

  return {
    totalArticles: totalArticlesResult.length,
    publishedArticles: publishedArticlesResult.length,
    totalSeries: totalSeriesResult.length,
    totalAuthors: totalAuthorsResult.length,
    totalCategories: totalCategoriesResult.length,
    totalLanguages: totalLanguagesResult.length
  };
}

/**
 * Gets all languages with article counts
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

/**
 * Get series by local title (original title) - EXISTING FUNCTION
 */
export async function findSeriesByLocalTitle(localTitle: string): Promise<{ id: string; slug: string } | null> {
  const db = getDb();

  const result = await db.select({
    id: series.id,
    slug: series.slug
  })
    .from(series)
    .where(and(
      eq(series.localTitle, localTitle),
      isNull(series.deletedAt)
    ))
    .limit(1);

  return result[0] || null;
}

/**
 * Find series by English title (for episode references)
 * Episodes reference series by their English title via series_title field
 */
export async function findSeriesByTitle(title: string): Promise<{ id: string; slug: string; local_title: string | null } | null> {
  const db = getDb();

  const result = await db.select({
    id: series.id,
    slug: series.slug,
    local_title: series.localTitle
  })
    .from(series)
    .where(and(
      eq(series.title, title),
      isNull(series.deletedAt)
    ))
    .limit(1);

  return result[0] || null;
}
