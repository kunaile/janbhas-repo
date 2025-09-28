// scripts/db-health.ts

import { createDbConnection, getDb } from '../src/db';
import { articles, authors, categories, editors, languages, subCategories, tags, series } from '../src/db/schema';
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
    const [seriesCount] = await db.select({ count: count() }).from(series).where(isNull(series.deletedAt)); // NEW
    const [publishedCount] = await db.select({ count: count() }).from(articles)
      .where(sql`deleted_at IS NULL AND is_published = true`);
    const [featuredCount] = await db.select({ count: count() }).from(articles)
      .where(sql`deleted_at IS NULL AND is_featured = true`);
    const [publishedSeriesCount] = await db.select({ count: count() }).from(series) // NEW
      .where(sql`deleted_at IS NULL AND is_published = true`);
    const [completedSeriesCount] = await db.select({ count: count() }).from(series) // NEW
      .where(sql`deleted_at IS NULL AND is_complete = true`);

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
    // Series statistics
    console.log(`  • Total Series: ${seriesCount.count}`);
    console.log(`  • Published Series: ${publishedSeriesCount.count}`);
    console.log(`  • Completed Series: ${completedSeriesCount.count}`);

    // Content type breakdown
    console.log('\n📖 Content Breakdown:');
    const contentTypeResult = await db.execute(sql`
      SELECT 
        article_type,
        COUNT(*) as count,
        COUNT(CASE WHEN is_published THEN 1 END) as published_count
      FROM articles 
      WHERE deleted_at IS NULL 
      GROUP BY article_type 
      ORDER BY count DESC
    `);

    contentTypeResult.rows.forEach((row: any) => {
      console.log(`  • ${row.article_type}: ${row.count} total (${row.published_count} published)`);
    });

    const [episodeCount] = await db.select({ count: count() }).from(articles)
      .where(sql`deleted_at IS NULL AND series_id IS NOT NULL`);
    const [standaloneCount] = await db.select({ count: count() }).from(articles)
      .where(sql`deleted_at IS NULL AND series_id IS NULL`);

    console.log(`  • Episodes: ${episodeCount.count}`);
    console.log(`  • Standalone Articles: ${standaloneCount.count}`);

    // Data integrity checks (ENHANCED with series)
    console.log('\n🔍 Data Integrity:');

    // Check for orphaned articles (ENHANCED to include series references)
    const orphanedResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM articles a
      WHERE a.deleted_at IS NULL 
      AND (
        a.language_id NOT IN (SELECT id FROM languages WHERE deleted_at IS NULL) OR
        a.author_id NOT IN (SELECT id FROM authors WHERE deleted_at IS NULL) OR
        a.editor_id NOT IN (SELECT id FROM editors WHERE deleted_at IS NULL) OR
        (a.series_id IS NOT NULL AND a.series_id NOT IN (SELECT id FROM series WHERE deleted_at IS NULL))
      )
    `);

    const orphanCount = (orphanedResult.rows[0] as any).count;
    if (orphanCount > 0) {
      log.warn(`Found ${orphanCount} orphaned articles with invalid references`);
    } else {
      console.log('  ✓ No orphaned articles found');
    }

    // Check for orphaned series
    const orphanedSeriesResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM series s
      WHERE s.deleted_at IS NULL 
      AND (
        s.language_id NOT IN (SELECT id FROM languages WHERE deleted_at IS NULL) OR
        s.author_id NOT IN (SELECT id FROM authors WHERE deleted_at IS NULL) OR
        s.editor_id NOT IN (SELECT id FROM editors WHERE deleted_at IS NULL)
      )
    `);

    const orphanSeriesCount = (orphanedSeriesResult.rows[0] as any).count;
    if (orphanSeriesCount > 0) {
      log.warn(`Found ${orphanSeriesCount} orphaned series with invalid references`);
    } else {
      console.log('  ✓ No orphaned series found');
    }

    // Check for duplicate slugs
    const duplicateArticleSlugsResult = await db.execute(sql`
      SELECT slug, COUNT(*) as count 
      FROM articles 
      WHERE deleted_at IS NULL 
      GROUP BY slug 
      HAVING COUNT(*) > 1
    `);

    const duplicateSeriesSlugsResult = await db.execute(sql`
      SELECT slug, COUNT(*) as count 
      FROM series 
      WHERE deleted_at IS NULL 
      GROUP BY slug 
      HAVING COUNT(*) > 1
    `);

    // Check for cross-table slug conflicts
    const crossSlugsResult = await db.execute(sql`
      SELECT a.slug
      FROM articles a
      INNER JOIN series s ON a.slug = s.slug
      WHERE a.deleted_at IS NULL AND s.deleted_at IS NULL
    `);

    const totalDuplicateSlugs = duplicateArticleSlugsResult.rows.length + duplicateSeriesSlugsResult.rows.length;
    const crossSlugs = crossSlugsResult.rows.length;

    if (totalDuplicateSlugs > 0) {
      log.warn(`Found ${duplicateArticleSlugsResult.rows.length} duplicate article slugs and ${duplicateSeriesSlugsResult.rows.length} duplicate series slugs`);
    }
    if (crossSlugs > 0) {
      log.warn(`Found ${crossSlugs} slug conflicts between articles and series`);
    }
    if (totalDuplicateSlugs === 0 && crossSlugs === 0) {
      console.log('  ✓ No duplicate slugs found');
    }

    // Series integrity checks
    console.log('\n📗 Series Integrity:');

    // Check for series with incorrect episode counts
    const seriesEpisodeCountResult = await db.execute(sql`
      SELECT 
        s.slug,
        s.total_episodes,
        COUNT(a.id) as actual_episodes
      FROM series s
      LEFT JOIN articles a ON s.id = a.series_id AND a.deleted_at IS NULL
      WHERE s.deleted_at IS NULL
      GROUP BY s.id, s.slug, s.total_episodes
      HAVING s.total_episodes != COUNT(a.id)
    `);

    if (seriesEpisodeCountResult.rows.length > 0) {
      log.warn(`Found ${seriesEpisodeCountResult.rows.length} series with incorrect episode counts`);
      if (seriesEpisodeCountResult.rows.length <= 5) {
        seriesEpisodeCountResult.rows.forEach((series: any) => {
          console.log(`    • ${series.slug}: expected ${series.total_episodes}, found ${series.actual_episodes}`);
        });
      }
    } else {
      console.log('  ✓ All series have correct episode counts');
    }

    // Check for episodes with invalid episode numbers
    const invalidEpisodeNumbersResult = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM articles a
      WHERE a.deleted_at IS NULL 
      AND a.series_id IS NOT NULL 
      AND (a.episode_number IS NULL OR a.episode_number <= 0)
    `);

    const invalidEpisodeNumbers = (invalidEpisodeNumbersResult.rows[0] as any).count;
    if (invalidEpisodeNumbers > 0) {
      log.warn(`Found ${invalidEpisodeNumbers} episodes with invalid episode numbers`);
    } else {
      console.log('  ✓ All episodes have valid episode numbers');
    }

    // Check for duplicate episode numbers within series
    const duplicateEpisodesResult = await db.execute(sql`
      SELECT 
        s.slug as series_slug,
        a.episode_number,
        COUNT(*) as count
      FROM articles a
      INNER JOIN series s ON a.series_id = s.id
      WHERE a.deleted_at IS NULL AND s.deleted_at IS NULL
      GROUP BY s.id, s.slug, a.episode_number
      HAVING COUNT(*) > 1
    `);

    if (duplicateEpisodesResult.rows.length > 0) {
      log.warn(`Found ${duplicateEpisodesResult.rows.length} duplicate episode numbers`);
    } else {
      console.log('  ✓ No duplicate episode numbers found');
    }

    // Check for featured articles that aren't published
    const featuredUnpublishedResult = await db.execute(sql`
      SELECT 
        (SELECT COUNT(*) FROM articles WHERE deleted_at IS NULL AND is_featured = true AND is_published = false) as articles,
        (SELECT COUNT(*) FROM series WHERE deleted_at IS NULL AND is_featured = true AND is_published = false) as series
    `);

    const featuredUnpublished = featuredUnpublishedResult.rows[0] as any;
    const totalFeaturedUnpublished = (featuredUnpublished?.articles || 0) + (featuredUnpublished?.series || 0);

    if (totalFeaturedUnpublished > 0) {
      log.warn(`Found ${featuredUnpublished.articles || 0} featured articles and ${featuredUnpublished.series || 0} featured series that are not published`);
    } else {
      console.log('  ✓ All featured content is published');
    }

    // Check for content without proper metadata
    const metadataResult = await db.execute(sql`
      SELECT 
        COUNT(CASE WHEN word_count IS NULL OR word_count = 0 THEN 1 END) as missing_word_count,
        COUNT(CASE WHEN published_date IS NULL THEN 1 END) as missing_dates,
        COUNT(CASE WHEN short_description IS NULL OR short_description = '' THEN 1 END) as missing_descriptions,
        COUNT(CASE WHEN author_name IS NULL OR author_name = '' THEN 1 END) as missing_author_names,
        COUNT(CASE WHEN category_name IS NULL OR category_name = '' THEN 1 END) as missing_category_names
      FROM articles 
      WHERE deleted_at IS NULL
    `);

    // Series metadata check
    const seriesMetadataResult = await db.execute(sql`
      SELECT 
        COUNT(CASE WHEN short_description IS NULL OR short_description = '' THEN 1 END) as missing_descriptions,
        COUNT(CASE WHEN author_name IS NULL OR author_name = '' THEN 1 END) as missing_author_names,
        COUNT(CASE WHEN category_name IS NULL OR category_name = '' THEN 1 END) as missing_category_names,
        COUNT(CASE WHEN total_episodes IS NULL OR total_episodes = 0 THEN 1 END) as missing_episode_counts
      FROM series 
      WHERE deleted_at IS NULL
    `);

    const metadata = metadataResult.rows[0] as any;
    const seriesMetadata = seriesMetadataResult.rows[0] as any;

    console.log('\n📝 Metadata Completeness:');
    console.log('Articles:');
    if (metadata?.missing_word_count > 0) {
      log.warn(`  ${metadata.missing_word_count} articles missing word count`);
    } else {
      console.log('  ✓ All articles have word counts');
    }

    if (metadata?.missing_descriptions > 0) {
      log.warn(`  ${metadata.missing_descriptions} articles missing descriptions`);
    } else {
      console.log('  ✓ All articles have descriptions');
    }

    if (metadata?.missing_author_names > 0) {
      log.warn(`  ${metadata.missing_author_names} articles missing denormalized author names`);
    } else {
      console.log('  ✓ All articles have denormalized author names');
    }

    if (seriesCount.count > 0) {
      console.log('Series:');
      if (seriesMetadata?.missing_descriptions > 0) {
        log.warn(`  ${seriesMetadata.missing_descriptions} series missing descriptions`);
      } else {
        console.log('  ✓ All series have descriptions');
      }

      if (seriesMetadata?.missing_episode_counts > 0) {
        log.warn(`  ${seriesMetadata.missing_episode_counts} series missing episode counts`);
      } else {
        console.log('  ✓ All series have episode counts');
      }
    }

    // Check for empty categories/subcategories
    const emptyReferencesResult = await db.execute(sql`
      SELECT 
        (SELECT COUNT(*) FROM categories c WHERE c.deleted_at IS NULL AND c.id NOT IN (
          SELECT DISTINCT category_id FROM articles WHERE deleted_at IS NULL AND category_id IS NOT NULL
          UNION
          SELECT DISTINCT category_id FROM series WHERE deleted_at IS NULL AND category_id IS NOT NULL
        )) as empty_categories,
        (SELECT COUNT(*) FROM sub_categories sc WHERE sc.deleted_at IS NULL AND sc.id NOT IN (
          SELECT DISTINCT sub_category_id FROM articles WHERE deleted_at IS NULL AND sub_category_id IS NOT NULL
          UNION
          SELECT DISTINCT sub_category_id FROM series WHERE deleted_at IS NULL AND sub_category_id IS NOT NULL
        )) as empty_subcategories,
        (SELECT COUNT(*) FROM tags t WHERE t.deleted_at IS NULL AND t.id NOT IN (
          SELECT DISTINCT tag_id FROM article_tags at JOIN articles a ON at.article_id = a.id WHERE a.deleted_at IS NULL
        )) as unused_tags
    `);

    const emptyRefs = emptyReferencesResult.rows[0] as any;
    if (emptyRefs?.empty_categories > 0) {
      log.warn(`${emptyRefs.empty_categories} categories have no content`);
    } else {
      console.log('  ✓ All categories are in use');
    }

    if (emptyRefs?.empty_subcategories > 0) {
      log.warn(`${emptyRefs.empty_subcategories} sub-categories have no content`);
    } else {
      console.log('  ✓ All sub-categories are in use');
    }

    if (emptyRefs?.unused_tags > 0) {
      log.warn(`${emptyRefs.unused_tags} tags are not used`);
    } else {
      console.log('  ✓ All tags are in use');
    }

    // Storage usage
    console.log('\n💾 Storage Statistics:');
    const storageResult = await db.execute(sql`
      SELECT 
        pg_size_pretty(pg_total_relation_size('articles')) as articles_size,
        pg_size_pretty(pg_total_relation_size('series')) as series_size,
        pg_size_pretty(pg_total_relation_size('authors')) as authors_size,
        pg_size_pretty(pg_total_relation_size('categories')) as categories_size,
        pg_size_pretty(pg_total_relation_size('tags')) as tags_size,
        pg_size_pretty(pg_database_size(current_database())) as total_size
    `);

    const storage = storageResult.rows[0] as any;
    console.log(`  • Articles table: ${storage.articles_size}`);
    console.log(`  • Series table: ${storage.series_size}`);
    console.log(`  • Authors table: ${storage.authors_size}`);
    console.log(`  • Categories table: ${storage.categories_size}`);
    console.log(`  • Tags table: ${storage.tags_size}`);
    console.log(`  • Total database: ${storage.total_size}`);

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
        AND tablename IN ('articles', 'series', 'authors', 'categories', 'tags')
      ORDER BY idx_tup_read DESC 
      LIMIT 10
    `);

    if (indexResult.rows.length > 0) {
      indexResult.rows.forEach((idx: any) => {
        console.log(`  • ${idx.tablename}.${idx.indexname}: ${idx.idx_tup_read} reads`);
      });
    } else {
      console.log('  • No index usage statistics available');
    }

    // Overall health status
    const healthScore = calculateHealthScore({
      responseTime,
      orphanCount: parseInt(orphanCount) + parseInt(orphanSeriesCount),
      duplicateCount: totalDuplicateSlugs + crossSlugs,
      totalContent: articleCount.count + seriesCount.count,
      featuredUnpublishedCount: totalFeaturedUnpublished,
      missingMetadata: (metadata?.missing_word_count || 0) + (metadata?.missing_descriptions || 0) + (seriesMetadata?.missing_descriptions || 0),
      seriesIntegrityIssues: seriesEpisodeCountResult.rows.length + invalidEpisodeNumbers + duplicateEpisodesResult.rows.length
    });

    console.log(`\n🏥 Overall Health Score: ${healthScore}/100`);
    console.log(`Status: ${getHealthStatus(healthScore)}`);

    // Recommendations
    if (healthScore < 90) {
      console.log('\n💡 Recommendations:');
      if (responseTime > 1000) {
        console.log('  • Consider database performance optimization');
      }
      if (orphanCount > 0 || orphanSeriesCount > 0) {
        console.log('  • Fix orphaned content references');
      }
      if (totalDuplicateSlugs > 0 || crossSlugs > 0) {
        console.log('  • Resolve slug conflicts');
      }
      if (totalFeaturedUnpublished > 0) {
        console.log('  • Review featured content that is not published');
      }
      if (seriesEpisodeCountResult.rows.length > 0) {
        console.log('  • Update series episode counts to match actual episodes');
      }
      if (invalidEpisodeNumbers > 0) {
        console.log('  • Fix episodes with invalid episode numbers');
      }
      if ((metadata?.missing_word_count || 0) > 0) {
        console.log('  • Add missing word counts to articles');
      }
      if ((metadata?.missing_descriptions || 0) > 0 || (seriesMetadata?.missing_descriptions || 0) > 0) {
        console.log('  • Add missing descriptions to content');
      }
    }

    log.success('Enhanced database health check completed');

  } catch (error) {
    log.error(`Database health check failed: ${error}`);
    process.exit(1);
  }
}

function calculateHealthScore(metrics: {
  responseTime: number;
  orphanCount: number;
  duplicateCount: number;
  totalContent: number;
  featuredUnpublishedCount: number;
  missingMetadata: number;
  seriesIntegrityIssues: number;
}): number {
  let score = 100;

  // Deduct for slow response time
  if (metrics.responseTime > 1000) score -= 20;
  else if (metrics.responseTime > 500) score -= 10;

  // Deduct for data integrity issues
  if (metrics.orphanCount > 0) score -= Math.min(30, metrics.orphanCount * 5);
  if (metrics.duplicateCount > 0) score -= Math.min(20, metrics.duplicateCount * 2);
  if (metrics.featuredUnpublishedCount > 0) score -= Math.min(10, metrics.featuredUnpublishedCount * 2);

  // Deduct for series integrity issues
  if (metrics.seriesIntegrityIssues > 0) score -= Math.min(15, metrics.seriesIntegrityIssues * 3);

  // Deduct for missing metadata (percentage based)
  const metadataCompleteness = 1 - (metrics.missingMetadata / (metrics.totalContent || 1));
  if (metadataCompleteness < 0.9) score -= (1 - metadataCompleteness) * 15;

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
