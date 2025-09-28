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
Local Content Sync - Usage (Mapping-Based Transliteration):

  pnpm sync:local [options]

Options:
  --all              Process all content files (series, episodes, articles)
  --changed          Process files changed in working directory (git diff)
  --recent           Process files from last commit
  --since=<commit>   Process files changed since specific commit
  --dry-run          Preview changes without writing to database
  --verbose          Show detailed output including series processing
  --help             Show this help message

Examples:
  pnpm sync:local --all --verbose          # Process all content with detailed logs
  pnpm sync:local --changed --dry-run      # Preview changes to modified files
  pnpm sync:local --since=HEAD~5          # Process files changed in last 5 commits
  pnpm sync:local --recent                 # Process files from last commit

Content Types Supported:
  📗 Series covers (base_type: "series")
  📖 Episodes (series_title: "Series English Title")
  📄 Standalone articles
  🔄 Mapping-based transliteration (no external API)
  🏷️  Automatic tag processing

Field Name Support:
  ✅ local_title / localTitle
  ✅ sub_category / subCategory  
  ✅ series_title / seriesTitle
  ✅ article_type / articleType
  ✅ base_type / baseType
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

    log.info('Starting local content sync with mapping-based transliteration');

    // Validate environment variables - REMOVED Gemini API requirement
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
      filesToProcess.forEach(file => console.log(`  - ${file.replace(process.cwd(), '.')}`));
    }

    // Get editor from environment
    const editorData = getEditorFromEnvironment();

    // Sync content with mapping-based approach
    const result = await syncContent(filesToProcess, editorData, {
      verbose: options.verbose,
      dryRun: options.dryRun
    });

    // Summary with series statistics
    console.log('\n' + '='.repeat(60));
    console.log('LOCAL SYNC SUMMARY:');
    console.log('─'.repeat(60));

    // Processing overview
    console.log('📁 PROCESSING OVERVIEW:');
    console.log(`   Total files found: ${result.totalFiles}`);
    console.log(`   Successfully parsed: ${result.parsedFiles}`);
    if (result.parsedFiles < result.totalFiles) {
      console.log(`   ⚠️  Parse failures: ${result.totalFiles - result.parsedFiles}`);
    }

    // Content type breakdown - UPDATED for new structure
    console.log('\n📚 CONTENT BREAKDOWN:');
    if (result.seriesProcessed && result.seriesProcessed > 0) {
      console.log(`   📗 Series covers: ${result.seriesProcessed}`);
    }
    if (result.episodesProcessed && result.episodesProcessed > 0) {
      console.log(`   📖 Series episodes: ${result.episodesProcessed}`);
    }

    // Calculate standalone articles (total - series - episodes)
    const regularArticles = result.articlesProcessed - (result.seriesProcessed || 0) - (result.episodesProcessed || 0);
    if (regularArticles > 0) {
      console.log(`   📄 Standalone articles: ${regularArticles}`);
    }

    console.log(`   📊 Total processed: ${result.articlesProcessed}`);

    // Reference data
    console.log('\n🏷️  REFERENCE DATA:');
    console.log(`   Languages: ${result.languages}`);
    console.log(`   Authors: ${result.authors}`);
    console.log(`   Categories: ${result.categories}`);
    if (result.subCategories > 0) {
      console.log(`   Sub-categories: ${result.subCategories}`);
    }
    console.log(`   Tags: ${result.tags}`);
    if (result.seriesReferencesFound && result.seriesReferencesFound > 0) {
      console.log(`   Series references: ${result.seriesReferencesFound}`);
    }

    // Mapping-specific stats - NEW SECTION
    console.log('\n🔄 MAPPING RESULTS:');
    console.log(`   Files mapped successfully: ${result.mappingSuccesses}`);
    if (result.mappingFailures > 0) {
      console.log(`   ⚠️  Mapping failures: ${result.mappingFailures}`);
    } else {
      console.log(`   ✅ Mapping failures: 0`);
    }
    if (result.duplicateSlugs > 0) {
      console.log(`   ⚠️  Duplicate slugs prevented: ${result.duplicateSlugs}`);
    } else {
      console.log(`   ✅ Slug conflicts: 0`);
    }

    // Status and mode indicators
    console.log('\n⚙️  EXECUTION STATUS:');
    if (options.dryRun) {
      console.log(`   🔍 Mode: DRY RUN (no database changes made)`);
    } else {
      console.log(`   💾 Mode: LIVE (changes written to database)`);
    }

    // Git context - NEW
    if (!options.all) {
      console.log(`   📁 Scope: Changed files ${options.since ? `since ${options.since}` : options.changed ? '(working directory)' : '(recent commits)'}`);
    } else {
      console.log(`   📁 Scope: All content files`);
    }

    if (result.warnings > 0) {
      console.log(`   ⚠️  Warnings: ${result.warnings} (check logs above)`);
      log.warn('Review warning messages above for potential issues');
    } else {
      console.log(`   ✅ Warnings: 0`);
    }

    if (result.errors > 0) {
      console.log(`   ❌ Errors: ${result.errors}`);
      throw new Error(`${result.errors} files failed to process - check logs above for details`);
    } else {
      console.log(`   ✅ Errors: 0`);
    }

    // Series-specific summary - NEW
    if (result.seriesProcessed > 0 || result.episodesProcessed > 0) {
      console.log('\n🎬 SERIES PROCESSING:');
      if (result.seriesProcessed > 0) {
        console.log(`   Series covers processed: ${result.seriesProcessed}`);
      }
      if (result.episodesProcessed > 0) {
        console.log(`   Episodes processed: ${result.episodesProcessed}`);
      }
      if (result.seriesReferencesFound > 0) {
        console.log(`   Series links resolved: ${result.seriesReferencesFound}`);
      }
    }

    console.log('\n' + '─'.repeat(60));
    console.log(`👤 Editor: ${editorData.name}${editorData.email ? ` <${editorData.email}>` : ''}${editorData.githubUserName ? ` (${editorData.githubUserName})` : ''}`);
    console.log(`🔧 Processing: Mapping-based (no external API required)`);
    console.log('='.repeat(60));

    log.success('🎉 Local sync completed successfully');
    process.exit(0);
  } catch (error) {
    log.alert(`❌ Local sync failed: ${error}`);
    console.error('💡 Troubleshooting tips:');
    console.error('   - Ensure mapping files exist: src/data/*-mappings.*.json');
    console.error('   - Check frontmatter field names (series_title, sub_category, etc.)');
    console.error('   - Verify series covers exist before processing episodes');
    console.error('   - Run with --dry-run --verbose for detailed analysis');
    process.exit(1);
  }
}

main();
