// src/services/contentProcessor/index.ts

import { findOrCreateEditor, type EditorData } from '../database';
import { log } from './utils';
import { findMarkdownFiles, parseMarkdownFiles } from './fileProcessor';
import { batchProcessTransliterations } from './transliterationProcessor';
import { populateReferenceTablesFirst } from './referenceProcessor';
import { processArticles } from './articleProcessor';

// Re-export types and utilities for external use
export * from './types';
export { log, extractShortDescription, parseDuration, processTags } from './utils';
export { findMarkdownFiles, parseMarkdownFile } from './fileProcessor';

/**
 * Main content sync function that orchestrates the entire process
 */
export async function syncContent(
  files: string[],
  editorData: EditorData,
  options: { verbose?: boolean; dryRun?: boolean } = {}
): Promise<import('./types').SyncResult> {
  const { verbose = false, dryRun = false } = options;

  if (verbose) {
    log.info(`Starting content sync for ${files.length} files`);
    if (dryRun) log.info('DRY RUN MODE - No database changes will be made');
  }

  // Step 1: Parse markdown files
  const parsedFiles = parseMarkdownFiles(files);

  if (parsedFiles.length === 0) {
    throw new Error('No valid files to process');
  }

  log.info(`Successfully parsed ${parsedFiles.length}/${files.length} files`);

  // Step 2: Batch process transliterations
  const processedFiles = await batchProcessTransliterations(parsedFiles);

  // Step 3: Create or find editor
  const editorId = await findOrCreateEditor(editorData);
  log.success(`Editor processed: ${editorData.name}`);

  // Step 4: Populate reference tables
  const referenceMaps = await populateReferenceTablesFirst(processedFiles, editorId);

  // Step 5: Process articles
  const { processed, errors, warnings } = await processArticles(
    processedFiles,
    referenceMaps,
    editorId,
    { verbose, dryRun }
  );

  return {
    totalFiles: files.length,
    parsedFiles: parsedFiles.length,
    languages: referenceMaps.languageMap.size,
    authors: referenceMaps.authorMap.size,
    categories: referenceMaps.categoryMap.size,
    subCategories: referenceMaps.subCategoryMap.size,
    tags: referenceMaps.tagMap.size,
    articlesProcessed: processed,
    errors,
    warnings
  };
}

/**
 * Get editor information from environment variables
 */
export function getEditorFromEnvironment(): EditorData {
  const editorName = process.env.EDITOR_NAME;
  const editorEmail = process.env.EDITOR_EMAIL;
  const editorGithubUsername = process.env.EDITOR_GITHUB_USERNAME;

  if (!editorName) {
    throw new Error('EDITOR_NAME environment variable is required');
  }

  return {
    name: editorName,
    email: editorEmail || null,
    githubUserName: editorGithubUsername || null
  };
}

/**
 * Get editor information from Git commit
 */
export function getEditorFromCommit(): EditorData {
  const commitAuthor = process.env.COMMIT_AUTHOR_NAME;
  const commitUsername = process.env.COMMIT_AUTHOR_USERNAME;

  if (!commitAuthor) {
    throw new Error('COMMIT_AUTHOR_NAME not found in environment');
  }

  return {
    name: commitAuthor,
    githubUserName: commitUsername || null
  };
}
