# Vernacular Content Management System

A **CLI-first, Git-based content management system** designed for vernacular language content. This system uses a Git repository as the CMS, with markdown files as the source of truth, and automatically syncs content to a PostgreSQL database via GitHub Actions.

## 🎯 Project Overview

This CMS is built around a **core principle**: using Git repository as the content management system. Markdown files, organized by language (`content/hi/`, `content/en/`, etc.), serve as the single source of truth. A GitHub Actions workflow automatically syncs content to a PostgreSQL database when commits contain "publish" in their messages, making the entire system deployment-free.

### Key Features

- 📝 **Markdown-first**: Pure markdown files with frontmatter for metadata
- 🌍 **Multilingual**: Built-in support for vernacular languages with transliteration
- 🤖 **AI-powered**: Google Gemini API for automatic transliteration
- 🔄 **Git-based**: Version control for all content changes
- ⚡ **CLI-focused**: Local development with comprehensive CLI commands
- 🚀 **Auto-deployment**: GitHub Actions for seamless content publishing
- 👥 **Editor tracking**: Automatic editor attribution and management
- 🔍 **Full-text search**: PostgreSQL with multilingual search capabilities
- 🛡️ **Soft deletes**: Content recovery and audit trails

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Git Repository │    │  GitHub Actions │    │  PostgreSQL DB  │
│                 │    │                 │    │                 │
│ content/        │───▶│ Smart Sync      │───▶│ Normalized      │
│ ├── hi/         │    │ Workflow        │    │ Schema          │
│ ├── en/         │    │                 │    │ + Full-text     │
│ └── ur/         │    │                 │    │   Search        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       ▲
         │                       │                       │
         ▼                       ▼                       │
┌─────────────────┐    ┌─────────────────┐              │
│ Local CLI       │    │ Gemini API      │              │
│ Development     │    │ Transliteration │──────────────┘
│ Commands        │    │                 │
└─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Node.js 20+**
- **pnpm package manager**
- **PostgreSQL database**
- **Google Gemini API key**

### Installation

1. **Clone the repository**
   ```bash
   git clone 
   cd janbhas-repo
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Setup environment variables**
   ```bash
   cp .env.example .env.local
   ```

4. **Configure your environment** (see [Environment Setup](#environment-setup))

5. **Run database migrations**
   ```bash
   pnpm db:migrate
   ```

6. **Initial content sync**
   ```bash
   pnpm sync:manual
   ```

## ⚙️ Environment Setup

Create a `.env.local` file with the following variables:

```bash
# Database Configuration
DATABASE_URL='postgresql://user:password@host:port/database'

# Google Gemini API for Transliteration
GOOGLE_GEMINI_API_KEY='your_gemini_api_key'

# Local Editor Information (for manual/local sync)
EDITOR_NAME='Your Full Name'
EDITOR_EMAIL='your.email@example.com'
EDITOR_GITHUB_USERNAME='your_github_username'
```

### GitHub Secrets (for Actions)

Configure these secrets in your GitHub repository:

```bash
DATABASE_URL=your_production_database_url
GOOGLE_GEMINI_API_KEY=your_gemini_api_key
AUTHORIZED_SYNC_USERS=username1,username2,username3
```

## 📁 Project Structure

```
.
├── .github/
│   └── workflows/
│       └── content-sync.yml          # GitHub Actions workflow
├── content/                          # Content directory (source of truth)
│   ├── hi/                          # Hindi content
│   │   ├── story1.md
│   │   └── poem1.md
│   ├── en/                          # English content
│   └── ur/                          # Urdu content
├── src/
│   ├── db/                          # Database configuration
│   │   ├── schema.ts                # Drizzle schema definitions
│   │   ├── index.ts                 # Database connection
│   │   └── migrations/              # Database migrations
│   ├── services/                    # Business logic
│   │   ├── database.ts              # Database operations
│   │   ├── contentProcessor.ts      # Content processing logic
│   │   └── geminiTransliteration.ts # AI transliteration service
│   └── utils/                       # Utility functions
│       └── transliteration.ts       # Text processing utilities
├── scripts/                         # CLI scripts
│   ├── manual-sync.ts               # First-time content population
│   ├── local-sync.ts                # Local development sync
│   ├── github-sync.ts               # GitHub Actions sync
│   └── reset-database.ts            # Database reset utility
├── drizzle.config.ts                # Drizzle ORM configuration
├── package.json                     # Dependencies and scripts
└── pnpm-lock.yaml                   # Dependency lock file
```

## 📝 Content Structure

### Frontmatter Schema

Every markdown file must include frontmatter with these fields:

```yaml
---
author: प्रेमचंद
title: एक ऑंच की कसर
lang: hi
category: short story
sub-category: classic
date: 2025-08-11
thumbnail: https://example.com/image.jpg
audio: https://example.com/audio.mp3
words: 1644
duration: 13:00
published: true
tags: [moral, classic, hindi-literature]
---

