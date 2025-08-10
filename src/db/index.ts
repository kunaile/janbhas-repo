// src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Global connection pool instance
let db: ReturnType<typeof drizzle> | null = null;
let pool: Pool | null = null;

export const createDbConnection = async () => {
    if (db && pool) {
        return db; // Return existing connection
    }

    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
        throw new Error('DATABASE_URL environment variable is required');
    }

    try {
        // Create connection pool
        pool = new Pool({
            connectionString,
            ssl: process.env.NODE_ENV === 'production'
                ? { rejectUnauthorized: false }
                : false,
            max: 10, // Maximum connections in pool
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        // Test the connection
        await pool.connect();

        // Create Drizzle instance with connection pool
        db = drizzle(pool, { schema });

        console.log('✅ Database connected successfully');
        return db;

    } catch (error) {
        console.error('❌ Database connection failed:', error);
        throw new Error(`Failed to connect to database: ${error}`);
    }
};

export const getDb = () => {
    if (!db) {
        throw new Error('Database not initialized. Call createDbConnection() first.');
    }
    return db;
};

export const closeDbConnection = async () => {
    if (pool) {
        await pool.end();
        pool = null;
        db = null;
        console.log('📦 Database connection closed');
    }
};

// Export the database instance (will be initialized on first use)
export { db };
