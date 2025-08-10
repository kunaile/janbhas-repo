// src/db/migrate.ts
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDbConnection, closeDbConnection } from './index';

async function runMigrations() {
    try {
        console.log('🔄 Running database migrations...');

        const db = await createDbConnection();

        await migrate(db, {
            migrationsFolder: './src/db/migrations'
        });

        console.log('✅ Migrations completed successfully');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } 
}

runMigrations();