Your markdown content goes here...
```

#### Required Fields
- `author`: Author name in original language
- `title`: Title in original language  
- `lang`: Language code (hi, en, ur, etc.)
- `category`: Content category

#### Optional Fields
- `sub-category`: Subcategory classification
- `date`: Publication date (YYYY-MM-DD)
- `thumbnail`: CDN link to thumbnail image
- `audio`: CDN link to audio file
- `words`: Word count
- `duration`: Reading/listening duration (MM:SS format)
- `published`: Publication status (default: false)
- `tags`: Array of tags

### File Naming Convention

```bash
content/{language}/{date}_{title_slug}.md

# Examples:
content/hi/20250811_ek_aanch_ki_kasar.md
content/en/20250812_the_missing_ember.md
content/ur/20250813_aik_aanch_ki_kami.md
```

## 🛠️ CLI Commands

### Local Development

```bash
# Process all content files
pnpm sync:local --all

# Process only changed files (git diff)
pnpm sync:local --changed

# Process files from last commit
pnpm sync:local --recent

# Dry run to preview changes
pnpm sync:local --dry-run --verbose

# Process changes since specific commit
pnpm sync:local --since HEAD~5

# Show help
pnpm sync:local --help
```

### Initial Setup

```bash
# First-time database population
pnpm sync:manual

# Reset database (careful!)
pnpm db:reset

# Run database migrations
pnpm db:migrate
```

### Content Statistics

```bash
# View content statistics
pnpm stats

# Validate content structure
pnpm validate
```

## 🔄 Sync Workflows

### 1. Manual Sync (First Time)

**Purpose**: Initial database population
**Trigger**: `pnpm sync:manual`
**Editor Source**: Environment variables (`EDITOR_NAME`, `EDITOR_GITHUB_USERNAME`)
**Scope**: All markdown files in content directory

```bash
# Setup your editor info in .env.local
EDITOR_NAME="Your Name"
EDITOR_GITHUB_USERNAME="your_username"

# Run manual sync
pnpm sync:manual
```

### 2. Local Development Sync

**Purpose**: Ongoing local development
**Trigger**: CLI commands with various flags
**Editor Source**: Same environment variables
**Scope**: Configurable (all, changed, recent, etc.)

```bash
# Daily development workflow
pnpm sync:local --recent    # Only recent changes
pnpm sync:local --changed   # Git diff changes
```

### 3. GitHub Actions Sync

**Purpose**: Automated production deployment
**Trigger**: Commits with "publish" in message
**Editor Source**: Git commit author information
**Scope**: Only changed files (efficient)

```bash
# Trigger automated sync
git add content/hi/new_story.md
git commit -m "publish: Add new Hindi story"
git push
```

## 🤖 GitHub Actions Workflow

The automated workflow (`.github/workflows/content-sync.yml`) handles:

### Workflow Triggers
- **Branch**: `main` only
- **Path**: `content/**/*.md` files only
- **Message**: Must contain "publish"

### Security & Authorization
- Verifies authorized users against `AUTHORIZED_SYNC_USERS` secret
- Only processes commits from authorized contributors

### Smart Change Detection
- Detects added, modified, and removed files
- Handles file renames intelligently
- Skips workflow if no content changes detected

### Editor Management
- Automatically detects commit author
- Creates new editor records for new contributors
- Associates all processed content with the editor

### Example Workflow Trigger

```bash
# ✅ This will trigger the workflow
git commit -m "publish: Add new collection of poems"

