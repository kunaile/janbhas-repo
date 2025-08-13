// scripts/validate-content.ts

import { join } from 'path';
import { findMarkdownFiles, parseMarkdownFile, log } from '../src/services/contentProcessor';

function parseArgs(): {
  verbose: boolean;
  help: boolean;
} {
  const args = process.argv.slice(2);
  return {
    verbose: args.includes('--verbose'),
    help: args.includes('--help')
  };
}

function showHelp() {
  console.log(`
Content Validation Tool - Usage:

  pnpm validate [options]

Options:
  --verbose          Show detailed validation results
  --help             Show this help message

Examples:
  pnpm validate
  pnpm validate --verbose
  `);
}

async function validateContent() {
  try {
    const options = parseArgs();

    if (options.help) {
      showHelp();
      process.exit(0);
    }

    log.info('Starting content validation...');

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

    // Validation results
    const results: Array<{
      file: string;
      status: 'valid' | 'invalid' | 'warning';
      issues: string[];
    }> = [];

    for (const file of markdownFiles) {
      const relativePath = file.replace(process.cwd() + '/', '');
      const fileIssues: string[] = [];

      try {
        const parsed = parseMarkdownFile(file);

        if (!parsed) {
          fileIssues.push('Failed to parse file');
          invalidFiles++;
          results.push({ file: relativePath, status: 'invalid', issues: fileIssues });
          continue;
        }

        const { frontmatter } = parsed;

        // Required field validation
        const requiredFields = ['author', 'title', 'lang', 'category'];
        const missingFields = requiredFields.filter(field => !frontmatter[field as keyof typeof frontmatter]);

        if (missingFields.length > 0) {
          fileIssues.push(`Missing required fields: ${missingFields.join(', ')}`);
        }

        // Optional field warnings
        if (!frontmatter.date) {
          fileIssues.push('No publication date specified');
        }

        if (!frontmatter.published) {
          fileIssues.push('Article not marked as published');
        }

        // Featured field validation
        if (frontmatter.featured && !frontmatter.published) {
          fileIssues.push('Article marked as featured but not published');
        }

        if (!frontmatter.words) {
          fileIssues.push('No word count specified');
        }

        // Duration format validation
        if (frontmatter.duration) {
          const duration = frontmatter.duration.toString();
          if (!duration.match(/^\d+:\d{2}$/) && !duration.match(/^\d+:\d{2}:\d{2}$/) && isNaN(Number(duration))) {
            fileIssues.push(`Invalid duration format: ${duration} (expected MM:SS, HH:MM:SS, or number)`);
          }
        }

        // Language code validation
        const validLanguageCodes = ['hi', 'en', 'ur', 'bn', 'ta', 'te', 'ml', 'kn', 'gu', 'mr', 'pa', 'or', 'as'];
        if (!validLanguageCodes.includes(frontmatter.lang.toLowerCase())) {
          fileIssues.push(`Unknown language code: ${frontmatter.lang}`);
        }

        // File naming convention check
        const fileName = relativePath.split('/').pop() || '';
        if (!fileName.match(/^\d{8}_[a-z0-9_]+\.md$/)) {
          fileIssues.push('File name doesn\'t follow convention: YYYYMMDD_title_slug.md');
        }

        // Content validation
        if (parsed.markdownContent.length < 100) {
          fileIssues.push('Content seems too short (< 100 characters)');
        }

        // Sub-category validation
        if (frontmatter['sub-category']) {
          if (typeof frontmatter['sub-category'] !== 'string' || frontmatter['sub-category'].trim().length === 0) {
            fileIssues.push('Invalid sub-category format');
          }
        }

        // Tags validation
        if (frontmatter.tags) {
          if (typeof frontmatter.tags === 'string') {
            const tags = frontmatter.tags.split(/[,;|]/).map(t => t.trim()).filter(t => t.length > 0);
            if (tags.length === 0) {
              fileIssues.push('Tags field present but no valid tags found');
            }
          } else if (Array.isArray(frontmatter.tags)) {
            const validTags = frontmatter.tags.filter(tag =>
              typeof tag === 'string' && tag.trim().length > 0
            );
            if (validTags.length === 0) {
              fileIssues.push('Tags array present but no valid tags found');
            }
          } else {
            fileIssues.push('Invalid tags format (should be string or array)');
          }
        }

        // Featured field type validation
        if (frontmatter.featured !== undefined && typeof frontmatter.featured !== 'boolean') {
          fileIssues.push('Featured field should be boolean (true/false)');
        }

        // Published field type validation
        if (frontmatter.published !== undefined && typeof frontmatter.published !== 'boolean') {
          fileIssues.push('Published field should be boolean (true/false)');
        }

        // Date format validation
        if (frontmatter.date) {
          const datePattern = /^\d{4}-\d{2}-\d{2}$/;
          if (!datePattern.test(frontmatter.date)) {
            fileIssues.push(`Invalid date format: ${frontmatter.date} (expected YYYY-MM-DD)`);
          } else {
            const parsedDate = new Date(frontmatter.date);
            if (isNaN(parsedDate.getTime())) {
              fileIssues.push(`Invalid date value: ${frontmatter.date}`);
            }
          }
        }

        // URL validation for thumbnail and audio
        if (frontmatter.thumbnail) {
          try {
            new URL(frontmatter.thumbnail);
          } catch {
            fileIssues.push(`Invalid thumbnail URL: ${frontmatter.thumbnail}`);
          }
        }

        if (frontmatter.audio) {
          try {
            new URL(frontmatter.audio);
          } catch {
            fileIssues.push(`Invalid audio URL: ${frontmatter.audio}`);
          }
        }

        // Word count validation
        if (frontmatter.words && (typeof frontmatter.words !== 'number' || frontmatter.words < 0)) {
          fileIssues.push(`Invalid word count: ${frontmatter.words} (should be positive number)`);
        }

        // Determine status
        const hasErrors = fileIssues.some(issue =>
          issue.includes('Missing required fields') ||
          issue.includes('Failed to parse') ||
          issue.includes('Invalid duration format') ||
          issue.includes('Unknown language code') ||
          issue.includes('Invalid date format') ||
          issue.includes('Invalid date value') ||
          issue.includes('Invalid') && !issue.includes('convention')
        );

        if (hasErrors) {
          invalidFiles++;
          results.push({ file: relativePath, status: 'invalid', issues: fileIssues });
          errors.push(...fileIssues.map(issue => `${relativePath}: ${issue}`));
        } else if (fileIssues.length > 0) {
          validFiles++;
          results.push({ file: relativePath, status: 'warning', issues: fileIssues });
          warnings.push(...fileIssues.map(issue => `${relativePath}: ${issue}`));
        } else {
          validFiles++;
          results.push({ file: relativePath, status: 'valid', issues: [] });
        }

      } catch (error) {
        fileIssues.push(`Parsing error: ${error}`);
        invalidFiles++;
        results.push({ file: relativePath, status: 'invalid', issues: fileIssues });
        errors.push(`${relativePath}: ${error}`);
      }
    }

    // Display results
    console.log('\n' + '='.repeat(50));
    console.log('CONTENT VALIDATION REPORT');
    console.log('='.repeat(50));

    console.log(`\nSummary:`);
    console.log(`  Total files: ${markdownFiles.length}`);
    console.log(`  Valid files: ${validFiles}`);
    console.log(`  Files with warnings: ${results.filter(r => r.status === 'warning').length}`);
    console.log(`  Invalid files: ${invalidFiles}`);

    if (options.verbose) {
      // Show detailed results
      console.log('\nDetailed Results:');

      results.forEach(result => {
        const statusIcon = {
          'valid': '✅',
          'warning': '⚠️',
          'invalid': '❌'
        }[result.status];

        console.log(`${statusIcon} ${result.file}`);
        if (result.issues.length > 0) {
          result.issues.forEach(issue => {
            console.log(`    • ${issue}`);
          });
        }
      });
    }

    if (errors.length > 0) {
      console.log(`\n❌ Critical Issues (${errors.length}):`);
      errors.slice(0, 10).forEach(error => console.log(`  • ${error}`));
      if (errors.length > 10) {
        console.log(`  ... and ${errors.length - 10} more errors`);
      }
    }

    if (warnings.length > 0 && options.verbose) {
      console.log(`\n⚠️ Warnings (${warnings.length}):`);
      warnings.slice(0, 10).forEach(warning => console.log(`  • ${warning}`));
      if (warnings.length > 10) {
        console.log(`  ... and ${warnings.length - 10} more warnings`);
      }
    }

    if (invalidFiles > 0) {
      log.error(`Validation completed with ${invalidFiles} invalid files`);
      process.exit(1);
    } else {
      log.success(`All files validated successfully${warnings.length > 0 ? ` with ${warnings.length} warnings` : ''}`);
    }

  } catch (error) {
    log.error(`Validation failed: ${error}`);
    process.exit(1);
  }
}

validateContent();
