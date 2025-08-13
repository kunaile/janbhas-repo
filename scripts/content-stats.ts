// scripts/content-stats.ts

import { createDbConnection, getDb } from '../src/db';
import { articles, authors, categories, editors, languages, subCategories, tags, articleTags } from '../src/db/schema';
import { sql, count, isNull, desc, eq } from 'drizzle-orm';

const log = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  success: (msg: string) => console.log(`[OK] ${msg}`),
  error: (msg: string) => console.log(`[ERROR] ${msg}`)
};

async function generateContentStats() {
  try {
    log.info('Generating content statistics...');

    await createDbConnection();
    const db = getDb();

    console.log('\n=== CONTENT STATISTICS REPORT ===\n');

    // Basic counts
    console.log('📚 Content Overview:');
    const [languageCount] = await db.select({ count: count() }).from(languages).where(isNull(languages.deletedAt));
    const [authorCount] = await db.select({ count: count() }).from(authors).where(isNull(authors.deletedAt));
    const [categoryCount] = await db.select({ count: count() }).from(categories).where(isNull(categories.deletedAt));
    const [subCategoryCount] = await db.select({ count: count() }).from(subCategories).where(isNull(subCategories.deletedAt));
    const [tagCount] = await db.select({ count: count() }).from(tags).where(isNull(tags.deletedAt));
    const [editorCount] = await db.select({ count: count() }).from(editors).where(isNull(editors.deletedAt));
    const [articleCount] = await db.select({ count: count() }).from(articles).where(isNull(articles.deletedAt));
    const [publishedCount] = await db.select({ count: count() }).from(articles)
      .where(sql`deleted_at IS NULL AND is_published = true`);

    console.log(`  • Languages: ${languageCount.count}`);
    console.log(`  • Authors: ${authorCount.count}`);
    console.log(`  • Categories: ${categoryCount.count}`);
    console.log(`  • Sub-categories: ${subCategoryCount.count}`);
    console.log(`  • Tags: ${tagCount.count}`);
    console.log(`  • Editors: ${editorCount.count}`);
    console.log(`  • Total Articles: ${articleCount.count}`);
    console.log(`  • Published: ${publishedCount.count}`);
    console.log(`  • Drafts: ${articleCount.count - publishedCount.count}`);

    // Language breakdown
    console.log('\n🌍 Content by Language:');
    const languageStats = await db.select({
      name: languages.name,
      code: languages.code,
      articleCount: count(articles.id)
    })
      .from(languages)
      .leftJoin(articles, eq(languages.id, articles.languageId))
      .where(isNull(languages.deletedAt))
      .groupBy(languages.id, languages.name, languages.code)
      .orderBy(desc(count(articles.id)));

    languageStats.forEach(lang => {
      console.log(`  • ${lang.name} (${lang.code}): ${lang.articleCount} articles`);
    });

    // Top authors
    console.log('\n✍️ Top Authors (by article count):');
    const topAuthors = await db.select({
      name: authors.name,
      localName: authors.localName,
      articleCount: count(articles.id)
    })
      .from(authors)
      .leftJoin(articles, eq(authors.id, articles.authorId))
      .where(isNull(authors.deletedAt))
      .groupBy(authors.id, authors.name, authors.localName)
      .orderBy(desc(count(articles.id)))
      .limit(10);

    topAuthors.forEach((author, index) => {
      console.log(`  ${index + 1}. ${author.localName || author.name}: ${author.articleCount} articles`);
    });

    // Content by category
    console.log('\n📝 Content by Category:');
    const categoryStats = await db.select({
      name: categories.name,
      articleCount: count(articles.id)
    })
      .from(categories)
      .leftJoin(articles, eq(categories.id, articles.categoryId))
      .where(isNull(categories.deletedAt))
      .groupBy(categories.id, categories.name)
      .orderBy(desc(count(articles.id)));

    categoryStats.forEach(category => {
      console.log(`  • ${category.name}: ${category.articleCount} articles`);
    });

    // Editor activity
    console.log('\n👥 Editor Activity:');
    const editorStats = await db.select({
      name: editors.name,
      githubUserName: editors.githubUserName,
      articleCount: count(articles.id)
    })
      .from(editors)
      .leftJoin(articles, eq(editors.id, articles.editorId))
      .where(isNull(editors.deletedAt))
      .groupBy(editors.id, editors.name, editors.githubUserName)
      .orderBy(desc(count(articles.id)));

    editorStats.forEach(editor => {
      const displayName = editor.githubUserName ? `${editor.name} (@${editor.githubUserName})` : editor.name;
      console.log(`  • ${displayName}: ${editor.articleCount} articles`);
    });

    // Word count statistics
    console.log('\n📊 Content Metrics:');
    const wordStatsResult = await db.execute(sql`
  SELECT 
    COUNT(*) as articles_with_word_count,
    AVG(word_count)::int as avg_words,
    MIN(word_count) as min_words,
    MAX(word_count) as max_words,
    SUM(word_count) as total_words
  FROM articles 
  WHERE deleted_at IS NULL 
  AND word_count IS NOT NULL 
  AND word_count > 0
`);

    const stats = wordStatsResult.rows[0] as any;
    console.log(`  • Articles with word count: ${stats?.articles_with_word_count || 0}`);
    console.log(`  • Average words per article: ${stats?.avg_words || 0}`);
    console.log(`  • Shortest article: ${stats?.min_words || 0} words`);
    console.log(`  • Longest article: ${stats?.max_words || 0} words`);
    console.log(`  • Total word count: ${stats?.total_words || 0} words`);

    // Recent activity
    console.log('\n⏰ Recent Activity (Last 30 days):');
    const recentActivityResult = await db.execute(sql`
  SELECT 
    COUNT(*) as recent_articles,
    COUNT(CASE WHEN is_published THEN 1 END) as recent_published
  FROM articles 
  WHERE deleted_at IS NULL 
  AND created_at >= NOW() - INTERVAL '30 days'
`);

    const recent = recentActivityResult.rows[0] as any;
    console.log(`  • Articles created: ${recent?.recent_articles || 0}`);
    console.log(`  • Articles published: ${recent?.recent_published || 0}`);

    console.log('\n=== END OF REPORT ===\n');
    log.success('Content statistics generated successfully');

  } catch (error) {
    log.error(`Failed to generate content statistics: ${error}`);
    process.exit(1);
  }
}

generateContentStats();
