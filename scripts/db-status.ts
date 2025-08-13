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

    // Test basic connection
    await db.execute(sql`SELECT 1 as test`);
    log.success('Database connection: OK');

    // Check if tables exist - FIX: Access .rows property
    const tablesResult = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const tables = tablesResult.rows; // ✅ Fixed: Access .rows

    console.log(`\nDatabase Tables (${tables.length}):`);
    tables.forEach((table: any) => {
      console.log(`  ✓ ${table.table_name}`);
    });

    // Check migrations table - FIX: Access .rows property
    try {
      const migrationsResult = await db.execute(sql`
        SELECT * FROM __drizzle_migrations 
        ORDER BY created_at DESC 
        LIMIT 5
      `);
      const migrations = migrationsResult.rows; // ✅ Fixed: Access .rows

      console.log(`\nRecent Migrations (${migrations.length}):`);
      migrations.forEach((migration: any) => {
        const date = new Date(migration.created_at).toISOString().split('T')[0];
        console.log(`  ✓ ${migration.hash} (${date})`);
      });
    } catch (error) {
      log.warn('Migrations table not found - database may need initialization');
    }

    log.success('Database status check completed');

  } catch (error) {
    log.error(`Database status check failed: ${error}`);
    process.exit(1);
  }
}

checkDatabaseStatus();
