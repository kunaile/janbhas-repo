// src/services/contentProcessor/transliterationProcessor.ts

import {
  batchTransliterateTexts,
  normalizeFrontmatter,
  validateFrontmatter,
  generateFullSlug,
  clearSlugCache
} from '../../utils/transliteration';
import { log, processTags } from './utils';
import type { ParsedFile, ProcessedMetadata, NormalizedFrontmatter } from './types';

/**
 * Batch process all transliterations using mapping-only approach (NO Gemini API)
 */
export async function batchProcessTransliterations(
  parsedFiles: ParsedFile[]
): Promise<ProcessedMetadata[]> {
  log.info('Starting mapping-based transliteration (no API dependencies)');

  // Clear slug cache at the start to prevent cross-run conflicts
  clearSlugCache();

  const processedFiles: ProcessedMetadata[] = [];
  const errors: string[] = [];

  // Process each file individually for better error handling
  for (const file of parsedFiles) {
    try {
      // Step 1: Normalize frontmatter (handle field alternatives)
      const normalizedFrontmatter = normalizeFrontmatter(file.frontmatter);

      // Step 2: Validate required fields
      const validation = validateFrontmatter(normalizedFrontmatter, file.filePath);

      if (!validation.isValid) {
        const errorMessages = validation.errors.map(e => `${e.field}: ${e.message}`).join(', ');
        throw new Error(`Validation failed: ${errorMessages}`);
      }

      // Log warnings if any
      validation.warnings.forEach(warning => {
        log.warn(`${file.filePath}: ${warning}`);
      });

      // Step 3: Determine content type
      const contentTypeInfo = determineContentType(normalizedFrontmatter);

      // Step 4: Collect items for mapping-based transliteration
      const items: Array<{
        text: string;
        type: 'author' | 'category' | 'subcategory' | 'tag';
        language: string;
      }> = [];

      // Always need author and category mappings
      items.push(
        { text: normalizedFrontmatter.author, type: 'author', language: normalizedFrontmatter.lang },
        { text: normalizedFrontmatter.category, type: 'category', language: normalizedFrontmatter.lang }
      );

      // Add sub-category if exists
      if (normalizedFrontmatter.sub_category) {
        items.push({
          text: normalizedFrontmatter.sub_category,
          type: 'subcategory',
          language: normalizedFrontmatter.lang
        });
      }

      // Add tags if they exist
      const tags = processTags(normalizedFrontmatter.tags);
      for (const tag of tags) {
        items.push({
          text: tag,
          type: 'tag',
          language: normalizedFrontmatter.lang
        });
      }

      // Step 5: Process mappings
      const mappingResults = await batchTransliterateTexts(items);

      // Step 6: Extract mapping results
      const transliteratedAuthor = mappingResults.get(normalizedFrontmatter.author);
      const transliteratedCategory = mappingResults.get(normalizedFrontmatter.category);

      if (!transliteratedAuthor || !transliteratedCategory) {
        throw new Error(
          `Required mappings missing - Author: ${transliteratedAuthor ? '✓' : '✗'}, Category: ${transliteratedCategory ? '✓' : '✗'}`
        );
      }

      const transliteratedSubCategory = normalizedFrontmatter.sub_category
        ? mappingResults.get(normalizedFrontmatter.sub_category)
        : undefined;

      // Process transliterated tags
      const transliteratedTags: string[] = [];
      for (const tag of tags) {
        const transliteratedTag = mappingResults.get(tag);
        if (transliteratedTag) {
          transliteratedTags.push(transliteratedTag);
        } else {
          log.warn(`No mapping found for tag: "${tag}" in ${file.filePath}`);
        }
      }

      // Step 7: Generate slug using title + author
      const slugResult = await generateFullSlug(
        normalizedFrontmatter.title,
        normalizedFrontmatter.author,
        normalizedFrontmatter.lang
      );

      if (slugResult.isDuplicate) {
        throw new Error(`Duplicate slug detected: "${slugResult.slug}"`);
      }

      // Step 8: Create processed metadata
      const processedFile: ProcessedMetadata = {
        ...file,
        frontmatter: normalizedFrontmatter,
        transliteratedAuthor,
        transliteratedCategory,
        transliteratedSubCategory,
        transliteratedTags,
        slug: slugResult.slug,
        contentType: contentTypeInfo.type,
        isSeriesCover: contentTypeInfo.isSeriesCover,
        isSeriesEpisode: contentTypeInfo.isSeriesEpisode
      };

      processedFiles.push(processedFile);

      log.info(`✓ Processed: ${file.filePath} → ${slugResult.slug}`);

    } catch (error) {
      const errorMsg = `Failed to process ${file.filePath}: ${error}`;
      errors.push(errorMsg);
      log.error(errorMsg);
    }
  }

  // Summary logging
  if (errors.length > 0) {
    log.error(`Processing completed with ${errors.length} errors:`);
    errors.forEach(error => log.error(`  - ${error}`));
    throw new Error(`Transliteration processing failed for ${errors.length} files`);
  }

  log.success(`Mapping-based transliteration completed successfully for ${processedFiles.length} files`);
  return processedFiles;
}

/**
 * Determine content type from normalized frontmatter
 */
function determineContentType(frontmatter: NormalizedFrontmatter) {
  const isSeriesCover = frontmatter.base_type === 'series';
  const isSeriesEpisode = !!frontmatter.series_title;

  let contentType: 'article' | 'series' | 'episode';

  if (isSeriesCover) {
    contentType = 'series';
  } else if (isSeriesEpisode) {
    contentType = 'episode';
  } else {
    contentType = 'article';
  }

  return {
    type: contentType,
    isSeriesCover,
    isSeriesEpisode,
    seriesTitle: frontmatter.series_title,
    episodeNumber: frontmatter.episode
  };
}

/**
 * Validate series-specific requirements
 */
function validateSeriesRequirements(frontmatter: NormalizedFrontmatter): string[] {
  const warnings: string[] = [];

  // Series cover validation
  if (frontmatter.base_type === 'series') {
    if (frontmatter.series_title) {
      warnings.push('Series cover should not have series_title field');
    }
    if (frontmatter.episode) {
      warnings.push('Series cover should not have episode number');
    }
  }

  // Episode validation
  if (frontmatter.series_title) {
    if (frontmatter.base_type === 'series') {
      warnings.push('Episode cannot be a series cover (conflicting base_type)');
    }
    if (!frontmatter.episode) {
      warnings.push('Episode should have episode number for better organization');
    }
  }

  return warnings;
}

/**
 * Get transliteration statistics
 */
export function getTransliterationStats(processedFiles: ProcessedMetadata[]): {
  totalFiles: number;
  seriesCount: number;
  episodeCount: number;
  articleCount: number;
  languages: Set<string>;
  uniqueAuthors: Set<string>;
  uniqueCategories: Set<string>;
} {
  const languages = new Set<string>();
  const uniqueAuthors = new Set<string>();
  const uniqueCategories = new Set<string>();

  let seriesCount = 0;
  let episodeCount = 0;
  let articleCount = 0;

  for (const file of processedFiles) {
    languages.add(file.normalizedLang);
    uniqueAuthors.add(file.transliteratedAuthor);
    uniqueCategories.add(file.transliteratedCategory);

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
  }

  return {
    totalFiles: processedFiles.length,
    seriesCount,
    episodeCount,
    articleCount,
    languages,
    uniqueAuthors,
    uniqueCategories
  };
}
