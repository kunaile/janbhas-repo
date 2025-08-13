// scripts/manual-sync.ts

import { join } from 'path';
import { createDbConnection } from '../src/db';
import {
  syncContent,
  findMarkdownFiles,
  getEditorFromEnvironment,
  log
} from '../src/services/contentProcessor';

async function main() {
  try {
    log.info('Starting manual content sync with Gemini API transliteration');

    // Validate environment variables
    if (!process.env.GOOGLE_GEMINI_API_KEY) {
      throw new Error('GOOGLE_GEMINI_API_KEY not configured in environment');
    }

    if (!process.env.EDITOR_NAME) {
      throw new Error('EDITOR_NAME not configured in environment');
    }

    await createDbConnection();
    log.success('Database connected');

    // Get all markdown files
    const contentDir = join(process.cwd(), 'content');
    const markdownFiles = findMarkdownFiles(contentDir);
    log.info(`Found ${markdownFiles.length} markdown files`);

    if (markdownFiles.length === 0) {
      throw new Error('No markdown files found in content directory');
    }

    // Get editor from environment
    const editorData = getEditorFromEnvironment();

    // Sync all content
    const result = await syncContent(markdownFiles, editorData, { verbose: true });

    // Final summary
    console.log('\n' + '='.repeat(50));
    console.log('SYNC SUMMARY:');
    console.log(`Total files found: ${result.totalFiles}`);
    console.log(`Valid files parsed: ${result.parsedFiles}`);
    console.log(`Languages uploaded: ${result.languages}`);
    console.log(`Authors uploaded: ${result.authors}`);
    console.log(`Categories uploaded: ${result.categories}`);
    console.log(`Sub-categories uploaded: ${result.subCategories}`);
    console.log(`Articles uploaded: ${result.articlesProcessed}`);

    if (result.warnings > 0) {
      log.warn(`${result.warnings} warnings (missing/invalid fields)`);
    }

    if (result.errors > 0) {
      throw new Error(`${result.errors} articles failed to process`);
    }

    log.success('All files processed successfully');
    process.exit(0);
  } catch (error) {
    log.alert(`Manual sync failed: ${error}`);
    process.exit(1);
  }
}

main();
