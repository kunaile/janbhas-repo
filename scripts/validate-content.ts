// scripts/validate-content.ts


import { join } from 'path';
import { findMarkdownFiles, parseMarkdownFile, log } from '../src/services/contentProcessor';
import { isValidLanguageCode } from '../src/services/contentProcessor/utils';
import type { ParsedFile } from '../src/services/contentProcessor/types';
import { getDb } from '../src/db';
import { authors, categories, subCategories, tags } from '../src/db/schema';
import { and, eq, isNull } from 'drizzle-orm';

function parseArgs(): {
  verbose: boolean;
  help: boolean;
  mapping: boolean;
  strict: boolean;
} {
  const args = process.argv.slice(2);
  return {
    verbose: args.includes('--verbose'),
    help: args.includes('--help'),
    mapping: args.includes('--mapping'),
    strict: args.includes('--strict'),
  };
}

function showHelp() {
  console.log(`
Content Validation Tool - Usage (Enhanced for Series & Mapping):

  pnpm validate [options]

Options:
  --verbose          Show detailed validation results
  --mapping          Validate mapping files availability
  --strict           Fail if referenced authors/categories/tags/sub-cats are missing
  --help             Show this help message

Examples:
  pnpm validate                      # Validate all content
  pnpm validate --verbose            # Show detailed validation info
  pnpm validate --mapping            # Include mapping validation
  pnpm validate --strict             # Enforce preexisting refs (articles-only sync readiness)

Validates:
  📗 Series covers (base_type: "series")
  📖 Episodes (series_title: "Series English Title")
  📄 Standalone articles
  🏷️  Field names and formats (new structure)
  🔄 Mapping file availability
  📝 Content structure and cross-references

Field Name Support:
  ✅ local_title / localTitle
  ✅ sub_category / subCategory  
  ✅ series_title / seriesTitle (episodes reference series English title)
  ✅ article_type / articleType
  ✅ base_type / baseType
  `);
}

