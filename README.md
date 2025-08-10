# Svarnac

## Technical Setup

### Installation
```bash
pnpm install
```

### Environment
```bash
# .env.local
DATABASE_URL=postgresql://username:password@localhost:5432/dbname
NODE_ENV=development
PORT=3000
```

### Database
```bash
pnpm db:generate
pnpm db:migrate
```

### Commands
```bash
pnpm dev          # Development server
pnpm build        # Build for production
pnpm start        # Production server
pnpm sync:manual  # Manual content sync (offline)
```

## How It Works

### Trigger Mechanism
- **GitHub webhook** on push to `main` branch
- **Endpoint**: `POST /webhook`
- **Processes**: `contents/**/*.md` files only
- **Manual processing**: Available via `pnpm sync:manual`

### Database Update Flow
1. **Webhook/Manual** receives file changes (added/modified/removed)
2. **Phase 1 - Reference Tables**: Populate in order
   - Languages (no dependencies)
   - Authors (no dependencies) 
   - Categories (no dependencies)
3. **Phase 2 - Articles**: Process using pre-populated reference IDs
   - Parses frontmatter metadata
   - Transliterates author/title to English using `transliteration` library
   - Generates slug: `{transliterated-title}_by_{transliterated-author}`
   - Creates/updates: Article records with foreign key relationships
4. **Soft deletes** removed files with audit trail

### Content Processing
- **First-time sync**: Creates all reference data (languages, authors, categories)
- **Subsequent syncs**: Reuses existing reference data, only creates new records if needed
- **Duplicate prevention**: Uses `findOrCreate*` functions to avoid duplicates
- **Foreign key integrity**: Reference tables populated before article processing

## Content Structure

### Directory Layout
```
contents/
├── hi/
│   └── story.md
├── bn/
│   └── poem.md
└── en/
    └── essay.md
```

### Markdown Template
```yaml
---
author: "प्रेमचंद"              # Original script (required)
title: "अंधेर"                # Original script (required)
category: "story"             # English, lowercase (required)
lang: "hi"                    # Language code (required)
date: "2024-01-15"           # YYYY-MM-DD (optional)
thumbnail: "/images/x.jpg"    # URL (optional)
audio: "/audio/x.mp3"        # URL (optional)
words: 1500                  # Number (optional)
duration: 8                  # Minutes (optional)
published: true              # Boolean (optional, default: false)
---

# Your content here...

Content goes here in markdown format.
```

### Supported Language Codes
| Code | Language | Script |
|------|----------|--------|
| `hi` | Hindi | Devanagari |
| `bn` | Bengali | Bengali |
| `ta` | Tamil | Tamil |
| `te` | Telugu | Telugu |
| `ml` | Malayalam | Malayalam |
| `kn` | Kannada | Kannada |
| `gu` | Gujarati | Gujarati |
| `mr` | Marathi | Devanagari |
| `pa` | Punjabi | Gurmukhi |
| `or` | Odia | Odia |
| `en` | English | Latin |

## Manual Content Processing

For offline processing of existing content folder:

### Setup
```bash
# Create script directory
mkdir scripts

# Copy the manual-sync.ts script (provided in documentation)

# Add to package.json scripts
{
  "scripts": {
    "sync:manual": "node --env-file=.env.local -r tsx scripts/manual-sync.ts"
  }
}
```

### Usage
```bash
# Process all markdown files in contents/ directory
pnpm sync:manual
```

### Manual Sync Features
- **Two-phase processing**: Reference tables first, then articles
- **Duplicate prevention**: Creates only new records, reuses existing ones
- **Progress tracking**: Shows what's being created vs found
- **Error isolation**: Continues processing other files if one fails
- **Comprehensive logging**: Detailed progress and summary reports
- **Validation**: Checks required frontmatter fields before processing

### Sample Output
```
🚀 Starting Manual Content Sync...
💾 Database connected
📚 Found 25 markdown files

🏗️ PHASE 1: Populating Reference Tables...
📊 Found 3 unique languages, 8 unique authors, 4 unique categories

1️⃣ Processing Languages...
   🆕 Created new language: Hindi (hi)
   🌐 Bengali (bn) → 12345678... (existing)

2️⃣ Processing Authors...
   🆕 Created new author: premchand
   👤 प्रेमचंद → premchand → 12345678...

3️⃣ Processing Categories...
   📂 story → 12345678... (existing)

🏗️ PHASE 2: Processing Articles...
✅ अंधेर by प्रेमचंद → andher_by_premchand
✅ গোরা by রবীন্দ্রনাথ ঠাকুর → gora_by_rabindranath-thakur

📊 FINAL SUMMARY:
📚 Total files found: 25
✅ Articles processed: 23
❌ Errors: 2
```

## Architecture

### Modular Structure
```
src/
├── index.ts                    # Server setup & routing
├── db/
│   ├── index.ts               # Database connection
│   ├── schema.ts              # Database schema
│   └── migrate.ts             # Migration runner
├── services/
│   ├── database.ts            # CRUD operations
│   ├── webhook.ts             # GitHub webhook handler
│   ├── fileProcessor.ts       # Git change detection
│   └── contentProcessor.ts    # Content extraction & processing
└── utils/
    └── transliteration.ts     # Text processing using standard library
```

### Data Flow
1. **GitHub Push** → Webhook Handler
2. **File Processor** → Analyzes changes (added/modified/removed)  
3. **Content Processor** → Extracts & validates frontmatter
4. **Database Service** → Creates/updates records in proper order
5. **Transliteration Utils** → Converts scripts to English for URLs/search

### Key Features
- **Soft Delete**: Non-destructive removal with `deletedAt` timestamps
- **Audit Trail**: Track who deleted content and when
- **Type Safety**: Full TypeScript implementation
- **Standard Libraries**: Uses `transliteration` library for script conversion
- **Connection Pooling**: PostgreSQL connection pool for performance
- **Error Handling**: Comprehensive error handling with detailed logging

## API Endpoints

### Health Check
```
GET /health
```
Returns server status and timestamp.

### GitHub Webhook  
```
POST /webhook
```
Processes GitHub push events for `main` branch only.

## Development

### Local Development
1. Ensure PostgreSQL is running
2. Set up `.env.local` with database credentials
3. Run migrations: `pnpm db:generate && pnpm db:migrate`
4. Start development server: `pnpm dev`
5. For initial content sync: `pnpm sync:manual`

### Production Deployment
1. Set environment variables on hosting platform
2. Build application: `pnpm build`
3. Run migrations: `pnpm db:migrate`  
4. Start server: `pnpm start`
5. Configure GitHub webhook pointing to `/webhook` endpoint

### Troubleshooting
- **Database connection issues**: Verify `DATABASE_URL` format and PostgreSQL status
- **Transliteration problems**: Check language code mapping in `utils/transliteration.ts`
- **Webhook not triggering**: Verify webhook URL accessibility and GitHub configuration
- **TypeScript errors**: Ensure all dependencies installed and schema matches database