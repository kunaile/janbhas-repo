// scripts/db-status.ts

import { createDbConnection, getDb } from '../src/db';
import { sql } from 'drizzle-orm';

const log = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  success: (msg: string) => console.log(`[OK] ${msg}`),
  error: (msg: string) => console.log(`[ERROR] ${msg}`),
  warn: (msg: string) => console.log(`[WARN] ${msg}`)
};

async function checkDatabaseStatus() {
  try {
    log.info('Checking database status...');

    await createDbConnection();
    const db = getDb();

    // Test basic connection with performance measurement
    const startTime = Date.now();
    await db.execute(sql`SELECT 1 as test`);
    const responseTime = Date.now() - startTime;

    log.success(`Database connection: OK (${responseTime}ms)`);

    console.log('\n=== DATABASE STATUS REPORT ===\n');

    // Check if tables exist
    const tablesResult = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const tables = tablesResult.rows;

    console.log(`📋 Database Tables (${tables.length}):`);

    // Categorize tables and show series-related tables
    const coreContentTables = ['articles', 'series', 'authors', 'categories', 'sub_categories', 'tags', 'languages', 'editors'];
    const translationTables = ['author_translations', 'category_translations', 'sub_category_translations', 'tag_translations'];
    const relationTables = ['article_tags'];
    const systemTables = ['__drizzle_migrations'];

    console.log('  Core Content:');
    coreContentTables.forEach(tableName => {
      const exists = tables.find((table: any) => table.table_name === tableName);
      console.log(`    ${exists ? '✅' : '❌'} ${tableName}${exists ? '' : ' (missing)'}`);
    });

    console.log('  Translation Tables:');
    translationTables.forEach(tableName => {
      const exists = tables.find((table: any) => table.table_name === tableName);
      console.log(`    ${exists ? '✅' : '❌'} ${tableName}${exists ? '' : ' (missing)'}`);
    });

    console.log('  Relation Tables:');
    relationTables.forEach(tableName => {
      const exists = tables.find((table: any) => table.table_name === tableName);
      console.log(`    ${exists ? '✅' : '❌'} ${tableName}${exists ? '' : ' (missing)'}`);
    });

    console.log('  System Tables:');
    systemTables.forEach(tableName => {
      const exists = tables.find((table: any) => table.table_name === tableName);
      console.log(`    ${exists ? '✅' : '❌'} ${tableName}${exists ? '' : ' (missing)'}`);
    });

    // Show any additional tables not in our categories
    const knownTables = [...coreContentTables, ...translationTables, ...relationTables, ...systemTables];
    const additionalTables = tables.filter((table: any) => !knownTables.includes(table.table_name));

    if (additionalTables.length > 0) {
      console.log('  Additional Tables:');
      additionalTables.forEach((table: any) => {
        console.log(`    ℹ️  ${table.table_name}`);
      });
    }

    // Check critical series-related table schemas
    console.log('\n🏗️  Schema Validation:');

    try {
      // Check if series table has required columns
      const seriesColumnsResult = await db.execute(sql`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'series' AND table_schema = 'public'
        ORDER BY ordinal_position
      `);

      const requiredSeriesColumns = [
        'id', 'slug', 'title', 'local_title', 'short_description', 'markdown_content',
        'thumbnail_url', 'is_complete', 'is_published', 'is_featured', 'total_episodes',
        'author_id', 'language_id', 'category_id', 'editor_id'
      ];

      const seriesColumns = seriesColumnsResult.rows.map((col: any) => col.column_name);
      const missingSeriesColumns = requiredSeriesColumns.filter(col => !seriesColumns.includes(col));

      if (missingSeriesColumns.length === 0) {
        console.log('  ✅ Series table schema: Complete');
      } else {
        log.warn(`Series table missing columns: ${missingSeriesColumns.join(', ')}`);
      }
    } catch (error) {
      log.warn('Could not validate series table schema');
    }

    try {
      // Check if articles table has series-related columns
      const articlesColumnsResult = await db.execute(sql`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'articles' AND table_schema = 'public'
        AND column_name IN ('series_id', 'episode_number', 'article_type')
      `);

      const seriesRelatedColumns = ['series_id', 'episode_number', 'article_type'];
      const foundColumns = articlesColumnsResult.rows.map((col: any) => col.column_name);
      const missingColumns = seriesRelatedColumns.filter(col => !foundColumns.includes(col));

      if (missingColumns.length === 0) {
        console.log('  ✅ Articles table series support: Complete');
      } else {
        log.warn(`Articles table missing series columns: ${missingColumns.join(', ')}`);
      }
    } catch (error) {
      log.warn('Could not validate articles table series support');
    }

    // Check table row counts with series breakdown
    console.log('\n📊 Table Statistics:');

    try {
      const statsResult = await db.execute(sql`
        SELECT 
          (SELECT COUNT(*) FROM articles WHERE deleted_at IS NULL) as articles_count,
          (SELECT COUNT(*) FROM series WHERE deleted_at IS NULL) as series_count,
          (SELECT COUNT(*) FROM authors WHERE deleted_at IS NULL) as authors_count,
          (SELECT COUNT(*) FROM categories WHERE deleted_at IS NULL) as categories_count,
          (SELECT COUNT(*) FROM languages WHERE deleted_at IS NULL) as languages_count,
          (SELECT COUNT(*) FROM tags WHERE deleted_at IS NULL) as tags_count,
          (SELECT COUNT(*) FROM editors WHERE deleted_at IS NULL) as editors_count,
          (SELECT COUNT(*) FROM articles WHERE deleted_at IS NULL AND series_id IS NOT NULL) as episodes_count,
          (SELECT COUNT(*) FROM series WHERE deleted_at IS NULL AND is_published = true) as published_series_count,
          (SELECT COUNT(*) FROM series WHERE deleted_at IS NULL AND is_complete = true) as completed_series_count
      `);

      const stats = statsResult.rows[0] as any;

      console.log(`  📄 Articles: ${stats.articles_count || 0} total`);
      console.log(`  📗 Series: ${stats.series_count || 0} total (${stats.published_series_count || 0} published, ${stats.completed_series_count || 0} completed)`);
      console.log(`  📖 Episodes: ${stats.episodes_count || 0} total`);
      console.log(`  👤 Authors: ${stats.authors_count || 0}`);
      console.log(`  📂 Categories: ${stats.categories_count || 0}`);
      console.log(`  🌍 Languages: ${stats.languages_count || 0}`);
      console.log(`  🏷️  Tags: ${stats.tags_count || 0}`);
      console.log(`  ✏️  Editors: ${stats.editors_count || 0}`);

      // Show content health indicators
      const standaloneArticles = (stats.articles_count || 0) - (stats.episodes_count || 0);
      console.log(`  📊 Standalone Articles: ${standaloneArticles}`);

      if (stats.series_count > 0 && stats.episodes_count > 0) {
        const avgEpisodesPerSeries = Math.round((stats.episodes_count / stats.series_count) * 10) / 10;
        console.log(`  📈 Average Episodes per Series: ${avgEpisodesPerSeries}`);
      }

    } catch (error) {
      log.warn('Could not retrieve table statistics');
    }

    // Check database indexes
    console.log('\n🔍 Index Status:');
    try {
      const indexResult = await db.execute(sql`
        SELECT 
          tablename,
          indexname,
          indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
        AND tablename IN ('articles', 'series', 'authors', 'categories')
        ORDER BY tablename, indexname
      `);

      const indexes = indexResult.rows;
      const indexesByTable = indexes.reduce((acc: any, index: any) => {
        if (!acc[index.tablename]) acc[index.tablename] = [];
        acc[index.tablename].push(index.indexname);
        return acc;
      }, {});

      ['articles', 'series', 'authors', 'categories'].forEach(tableName => {
        const tableIndexes = indexesByTable[tableName] || [];
        console.log(`  ${tableName}: ${tableIndexes.length} indexes`);
        if (tableIndexes.length > 0) {
          tableIndexes.forEach((indexName: string) => {
            console.log(`    • ${indexName}`);
          });
        }
      });
    } catch (error) {
      log.warn('Could not retrieve index information');
    }

    // Check constraints
    console.log('\n🔗 Foreign Key Constraints:');
    try {
      const constraintsResult = await db.execute(sql`
        SELECT 
          tc.table_name,
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name IN ('articles', 'series')
        ORDER BY tc.table_name, tc.constraint_name
      `);

      const constraints = constraintsResult.rows;

      if (constraints.length > 0) {
        constraints.forEach((constraint: any) => {
          console.log(`  ✅ ${constraint.table_name}.${constraint.column_name} → ${constraint.foreign_table_name}.${constraint.foreign_column_name}`);
        });
      } else {
        log.warn('No foreign key constraints found');
      }
    } catch (error) {
      log.warn('Could not retrieve constraint information');
    }

    // Check migrations table
    console.log('\n🔄 Migration History:');
    try {
      const migrationsResult = await db.execute(sql`
        SELECT hash, created_at
        FROM __drizzle_migrations 
        ORDER BY created_at DESC 
        LIMIT 5
      `);
      const migrations = migrationsResult.rows;

      if (migrations.length > 0) {
        console.log(`  Recent migrations (${migrations.length}):`);
        migrations.forEach((migration: any) => {
          const date = new Date(migration.created_at).toISOString().split('T')[0];
          const time = new Date(migration.created_at).toISOString().split('T')[1].split('.')[0];
          console.log(`    ✅ ${migration.hash} (${date} ${time})`);
        });
      } else {
        log.warn('No migrations found');
      }
    } catch (error) {
      log.warn('Migrations table not found - database may need initialization');
    }

    // Connection pool status
    console.log('\n⚡ Connection Info:');
    try {
      const connectionResult = await db.execute(sql`
        SELECT 
          current_database() as database_name,
          current_user as current_user,
          version() as postgres_version,
          pg_size_pretty(pg_database_size(current_database())) as database_size
      `);

      const connInfo = connectionResult.rows[0] as any;
      console.log(`  📍 Database: ${connInfo.database_name}`);
      console.log(`  👤 User: ${connInfo.current_user}`);
      console.log(`  🐘 PostgreSQL: ${connInfo.postgres_version.split(' ')[1]}`);
      console.log(`  💾 Size: ${connInfo.database_size}`);
      console.log(`  🚀 Response Time: ${responseTime}ms`);
    } catch (error) {
      console.log(`  🚀 Response Time: ${responseTime}ms`);
    }

    // Overall status
    console.log('\n🏥 Database Status:');
    const criticalTables = ['articles', 'series', 'authors', 'categories', 'languages', 'editors'];
    const missingCriticalTables = criticalTables.filter(tableName =>
      !tables.find((table: any) => table.table_name === tableName)
    );

    if (missingCriticalTables.length === 0 && responseTime < 1000) {
      console.log('  🟢 Status: Healthy');
      console.log('  ✅ All critical tables present');
      console.log('  ✅ Series support enabled');
      console.log('  ✅ Performance: Good');
    } else {
      if (missingCriticalTables.length > 0) {
        console.log('  🔴 Status: Critical - Missing tables');
        log.error(`Missing critical tables: ${missingCriticalTables.join(', ')}`);
      } else if (responseTime >= 1000) {
        console.log('  🟡 Status: Slow performance');
        log.warn(`Database response time: ${responseTime}ms (>1000ms)`);
      }
    }

    console.log('\n=== END OF STATUS REPORT ===');
    log.success('Enhanced database status check completed');

  } catch (error) {
    log.error(`Database status check failed: ${error}`);

    // Additional error context
    if (error instanceof Error) {
      if (error.message.includes('connection')) {
        console.log('\n💡 Connection Troubleshooting:');
        console.log('  • Check if PostgreSQL is running');
        console.log('  • Verify DATABASE_URL environment variable');
        console.log('  • Check network connectivity');
        console.log('  • Verify database credentials');
      } else if (error.message.includes('permission')) {
        console.log('\n💡 Permission Troubleshooting:');
        console.log('  • Check database user permissions');
        console.log('  • Verify schema access rights');
        console.log('  • Check table-level permissions');
      }
    }

    process.exit(1);
  }
}

checkDatabaseStatus();
