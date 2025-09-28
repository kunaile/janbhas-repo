// src/services/contentProcessor/articleProcessor.ts

import {
  upsertArticle,
  upsertSeries,
  setCurrentEditorId,
  getNextEpisodeNumber,
  type ArticleData,
  type SeriesData
} from '../database';
import { log, extractShortDescription, processTags } from './utils';
import type { ProcessedMetadata, ReferenceTableMaps } from './types';

/**
 * Process articles and series with upsert to database
 */
export async function processArticles(
  processedFiles: ProcessedMetadata[],
  referenceMaps: ReferenceTableMaps,
  editorId: string,
  options: { verbose?: boolean; dryRun?: boolean } = {}
): Promise<{ processed: number; errors: number; warnings: number }> {
  log.info('PHASE 2: Processing articles and series');
  let processed = 0;
  let errors = 0;
  let warnings = 0;

  // Set editor context for audit fields
  setCurrentEditorId(editorId);

  const { languageMap, authorMap, categoryMap, subCategoryMap, tagMap, seriesMap } = referenceMaps;

  // Process series first, then articles (for proper episode linking)
  const seriesFiles = processedFiles.filter(file => file.contentType === 'series');
  const episodeFiles = processedFiles.filter(file => file.contentType === 'episode');
  const articleFiles = processedFiles.filter(file => file.contentType === 'article');

  // Process series cover pages first
  for (const file of seriesFiles) {
    try {
      await processSeriesFile(file, referenceMaps, editorId, options);
      processed++;
    } catch (error) {
      log.alert(`Failed to process series ${file.filePath}: ${error}`);
      errors++;
    }
  }

  // Then process episodes
  for (const file of episodeFiles) {
    try {
      await processEpisodeFile(file, referenceMaps, editorId, options);
      processed++;
    } catch (error) {
      log.alert(`Failed to process episode ${file.filePath}: ${error}`);
      errors++;
    }
  }

  // Finally process standalone articles
  for (const file of articleFiles) {
    try {
      await processArticleFile(file, referenceMaps, editorId, options);
      processed++;
    } catch (error) {
      log.alert(`Failed to process article ${file.filePath}: ${error}`);
      errors++;
    }
  }

  return { processed, errors, warnings };
}

/**
 * Process standalone article file
 */
async function processArticleFile(
  file: ProcessedMetadata,
  referenceMaps: ReferenceTableMaps,
  editorId: string,
  options: { verbose?: boolean; dryRun?: boolean }
): Promise<void> {
  const { languageMap, authorMap, categoryMap, subCategoryMap } = referenceMaps;

  // Get IDs from maps
  const languageId = languageMap.get(file.normalizedLang);
  const authorId = authorMap.get(file.frontmatter.author);
  const categoryId = categoryMap.get(file.frontmatter.category);

  if (!languageId || !authorId || !categoryId) {
    throw new Error(`Missing reference IDs for article ${file.filePath}`);
  }

  // Get sub-category ID if it exists
  let subCategoryId: string | null = null;
  if (file.frontmatter.sub_category) {
    const subCatKey = `${file.frontmatter.category}|${file.frontmatter.sub_category}`;
    subCategoryId = subCategoryMap.get(subCatKey) || null;
  }

  // Prepare tags
  const originalTags = processTags(file.frontmatter.tags);

  // Create article data (CLEANED - no publishedDate or duration)
  const articleData: ArticleData = {
    slug: file.slug,
    title: file.frontmatter.title,
    localTitle: file.frontmatter.local_title,
    shortDescription: extractShortDescription(file.markdownContent),
    markdownContent: file.markdownContent,
    thumbnailUrl: file.frontmatter.thumbnail || null,
    audioUrl: file.frontmatter.audio || null,
    wordCount: file.frontmatter.words || null,
    isPublished: file.frontmatter.published === true,
    isFeatured: file.frontmatter.featured === true,
    languageId,
    categoryId,
    subCategoryId,
    authorId,
    editorId,
    tags: originalTags,
    seriesId: null,
    episodeNumber: null,
    articleType: file.frontmatter.article_type || 'standard',
  };

  if (options.verbose) {
    log.info(`Processing Article: ${file.frontmatter.title} → ${file.frontmatter.local_title} by ${file.frontmatter.author}`);
  }

  if (!options.dryRun) {
    await upsertArticle(articleData);
  }
}

/**
 * Process episode article file
 */
