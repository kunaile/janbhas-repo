// scripts/reset-database.ts

import { createDbConnection, closeDbConnection } from '../src/db';
import { getDb } from '../src/db';

async function promptConfirmation(): Promise<boolean> {
  return new Promise((resolve) => {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('\n⚠️  WARNING: This will PERMANENTLY DROP ALL TABLES in the database!');
    console.log('This action CANNOT be undone.');
    console.log('To confirm, please type exactly: delete all data');
    console.log('To cancel, type anything else or Ctrl+C.\n');

    rl.question('Type here: ', (answer: string) => {
      rl.close();
      resolve(answer === 'delete all data');
    });
  });
}

async function resetDatabase() {
  try {
    const confirmed = await promptConfirmation();
    if (!confirmed) {
      console.log('[INFO] Database reset cancelled by user.');
      process.exit(0);
    }

    console.log('[INFO] Connecting to database...');
    await createDbConnection();
    const db = getDb();
    console.log('[OK] Database connected');

    // Get all table names in public schema
    const tablesResult = await db.execute<{ tablename: string }>(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public';
    `);

    const tables = tablesResult.rows.map(row => row.tablename);

    if (tables.length === 0) {
      console.log('[INFO] No tables found in database.');
      process.exit(0);
    }

    console.log(`[INFO] Found ${tables.length} tables. Dropping all...`);

    // Disable triggers temporarily (optional, but safer)
    await db.execute('SET session_replication_role = replica;');

    // Drop all tables cascade inside a transaction
    await db.transaction(async (tx) => {
      for (const table of tables) {
        console.log(`[INFO] Dropping table: ${table}`);
        await tx.execute(`DROP TABLE IF EXISTS "${table}" CASCADE;`);
      }
    });

    // Re-enable triggers
    await db.execute('SET session_replication_role = DEFAULT;');

    console.log('[OK] All tables dropped successfully.');

  } catch (err) {
    console.error('[ERROR] Failed to reset database:', err);
  } finally {
    await closeDbConnection();
    console.log('[INFO] Database connection closed');
    process.exit(0);
  }
}

resetDatabase();
