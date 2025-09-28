// scripts/content-stats.ts

import { createDbConnection, getDb } from '../src/db';
import { articles, authors, categories, editors, languages, subCategories, tags, articleTags, series } from '../src/db/schema';
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
    const [seriesCount] = await db.select({ count: count() }).from(series).where(isNull(series.deletedAt)); // NEW
    const [publishedCount] = await db.select({ count: count() }).from(articles)
      .where(sql`deleted_at IS NULL AND is_published = true`);
    const [featuredCount] = await db.select({ count: count() }).from(articles)
      .where(sql`deleted_at IS NULL AND is_featured = true`);
    const [publishedSeriesCount] = await db.select({ count: count() }).from(series) // NEW
      .where(sql`deleted_at IS NULL AND is_published = true`);
    const [completedSeriesCount] = await db.select({ count: count() }).from(series) // NEW
      .where(sql`deleted_at IS NULL AND is_complete = true`);

    console.log(`  • Languages: ${languageCount.count}`);
    console.log(`  • Authors: ${authorCount.count}`);
    console.log(`  • Categories: ${categoryCount.count}`);
    console.log(`  • Sub-categories: ${subCategoryCount.count}`);
    console.log(`  • Tags: ${tagCount.count}`);
    console.log(`  • Editors: ${editorCount.count}`);
    console.log(`  • Total Articles: ${articleCount.count}`);
    console.log(`  • Published Articles: ${publishedCount.count}`);
    console.log(`  • Featured Articles: ${featuredCount.count}`);
    console.log(`  • Draft Articles: ${articleCount.count - publishedCount.count}`);
    // Series statistics
    console.log(`  • Total Series: ${seriesCount.count}`);
    console.log(`  • Published Series: ${publishedSeriesCount.count}`);
    console.log(`  • Completed Series: ${completedSeriesCount.count}`);

    // Content type breakdown
    console.log('\n📖 Content Type Breakdown:');
    const contentTypeStats = await db.execute(sql`
      SELECT 
        article_type,
        COUNT(*) as count,
        COUNT(CASE WHEN is_published THEN 1 END) as published_count
      FROM articles 
      WHERE deleted_at IS NULL 
      GROUP BY article_type 
      ORDER BY count DESC
    `);

    contentTypeStats.rows.forEach((row: any) => {
      console.log(`  • ${row.article_type}: ${row.count} total (${row.published_count} published)`);
    });

    // Episodes breakdown
    const [episodeCount] = await db.select({ count: count() }).from(articles)
      .where(sql`deleted_at IS NULL AND series_id IS NOT NULL`);
    const [standaloneCount] = await db.select({ count: count() }).from(articles)
      .where(sql`deleted_at IS NULL AND series_id IS NULL`);

    console.log(`  • Episodes: ${episodeCount.count}`);
    console.log(`  • Standalone Articles: ${standaloneCount.count}`);

    // Language breakdown
    console.log('\n🌍 Content by Language:');
    const languageStats = await db.select({
      name: languages.name,
      code: languages.code,
      articleCount: count(articles.id),
    })
      .from(languages)
      .leftJoin(articles, eq(languages.id, articles.languageId))
      .where(isNull(languages.deletedAt))
      .groupBy(languages.id, languages.name, languages.code)
      .orderBy(desc(count(articles.id)));

    // Get series count per language
    const seriesLanguageStats = await db.select({
      languageId: series.languageId,
      seriesCount: count(series.id)
    })
      .from(series)
      .where(isNull(series.deletedAt))
      .groupBy(series.languageId);

    const seriesCountMap = new Map(seriesLanguageStats.map(s => [s.languageId, s.seriesCount]));

    languageStats.forEach(lang => {
      const seriesCount = seriesCountMap.get(lang.code) || 0;
      console.log(`  • ${lang.name} (${lang.code}): ${lang.articleCount} articles, ${seriesCount} series`);
    });

    // Top authors
    console.log('\n✍️ Top Authors (by total content):');
    const topAuthors = await db.execute(sql`
      SELECT 
        a.name,
        COALESCE(at.local_name, a.name) as display_name,
        COALESCE(article_counts.article_count, 0) as article_count,
        COALESCE(series_counts.series_count, 0) as series_count,
        COALESCE(article_counts.article_count, 0) + COALESCE(series_counts.series_count, 0) as total_content
      FROM authors a
      LEFT JOIN author_translations at ON a.id = at.author_id AND at.language_id = (
        SELECT id FROM languages WHERE code = 'hi' LIMIT 1
      )
      LEFT JOIN (
        SELECT author_id, COUNT(*) as article_count 
        FROM articles 
        WHERE deleted_at IS NULL 
        GROUP BY author_id
      ) article_counts ON a.id = article_counts.author_id
      LEFT JOIN (
        SELECT author_id, COUNT(*) as series_count 
        FROM series 
        WHERE deleted_at IS NULL 
        GROUP BY author_id
      ) series_counts ON a.id = series_counts.author_id
      WHERE a.deleted_at IS NULL
      ORDER BY total_content DESC
      LIMIT 10
    `);

    topAuthors.rows.forEach((author: any, index: number) => {
      console.log(`  ${index + 1}. ${author.display_name}: ${author.total_content} total (${author.article_count} articles, ${author.series_count} series)`);
    });

    // Series statistics
    console.log('\n📗 Series Analytics:');
    const seriesStats = await db.execute(sql`
      SELECT 
        s.title,
        s.local_title,
        s.total_episodes,
        s.is_complete,
        s.is_published,
        a.name as author_name,
        COALESCE(at.local_name, a.name) as author_display_name,
        COUNT(episodes.id) as actual_episodes
      FROM series s
      LEFT JOIN authors a ON s.author_id = a.id
      LEFT JOIN author_translations at ON a.id = at.author_id AND at.language_id = (
        SELECT id FROM languages WHERE code = 'hi' LIMIT 1
      )
      LEFT JOIN articles episodes ON s.id = episodes.series_id AND episodes.deleted_at IS NULL
      WHERE s.deleted_at IS NULL
      GROUP BY s.id, s.title, s.local_title, s.total_episodes, s.is_complete, s.is_published, a.name, at.local_name
      ORDER BY actual_episodes DESC
      LIMIT 10
    `);

    if (seriesStats.rows.length > 0) {
      console.log('Top Series by Episode Count:');
      seriesStats.rows.forEach((series: any, index: number) => {
        const title = series.local_title || series.title;
        const author = series.author_display_name;
        const status = series.is_complete ? '✅' : (series.is_published ? '🟡' : '⚪');
        console.log(`  ${index + 1}. ${status} ${title} by ${author}: ${series.actual_episodes}/${series.total_episodes} episodes`);
      });
    } else {
      console.log('  • No series found');
    }

    // Content by category
    console.log('\n📝 Content by Category:');
    const categoryStats = await db.execute(sql`
      SELECT 
        c.name,
        COALESCE(ct.local_name, c.name) as display_name,
        COALESCE(article_counts.article_count, 0) as article_count,
        COALESCE(series_counts.series_count, 0) as series_count,
        COALESCE(article_counts.article_count, 0) + COALESCE(series_counts.series_count, 0) as total_content
      FROM categories c
      LEFT JOIN category_translations ct ON c.id = ct.category_id AND ct.language_id = (
        SELECT id FROM languages WHERE code = 'hi' LIMIT 1
      )
      LEFT JOIN (
        SELECT category_id, COUNT(*) as article_count 
        FROM articles 
        WHERE deleted_at IS NULL 
        GROUP BY category_id
      ) article_counts ON c.id = article_counts.category_id
      LEFT JOIN (
        SELECT category_id, COUNT(*) as series_count 
        FROM series 
        WHERE deleted_at IS NULL 
        GROUP BY category_id
      ) series_counts ON c.id = series_counts.category_id
      WHERE c.deleted_at IS NULL
      ORDER BY total_content DESC
    `);

    categoryStats.rows.forEach((category: any) => {
      console.log(`  • ${category.display_name}: ${category.total_content} total (${category.article_count} articles, ${category.series_count} series)`);
    });

    // Sub-categories breakdown
    console.log('\n📂 Content by Sub-Category:');
    const subCategoryStats = await db.execute(sql`
      SELECT 
        sc.name,
        COALESCE(sct.local_name, sc.name) as display_name,
        c.name as category_name,
        COALESCE(ct.local_name, c.name) as category_display_name,
        COUNT(a.id) as article_count
      FROM sub_categories sc
      LEFT JOIN sub_category_translations sct ON sc.id = sct.sub_category_id AND sct.language_id = (
        SELECT id FROM languages WHERE code = 'hi' LIMIT 1
      )
      LEFT JOIN categories c ON sc.category_id = c.id
      LEFT JOIN category_translations ct ON c.id = ct.category_id AND ct.language_id = (
        SELECT id FROM languages WHERE code = 'hi' LIMIT 1
      )
      LEFT JOIN articles a ON sc.id = a.sub_category_id AND a.deleted_at IS NULL
      WHERE sc.deleted_at IS NULL
      GROUP BY sc.id, sc.name, sct.local_name, c.name, ct.local_name
      ORDER BY article_count DESC
    `);

    if (subCategoryStats.rows.length > 0) {
      subCategoryStats.rows.forEach((subCat: any) => {
        console.log(`  • ${subCat.display_name} (${subCat.category_display_name}): ${subCat.article_count} articles`);
      });
    } else {
      console.log('  • No sub-categories found');
    }

    // Top tags
    console.log('\n🏷️ Top Tags (by usage):');
    const tagStats = await db.execute(sql`
      SELECT 
        t.name,
        COALESCE(tt.local_name, t.name) as display_name,
        COUNT(at.id) as usage_count
      FROM tags t
      LEFT JOIN tag_translations tt ON t.id = tt.tag_id AND tt.language_id = (
        SELECT id FROM languages WHERE code = 'hi' LIMIT 1
      )
      LEFT JOIN article_tags at ON t.id = at.tag_id
      WHERE t.deleted_at IS NULL
      GROUP BY t.id, t.name, tt.local_name
      ORDER BY usage_count DESC
      LIMIT 10
    `);

    if (tagStats.rows.length > 0) {
      tagStats.rows.forEach((tag: any, index: number) => {
        const displayName = tag.local_name && tag.local_name !== tag.name ?
          `${tag.local_name} (${tag.name})` : tag.name;
        console.log(`  ${index + 1}. ${displayName}: ${tag.usage_count} articles`);
      });
    } else {
      console.log('  • No tags found');
    }

    // Editor activity
    console.log('\n👥 Editor Activity:');
    const editorStats = await db.execute(sql`
      SELECT 
        e.name,
        e.email,
        e.github_user_name,
        COALESCE(article_counts.article_count, 0) as article_count,
        COALESCE(series_counts.series_count, 0) as series_count,
        COALESCE(article_counts.article_count, 0) + COALESCE(series_counts.series_count, 0) as total_content
      FROM editors e
      LEFT JOIN (
        SELECT editor_id, COUNT(*) as article_count 
        FROM articles 
        WHERE deleted_at IS NULL 
        GROUP BY editor_id
      ) article_counts ON e.id = article_counts.editor_id
      LEFT JOIN (
        SELECT editor_id, COUNT(*) as series_count 
        FROM series 
        WHERE deleted_at IS NULL 
        GROUP BY editor_id
      ) series_counts ON e.id = series_counts.editor_id
      WHERE e.deleted_at IS NULL
      ORDER BY total_content DESC
    `);

    editorStats.rows.forEach((editor: any) => {
      let displayName = editor.name;
      if (editor.github_user_name) displayName += ` (@${editor.github_user_name})`;
      if (editor.email) displayName += ` <${editor.email}>`;
      console.log(`  • ${displayName}: ${editor.total_content} total (${editor.article_count} articles, ${editor.series_count} series)`);
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

    // Series word count statistics
    const seriesWordStats = await db.execute(sql`
      SELECT 
        COUNT(*) as series_with_word_count,
        AVG(total_word_count)::int as avg_series_words,
        MIN(total_word_count) as min_series_words,
        MAX(total_word_count) as max_series_words,
        SUM(total_word_count) as total_series_words
      FROM series 
      WHERE deleted_at IS NULL 
      AND total_word_count IS NOT NULL 
      AND total_word_count > 0
    `);

    const seriesStats_words = seriesWordStats.rows[0] as any;
    if (seriesStats_words?.series_with_word_count > 0) {
      console.log(`  • Series with word count: ${seriesStats_words.series_with_word_count}`);
      console.log(`  • Average words per series: ${seriesStats_words.avg_series_words || 0}`);
      console.log(`  • Shortest series: ${seriesStats_words.min_series_words || 0} words`);
      console.log(`  • Longest series: ${seriesStats_words.max_series_words || 0} words`);
      console.log(`  • Total series words: ${seriesStats_words.total_series_words || 0} words`);
    }

    // Duration statistics
    const durationStatsResult = await db.execute(sql`
      SELECT 
        COUNT(*) as articles_with_duration,
        AVG(duration)::int as avg_duration,
        MIN(duration) as min_duration,
        MAX(duration) as max_duration,
        SUM(duration) as total_duration
      FROM articles 
      WHERE deleted_at IS NULL 
      AND duration IS NOT NULL 
      AND duration > 0
    `);

    const durationStats = durationStatsResult.rows[0] as any;
    if (durationStats?.articles_with_duration > 0) {
      console.log(`  • Articles with duration: ${durationStats.articles_with_duration}`);
      console.log(`  • Average duration: ${Math.floor((durationStats.avg_duration || 0) / 60)}:${String((durationStats.avg_duration || 0) % 60).padStart(2, '0')}`);
      console.log(`  • Shortest duration: ${Math.floor((durationStats.min_duration || 0) / 60)}:${String((durationStats.min_duration || 0) % 60).padStart(2, '0')}`);
      console.log(`  • Longest duration: ${Math.floor((durationStats.max_duration || 0) / 60)}:${String((durationStats.max_duration || 0) % 60).padStart(2, '0')}`);
      console.log(`  • Total duration: ${Math.floor((durationStats.total_duration || 0) / 3600)}h ${Math.floor(((durationStats.total_duration || 0) % 3600) / 60)}m`);
    }

    // Recent activity
    console.log('\n⏰ Recent Activity (Last 30 days):');
    const recentActivityResult = await db.execute(sql`
      SELECT 
        (SELECT COUNT(*) FROM articles WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '30 days') as recent_articles,
        (SELECT COUNT(*) FROM articles WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '30 days' AND is_published) as recent_published,
        (SELECT COUNT(*) FROM articles WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '30 days' AND is_featured) as recent_featured,
        (SELECT COUNT(*) FROM series WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '30 days') as recent_series,
        (SELECT COUNT(*) FROM series WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '30 days' AND is_published) as recent_series_published
    `);

    const recent = recentActivityResult.rows[0] as any;
    console.log(`  • Articles created: ${recent?.recent_articles || 0}`);
    console.log(`  • Articles published: ${recent?.recent_published || 0}`);
    console.log(`  • Articles featured: ${recent?.recent_featured || 0}`);
    console.log(`  • Series created: ${recent?.recent_series || 0}`);
    console.log(`  • Series published: ${recent?.recent_series_published || 0}`);

    // Content health indicators
    console.log('\n🏥 Content Health:');
    const healthResult = await db.execute(sql`
      SELECT 
        COUNT(CASE WHEN thumbnail_url IS NOT NULL THEN 1 END) as with_thumbnails,
        COUNT(CASE WHEN audio_url IS NOT NULL THEN 1 END) as with_audio,
        COUNT(CASE WHEN word_count IS NOT NULL AND word_count > 0 THEN 1 END) as with_word_count,
        COUNT(CASE WHEN author_name IS NOT NULL THEN 1 END) as with_author_names,
        COUNT(CASE WHEN category_name IS NOT NULL THEN 1 END) as with_category_names,
        COUNT(*) as total_articles
      FROM articles 
      WHERE deleted_at IS NULL
    `);

    // Series health indicators
    const seriesHealthResult = await db.execute(sql`
      SELECT 
        COUNT(CASE WHEN thumbnail_url IS NOT NULL THEN 1 END) as with_thumbnails,
        COUNT(CASE WHEN total_episodes > 0 THEN 1 END) as with_episode_counts,
        COUNT(CASE WHEN is_complete THEN 1 END) as completed,
        COUNT(*) as total_series
      FROM series 
      WHERE deleted_at IS NULL
    `);

    const health = healthResult.rows[0] as any;
    const seriesHealth = seriesHealthResult.rows[0] as any;
    const totalArticles = health?.total_articles || 1;
    const totalSeries = seriesHealth?.total_series || 1;

    console.log('Articles:');
    console.log(`  • With thumbnails: ${health?.with_thumbnails || 0} (${Math.round(((health?.with_thumbnails || 0) / totalArticles) * 100)}%)`);
    console.log(`  • With audio: ${health?.with_audio || 0} (${Math.round(((health?.with_audio || 0) / totalArticles) * 100)}%)`);
    console.log(`  • With word count: ${health?.with_word_count || 0} (${Math.round(((health?.with_word_count || 0) / totalArticles) * 100)}%)`);
    console.log(`  • With denormalized author names: ${health?.with_author_names || 0} (${Math.round(((health?.with_author_names || 0) / totalArticles) * 100)}%)`);
    console.log(`  • With denormalized category names: ${health?.with_category_names || 0} (${Math.round(((health?.with_category_names || 0) / totalArticles) * 100)}%)`);

    if (totalSeries > 0) {
      console.log('Series:');
      console.log(`  • With thumbnails: ${seriesHealth?.with_thumbnails || 0} (${Math.round(((seriesHealth?.with_thumbnails || 0) / totalSeries) * 100)}%)`);
      console.log(`  • With episode counts: ${seriesHealth?.with_episode_counts || 0} (${Math.round(((seriesHealth?.with_episode_counts || 0) / totalSeries) * 100)}%)`);
      console.log(`  • Completed: ${seriesHealth?.completed || 0} (${Math.round(((seriesHealth?.completed || 0) / totalSeries) * 100)}%)`);
    }

    console.log('\n=== END OF REPORT ===\n');
    log.success('Content statistics generated successfully');

  } catch (error) {
    log.error(`Failed to generate content statistics: ${error}`);
    process.exit(1);
  }
}

generateContentStats();
