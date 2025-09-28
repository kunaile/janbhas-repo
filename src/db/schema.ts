// src/db/schema.ts

import {
  pgTable,
  index,
  text,
  varchar,
  timestamp,
  boolean,
  integer,
  decimal,
  jsonb,
  uuid,
  pgEnum,
  unique
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

// --- Enhanced Enums ---
export const articleTypes = pgEnum('article_type', [
  'standard',      // Curated public content (free)
  'original',      // Company-created content (free) 
  'original_pro',  // Company-created premium content
]);

// --- Base Table Schema for common fields ---
const baseTable = () => ({
  id: uuid('id').defaultRandom().primaryKey(),
  uid: uuid('uid').defaultRandom().notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by').notNull().references(() => editors.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: uuid('updated_by').notNull().references(() => editors.id),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: uuid('deleted_by').references(() => editors.id),
});

/* ------------------------------------------------------------------ */
/*                               Editors                              */
/* ------------------------------------------------------------------ */

export const editors = pgTable(
  'editors',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    uid: uuid('uid').defaultRandom().notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }),
    imageUrl: text('image_url'),
    githubUserName: varchar('github_user_name', { length: 255 }),
  },
  (t) => ({
    emailIdx: index('editors_email_idx').on(t.email),
    githubIdx: index('editors_github_idx').on(t.githubUserName),
  })
);

export const editorsRelations = relations(editors, ({ many }) => ({
  articles: many(articles),
  series: many(series),
  publicationEvents: many(publicationEvents),
  // Base table relations
  createdAuthors: many(authors, { relationName: 'createdBy' }),
  updatedAuthors: many(authors, { relationName: 'updatedBy' }),
  deletedAuthors: many(authors, { relationName: 'deletedBy' }),
}));

/* ------------------------------------------------------------------ */
/*                              Authors                               */
/* ------------------------------------------------------------------ */

export const authors = pgTable(
  'authors',
  {
    ...baseTable(),
    name: varchar('name', { length: 255 }).notNull(),
    bio: text('bio'),
    imageUrl: text('image_url'),
  },
  (t) => ({
    nameIdx: index('authors_name_idx').on(t.name),
  })
);

export const authorsRelations = relations(authors, ({ one, many }) => ({
  articles: many(articles),
  series: many(series),
  authorTranslations: many(authorTranslations),
  // Base table relations
  createdByEditor: one(editors, {
    fields: [authors.createdBy],
    references: [editors.id],
    relationName: 'createdBy',
  }),
  updatedByEditor: one(editors, {
    fields: [authors.updatedBy],
    references: [editors.id],
    relationName: 'updatedBy',
  }),
  deletedByEditor: one(editors, {
    fields: [authors.deletedBy],
    references: [editors.id],
    relationName: 'deletedBy',
  }),
}));

/* ------------------------------------------------------------------ */
/*                         Author Translations                       */
/* ------------------------------------------------------------------ */

export const authorTranslations = pgTable(
  'author_translations',
  {
    ...baseTable(),
    authorId: uuid('author_id').notNull().references(() => authors.id, { onDelete: 'cascade' }),
    languageId: uuid('language_id').notNull().references(() => languages.id, { onDelete: 'cascade' }),
    localName: varchar('local_name', { length: 255 }).notNull(),
    bio: text('bio'),
  },
  (t) => ({
    authorLanguageIdx: index('author_translations_author_language_idx').on(t.authorId, t.languageId),
    uniqueAuthorLanguage: unique('author_translations_author_language_unique').on(t.authorId, t.languageId),
  })
);

export const authorTranslationsRelations = relations(authorTranslations, ({ one }) => ({
  author: one(authors, {
    fields: [authorTranslations.authorId],
    references: [authors.id],
  }),
  language: one(languages, {
    fields: [authorTranslations.languageId],
    references: [languages.id],
  }),
  // Base table relations
  createdByEditor: one(editors, {
    fields: [authorTranslations.createdBy],
    references: [editors.id],
  }),
  updatedByEditor: one(editors, {
    fields: [authorTranslations.updatedBy],
    references: [editors.id],
  }),
  deletedByEditor: one(editors, {
    fields: [authorTranslations.deletedBy],
    references: [editors.id],
  }),
}));

/* ------------------------------------------------------------------ */
/*                             Languages                              */
/* ------------------------------------------------------------------ */

