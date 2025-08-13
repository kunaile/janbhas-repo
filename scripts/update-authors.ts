// scripts/update-authors.ts

import { readFileSync } from 'fs';
import { join } from 'path';
import { createDbConnection, getDb } from '../src/db';
import { authors } from '../src/db/schema';
import { eq, isNull } from 'drizzle-orm';
import { batchTransliterateTexts } from '../src/utils/transliteration';

const log = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  success: (msg: string) => console.log(`[OK] ${msg}`),
  error: (msg: string) => console.log(`[ERROR] ${msg}`),
  warn: (msg: string) => console.log(`[WARN] ${msg}`)
};

function parseArgs(): {
  language?: string;
  retransliterate: boolean;
  updateMappings: boolean;
  verbose: boolean;
  dryRun: boolean;
  help: boolean;
} {
  const args = process.argv.slice(2);
  return {
    language: args.find(arg => arg.startsWith('--lang='))?.split('=')[1],
    retransliterate: args.includes('--retransliterate'),
    updateMappings: args.includes('--update-mappings'),
    verbose: args.includes('--verbose'),
    dryRun: args.includes('--dry-run'),
    help: args.includes('--help')
  };
}

function showHelp() {
  console.log(`
Author Update Tool - Usage:

  pnpm db:update-authors [options]

Options:
  --lang=<code>          Update authors for specific language (hi, en, ur, etc.)
  --retransliterate      Re-transliterate all author names using latest AI
  --update-mappings      Sync custom mappings from JSON files to database
  --dry-run              Preview changes without updating database
  --verbose              Show detailed update information
  --help                 Show this help message

Examples:
  pnpm db:update-authors --update-mappings
  pnpm db:update-authors --lang=hi --retransliterate
  pnpm db:update-authors --dry-run --verbose
  `);
}

function loadAuthorMappings(langCode: string): Record<string, string> {
  try {
    const mappingFile = join(__dirname, '../src/data', `author-mappings.${langCode}.json`);
    const fileContent = readFileSync(mappingFile, 'utf8');
    const mappingData = JSON.parse(fileContent);
    return mappingData.author_mappings || {};
  } catch (error) {
    log.warn(`Could not load author mappings for ${langCode}: ${error}`);
    return {};
  }
}

async function updateFromCustomMappings(language?: string, dryRun: boolean = false): Promise<number> {
  const db = getDb();
  let updatedCount = 0;

  const languages = language ? [language] : ['hi', 'en', 'ur', 'bn'];

  for (const lang of languages) {
    const mappings = loadAuthorMappings(lang);

    if (Object.keys(mappings).length === 0) {
      log.info(`No custom mappings found for ${lang}`);
      continue;
    }

    log.info(`Processing ${Object.keys(mappings).length} custom mappings for ${lang}`);

    for (const [localName, transliteratedName] of Object.entries(mappings)) {
      try {
        // Find author by local name
        const existingAuthors = await db.select()
          .from(authors)
          .where(eq(authors.localName, localName))
          .limit(1);

        if (existingAuthors.length > 0) {
          const author = existingAuthors[0];

          if (author.name !== transliteratedName.toLowerCase()) {
            log.info(`Updating ${localName}: "${author.name}" -> "${transliteratedName.toLowerCase()}"`);

            if (!dryRun) {
              await db.update(authors)
                .set({
                  name: transliteratedName.toLowerCase(),
                  updatedAt: new Date()
                })
                .where(eq(authors.id, author.id));
            }

            updatedCount++;
          }
        } else {
          log.warn(`Author not found in database: ${localName}`);
        }
      } catch (error) {
        log.error(`Failed to update ${localName}: ${error}`);
      }
    }
  }

  return updatedCount;
}

