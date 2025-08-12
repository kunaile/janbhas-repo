# Project Summary: Vernacular Content Management System

## Project Overview

This project involves a **CLI-first content management system** for vernacular language content, where a GitHub repository serves as the content management system with markdown files stored in language-specific directories (`content/hi/`, `content/en/`, etc.). The system automatically updates a PostgreSQL database 
when commits are pushed with messages starting with "publish" through a GitHub Action workflow.

## Folder structure

```
.
├── LICENSE.md
├── README.md
├── content
│   └── hi
│       └── 20250812_kaante_ki_nok.md
├── drizzle.config.ts
├── package.json
├── pnpm-lock.yaml
├── project_summary.md
├── project_tree.md
├── scripts
│   ├── github-sync.ts
│   ├── manual-sync.ts
│   ├── reset-database.ts
│   └── update-authors.ts
├── src
│   ├── data
│   │   ├── author-mappings.bn.json
│   │   └── author-mappings.hi.json
│   ├── db
│   │   ├── index.ts
│   │   ├── migrate.ts
│   │   ├── migrations
│   │   │   └── 0000_lethal_argent.sql
│   │   └── schema.ts
│   ├── index.ts
│   ├── services
│   │   ├── contentProcessor.ts
│   │   ├── database.ts
│   │   ├── fileProcessor.ts
│   │   ├── geminiTransliteration.ts
│   │   └── webhook.ts
│   └── utils
│       └── transliteration.ts
└── tsconfig.json

```

## Programmer Specific Instructions

I requested several key modifications to transform Programmer existing webhook-based system:

1. **Architecture Change**: Convert from Express webhook server to CLI-first architecture for better local development and simpler deployment
2. **Type Definitions**: Use TypeScript types instead of interfaces throughout the codebase
3. **Content Structure**: Implement sub-categories and tags system while maintaining existing frontmatter simplicity
4. **Editor Tracking**: Track content editors from both environment variables (manual sync) and Git commit authors (automated sync)
5. **Dual Sync Modes**: Support both manual sync for first-time setup and Git-based sync for ongoing updates
6. **Transliteration Enhancement**: Extend existing Gemini transliteration to support categories, subcategories, and tags
7. **File Organization**: Add file path comments at the top of each module for better code organization

## Project Review and Analysis

### Existing System Strengths

- **Robust Transliteration**: Programmer existing `geminiTransliteration.ts` module using Google Gemini API provides accurate transliteration for vernacular content
- **Simple Frontmatter**: Clean, human-readable YAML structure in markdown files that's easy for content creators to manage in VSCode
- **GitHub Actions Integration**: Automated workflow (`content-sync.yml`) that processes content changes efficiently


### System Architecture

The project follows a **four-part modular structure**:

1. **Project Setup**: Environment configuration, dependencies, and TypeScript setup
2. **Database Schema**: PostgreSQL with Drizzle ORM, soft deletes, and full-text search
3. **Content Processing**: CLI commands for sync, validation, and statistics
4. **Git Integration**: Automated processing via GitHub Actions and manual sync scripts

## Key Functional Components

### Frontmatter Structure Importance

Programmer existing frontmatter design prioritizes **human readability and simplicity**:

- Required fields: `title`, `author`, `lang`, `category`
- Optional fields: `sub-category`, `tags`, `duration`, `published`, `thumbnail`, `audio`
- **Duration as string** (`"1:28"` format) for intuitive time representation
- **Auto-generated descriptions** (45-50 words) from content instead of manual entry
- **Flexible validation** with most fields optional to avoid forcing content creators


### Gemini Transliteration Module

This is a **critical component** for multilingual content management:

- **Batch processing** for efficiency with multiple content pieces
- **Enhanced prompts** for accurate phonetic transliteration of vernacular text
- **Support expansion** to handle categories, subcategories, and tags beyond just titles and authors
- **Custom mappings** for well-known author names to ensure consistency
- **Post-processing cleanup** to handle case normalization and character validation


### Sync Operations

#### Manual Sync

- **Purpose**: First-time content upload when setting up the system
- **Editor Source**: Environment variables (`EDITOR_NAME`, `EDITOR_EMAIL`, `EDITOR_GITHUB_USERNAME`)
- **Scope**: Processes all markdown files in the content directory
- **Use Case**: Initial database population and bulk content updates


#### Git Sync with GitHub Actions

- **Trigger**: Commits pushed with messages starting with "publish"
- **Editor Source**: Git commit author information
- **Scope**: Only processes changed files (added, modified, removed)
- **Workflow**: `content-sync.yml` GitHub Action handles automated processing
- **Authorization**: Validates authorized users before processing
- **Efficiency**: Detects file changes and processes only what's necessary


### Database Design Decisions

- **Soft deletes** for content recovery and audit trails
- **Full-text search indexes** for multilingual content discovery
- **Normalized schema** with proper foreign key relationships
- **Editor tracking** for content audit and attribution
- **Unique constraints** on `title + author + language` to prevent duplicates


## Key Suggestions Implemented

1. **CLI Architecture**: Replaced webhook server with comprehensive CLI commands (`sync`, `validate`, `stats`, `db:migrate`)
2. **Progress Tracking**: Added progress bars and colored output for better user experience
3. **Error Handling**: Comprehensive error reporting with clear failure messages
4. **Modular Commands**: Separated concerns into individual command files for maintainability
5. **Batch Operations**: Efficient processing of multiple files with transliteration batching
6. **Health Monitoring**: Database connection checks and content statistics reporting

## System Benefits

- **Simplified Deployment**: No server infrastructure required
- **Better Local Development**: Direct CLI access for content management
- **Automated Workflows**: GitHub Actions handle routine content updates
- **Multilingual Support**: Robust transliteration and search capabilities
- **Content Integrity**: Prevents duplicates while maintaining data relationships
- **Audit Trails**: Complete editor tracking for content changes
- **Flexible Content Structure**: Supports various content types with optional metadata

