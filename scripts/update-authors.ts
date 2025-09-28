// scripts/update-authors.ts

import { readFileSync } from 'fs';
import { join } from 'path';
import { createDbConnection, getDb } from '../src/db';
import { authors, languages } from '../src/db/schema';
import { eq, sql } from 'drizzle-orm';
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
  updateTranslations: boolean;
  syncDenormalized: boolean;
  verbose: boolean;
  dryRun: boolean;
  help: boolean;
} {
  const args = process.argv.slice(2);
  return {
    language: args.find(arg => arg.startsWith('--lang='))?.split('=')[1],
    retransliterate: args.includes('--retransliterate'),
    updateMappings: args.includes('--update-mappings'),
    updateTranslations: args.includes('--update-translations'),
    syncDenormalized: args.includes('--sync-denormalized'),
    verbose: args.includes('--verbose'),
    dryRun: args.includes('--dry-run'),
    help: args.includes('--help')
  };
}

function showHelp() {
  console.log(`
Author Update Tool - Usage (ENHANCED with Series & Translation Support):

  pnpm db:update-authors [options]

Options:
  --lang=<code>          Update authors for specific language (hi, en, ur, etc.)
  --retransliterate      Re-transliterate all author names using latest AI
  --update-mappings      Sync custom mappings from JSON files to database
  --update-translations  Update translation tables with author names
  --sync-denormalized    Sync denormalized author fields in articles/series
  --dry-run              Preview changes without updating database
  --verbose              Show detailed update information
  --help                 Show this help message

Examples:
  pnpm db:update-authors --update-mappings --update-translations
  pnpm db:update-authors --lang=hi --retransliterate --sync-denormalized
  pnpm db:update-authors --sync-denormalized --dry-run --verbose

Features:
  📚 Custom author mappings from JSON files
  🤖 AI-powered retransliteration with Gemini
  🌐 Translation table integration for multilingual support
  📗 Series author field synchronization
  📄 Article author field synchronization
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

// Update translation tables
async function updateAuthorTranslations(language?: string, dryRun: boolean = false, verbose: boolean = false): Promise<number> {
  const db = getDb();
  let updatedCount = 0;

  log.info('Updating author translation tables...');

  // Get all existing translations to work from
  const existingTranslationsResult = await db.execute(sql`
    SELECT 
      at.author_id,
      at.language_id,
      at.local_name,
      a.name as author_name,
      l.code as language_code
    FROM author_translations at
    JOIN authors a ON at.author_id = a.id
    JOIN languages l ON at.language_id = l.id
    WHERE a.deleted_at IS NULL
    ${language ? sql` AND l.code = ${language}` : sql``}
  `);

  const existingTranslations = existingTranslationsResult.rows;

  if (existingTranslations.length === 0) {
    log.warn('No existing translations found to process');
    return 0;
  }

  for (const translation of existingTranslations) {
    const trans = translation as any;

    try {
      // Check if we need to update the main author name based on translation
      const currentAuthor = await db.select()
        .from(authors)
        .where(eq(authors.id, trans.author_id))
        .limit(1);

      if (currentAuthor.length > 0) {
        // Here we could implement logic to sync translations
        // For now, just log what we found
        if (verbose) {
          log.info(`Translation found: ${trans.author_name} -> ${trans.local_name} (${trans.language_code})`);
        }
      }
    } catch (error) {
      log.error(`Failed to process translation for author ${trans.author_id}: ${error}`);
    }
  }

  return updatedCount;
}

// Sync denormalized author fields
async function syncDenormalizedAuthorFields(language?: string, dryRun: boolean = false): Promise<{ articles: number, series: number }> {
  const db = getDb();
  let articlesUpdated = 0;
  let seriesUpdated = 0;

  log.info('Syncing denormalized author fields in articles and series...');

  // Update articles with proper translation table joins
  const articlesResult = await db.execute(sql`
    SELECT 
      a.id,
      a.author_name,
      a.author_local_name,
      au.name as correct_name,
      COALESCE(at.local_name, au.name) as correct_local_name
    FROM articles a
    JOIN authors au ON a.author_id = au.id
    LEFT JOIN author_translations at ON au.id = at.author_id
      ${language ? sql` AND at.language_id = (SELECT id FROM languages WHERE code = ${language} LIMIT 1)` : sql``}
    WHERE a.deleted_at IS NULL
    AND (
      a.author_name != au.name OR
      a.author_local_name != COALESCE(at.local_name, au.name) OR
      a.author_name IS NULL OR
      a.author_local_name IS NULL
    )
  `);

  for (const row of articlesResult.rows) {
    const article = row as any;

    if (dryRun) {
      log.info(`[DRY RUN] Would update article ${article.id}: author "${article.author_name}" -> "${article.correct_name}", local "${article.author_local_name}" -> "${article.correct_local_name}"`);
    } else {
      await db.execute(sql`
        UPDATE articles 
        SET 
          author_name = ${article.correct_name},
          author_local_name = ${article.correct_local_name},
          updated_at = NOW()
        WHERE id = ${article.id}
      `);
    }
    articlesUpdated++;
  }

  // Update series with proper translation table joins
  const seriesResult = await db.execute(sql`
    SELECT 
      s.id,
      s.author_name,
      s.author_local_name,
      au.name as correct_name,
      COALESCE(at.local_name, au.name) as correct_local_name
    FROM series s
    JOIN authors au ON s.author_id = au.id
    LEFT JOIN author_translations at ON au.id = at.author_id
      ${language ? sql` AND at.language_id = (SELECT id FROM languages WHERE code = ${language} LIMIT 1)` : sql``}
    WHERE s.deleted_at IS NULL
    AND (
      s.author_name != au.name OR
      s.author_local_name != COALESCE(at.local_name, au.name) OR
      s.author_name IS NULL OR
      s.author_local_name IS NULL
    )
  `);

  for (const row of seriesResult.rows) {
    const seriesRow = row as any;

    if (dryRun) {
      log.info(`[DRY RUN] Would update series ${seriesRow.id}: author "${seriesRow.author_name}" -> "${seriesRow.correct_name}", local "${seriesRow.author_local_name}" -> "${seriesRow.correct_local_name}"`);
    } else {
      await db.execute(sql`
        UPDATE series 
        SET 
          author_name = ${seriesRow.correct_name},
          author_local_name = ${seriesRow.correct_local_name},
          updated_at = NOW()
        WHERE id = ${seriesRow.id}
      `);
    }
    seriesUpdated++;
  }

  return { articles: articlesUpdated, series: seriesUpdated };
}

// Update from custom mappings
async function updateFromCustomMappings(language?: string, dryRun: boolean = false): Promise<number> {
  const db = getDb();
  let updatedCount = 0;

  const languageCodes = language ? [language] : ['hi', 'en', 'ur', 'bn'];

  for (const lang of languageCodes) {
    const mappings = loadAuthorMappings(lang);

    if (Object.keys(mappings).length === 0) {
      log.info(`No custom mappings found for ${lang}`);
      continue;
    }

    log.info(`Processing ${Object.keys(mappings).length} custom mappings for ${lang}`);

    // Get language ID properly
    const languageResults = await db.select()
      .from(languages)
      .where(eq(languages.code, lang))
      .limit(1);

    if (languageResults.length === 0) {
      log.warn(`Language ${lang} not found in database`);
      continue;
    }

    const languageId = languageResults[0].id;

    for (const [localName, transliteratedName] of Object.entries(mappings)) {
      try {
        // Find author by local name in translation table
        const existingTranslationResult = await db.execute(sql`
          SELECT a.id, a.name, at.local_name
          FROM authors a
          JOIN author_translations at ON a.id = at.author_id
          WHERE at.local_name = ${localName}
          AND at.language_id = ${languageId}
          AND a.deleted_at IS NULL
          LIMIT 1
        `);

        if (existingTranslationResult.rows.length > 0) {
          const result = existingTranslationResult.rows[0] as any;

          if (result.name !== transliteratedName.toLowerCase()) {
            log.info(`Updating ${localName}: "${result.name}" -> "${transliteratedName.toLowerCase()}"`);

            if (!dryRun) {
              await db.update(authors)
                .set({
                  name: transliteratedName.toLowerCase(),
                  updatedAt: new Date()
                })
                .where(eq(authors.id, result.id));
            }

            updatedCount++;
          }
        } else {
          log.warn(`Author not found in translations: ${localName} (${lang})`);
        }
      } catch (error) {
        log.error(`Failed to update ${localName}: ${error}`);
      }
    }
  }

  return updatedCount;
}

// Retransliterate authors
async function retransliterateAuthors(language?: string, dryRun: boolean = false): Promise<number> {
  const db = getDb();
  let updatedCount = 0;

  // Get authors with their translations
  const authorsWithTranslationsResult = await db.execute(sql`
    SELECT 
      a.id,
      a.name,
      at.local_name,
      l.code as language_code
    FROM authors a
    JOIN author_translations at ON a.id = at.author_id
    JOIN languages l ON at.language_id = l.id
    WHERE a.deleted_at IS NULL
    ${language ? sql` AND l.code = ${language}` : sql``}
  `);

  const authorsWithTranslations = authorsWithTranslationsResult.rows;

  if (authorsWithTranslations.length === 0) {
    log.info('No authors with translations found to retransliterate');
    return 0;
  }

  log.info(`Retransliterating ${authorsWithTranslations.length} authors`);

  // Group by language for efficient batch processing
  const authorsByLanguage: Record<string, any[]> = {};

  for (const authorData of authorsWithTranslations) {
    const author = authorData as any;
    const lang = author.language_code;

    if (!authorsByLanguage[lang]) {
      authorsByLanguage[lang] = [];
    }
    authorsByLanguage[lang].push(author);
  }

  for (const [lang, langAuthors] of Object.entries(authorsByLanguage)) {
    if (langAuthors.length === 0) continue;

    log.info(`Processing ${langAuthors.length} authors for language: ${lang}`);

    // Prepare items for batch transliteration
    const items = langAuthors
      .filter(author => author.local_name)
      .map(author => ({
        text: author.local_name,
        type: 'author' as const,
        language: lang
      }));

    if (items.length === 0) continue;

    try {
      // Batch transliterate
      const results = await batchTransliterateTexts(items);

      // Update database with new transliterations
      for (const author of langAuthors) {
        if (!author.local_name) continue;

        const newTransliteration = results.get(author.local_name);
        if (newTransliteration && newTransliteration !== author.name) {
          log.info(`Retransliterating ${author.local_name}: "${author.name}" -> "${newTransliteration}"`);

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

    log.info('Starting enhanced author update process with series support...');

    if (options.dryRun) {
      log.info('🔍 DRY RUN MODE - No changes will be made to the database');
    }

    await createDbConnection();
    log.success('Database connected');

    let totalUpdated = 0;
    let translationUpdates = 0;
    let denormalizedUpdates = { articles: 0, series: 0 };

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

    // Update translation tables
    if (options.updateTranslations) {
      log.info('🌐 Updating author translation tables...');
      translationUpdates = await updateAuthorTranslations(options.language, options.dryRun, options.verbose);
      log.success(`Translation tables: ${translationUpdates} translations updated`);
    }

    // Sync denormalized fields
    if (options.syncDenormalized) {
      log.info('📊 Syncing denormalized author fields...');
      denormalizedUpdates = await syncDenormalizedAuthorFields(options.language, options.dryRun);
      log.success(`Denormalized fields: ${denormalizedUpdates.articles} articles + ${denormalizedUpdates.series} series updated`);
    }

    // If no specific action specified, default to syncing denormalized fields
    if (!options.updateMappings && !options.retransliterate && !options.updateTranslations && !options.syncDenormalized) {
      log.info('📊 No specific action specified, syncing denormalized fields...');
      denormalizedUpdates = await syncDenormalizedAuthorFields(options.language, options.dryRun);
      log.success(`Default sync: ${denormalizedUpdates.articles} articles + ${denormalizedUpdates.series} series updated`);
    }

    // Enhanced summary
    console.log('\n' + '='.repeat(60));
    console.log('ENHANCED AUTHOR UPDATE SUMMARY:');
    console.log('─'.repeat(60));
    console.log(`📚 Authors updated: ${totalUpdated}`);
    console.log(`🌐 Translation entries: ${translationUpdates}`);
    console.log(`📄 Articles synchronized: ${denormalizedUpdates.articles}`);
    console.log(`📗 Series synchronized: ${denormalizedUpdates.series}`);
    console.log(`📊 Total operations: ${totalUpdated + translationUpdates + denormalizedUpdates.articles + denormalizedUpdates.series}`);

    if (options.dryRun) {
      console.log('🔍 Mode: DRY RUN (no changes made)');
    } else {
      console.log('✅ Mode: LIVE (changes applied)');
    }
    console.log('='.repeat(60));

    const totalOperations = totalUpdated + translationUpdates + denormalizedUpdates.articles + denormalizedUpdates.series;

    if (totalOperations > 0) {
      log.success(`Enhanced author update completed successfully`);
    } else {
      log.info('No authors needed updating');
    }

  } catch (error) {
    log.error(`Author update failed: ${error}`);
    process.exit(1);
  }
}

main();
