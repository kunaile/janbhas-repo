# Janbhas Repo : Vernacular Writing Management System

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
janbhas-repo/
├── content/                    # Markdown content files
│   ├── hi/
│   ├── en/
│   └── [language-folders]
├── src/
│   ├── db/                     # Database setup and migrations
│   ├── services/
│   │   ├── contentProcessor/   # Modular content processing
│   │   │   ├── types.ts
│   │   │   ├── fileProcessor.ts
│   │   │   ├── transliterationProcessor.ts
│   │   │   └── index.ts
│   │   └── database.ts         # Database operations
│   └── utils/
│       └── transliteration.ts  # AI transliteration utilities
├── scripts/                    # CLI management tools
│   ├── manual-sync.ts
│   ├── local-sync.ts
│   ├── github-sync.ts
│   └── [utility-scripts]
└── package.json
```

## 🔧 How It Works

### 1. **Content Creation**
Writers create markdown files with YAML frontmatter in their native language:

```markdown
---
author: प्रेमचंद
title: कफ़न
category: short story
sub-category: सामाजिक कहानी
lang: hi
published: true
featured: true
tags: [classic, social-realism]
---

Your story content in Hindi/Bengali/etc...
```

### 2. **AI Processing**
- **Google Gemini API** transliterates titles, authors, categories, and tags
- Maintains both original vernacular and romanized versions
- Generates SEO-friendly slugs automatically

### 3. **Database Storage**
- **PostgreSQL** with comprehensive schema
- Stores both original (`localName`) and transliterated (`name`) versions
- Full-text search indexes for both languages
- Relationships: articles ↔ authors ↔ categories ↔ tags

### 4. **Sync Workflows**
- **Manual Sync**: Process all content files
- **Local Sync**: Process only changed files during development
- **GitHub Sync**: Automated processing via GitHub Actions

## 📋 Prerequisites

### Required Software
- **Node.js** 22 or higher
- **PostgreSQL** 17 or higher
- **pnpm** package manager

### API Keys
- **Google Gemini API Key** for transliteration
- **Database connection** (local or hosted)

### Environment Setup
```bash
# Install Node.js dependencies
pnpm install

```

### Environment Variables
```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/janbhas

# AI Transliteration
GOOGLE_GEMINI_API_KEY=your_gemini_api_key

# Editor Information
EDITOR_NAME=Your Name
EDITOR_EMAIL=your.email@example.com
EDITOR_GITHUB_USERNAME=yourusername
```

## 🚀 How to Use

### 1. Initial Setup
```bash
# Clone repository
git clone https://github.com/your-username/janbhas-repo.git
cd janbhas-repo

# Install dependencies
pnpm install

# Setup environment
touch .env.local
# Edit .env.local with your database and API credentials

# Initialize database
pnpm db:migrate
```

### 2. Content Management

#### Create Content
```bash
# Create a new story file
mkdir -p content/hi
```

Create `content/hi/kafan.md`:
```markdown
---
author: प्रेमचंद
title: कफ़न
category: कहानी
lang: hi
date: 2024-12-01
published: true
featured: true
words: 1500
duration: 12:00
tags: [सामाजिक, क्लासिक]
---

Your Hindi story content here...
```

#### Sync Content to Database
```bash
# Sync all content files
pnpm sync:manual

# Sync only changed files (development)
pnpm sync:local --recent

```

### 3. Database Management

```bash
# Check database health
pnpm db:health

# View database status
pnpm db:status

# Reset database (careful!)
pnpm db:reset
```

### 4. Content Operations

```bash
# Generate content statistics
pnpm stats

# Validate all content files
pnpm validate --verbose

# View recent activity
pnpm logs --recent --limit=20

# View only featured content activity
pnpm logs --featured

# Update author transliterations
pnpm db:update-authors --update-mappings
```

### 5. Development Workflow

```bash
# Add new content
vim content/hindi/new-story.md

# Preview changes
pnpm validate
pnpm sync:local --dry-run --verbose

# Sync to database
pnpm sync:local --recent

# Check results
pnpm stats
pnpm logs --recent
```

### 6. Production Deployment

The system supports automated GitHub Actions deployment:

1. **Push content** to your repository
2. **GitHub Actions** automatically triggers `github-sync.ts`
3. **Changed files** are processed and synced to production database
4. **AI transliteration** happens automatically
5. **Content goes live** with proper SEO slugs

## 🎯 Key Features

### Multi-Language Support
- **Hindi, Bengali, Tamil, Telugu, Malayalam, Kannada, Gujarati, Marathi, Punjabi, Odia, Assamese**
- Custom author mappings for accurate transliterations
- Language-specific content organization

### Rich Content Metadata
- **Categories & Sub-categories**: Organize content hierarchically
- **Tags**: Flexible content labeling
- **Featured Articles**: Editorial highlighting
- **Publication Workflow**: Draft → Published states
- **Audio Support**: Duration and audio file links

### Advanced Search & Discovery
- **Vernacular Search**: Search in original scripts
- **Transliterated Search**: Search using English keyboard
- **Full-text Indexing**: Content, titles, authors, categories
- **Metadata Filtering**: By language, category, author, tags

### Editorial Tools
- **Content Validation**: Automatic format checking
- **Health Monitoring**: Database integrity checks
- **Activity Logging**: Track all content changes
- **Statistics Dashboard**: Comprehensive content metrics
- **Batch Operations**: Bulk content processing

## 🤝 Contributing

1. **Fork** the repository
2. **Create content** in `content/[language]/` directory
3. **Follow frontmatter format** as shown in examples
4. **Test locally** with `pnpm sync:local --dry-run`
5. **Submit pull request** with descriptive commit messages

## 📊 Example Usage Stats

After setup, you'll see comprehensive statistics:
```
📚 Content Overview:
  • Languages: 3
  • Authors: 15
  • Categories: 5
  • Sub-categories: 12
  • Tags: 45
  • Total Articles: 150
  • Published: 120
  • Featured: 25
  • Drafts: 30
```

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

**Built with ❤️ for preserving and promoting vernacular writtings**