// db/schema.ts

import {
  pgTable,
  index,
  text,
  varchar,
  timestamp,
  date,
  boolean,
  integer,
  decimal,
  jsonb,
  uuid
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

// --- Base Table Schema for common fields ---
const baseTable = () => ({
  id: uuid('id').defaultRandom().primaryKey(),
  uid: uuid('uid').defaultRandom().notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: uuid('deleted_by'),
});

/* ------------------------------------------------------------------ */
/*                              Authors                               */
/* ------------------------------------------------------------------ */

export const authors = pgTable(
  'authors',
  {
    ...baseTable(),
    name: varchar('name', { length: 255 }).notNull(),
    localName: varchar('local_name', { length: 255 }),
    bio: text('bio'),
    imageUrl: text('image_url'),
  },
  (t) => ({
    searchIdx: index('authors_search_idx').using(
      'gin',
      sql`to_tsvector('simple', coalesce(${t.name}, '') || ' ' || coalesce(${t.localName}, ''))`
    ),
  })
);

export const authorsRelations = relations(authors, ({ many }) => ({
  articles: many(articles),
}));

/* ------------------------------------------------------------------ */
/*                               Editors                              */
/* ------------------------------------------------------------------ */

export const editors = pgTable(
  'editors',
  {
    ...baseTable(),
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
  deletedArticles: many(articles, { relationName: 'deletedBy' }),
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

export const languagesRelations = relations(languages, ({ many }) => ({
  articles: many(articles),
}));

/* ------------------------------------------------------------------ */
/*                            Categories                              */
/* ------------------------------------------------------------------ */

export const categories = pgTable(
  'categories',
  {
    ...baseTable(),
    name: varchar('name', { length: 255 }).notNull().unique(),
    localName: varchar('local_name', { length: 255 }),
  },
  (t) => ({
    searchIdx: index('categories_search_idx').using(
      'gin',
      sql`to_tsvector('simple', coalesce(${t.name}, '') || ' ' || coalesce(${t.localName}, ''))`
    ),
    nameIdx: index('categories_name_idx').on(t.name),
    localNameIdx: index('categories_local_name_idx').on(t.localName),
  })
);

export const categoriesRelations = relations(categories, ({ many }) => ({
  articles: many(articles),
  subCategories: many(subCategories),
}));

/* ------------------------------------------------------------------ */
/*                          Sub-Categories                            */
/* ------------------------------------------------------------------ */

export const subCategories = pgTable(
  'sub_categories',
  {
    ...baseTable(),
    name: varchar('name', { length: 255 }).notNull(),
    localName: varchar('local_name', { length: 255 }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    searchIdx: index('sub_categories_search_idx').using(
      'gin',
      sql`to_tsvector('simple', coalesce(${t.name}, '') || ' ' || coalesce(${t.localName}, ''))`
    ),
    uniqueSubCategoryIdx: index('sub_categories_unique_idx').on(t.name, t.categoryId),
    categoryIdx: index('sub_categories_category_idx').on(t.categoryId),
    localNameIdx: index('sub_categories_local_name_idx').on(t.localName),
  })
);

export const subCategoriesRelations = relations(subCategories, ({ one, many }) => ({
  category: one(categories, {
    fields: [subCategories.categoryId],
    references: [categories.id],
  }),
  articles: many(articles),
}));

/* ------------------------------------------------------------------ */
/*                                Tags                                */
/* ------------------------------------------------------------------ */

export const tags = pgTable(
  'tags',
  {
    ...baseTable(),
    name: varchar('name', { length: 100 }).notNull().unique(),
    localName: varchar('local_name', { length: 100 }),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
  },
  (t) => ({
    searchIdx: index('tags_search_idx').using(
      'gin',
      sql`to_tsvector('simple', coalesce(${t.name}, '') || ' ' || coalesce(${t.localName}, ''))`
    ),
    nameIdx: index('tags_name_idx').on(t.name),
    slugIdx: index('tags_slug_idx').on(t.slug),
    localNameIdx: index('tags_local_name_idx').on(t.localName),
  })
);

export const tagsRelations = relations(tags, ({ many }) => ({
  articleTags: many(articleTags),
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
  },
  (t) => ({
    uniqueArticleTagIdx: index('article_tags_unique_idx').on(t.articleId, t.tagId),
    articleIdx: index('article_tags_article_idx').on(t.articleId),
    tagIdx: index('article_tags_tag_idx').on(t.tagId),
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
    publishedDate: date('published_date', { mode: 'string' }),
    thumbnailUrl: varchar('thumbnail_url', { length: 500 }),
    audioUrl: varchar('audio_url', { length: 500 }),
    wordCount: integer('word_count'),
    duration: integer('duration'),
    isPublished: boolean('is_published').default(false).notNull(),
    isFeatured: boolean('is_featured').default(false).notNull(),
    languageId: uuid('language_id')
      .notNull()
      .references(() => languages.id),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    subCategoryId: uuid('sub_category_id').references(() => subCategories.id, { onDelete: 'set null' }),
    authorId: uuid('author_id').references(() => authors.id, { onDelete: 'set null' }),
    editorId: uuid('editor_id').references(() => editors.id, { onDelete: 'set null' }),
  },
  (t) => ({
    searchIdx: index('articles_search_idx').using(
      'gin',
      sql`to_tsvector('simple',
        coalesce(${t.title}, '') || ' ' ||
        coalesce(${t.localTitle}, '') || ' ' ||
        coalesce(${t.shortDescription}, '') || ' ' ||
        coalesce(${t.markdownContent}, '')
      )`
    ),
    slugIdx: index('articles_slug_idx').on(t.slug),
    publishedIdx: index('articles_published_idx').on(t.isPublished, t.publishedDate),
    featuredIdx: index('articles_featured_idx').on(t.isFeatured),
    languageIdx: index('articles_language_idx').on(t.languageId),
    authorIdx: index('articles_author_idx').on(t.authorId),
    categoryIdx: index('articles_category_idx').on(t.categoryId),
    subCategoryIdx: index('articles_sub_category_idx').on(t.subCategoryId),
    editorIdx: index('articles_editor_idx').on(t.editorId),
    uniqueArticleIdx: index('articles_unique_content_idx')
      .on(t.title, t.authorId, t.languageId)
      .where(sql`deleted_at IS NULL`),
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
  deletedByEditor: one(editors, {
    fields: [articles.deletedBy],
    references: [editors.id],
    relationName: 'deletedBy',
  }),
  articleTags: many(articleTags),
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

    // === GEOGRAPHIC INDEXES ===
    countryIdx: index('newsletter_country_idx').on(t.countryCode),
    regionIdx: index('newsletter_region_idx').on(t.regionCode),
    locationIdx: index('newsletter_location_idx').on(t.latitude, t.longitude),
    continentIdx: index('newsletter_continent_idx').on(t.continent),

    // === NETWORK ANALYSIS INDEXES ===
    ispIdx: index('newsletter_isp_idx').on(t.isp),
    proxyIdx: index('newsletter_proxy_idx').on(t.isProxy),
    mobileIdx: index('newsletter_mobile_idx').on(t.isMobile),

    // === JSONB INDEX (following your GIN pattern) ===
    locationDataIdx: index('newsletter_location_data_idx').using(
      'gin',
      sql`${t.locationData}`
    ),

    // === COMPOSITE INDEXES FOR ANALYTICS ===
    statusCountryIdx: index('newsletter_status_country_idx').on(t.status, t.countryCode),
    activeSubscribersIdx: index('newsletter_active_subscribers_idx')
      .on(t.status, t.countryCode, t.regionCode)
      .where(sql`status = 'active'`),
  })
);

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
