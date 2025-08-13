# Vernacular Content Management System: Project Instructions

-----

## 1\. Project Overview

This is a CLI-first content management system designed for vernacular language content. The **core principle** is using a Git repository as the CMS. Markdown files, organized by language (`content/hi/`, `content/en/`, etc.), are the source of truth.

A GitHub Actions workflow is triggered by commits with "publish" in their messages. This action automatically syncs the content to a PostgreSQL database, making the entire system deployment-free.

-----

## 2\. Project Architecture & Key Components

The system is built on a modular, four-part structure:

  * **Project Setup**: Core configuration using `pnpm` and TypeScript.
  * **Database Schema**: A PostgreSQL database with a Drizzle ORM schema, soft deletes, and full-text search capabilities.
  * **Content Processing**: CLI commands to handle syncing, validation, and content statistics.
  * **Git Integration**: Automated workflows via GitHub Actions and manual sync scripts for both initial setup and ongoing updates.

### Folder Structure

The project has a clear folder structure to organize all components.

```
.
├── .github
│   └── workflows
│       └── content-sync.yml
├── content
│   └── hi
│       ├── 20250811_ek_aanch_ki_kasar.md
│       └── ... more articles.md files
├── drizzle.config.ts
├── package.json
├── pnpm-lock.yaml
├── project_summary.md
├── project_tree.md
├── scripts
│   ├── github-sync.ts
│   ├── local-sync.ts
│   ├── manual-sync.ts
│   ├── reset-database.ts
│   └── update-authors.ts
├── src
│   ├── data
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
│       └── transliteration.ts
└── ...
```

-----

## 3\. How to Work on the Project

### Prerequisites

You need the following to get started:

  * **Node.js 20+**
  * **pnpm package manager**
  * **PostgreSQL database**
  * **Google Gemini API key** (for transliteration)
  * A Git repository with a `content/` folder structure.

What to Avoid ❌

- Using npm instead of pnpm (slower dependency resolution)
- Mixing environment variables across files (centralize in .env.local)
- Hardcoding API keys or database URLs in source code
- Using outdated Node.js versions (breaks modern TypeScript features)

### Syncing Content Locally

The project uses a CLI-first approach, making local development straightforward. Use the `pnpm sync:local` command with various flags:

```bash
# Process all content files
pnpm sync:local --all

# Process only changed files (git diff)
pnpm sync:local --changed

# Process files from last commit
pnpm sync:local --recent

# Dry run to see what would be processed
pnpm sync:local --dry-run --verbose

# Process changes since a specific commit
pnpm sync:local --since HEAD~5

# Verbose output with all details
pnpm sync:local --all --verbose

# Help
pnpm sync:local --help
```

### Git Sync with GitHub Actions

The automated workflow (`content-sync.yml`) is triggered by specific commit messages.

  * **Trigger**: Commits pushed with messages containing `"publish"`.
  * **Scope**: Only processes changed files (added, modified, removed).
  * **Editor Tracking**: Uses Git commit author information for content attribution.

### Frontmatter Structure

The frontmatter in the markdown files is designed for simplicity and human readability.

  * **Required Fields**: `title`, `author`, `lang`, `category`
  * **Optional Fields**: `sub-category`, `tags`, `duration`, `published`, `thumbnail`, `audio`
  * **Duration Format**: A string like `"1:28"`
  * **Description**: Auto-generated (45-50 words) from the content.

Here's an example:

```markdown
---
author: प्रेमचंद
title: एक ऑंच की कसर
lang: hi
category: short story
sub-category: 
date: 2025-08-11
thumbnail: https://image-cdn-fa.spotifycdn.com/image/ab67656300005f1fd34ae731114b03437d8261a7
audio: https://open.spotify.com/embed/episode/4CJqXACjnxAIzpUZtBvEwV
words: 1644
duration: 13:00
published: true
---
```

-----

## 4\. Key Functional Components

