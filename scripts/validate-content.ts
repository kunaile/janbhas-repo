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

        if (!frontmatter.words) {
          fileIssues.push('No word count specified');
        }

        // Duration format validation
        if (frontmatter.duration) {
          const duration = frontmatter.duration.toString();
          if (!duration.match(/^\d+:\d{2}$/) && !duration.match(/^\d+:\d{2}:\d{2}$/)) {
            fileIssues.push(`Invalid duration format: ${duration} (expected MM:SS or HH:MM:SS)`);
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

        // Determine status
        const hasErrors = fileIssues.some(issue =>
          issue.includes('Missing required fields') ||
          issue.includes('Failed to parse') ||
          issue.includes('Invalid duration format') ||
          issue.includes('Unknown language code')
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
      errors.forEach(error => console.log(`  • ${error}`));
    }

    if (warnings.length > 0 && options.verbose) {
      console.log(`\n⚠️ Warnings (${warnings.length}):`);
      warnings.forEach(warning => console.log(`  • ${warning}`));
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
