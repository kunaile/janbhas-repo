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

/**
 * Language code to human name
 */
const LANGUAGE_NAMES: Record<string, string> = {
  hi: 'Hindi',
  bn: 'Bengali',
  ta: 'Tamil',
  te: 'Telugu',
  ml: 'Malayalam',
  kn: 'Kannada',
  gu: 'Gujarati',
  mr: 'Marathi',
  pa: 'Punjabi',
  or: 'Odia',
  en: 'English',
};

/**
 * Mappings store: keep raw exact keys and a normalized index.
 * Avoid index signatures so we can safely keep a non-string sub-object.
 */
type MappingStore = {
  raw: Record<string, string>;
  norm: Record<string, string>;
};

/**
 * Mapping caches for all types
 */
const mappingCaches = {
  author: new Map<string, MappingStore>(),
  category: new Map<string, MappingStore>(),
  subcategory: new Map<string, MappingStore>(),
  tag: new Map<string, MappingStore>(),
};

/**
 * Global slug tracking for duplicate detection
 */
const usedSlugs = new Set<string>();

/**
 * Normalize frontmatter with priority-based field resolution
 * UPDATED: series_title replaces series_slug
 */
export function normalizeFrontmatter(frontmatter: Frontmatter): NormalizedFrontmatter {
  const normalized: NormalizedFrontmatter = {
    title: frontmatter.title,
    local_title: frontmatter.local_title || (frontmatter as any).localTitle || '',
    author: frontmatter.author,
    category: frontmatter.category,
    lang: frontmatter.lang || (frontmatter as any).language || '',
  };

  // Optional fields with priority resolution
  if ((frontmatter as any).sub_category || (frontmatter as any).subCategory) {
    normalized.sub_category = (frontmatter as any).sub_category || (frontmatter as any).subCategory;
  }

  if ((frontmatter as any).base_type || (frontmatter as any).baseType) {
    normalized.base_type = (frontmatter as any).base_type || (frontmatter as any).baseType;
  }

  // UPDATED: Handle series_title instead of series_slug
  if ((frontmatter as any).series_title || (frontmatter as any).seriesTitle) {
    normalized.series_title = (frontmatter as any).series_title || (frontmatter as any).seriesTitle;
  }

  if ((frontmatter as any).article_type || (frontmatter as any).articleType) {
    normalized.article_type = (frontmatter as any).article_type || (frontmatter as any).articleType;
  }

  // Copy other fields as-is
  normalized.thumbnail = (frontmatter as any).thumbnail;
  normalized.audio = (frontmatter as any).audio;
  normalized.words = (frontmatter as any).words;
  normalized.published = (frontmatter as any).published;
  normalized.featured = (frontmatter as any).featured;
  normalized.tags = (frontmatter as any).tags;
  normalized.episode = (frontmatter as any).episode;
  normalized.completed = (frontmatter as any).completed;

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
    lang: !!frontmatter.lang,
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
    requiredFields,
  };
}

/**
 * Accept both wrapped and flat JSON mapping shapes.
 * - wrapped: { "author_mappings": { "Mark Twain": "..." } }
 * - flat:    { "Mark Twain": "..." }
 */
function asFlatMap(maybe: any, type: 'author' | 'category' | 'subcategory' | 'tag'): Record<string, string> {
  if (maybe && typeof maybe === 'object') {
    const wrapped = maybe[`${type}_mappings`];
    if (wrapped && typeof wrapped === 'object') return wrapped as Record<string, string>;
    return maybe as Record<string, string>;
  }
  return {};
}

/**
 * Build a canonical normalized key for fuzzy-equal lookups.
 */
