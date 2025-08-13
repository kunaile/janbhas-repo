// src/services/contentProcessor.ts

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import {
  findOrCreateAuthor,
  findOrCreateCategory,
  findOrCreateLanguage,
  findOrCreateEditor,
  findOrCreateSubCategory,
  findOrCreateTag,
  upsertArticle,
  type AuthorData,
  type CategoryData,
  type LanguageData,
  type ArticleData,
  type EditorData,
  type SubCategoryData,
  type TagData
} from './database';
import { batchTransliterateTexts, normalizeText, getLanguageName } from '../utils/transliteration';

// Shared Types
export type Frontmatter = {
  author: string;
  title: string;
  category: string;
  'sub-category'?: string;
  lang: string;
  date?: string;
  thumbnail?: string;
  audio?: string;
  words?: number;
  duration?: string | number;
  published?: boolean;
  featured?: boolean;
  tags?: string | string[];
};

export type ProcessedMetadata = {
  frontmatter: Frontmatter;
  markdownContent: string;
  filePath: string;
  transliteratedAuthor: string;
  transliteratedTitle: string;
  transliteratedCategory: string;
  transliteratedSubCategory?: string;
  transliteratedTags: string[];
  slug: string;
  normalizedLang: string;
  languageName: string;
};

export type EditorSource = 'environment' | 'git-commit';

export type SyncOptions = {
  editorSource: EditorSource;
  editorData?: EditorData;
  verbose?: boolean;
  dryRun?: boolean;
};

export type SyncResult = {
  totalFiles: number;
  parsedFiles: number;
  languages: number;
  authors: number;
  categories: number;
  subCategories: number;
  tags: number;
  articlesProcessed: number;
  errors: number;
  warnings: number;
};

// Shared Logging Utilities
export const log = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warn: (msg: string) => console.log(`[WARN] ${msg}`),
  error: (msg: string) => console.log(`[ERROR] ${msg}`),
  success: (msg: string) => console.log(`[OK] ${msg}`),
  alert: (msg: string) => console.log(`[ALERT] ${msg}`)
};

