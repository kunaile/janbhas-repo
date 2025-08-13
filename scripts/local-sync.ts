// scripts/local-sync.ts

import { join } from 'path';
import { execSync } from 'child_process';
import { createDbConnection } from '../src/db';
import {
  syncContent,
  findMarkdownFiles,
  getEditorFromEnvironment,
  log
} from '../src/services/contentProcessor';

// Parse command line arguments
function parseArgs(): {
  all: boolean;
  changed: boolean;
  recent: boolean;
  since?: string;
  dryRun: boolean;
  verbose: boolean;
  help: boolean;
} {
  const args = process.argv.slice(2);
  return {
    all: args.includes('--all'),
    changed: args.includes('--changed'),
    recent: args.includes('--recent'),
    since: args.find(arg => arg.startsWith('--since='))?.split('=')[1],
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose'),
    help: args.includes('--help')
  };
}

function showHelp() {
  console.log(`
Local Content Sync - Usage:

  pnpm sync:local [options]

Options:
  --all              Process all content files
  --changed          Process files changed in working directory (git diff)
  --recent           Process files from last commit
  --since=<commit>   Process files changed since specific commit
  --dry-run          Preview changes without writing to database
  --verbose          Show detailed output
  --help             Show this help message

Examples:
  pnpm sync:local --all --verbose
  pnpm sync:local --changed --dry-run
  pnpm sync:local --since=HEAD~5
  pnpm sync:local --recent
  `);
}

function getChangedFiles(options: ReturnType<typeof parseArgs>): string[] {
  const contentDir = join(process.cwd(), 'content');

  try {
    let gitCommand: string;

    if (options.all) {
      return findMarkdownFiles(contentDir);
    } else if (options.changed) {
      gitCommand = 'git diff --name-only';
    } else if (options.recent) {
      gitCommand = 'git diff --name-only HEAD~1 HEAD';
    } else if (options.since) {
      gitCommand = `git diff --name-only ${options.since} HEAD`;
    } else {
      // Default to recent changes
      gitCommand = 'git diff --name-only HEAD~1 HEAD';
    }

    const output = execSync(gitCommand, { encoding: 'utf-8' }).trim();
    if (!output) return [];

    // Filter for markdown files in content directory
    const changedFiles = output
      .split('\n')
      .filter(file => file.startsWith('content/') && (file.endsWith('.md') || file.endsWith('.mdx')))
      .map(file => join(process.cwd(), file));

    return changedFiles;
  } catch (error) {
    log.error(`Failed to get changed files: ${error}`);
    return [];
  }
}

async function main() {
  try {
    const options = parseArgs();

    if (options.help) {
      showHelp();
      process.exit(0);
    }

    log.info('Starting local content sync');

    // Validate environment variables
    if (!process.env.GOOGLE_GEMINI_API_KEY) {
      throw new Error('GOOGLE_GEMINI_API_KEY not configured in environment');
    }

    if (!process.env.EDITOR_NAME) {
      throw new Error('EDITOR_NAME not configured in environment');
    }

    await createDbConnection();
    log.success('Database connected');

    // Get files to process
    const filesToProcess = getChangedFiles(options);

    if (filesToProcess.length === 0) {
      log.info('No files to process');
      process.exit(0);
    }

    log.info(`Found ${filesToProcess.length} files to process`);

    if (options.verbose) {
      console.log('Files to process:');
      filesToProcess.forEach(file => console.log(`  - ${file}`));
    }

    // Get editor from environment
    const editorData = getEditorFromEnvironment();

    // Sync content
    const result = await syncContent(filesToProcess, editorData, {
      verbose: options.verbose,
      dryRun: options.dryRun
    });

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('LOCAL SYNC SUMMARY:');
    console.log(`Total files processed: ${result.totalFiles}`);
    console.log(`Valid files parsed: ${result.parsedFiles}`);
    console.log(`Articles processed: ${result.articlesProcessed}`);

    if (result.warnings > 0) {
      log.warn(`${result.warnings} warnings`);
    }

    if (result.errors > 0) {
      throw new Error(`${result.errors} files failed to process`);
    }

    log.success('Local sync completed successfully');
    process.exit(0);
  } catch (error) {
    log.alert(`Local sync failed: ${error}`);
    process.exit(1);
  }
}

main();