async function validateContent() {
  try {
    const options = parseArgs();

    if (options.help) {
      showHelp();
      process.exit(0);
    }

    log.info('Starting enhanced content validation with series support...');

    const contentDir = join(process.cwd(), 'content');
    const markdownFiles = findMarkdownFiles(contentDir);

    if (markdownFiles.length === 0) {
      log.error('No markdown files found in content directory');
      process.exit(1);
    }

    log.info(`Found ${markdownFiles.length} markdown files to validate`);

    let validFiles = 0;
    let invalidFiles = 0;
    const errors: string[] = [];
    const warnings: string[] = [];

    // Track content types
    const contentStats = {
      series: 0,
      episodes: 0,
      articles: 0,
      unknown: 0
    };

    // Track series references for cross-validation
    const seriesEnglishTitles = new Set<string>(); // Series English titles (from covers)
    const episodeSeriesReferences = new Set<string>(); // Series titles referenced by episodes

    // Track field usage for migration reporting (using raw frontmatter)
    const fieldUsage = {
      localTitle_vs_local_title: { snake_case: 0, camelCase: 0 },
      subCategory_vs_sub_category: { snake_case: 0, camelCase: 0 },
      seriesTitle_vs_series_title: { snake_case: 0, camelCase: 0 },
      articleType_vs_article_type: { snake_case: 0, camelCase: 0 },
      baseType_vs_base_type: { snake_case: 0, camelCase: 0 }
    };

    // DB for strict preflight (lazy: only if --strict)
    const db = options.strict ? getDb() : null;

    // Validation results
    const results: Array<{
      file: string;
      status: 'valid' | 'invalid' | 'warning';
      issues: string[];
      contentType: 'series' | 'episode' | 'article' | 'unknown';
    }> = [];

    for (const file of markdownFiles) {
      const relativePath = file.replace(process.cwd() + '/', '');
      const fileIssues: string[] = [];

      try {
        const parsed: ParsedFile | null = parseMarkdownFile(file);

        if (!parsed) {
          fileIssues.push('Failed to parse file');
          invalidFiles++;
          results.push({ file: relativePath, status: 'invalid', issues: fileIssues, contentType: 'unknown' });
          contentStats.unknown++;
          continue;
        }

        // Use normalized frontmatter from parsed file
        const frontmatter = parsed.frontmatter;

        // Read the original file to track raw field usage patterns
        try {
          const fs = require('fs');
          const originalContent = fs.readFileSync(file, 'utf8');
          const matter = require('gray-matter');
          const originalParsed = matter(originalContent);
          trackFieldUsage(originalParsed.data, fieldUsage);
        } catch {
          // If we can't read original, skip field usage tracking
        }

        // Determine content type (using normalized frontmatter)
        const isSeriesCover = frontmatter.base_type === 'series';
        const isEpisode = !!frontmatter.series_title && !isSeriesCover;
        const isStandaloneArticle = !isSeriesCover && !isEpisode;

        let contentType: 'series' | 'episode' | 'article' | 'unknown' = 'unknown';

        if (isSeriesCover) {
          contentType = 'series';
          contentStats.series++;
          seriesEnglishTitles.add(frontmatter.title); // Track English title
        } else if (isEpisode) {
          contentType = 'episode';
          contentStats.episodes++;
          if (frontmatter.series_title) {
            episodeSeriesReferences.add(frontmatter.series_title);
          }
        } else if (isStandaloneArticle) {
          contentType = 'article';
          contentStats.articles++;
        } else {
          contentStats.unknown++;
        }

        // Enhanced required field validation (using normalized frontmatter)
        const requiredFields = ['author', 'title', 'lang', 'category'];
        const missingFields = requiredFields.filter(field => !frontmatter[field as keyof typeof frontmatter]);

        // Check for local_title requirement
        if (!frontmatter.local_title) {
          missingFields.push('local_title');
        }

        if (missingFields.length > 0) {
          fileIssues.push(`Missing required fields: ${missingFields.join(', ')}`);
        }

        // Series-specific validation (using normalized frontmatter)
        if (isSeriesCover) {
          if (frontmatter.series_title) {
            fileIssues.push('Series covers should not have "series_title" property');
          }
          if (frontmatter.episode) {
            fileIssues.push('Series covers should not have "episode" property');
          }
          if (frontmatter.article_type) {
            fileIssues.push('Series covers should not have "article_type" property');
          }
        } else if (isEpisode) {
          if (!frontmatter.series_title) {
            fileIssues.push('Episodes must have "series_title" property referencing series English title');
          }
          if (frontmatter.base_type && frontmatter.base_type !== 'article') {
            fileIssues.push('Episodes should have base_type "article" or no base_type');
          }
          if (frontmatter.completed !== undefined) {
            fileIssues.push('Episodes should not have "completed" property (only series covers)');
          }
          if (frontmatter.episode && (typeof frontmatter.episode !== 'number' || frontmatter.episode <= 0)) {
            fileIssues.push('Episode number should be a positive number');
          }
        }

        // Enhanced field format validation (using normalized frontmatter)
        validateFieldFormats(frontmatter, fileIssues);

        // Language code validation (using normalized frontmatter)
        if (frontmatter.lang && !isValidLanguageCode(frontmatter.lang)) {
          fileIssues.push(`Unknown language code: ${frontmatter.lang}`);
        }

        // Content length validation
        if (parsed.markdownContent.length < 100) {
          fileIssues.push('Content seems too short (< 100 characters)');
        }

        // Enhanced tags validation (using normalized frontmatter)
        validateTags(frontmatter, fileIssues);

        // URL validation for media fields (using normalized frontmatter)
        validateUrls(frontmatter, fileIssues);

        // Strict preflight: ensure refs exist (no creation here)
        if (options.strict && db) {
          await checkRefsExist(db, frontmatter, fileIssues);
        }

        // Determine status
        const hasErrors = fileIssues.some(issue => isErrorLevel(issue));

        if (hasErrors) {
          invalidFiles++;
          results.push({ file: relativePath, status: 'invalid', issues: fileIssues, contentType });
          errors.push(...fileIssues.map(issue => `${relativePath}: ${issue}`));
        } else if (fileIssues.length > 0) {
          validFiles++;
          results.push({ file: relativePath, status: 'warning', issues: fileIssues, contentType });
          warnings.push(...fileIssues.map(issue => `${relativePath}: ${issue}`));
        } else {
          validFiles++;
          results.push({ file: relativePath, status: 'valid', issues: [], contentType });
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        fileIssues.push(`Parsing error: ${errorMsg}`);
        invalidFiles++;
        results.push({ file: relativePath, status: 'invalid', issues: fileIssues, contentType: 'unknown' });
        errors.push(`${relativePath}: ${errorMsg}`);
        contentStats.unknown++;
      }
    }

    // Cross-validation for series references
    const orphanedEpisodes = [...episodeSeriesReferences].filter(seriesRef =>
      !seriesEnglishTitles.has(seriesRef)
    );

    if (orphanedEpisodes.length > 0) {
      errors.push(`Found ${orphanedEpisodes.length} episodes referencing missing series: ${orphanedEpisodes.join(', ')}`);
    }

    // Mapping validation (NEW)
    if (options.mapping) {
      await validateMappingFiles(warnings);
    }

    // Display enhanced results
    displayResults(contentStats, validFiles, invalidFiles, results, options, seriesEnglishTitles, episodeSeriesReferences, orphanedEpisodes, fieldUsage);

    // Display errors and warnings
    displayIssues(errors, warnings, options);

    // Exit with appropriate code
    if (invalidFiles > 0) {
      log.error(`Validation completed with ${invalidFiles} invalid files`);
      process.exit(1);
    } else {
      const warningText = warnings.length > 0 ? ` with ${warnings.length} warnings` : '';
      const orphanText = orphanedEpisodes.length > 0 ? ` and ${orphanedEpisodes.length} orphaned episodes` : '';
      log.success(`All files validated successfully${warningText}${orphanText}`);
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`Validation failed: ${errorMsg}`);
    process.exit(1);
  }
}


// Helper functions
function trackFieldUsage(originalFrontmatter: any, fieldUsage: any) {
  // Track local_title vs localTitle
  if (originalFrontmatter.local_title) fieldUsage.localTitle_vs_local_title.snake_case++;
  if (originalFrontmatter.localTitle) fieldUsage.localTitle_vs_local_title.camelCase++;

  // Track sub_category vs subCategory
  if (originalFrontmatter.sub_category) fieldUsage.subCategory_vs_sub_category.snake_case++;
  if (originalFrontmatter.subCategory) fieldUsage.subCategory_vs_sub_category.camelCase++;

  // Track series_title vs seriesTitle
  if (originalFrontmatter.series_title) fieldUsage.seriesTitle_vs_series_title.snake_case++;
  if (originalFrontmatter.seriesTitle) fieldUsage.seriesTitle_vs_series_title.camelCase++;

  // Track article_type vs articleType
  if (originalFrontmatter.article_type) fieldUsage.articleType_vs_article_type.snake_case++;
  if (originalFrontmatter.articleType) fieldUsage.articleType_vs_article_type.camelCase++;

  // Track base_type vs baseType
  if (originalFrontmatter.base_type) fieldUsage.baseType_vs_base_type.snake_case++;
  if (originalFrontmatter.baseType) fieldUsage.baseType_vs_base_type.camelCase++;
}

function validateFieldFormats(frontmatter: any, issues: string[]) {
  // BaseType validation
  if (frontmatter.base_type && !['article', 'series'].includes(frontmatter.base_type)) {
    issues.push(`Invalid base_type: ${frontmatter.base_type}. Must be 'article' or 'series'`);
  }

  // ArticleType validation
  if (frontmatter.article_type && !['standard', 'original', 'original_pro'].includes(frontmatter.article_type)) {
    issues.push(`Invalid article_type: ${frontmatter.article_type}. Must be 'standard', 'original', or 'original_pro'`);
  }

  // Boolean field validation
  ['published', 'featured', 'completed'].forEach(field => {
    if (frontmatter[field] !== undefined && typeof frontmatter[field] !== 'boolean') {
      issues.push(`${field} field should be boolean (true/false)`);
    }
  });

  // Number field validation
  if (frontmatter.words !== undefined && (typeof frontmatter.words !== 'number' || frontmatter.words < 0)) {
    issues.push(`Invalid word count: ${frontmatter.words} (should be positive number)`);
  }

  if (frontmatter.episode !== undefined && (typeof frontmatter.episode !== 'number' || frontmatter.episode <= 0)) {
    issues.push(`Invalid episode number: ${frontmatter.episode} (should be positive number)`);
  }
}

function validateTags(frontmatter: any, issues: string[]) {
  if (frontmatter.tags) {
    if (typeof frontmatter.tags === 'string') {
      const tags = frontmatter.tags.split(/[,;|]/).map((t: string) => t.trim()).filter((t: string) => t.length > 0);
      if (tags.length === 0) {
        issues.push('Tags field present but no valid tags found');
      }
    } else if (Array.isArray(frontmatter.tags)) {
      const validTags = frontmatter.tags.filter((tag: any) =>
        typeof tag === 'string' && tag.trim().length > 0
      );
      if (validTags.length === 0) {
        issues.push('Tags array present but no valid tags found');
      }
    } else {
      issues.push('Invalid tags format (should be string or array)');
    }
  }
}

function validateUrls(frontmatter: any, issues: string[]) {
  ['thumbnail', 'audio'].forEach(field => {
    if (frontmatter[field]) {
      try {
        new URL(frontmatter[field]);
      } catch {
        issues.push(`Invalid ${field} URL: ${frontmatter[field]}`);
      }
    }
  });
}

function isErrorLevel(issue: string): boolean {
  const errorKeywords = [
    'Missing required fields',
    'Failed to parse',
    'Invalid.*format',
    'Unknown language code',
    'Invalid date',
    'should not have',
    'must have',
    'Episodes referencing missing series',
    'Missing reference', // strict mode additions
  ];

  return errorKeywords.some(keyword => new RegExp(keyword).test(issue));
}

// Strict preflight: ensure references exist
async function checkRefsExist(db: ReturnType<typeof getDb>, frontmatter: any, issues: string[]) {
  // Author
  if (frontmatter.author) {
    const author = await db.select({ id: authors.id }).from(authors)
      .where(and(eq(authors.name, frontmatter.author), isNull(authors.deletedAt)))
      .limit(1);
    if (author.length === 0) {
      issues.push(`Missing reference: author "${frontmatter.author}"`);
    }
  }
  // Category
  if (frontmatter.category) {
    const category = await db.select({ id: categories.id }).from(categories)
      .where(and(eq(categories.name, frontmatter.category), isNull(categories.deletedAt)))
      .limit(1);
    if (category.length === 0) {
      issues.push(`Missing reference: category "${frontmatter.category}"`);
    }
  }
  // Sub-category
  if (frontmatter.sub_category) {
    const sub = await db.select({ id: subCategories.id }).from(subCategories)
      .where(and(eq(subCategories.name, frontmatter.sub_category), isNull(subCategories.deletedAt)))
      .limit(1);
    if (sub.length === 0) {
      issues.push(`Missing reference: sub_category "${frontmatter.sub_category}"`);
    }
  }
  // Tags (string or array)
  if (frontmatter.tags) {
    const tagsToCheck: string[] = Array.isArray(frontmatter.tags)
      ? frontmatter.tags
      : String(frontmatter.tags).split(/[,;|]/).map((t: string) => t.trim()).filter(Boolean);
    for (const t of tagsToCheck) {
      const tag = await db.select({ id: tags.id }).from(tags)
        .where(and(eq(tags.name, t), isNull(tags.deletedAt)))
        .limit(1);
      if (tag.length === 0) {
        issues.push(`Missing reference: tag "${t}"`);
      }
    }
  }
}

async function validateMappingFiles(warnings: string[]) {
  const fs = require('fs');
  const path = require('path');

  const mappingDir = path.join(process.cwd(), 'src/data');
  const expectedMappings = [
    'author-mappings.hi.json',
    'category-mappings.hi.json',
    'tag-mappings.hi.json'
  ];

  for (const mapping of expectedMappings) {
    const mappingPath = path.join(mappingDir, mapping);
    if (!fs.existsSync(mappingPath)) {
      warnings.push(`Missing mapping file: ${mapping}`);
    }
  }
}

function displayResults(
  contentStats: any,
  validFiles: number,
  invalidFiles: number,
  results: any[],
  options: any,
  seriesEnglishTitles: Set<string>,
  episodeSeriesReferences: Set<string>,
  orphanedEpisodes: string[],
  fieldUsage: any
) {
  console.log('\n' + '='.repeat(70));
  console.log('ENHANCED CONTENT VALIDATION REPORT (Series-Aware)');
  console.log('='.repeat(70));

  console.log(`\n📊 Content Overview:`);
  console.log(`  📗 Series covers: ${contentStats.series}`);
  console.log(`  📖 Episodes: ${contentStats.episodes}`);
  console.log(`  📄 Standalone articles: ${contentStats.articles}`);
  console.log(`  ❓ Unknown/Invalid: ${contentStats.unknown}`);
  console.log(`  📋 Total files: ${validFiles + invalidFiles}`);

  console.log(`\n✅ Validation Summary:`);
  console.log(`  ✅ Valid files: ${validFiles}`);
  console.log(`  ⚠️  Files with warnings: ${results.filter(r => r.status === 'warning').length}`);
  console.log(`  ❌ Invalid files: ${invalidFiles}`);

  // Series cross-validation summary
  if (seriesEnglishTitles.size > 0 || episodeSeriesReferences.size > 0) {
    console.log(`\n🎬 Series Validation:`);
    console.log(`  📗 Series found: ${seriesEnglishTitles.size}`);
    console.log(`  📖 Episode references: ${episodeSeriesReferences.size}`);
    console.log(`  🔗 Orphaned episodes: ${orphanedEpisodes.length}`);

    if (seriesEnglishTitles.size > 0) {
      console.log(`  📚 Series titles: ${Array.from(seriesEnglishTitles).join(', ')}`);
    }
  }

  // Field usage summary
  console.log(`\n📝 Field Usage Patterns:`);
  Object.entries(fieldUsage).forEach(([key, usage]: [string, any]) => {
    const total = usage.snake_case + usage.camelCase;
    if (total > 0) {
      const field = key.split('_vs_')[0];
      console.log(`  ${field}: ${usage.snake_case} snake_case, ${usage.camelCase} camelCase`);
    }
  });

  if (options.verbose) {
    displayDetailedResults(results);
  }
}

function displayDetailedResults(results: any[]) {
  console.log('\n📋 Detailed Results:');

  const contentTypeIcons: Record<string, string> = {
    'series': '📗',
    'episode': '📖',
    'article': '📄',
    'unknown': '❓'
  };

  const statusIcons: Record<string, string> = {
    'valid': '✅',
    'warning': '⚠️',
    'invalid': '❌'
  };

  results.forEach(result => {
    const statusIcon = statusIcons[result.status] || '❓';
    const typeIcon = contentTypeIcons[result.contentType] || '❓';

    console.log(`${statusIcon} ${typeIcon} ${result.file}`);
    if (result.issues.length > 0) {
      result.issues.forEach((issue: string) => {
        console.log(`    • ${issue}`);
      });
    }
  });
}

function displayIssues(errors: string[], warnings: string[], options: any) {
  if (errors.length > 0) {
    console.log(`\n❌ Critical Issues (${errors.length}):`);
    errors.slice(0, 10).forEach(error => console.log(`  • ${error}`));
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more errors`);
    }
  }

  if (warnings.length > 0 && options.verbose) {
    console.log(`\n⚠️ Warnings (${warnings.length}):`);
    warnings.slice(0, 15).forEach(warning => console.log(`  • ${warning}`));
    if (warnings.length > 15) {
      console.log(`  ... and ${warnings.length - 15} more warnings`);
    }
  }
}

validateContent();
