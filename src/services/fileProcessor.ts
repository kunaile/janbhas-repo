// src/services/fileProcessor.ts

/**
 * File processing service for content analysis
 * Analyzes file paths and provides file system utilities
 * NOTE: Content type detection is primarily done via frontmatter in contentProcessor/fileProcessor.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Detect potential content type from file path (fallback method)
 * Primary content type detection happens in contentProcessor via frontmatter
 */
export function detectContentTypeFromPath(filename: string): 'article' | 'series' | 'episode' | 'unknown' {
  // Series cover pages: content/{lang}/series/{series-slug}/cover.mdx
  if (filename.match(/^content\/[^/]+\/series\/[^/]+\/cover\.mdx?$/)) {
    return 'series';
  }

  // Episodes: content/{lang}/series/{series-slug}/episodes/{episode-slug}.mdx  
  if (filename.match(/^content\/[^/]+\/series\/[^/]+\/episodes\/[^/]+\.mdx?$/)) {
    return 'episode';
  }

  // Regular articles: content/{lang}/{slug}.mdx
  if (filename.match(/^content\/[^/]+\/[^/]+\.mdx?$/)) {
    return 'article';
  }

  return 'unknown';
}

/**
 * Checks if a file is a markdown file we should process
 */
export function isMarkdownFile(filename: string): boolean {
  return filename.startsWith('content/') &&
    (filename.endsWith('.md') || filename.endsWith('.mdx'));
}

/**
 * Extract series information from file path (for path-based organization)
 */
export function extractSeriesInfoFromPath(filename: string): {
  language: string;
  seriesSlug: string;
  episodeSlug?: string;
  isSeriesCover: boolean;
  isEpisode: boolean;
} | null {
  // Parse: content/{lang}/series/{series-slug}/cover.mdx
  const seriesMatch = filename.match(/^content\/([^/]+)\/series\/([^/]+)\/cover\.mdx?$/);
  if (seriesMatch) {
    return {
      language: seriesMatch[1],
      seriesSlug: seriesMatch[2],
      isSeriesCover: true,
      isEpisode: false
    };
  }

  // Parse: content/{lang}/series/{series-slug}/episodes/{episode-slug}.mdx
  const episodeMatch = filename.match(/^content\/([^/]+)\/series\/([^/]+)\/episodes\/([^/]+)\.mdx?$/);
  if (episodeMatch) {
    return {
      language: episodeMatch[1],
      seriesSlug: episodeMatch[2],
      episodeSlug: episodeMatch[3],
      isSeriesCover: false,
      isEpisode: true
    };
  }

  return null;
}

/**
 * Check if a file represents a series cover page (path-based)
 */
export function isSeriesFile(filename: string): boolean {
  const seriesPattern = /^content\/[^/]+\/series\/[^/]+\/cover\.mdx?$/;
  return seriesPattern.test(filename);
}

/**
 * Check if a file is an episode in a series (path-based)
 */
export function isEpisodeFile(filename: string): boolean {
  const episodePattern = /^content\/[^/]+\/series\/[^/]+\/episodes\/[^/]+\.mdx?$/;
  return episodePattern.test(filename);
}

/**
 * Extract language from content file path
 */