async function processEpisodeFile(
  file: ProcessedMetadata,
  referenceMaps: ReferenceTableMaps,
  editorId: string,
  options: { verbose?: boolean; dryRun?: boolean }
): Promise<void> {
  const { languageMap, authorMap, categoryMap, subCategoryMap, seriesMap } = referenceMaps;

  // Get IDs from maps
  const languageId = languageMap.get(file.normalizedLang);
  const authorId = authorMap.get(file.frontmatter.author);
  const categoryId = categoryMap.get(file.frontmatter.category);

  if (!languageId || !authorId || !categoryId) {
    throw new Error(`Missing reference IDs for episode ${file.filePath}`);
  }

  // Get sub-category ID if it exists
  let subCategoryId: string | null = null;
  if (file.frontmatter.sub_category) {
    const subCatKey = `${file.frontmatter.category}|${file.frontmatter.sub_category}`;
    subCategoryId = subCategoryMap.get(subCatKey) || null;
  }

  // Handle series reference
  let seriesId: string | null = null;
  let episodeNumber: number | null = null;

  if (file.frontmatter.series_title) {
    seriesId = seriesMap.get(file.frontmatter.series_title) || null;

    if (!seriesId) {
      throw new Error(`Series not found: "${file.frontmatter.series_title}" for ${file.filePath}. Create series cover first.`);
    } else {
      // Auto-assign episode number if not provided
      if (file.frontmatter.episode) {
        episodeNumber = file.frontmatter.episode;
      } else {
        episodeNumber = await getNextEpisodeNumber(seriesId);
        log.info(`Auto-assigned episode number ${episodeNumber} for ${file.frontmatter.title}`);
      }
    }
  } else {
    throw new Error(`Episode missing series_title field: ${file.filePath}`);
  }

  // Prepare tags
  const originalTags = processTags(file.frontmatter.tags);

  // Create article data for episode (CLEANED - no publishedDate or duration)
  const articleData: ArticleData = {
    slug: file.slug,
    title: file.frontmatter.title,
    localTitle: file.frontmatter.local_title,
    shortDescription: extractShortDescription(file.markdownContent),
    markdownContent: file.markdownContent,
    thumbnailUrl: file.frontmatter.thumbnail || null,
    audioUrl: file.frontmatter.audio || null,
    wordCount: file.frontmatter.words || null,
    isPublished: file.frontmatter.published === true,
    isFeatured: file.frontmatter.featured === true,
    languageId,
    categoryId,
    subCategoryId,
    authorId,
    editorId,
    tags: originalTags,
    seriesId,
    episodeNumber,
    articleType: file.frontmatter.article_type || 'standard',
  };

  if (options.verbose) {
    log.info(`Processing Episode: ${file.frontmatter.title} → ${file.frontmatter.local_title} [${file.frontmatter.series_title} #${episodeNumber}] by ${file.frontmatter.author}`);
  }

  if (!options.dryRun) {
    await upsertArticle(articleData);
  }
}

/**
 * Process series cover page
 */
async function processSeriesFile(
  file: ProcessedMetadata,
  referenceMaps: ReferenceTableMaps,
  editorId: string,
  options: { verbose?: boolean; dryRun?: boolean }
): Promise<void> {
  const { languageMap, authorMap, categoryMap, subCategoryMap } = referenceMaps;

  // Get IDs from maps
  const languageId = languageMap.get(file.normalizedLang);
  const authorId = authorMap.get(file.frontmatter.author);
  const categoryId = categoryMap.get(file.frontmatter.category);

  if (!languageId || !authorId || !categoryId) {
    throw new Error(`Missing reference IDs for series ${file.filePath}`);
  }

  // Get sub-category ID if it exists
  let subCategoryId: string | null = null;
  if (file.frontmatter.sub_category) {
    const subCatKey = `${file.frontmatter.category}|${file.frontmatter.sub_category}`;
    subCategoryId = subCategoryMap.get(subCatKey) || null;
  }

  const seriesData: SeriesData = {
    slug: file.slug,
    title: file.frontmatter.title,
    localTitle: file.frontmatter.local_title,
    shortDescription: extractShortDescription(file.markdownContent),
    markdownContent: file.markdownContent,
    thumbnailUrl: file.frontmatter.thumbnail || null,
    isComplete: file.frontmatter.completed || false,
    isPublished: file.frontmatter.published || false,
    isFeatured: file.frontmatter.featured || false,
    languageId,
    categoryId,
    subCategoryId,
    authorId,
    editorId,
    authorName: file.transliteratedAuthor,
    authorLocalName: file.frontmatter.author,
    categoryName: file.transliteratedCategory,
    categoryLocalName: file.frontmatter.category,
    subCategoryName: file.transliteratedSubCategory || null,
    subCategoryLocalName: file.frontmatter.sub_category || null,
  };

  if (options.verbose) {
    log.info(`Processing Series: ${file.frontmatter.title} → ${file.frontmatter.local_title} by ${file.frontmatter.author}`);
  }

  if (!options.dryRun) {
    await upsertSeries(seriesData);
  }
}

/**
 * Get processing statistics for reporting
 */
export function getProcessingStats(processedFiles: ProcessedMetadata[]): {
  totalFiles: number;
  seriesCount: number;
  episodeCount: number;
  articleCount: number;
  publishedCount: number;
  featuredCount: number;
} {
  let seriesCount = 0;
  let episodeCount = 0;
  let articleCount = 0;
  let publishedCount = 0;
  let featuredCount = 0;

  for (const file of processedFiles) {
    switch (file.contentType) {
      case 'series':
        seriesCount++;
        break;
      case 'episode':
        episodeCount++;
        break;
      case 'article':
        articleCount++;
        break;
    }

    if (file.frontmatter.published) {
      publishedCount++;
    }

    if (file.frontmatter.featured) {
      featuredCount++;
    }
  }

  return {
    totalFiles: processedFiles.length,
    seriesCount,
    episodeCount,
    articleCount,
    publishedCount,
    featuredCount
  };
}
