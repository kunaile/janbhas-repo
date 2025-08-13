// scripts/db-health.ts

import { createDbConnection, getDb } from '../src/db';
import { articles, authors, categories, editors, languages, subCategories, tags } from '../src/db/schema';
import { sql, count, isNull } from 'drizzle-orm';

const log = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  success: (msg: string) => console.log(`[OK] ${msg}`),
  error: (msg: string) => console.log(`[ERROR] ${msg}`),
  warn: (msg: string) => console.log(`[WARN] ${msg}`)
};

async function checkDatabaseHealth() {
  try {
    log.info('Running database health check...');

    await createDbConnection();
    const db = getDb();

    // Basic connection test
    const startTime = Date.now();
    await db.execute(sql`SELECT 1`);
    const responseTime = Date.now() - startTime;

    console.log('\n=== DATABASE HEALTH REPORT ===\n');

    // Connection health
    console.log('🔗 Connection Health:');
    console.log(`  ✓ Response time: ${responseTime}ms`);
    console.log(`  ✓ Status: ${responseTime < 1000 ? 'Healthy' : 'Slow'}`);

    // Table counts
    console.log('\n📊 Table Statistics:');

    const [languageCount] = await db.select({ count: count() }).from(languages).where(isNull(languages.deletedAt));
    const [authorCount] = await db.select({ count: count() }).from(authors).where(isNull(authors.deletedAt));
    const [categoryCount] = await db.select({ count: count() }).from(categories).where(isNull(categories.deletedAt));
    const [subCategoryCount] = await db.select({ count: count() }).from(subCategories).where(isNull(subCategories.deletedAt));
    const [tagCount] = await db.select({ count: count() }).from(tags).where(isNull(tags.deletedAt));
    const [editorCount] = await db.select({ count: count() }).from(editors).where(isNull(editors.deletedAt));
    const [articleCount] = await db.select({ count: count() }).from(articles).where(isNull(articles.deletedAt));
    const [publishedCount] = await db.select({ count: count() }).from(articles)
      .where(sql`deleted_at IS NULL AND is_published = true`);
    const [featuredCount] = await db.select({ count: count() }).from(articles)
      .where(sql`deleted_at IS NULL AND is_featured = true`);

    console.log(`  • Languages: ${languageCount.count}`);
    console.log(`  • Authors: ${authorCount.count}`);
    console.log(`  • Categories: ${categoryCount.count}`);
    console.log(`  • Sub-categories: ${subCategoryCount.count}`);
    console.log(`  • Tags: ${tagCount.count}`);
    console.log(`  • Editors: ${editorCount.count}`);
    console.log(`  • Total Articles: ${articleCount.count}`);
    console.log(`  • Published Articles: ${publishedCount.count}`);
    console.log(`  • Featured Articles: ${featuredCount.count}`);
    console.log(`  • Draft Articles: ${articleCount.count - publishedCount.count}`);

    // Data integrity checks
    console.log('\n🔍 Data Integrity:');

    // Check for orphaned articles
    const orphanedResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM articles a
      WHERE a.deleted_at IS NULL 
      AND (
        a.language_id NOT IN (SELECT id FROM languages WHERE deleted_at IS NULL) OR
        a.author_id NOT IN (SELECT id FROM authors WHERE deleted_at IS NULL) OR
        a.editor_id NOT IN (SELECT id FROM editors WHERE deleted_at IS NULL)
      )
    `);
    const orphanedArticles = orphanedResult.rows;

    const orphanCount = (orphanedArticles[0] as any).count;
    if (orphanCount > 0) {
      log.warn(`Found ${orphanCount} orphaned articles with invalid references`);
    } else {
      console.log('  ✓ No orphaned articles found');
    }

    // Check for duplicate slugs
    const duplicateResult = await db.execute(sql`
      SELECT slug, COUNT(*) as count 
      FROM articles 
      WHERE deleted_at IS NULL 
      GROUP BY slug 
      HAVING COUNT(*) > 1
    `);
    const duplicateSlugs = duplicateResult.rows;

    if (duplicateSlugs.length > 0) {
      log.warn(`Found ${duplicateSlugs.length} duplicate slugs`);
    } else {
      console.log('  ✓ No duplicate slugs found');
    }

    // Check for featured articles that aren't published
    const featuredUnpublishedResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM articles
      WHERE deleted_at IS NULL 
      AND is_featured = true 
      AND is_published = false
    `);

    const featuredUnpublishedCount = (featuredUnpublishedResult.rows[0] as any).count;
    if (featuredUnpublishedCount > 0) {
      log.warn(`Found ${featuredUnpublishedCount} featured articles that are not published`);
    } else {
      console.log('  ✓ All featured articles are published');
    }

    // Check for articles without proper metadata
    const metadataResult = await db.execute(sql`
      SELECT 
        COUNT(CASE WHEN word_count IS NULL OR word_count = 0 THEN 1 END) as missing_word_count,
        COUNT(CASE WHEN published_date IS NULL THEN 1 END) as missing_dates,
        COUNT(CASE WHEN short_description IS NULL OR short_description = '' THEN 1 END) as missing_descriptions
      FROM articles 
      WHERE deleted_at IS NULL
    `);

    const metadata = metadataResult.rows[0] as any;
    if (metadata?.missing_word_count > 0) {
      log.warn(`${metadata.missing_word_count} articles missing word count`);
    }
    if (metadata?.missing_dates > 0) {
      log.warn(`${metadata.missing_dates} articles missing publication dates`);
    }
    if (metadata?.missing_descriptions > 0) {
      log.warn(`${metadata.missing_descriptions} articles missing descriptions`);
    }

    if (!metadata?.missing_word_count && !metadata?.missing_dates && !metadata?.missing_descriptions) {
      console.log('  ✓ All articles have complete metadata');
    }

    // Check for empty categories/subcategories
    const emptyReferencesResult = await db.execute(sql`
      SELECT 
        (SELECT COUNT(*) FROM categories c WHERE c.deleted_at IS NULL AND c.id NOT IN (SELECT DISTINCT category_id FROM articles WHERE deleted_at IS NULL AND category_id IS NOT NULL)) as empty_categories,
        (SELECT COUNT(*) FROM sub_categories sc WHERE sc.deleted_at IS NULL AND sc.id NOT IN (SELECT DISTINCT sub_category_id FROM articles WHERE deleted_at IS NULL AND sub_category_id IS NOT NULL)) as empty_subcategories,
        (SELECT COUNT(*) FROM tags t WHERE t.deleted_at IS NULL AND t.id NOT IN (SELECT DISTINCT tag_id FROM article_tags at JOIN articles a ON at.article_id = a.id WHERE a.deleted_at IS NULL)) as unused_tags
    `);

    const emptyRefs = emptyReferencesResult.rows[0] as any;
    if (emptyRefs?.empty_categories > 0) {
      log.warn(`${emptyRefs.empty_categories} categories have no articles`);
    }
    if (emptyRefs?.empty_subcategories > 0) {
      log.warn(`${emptyRefs.empty_subcategories} sub-categories have no articles`);
    }
    if (emptyRefs?.unused_tags > 0) {
      log.warn(`${emptyRefs.unused_tags} tags are not used by any articles`);
    }

    // Storage usage
    console.log('\n💾 Storage Statistics:');
    const storageResult = await db.execute(sql`
      SELECT 
        pg_size_pretty(pg_total_relation_size('articles')) as articles_size,
        pg_size_pretty(pg_total_relation_size('authors')) as authors_size,
        pg_size_pretty(pg_total_relation_size('categories')) as categories_size,
        pg_size_pretty(pg_database_size(current_database())) as total_size
    `);
    const storageInfo = storageResult.rows;

    const storage = storageInfo[0] as any;
    console.log(`  • Articles table size: ${storage.articles_size}`);
    console.log(`  • Authors table size: ${storage.authors_size}`);
    console.log(`  • Categories table size: ${storage.categories_size}`);
    console.log(`  • Total database size: ${storage.total_size}`);

    // Index usage statistics
    console.log('\n📈 Index Usage:');
    const indexResult = await db.execute(sql`
      SELECT 
        schemaname, 
        tablename, 
        indexname, 
        idx_tup_read, 
        idx_tup_fetch
      FROM pg_stat_user_indexes 
      WHERE schemaname = 'public'
      ORDER BY idx_tup_read DESC 
      LIMIT 10
    `);
    const indexes = indexResult.rows;

    if (indexes.length > 0) {
      indexes.forEach((idx: any) => {
        console.log(`  • ${idx.tablename}.${idx.indexname}: ${idx.idx_tup_read} reads`);
      });
    } else {
      console.log('  • No index usage statistics available');
    }

    // Overall health status
    const healthScore = calculateHealthScore({
      responseTime,
      orphanCount: parseInt(orphanCount),
      duplicateCount: duplicateSlugs.length,
      totalArticles: articleCount.count,
      featuredUnpublishedCount: parseInt(featuredUnpublishedCount),
      missingMetadata: (metadata?.missing_word_count || 0) + (metadata?.missing_dates || 0)
    });

    console.log(`\n🏥 Overall Health Score: ${healthScore}/100`);
    console.log(`Status: ${getHealthStatus(healthScore)}`);

    // Recommendations
    if (healthScore < 90) {
      console.log('\n💡 Recommendations:');
      if (responseTime > 1000) {
        console.log('  • Consider database performance optimization');
      }
      if (orphanCount > 0) {
        console.log('  • Fix orphaned article references');
      }
      if (duplicateSlugs.length > 0) {
        console.log('  • Resolve duplicate slug conflicts');
      }
      if (featuredUnpublishedCount > 0) {
        console.log('  • Review featured articles that are not published');
      }
      if (metadata?.missing_word_count > 0) {
        console.log('  • Add missing word counts to articles');
      }
    }

    log.success('Database health check completed');

  } catch (error) {
    log.error(`Database health check failed: ${error}`);
    process.exit(1);
  }
}

