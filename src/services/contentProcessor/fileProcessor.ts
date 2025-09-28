// src/services/contentProcessor/fileProcessor.ts

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import { normalizeText, getLanguageName, normalizeFrontmatter } from '../../utils/transliteration';
import { log } from './utils';
import type { Frontmatter, ParsedFile, NormalizedFrontmatter } from './types';

/**
 * Parse a single markdown file with enhanced frontmatter support
 */
export function parseMarkdownFile(filePath: string): ParsedFile | null {
  try {
    const fileContent = readFileSync(filePath, 'utf8');
    const { data: frontmatter, content: markdownContent } = matter(fileContent);
    const rawFrontmatter = frontmatter as Frontmatter;

    // Step 1: Normalize frontmatter (handle alternative field names with priority)
    const normalizedFrontmatter = normalizeFrontmatter(rawFrontmatter);

    // Step 2: Validate required fields
    const missingFields = validateRequiredFields(normalizedFrontmatter);
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    // Step 3: Validate field formats
    const formatErrors = validateFieldFormats(normalizedFrontmatter);
    if (formatErrors.length > 0) {
      throw new Error(`Format validation errors: ${formatErrors.join(', ')}`);
    }

    // Step 4: Validate series-specific business rules
    const seriesErrors = validateSeriesRules(normalizedFrontmatter, filePath);
    if (seriesErrors.length > 0) {
      throw new Error(`Series validation errors: ${seriesErrors.join(', ')}`);
    }

    // Step 5: Process language normalization
    const normalizedLang = normalizeText(normalizedFrontmatter.lang);
    const languageName = getLanguageName(normalizedLang);

    // Step 6: Determine content type information
    const contentTypeInfo = determineContentType(normalizedFrontmatter);

    // Step 7: Log alternative fields usage for debugging
    logFieldUsage(rawFrontmatter, normalizedFrontmatter, filePath);

    return {
      frontmatter: normalizedFrontmatter,
      markdownContent,
      filePath,
      normalizedLang,
      languageName,
      contentType: contentTypeInfo.type,
      isSeriesCover: contentTypeInfo.isSeriesCover,
      isSeriesEpisode: contentTypeInfo.isSeriesEpisode
    };
  } catch (error) {
    log.error(`Failed to parse ${filePath}: ${error}`);
    return null;
  }
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
 * Validate required fields in normalized frontmatter
 */
function validateRequiredFields(fm: NormalizedFrontmatter): string[] {
  const missingFields: string[] = [];

  if (!fm.title) {
    missingFields.push('title (English title required)');
  }
  if (!fm.local_title) {
    missingFields.push('local_title (local language title required - use local_title or localTitle)');
  }
  if (!fm.author) {
    missingFields.push('author');
  }
  if (!fm.category) {
    missingFields.push('category');
  }
  if (!fm.lang) {
    missingFields.push('lang (language code required - use lang or language)');
  }

  return missingFields;
}

/**
 * Validate field formats and types
 */
function validateFieldFormats(fm: NormalizedFrontmatter): string[] {
  const errors: string[] = [];

  // String field validation
  if (typeof fm.title !== 'string' || fm.title.trim() === '') {
    errors.push('title must be a non-empty string');
  }
  if (typeof fm.local_title !== 'string' || fm.local_title.trim() === '') {
    errors.push('local_title must be a non-empty string');
  }
  if (typeof fm.author !== 'string' || fm.author.trim() === '') {
    errors.push('author must be a non-empty string');
  }
  if (typeof fm.category !== 'string' || fm.category.trim() === '') {
    errors.push('category must be a non-empty string');
  }
  if (typeof fm.lang !== 'string' || fm.lang.trim() === '') {
    errors.push('lang must be a non-empty string');
  }

  // Optional field validation
  if (fm.sub_category && (typeof fm.sub_category !== 'string' || fm.sub_category.trim() === '')) {
    errors.push('sub_category must be a non-empty string if provided');
  }

  // series_title validation
  if (fm.series_title && (typeof fm.series_title !== 'string' || fm.series_title.trim() === '')) {
    errors.push('series_title must be a non-empty string if provided');
  }

  // Enum validation
  if (fm.base_type && !['article', 'series'].includes(fm.base_type)) {
    errors.push('base_type must be "article" or "series" if provided');
  }

  if (fm.article_type && !['standard', 'original', 'original_pro'].includes(fm.article_type)) {
    errors.push('article_type must be "standard", "original", or "original_pro" if provided');
  }

  // Number validation
  if (fm.episode !== undefined && (typeof fm.episode !== 'number' || fm.episode <= 0)) {
    errors.push('episode must be a positive number if provided');
  }

  if (fm.words !== undefined && (typeof fm.words !== 'number' || fm.words < 0)) {
    errors.push('words must be a non-negative number if provided');
  }

  // Boolean validation
  if (fm.published !== undefined && typeof fm.published !== 'boolean') {
    errors.push('published must be a boolean if provided');
  }

  if (fm.featured !== undefined && typeof fm.featured !== 'boolean') {
    errors.push('featured must be a boolean if provided');
  }

  if (fm.completed !== undefined && typeof fm.completed !== 'boolean') {
    errors.push('completed must be a boolean if provided');
  }

  return errors;
}

/**
 * Validate series-specific business rules
 */
function validateSeriesRules(fm: NormalizedFrontmatter, filePath: string): string[] {
  const errors: string[] = [];

  // Determine content type
  const isSeriesCoverPage = fm.base_type === 'series';
  const isEpisode = fm.series_title && !isSeriesCoverPage;
  const isStandaloneArticle = !fm.series_title && !isSeriesCoverPage;

  // Series cover page validation
  if (isSeriesCoverPage) {
    if (fm.series_title) {
      errors.push('Series cover pages should not have "series_title" property');
    }
    if (fm.episode) {
      errors.push('Series cover pages should not have "episode" property');
    }
    if (fm.article_type) {
      errors.push('Series cover pages should not have "article_type" property');
    }
    // 'completed' property is allowed and expected for series
  }

  // Episode validation
  if (isEpisode) {
    if (!fm.series_title) {
      errors.push('Episodes must have "series_title" property referencing the series English title');
    }
    if (fm.base_type && fm.base_type !== 'article') {
      errors.push('Episodes should have base_type "article" or no base_type (defaults to article)');
    }
    if (fm.completed !== undefined) {
      errors.push('Episodes should not have "completed" property (only series cover pages)');
    }
    // episode number is optional (will be auto-assigned if missing)
  }

  // Logical validation
  if (fm.base_type === 'series' && fm.series_title) {
    errors.push('Cannot be both series cover (base_type: series) and episode (has series_title)');
  }

  // Log content type identification for debugging
  if (isSeriesCoverPage) {
    log.info(`📗 Series cover: "${fm.title}" → "${fm.local_title}" (${filePath})`);
  } else if (isEpisode) {
    log.info(`📖 Episode: "${fm.title}" → "${fm.local_title}" [series: "${fm.series_title}"${fm.episode ? ` #${fm.episode}` : ''}] (${filePath})`);
  } else if (isStandaloneArticle) {
    log.info(`📄 Article: "${fm.title}" → "${fm.local_title}" (${filePath})`);
  }

  return errors;
}

/**
 * Log which alternative field names were used (for debugging and migration tracking)
 * series_title tracking
 */
function logFieldUsage(raw: Frontmatter, normalized: NormalizedFrontmatter, filePath: string): void {
  const usedFields: string[] = [];

  // Check which alternative fields were used
  if (raw.localTitle && !raw.local_title) {
    usedFields.push('localTitle → local_title');
  }
  if (raw.subCategory && !raw.sub_category) {
    usedFields.push('subCategory → sub_category');
  }
  if (raw.language && !raw.lang) {
    usedFields.push('language → lang');
  }
  if (raw.baseType && !raw.base_type) {
    usedFields.push('baseType → base_type');
  }
  // UPDATED: Track series_title alternatives
  if (raw.seriesTitle && !raw.series_title) {
    usedFields.push('seriesTitle → series_title');
  }
  if (raw.articleType && !raw.article_type) {
    usedFields.push('articleType → article_type');
  }

  if (usedFields.length > 0) {
    log.info(`📝 Alternative fields used in ${filePath}: ${usedFields.join(', ')}`);
  }

  // Check for conflicts (both variants present)
  const conflicts: string[] = [];
  if (raw.local_title && raw.localTitle) {
    conflicts.push(`local_title("${raw.local_title}") vs localTitle("${raw.localTitle}") → using local_title`);
  }
  if (raw.lang && raw.language) {
    conflicts.push(`lang("${raw.lang}") vs language("${raw.language}") → using lang`);
  }
  // UPDATED: Check for series_title conflicts
  if (raw.series_title && raw.seriesTitle) {
    conflicts.push(`series_title("${raw.series_title}") vs seriesTitle("${raw.seriesTitle}") → using series_title`);
  }

  if (conflicts.length > 0) {
    log.warn(`⚠️  Field conflicts in ${filePath}: ${conflicts.join(', ')}`);
  }
}

/**
 * Recursively find all markdown files in a directory
 */
export function findMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    const items = readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = join(dir, item.name);
      if (item.isDirectory()) {
        files.push(...findMarkdownFiles(fullPath));
      } else if (item.isFile() && (item.name.endsWith('.md') || item.name.endsWith('.mdx'))) {
        // Skip template files
        if (!item.name.toLowerCase().includes('template') && !item.name.startsWith('.')) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    log.error(`Error reading directory ${dir}: ${error}`);
  }
  return files;
}

/**
 * Parse multiple markdown files with enhanced reporting
 */
export function parseMarkdownFiles(filePaths: string[]): ParsedFile[] {
  const parsedFiles: ParsedFile[] = [];
  const errors: string[] = [];

  log.info(`Parsing ${filePaths.length} markdown files...`);

  for (const filePath of filePaths) {
    const parsed = parseMarkdownFile(filePath);
    if (parsed) {
      parsedFiles.push(parsed);
    } else {
      errors.push(filePath);
    }
  }

  // Generate content type summary
  const seriesCount = parsedFiles.filter(f => f.contentType === 'series').length;
  const episodeCount = parsedFiles.filter(f => f.contentType === 'episode').length;
  const articleCount = parsedFiles.filter(f => f.contentType === 'article').length;

  // Generate language summary
  const languageCounts = parsedFiles.reduce((acc, f) => {
    acc[f.normalizedLang] = (acc[f.normalizedLang] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Log comprehensive summary
  log.info(`📊 Parsing Summary:`);
  log.info(`   Total files: ${filePaths.length}`);
  log.info(`   Successful: ${parsedFiles.length}`);
  log.info(`   Failed: ${errors.length}`);
  log.info(`   Content types: ${seriesCount} series, ${episodeCount} episodes, ${articleCount} articles`);
  log.info(`   Languages: ${Object.entries(languageCounts).map(([lang, count]) => `${lang}:${count}`).join(', ')}`);

  if (errors.length > 0) {
    log.warn(`⚠️  Files with parsing errors:`);
    errors.forEach(file => log.warn(`   - ${file}`));
  }

  return parsedFiles;
}

/**
 * Validate file path patterns for better organization
 */
export function validateFileOrganization(parsedFiles: ParsedFile[]): void {
  const organizationWarnings: string[] = [];

  for (const file of parsedFiles) {
    const pathParts = file.filePath.split('/');
    const lang = file.normalizedLang;

    // Check if file is in correct language directory
    if (!pathParts.includes(lang)) {
      organizationWarnings.push(`File may be in wrong directory: ${file.filePath} (lang: ${lang})`);
    }

    // Check series organization
    if (file.contentType === 'series' && !pathParts.includes('series')) {
      organizationWarnings.push(`Series cover not in /series/ directory: ${file.filePath}`);
    }

    if (file.contentType === 'episode' && !pathParts.some(part => part.includes('series') || part.includes('episodes'))) {
      organizationWarnings.push(`Episode not in series/episodes directory: ${file.filePath}`);
    }
  }

  if (organizationWarnings.length > 0) {
    log.warn(`📁 File organization suggestions:`);
    organizationWarnings.forEach(warning => log.warn(`   - ${warning}`));
  }
}
