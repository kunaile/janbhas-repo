// src/services/contentProcessor/fileProcessor.ts

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import { normalizeText, getLanguageName } from '../../utils/transliteration';
import { log } from './utils';
import type { Frontmatter, ParsedFile } from './types';

/**
 * Parse a single markdown file
 */
export function parseMarkdownFile(filePath: string): ParsedFile | null {
  try {
    const fileContent = readFileSync(filePath, 'utf8');
    const { data: frontmatter, content: markdownContent } = matter(fileContent);
    const fm = frontmatter as Frontmatter;

    // Validate required fields
    const missingFields: string[] = [];
    if (!fm.author) missingFields.push('author');
    if (!fm.title) missingFields.push('title');
    if (!fm.lang) missingFields.push('lang');
    if (!fm.category) missingFields.push('category');

    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    const normalizedLang = normalizeText(fm.lang);
    const languageName = getLanguageName(normalizedLang);

    return {
      frontmatter: fm,
      markdownContent,
      filePath,
      normalizedLang,
      languageName
    };
  } catch (error) {
    log.error(`Failed to parse ${filePath}: ${error}`);
    return null;
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
        files.push(fullPath);
      }
    }
  } catch (error) {
    log.error(`Error reading directory ${dir}: ${error}`);
  }
  return files;
}

/**
 * Parse multiple markdown files
 */
export function parseMarkdownFiles(filePaths: string[]): ParsedFile[] {
  const parsedFiles: ParsedFile[] = [];

  for (const filePath of filePaths) {
    const parsed = parseMarkdownFile(filePath);
    if (parsed) {
      parsedFiles.push(parsed);
    }
  }

  return parsedFiles;
}