function calculateHealthScore(metrics: {
  responseTime: number;
  orphanCount: number;
  duplicateCount: number;
  totalArticles: number;
  featuredUnpublishedCount: number;
  missingMetadata: number;
}): number {
  let score = 100;

  // Deduct for slow response time
  if (metrics.responseTime > 1000) score -= 20;
  else if (metrics.responseTime > 500) score -= 10;

  // Deduct for data integrity issues
  if (metrics.orphanCount > 0) score -= Math.min(30, metrics.orphanCount * 5);
  if (metrics.duplicateCount > 0) score -= Math.min(20, metrics.duplicateCount * 2);
  if (metrics.featuredUnpublishedCount > 0) score -= Math.min(10, metrics.featuredUnpublishedCount * 2);

  // Deduct for missing metadata (percentage based)
  const metadataCompleteness = 1 - (metrics.missingMetadata / (metrics.totalArticles || 1));
  if (metadataCompleteness < 0.9) score -= (1 - metadataCompleteness) * 20;

  return Math.max(0, Math.round(score));
}

function getHealthStatus(score: number): string {
  if (score >= 95) return '🟢 Excellent';
  if (score >= 85) return '🟡 Good';
  if (score >= 70) return '🟠 Fair';
  if (score >= 50) return '🔴 Poor';
  return '💀 Critical';
}

checkDatabaseHealth();
