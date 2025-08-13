// src/services/contentProcessor/types.ts

export type Frontmatter = {
  author: string;
  title: string;
  category: string;
  'sub-category'?: string;
  lang: string;
  date?: string;
  thumbnail?: string;
  audio?: string;
  words?: number;
  duration?: string | number;
  published?: boolean;
  featured?: boolean;
  tags?: string | string[];
};

export type ProcessedMetadata = {
  frontmatter: Frontmatter;
  markdownContent: string;
  filePath: string;
  transliteratedAuthor: string;
  transliteratedTitle: string;
  transliteratedCategory: string;
  transliteratedSubCategory?: string;
  transliteratedTags: string[];
  slug: string;
  normalizedLang: string;
  languageName: string;
};

export type ParsedFile = Omit<ProcessedMetadata, 'transliteratedAuthor' | 'transliteratedTitle' | 'transliteratedCategory' | 'transliteratedSubCategory' | 'transliteratedTags' | 'slug'>;

export type EditorSource = 'environment' | 'git-commit';

export type SyncOptions = {
  editorSource: EditorSource;
  editorData?: any; // Will be imported from database types
  verbose?: boolean;
  dryRun?: boolean;
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
};

export type ReferenceTableMaps = {
  languageMap: Map<string, string>;
  authorMap: Map<string, string>;
  categoryMap: Map<string, string>;
  subCategoryMap: Map<string, string>;
  tagMap: Map<string, string>;
};
