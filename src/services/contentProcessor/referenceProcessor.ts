// src/services/contentProcessor/referenceProcessor.ts

import {
  findOrCreateAuthor,
  findOrCreateCategory,
  findOrCreateLanguage,
  findOrCreateSubCategory,
  findOrCreateTag,
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
 * Populate reference tables (languages, authors, categories, sub-categories, tags)
 */
export async function populateReferenceTablesFirst(
  processedFiles: ProcessedMetadata[],
  editorId: string
): Promise<ReferenceTableMaps> {
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
      slug: createTagSlug(transliterated)
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
