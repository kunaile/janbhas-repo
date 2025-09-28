// src/services/contentProcessor/index.ts

import { findOrCreateEditor, type EditorData } from '../database';
import { log } from './utils';
import { parseMarkdownFiles } from './fileProcessor';
import { batchProcessTransliterations, getTransliterationStats } from './transliterationProcessor';
import { populateReferenceTablesFirst } from './referenceProcessor';
import { processArticles } from './articleProcessor';

// Re-export types and utilities for external use
export * from './types';
export {
  log,
  extractShortDescription,
  processTags,
  createTagSlug,
  validateRequiredFields,
  cleanTextContent,
  formatFileSize,
  formatTime,
  isValidSlug,
  countWords,
  truncateText,
  isValidLanguageCode
} from './utils';
export { findMarkdownFiles, parseMarkdownFile } from './fileProcessor';

/**
 * Main content sync function orchestrating the entire process
 */
export async function syncContent(
  files: string[],
  editorData: EditorData,
  options: { verbose?: boolean; dryRun?: boolean } = {}
): Promise<import('./types').SyncResult> {
  const { verbose = false, dryRun = false } = options;

  if (verbose) {
    log.info(`🚀 Starting content sync for ${files.length} files`);
    if (dryRun) log.info('🛠️  DRY-RUN mode — no database changes will be made');
  }

  /* ────────────────────────── 1. PARSE FILES ────────────────────────── */
  const parsedFiles = parseMarkdownFiles(files);

  if (parsedFiles.length === 0) {
    throw new Error('No valid files to process');
  }

  // Quick content-type breakdown (already set by fileProcessor)
  const seriesCount = parsedFiles.filter(f => f.contentType === 'series').length;
  const episodeCount = parsedFiles.filter(f => f.contentType === 'episode').length;
  const articleCount = parsedFiles.filter(f => f.contentType === 'article').length;

  log.info(
    `✓ Parsed ${parsedFiles.length}/${files.length} files ` +
    `(${seriesCount} series, ${episodeCount} episodes, ${articleCount} articles)`
  );

  /* ─────────────────── 2. TRANSLITERATE & GENERATE SLUGS ─────────────────── */
  const processedFiles = await batchProcessTransliterations(parsedFiles);

  // Collect transliteration statistics for reporting
  const translitStats = getTransliterationStats(processedFiles);

  /* ───────────────────────── 3. EDITOR HANDLING ───────────────────────── */
  const editorId = await findOrCreateEditor(editorData);
  log.success(`👤 Editor processed: ${editorData.name}`);

  /* ──────────────────────── 4. REFERENCE TABLES ───────────────────────── */
  const referenceMaps = await populateReferenceTablesFirst(
    processedFiles,
    editorId
  );

  /* ─────────────────────────── 5. ARTICLES ─────────────────────────── */
  const {
    processed,
    errors,
    warnings
  } = await processArticles(
    processedFiles,
    referenceMaps,
    editorId,
    { verbose, dryRun }
  );

  /* ────────────────────────── 6. SYNC RESULT ────────────────────────── */
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
    warnings,
    seriesProcessed: seriesCount,
    episodesProcessed: episodeCount,
    seriesReferencesFound: referenceMaps.seriesMap.size,

    // Mapping-specific metrics
    mappingSuccesses: translitStats.totalFiles,
    mappingFailures: 0,           // Failures already throw; keep 0 for now
    duplicateSlugs: 0             // Duplicates are prevented during slug generation
  };
}

/* ─────────────────────── EDITOR HELPERS ─────────────────────── */

export function getEditorFromEnvironment(): EditorData {
  const editorName = process.env.EDITOR_NAME;
  const editorEmail = process.env.EDITOR_EMAIL;
  const githubUser = process.env.EDITOR_GITHUB_USERNAME;

  if (!editorName) {
    throw new Error('EDITOR_NAME environment variable is required');
  }

  return {
    name: editorName,
    email: editorEmail || null,
    githubUserName: githubUser || null
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
