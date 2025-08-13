// scripts/github-sync.ts

import { createDbConnection } from '../src/db';
import {
  syncContent,
  getEditorFromCommit,
  log
} from '../src/services/contentProcessor';

function getChangedFilesFromEnvironment(): string[] {
  const changedFiles = process.env.CHANGED_FILES?.trim().split('\n').filter(Boolean) || [];
  const removedFiles = process.env.REMOVED_FILES?.trim().split('\n').filter(Boolean) || [];
  const renamedFiles = process.env.RENAMED_FILES?.trim().split('\n').filter(Boolean) || [];

  // Combine all changes and convert to full paths
  const allFiles = [...changedFiles, ...removedFiles, ...renamedFiles]
    .filter(file => file.trim() && (file.endsWith('.md') || file.endsWith('.mdx')))
    .map(file => file.trim());

  return [...new Set(allFiles)]; // Remove duplicates
}

async function main() {
  try {
    log.info('Starting GitHub Actions content sync');

    // Validate environment variables
    if (!process.env.GOOGLE_GEMINI_API_KEY) {
      throw new Error('GOOGLE_GEMINI_API_KEY not configured in environment');
    }

    if (!process.env.COMMIT_AUTHOR_NAME) {
      throw new Error('COMMIT_AUTHOR_NAME not found in environment');
    }

    await createDbConnection();
    log.success('Database connected');

    // Get changed files from environment
    const changedFiles = getChangedFilesFromEnvironment();

    if (changedFiles.length === 0) {
      log.info('No content files to process');
      process.exit(0);
    }

    log.info(`Processing ${changedFiles.length} changed files`);
    console.log('Changed files:');
    changedFiles.forEach(file => console.log(`  - ${file}`));

    // Get editor from commit info
    const editorData = getEditorFromCommit();

    // Sync content
    const result = await syncContent(changedFiles, editorData, { verbose: true });

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('GITHUB SYNC SUMMARY:');
    console.log(`Files processed: ${result.totalFiles}`);
    console.log(`Articles synced: ${result.articlesProcessed}`);
    console.log(`Editor: ${editorData.name}${editorData.githubUserName ? ` (${editorData.githubUserName})` : ''}`);

    if (result.warnings > 0) {
      log.warn(`${result.warnings} warnings`);
    }

    if (result.errors > 0) {
      throw new Error(`${result.errors} files failed to process`);
    }

    log.success('GitHub sync completed successfully');
    process.exit(0);
  } catch (error) {
    log.alert(`GitHub sync failed: ${error}`);
    process.exit(1);
  }
}

main();
