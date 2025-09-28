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
  articleTags,
  series,
  authorTranslations,
  categoryTranslations,
  subCategoryTranslations,
  tagTranslations
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
  keepTranslations: boolean;
  keepLanguages: boolean;
} {
  const args = process.argv.slice(2);
  return {
    confirm: args.includes('--confirm'),
    help: args.includes('--help'),
    keepTranslations: args.includes('--keep-translations'), // NEW
    keepLanguages: args.includes('--keep-languages') // NEW
  };
}

function showHelp() {
  console.log(`
Database Reset Tool - Usage:

  pnpm db:reset [options]

Options:
  --confirm              Skip confirmation prompt and reset immediately
  --keep-translations    Keep translation tables intact (preserve multilingual data)
  --keep-languages       Keep language definitions (preserve language setup)
  --help                 Show this help message

⚠️  WARNING: This will permanently delete ALL data in the database!

Content Affected:
  📄 Articles and their content
  📗 Series and their episodes
  👤 Authors and their translations
  📂 Categories, sub-categories and their translations
  🏷️  Tags and their relationships/translations
  ✏️  Editor information
  🌍 Language definitions (unless --keep-languages)
  🔗 All relationships and references

Examples:
  pnpm db:reset                           # Full reset with confirmation
  pnpm db:reset --confirm                 # Skip confirmation (dangerous!)
  pnpm db:reset --keep-languages          # Reset content but keep languages
  pnpm db:reset --keep-translations       # Keep translation infrastructure
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
    console.log('  📄 All articles and their content');
    console.log('  📗 All series and their episodes');
    console.log('  👤 All authors and their local names');
    console.log('  📂 All categories, sub-categories');
    console.log('  🏷️  All tags and their relationships');
    console.log('  ✏️  All editor information');
    console.log('  🌐 All translation data');
    console.log('  🌍 All language definitions');
    console.log('  🔗 All relationships and references');
    console.log('\nThis action cannot be undone!\n');

    rl.question('Are you sure you want to reset the database? (yes/no): ', (answer: string) => { // ← FIXED: Added type
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

    log.info('Starting enhanced database reset process with series support');

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

    // Deletion in proper dependency order

    // Step 1: Clear junction tables first
    log.info('Step 1/15: Clearing article-tags relationships...');
    await db.delete(articleTags);
    log.success('Article-tags relationships cleared');

    // Step 2: Clear articles (which may reference series)
    log.info('Step 2/15: Clearing articles and episodes...');
    await db.delete(articles);
    log.success('Articles and episodes cleared');

    // Step 3: NEW - Clear series
    log.info('Step 3/15: Clearing series...');
    await db.delete(series);
    log.success('Series cleared');

    // Step 4-7: Clear translation tables (if not keeping them)
    if (!options.keepTranslations) {
      log.info('Step 4/15: Clearing author translations...');
      await db.delete(authorTranslations);
      log.success('Author translations cleared');

      log.info('Step 5/15: Clearing category translations...');
      await db.delete(categoryTranslations);
      log.success('Category translations cleared');

      log.info('Step 6/15: Clearing sub-category translations...');
      await db.delete(subCategoryTranslations);
      log.success('Sub-category translations cleared');

      log.info('Step 7/15: Clearing tag translations...');
      await db.delete(tagTranslations);
      log.success('Tag translations cleared');
    } else {
      log.info('Steps 4-7: Skipping translation tables (--keep-translations specified)');
    }

    // Step 8: Clear sub-categories
    log.info('Step 8/15: Clearing sub-categories...');
    await db.delete(subCategories);
    log.success('Sub-categories cleared');

    // Step 9: Clear tags
    log.info('Step 9/15: Clearing tags...');
    await db.delete(tags);
    log.success('Tags cleared');

    // Step 10: Clear authors
    log.info('Step 10/15: Clearing authors...');
    await db.delete(authors);
    log.success('Authors cleared');

    // Step 11: Clear categories
    log.info('Step 11/15: Clearing categories...');
    await db.delete(categories);
    log.success('Categories cleared');

    // Step 12: Clear editors
    log.info('Step 12/15: Clearing editors...');
    await db.delete(editors);
    log.success('Editors cleared');

    // Step 13: Clear languages (if not keeping them)
    if (!options.keepLanguages) {
      log.info('Step 13/15: Clearing languages...');
      await db.delete(languages);
      log.success('Languages cleared');
    } else {
      log.info('Step 13/15: Skipping languages (--keep-languages specified)');
    }

    // Verification
    log.info('Verifying database reset...');

    const verificationQueries = [
      { table: 'articles', query: db.select().from(articles), critical: true },
      { table: 'series', query: db.select().from(series), critical: true }, // NEW
      { table: 'authors', query: db.select().from(authors), critical: true },
      { table: 'categories', query: db.select().from(categories), critical: true },
      { table: 'subCategories', query: db.select().from(subCategories), critical: true },
      { table: 'tags', query: db.select().from(tags), critical: true },
      { table: 'articleTags', query: db.select().from(articleTags), critical: true },
      { table: 'editors', query: db.select().from(editors), critical: true },
      { table: 'languages', query: db.select().from(languages), critical: !options.keepLanguages },
      // Translation table verification (only if they should be cleared)
      { table: 'authorTranslations', query: db.select().from(authorTranslations), critical: !options.keepTranslations },
      { table: 'categoryTranslations', query: db.select().from(categoryTranslations), critical: !options.keepTranslations },
      { table: 'subCategoryTranslations', query: db.select().from(subCategoryTranslations), critical: !options.keepTranslations },
      { table: 'tagTranslations', query: db.select().from(tagTranslations), critical: !options.keepTranslations }
    ];

    let allCleared = true;
    let preservedTables: string[] = [];

    for (const { table, query, critical } of verificationQueries) {
      try {
        const result = await query;
        if (result.length > 0) {
          if (critical) {
            log.warn(`${table} table still contains ${result.length} records`);
            allCleared = false;
          } else {
            preservedTables.push(`${table} (${result.length} records)`);
          }
        }
      } catch (error) {
        log.warn(`Could not verify ${table} table: ${error}`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('DATABASE RESET SUMMARY:');
    console.log('='.repeat(60));

    console.log('\n📊 CLEARED TABLES:');
    console.log('  ✅ Article-tags relationships: CLEARED');
    console.log('  ✅ Articles and episodes: CLEARED');
    console.log('  ✅ Series: CLEARED');

    if (!options.keepTranslations) {
      console.log('  ✅ Author translations: CLEARED');
      console.log('  ✅ Category translations: CLEARED');
      console.log('  ✅ Sub-category translations: CLEARED');
      console.log('  ✅ Tag translations: CLEARED');
    }

    console.log('  ✅ Sub-categories: CLEARED');
    console.log('  ✅ Tags: CLEARED');
    console.log('  ✅ Authors: CLEARED');
    console.log('  ✅ Categories: CLEARED');
    console.log('  ✅ Editors: CLEARED');

    if (!options.keepLanguages) {
      console.log('  ✅ Languages: CLEARED');
    }

    if (preservedTables.length > 0) {
      console.log('\n🔒 PRESERVED TABLES:');
      preservedTables.forEach(table => {
        console.log(`  📋 ${table}`);
      });
    }

    console.log('\n📈 RESET STATISTICS:');
    console.log(`  • Core content tables: ${allCleared ? 'All cleared' : 'Some issues detected'}`);
    console.log(`  • Translation tables: ${options.keepTranslations ? 'Preserved' : 'Cleared'}`);
    console.log(`  • Language definitions: ${options.keepLanguages ? 'Preserved' : 'Cleared'}`);

    console.log('\n' + '='.repeat(60));

    if (allCleared) {
      log.success('Database verification passed - all target tables are cleared');
    } else {
      log.warn('Database verification found remaining records in some tables');
    }

    log.success('Enhanced database reset completed successfully');

    if (options.keepLanguages || options.keepTranslations) {
      log.info('Some infrastructure preserved - you can sync content without re-running migrations');
    } else {
      log.info('Complete reset - you may need to run migrations before syncing content');
    }

    // Next steps guidance
    console.log('\n💡 NEXT STEPS:');
    if (!options.keepLanguages) {
      console.log('  1. Run database migrations: pnpm db:migrate');
    }
    if (!options.keepTranslations && options.keepLanguages) {
      console.log('  1. Rebuild translation tables: pnpm db:setup-translations');
    }
    console.log(`  ${(!options.keepLanguages || (!options.keepTranslations && options.keepLanguages)) ? '2' : '1'}. Sync your content: pnpm sync:local --all`);
    console.log(`  ${(!options.keepLanguages || (!options.keepTranslations && options.keepLanguages)) ? '3' : '2'}. Verify with: pnpm db:status`);

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
