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
    const [seriesCount] = await db.select({ count: count() }).from(series).where(isNull(series.deletedAt));
    const [publishedCount] = await db.select({ count: count() }).from(articles)
      .where(sql`deleted_at IS NULL AND is_published = true`);
    const [featuredCount] = await db.select({ count: count() }).from(articles)
      .where(sql`deleted_at IS NULL AND is_featured = true`);
    const [publishedSeriesCount] = await db.select({ count: count() }).from(series)
      .where(sql`deleted_at IS NULL AND is_published = true`);
    const [completedSeriesCount] = await db.select({ count: count() }).from(series)
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
      id: languages.id,
      name: languages.name,
      code: languages.code,
      articleCount: count(articles.id),
    })
      .from(languages)
      .leftJoin(articles, eq(languages.id, articles.languageId))
      .where(isNull(languages.deletedAt))
      .groupBy(languages.id, languages.name, languages.code)
      .orderBy(desc(count(articles.id)));

    // Get series count per language (use id to map reliably)
    const seriesLanguageStats = await db.select({
      languageId: series.languageId,
      seriesCount: count(series.id)
    })
      .from(series)
      .where(isNull(series.deletedAt))
      .groupBy(series.languageId);

    const seriesCountMap = new Map(seriesLanguageStats.map(s => [s.languageId, s.seriesCount]));

    languageStats.forEach(lang => {
      const seriesCountForLang = seriesCountMap.get(lang.id) || 0;
      console.log(`  • ${lang.name} (${lang.code}): ${lang.articleCount} articles, ${seriesCountForLang} series`);
    });

    // Helpers for dynamic per-language display
    type LangCounts = { articles: number; series: number };
    const toLine = (name: string, totalArticles: number, perLang: Map<string, LangCounts>) => {
      const parts: string[] = [];
      for (const [code, c] of perLang) {
        if ((c.articles || 0) > 0 || (c.series || 0) > 0) {
          const seg = (c.series || 0) > 0
            ? `${code.toUpperCase()} : ${c.articles} articles, ${c.series} series`
            : `${code.toUpperCase()} : ${c.articles} articles`;
          parts.push(seg);
        }
      }
      return parts.length > 0
        ? `${name} - ${totalArticles} Articles, [ ${parts.join(' | ')} ]`
        : `${name} - ${totalArticles} Articles`;
    };

    // Preload language codes
    const langRows = await db.select({ id: languages.id, code: languages.code }).from(languages).where(isNull(languages.deletedAt));
    const codeByLangId = new Map(langRows.map(r => [r.id, r.code]));

    // ========== Authors: English name + dynamic per-language counts ==========
    console.log('\n✍️ Authors (by content, dynamic per-language):');

    const authorRows = await db.select({ id: authors.id, name: authors.name })
      .from(authors).where(isNull(authors.deletedAt));

    const authorArt = await db.execute(sql`
      SELECT author_id, language_id, COUNT(*)::int AS articles
      FROM articles
      WHERE deleted_at IS NULL AND author_id IS NOT NULL
      GROUP BY author_id, language_id
    `);

    const authorSer = await db.execute(sql`
      SELECT author_id, language_id, COUNT(*)::int AS series
      FROM series
      WHERE deleted_at IS NULL AND author_id IS NOT NULL
      GROUP BY author_id, language_id
    `);

    type AuthorStat = {
      id: string;
      name: string;
      totalArticles: number;
      totalSeries: number;
      perLang: Map<string, LangCounts>;
    };

    const authorStats = new Map<string, AuthorStat>();
    for (const a of authorRows) {
      authorStats.set(a.id, {
        id: a.id,
        name: a.name,
        totalArticles: 0,
        totalSeries: 0,
        perLang: new Map()
      });
    }

    for (const r of authorArt.rows as any[]) {
      const s = authorStats.get(r.author_id);
      const code = codeByLangId.get(r.language_id);
      if (!s || !code) continue;
      const prev = s.perLang.get(code) || { articles: 0, series: 0 };
      prev.articles += Number(r.articles || 0);
      s.perLang.set(code, prev);
      s.totalArticles += Number(r.articles || 0);
    }

    for (const r of authorSer.rows as any[]) {
      const s = authorStats.get(r.author_id);
      const code = codeByLangId.get(r.language_id);
      if (!s || !code) continue;
      const prev = s.perLang.get(code) || { articles: 0, series: 0 };
      prev.series += Number(r.series || 0);
      s.perLang.set(code, prev);
      s.totalSeries += Number(r.series || 0);
    }

    const authorOut = [...authorStats.values()]
      .filter(s => s.totalArticles > 0 || s.totalSeries > 0)
      .sort((a, b) => (b.totalArticles + b.totalSeries) - (a.totalArticles + a.totalSeries))
      .slice(0, 10);

    if (authorOut.length > 0) {
      authorOut.forEach((s, idx) => {
        console.log(`  ${idx + 1}. ${toLine(s.name, s.totalArticles, s.perLang)}`);
      });
    } else {
      console.log('  • No authors with content');
    }

    // ========== Series analytics (unchanged, shows top by episode count) ==========
    console.log('\n📗 Series Analytics:');
    const seriesStats = await db.execute(sql`
      SELECT 
        s.title,
        s.local_title,
        s.total_episodes,
        s.is_complete,
        s.is_published,
        a.name as author_name,
        COUNT(episodes.id) as actual_episodes
      FROM series s
      LEFT JOIN authors a ON s.author_id = a.id
      LEFT JOIN articles episodes ON s.id = episodes.series_id AND episodes.deleted_at IS NULL
      WHERE s.deleted_at IS NULL
      GROUP BY s.id, s.title, s.local_title, s.total_episodes, s.is_complete, s.is_published, a.name
      ORDER BY actual_episodes DESC
      LIMIT 10
    `);
    if (seriesStats.rows.length > 0) {
      console.log('Top Series by Episode Count:');
      seriesStats.rows.forEach((sr: any, index: number) => {
        const title = sr.local_title || sr.title;
        const author = sr.author_name || 'Unknown';
        const status = sr.is_complete ? '✅' : (sr.is_published ? '🟡' : '⚪');
        console.log(`  ${index + 1}. ${status} ${title} by ${author}: ${sr.actual_episodes}/${sr.total_episodes || 0} episodes`);
      });
    } else {
      console.log('  • No series found');
    }

    // ========== Categories: English name + dynamic per-language counts ==========
    console.log('\n📝 Categories (dynamic per-language):');

    const categoryRows = await db.select({ id: categories.id, name: categories.name })
      .from(categories).where(isNull(categories.deletedAt));

    const catArt = await db.execute(sql`
      SELECT category_id, language_id, COUNT(*)::int AS articles
      FROM articles
      WHERE deleted_at IS NULL AND category_id IS NOT NULL
      GROUP BY category_id, language_id
    `);

    const catSer = await db.execute(sql`
      SELECT category_id, language_id, COUNT(*)::int AS series
      FROM series
      WHERE deleted_at IS NULL AND category_id IS NOT NULL
      GROUP BY category_id, language_id
    `);

    type CatStat = {
      id: string;
      name: string;
      totalArticles: number;
      totalSeries: number;
      perLang: Map<string, LangCounts>;
    };

    const catStats = new Map<string, CatStat>();
    for (const c of categoryRows) {
      catStats.set(c.id, {
        id: c.id,
        name: c.name,
        totalArticles: 0,
        totalSeries: 0,
        perLang: new Map()
      });
    }

    for (const r of catArt.rows as any[]) {
      const s = catStats.get(r.category_id);
      const code = codeByLangId.get(r.language_id);
      if (!s || !code) continue;
      const prev = s.perLang.get(code) || { articles: 0, series: 0 };
      prev.articles += Number(r.articles || 0);
      s.perLang.set(code, prev);
      s.totalArticles += Number(r.articles || 0);
    }

    for (const r of catSer.rows as any[]) {
      const s = catStats.get(r.category_id);
      const code = codeByLangId.get(r.language_id);
      if (!s || !code) continue;
      const prev = s.perLang.get(code) || { articles: 0, series: 0 };
      prev.series += Number(r.series || 0);
      s.perLang.set(code, prev);
      s.totalSeries += Number(r.series || 0);
    }

    const catOut = [...catStats.values()]
      .filter(s => s.totalArticles > 0 || s.totalSeries > 0)
      .sort((a, b) => (b.totalArticles + b.totalSeries) - (a.totalArticles + a.totalSeries));

    if (catOut.length > 0) {
      catOut.forEach(s => {
        console.log(`  • ${toLine(s.name, s.totalArticles, s.perLang)}`);
      });
    } else {
      console.log('  • No categories with content');
    }

    // ========== Tags: English name + dynamic per-language usage (articles only) ==========
    console.log('\n🏷️ Tags (dynamic per-language usage):');

    const tagRows = await db.select({ id: tags.id, name: tags.name })
      .from(tags).where(isNull(tags.deletedAt));

    const tagUsage = await db.execute(sql`
      SELECT t.id as tag_id, a.language_id, COUNT(at.id)::int AS articles
      FROM tags t
      LEFT JOIN article_tags at ON t.id = at.tag_id
      LEFT JOIN articles a ON a.id = at.article_id AND a.deleted_at IS NULL
      WHERE t.deleted_at IS NULL
      GROUP BY t.id, a.language_id
    `);

    type TagStat = {
      id: string;
      name: string;
      totalArticles: number;
      perLang: Map<string, { articles: number }>;
    };

    const tagStatsMap = new Map<string, TagStat>();
    for (const t of tagRows) {
      tagStatsMap.set(t.id, {
        id: t.id,
        name: t.name,
        totalArticles: 0,
        perLang: new Map()
      });
    }

    for (const r of tagUsage.rows as any[]) {
      const s = tagStatsMap.get(r.tag_id);
      const code = codeByLangId.get(r.language_id);
      if (!s || !code) continue;
      const prev = s.perLang.get(code) || { articles: 0 };
      prev.articles += Number(r.articles || 0);
      s.perLang.set(code, prev);
      s.totalArticles += Number(r.articles || 0);
    }

    const tagOut = [...tagStatsMap.values()]
      .filter(s => s.totalArticles > 0)
      .sort((a, b) => b.totalArticles - a.totalArticles)
      .slice(0, 10);

    if (tagOut.length > 0) {
      tagOut.forEach((s, idx) => {
        const parts: string[] = [];
        for (const [code, c] of s.perLang) {
          if ((c.articles || 0) > 0) {
            parts.push(`${code.toUpperCase()} : ${c.articles} articles`);
          }
        }
        const line = parts.length > 0
          ? `${s.name} - ${s.totalArticles} Articles, [ ${parts.join(' | ')} ]`
          : `${s.name} - ${s.totalArticles} Articles`;
        console.log(`  ${idx + 1}. ${line}`);
      });
    } else {
      console.log('  • No tags with usage');
    }

    // Editor activity (unchanged)
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

    // Word count statistics (unchanged)
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

    // Series word count statistics (unchanged)
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

    // Recent activity (unchanged)
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

    // Content health indicators (unchanged)
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
