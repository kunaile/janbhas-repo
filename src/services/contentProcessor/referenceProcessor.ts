// src/services/contentProcessor/referenceProcessor.ts

import {
  findOrCreateAuthor,
  findOrCreateCategory,
  findOrCreateLanguage,
  findOrCreateSubCategory,
  findOrCreateTag,
  findSeriesByTitle,
  setCurrentEditorId,
  type AuthorData,
  type CategoryData,
  type LanguageData,
  type SubCategoryData,
  type TagData
} from '../database';
import { getLanguageName } from '../../utils/transliteration';
import { log, processTags, createTagSlug } from './utils';
import type { ProcessedMetadata, ReferenceTableMaps } from './types';

/**
 * Format local names properly based on language script
 */
function formatLocalName(text: string, language: string): string {
  const romanScriptLanguages = ['en', 'de', 'fr', 'es', 'pt'];

  if (romanScriptLanguages.includes(language)) {
    // Title case for Roman scripts
    return text.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  // Keep original for non-Roman scripts (Hindi, Bengali, etc.)
  return text;
}

/**
 * Populate reference tables (languages, authors, categories, sub-categories, tags, series)
 * Episodes reference series by English title via series_title field
 */
export async function populateReferenceTablesFirst(
  processedFiles: ProcessedMetadata[],
  editorId: string
): Promise<ReferenceTableMaps> {
  log.info('PHASE 1: Populating reference tables (mapping-based approach)');

  // Set editor context for audit fields
  setCurrentEditorId(editorId);

  const languageMap = new Map<string, string>();
  const authorMap = new Map<string, string>();
  const categoryMap = new Map<string, string>();
  const subCategoryMap = new Map<string, string>();
  const tagMap = new Map<string, string>();
  const seriesMap = new Map<string, string>(); // series English title → seriesId mapping

  // Extract unique values
  const uniqueLanguages = new Set<string>();
  const uniqueAuthors = new Set<string>();
  const uniqueCategories = new Map<string, { original: string; transliterated: string }>();
  const uniqueSubCategories = new Map<string, { original: string; transliterated: string; categoryOriginal: string }>();
  const uniqueTags = new Map<string, { original: string; transliterated: string }>();
  const uniqueSeriesTitles = new Set<string>(); // Track series English titles from episodes

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

    // Sub-categories with both original and transliterated - UPDATED field name
    if (file.frontmatter.sub_category && file.transliteratedSubCategory) {
      const subCatKey = `${file.frontmatter.category}|${file.frontmatter.sub_category}`;
      if (!uniqueSubCategories.has(subCatKey)) {
        uniqueSubCategories.set(subCatKey, {
          original: file.frontmatter.sub_category,
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

    // Track series references from episodes - UPDATED: use series_title
    if (file.frontmatter.series_title) {
      uniqueSeriesTitles.add(file.frontmatter.series_title);
    }
  }

  log.info(
    `Found ${uniqueLanguages.size} languages, ${uniqueAuthors.size} authors, ` +
    `${uniqueCategories.size} categories, ${uniqueSubCategories.size} sub-categories, ` +
    `${uniqueTags.size} tags, ${uniqueSeriesTitles.size} series references`
  );

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
  log.success('✓ Languages processed');

  // Process categories with both names
  for (const [originalCategory, { original, transliterated }] of uniqueCategories) {
    const categoryData: CategoryData = {
      name: transliterated,    // Transliterated name for URL/SEO
      localName: formatLocalName(original, processedFiles.find(f => f.frontmatter.category === original)?.normalizedLang || 'hi')
    };
    const categoryId = await findOrCreateCategory(categoryData);
    categoryMap.set(originalCategory, categoryId);
  }
  log.success('✓ Categories processed');

  // Process sub-categories with both names
  for (const [subCatKey, { original, transliterated, categoryOriginal }] of uniqueSubCategories) {
    const categoryId = categoryMap.get(categoryOriginal);

    if (categoryId) {
      const subCategoryData: SubCategoryData = {
        name: transliterated,
        localName: formatLocalName(original, processedFiles.find(f => f.frontmatter.category === categoryOriginal)?.normalizedLang || 'hi'),
        categoryId: categoryId
      };
      const subCategoryId = await findOrCreateSubCategory(subCategoryData);
      subCategoryMap.set(subCatKey, subCategoryId);
    } else {
      log.warn(`⚠️  Category not found for sub-category: ${original} (category: ${categoryOriginal})`);
    }
  }
  log.success('✓ Sub-categories processed');

  // Process tags with both names
  for (const [originalTag, { original, transliterated }] of uniqueTags) {
    const tagData: TagData = {
      name: transliterated,
      localName: formatLocalName(original, 'hi'),
      slug: createTagSlug(transliterated)
    };
    const tagId = await findOrCreateTag(tagData);
    tagMap.set(originalTag, tagId);
  }
  log.success('✓ Tags processed');

  // Process authors with proper localName formatting
  for (const file of processedFiles) {
    const authorKey = file.frontmatter.author;
    if (!authorMap.has(authorKey)) {
      const authorData: AuthorData = {
        name: file.transliteratedAuthor,
        localName: formatLocalName(file.frontmatter.author, file.normalizedLang)
      };
      const authorId = await findOrCreateAuthor(authorData);
      authorMap.set(authorKey, authorId);
    }
  }
  log.success('✓ Authors processed');

  // Process series references (map series English title to series IDs)
  // Look up by English title instead of local_title
  for (const seriesTitle of uniqueSeriesTitles) {
    try {
      // Look up series by English title (the `title` field in database)
      const existingSeries = await findSeriesByTitle(seriesTitle);
      if (existingSeries) {
        seriesMap.set(seriesTitle, existingSeries.id);
        log.success(`✓ Series found: "${seriesTitle}" → ${existingSeries.slug} (${existingSeries.local_title})`);
      } else {
        log.warn(`⚠️  Series not found: "${seriesTitle}" - Create the series cover page with title: "${seriesTitle}" first`);
        // Don't add to map - this will cause validation error later
      }
    } catch (error) {
      log.warn(`⚠️  Series lookup failed: "${seriesTitle}" - ${error}`);
    }
  }

  if (uniqueSeriesTitles.size > 0) {
    log.success(`✓ Series references processed: ${seriesMap.size}/${uniqueSeriesTitles.size} found`);
  }

  // Summary logging
  log.info('📊 Reference Tables Summary:');
  log.info(`   Languages: ${languageMap.size}`);
  log.info(`   Authors: ${authorMap.size}`);
  log.info(`   Categories: ${categoryMap.size}`);
  log.info(`   Sub-categories: ${subCategoryMap.size}`);
  log.info(`   Tags: ${tagMap.size}`);
  log.info(`   Series: ${seriesMap.size}`);

  return {
    languageMap,
    authorMap,
    categoryMap,
    subCategoryMap,
    tagMap,
    seriesMap
  };
}

/**
 * Validate series references - ensure all episode series_title references exist
 */
export function validateSeriesReferences(
  processedFiles: ProcessedMetadata[],
  seriesMap: Map<string, string>
): { valid: ProcessedMetadata[]; invalid: { file: ProcessedMetadata; error: string }[] } {
  const valid: ProcessedMetadata[] = [];
  const invalid: { file: ProcessedMetadata; error: string }[] = [];

  for (const file of processedFiles) {
    // Check if this file references a series
    const seriesTitle = file.frontmatter.series_title;

    if (seriesTitle) {
      // This is an episode - validate series exists
      if (!seriesMap.has(seriesTitle)) {
        invalid.push({
          file,
          error: `Series "${seriesTitle}" not found - create series cover with title: "${seriesTitle}" first`
        });
        continue;
      }
    }

    // Series covers should not reference other series
    if (file.contentType === 'series' && seriesTitle) {
      invalid.push({
        file,
        error: 'Series covers should not have series_title field'
      });
      continue;
    }

    valid.push(file);
  }

  return { valid, invalid };
}

/**
 * Get series statistics for reporting
 */
export function getSeriesStatistics(
  processedFiles: ProcessedMetadata[],
  seriesMap: Map<string, string>
): {
  totalSeries: number;
  totalEpisodes: number;
  seriesWithEpisodes: Map<string, number>;
  orphanedEpisodes: string[];
} {
  const seriesWithEpisodes = new Map<string, number>();
  const orphanedEpisodes: string[] = [];

  let totalSeries = 0;
  let totalEpisodes = 0;

  for (const file of processedFiles) {
    if (file.contentType === 'series') {
      totalSeries++;
      // Initialize series episode count
      if (!seriesWithEpisodes.has(file.frontmatter.title)) {
        seriesWithEpisodes.set(file.frontmatter.title, 0);
      }
    } else if (file.contentType === 'episode') {
      totalEpisodes++;

      if (file.frontmatter.series_title) {
        if (seriesMap.has(file.frontmatter.series_title)) {
          // Valid episode - increment count
          const currentCount = seriesWithEpisodes.get(file.frontmatter.series_title) || 0;
          seriesWithEpisodes.set(file.frontmatter.series_title, currentCount + 1);
        } else {
          // Orphaned episode
          orphanedEpisodes.push(`${file.frontmatter.title} (references: ${file.frontmatter.series_title})`);
        }
      }
    }
  }

  return {
    totalSeries,
    totalEpisodes,
    seriesWithEpisodes,
    orphanedEpisodes
  };
}