export const languages = pgTable(
  'languages',
  {
    ...baseTable(),
    name: varchar('name', { length: 255 }).notNull().unique(),
    code: varchar('code', { length: 10 }).notNull().unique(),
  }
);

export const languagesRelations = relations(languages, ({ one, many }) => ({
  articles: many(articles),
  series: many(series),
  authorTranslations: many(authorTranslations),
  categoryTranslations: many(categoryTranslations),
  subCategoryTranslations: many(subCategoryTranslations),
  tagTranslations: many(tagTranslations),
  // Base table relations
  createdByEditor: one(editors, {
    fields: [languages.createdBy],
    references: [editors.id],
  }),
  updatedByEditor: one(editors, {
    fields: [languages.updatedBy],
    references: [editors.id],
  }),
  deletedByEditor: one(editors, {
    fields: [languages.deletedBy],
    references: [editors.id],
  }),
}));

/* ------------------------------------------------------------------ */
/*                            Categories                              */
/* ------------------------------------------------------------------ */

export const categories = pgTable(
  'categories',
  {
    ...baseTable(),
    name: varchar('name', { length: 255 }).notNull().unique(),
  },
  (t) => ({
    nameIdx: index('categories_name_idx').on(t.name),
  })
);

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  articles: many(articles),
  series: many(series),
  subCategories: many(subCategories),
  categoryTranslations: many(categoryTranslations),
  // Base table relations
  createdByEditor: one(editors, {
    fields: [categories.createdBy],
    references: [editors.id],
  }),
  updatedByEditor: one(editors, {
    fields: [categories.updatedBy],
    references: [editors.id],
  }),
  deletedByEditor: one(editors, {
    fields: [categories.deletedBy],
    references: [editors.id],
  }),
}));

/* ------------------------------------------------------------------ */
/*                       Category Translations                       */
/* ------------------------------------------------------------------ */

export const categoryTranslations = pgTable(
  'category_translations',
  {
    ...baseTable(),
    categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
    languageId: uuid('language_id').notNull().references(() => languages.id, { onDelete: 'cascade' }),
    localName: varchar('local_name', { length: 255 }).notNull(),
  },
  (t) => ({
    categoryLanguageIdx: index('category_translations_category_language_idx').on(t.categoryId, t.languageId),
    uniqueCategoryLanguage: unique('category_translations_category_language_unique').on(t.categoryId, t.languageId),
  })
);

export const categoryTranslationsRelations = relations(categoryTranslations, ({ one }) => ({
  category: one(categories, {
    fields: [categoryTranslations.categoryId],
    references: [categories.id],
  }),
  language: one(languages, {
    fields: [categoryTranslations.languageId],
    references: [languages.id],
  }),
  // Base table relations
  createdByEditor: one(editors, {
    fields: [categoryTranslations.createdBy],
    references: [editors.id],
  }),
  updatedByEditor: one(editors, {
    fields: [categoryTranslations.updatedBy],
    references: [editors.id],
  }),
  deletedByEditor: one(editors, {
    fields: [categoryTranslations.deletedBy],
    references: [editors.id],
  }),
}));

/* ------------------------------------------------------------------ */
/*                          Sub-Categories                            */
/* ------------------------------------------------------------------ */

export const subCategories = pgTable(
  'sub_categories',
  {
    ...baseTable(),
    name: varchar('name', { length: 255 }).notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    categoryIdx: index('sub_categories_category_idx').on(t.categoryId),
    nameIdx: index('sub_categories_name_idx').on(t.name),
  })
);

export const subCategoriesRelations = relations(subCategories, ({ one, many }) => ({
  category: one(categories, {
    fields: [subCategories.categoryId],
    references: [categories.id],
  }),
  articles: many(articles),
  series: many(series),
  subCategoryTranslations: many(subCategoryTranslations),
  // Base table relations
  createdByEditor: one(editors, {
    fields: [subCategories.createdBy],
    references: [editors.id],
  }),
  updatedByEditor: one(editors, {
    fields: [subCategories.updatedBy],
    references: [editors.id],
  }),
  deletedByEditor: one(editors, {
    fields: [subCategories.deletedBy],
    references: [editors.id],
  }),
}));

/* ------------------------------------------------------------------ */
/*                    Sub-Category Translations                      */
/* ------------------------------------------------------------------ */

