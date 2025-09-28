// src/services/contentProcessor/types.ts

export type Frontmatter = {
  title: string;               // REQUIRED: English title (for slug generation)

  // Alternative field names for local title
  local_title?: string;        // Priority 1: snake_case
  localTitle?: string;         // Priority 2: camelCase

  author: string;              // REQUIRED: Author name (will use mapping)
  category: string;            // REQUIRED: Category (will use mapping)

  // Alternative field names for sub category (priority order)
  sub_category?: string;       // Priority 1: snake_case
  subCategory?: string;        // Priority 2: camelCase

  // Alternative field names for language (priority order)
  lang?: string;               // Priority 1: short form
  language?: string;           // Priority 2: full word

  thumbnail?: string;
  audio?: string;
  words?: number;
  published?: boolean;
  featured?: boolean;
  tags?: string | string[];    // Optional tags (will use mapping)

  // Alternative field names for base type (priority order)
  base_type?: 'article' | 'series';  // Priority 1: snake_case
  baseType?: 'article' | 'series';   // Priority 2: camelCase

  // Alternative field names for series reference (EPISODE ARTICLES ONLY)
  // Episodes reference the series English title, NOT local_title
  series_title?: string;       // Priority 1: snake_case - references series English title
  seriesTitle?: string;        // Priority 2: camelCase - references series English title

  episode?: number;            // For series episode articles only (display purposes)

  // Alternative field names for article type (priority order)
  article_type?: 'standard' | 'original' | 'original_pro';  // Priority 1: snake_case
  articleType?: 'standard' | 'original' | 'original_pro';   // Priority 2: camelCase

  completed?: boolean;         // For series cover pages
};

// Normalized frontmatter after processing alternatives with priority
export type NormalizedFrontmatter = {
  title: string;
  local_title: string;         // Always normalized to snake_case (from local_title || localTitle)
  author: string;
  category: string;
  sub_category?: string;       // Always normalized to snake_case (from sub_category || subCategory)
  lang: string;                // Always normalized to short form (from lang || language)
  thumbnail?: string;
  audio?: string;
  words?: number;
  published?: boolean;
  featured?: boolean;
  tags?: string | string[];
  base_type?: 'article' | 'series';      // Always normalized to snake_case (from base_type || baseType)
  series_title?: string;       // Always normalized to snake_case (from series_title || seriesTitle) - references series English title
  episode?: number;
  article_type?: 'standard' | 'original' | 'original_pro';  // Always normalized to snake_case (from article_type || articleType)
  completed?: boolean;
};

export type ProcessedMetadata = {
  frontmatter: NormalizedFrontmatter;  // Always in normalized format
  markdownContent: string;
  filePath: string;

  // Mapping-based transliteration results
  transliteratedAuthor: string;
  transliteratedCategory: string;
  transliteratedSubCategory?: string;
  transliteratedTags: string[];

  // Generated fields
  slug: string;                // Generated from title + author
  normalizedLang: string;      // Normalized language code
  languageName: string;        // Human-readable language name

  // Content type detection
  contentType: 'article' | 'series' | 'episode';
  isSeriesCover: boolean;
  isSeriesEpisode: boolean;

  // Auto-calculated series info (not from frontmatter)
  totalEpisodes?: number;      // Calculated from database, not frontmatter
};

export type ParsedFile = Omit<
  ProcessedMetadata,
  'transliteratedAuthor' | 'transliteratedCategory' | 'transliteratedSubCategory' | 'transliteratedTags' | 'slug'
>;

export type EditorSource = 'environment' | 'git-commit';

export type SyncOptions = {
  editorSource: EditorSource;
  editorData?: any;
  verbose?: boolean;
  dryRun?: boolean;
  mappingOnly?: boolean;
};

export type SyncResult = {
  totalFiles: number;
  parsedFiles: number;
  languages: number;
  authors: number;
  categories: number;
  subCategories: number;
  tags: number;
  articlesProcessed: number;
  errors: number;
  warnings: number;
  seriesProcessed: number;
  episodesProcessed: number;
  seriesReferencesFound: number;
  mappingSuccesses: number;
  mappingFailures: number;
  duplicateSlugs: number;
};

export type ReferenceTableMaps = {
  languageMap: Map<string, string>;
  authorMap: Map<string, string>;
  categoryMap: Map<string, string>;
  subCategoryMap: Map<string, string>;
  tagMap: Map<string, string>;
  seriesMap: Map<string, string>;  // series English title → seriesId mapping
};

export type MappingResult = {
  success: boolean;
  transliterated?: string;
  error?: string;
  source: 'mapping' | 'fallback';
};

export type ValidationError = {
  field: string;
  message: string;
  filePath: string;
};

export type SlugGenerationResult = {
  slug: string;
  isDuplicate: boolean;
  conflictingFile?: string;
};

export type ContentTypeInfo = {
  type: 'article' | 'series' | 'episode';
  isSeriesCover: boolean;
  isSeriesEpisode: boolean;
  seriesTitle?: string;         // The English title that this episode references
  episodeNumber?: number;
};

export type FrontmatterValidation = {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
  requiredFields: {
    title: boolean;
    local_title: boolean;
    author: boolean;
    category: boolean;
    lang: boolean;
  };
};

// Priority-based field resolution - UPDATED for series_title
export type FieldPriority = {
  local_title: [string, string];    // ['local_title', 'localTitle']
  sub_category: [string, string];   // ['sub_category', 'subCategory']
  lang: [string, string];           // ['lang', 'language']
  base_type: [string, string];      // ['base_type', 'baseType']
  series_title: [string, string];   // ['series_title', 'seriesTitle'] - references series English title
  article_type: [string, string];   // ['article_type', 'articleType']
};