export function extractLanguageFromPath(filename: string): string | null {
  const match = filename.match(/^content\/([^/]+)\//);
  return match ? match[1] : null;
}

/**
 * Extract article slug from regular article path
 */
export function extractArticleSlugFromPath(filename: string): string | null {
  // Regular articles: content/{lang}/{slug}.mdx
  const match = filename.match(/^content\/[^/]+\/([^/]+)\.mdx?$/);
  return match ? match[1] : null;
}

/**
 * Reads and validates a markdown file exists and is accessible
 */
export function getMarkdownFileContent(filename: string): string | null {
  try {
    const projectRoot = process.cwd();
    const fullPath = join(projectRoot, filename);
    return readFileSync(fullPath, 'utf8');
  } catch (error) {
    console.error(`❌ Error reading file ${filename}:`, error);
    return null;
  }
}

/**
 * Get all markdown files in content directory recursively
 */
export function getAllMarkdownFiles(): string[] {
  const fs = require('fs');
  const path = require('path');

  const contentDir = join(process.cwd(), 'content');
  const files: string[] = [];

  function walkDir(dir: string, relativePath: string = '') {
    try {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const fullPath = join(dir, item);
        const relativeFilePath = relativePath ? `${relativePath}/${item}` : item;
        const contentPath = `content/${relativeFilePath}`;

        if (fs.statSync(fullPath).isDirectory()) {
          walkDir(fullPath, relativeFilePath);
        } else if (isMarkdownFile(contentPath)) {
          files.push(contentPath);
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not read directory ${dir}:`, error);
    }
  }

  if (fs.existsSync(contentDir)) {
    walkDir(contentDir);
  }

  return files;
}

/**
 * Group files by content type (path-based analysis)
 */
export function groupFilesByPathType(files: string[]): {
  articles: string[];
  series: string[];
  episodes: string[];
  unknown: string[];
} {
  const result = {
    articles: [] as string[],
    series: [] as string[],
    episodes: [] as string[],
    unknown: [] as string[]
  };

  for (const file of files) {
    const contentType = detectContentTypeFromPath(file);
    if (contentType === 'unknown') {
      result.unknown.push(file);
    } else {
      result[`${contentType}s` as keyof typeof result].push(file);
    }
  }

  return result;
}

/**
 * Validate file path structure
 */
export function validateFilePath(filename: string): {
  isValid: boolean;
  contentType: 'article' | 'series' | 'episode' | 'unknown';
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isMarkdownFile(filename)) {
    errors.push('Not a valid markdown file in content directory');
    return { isValid: false, contentType: 'unknown', errors, warnings };
  }

  const contentType = detectContentTypeFromPath(filename);
  const language = extractLanguageFromPath(filename);

  if (!language) {
    errors.push('Could not extract language from file path');
  }

  if (contentType === 'series') {
    if (!filename.endsWith('/cover.mdx') && !filename.endsWith('/cover.md')) {
      errors.push('Series files should be named cover.mdx or cover.md for path-based organization');
    }
  } else if (contentType === 'episode') {
    const seriesInfo = extractSeriesInfoFromPath(filename);
    if (!seriesInfo?.episodeSlug) {
      errors.push('Could not extract episode slug from file path');
    }
  } else if (contentType === 'article') {
    const slug = extractArticleSlugFromPath(filename);
    if (!slug) {
      errors.push('Could not extract article slug from file path');
    }
  } else {
    warnings.push('Unknown file path pattern - will rely on frontmatter for content type detection');
  }

  return {
    isValid: errors.length === 0,
    contentType,
    errors,
    warnings
  };
}

/**
 * Check if your content follows path-based organization
 */
export function analyzeContentOrganization(files: string[]): {
  pathBased: number;
  frontmatterBased: number;
  mixed: boolean;
  recommendation: string;
} {
  const grouped = groupFilesByPathType(files);
  const pathBased = grouped.series.length + grouped.episodes.length;
  const frontmatterBased = grouped.unknown.length;
  const mixed = pathBased > 0 && frontmatterBased > 0;

  let recommendation = '';
  if (mixed) {
    recommendation = 'Mixed organization detected. Consider standardizing on either path-based or frontmatter-based approach.';
  } else if (pathBased > frontmatterBased) {
    recommendation = 'Path-based organization detected. Ensure series covers are in series/{slug}/cover.mdx and episodes in series/{slug}/episodes/{episode}.mdx';
  } else {
    recommendation = 'Frontmatter-based organization detected. Use base_type: "series" and series_title: "..." in frontmatter.';
  }

  return {
    pathBased,
    frontmatterBased,
    mixed,
    recommendation
  };
}
