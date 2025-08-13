// scripts/db-health.ts

import { createDbConnection, getDb } from '../src/db';
import { articles, authors, categories, editors, languages } from '../src/db/schema';
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
    const [editorCount] = await db.select({ count: count() }).from(editors).where(isNull(editors.deletedAt));
    const [articleCount] = await db.select({ count: count() }).from(articles).where(isNull(articles.deletedAt));
    const [publishedCount] = await db.select({ count: count() }).from(articles)
      .where(sql`deleted_at IS NULL AND is_published = true`);

    console.log(`  • Languages: ${languageCount.count}`);
    console.log(`  • Authors: ${authorCount.count}`);
    console.log(`  • Categories: ${categoryCount.count}`);
    console.log(`  • Editors: ${editorCount.count}`);
    console.log(`  • Total Articles: ${articleCount.count}`);
    console.log(`  • Published Articles: ${publishedCount.count}`);
    console.log(`  • Draft Articles: ${articleCount.count - publishedCount.count}`);

    // Data integrity checks
    console.log('\n🔍 Data Integrity:');

    // Check for orphaned articles - FIX: Access .rows property
    const orphanedResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM articles a
      WHERE a.deleted_at IS NULL 
      AND (
        a.language_id NOT IN (SELECT id FROM languages WHERE deleted_at IS NULL) OR
        a.author_id NOT IN (SELECT id FROM authors WHERE deleted_at IS NULL) OR
        a.editor_id NOT IN (SELECT id FROM editors WHERE deleted_at IS NULL)
      )
    `);
    const orphanedArticles = orphanedResult.rows; // ✅ Fixed: Access .rows

    const orphanCount = (orphanedArticles[0] as any).count;
    if (orphanCount > 0) {
      log.warn(`Found ${orphanCount} orphaned articles with invalid references`);
    } else {
      console.log('  ✓ No orphaned articles found');
    }

    // Check for duplicate slugs - FIX: Access .rows property
    const duplicateResult = await db.execute(sql`
      SELECT slug, COUNT(*) as count 
      FROM articles 
      WHERE deleted_at IS NULL 
      GROUP BY slug 
      HAVING COUNT(*) > 1
    `);
    const duplicateSlugs = duplicateResult.rows; // ✅ Fixed: Access .rows

    if (duplicateSlugs.length > 0) {
      log.warn(`Found ${duplicateSlugs.length} duplicate slugs`);
    } else {
      console.log('  ✓ No duplicate slugs found');
    }

    // Storage usage
    console.log('\n💾 Storage Statistics:');
    const storageResult = await db.execute(sql`
      SELECT 
        pg_size_pretty(pg_total_relation_size('articles')) as articles_size,
        pg_size_pretty(pg_database_size(current_database())) as total_size
    `);
    const storageInfo = storageResult.rows; // ✅ Fixed: Access .rows

    const storage = storageInfo[0] as any;
    console.log(`  • Articles table size: ${storage.articles_size}`);
    console.log(`  • Total database size: ${storage.total_size}`);

    // Overall health status
    const healthScore = calculateHealthScore({
      responseTime,
      orphanCount: parseInt(orphanCount),
      duplicateCount: duplicateSlugs.length,
      totalArticles: articleCount.count
    });

    console.log(`\n🏥 Overall Health Score: ${healthScore}/100`);
    console.log(`Status: ${getHealthStatus(healthScore)}`);

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
}): number {
  let score = 100;

  // Deduct for slow response time
  if (metrics.responseTime > 1000) score -= 20;
  else if (metrics.responseTime > 500) score -= 10;

  // Deduct for data integrity issues
  if (metrics.orphanCount > 0) score -= Math.min(30, metrics.orphanCount * 5);
  if (metrics.duplicateCount > 0) score -= Math.min(20, metrics.duplicateCount * 2);

  return Math.max(0, score);
}

function getHealthStatus(score: number): string {
  if (score >= 90) return '🟢 Excellent';
  if (score >= 75) return '🟡 Good';
  if (score >= 50) return '🟠 Fair';
  return '🔴 Poor';
}

checkDatabaseHealth();
