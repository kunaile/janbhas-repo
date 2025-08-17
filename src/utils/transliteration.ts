// src/utils/transliteration.ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { batchTransliterate, type TransliterationItem, type TransliterationResult } from '../services/geminiTransliteration';

const LANGUAGE_NAMES: Record<string, string> = {
  'hi': 'Hindi',
  'bn': 'Bengali',
  'ta': 'Tamil',
  'te': 'Telugu',
  'ml': 'Malayalam',
  'kn': 'Kannada',
  'gu': 'Gujarati',
  'mr': 'Marathi',
  'pa': 'Punjabi',
  'or': 'Odia',
  'en': 'English'
};

// Enhanced caching system for all mapping types
const mappingCaches = {
  author: new Map<string, Record<string, string>>(),
  category: new Map<string, Record<string, string>>(),
  subcategory: new Map<string, Record<string, string>>(),
  tag: new Map<string, Record<string, string>>()
};

/**
 * Generic mapping loader for all types
 */
function loadMappings(
  type: 'author' | 'category' | 'subcategory' | 'tag',
  langCode: string
): Record<string, string> {
  const cache = mappingCaches[type];

  if (cache.has(langCode)) {
    return cache.get(langCode)!;
  }

  try {
    const mappingFile = join(__dirname, '../data', `${type}-mappings.${langCode}.json`);
    const fileContent = readFileSync(mappingFile, 'utf8');
    const mappingData = JSON.parse(fileContent);
    const mappings = mappingData[`${type}_mappings`] || {};

    cache.set(langCode, mappings);
    console.log(`[INFO] Loaded ${Object.keys(mappings).length} ${type} mappings for ${langCode}`);

    return mappings;
  } catch (error) {
    console.warn(`[WARN] Could not load ${type} mappings for ${langCode}: ${error}`);
    const emptyMappings = {};
    cache.set(langCode, emptyMappings);
    return emptyMappings;
  }
}

/**
 * Specific loader functions
 */
function loadAuthorMappings(langCode: string): Record<string, string> {
  return loadMappings('author', langCode);
}

function loadCategoryMappings(langCode: string): Record<string, string> {
  return loadMappings('category', langCode);
}

function loadSubcategoryMappings(langCode: string): Record<string, string> {
  return loadMappings('subcategory', langCode);
}

function loadTagMappings(langCode: string): Record<string, string> {
  return loadMappings('tag', langCode);
}

/**
 * Check for existing mapping based on type
 */
