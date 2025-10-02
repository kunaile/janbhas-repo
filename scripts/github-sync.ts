// scripts/github-sync.ts

import { join } from 'path';
import { createDbConnection } from '../src/db';
import {
  syncContent,
  getEditorFromCommit,
  log
} from '../src/services/contentProcessor';
import { setRefCreationPolicy } from '../src/services/database';

function getChangedFilesFromEnvironment(): string[] {
  const changedFiles = process.env.CHANGED_FILES?.trim().split('\n').filter(Boolean) || [];
  const removedFiles = process.env.REMOVED_FILES?.trim().split('\n').filter(Boolean) || [];
  const renamedFiles = process.env.RENAMED_FILES?.trim().split('\n').filter(Boolean) || [];

  // Combine all changes and convert to full paths
  const allFiles = [...changedFiles, ...removedFiles, ...renamedFiles]
    .filter(file => {
      const trimmed = file.trim();
      return trimmed &&
        trimmed.startsWith('content/') &&
        (trimmed.endsWith('.md') || trimmed.endsWith('.mdx'));
    })
    .map(file => join(process.cwd(), file.trim()));

  return [...new Set(allFiles)]; // Remove duplicates
}

function logGitHubActionsOutput(key: string, value: string | number) {
  // GitHub Actions output format
  console.log(`::set-output name=${key}::${value}`);
}

async function main() {
  try {
    log.info('Starting GitHub Actions content sync with mapping-based transliteration');

    // Validate environment variables - REMOVED Gemini API requirement
    if (!process.env.COMMIT_AUTHOR_NAME) {
      throw new Error('COMMIT_AUTHOR_NAME not found in environment');
    }

    // Log GitHub Actions context
    console.log('🔧 GitHub Actions Context:');
    console.log(`   Repository: ${process.env.GITHUB_REPOSITORY || 'unknown'}`);
    console.log(`   Ref: ${process.env.GITHUB_REF || 'unknown'}`);
    console.log(`   SHA: ${process.env.GITHUB_SHA?.substring(0, 8) || 'unknown'}`);
    console.log(`   Event: ${process.env.GITHUB_EVENT_NAME || 'unknown'}`);

    await createDbConnection();
    log.success('Database connected');

    // For CI: never create refs from content
    setRefCreationPolicy('forbid');

    // Get changed files from environment
    const changedFiles = getChangedFilesFromEnvironment();

    if (changedFiles.length === 0) {
      log.info('No content files to process');
      logGitHubActionsOutput('files_processed', '0');
      logGitHubActionsOutput('content_updated', 'false');
      process.exit(0);
    }

    log.info(`Processing ${changedFiles.length} changed files`);
    console.log('Changed files:');
    changedFiles.forEach(file => console.log(`  - ${file.replace(process.cwd(), '.')}`));

    // Get editor from commit info
    const editorData = getEditorFromCommit();

    // Sync content with mapping-based approach
    const result = await syncContent(changedFiles, editorData, { verbose: true });

    // Enhanced summary for GitHub Actions
    console.log('\n' + '='.repeat(60));
    console.log('GITHUB ACTIONS SYNC SUMMARY:');
    console.log('─'.repeat(60));

    // Processing overview
    console.log('📁 PROCESSING OVERVIEW:');
    console.log(`   Files processed: ${result.totalFiles}`);
    console.log(`   Successfully parsed: ${result.parsedFiles}`);
    if (result.parsedFiles < result.totalFiles) {
      console.log(`   ⚠️  Parse failures: ${result.totalFiles - result.parsedFiles}`);
    }

    // Content type breakdown
    console.log('\n📚 CONTENT BREAKDOWN:');
    let contentSummary: string[] = [];
    if (result.seriesProcessed && result.seriesProcessed > 0) {
      console.log(`   📗 Series covers: ${result.seriesProcessed}`);
      contentSummary.push(`${result.seriesProcessed} series`);
    }
    if (result.episodesProcessed && result.episodesProcessed > 0) {
      console.log(`   📖 Series episodes: ${result.episodesProcessed}`);
      contentSummary.push(`${result.episodesProcessed} episodes`);
    }

    const regularArticles = result.articlesProcessed - (result.seriesProcessed || 0) - (result.episodesProcessed || 0);
    if (regularArticles > 0) {
      console.log(`   📄 Standalone articles: ${regularArticles}`);
      contentSummary.push(`${regularArticles} articles`);
    }

    console.log(`   📊 Total content items: ${result.articlesProcessed}`);

    // Reference data statistics
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

    // Mapping results - NEW SECTION
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

    // Status summary
    console.log('\n📊 EXECUTION STATUS:');
    console.log(`   💾 Mode: LIVE (changes written to database)`);
    console.log(`   🔧 Processing: Mapping-based (no external API)`);

    if (result.warnings > 0) {
      console.log(`   ⚠️  Warnings: ${result.warnings} (check logs above)`);
      log.warn(`${result.warnings} warnings - check logs above for details`);
    } else {
      console.log(`   ✅ Warnings: 0`);
    }

    if (result.errors > 0) {
      console.log(`   ❌ Errors: ${result.errors}`);
      throw new Error(`${result.errors} files failed to process - check logs above for details`);
    } else {
      console.log(`   ✅ Errors: 0`);
    }

    // GitHub Actions specific outputs
    console.log('\n' + '─'.repeat(60));
    console.log(`👤 Editor: ${editorData.name}${editorData.githubUserName ? ` (@${editorData.githubUserName})` : ''}`);
    console.log(`📦 Content: ${contentSummary.join(', ')}`);
    console.log('='.repeat(60));

    // Set GitHub Actions outputs for workflow usage
    logGitHubActionsOutput('files_processed', result.totalFiles.toString());
    logGitHubActionsOutput('content_updated', 'true');
    logGitHubActionsOutput('articles_processed', result.articlesProcessed.toString());
    logGitHubActionsOutput('series_processed', (result.seriesProcessed || 0).toString());
    logGitHubActionsOutput('episodes_processed', (result.episodesProcessed || 0).toString());
    logGitHubActionsOutput('warnings', result.warnings.toString());
    logGitHubActionsOutput('errors', result.errors.toString());
    logGitHubActionsOutput('success', (result.errors === 0).toString());

    log.success('🎉 GitHub Actions sync completed successfully');
    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.alert(`❌ GitHub Actions sync failed: ${errorMessage}`);

    // Set failure outputs for GitHub Actions
    logGitHubActionsOutput('content_updated', 'false');
    logGitHubActionsOutput('success', 'false');
    logGitHubActionsOutput('error_message', errorMessage);

    console.error('💡 Troubleshooting tips for CI/CD:');
    console.error('   - Ensure mapping files are committed: src/data/*-mappings.*.json');
    console.error('   - Check that COMMIT_AUTHOR_NAME is set correctly');
    console.error('   - Verify series covers exist before episodes in the same commit');
    console.error('   - Review frontmatter field names (series_title, sub_category, etc.)');

    process.exit(1);
  }
}

main();