# ❌ This will not trigger the workflow  
git commit -m "Update documentation"

# ❌ This will be blocked if user not in AUTHORIZED_SYNC_USERS
git commit -m "publish: Unauthorized attempt"
```

## 🗄️ Database Schema

The system uses a normalized PostgreSQL schema with soft deletes:

### Core Tables

- **`languages`**: Language definitions (hi, en, ur, etc.)
- **`authors`**: Author information with transliteration
- **`categories`**: Content categorization
- **`editors`**: User management and content attribution  
- **`articles`**: Main content with full-text search

### Key Features

- **Soft deletes**: `deletedAt` timestamp for data recovery
- **Full-text search**: GIN indexes on content and metadata
- **Multilingual support**: Original + transliterated text storage
- **Foreign key relationships**: Proper data normalization

### Search Capabilities

```sql
-- Example: Search across all content
SELECT * FROM articles 
WHERE search_vector @@ plainto_tsquery('english', 'search term')
AND deleted_at IS NULL;
```

## 🌍 Multilingual Features

### AI-Powered Transliteration

The system uses Google Gemini API for accurate phonetic transliteration:

```typescript
// Automatic transliteration of:
"प्रेमचंद" → "premchand"
"पूस की रात" → "poos ki raat" 
"कविता" → "poetry"
```

### Language Support

Currently optimized for:
- **Hindi** (`hi`): Devanagari script
- **English** (`en`): Latin script  
- **Urdu** (`ur`): Arabic script
- **Extensible**: Easy to add more languages

### Custom Author Mappings

Override AI transliteration for well-known authors:

```json
// src/data/author-mappings.hi.json
{
  "प्रेमचंद": "premchand",
  "रबींद्रनाथ टैगोर": "rabindranath-tagore"
}
```

## 🔧 Development Workflow

### Adding New Content

1. **Create markdown file**
   ```bash
   # Create in appropriate language folder
   touch content/hi/20250813_new_story.md
   ```

2. **Add frontmatter and content**
   ```markdown
   ---
   author: नया लेखक
   title: नई कहानी
   lang: hi
   category: story
   date: 2025-08-13
   published: true
   ---
   
   यहाँ आपकी कहानी का टेक्स्ट होगा...
   ```

3. **Test locally**
   ```bash
   pnpm sync:local --changed --verbose
   ```

4. **Publish to production**
   ```bash
   git add content/hi/20250813_new_story.md
   git commit -m "publish: Add new Hindi story"
   git push
   ```

### Editor Management

The system automatically tracks who edits content:

- **Local development**: Uses `EDITOR_NAME` from environment
- **GitHub commits**: Uses commit author information
- **New contributors**: Automatically creates editor records
- **Existing editors**: Links content to existing records

## 🎨 Best Practices

### Content Organization

```bash
# ✅ Good file naming
content/hi/20250813_premchand_idgah.md
content/en/20250813_premchand_idgah_english.md

# ❌ Avoid spaces and special characters
content/hi/प्रेमचंद की कहानी.md
content/en/Story with spaces!.md
```

### Frontmatter Guidelines

```yaml
# ✅ Complete frontmatter
---
author: प्रेमचंद
title: ईदगाह
lang: hi
category: short story
date: 2025-08-13
published: true
---

# ❌ Missing required fields
---
title: Some Title
published: true
---
```

### Git Workflow

```bash
# ✅ Clear commit messages
git commit -m "publish: Add Premchand collection - 5 stories"

