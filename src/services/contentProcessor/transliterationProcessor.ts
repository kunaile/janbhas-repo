// src/services/contentProcessor/transliterationProcessor.ts

import { batchTransliterateTexts } from '../../utils/transliteration';
import { log, processTags, generateSlug } from './utils';
import type { ParsedFile, ProcessedMetadata } from './types';

/**
 * Batch process all transliterations using Gemini API
 */
export async function batchProcessTransliterations(
  parsedFiles: ParsedFile[]
): Promise<ProcessedMetadata[]> {
  log.info('Starting batch transliteration with Gemini API');

  const items: Array<{
    text: string;
    type: 'title' | 'author' | 'category' | 'subcategory' | 'tag';
    language: string
  }> = [];

  // Collect all texts for batch processing
  for (const file of parsedFiles) {
    items.push(
      { text: file.frontmatter.title, type: 'title', language: file.normalizedLang },
      { text: file.frontmatter.author, type: 'author', language: file.normalizedLang },
      { text: file.frontmatter.category, type: 'category', language: file.normalizedLang }
    );

    // Add sub-category for transliteration if it exists
    if (file.frontmatter['sub-category']) {
      items.push({
        text: file.frontmatter['sub-category'],
        type: 'subcategory',
        language: file.normalizedLang
      });
    }

    // Add tags for transliteration if they exist
    const tags = processTags(file.frontmatter.tags);
    for (const tag of tags) {
      items.push({
        text: tag,
        type: 'tag',
        language: file.normalizedLang
      });
    }
  }

  // Process all transliterations in one batch
  const results = await batchTransliterateTexts(items);

  // Apply results back to files
  const processedFiles: ProcessedMetadata[] = [];
  for (const file of parsedFiles) {
    const transliteratedTitle = results.get(file.frontmatter.title);
    const transliteratedAuthor = results.get(file.frontmatter.author);
    const transliteratedCategory = results.get(file.frontmatter.category);
    const transliteratedSubCategory = file.frontmatter['sub-category']
      ? results.get(file.frontmatter['sub-category'])
      : undefined;

    // Process transliterated tags
    const originalTags = processTags(file.frontmatter.tags);
    const transliteratedTags: string[] = [];
    for (const tag of originalTags) {
      const transliteratedTag = results.get(tag);
      if (transliteratedTag) {
        transliteratedTags.push(transliteratedTag);
      }
    }

    if (!transliteratedTitle || !transliteratedAuthor || !transliteratedCategory) {
      throw new Error(`Transliteration incomplete for ${file.filePath}`);
    }

    // Generate slug
    const slug = generateSlug(transliteratedTitle, transliteratedAuthor);

    processedFiles.push({
      ...file,
      transliteratedAuthor,
      transliteratedTitle,
      transliteratedCategory,
      transliteratedSubCategory,
      transliteratedTags,
      slug
    });
  }

  log.success(`Batch transliteration completed for ${processedFiles.length} files`);
  return processedFiles;
}