export const subCategoryTranslations = pgTable(
  'sub_category_translations',
  {
    ...baseTable(),
    subCategoryId: uuid('sub_category_id').notNull().references(() => subCategories.id, { onDelete: 'cascade' }),
    languageId: uuid('language_id').notNull().references(() => languages.id, { onDelete: 'cascade' }),
    localName: varchar('local_name', { length: 255 }).notNull(),
  },
  (t) => ({
    subCategoryLanguageIdx: index('sub_category_translations_sub_category_language_idx').on(t.subCategoryId, t.languageId),
    uniqueSubCategoryLanguage: unique('sub_category_translations_sub_category_language_unique').on(t.subCategoryId, t.languageId),
  })
);

export const subCategoryTranslationsRelations = relations(subCategoryTranslations, ({ one }) => ({
  subCategory: one(subCategories, {
    fields: [subCategoryTranslations.subCategoryId],
    references: [subCategories.id],
  }),
  language: one(languages, {
    fields: [subCategoryTranslations.languageId],
    references: [languages.id],
  }),
  // Base table relations
  createdByEditor: one(editors, {
    fields: [subCategoryTranslations.createdBy],
    references: [editors.id],
  }),
  updatedByEditor: one(editors, {
    fields: [subCategoryTranslations.updatedBy],
    references: [editors.id],
  }),
  deletedByEditor: one(editors, {
    fields: [subCategoryTranslations.deletedBy],
    references: [editors.id],
  }),
}));

/* ------------------------------------------------------------------ */
/*                                Tags                                */
/* ------------------------------------------------------------------ */

