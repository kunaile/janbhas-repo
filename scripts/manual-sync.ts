// scripts/manual-sync.ts

import { join } from 'path';
import { createDbConnection } from '../src/db';
import {
  syncContent,
  findMarkdownFiles,
  getEditorFromEnvironment,
  log
} from '../src/services/contentProcessor';
import { setRefCreationPolicy } from '../src/services/database';

async function main() {
  try {
    log.info('Starting manual content sync with mapping-based transliteration');

    // Validate environment variables - REMOVED Gemini API requirement
    if (!process.env.EDITOR_NAME) {
      throw new Error('EDITOR_NAME not configured in environment');
    }

    await createDbConnection();
    log.success('Database connected');

    // For manual syncs: do not create refs from content; fail only offending files
    setRefCreationPolicy('forbid');

    // Get all markdown files
    const contentDir = join(process.cwd(), 'content');
    const markdownFiles = findMarkdownFiles(contentDir);
    log.info(`Found ${markdownFiles.length} markdown files`);

    if (markdownFiles.length === 0) {
      throw new Error('No markdown files found in content directory');
    }

    // Get editor from environment
    const editorData = getEditorFromEnvironment();

    // Sync all content with mapping-based approach
    const result = await syncContent(markdownFiles, editorData, { verbose: true });

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('MANUAL SYNC SUMMARY:');
    console.log('─'.repeat(60));

    // File processing stats
    console.log('📁 FILE PROCESSING:');
    console.log(`   Total files found: ${result.totalFiles}`);
    console.log(`   Valid files parsed: ${result.parsedFiles}`);
    console.log(`   Parse success rate: ${Math.round((result.parsedFiles / result.totalFiles) * 100)}%`);

    // Content type breakdown - UPDATED for new structure
    console.log('\n📚 CONTENT PROCESSED:');
    if (result.seriesProcessed && result.seriesProcessed > 0) {
      console.log(`   Series covers: ${result.seriesProcessed}`);
    }
    if (result.episodesProcessed && result.episodesProcessed > 0) {
      console.log(`   Series episodes: ${result.episodesProcessed}`);
    }

    // Calculate regular articles (total - series - episodes)
    const regularArticles = result.articlesProcessed - (result.seriesProcessed || 0) - (result.episodesProcessed || 0);
    if (regularArticles > 0) {
      console.log(`   Standalone articles: ${regularArticles}`);
    }

    console.log(`   Total content items: ${result.articlesProcessed}`);

    // Reference data stats
    console.log('\n🏷️  REFERENCE DATA:');
    console.log(`   Languages processed: ${result.languages}`);
    console.log(`   Authors processed: ${result.authors}`);
    console.log(`   Categories processed: ${result.categories}`);
    console.log(`   Sub-categories processed: ${result.subCategories}`);
    console.log(`   Tags processed: ${result.tags}`);

    if (result.seriesReferencesFound && result.seriesReferencesFound > 0) {
      console.log(`   Series references resolved: ${result.seriesReferencesFound}`);
    }

    // Mapping-specific stats - UPDATED
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

    // Status indicators
    console.log('\n📊 PROCESSING STATUS:');
    if (result.warnings > 0) {
      console.log(`   ⚠️  Warnings: ${result.warnings} (missing/invalid fields)`);
      log.warn('Check the logs above for warning details');
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
      console.log('\n🎬 SERIES SUMMARY:');
      console.log(`   Series covers processed: ${result.seriesProcessed || 0}`);
      console.log(`   Series episodes processed: ${result.episodesProcessed || 0}`);
      if (result.seriesReferencesFound > 0) {
        console.log(`   Series references resolved: ${result.seriesReferencesFound}`);
      }
    }

    console.log('\n' + '─'.repeat(60));
    console.log(`👤 Processed by: ${editorData.name}${editorData.email ? ` <${editorData.email}>` : ''}${editorData.githubUserName ? ` (${editorData.githubUserName})` : ''}`);
    console.log(`🔧 Processing mode: Mapping-based (no external API)`);
    console.log('='.repeat(60));

    log.success('🎉 All files processed successfully with mapping-based transliteration');
    process.exit(0);
  } catch (error) {
    log.alert(`❌ Manual sync failed: ${error}`);
    console.error('💡 Troubleshooting tips:');
    console.error('   - Ensure mapping files exist in src/data/');
    console.error('   - Check that all authors/categories/tags have mappings');
    console.error('   - Verify series covers are processed before episodes');
    console.error('   - Check frontmatter field names (series_title, sub_category, etc.)');
    process.exit(1);
  }
}

main();
