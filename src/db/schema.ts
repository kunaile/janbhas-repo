// src/db/schema.ts
import { pgTable, index, text, varchar, timestamp, date, boolean, integer, uuid } from 'drizzle-orm/pg-core';
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

// --- User Roles Tables ---
export const authors = pgTable('authors', {
    ...baseTable(),
    name: varchar('name', { length: 255 }).notNull(),
    localName: varchar('local_name', { length: 255 }),
    bio: text('bio'),
    imageUrl: text('image_url'),
}, (t) => ({
    searchIdx: index('authors_search_idx').using('gin',
        sql`to_tsvector('simple', coalesce(${t.name}, '') || ' ' || coalesce(${t.localName}, ''))`
    ),
}));

export const authorsRelations = relations(authors, ({ many }) => ({
    articles: many(articles),
}));

export const editors = pgTable('editors', {
    ...baseTable(),
    name: varchar('name', { length: 255 }).notNull(),
    imageUrl: text('image_url'),
    githubUserName: varchar('github_user_name', { length: 255 }),
});

export const editorsRelations = relations(editors, ({ many }) => ({
    articles: many(articles),
    deletedArticles: many(articles, { relationName: 'deletedBy' }),
}));

// --- Content Metadata Tables ---
export const languages = pgTable('languages', {
    ...baseTable(),
    name: varchar('name', { length: 255 }).notNull().unique(), // 'Hindi', 'Bengali', 'English'
    code: varchar('code', { length: 10 }).notNull().unique(), // 'hi', 'bn', 'en'
});

export const languagesRelations = relations(languages, ({ many }) => ({
    articles: many(articles),
}));

export const categories = pgTable('categories', {
    ...baseTable(),
    name: varchar('name', { length: 255 }).notNull().unique(), // 'Poetry', 'Story'
});

export const categoriesRelations = relations(categories, ({ many }) => ({
    articles: many(articles),
}));

// --- Main Article Table ---
export const articles = pgTable('articles', {
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
    languageId: uuid('language_id').notNull().references(() => languages.id),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    authorId: uuid('author_id').references(() => authors.id, { onDelete: 'set null' }),
    editorId: uuid('editor_id').references(() => editors.id, { onDelete: 'set null' }),
}, (t) => ({
    searchIdx: index('articles_search_idx').using('gin',
        sql`to_tsvector('simple', coalesce(${t.title}, '') || ' ' || coalesce(${t.localTitle}, ''))`
    ),
    slugIdx: index('articles_slug_idx').on(t.slug),
    publishedIdx: index('articles_published_idx').on(t.isPublished, t.publishedDate),
    featuredIdx: index('articles_featured_idx').on(t.isFeatured),
    languageIdx: index('articles_language_idx').on(t.languageId),
    authorIdx: index('articles_author_idx').on(t.authorId),
    categoryIdx: index('articles_category_idx').on(t.categoryId),
}));

export const articlesRelations = relations(articles, ({ one }) => ({
    language: one(languages, {
        fields: [articles.languageId],
        references: [languages.id],
    }),
    category: one(categories, {
        fields: [articles.categoryId],
        references: [categories.id],
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
}));

// --- Utility Functions for Soft Delete ---
export const softDeleteConstraints = {
    notDeleted: sql`deleted_at IS NULL`,
    includeDeleted: sql`1=1`,
};