# ✅ Batch related changes
git add content/hi/story1.md content/hi/story2.md
git commit -m "publish: Add complete Premchand short story collection"

# ❌ Vague messages
git commit -m "publish: updates"
```

## 🚨 Troubleshooting

### Common Issues

#### 1. Environment Variables Missing

```bash
# Error: EDITOR_NAME environment variable is required
# Solution: Check your .env.local file
cat .env.local | grep EDITOR_NAME
```

#### 2. Database Connection Failed

```bash
# Error: Database connection failed
# Solution: Verify DATABASE_URL format
echo $DATABASE_URL
pnpm db:migrate  # Test connection
```

#### 3. Transliteration API Issues

```bash
# Error: Google Gemini API key not configured
# Solution: Check API key configuration
echo $GOOGLE_GEMINI_API_KEY
```

#### 4. GitHub Actions Authorization

```bash
# Error: Unauthorized sync attempt
# Solution: Check AUTHORIZED_SYNC_USERS secret includes your username
```

### Debug Commands

```bash
# Verbose local sync for debugging
pnpm sync:local --dry-run --verbose

# Check database connection
pnpm db:status

# Validate content structure
pnpm validate --verbose
```

## 📊 Monitoring & Analytics

### Content Statistics

```bash
# View comprehensive stats
pnpm stats

# Example output:
# Languages: 3 (hi, en, ur)
# Authors: 25
# Categories: 8
# Total Articles: 150
# Published: 142
# Draft: 8
```

### Database Health

```bash
# Check database status
pnpm db:health

# View recent sync logs
pnpm logs --recent
```

## 🔐 Security & Permissions

### GitHub Actions Security

- **Repository secrets**: Store sensitive data securely
- **Authorized users only**: Whitelist approach for contributors
- **Branch protection**: Only `main` branch triggers sync
- **Environment validation**: Fail fast on missing configurations

### Database Security

- **Connection encryption**: TLS-enabled database connections
- **Soft deletes**: Data recovery without permanent loss
- **Audit trails**: Complete editor and change tracking

## 🚀 Deployment

### Production Setup

1. **Database setup**
   ```sql
   CREATE DATABASE vernacular_cms;
   CREATE USER cms_user WITH ENCRYPTED PASSWORD 'secure_password';
   GRANT ALL PRIVILEGES ON DATABASE vernacular_cms TO cms_user;
   ```

2. **GitHub secrets configuration**
   ```bash
   DATABASE_URL=postgresql://cms_user:secure_password@host:5432/vernacular_cms
   GOOGLE_GEMINI_API_KEY=your_production_api_key
   AUTHORIZED_SYNC_USERS=user1,user2,user3
   ```

3. **Initial migration**
   ```bash
   pnpm db:migrate
   pnpm sync:manual  # Initial content population
   ```

### Scaling Considerations

- **Database indexing**: Full-text search indexes for performance
- **API rate limits**: Gemini API batching for transliteration
- **GitHub Actions limits**: Efficient change detection
- **Content CDN**: External storage for media files

## 🤝 Contributing

### Development Setup

1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Make changes and test locally: `pnpm sync:local --changed`
4. Commit: `git commit -m "Add new feature"`
5. Push: `git push origin feature/new-feature`
6. Create Pull Request

### Content Contributions

1. Add content to appropriate language folder
2. Follow frontmatter schema
3. Test locally before publishing
4. Use clear commit messages with "publish:"

## 📞 Support

### Documentation
- **Project Summary**: `project_summary.md`
- **Database Schema**: `src/db/schema.ts`
- **CLI Help**: `pnpm sync:local --help`

### Common Resources
- **Drizzle ORM**: [Documentation](https://orm.drizzle.team/)
- **Google Gemini API**: [Documentation](https://ai.google.dev/docs)
- **GitHub Actions**: [Documentation](https://docs.github.com/en/actions)

***

**Built with ❤️ for vernacular language preservation and accessibility**