### Gemini Transliteration Module

This is a **critical component** for multilingual content management:

- **Batch processing** for efficiency with multiple content pieces
- **Enhanced prompts** for accurate phonetic transliteration of vernacular text
- **Support expansion** to handle categories, subcategories, and tags beyond just titles and authors
- **Custom mappings** for well-known author names to ensure consistency
- **Post-processing cleanup** to handle case normalization and character validation

#### Prompt Sample

```
You are an expert in Indian language transliteration. Convert the following texts to accurate English transliteration with proper phonetic pronunciation.

CRITICAL REQUIREMENTS:
1. ALWAYS start transliterated words with the correct first letter - never omit it
2. Use proper phonetic accuracy (e.g., "पूस की रात" = "poos ki raat", NOT "puus kii raat")
3. Use natural word spacing and pronunciation
4. For author names, use commonly accepted transliterations if known
5. For categories/subcategories/tags, use simple, clear English equivalents
6. Each transliteration must be complete - no missing letters or characters
7. Return ONLY valid JSON array with no additional text or formatting

EXAMPLES OF CORRECT OUTPUT:
- "प्रेमचंद" (author) should become "premchand"
- "गुल्ली डण्डा" (title) should become "gulli danda"
- "पूस की रात" (title) should become "poos ki raat"
- "बाल कथाएँ" (category) should become "children stories"
- "कविता" (category) should become "poetry"
- "नैतिक कहानी" (tag) should become "moral story"

INPUT TEXTS:
${languagePrompts}

REQUIRED JSON OUTPUT FORMAT (use lowercase transliterations):
[
  {
    "index": 0,
    "original": "original_text",
    "transliterated": "lowercase transliteration",
    "type": "title_or_author_or_category_or_subcategory_or_tag"
  }
]

Return ONLY the JSON array, no other text.
```

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

***

## Module Instructions

```typescript
// src/types/index.ts - All shared type definitions (not interfaces)
// Usage: import type { Article, Frontmatter } from '../types'
// Purpose: Single source of truth for all TypeScript types across the project

// src/db/schema.ts - Database table definitions and relationships
// Usage: Import tables for queries, run migrations to create structure
// Purpose: Defines normalized schema with soft deletes and search indexes

// src/db/operations.ts - CRUD operations abstraction layer
// Usage: import { upsertArticle, findOrCreateAuthor } from './operations'
// Purpose: Provides type-safe database operations with business logic

// src/services/geminiTransliteration.ts - Enhanced AI-powered transliteration
// Usage: await batchTransliterate([{text: 'हिंदी', type: 'title', language: 'hi'}])
// Purpose: Converts vernacular text to English using Google Gemini API, now supports categories/tags

// src/services/transliteration.ts - Transliteration utilities
// Usage: import { createSlug, normalizeText } from './transliteration'
// Purpose: Text processing utilities for URL generation and normalization

// src/db/migrate.ts - Database migration utilities
// Usage: import { runMigrations } from './migrate'
// Purpose: Handles database schema changes and migrations
```

***


## Key Architectural Decisions Explained

### **Why Soft Deletes:**

- Content recovery capabilities for editorial workflows
- Audit trail maintenance for compliance
- Better data integrity than hard deletes
- Supports content versioning and rollback


### **Why Full-Text Search Indexes:**

- PostgreSQL's `gin` indexes provide excellent multilingual search
- Combines original text, local text, and transliterated versions
- Enables fuzzy matching across different scripts
- Scales well with growing content volume


### **Why Normalized Schema:**

- Reduces data duplication and inconsistency
- Enables efficient queries across relationships
- Supports multilingual metadata properly
- Future-proof for additional content types


### **Why Type Definitions Over Interfaces:**

- User specifically requested types instead of interfaces
- Types are more flexible for union types and complex mappings
- Better for functional programming patterns
- Consistent with modern TypeScript best practices

***

