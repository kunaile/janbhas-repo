// src/services/contentProcessor/articleProcessor.ts

import { upsertArticle, type ArticleData } from '../database';
import { log, extractShortDescription, parseDuration, processTags } from './utils';
import type { ProcessedMetadata, ReferenceTableMaps } from './types';

/**
 * Process articles and upsert to database
 */
export async function processArticles(
  processedFiles: ProcessedMetadata[],
  referenceMaps: ReferenceTableMaps,
  editorId: string,
  options: { verbose?: boolean; dryRun?: boolean } = {}
): Promise<{ processed: number; errors: number; warnings: number }> {
  log.info('PHASE 2: Processing articles');
  let processed = 0;
  let errors = 0;
  let warnings = 0;

  const { languageMap, authorMap, categoryMap, subCategoryMap, tagMap } = referenceMaps;

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
        tags: tagIds
      };

      if (options.verbose) {
        log.info(`Processing: ${file.frontmatter.title} by ${file.frontmatter.author}`);
      }

      if (!options.dryRun) {
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
