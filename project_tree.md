.
├── .env.local
├── .github
│   └── workflows
│       └── content-sync.yml
├── .gitignore
├── LICENSE.md
├── README.md
├── content
│   └── hi
│       └── 20250811_ek_aanch_ki_kasar.md
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