// Shared Utility Functions
export function extractShortDescription(markdownContent: string): string {
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

export function parseDuration(duration: string | number | undefined): number | null {
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

export function processTags(tags: string | string[] | undefined): string[] {
  if (!tags) return [];

  if (typeof tags === 'string') {
    return tags.split(/[,;|]/)
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);
  }

  if (Array.isArray(tags)) {
    return tags.map(tag => tag.toString().trim()).filter(tag => tag.length > 0);
  }

  return [];
}

export function parseMarkdownFile(filePath: string): Omit<ProcessedMetadata, 'transliteratedAuthor' | 'transliteratedTitle' | 'transliteratedCategory' | 'transliteratedSubCategory' | 'transliteratedTags' | 'slug'> | null {
  try {
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

export function findMarkdownFiles(dir: string): string[] {
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
 */
export async function batchProcessTransliterations(
  parsedFiles: Array<Omit<ProcessedMetadata, 'transliteratedAuthor' | 'transliteratedTitle' | 'transliteratedCategory' | 'transliteratedSubCategory' | 'transliteratedTags' | 'slug'>>
): Promise<ProcessedMetadata[]> {
  log.info('Starting batch transliteration with Gemini API');

  const items: Array<{ text: string; type: 'title' | 'author' | 'category' | 'subcategory' | 'tag'; language: string }> = [];

  // Collect all texts for batch processing
  for (const file of parsedFiles) {
    items.push(
      { text: file.frontmatter.title, type: 'title', language: file.normalizedLang },
      { text: file.frontmatter.author, type: 'author', language: file.normalizedLang },
      { text: file.frontmatter.category, type: 'category', language: file.normalizedLang }
    );

    // Add sub-category for transliteration if it exists
    if (file.frontmatter['sub-category']) {
      items.push({
        text: file.frontmatter['sub-category'],
        type: 'subcategory',
        language: file.normalizedLang
      });
    }

    // Add tags for transliteration if they exist
    const tags = processTags(file.frontmatter.tags);
    for (const tag of tags) {
      items.push({
        text: tag,
        type: 'tag',
        language: file.normalizedLang
      });
    }
  }

  // Process all transliterations in one batch
  const results = await batchTransliterateTexts(items);

  // Apply results back to files
  const processedFiles: ProcessedMetadata[] = [];
  for (const file of parsedFiles) {
    const transliteratedTitle = results.get(file.frontmatter.title);
    const transliteratedAuthor = results.get(file.frontmatter.author);
    const transliteratedCategory = results.get(file.frontmatter.category);
    const transliteratedSubCategory = file.frontmatter['sub-category']
      ? results.get(file.frontmatter['sub-category'])
      : undefined;

    // Process transliterated tags
    const originalTags = processTags(file.frontmatter.tags);
    const transliteratedTags: string[] = [];
    for (const tag of originalTags) {
      const transliteratedTag = results.get(tag);
      if (transliteratedTag) {
        transliteratedTags.push(transliteratedTag);
      }
    }

    if (!transliteratedTitle || !transliteratedAuthor || !transliteratedCategory) {
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
      transliteratedCategory,
      transliteratedSubCategory,
      transliteratedTags,
      slug
    });
  }

  log.success(`Batch transliteration completed for ${processedFiles.length} files`);
  return processedFiles;
}

/**
 * Populate reference tables (languages, authors, categories, sub-categories, tags)
 */
export async function populateReferenceTablesFirst(
  processedFiles: ProcessedMetadata[],
  editorId: string
): Promise<{
  languageMap: Map<string, string>;
  authorMap: Map<string, string>;
  categoryMap: Map<string, string>;
  subCategoryMap: Map<string, string>;
  tagMap: Map<string, string>;
}> {
  log.info('PHASE 1: Populating reference tables');

  const languageMap = new Map<string, string>();
  const authorMap = new Map<string, string>();
  const categoryMap = new Map<string, string>();
  const subCategoryMap = new Map<string, string>();
  const tagMap = new Map<string, string>();

  // Extract unique values
  const uniqueLanguages = new Set<string>();
  const uniqueAuthors = new Set<string>();
  const uniqueCategories = new Map<string, { original: string; transliterated: string }>();
  const uniqueSubCategories = new Map<string, { original: string; transliterated: string; categoryOriginal: string }>();
  const uniqueTags = new Map<string, { original: string; transliterated: string }>();

  for (const file of processedFiles) {
    uniqueLanguages.add(file.normalizedLang);
    uniqueAuthors.add(file.frontmatter.author);

    // Categories with both original and transliterated
    const categoryKey = file.frontmatter.category;
    if (!uniqueCategories.has(categoryKey)) {
      uniqueCategories.set(categoryKey, {
        original: file.frontmatter.category,
        transliterated: file.transliteratedCategory
      });
    }

    // Sub-categories with both original and transliterated
    if (file.frontmatter['sub-category'] && file.transliteratedSubCategory) {
      const subCatKey = `${file.frontmatter.category}|${file.frontmatter['sub-category']}`;
      if (!uniqueSubCategories.has(subCatKey)) {
        uniqueSubCategories.set(subCatKey, {
          original: file.frontmatter['sub-category'],
          transliterated: file.transliteratedSubCategory,
          categoryOriginal: file.frontmatter.category
        });
      }
    }

    // Tags with both original and transliterated
    const originalTags = processTags(file.frontmatter.tags);
    const transliteratedTags = file.transliteratedTags;

    for (let i = 0;i < originalTags.length;i++) {
      const originalTag = originalTags[i];
      const transliteratedTag = transliteratedTags[i];

      if (originalTag && transliteratedTag && !uniqueTags.has(originalTag)) {
        uniqueTags.set(originalTag, {
          original: originalTag,
          transliterated: transliteratedTag
        });
      }
    }
  }

  log.info(`Found ${uniqueLanguages.size} languages, ${uniqueAuthors.size} authors, ${uniqueCategories.size} categories, ${uniqueSubCategories.size} sub-categories, ${uniqueTags.size} tags`);

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

  // Process categories with both names
  for (const [originalCategory, { original, transliterated }] of uniqueCategories) {
    const categoryData: CategoryData = {
      name: transliterated,    // Transliterated name
      localName: original      // Original vernacular name
    };
    const categoryId = await findOrCreateCategory(categoryData);
    categoryMap.set(originalCategory, categoryId);
  }
  log.success('Categories processed');

  // Process sub-categories with both names
  for (const [subCatKey, { original, transliterated, categoryOriginal }] of uniqueSubCategories) {
    const categoryId = categoryMap.get(categoryOriginal);

    if (categoryId) {
      const subCategoryData: SubCategoryData = {
        name: transliterated,    // Transliterated name
        localName: original,     // Original vernacular name
        categoryId: categoryId
      };
      const subCategoryId = await findOrCreateSubCategory(subCategoryData);
      subCategoryMap.set(subCatKey, subCategoryId);
    }
  }
  log.success('Sub-categories processed');

  // Process tags with both names
  for (const [originalTag, { original, transliterated }] of uniqueTags) {
    const tagData: TagData = {
      name: transliterated,    // Transliterated name
      localName: original,     // Original vernacular name
      slug: transliterated.replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
    };
    const tagId = await findOrCreateTag(tagData);
    tagMap.set(originalTag, tagId);
  }
  log.success('Tags processed');

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

  return { languageMap, authorMap, categoryMap, subCategoryMap, tagMap };
}

/**
 * Process articles and upsert to database
 */
export async function processArticles(
  processedFiles: ProcessedMetadata[],
  languageMap: Map<string, string>,
  authorMap: Map<string, string>,
  categoryMap: Map<string, string>,
  subCategoryMap: Map<string, string>,
  tagMap: Map<string, string>,
  editorId: string,
  options: { verbose?: boolean; dryRun?: boolean } = {}
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
      const categoryId = categoryMap.get(file.frontmatter.category);

      // Get sub-category ID if it exists
      let subCategoryId: string | null = null;
      if (file.frontmatter['sub-category']) {
        const subCatKey = `${file.frontmatter.category}|${file.frontmatter['sub-category']}`;
        subCategoryId = subCategoryMap.get(subCatKey) || null;
      }

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

      // Prepare original and transliterated tags
      const originalTags = processTags(file.frontmatter.tags);

      // Build tag IDs array for the article
      const tagIds: string[] = [];
      for (const originalTag of originalTags) {
        const tagId = tagMap.get(originalTag);
        if (tagId) {
          tagIds.push(tagId);
        }
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
        isFeatured: file.frontmatter.featured === true,
        languageId,
        categoryId,
        subCategoryId,
        authorId,
        editorId,
        tags: tagIds  // ✅ Pass tag IDs instead of tag names
      };

      if (options.verbose) {
        log.info(`Processing: ${file.frontmatter.title} by ${file.frontmatter.author}`);
      }

      if (!options.dryRun) {
        // ✅ Fixed: Just upsert the article with tag IDs included
        await upsertArticle(articleData);
      }

      processed++;
    } catch (error) {
      log.alert(`Failed to process article ${file.filePath}: ${error}`);
      errors++;
    }
  }

  return { processed, errors, warnings };
}

/**
 * Main content sync function that orchestrates the entire process
 */
export async function syncContent(
  files: string[],
  editorData: EditorData,
  options: { verbose?: boolean; dryRun?: boolean } = {}
): Promise<SyncResult> {
  const { verbose = false, dryRun = false } = options;

  if (verbose) {
    log.info(`Starting content sync for ${files.length} files`);
    if (dryRun) log.info('DRY RUN MODE - No database changes will be made');
  }

  // Step 1: Parse markdown files
  const parsedFiles: Array<Omit<ProcessedMetadata, 'transliteratedAuthor' | 'transliteratedTitle' | 'transliteratedCategory' | 'transliteratedSubCategory' | 'transliteratedTags' | 'slug'>> = [];

  for (const file of files) {
    const parsed = parseMarkdownFile(file);
    if (parsed) {
      parsedFiles.push(parsed);
    }
  }

  if (parsedFiles.length === 0) {
    throw new Error('No valid files to process');
  }

  log.info(`Successfully parsed ${parsedFiles.length}/${files.length} files`);

  // Step 2: Batch process transliterations
  const processedFiles = await batchProcessTransliterations(parsedFiles);

  // Step 3: Create or find editor
  const editorId = await findOrCreateEditor(editorData);
  log.success(`Editor processed: ${editorData.name}`);

  // Step 4: Populate reference tables
  const { languageMap, authorMap, categoryMap, subCategoryMap, tagMap } = await populateReferenceTablesFirst(
    processedFiles,
    editorId
  );

  // Step 5: Process articles
  const { processed, errors, warnings } = await processArticles(
    processedFiles,
    languageMap,
    authorMap,
    categoryMap,
    subCategoryMap,
    tagMap,
    editorId,
    { verbose, dryRun }
  );

  return {
    totalFiles: files.length,
    parsedFiles: parsedFiles.length,
    languages: languageMap.size,
    authors: authorMap.size,
    categories: categoryMap.size,
    subCategories: subCategoryMap.size,
    tags: tagMap.size,
    articlesProcessed: processed,
    errors,
    warnings
  };
}

/**
 * Get editor information from environment variables
 */
export function getEditorFromEnvironment(): EditorData {
  const editorName = process.env.EDITOR_NAME;
  const editorEmail = process.env.EDITOR_EMAIL;
  const editorGithubUsername = process.env.EDITOR_GITHUB_USERNAME;

  if (!editorName) {
    throw new Error('EDITOR_NAME environment variable is required');
  }

  return {
    name: editorName,
    email: editorEmail || null,
    githubUserName: editorGithubUsername || null
  };
}

/**
 * Get editor information from Git commit
 */
export function getEditorFromCommit(): EditorData {
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
