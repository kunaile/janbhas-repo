// src/utils/transliteration.ts
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  Frontmatter,
  NormalizedFrontmatter,
  MappingResult,
  SlugGenerationResult,
  FrontmatterValidation,
  ValidationError
} from '../services/contentProcessor/types';

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

// Mapping caches for all types
const mappingCaches = {
  author: new Map<string, Record<string, string>>(),
  category: new Map<string, Record<string, string>>(),
  subcategory: new Map<string, Record<string, string>>(),
  tag: new Map<string, Record<string, string>>()
};

// Global slug tracking for duplicate detection
const usedSlugs = new Set<string>();

/**
 * Normalize frontmatter with priority-based field resolution
 * UPDATED: series_title replaces series_slug
 */
export function normalizeFrontmatter(frontmatter: Frontmatter): NormalizedFrontmatter {
  const normalized: NormalizedFrontmatter = {
    title: frontmatter.title,
    local_title: frontmatter.local_title || frontmatter.localTitle || '',
    author: frontmatter.author,
    category: frontmatter.category,
    lang: frontmatter.lang || frontmatter.language || '',
  };

  // Optional fields with priority resolution
  if (frontmatter.sub_category || frontmatter.subCategory) {
    normalized.sub_category = frontmatter.sub_category || frontmatter.subCategory;
  }

  if (frontmatter.base_type || frontmatter.baseType) {
    normalized.base_type = frontmatter.base_type || frontmatter.baseType;
  }

  // UPDATED: Handle series_title instead of series_slug
  if (frontmatter.series_title || frontmatter.seriesTitle) {
    normalized.series_title = frontmatter.series_title || frontmatter.seriesTitle;
  }

  if (frontmatter.article_type || frontmatter.articleType) {
    normalized.article_type = frontmatter.article_type || frontmatter.articleType;
  }

  // Copy other fields as-is
  normalized.thumbnail = frontmatter.thumbnail;
  normalized.audio = frontmatter.audio;
  normalized.words = frontmatter.words;
  normalized.published = frontmatter.published;
  normalized.featured = frontmatter.featured;
  normalized.tags = frontmatter.tags;
  normalized.episode = frontmatter.episode;
  normalized.completed = frontmatter.completed;

  return normalized;
}

/**
 * Validate normalized frontmatter
 * UPDATED: series_title validation instead of series_slug
 */
export function validateFrontmatter(frontmatter: NormalizedFrontmatter, filePath: string): FrontmatterValidation {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  // Required field validation
  const requiredFields = {
    title: !!frontmatter.title,
    local_title: !!frontmatter.local_title,
    author: !!frontmatter.author,
    category: !!frontmatter.category,
    lang: !!frontmatter.lang
  };

  if (!frontmatter.title) {
    errors.push({ field: 'title', message: 'English title is required', filePath });
  }

  if (!frontmatter.local_title) {
    errors.push({ field: 'local_title', message: 'Local title is required (local_title or localTitle)', filePath });
  }

  if (!frontmatter.author) {
    errors.push({ field: 'author', message: 'Author is required', filePath });
  }

  if (!frontmatter.category) {
    errors.push({ field: 'category', message: 'Category is required', filePath });
  }

  if (!frontmatter.lang) {
    errors.push({ field: 'lang', message: 'Language is required (lang or language)', filePath });
  }

  // Series-specific validation - UPDATED for series_title
  if (frontmatter.base_type === 'series' && frontmatter.series_title) {
    warnings.push('Series cover should not have series_title field');
  }

  if (frontmatter.series_title && !frontmatter.episode) {
    warnings.push('Episode articles should have episode number');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    requiredFields
  };
}

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
 * Get mapping with graceful fallback
 */
