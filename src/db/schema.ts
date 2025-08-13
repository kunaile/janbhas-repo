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
    email: varchar('email', { length: 255 }), // Added email field
    imageUrl: text('image_url'),
    githubUserName: varchar('github_user_name', { length: 255 }),
}, (t) => ({
    emailIdx: index('editors_email_idx').on(t.email),
    githubIdx: index('editors_github_idx').on(t.githubUserName),
}));

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
    subCategories: many(subCategories),
}));

// --- New Sub-Categories Table ---
export const subCategories = pgTable('sub_categories', {
    ...baseTable(),
    name: varchar('name', { length: 255 }).notNull(),
    categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
}, (t) => ({
    uniqueSubCategoryIdx: index('sub_categories_unique_idx').on(t.name, t.categoryId),
    categoryIdx: index('sub_categories_category_idx').on(t.categoryId),
}));

export const subCategoriesRelations = relations(subCategories, ({ one, many }) => ({
    category: one(categories, {
        fields: [subCategories.categoryId],
        references: [categories.id],
    }),
    articles: many(articles),
}));

// --- New Tags Table ---
export const tags = pgTable('tags', {
    ...baseTable(),
    name: varchar('name', { length: 100 }).notNull().unique(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
}, (t) => ({
    nameIdx: index('tags_name_idx').on(t.name),
    slugIdx: index('tags_slug_idx').on(t.slug),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
    articleTags: many(articleTags),
}));

// --- Article-Tags Junction Table ---
export const articleTags = pgTable('article_tags', {
    ...baseTable(),
    articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (t) => ({
    uniqueArticleTagIdx: index('article_tags_unique_idx').on(t.articleId, t.tagId),
    articleIdx: index('article_tags_article_idx').on(t.articleId),
    tagIdx: index('article_tags_tag_idx').on(t.tagId),
}));

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
    subCategoryId: uuid('sub_category_id').references(() => subCategories.id, { onDelete: 'set null' }), // Added sub-category
    authorId: uuid('author_id').references(() => authors.id, { onDelete: 'set null' }),
    editorId: uuid('editor_id').references(() => editors.id, { onDelete: 'set null' }),
}, (t) => ({
    searchIdx: index('articles_search_idx').using('gin',
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
    subCategoryIdx: index('articles_sub_category_idx').on(t.subCategoryId), // Added index
    editorIdx: index('articles_editor_idx').on(t.editorId),
    uniqueArticleIdx: index('articles_unique_content_idx')
        .on(t.title, t.authorId, t.languageId)
        .where(sql`deleted_at IS NULL`),
}));

export const articlesRelations = relations(articles, ({ one, many }) => ({
    language: one(languages, {
        fields: [articles.languageId],
        references: [languages.id],
    }),
    category: one(categories, {
        fields: [articles.categoryId],
        references: [categories.id],
    }),
    subCategory: one(subCategories, { // Added sub-category relation
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
    articleTags: many(articleTags), // Added tags relation
}));

// --- Utility Functions for Soft Delete ---
export const softDeleteConstraints = {
    notDeleted: sql`deleted_at IS NULL`,
    includeDeleted: sql`1=1`,
};