function normalizeKey(s: string): string {
  return (s ?? '')
    .toString()
    .replace(/['"]/g, '')       // strip quotes
    .replace(/\./g, '')         // remove dots
    .replace(/[-_]/g, ' ')      // treat hyphen/underscore as space
    .replace(/\s+/g, ' ')       // collapse spaces
    .trim()
    .toLowerCase();
}

/**
 * Load English (en) mappings for validation and display; build normalized index.
 */
function loadMappings(type: 'author' | 'category' | 'subcategory' | 'tag'): MappingStore {
  const langCode = 'en'; // force English for validation & mapping lookup
  const cache = mappingCaches[type];

  if (cache.has(langCode)) {
    return cache.get(langCode)!;
  }

  try {
    const mappingFile = join(__dirname, '../data', `${type}-mappings.${langCode}.json`);
    const fileContent = readFileSync(mappingFile, 'utf8');
    const parsed = JSON.parse(fileContent);
    const base = asFlatMap(parsed, type);

    // Build normalized index
    const normIndex: Record<string, string> = {};
    for (const [k, v] of Object.entries(base)) {
      normIndex[normalizeKey(k)] = v;
    }

    const store: MappingStore = { raw: base, norm: normIndex };
    cache.set(langCode, store);
    console.log(`[INFO] Loaded ${Object.keys(base).length} ${type} mappings for ${langCode}`);
    return store;
  } catch (error) {
    console.warn(`[WARN] Could not load ${type} mappings for en: ${error}`);
    const empty: MappingStore = { raw: {}, norm: {} };
    cache.set('en', empty);
    return empty;
  }
}

/**
 * Get mapping using normalized lookup, falling back to exact and quote-trimmed keys.
 * Returns success=false when none found; callers decide fallback behavior.
 */
function getMapping(text: string, type: 'author' | 'category' | 'subcategory' | 'tag'): MappingResult {
  const store = loadMappings(type);

  // 1) exact
  const exact = store.raw[text];
  if (exact) {
    return { success: true, transliterated: exact, source: 'mapping' };
  }

  // 2) quote-trimmed
  const clean = (text ?? '').toString().replace(/['"]/g, '').trim();
  if (clean && store.raw[clean]) {
    return { success: true, transliterated: store.raw[clean], source: 'mapping' };
  }

  // 3) normalized
  const norm = normalizeKey(text);
  const normHit = store.norm[norm];
  if (normHit) {
    return { success: true, transliterated: normHit, source: 'mapping' };
  }

  return {
    success: false,
    error: `No mapping found for ${type}: "${text}" (en)`,
    source: 'fallback',
  };
}

/**
 * Create slug from English text (ASCII-friendly).
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
 * Generate full slug: title + author + lang with duplicate detection.
 * DECISION: Do NOT depend on author mappings; use the original author string.
 */
export async function generateFullSlug(
  title: string,
  author: string,
  language: string,
  existingSlugs: Set<string> = usedSlugs
): Promise<SlugGenerationResult> {
  const titleSlug = createSlugFromTitle(title);
  const authorSlug = createSlugFromTitle(author || 'unknown-author');
  const fullSlug = `${titleSlug}-by-${authorSlug}-${(language || 'en').toLowerCase()}`;

  const isDuplicate = existingSlugs.has(fullSlug);
  if (!isDuplicate) {
    existingSlugs.add(fullSlug);
  }

  return {
    slug: fullSlug,
    isDuplicate,
    conflictingFile: isDuplicate ? 'unknown' : undefined,
  };
}

/**
 * MAIN: Mapping-based transliteration without external APIs.
 * Uses identity fallback on missing mapping to keep pipelines flowing.
 */
export async function batchTransliterateTexts(
  items: {
    text: string;
    type: 'title' | 'author' | 'category' | 'subcategory' | 'tag' | 'series';
    language: string;
    englishTitle?: string;
    author?: string;
  }[]
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
            // Keep the slug but warn, so downstream doesn’t see “missing”
            result = slugResult.slug;
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
      const mappingResult = getMapping(item.text, item.type as 'author' | 'category' | 'subcategory' | 'tag');

      if (mappingResult.success) {
        result = mappingResult.transliterated!;
        console.log(`[OK] Used ${item.type} mapping: "${item.text}" -> "${result}"`);
      } else {
        // Identity fallback to avoid aborting the pipeline
        result = item.text;
        console.warn(`[WARN] ${mappingResult.error} — using identity fallback`);
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
 * Author transliteration with identity fallback.
 */
export async function transliterateAuthorName(authorName: string): Promise<string> {
  const mappingResult = getMapping(authorName, 'author');
  if (!mappingResult.success) {
    console.warn(`[WARN] ${mappingResult.error} — using identity fallback`);
    return authorName;
  }
  return mappingResult.transliterated!;
}

/**
 * Category transliteration with identity fallback.
 */
export async function transliterateCategory(categoryName: string): Promise<string> {
  const mappingResult = getMapping(categoryName, 'category');
  if (!mappingResult.success) {
    console.warn(`[WARN] ${mappingResult.error} — using identity fallback`);
    return categoryName;
  }
  return mappingResult.transliterated!;
}

/**
 * Subcategory transliteration with identity fallback.
 */
export async function transliterateSubCategory(subCategoryName: string): Promise<string> {
  const mappingResult = getMapping(subCategoryName, 'subcategory');
  if (!mappingResult.success) {
    console.warn(`[WARN] ${mappingResult.error} — using identity fallback`);
    return subCategoryName;
  }
  return mappingResult.transliterated!;
}

/**
 * Tag transliteration with identity fallback.
 */
export async function transliterateTag(tagName: string): Promise<string> {
  const mappingResult = getMapping(tagName, 'tag');
  if (!mappingResult.success) {
    console.warn(`[WARN] ${mappingResult.error} — using identity fallback`);
    return tagName;
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
  return LANGUAGE_NAMES[(langCode || '').toLowerCase()] || (langCode || '').toUpperCase();
}

export function getAllMappings(_langCode: string = 'en') {
  // Files are en-only for validation layer; return raw maps
  return {
    authors: { ...loadMappings('author').raw },
    categories: { ...loadMappings('category').raw },
    subcategories: { ...loadMappings('subcategory').raw },
    tags: { ...loadMappings('tag').raw },
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
    (Object.values(mappingCaches) as Array<Map<string, MappingStore>>).forEach((cache) => cache.clear());
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
 * Add new mapping programmatically; maintains normalized index.
 */
export function addMapping(
  type: 'author' | 'category' | 'subcategory' | 'tag',
  original: string,
  transliterated: string
) {
  const langCode = 'en';
  const store = loadMappings(type);
  // Update raw
  store.raw[original] = transliterated;
  // Update normalized
  store.norm[normalizeKey(original)] = transliterated;
  // Persist in cache
  mappingCaches[type].set(langCode, store);
  console.log(`[INFO] Added ${type} mapping: ${original} -> ${transliterated}`);
}

/**
 * Validate that all required mappings exist
 */
export function validateMappings(
  items: Array<{ text: string; type: string }>
): { valid: string[]; missing: string[] } {
  const valid: string[] = [];
  const missing: string[] = [];

  for (const item of items) {
    if (item.type === 'title' || item.type === 'series') {
      // Titles are handled via slug generation, skip validation
      continue;
    }

    const mappingResult = getMapping(item.text, item.type as 'author' | 'category' | 'subcategory' | 'tag');

    if (mappingResult.success) {
      valid.push(`${item.type}:${item.text}`);
    } else {
      missing.push(`${item.type}:${item.text}`);
    }
  }

  return { valid, missing };
}
