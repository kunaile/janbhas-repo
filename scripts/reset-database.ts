// scripts/reset-database.ts

import { createDbConnection, closeDbConnection } from '../src/db';
import { getDb } from '../src/db';
import {
  articles,
  authors,
  categories,
  subCategories,
  languages,
  editors,
  tags,
  articleTags
} from '../src/db/schema';

// Consistent logging utilities
const log = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warn: (msg: string) => console.log(`[WARN] ${msg}`),
  error: (msg: string) => console.log(`[ERROR] ${msg}`),
  success: (msg: string) => console.log(`[OK] ${msg}`),
  alert: (msg: string) => console.log(`[ALERT] ${msg}`)
};

function parseArgs(): {
  confirm: boolean;
  help: boolean;
} {
  const args = process.argv.slice(2);
  return {
    confirm: args.includes('--confirm'),
    help: args.includes('--help')
  };
}

function showHelp() {
  console.log(`
Database Reset Tool - Usage:

  pnpm db:reset [options]

Options:
  --confirm          Skip confirmation prompt and reset immediately
  --help             Show this help message

⚠️  WARNING: This will permanently delete ALL data in the database!

Examples:
  pnpm db:reset                    # Interactive mode with confirmation
  pnpm db:reset --confirm          # Skip confirmation (dangerous!)
  `);
}

async function promptConfirmation(): Promise<boolean> {
  return new Promise((resolve) => {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('\n⚠️  WARNING: This will permanently delete ALL data in the database!');
    console.log('This includes:');
    console.log('  • All articles and their content');
    console.log('  • All authors, categories, and sub-categories');
    console.log('  • All tags and their relationships');
    console.log('  • All editor information');
    console.log('  • All language definitions');
    console.log('\nThis action cannot be undone!\n');

    rl.question('Are you sure you want to reset the database? (yes/no): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

async function resetDatabase() {
  try {
    const options = parseArgs();

    if (options.help) {
      showHelp();
      process.exit(0);
    }

    log.info('Starting database reset process');

    // Confirmation check
    if (!options.confirm) {
      const confirmed = await promptConfirmation();
      if (!confirmed) {
        log.info('Database reset cancelled by user');
        process.exit(0);
      }
    }

    log.info('Connecting to database...');
    await createDbConnection();
    const db = getDb();
    log.success('Database connected');

    // Delete in reverse dependency order to avoid foreign key constraint violations
    log.info('Step 1/8: Clearing article-tags relationships...');
    await db.delete(articleTags);
    log.success('Article-tags relationships cleared');

    log.info('Step 2/8: Clearing articles...');
    await db.delete(articles);
    log.success('Articles cleared');

    log.info('Step 3/8: Clearing sub-categories...');
    await db.delete(subCategories);
    log.success('Sub-categories cleared');

    log.info('Step 4/8: Clearing tags...');
    await db.delete(tags);
    log.success('Tags cleared');

    log.info('Step 5/8: Clearing authors...');
    await db.delete(authors);
    log.success('Authors cleared');

    log.info('Step 6/8: Clearing categories...');
    await db.delete(categories);
    log.success('Categories cleared');

    log.info('Step 7/8: Clearing editors...');
    await db.delete(editors);
    log.success('Editors cleared');

    log.info('Step 8/8: Clearing languages...');
    await db.delete(languages);
    log.success('Languages cleared');

    // Verify reset completion
    log.info('Verifying database reset...');
    const verificationQueries = [
      { table: 'articles', query: db.select().from(articles) },
      { table: 'authors', query: db.select().from(authors) },
      { table: 'categories', query: db.select().from(categories) },
      { table: 'subCategories', query: db.select().from(subCategories) },
      { table: 'tags', query: db.select().from(tags) },
      { table: 'articleTags', query: db.select().from(articleTags) },
      { table: 'editors', query: db.select().from(editors) },
      { table: 'languages', query: db.select().from(languages) }
    ];

    let allEmpty = true;
    for (const { table, query } of verificationQueries) {
      const result = await query;
      if (result.length > 0) {
        log.warn(`${table} table still contains ${result.length} records`);
        allEmpty = false;
      }
    }

    if (allEmpty) {
      log.success('Database verification passed - all tables are empty');
    } else {
      log.warn('Database verification found remaining records');
    }

    console.log('\n' + '='.repeat(50));
    console.log('DATABASE RESET SUMMARY:');
    console.log('✅ Article-tags relationships: CLEARED');
    console.log('✅ Articles: CLEARED');
    console.log('✅ Sub-categories: CLEARED');
    console.log('✅ Tags: CLEARED');
    console.log('✅ Authors: CLEARED');
    console.log('✅ Categories: CLEARED');
    console.log('✅ Editors: CLEARED');
    console.log('✅ Languages: CLEARED');
    console.log('='.repeat(50));

    log.success('Database reset completed successfully');
    log.info('You can now run migrations and sync scripts to rebuild your content');

  } catch (error) {
    log.alert(`Database reset failed: ${error}`);
    process.exit(1);
  } finally {
    try {
      await closeDbConnection();
      log.info('Database connection closed');
    } catch (error) {
      log.warn(`Error closing database connection: ${error}`);
    }
    process.exit(0);
  }
}

resetDatabase();
