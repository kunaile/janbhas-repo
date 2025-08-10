// scripts/reset-database.ts
import { createDbConnection, closeDbConnection } from '../src/db';
import { getDb } from '../src/db';
import { articles, authors, categories, languages } from '../src/db/schema';

async function resetDatabase() {
    try {
        console.log('[INFO] Starting database reset');

        await createDbConnection();
        const db = getDb();

        // Delete in reverse dependency order
        console.log('[INFO] Clearing articles...');
        await db.delete(articles);

        console.log('[INFO] Clearing authors...');
        await db.delete(authors);

        console.log('[INFO] Clearing categories...');
        await db.delete(categories);

        console.log('[INFO] Clearing languages...');
        await db.delete(languages);

        console.log('[OK] Database reset complete');

    } catch (error) {
        console.log(`[ALERT] Database reset failed: ${error}`);
        process.exit(1);
    } finally {
        await closeDbConnection();
        process.exit(0);
    }
}

resetDatabase();