function getMapping(
  text: string,
  type: 'author' | 'category' | 'subcategory' | 'tag',
  language: string
): MappingResult {
  let mappings: Record<string, string> = {};

  switch (type) {
    case 'author':
      mappings = loadMappings('author', language);
      break;
    case 'category':
      mappings = loadMappings('category', language);
      break;
    case 'subcategory':
      mappings = loadMappings('subcategory', language);
      break;
    case 'tag':
      mappings = loadMappings('tag', language);
      break;
  }

  // Check both original text and cleaned version
  const cleanName = text.replace(/[''"]/g, '').trim();
  const mapping = mappings[text] || mappings[cleanName];

  if (mapping) {
    return {
      success: true,
      transliterated: mapping.toLowerCase(),
      source: 'mapping'
    };
  } else {
    return {
      success: false,
      error: `No mapping found for ${type}: "${text}" (${language})`,
      source: 'mapping'
    };
  }
}

/**
 * Create slug from English title
 */
export function createSlugFromTitle(title: string): string {
  if (!title || typeof title !== 'string') {
    throw new Error('Invalid title for slug generation');
  }

  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters except spaces and hyphens
    .replace(/\s+/g, '-')     // Replace spaces with hyphens
    .replace(/-+/g, '-')      // Replace multiple hyphens with single
    .replace(/^-|-$/g, '');   // Remove leading/trailing hyphens

  if (!slug) {
    throw new Error('Slug generation failed - empty result after cleaning');
  }

  return slug;
}

/**
 * Generate full slug: title + author + lang with duplicate detection
 */
export async function generateFullSlug(
  title: string,
  author: string,
  language: string,
  existingSlugs: Set<string> = usedSlugs
): Promise<SlugGenerationResult> {
  // Create title slug
  const titleSlug = createSlugFromTitle(title);

  // Get author mapping
  const authorMapping = getMapping(author, 'author', language);

  if (!authorMapping.success) {
    throw new Error(`Cannot generate slug - ${authorMapping.error}`);
  }

  // Create full slug: title-by-author-lang
  const authorSlug = createSlugFromTitle(authorMapping.transliterated!);
  const fullSlug = `${titleSlug}-by-${authorSlug}-${language.toLowerCase()}`;

  // Check for duplicates
  const isDuplicate = existingSlugs.has(fullSlug);

  if (!isDuplicate) {
    existingSlugs.add(fullSlug);
  }

  return {
    slug: fullSlug,
    isDuplicate,
    conflictingFile: isDuplicate ? 'unknown' : undefined
  };
}

/**
 * MAIN: Mapping-based transliteration without Gemini API
 */
export async function batchTransliterateTexts(
  items: Array<{
    text: string;
    type: 'title' | 'author' | 'category' | 'subcategory' | 'tag' | 'series';
    language: string;
    englishTitle?: string; // For titles, use this for slug generation
    author?: string; // For title+author slug generation
  }>
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  if (items.length === 0) {
    return results;
  }

  console.log(`[INFO] Processing ${items.length} items using mapping-only approach`);

  for (const item of items) {
    let result: string | null = null;

    if (item.type === 'title' || item.type === 'series') {
      if (item.englishTitle && item.author) {
        try {
          const slugResult = await generateFullSlug(item.englishTitle, item.author, item.language);
          if (slugResult.isDuplicate) {
            console.warn(`[WARN] Duplicate slug detected: "${slugResult.slug}"`);
            result = null;
          } else {
            result = slugResult.slug;
            console.log(`[OK] Generated slug: "${item.englishTitle}" + "${item.author}" -> "${result}"`);
          }
        } catch (error) {
          console.error(`[ERROR] Failed to generate slug: ${error}`);
          result = null;
        }
      } else {
        console.warn(`[WARN] Missing title or author for slug generation: "${item.text}"`);
        result = null;
      }
    } else {
      const mappingResult = getMapping(item.text, item.type as 'author' | 'category' | 'subcategory' | 'tag', item.language);

      if (mappingResult.success) {
        result = mappingResult.transliterated!;
        console.log(`[OK] Used ${item.type} mapping: "${item.text}" -> "${result}"`);
      } else {
        console.warn(`[WARN] ${mappingResult.error}`);
        result = null;
      }
    }

    if (result) {
      results.set(item.text, result);
    } else {
      console.warn(`[SKIP] Skipping "${item.text}" - no translation available`);
    }
  }

  console.log(`[INFO] Mapping-based processing completed: ${results.size}/${items.length} items successful`);
  return results;
}

/**
 * Transliteration helpers for author, category, subcategory, tag
 */
export async function transliterateAuthorName(authorName: string, langCode: string = 'hi'): Promise<string> {
  const mappingResult = getMapping(authorName, 'author', langCode);
  if (!mappingResult.success) {
    throw new Error(mappingResult.error);
  }
  return mappingResult.transliterated!;
}

export async function transliterateCategory(categoryName: string, langCode: string = 'hi'): Promise<string> {
  const mappingResult = getMapping(categoryName, 'category', langCode);
  if (!mappingResult.success) {
    throw new Error(mappingResult.error);
  }
  return mappingResult.transliterated!;
}

export async function transliterateSubCategory(subCategoryName: string, langCode: string = 'hi'): Promise<string> {
  const mappingResult = getMapping(subCategoryName, 'subcategory', langCode);
  if (!mappingResult.success) {
    throw new Error(mappingResult.error);
  }
  return mappingResult.transliterated!;
}

export async function transliterateTag(tagName: string, langCode: string = 'hi'): Promise<string> {
  const mappingResult = getMapping(tagName, 'tag', langCode);
  if (!mappingResult.success) {
    throw new Error(mappingResult.error);
  }
  return mappingResult.transliterated!;
}

/**
 * Generate slug from English title (legacy fallback)
 */
export async function generateSlug(englishTitle: string, author?: string, language?: string): Promise<string> {
  if (author && language) {
    const slugResult = await generateFullSlug(englishTitle, author, language);
    return slugResult.slug;
  }
  return createSlugFromTitle(englishTitle);
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
    authors: { ...loadMappings('author', langCode) },
    categories: { ...loadMappings('category', langCode) },
    subcategories: { ...loadMappings('subcategory', langCode) },
    tags: { ...loadMappings('tag', langCode) }
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
 * Clear used slugs tracking
 */
export function clearSlugCache() {
  usedSlugs.clear();
  console.log(`[INFO] Cleared slug duplicate tracking cache`);
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

/**
 * Validate that all required mappings exist
 */
export function validateMappings(
  items: Array<{ text: string; type: string; language: string }>
): { valid: string[]; missing: string[] } {
  const valid: string[] = [];
  const missing: string[] = [];

  for (const item of items) {
    if (item.type === 'title' || item.type === 'series') {
      // Titles are handled via frontmatter, skip validation
      continue;
    }

    const mappingResult = getMapping(
      item.text,
      item.type as 'author' | 'category' | 'subcategory' | 'tag',
      item.language
    );

    if (mappingResult.success) {
      valid.push(`${item.type}:${item.text}`);
    } else {
      missing.push(`${item.type}:${item.text} (${item.language})`);
    }
  }

  return { valid, missing };
}