async function retransliterateAuthors(language?: string, dryRun: boolean = false): Promise<number> {
  const db = getDb();
  let updatedCount = 0;

  // Get all authors that need retransliteration
  const authorsToUpdate = await db.select()
    .from(authors)
    .where(isNull(authors.deletedAt));

  if (authorsToUpdate.length === 0) {
    log.info('No authors found to retransliterate');
    return 0;
  }

  log.info(`Retransliterating ${authorsToUpdate.length} authors`);

  // Group by language for efficient batch processing
  const authorsByLanguage: Record<string, typeof authorsToUpdate> = {};

  for (const author of authorsToUpdate) {
    // If language filter is specified, skip others
    if (language && !author.localName?.match(new RegExp(`[${getLanguageChars(language)}]`))) {
      continue;
    }

    const detectedLang = detectLanguage(author.localName || '');
    if (!authorsByLanguage[detectedLang]) {
      authorsByLanguage[detectedLang] = [];
    }
    authorsByLanguage[detectedLang].push(author);
  }

  for (const [lang, langAuthors] of Object.entries(authorsByLanguage)) {
    if (langAuthors.length === 0) continue;

    log.info(`Processing ${langAuthors.length} authors for language: ${lang}`);

    // Prepare items for batch transliteration
    const items = langAuthors
      .filter(author => author.localName)
      .map(author => ({
        text: author.localName!,
        type: 'author' as const,
        language: lang
      }));

    if (items.length === 0) continue;

    try {
      // Batch transliterate
      const results = await batchTransliterateTexts(items);

      // Update database with new transliterations
      for (const author of langAuthors) {
        if (!author.localName) continue;

        const newTransliteration = results.get(author.localName);
        if (newTransliteration && newTransliteration !== author.name) {
          log.info(`Retransliterating ${author.localName}: "${author.name}" -> "${newTransliteration}"`);

          if (!dryRun) {
            await db.update(authors)
              .set({
                name: newTransliteration,
                updatedAt: new Date()
              })
              .where(eq(authors.id, author.id));
          }

          updatedCount++;
        }
      }
    } catch (error) {
      log.error(`Failed to retransliterate authors for ${lang}: ${error}`);
    }
  }

  return updatedCount;
}

function detectLanguage(text: string): string {
  // Simple language detection based on character ranges
  if (/[\u0900-\u097F]/.test(text)) return 'hi'; // Devanagari
  if (/[\u0600-\u06FF]/.test(text)) return 'ur'; // Arabic/Urdu
  if (/[\u0980-\u09FF]/.test(text)) return 'bn'; // Bengali
  return 'en'; // Default to English
}

function getLanguageChars(lang: string): string {
  const charRanges: Record<string, string> = {
    'hi': '\u0900-\u097F',
    'ur': '\u0600-\u06FF',
    'bn': '\u0980-\u09FF'
  };
  return charRanges[lang] || 'a-zA-Z';
}

async function main() {
  try {
    const options = parseArgs();

    if (options.help) {
      showHelp();
      process.exit(0);
    }

    log.info('Starting author update process...');

    if (options.dryRun) {
      log.info('🔍 DRY RUN MODE - No changes will be made to the database');
    }

    await createDbConnection();
    log.success('Database connected');

    let totalUpdated = 0;

    // Update from custom mappings
    if (options.updateMappings) {
      log.info('📚 Updating authors from custom mappings...');
      const mappingUpdates = await updateFromCustomMappings(options.language, options.dryRun);
      totalUpdated += mappingUpdates;
      log.success(`Custom mappings: ${mappingUpdates} authors updated`);
    }

    // Retransliterate using AI
    if (options.retransliterate) {
      log.info('🤖 Retransliterating authors using Gemini AI...');
      const retransliterationUpdates = await retransliterateAuthors(options.language, options.dryRun);
      totalUpdated += retransliterationUpdates;
      log.success(`Retransliteration: ${retransliterationUpdates} authors updated`);
    }

    // If no specific action specified, default to updating mappings
    if (!options.updateMappings && !options.retransliterate) {
      log.info('📚 No specific action specified, updating from custom mappings...');
      const mappingUpdates = await updateFromCustomMappings(options.language, options.dryRun);
      totalUpdated += mappingUpdates;
      log.success(`Custom mappings: ${mappingUpdates} authors updated`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('AUTHOR UPDATE SUMMARY:');
    console.log(`Total authors updated: ${totalUpdated}`);
    if (options.dryRun) {
      console.log('Mode: DRY RUN (no changes made)');
    }
    console.log('='.repeat(50));

    if (totalUpdated > 0) {
      log.success(`Author update completed successfully`);
    } else {
      log.info('No authors needed updating');
    }

  } catch (error) {
    log.error(`Author update failed: ${error}`);
    process.exit(1);
  }
}

main();