function checkExistingMapping(
  item: { text: string; type: 'title' | 'author' | 'category' | 'subcategory' | 'tag'; language: string }
): string | null {
  if (item.type === 'title') {
    return null; // Titles should always be transliterated fresh
  }

  let mappings: Record<string, string> = {};

  switch (item.type) {
    case 'author':
      mappings = loadAuthorMappings(item.language);
      break;
    case 'category':
      mappings = loadCategoryMappings(item.language);
      break;
    case 'subcategory':
      mappings = loadSubcategoryMappings(item.language);
      break;
    case 'tag':
      mappings = loadTagMappings(item.language);
      break;
  }

  // Check both original text and cleaned version
  const cleanName = item.text.replace(/[''"]/g, '').trim();
  const mapping = mappings[item.text] || mappings[cleanName];

  return mapping ? mapping.toLowerCase() : null;
}

/**
 * Enhanced batch transliteration with consistent mapping support for all types
 */
export async function batchTransliterateTexts(
  items: Array<{ text: string; type: 'title' | 'author' | 'category' | 'subcategory' | 'tag'; language: string }>
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  if (items.length === 0) {
    return results;
  }

  // Check existing mappings for all supported types
  const itemsToProcess: TransliterationItem[] = [];

  for (const item of items) {
    const existingMapping = checkExistingMapping(item);

    if (existingMapping) {
      results.set(item.text, existingMapping);
      console.log(`[OK] Used ${item.type} mapping: ${item.text} -> ${existingMapping}`);
      continue;
    }

    itemsToProcess.push(item);
  }

  if (itemsToProcess.length === 0) {
    return results;
  }

  // Process remaining items with Gemini API
  try {
    console.log(`[INFO] Processing ${itemsToProcess.length} items with Gemini API (${items.length - itemsToProcess.length} used mappings)`);

    const geminiResults = await batchTransliterate(itemsToProcess);

    for (const result of geminiResults) {
      const finalResult = result.transliterated.toLowerCase().trim();

      if (!finalResult) {
        throw new Error(`Empty result after processing for: "${result.original}"`);
      }

      results.set(result.original, finalResult);
      console.log(`[OK] Transliterated ${result.type}: "${result.original}" -> "${finalResult}"`);
    }

    return results;

  } catch (error) {
    console.error(`[ERROR] Batch transliteration failed: ${error}`);
    throw error;
  }
}

/**
 * Batch transliterate with mapping suggestions
 */
export async function batchTransliterateWithSuggestions(
  items: Array<{ text: string; type: 'title' | 'author' | 'category' | 'subcategory' | 'tag'; language: string }>
): Promise<{
  results: Map<string, string>;
  suggestions: Array<{ type: string; language: string; original: string; suggested: string }>;
}> {
  const results = await batchTransliterateTexts(items);
  const suggestions: Array<{ type: string; language: string; original: string; suggested: string }> = [];

  // Generate suggestions for new mappings
  for (const item of items) {
    if (item.type !== 'title') { // Don't suggest mappings for titles
      const existingMapping = checkExistingMapping(item);
      if (!existingMapping && results.has(item.text)) {
        suggestions.push({
          type: item.type,
          language: item.language,
          original: item.text,
          suggested: results.get(item.text)!
        });
      }
    }
  }

  return { results, suggestions };
}

/**
 * Enhanced individual transliteration functions
 */
export async function transliterate(
  text: string,
  options?: { lang?: string; type?: 'title' | 'author' | 'category' | 'subcategory' | 'tag' }
): Promise<string> {
  const { lang = 'hi', type = 'title' } = options || {};

  if (!text || typeof text !== 'string') {
    throw new Error(`Invalid text for transliteration: "${text}"`);
  }

  const items = [{ text, type, language: lang }];
  const results = await batchTransliterateTexts(items);

  const result = results.get(text);
  if (!result) {
    throw new Error(`Transliteration failed for: "${text}"`);
  }

  return result;
}

export async function transliterateAuthorName(authorName: string, langCode: string = 'hi'): Promise<string> {
  return transliterate(authorName, { lang: langCode, type: 'author' });
}

export async function transliterateCategory(categoryName: string, langCode: string = 'hi'): Promise<string> {
  return transliterate(categoryName, { lang: langCode, type: 'category' });
}

export async function transliterateSubCategory(subCategoryName: string, langCode: string = 'hi'): Promise<string> {
  return transliterate(subCategoryName, { lang: langCode, type: 'subcategory' });
}

export async function transliterateTag(tagName: string, langCode: string = 'hi'): Promise<string> {
  return transliterate(tagName, { lang: langCode, type: 'tag' });
}

/**
 * Generate slug with enhanced validation
 */
export async function generateSlug(title: string, author: string, language: string = 'hi'): Promise<string> {
  if (!title || !author) {
    throw new Error('Title and author are required for slug generation');
  }

  const items = [
    { text: title, type: 'title' as const, language },
    { text: author, type: 'author' as const, language }
  ];

  const results = await batchTransliterateTexts(items);

  const titleResult = results.get(title);
  const authorResult = results.get(author);

  if (!titleResult || !authorResult) {
    throw new Error('Slug generation failed - transliteration incomplete');
  }

  // Create URL-friendly slug
  const titleSlug = titleResult
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const authorSlug = authorResult
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!titleSlug || !authorSlug) {
    throw new Error('Slug generation failed - empty results after cleaning');
  }

  return `${titleSlug}_by_${authorSlug}`;
}

/**
 * Utility functions
 */
export function normalizeText(text: string): string {
  if (!text || typeof text !== 'string') {
    throw new Error(`Invalid text for normalization: "${text}"`);
  }
  return text.trim().toLowerCase();
}

export function getLanguageName(langCode: string): string {
  return LANGUAGE_NAMES[langCode.toLowerCase()] || langCode.toUpperCase();
}

/**
 * Get all mappings for debugging/admin purposes
 */
export function getAllMappings(langCode: string = 'hi') {
  return {
    authors: { ...loadAuthorMappings(langCode) },
    categories: { ...loadCategoryMappings(langCode) },
    subcategories: { ...loadSubcategoryMappings(langCode) },
    tags: { ...loadTagMappings(langCode) }
  };
}

/**
 * Cache management
 */
export function clearMappingCache(type?: 'author' | 'category' | 'subcategory' | 'tag') {
  if (type) {
    mappingCaches[type].clear();
    console.log(`[INFO] Cleared ${type} mapping cache`);
  } else {
    Object.values(mappingCaches).forEach(cache => cache.clear());
    console.log(`[INFO] Cleared all mapping caches`);
  }
}

/**
 * Add new mapping programmatically
 */
export function addMapping(
  type: 'author' | 'category' | 'subcategory' | 'tag',
  langCode: string,
  original: string,
  transliterated: string
) {
  const mappings = loadMappings(type, langCode);
  mappings[original] = transliterated;
  mappingCaches[type].set(langCode, mappings);
  console.log(`[INFO] Added ${type} mapping: ${original} -> ${transliterated}`);
}