export const tags = pgTable(
  'tags',
  {
    ...baseTable(),
    name: varchar('name', { length: 100 }).notNull().unique(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
  },
  (t) => ({
    slugIdx: index('tags_slug_idx').on(t.slug),
  })
);

export const tagsRelations = relations(tags, ({ one, many }) => ({
  articleTags: many(articleTags),
  tagTranslations: many(tagTranslations),
  // Base table relations
  createdByEditor: one(editors, {
    fields: [tags.createdBy],
    references: [editors.id],
  }),
  updatedByEditor: one(editors, {
    fields: [tags.updatedBy],
    references: [editors.id],
  }),
  deletedByEditor: one(editors, {
    fields: [tags.deletedBy],
    references: [editors.id],
  }),
}));

/* ------------------------------------------------------------------ */
/*                         Tag Translations                          */
/* ------------------------------------------------------------------ */

export const tagTranslations = pgTable(
  'tag_translations',
  {
    ...baseTable(),
    tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
    languageId: uuid('language_id').notNull().references(() => languages.id, { onDelete: 'cascade' }),
    localName: varchar('local_name', { length: 100 }).notNull(),
  },
  (t) => ({
    tagLanguageIdx: index('tag_translations_tag_language_idx').on(t.tagId, t.languageId),
    uniqueTagLanguage: unique('tag_translations_tag_language_unique').on(t.tagId, t.languageId),
  })
);

export const tagTranslationsRelations = relations(tagTranslations, ({ one }) => ({
  tag: one(tags, {
    fields: [tagTranslations.tagId],
    references: [tags.id],
  }),
  language: one(languages, {
    fields: [tagTranslations.languageId],
    references: [languages.id],
  }),
  // Base table relations
  createdByEditor: one(editors, {
    fields: [tagTranslations.createdBy],
    references: [editors.id],
  }),
  updatedByEditor: one(editors, {
    fields: [tagTranslations.updatedBy],
    references: [editors.id],
  }),
  deletedByEditor: one(editors, {
    fields: [tagTranslations.deletedBy],
    references: [editors.id],
  }),
}));

/* ------------------------------------------------------------------ */
/*                               Series                               */
/* ------------------------------------------------------------------ */

export const series = pgTable(
  'series',
  {
    ...baseTable(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    title: varchar('title', { length: 255 }).notNull(),
    localTitle: varchar('local_title', { length: 255 }),
    shortDescription: text('short_description'),
    markdownContent: text('markdown_content').notNull(),
    thumbnailUrl: varchar('thumbnail_url', { length: 500 }),
    totalEpisodes: integer('total_episodes').default(0).notNull(),
    totalWordCount: integer('total_word_count').default(0),
    isPublished: boolean('is_published').default(false).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: uuid('published_by').references(() => editors.id),
    isFeatured: boolean('is_featured').default(false).notNull(),
    featuredAt: timestamp('featured_at', { withTimezone: true }),
    featuredBy: uuid('featured_by').references(() => editors.id),
    isComplete: boolean('is_complete').default(false).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    languageId: uuid('language_id')
      .notNull()
      .references(() => languages.id),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    subCategoryId: uuid('sub_category_id').references(() => subCategories.id, { onDelete: 'set null' }),
    authorId: uuid('author_id').references(() => authors.id, { onDelete: 'set null' }),
    editorId: uuid('editor_id').references(() => editors.id, { onDelete: 'set null' }),
    // Denormalized multilingual fields
    authorName: varchar('author_name', { length: 255 }).notNull(),
    authorLocalName: varchar('author_local_name', { length: 255 }),
    categoryName: varchar('category_name', { length: 255 }).notNull(),
    categoryLocalName: varchar('category_local_name', { length: 255 }),
    subCategoryName: varchar('sub_category_name', { length: 255 }),
    subCategoryLocalName: varchar('sub_category_local_name', { length: 255 }),
  },
  (t) => ({
    slugIdx: index('series_slug_idx').on(t.slug),
    publishedIdx: index('series_published_idx').on(t.isPublished, t.publishedAt.desc()),
    featuredIdx: index('series_featured_idx').on(t.isFeatured, t.publishedAt.desc()),
    languageIdx: index('series_language_idx').on(t.languageId),
    categoryIdx: index('series_category_idx').on(t.categoryId),
    authorIdx: index('series_author_idx').on(t.authorId),
  })
);

export const seriesRelations = relations(series, ({ one, many }) => ({
  language: one(languages, {
    fields: [series.languageId],
    references: [languages.id],
  }),
  category: one(categories, {
    fields: [series.categoryId],
    references: [categories.id],
  }),
  subCategory: one(subCategories, {
    fields: [series.subCategoryId],
    references: [subCategories.id],
  }),
  author: one(authors, {
    fields: [series.authorId],
    references: [authors.id],
  }),
  editor: one(editors, {
    fields: [series.editorId],
    references: [editors.id],
  }),
  publishedByEditor: one(editors, {
    fields: [series.publishedBy],
    references: [editors.id],
  }),
  featuredByEditor: one(editors, {
    fields: [series.featuredBy],
    references: [editors.id],
  }),
  // Base table relations
  createdByEditor: one(editors, {
    fields: [series.createdBy],
    references: [editors.id],
  }),
  updatedByEditor: one(editors, {
    fields: [series.updatedBy],
    references: [editors.id],
  }),
  deletedByEditor: one(editors, {
    fields: [series.deletedBy],
    references: [editors.id],
  }),
  articles: many(articles),
  publicationEvents: many(publicationEvents, { relationName: 'seriesEvents' }),
}));

/* ------------------------------------------------------------------ */
/*                     Article-Tags Junction                          */
/* ------------------------------------------------------------------ */

export const articleTags = pgTable(
  'article_tags',
  {
    ...baseTable(),
    articleId: uuid('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    // Denormalized tag fields for performance
    tagName: varchar('tag_name', { length: 100 }),
    tagLocalName: varchar('tag_local_name', { length: 100 }),
  },
  (t) => ({
    articleIdx: index('article_tags_article_idx').on(t.articleId),
    tagIdx: index('article_tags_tag_idx').on(t.tagId),
    uniqueArticleTag: unique('article_tags_article_tag_unique').on(t.articleId, t.tagId),
  })
);

export const articleTagsRelations = relations(articleTags, ({ one }) => ({
  article: one(articles, {
    fields: [articleTags.articleId],
    references: [articles.id],
  }),
  tag: one(tags, {
    fields: [articleTags.tagId],
    references: [tags.id],
  }),
  // Base table relations
  createdByEditor: one(editors, {
    fields: [articleTags.createdBy],
    references: [editors.id],
  }),
  updatedByEditor: one(editors, {
    fields: [articleTags.updatedBy],
    references: [editors.id],
  }),
  deletedByEditor: one(editors, {
    fields: [articleTags.deletedBy],
    references: [editors.id],
  }),
}));

/* ------------------------------------------------------------------ */
/*                               Articles                             */
/* ------------------------------------------------------------------ */

export const articles = pgTable(
  'articles',
  {
    ...baseTable(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    title: varchar('title', { length: 255 }).notNull(),
    localTitle: varchar('local_title', { length: 255 }),
    shortDescription: text('short_description'),
    markdownContent: text('markdown_content').notNull(),
    thumbnailUrl: varchar('thumbnail_url', { length: 500 }),
    audioUrl: varchar('audio_url', { length: 500 }),
    wordCount: integer('word_count'),
    articleType: articleTypes('article_type').default('standard').notNull(),
    seriesId: uuid('series_id').references(() => series.id, { onDelete: 'set null' }),
    episodeNumber: integer('episode_number'),
    isPublished: boolean('is_published').default(false).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: uuid('published_by').references(() => editors.id),
    isFeatured: boolean('is_featured').default(false).notNull(),
    featuredAt: timestamp('featured_at', { withTimezone: true }),
    featuredBy: uuid('featured_by').references(() => editors.id),
    languageId: uuid('language_id')
      .notNull()
      .references(() => languages.id),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    subCategoryId: uuid('sub_category_id').references(() => subCategories.id, { onDelete: 'set null' }),
    authorId: uuid('author_id').references(() => authors.id, { onDelete: 'set null' }),
    editorId: uuid('editor_id').references(() => editors.id, { onDelete: 'set null' }),
    // Denormalized multilingual fields
    authorName: varchar('author_name', { length: 255 }).notNull(),
    authorLocalName: varchar('author_local_name', { length: 255 }),
    categoryName: varchar('category_name', { length: 255 }).notNull(),
    categoryLocalName: varchar('category_local_name', { length: 255 }),
    subCategoryName: varchar('sub_category_name', { length: 255 }),
    subCategoryLocalName: varchar('sub_category_local_name', { length: 255 }),
  },
  (t) => ({
    slugIdx: index('articles_slug_idx').on(t.slug),
    publishedIdx: index('articles_published_idx').on(t.isPublished, t.publishedAt.desc()),
    featuredIdx: index('articles_featured_idx').on(t.isFeatured),
    languageIdx: index('articles_language_idx').on(t.languageId),
    categoryIdx: index('articles_category_idx').on(t.categoryId),
    authorIdx: index('articles_author_idx').on(t.authorId),
    seriesEpisodeIdx: index('articles_series_episode_idx').on(t.seriesId, t.episodeNumber),
    typeIdx: index('articles_type_idx').on(t.articleType),
    publishedCategoryIdx: index('articles_published_category_idx').on(t.isPublished, t.categoryId, t.languageId),
  })
);

export const articlesRelations = relations(articles, ({ one, many }) => ({
  language: one(languages, {
    fields: [articles.languageId],
    references: [languages.id],
  }),
  category: one(categories, {
    fields: [articles.categoryId],
    references: [categories.id],
  }),
  subCategory: one(subCategories, {
    fields: [articles.subCategoryId],
    references: [subCategories.id],
  }),
  author: one(authors, {
    fields: [articles.authorId],
    references: [authors.id],
  }),
  editor: one(editors, {
    fields: [articles.editorId],
    references: [editors.id],
  }),
  series: one(series, {
    fields: [articles.seriesId],
    references: [series.id],
  }),
  publishedByEditor: one(editors, {
    fields: [articles.publishedBy],
    references: [editors.id],
  }),
  featuredByEditor: one(editors, {
    fields: [articles.featuredBy],
    references: [editors.id],
  }),
  // Base table relations
  createdByEditor: one(editors, {
    fields: [articles.createdBy],
    references: [editors.id],
  }),
  updatedByEditor: one(editors, {
    fields: [articles.updatedBy],
    references: [editors.id],
  }),
  deletedByEditor: one(editors, {
    fields: [articles.deletedBy],
    references: [editors.id],
  }),
  articleTags: many(articleTags),
  publicationEvents: many(publicationEvents, { relationName: 'articleEvents' }),
}));

/* ------------------------------------------------------------------ */
/*                       Publication Events                           */
/* ------------------------------------------------------------------ */

export const publicationEvents = pgTable(
  'publication_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    articleId: uuid('article_id').references(() => articles.id, { onDelete: 'cascade' }),
    seriesId: uuid('series_id').references(() => series.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 20 }).notNull(), // 'published', 'unpublished', 'featured', 'unfeatured'
    performedBy: uuid('performed_by').notNull().references(() => editors.id),
    eventDate: timestamp('event_date', { withTimezone: true }).defaultNow().notNull(),
    reason: text('reason'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    articleEventIdx: index('publication_events_article_idx').on(t.articleId, t.eventType),
    seriesEventIdx: index('publication_events_series_idx').on(t.seriesId, t.eventType),
    editorEventIdx: index('publication_events_editor_idx').on(t.performedBy, t.eventDate.desc()),
    eventDateIdx: index('publication_events_date_idx').on(t.eventDate.desc()),
  })
);

export const publicationEventsRelations = relations(publicationEvents, ({ one }) => ({
  article: one(articles, {
    fields: [publicationEvents.articleId],
    references: [articles.id],
    relationName: 'articleEvents',
  }),
  series: one(series, {
    fields: [publicationEvents.seriesId],
    references: [series.id],
    relationName: 'seriesEvents',
  }),
  editor: one(editors, {
    fields: [publicationEvents.performedBy],
    references: [editors.id],
  }),
}));

/* ------------------------------------------------------------------ */
/*                       Newsletter Subscribers                       */
/* ------------------------------------------------------------------ */

export const newsletterSubscribers = pgTable(
  'newsletter_subscribers',
  {
    ...baseTable(),

    email: varchar('email', { length: 320 }).notNull().unique(),
    status: varchar('status', { length: 20 })
      .$type<'pending' | 'active' | 'unsubscribed' | 'bounced'>()
      .notNull()
      .default('pending'),

    source: varchar('source', { length: 100 }).notNull(),
    language: varchar('language', { length: 10 }),

    // === STRUCTURED COLUMNS (for fast analytics) ===
    countryCode: varchar('country_code', { length: 2 }),
    regionCode: varchar('region_code', { length: 10 }),
    city: varchar('city', { length: 100 }),
    latitude: decimal('latitude', { precision: 10, scale: 6 }),
    longitude: decimal('longitude', { precision: 10, scale: 6 }),

    // === ADDITIONAL RICH DATA COLUMNS ===
    continent: varchar('continent', { length: 50 }),
    district: varchar('district', { length: 100 }),
    zipCode: varchar('zip_code', { length: 20 }),
    isp: varchar('isp', { length: 200 }),
    isProxy: boolean('is_proxy').default(false),
    isMobile: boolean('is_mobile').default(false),
    isHosting: boolean('is_hosting').default(false),

    // === COMPLETE API RESPONSE ===
    locationData: jsonb('location_data'),

    // === EXISTING FIELDS ===
    browserFamily: varchar('browser_family', { length: 50 }),
    osFamily: varchar('os_family', { length: 50 }),
    deviceType: varchar('device_type', { length: 20 }),
    referrerDomain: varchar('referrer_domain', { length: 255 }),
    timezone: varchar('timezone', { length: 50 }),

    verificationToken: uuid('verification_token').defaultRandom(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
  },
  (t) => ({
    // === BASIC INDEXES (following your pattern) ===
    emailIdx: index('newsletter_email_idx').on(t.email),
    statusIdx: index('newsletter_status_idx').on(t.status),
  })
);

export const newsletterSubscribersRelations = relations(newsletterSubscribers, ({ one }) => ({
  // Base table relations
  createdByEditor: one(editors, {
    fields: [newsletterSubscribers.createdBy],
    references: [editors.id],
  }),
  updatedByEditor: one(editors, {
    fields: [newsletterSubscribers.updatedBy],
    references: [editors.id],
  }),
  deletedByEditor: one(editors, {
    fields: [newsletterSubscribers.deletedBy],
    references: [editors.id],
  }),
}));

/* ------------------------------------------------------------------ */
/*                  Submission Telemetry (30-day TTL)                 */
/* ------------------------------------------------------------------ */

export const newsletterSubmissions = pgTable(
  'newsletter_submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    ipHash: varchar('ip_hash', { length: 64 }).notNull(),
    sessionId: varchar('session_id', { length: 64 }),
    browserFingerprint: varchar('browser_fp', { length: 64 }),

    submissionTime: timestamp('submission_time', { withTimezone: true })
      .defaultNow()
      .notNull(),
    formInteractionTime: integer('form_interaction_time'),
    honeypotTriggered: boolean('honeypot_triggered').default(false),

    source: varchar('source', { length: 100 }).notNull(),
  },
  (t) => ({
    ipIdx: index('newsletter_ip_idx').on(t.ipHash),
    fpIdx: index('newsletter_fp_idx').on(t.browserFingerprint),
  })
);

/* ------------------------------------------------------------------ */
/*                       Soft-delete Constraints                      */
/* ------------------------------------------------------------------ */

export const softDeleteConstraints = {
  notDeleted: sql`deleted_at IS NULL`,
  includeDeleted: sql`1=1`,
};
