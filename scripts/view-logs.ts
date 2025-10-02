// scripts/view-logs.ts

import { createDbConnection, getDb, closeDbConnection } from '../src/db';
import { sql } from 'drizzle-orm';

const log = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  success: (msg: string) => console.log(`[OK] ${msg}`),
  error: (msg: string) => console.log(`[ERROR] ${msg}`)
};

function parseArgs(): {
  recent: boolean;
  limit: number;
  help: boolean;
  editor?: string;
  featured: boolean;
  published: boolean;
  series: boolean;
  episodes: boolean;
  completed: boolean;
  contentType?: string;
} {
  const args = process.argv.slice(2);
  const limitRaw = args.find(arg => arg.startsWith('--limit='))?.split('=')[1];
  const limitParsed = Number.parseInt(limitRaw || '', 10);
  return {
    recent: args.includes('--recent'),
    limit: Number.isFinite(limitParsed) && limitParsed > 0 ? limitParsed : 20,
    help: args.includes('--help'),
    editor: args.find(arg => arg.startsWith('--editor='))?.split('=')[1],
    featured: args.includes('--featured'),
    published: args.includes('--published'),
    series: args.includes('--series'),
    episodes: args.includes('--episodes'),
    completed: args.includes('--completed'),
    contentType: args.find(arg => arg.startsWith('--type='))?.split('=')[1]
  };
}

function showHelp() {
  console.log(`
Content Logs Viewer - Usage (ENHANCED with Series Support):

  pnpm logs [options]

Options:
  --recent           Show only recent activity (last 7 days)
  --limit=N          Limit results to N entries (default: 20)
  --editor=NAME      Filter by editor name or GitHub username
  --featured         Show only featured content
  --published        Show only published content
  --series           Show only series cover pages
  --episodes         Show only episodes
  --completed        Show only completed series
  --type=TYPE        Filter by content type (standard, original, original_pro)
  --help             Show this help message

Examples:
  pnpm logs --recent                    # Recent activity (all content types)
  pnpm logs --series --featured         # Featured series only
  pnpm logs --episodes --limit=30       # Last 30 episodes
  pnpm logs --editor=john --published   # John's published content
  pnpm logs --type=original --recent    # Recent original content
  pnpm logs --completed                 # Completed series

Content Types Tracked:
  📗 Series cover pages
  📖 Episodes  
  📄 Regular articles
  🏷️  All content metadata and activity
  `);
}

function escapeLiteral(input: string): string {
  return input.replace(/'/g, "''");
}

async function viewLogs() {
  let shouldClose = false;
  try {
    const options = parseArgs();

    if (options.help) {
      showHelp();
      return;
    }

    log.info('Fetching enhanced content activity logs with series support...');

    await createDbConnection();
    shouldClose = true;
    const db = getDb();

    console.log('\n=== ENHANCED CONTENT ACTIVITY LOGS ===\n');

    // Build filter descriptor for display
    let filterDesc = '';
    const filters: string[] = [];

    if (options.recent) filters.push('last 7 days');
    if (options.featured) filters.push('featured only');
    if (options.published) filters.push('published only');
    if (options.series) filters.push('series only');
    if (options.episodes) filters.push('episodes only');
    if (options.completed) filters.push('completed only');
    if (options.contentType) filters.push(`type: ${options.contentType}`);
    if (options.editor) filters.push(`editor: ${options.editor}`);

    if (filters.length > 0) {
      filterDesc = ` (${filters.join(', ')})`;
    }

    // Sanitize dynamic values used in raw SQL
    const contentTypeCond = options.contentType ? escapeLiteral(options.contentType) : '';
    const editorCond = options.editor ? escapeLiteral(options.editor) : '';

    // Combined query for both articles and series
    // Duration removed from schema: select NULL for duration and omit from output
    const combinedQuery = `
      WITH combined_content AS (
        -- Articles (including episodes)
        SELECT 
          'article' as content_type,
          a.title,
          a.local_title,
          a.slug,
          a.is_published,
          a.is_featured,
          a.word_count,
          NULL::integer as duration,
          a.created_at,
          a.updated_at,
          a.article_type,
          a.series_id,
          a.episode_number,
          e.name as editor_name,
          e.email as editor_email,
          e.github_user_name as editor_github,
          s.title as series_title,
          s.local_title as series_local_title,
          NULL::boolean as is_complete,
          NULL::integer as total_episodes,
          CASE 
            WHEN a.created_at = a.updated_at THEN 'created'
            ELSE 'updated'
          END as action_type
        FROM articles a
        LEFT JOIN editors e ON a.editor_id = e.id
        LEFT JOIN series s ON a.series_id = s.id
        WHERE a.deleted_at IS NULL
        ${options.episodes ? 'AND a.series_id IS NOT NULL' : ''}
        ${!options.series ? '' : 'AND FALSE'} -- Exclude articles when --series is used
        
        UNION ALL
        
        -- Series
        SELECT 
          'series' as content_type,
          s.title,
          s.local_title,
          s.slug,
          s.is_published,
          s.is_featured,
          s.total_word_count as word_count,
          NULL::integer as duration,
          s.created_at,
          s.updated_at,
          NULL as article_type,
          NULL as series_id,
          NULL as episode_number,
          e.name as editor_name,
          e.email as editor_email,
          e.github_user_name as editor_github,
          NULL as series_title,
          NULL as series_local_title,
          s.is_complete,
          s.total_episodes,
          CASE 
            WHEN s.created_at = s.updated_at THEN 'created'
            ELSE 'updated'
          END as action_type
        FROM series s
        LEFT JOIN editors e ON s.editor_id = e.id
        WHERE s.deleted_at IS NULL
        ${!options.series ? 'AND FALSE' : ''} -- Only include series when --series is used
      )
      SELECT * FROM combined_content
      WHERE 1=1
      ${options.recent ? "AND updated_at >= NOW() - INTERVAL '7 days'" : ''}
      ${options.featured ? 'AND is_featured = true' : ''}
      ${options.published ? 'AND is_published = true' : ''}
      ${options.completed ? 'AND is_complete = true' : ''}
      ${options.contentType ? `AND (content_type = 'series' OR article_type = '${contentTypeCond}')` : ''}
      ${options.editor ? `AND (editor_name ILIKE '%${editorCond}%' OR editor_github ILIKE '%${editorCond}%')` : ''}
      ${options.episodes && !options.series ? 'AND series_id IS NOT NULL' : ''}
      ORDER BY updated_at DESC
      LIMIT ${options.limit}
    `;

    const activitiesResult = await db.execute(sql.raw(combinedQuery));
    const activities = activitiesResult.rows as any[];

    if (activities.length === 0) {
      console.log('No activities found matching the criteria.');
      return;
    }

    console.log(`Showing ${activities.length} activities${filterDesc}:\n`);

    activities.forEach((activity: any, index: number) => {
      const date = new Date(activity.updated_at).toLocaleString();
      const actionIcon = activity.action_type === 'created' ? '✨' : '📝';

      // Content type icons
      let typeIcon = '📄'; // Default for articles
      if (activity.content_type === 'series') {
        typeIcon = '📗'; // Series
      } else if (activity.series_id) {
        typeIcon = '📖'; // Episode
      }

      const statusIcon = activity.is_published ? '📢' : '📄';
      const featuredIcon = activity.is_featured ? '⭐' : '';
      const completedIcon = activity.is_complete ? '✅' : '';

      let editor = activity.editor_name || 'Unknown Editor';
      if (activity.editor_github) editor += ` (@${activity.editor_github})`;
      if (activity.editor_email) editor += ` <${activity.editor_email}>`;

      // Title display with series context
      let displayTitle = activity.local_title || activity.title;
      if (activity.content_type === 'article' && activity.series_id) {
        const seriesTitle = activity.series_local_title || activity.series_title;
        displayTitle += ` (${seriesTitle}${activity.episode_number ? ` #${activity.episode_number}` : ''})`;
      }

      console.log(`${index + 1}. ${actionIcon} ${typeIcon} ${statusIcon}${featuredIcon}${completedIcon} ${displayTitle}`);
      console.log(`    ${activity.action_type.toUpperCase()} by ${editor}`);
      console.log(`    ${date}`);

      // Status information
      const statusParts: string[] = [];

      // Content type and status
      if (activity.content_type === 'series') {
        statusParts.push('Series');
        if (activity.is_complete) statusParts.push('Completed');
        if (activity.total_episodes) statusParts.push(`${activity.total_episodes} episodes`);
      } else {
        if (activity.series_id) {
          statusParts.push(`Episode ${activity.episode_number || '?'}`);
        } else {
          statusParts.push('Article');
        }
        if (activity.article_type && activity.article_type !== 'standard') {
          statusParts.push(activity.article_type);
        }
      }

      statusParts.push(activity.is_published ? 'Published' : 'Draft');
      if (activity.is_featured) statusParts.push('Featured');

      // Word count only (duration removed)
      if (activity.word_count) statusParts.push(`${activity.word_count} words`);

      console.log(`    Status: ${statusParts.join(' • ')}`);
      console.log(`    Slug: ${activity.slug}`);
      console.log('');
    });

    // Enhanced summary stats
    const createCount = activities.filter((a: any) => a.action_type === 'created').length;
    const updateCount = activities.filter((a: any) => a.action_type === 'updated').length;
    const publishedCount = activities.filter((a: any) => a.is_published).length;
    const featuredCount = activities.filter((a: any) => a.is_featured).length;
    const draftCount = activities.length - publishedCount;

    // Content type breakdown
    const seriesCount = activities.filter((a: any) => a.content_type === 'series').length;
    const episodeCount = activities.filter((a: any) => a.content_type === 'article' && a.series_id).length;
    const articleCount = activities.filter((a: any) => a.content_type === 'article' && !a.series_id).length;
    const completedSeriesCount = activities.filter((a: any) => a.content_type === 'series' && a.is_complete).length;

    // Calculate totals
    const totalWords = activities.reduce((sum: number, a: any) => sum + (a.word_count || 0), 0);
    const avgWords = totalWords > 0 ? Math.round(totalWords / activities.length) : 0;

    console.log('='.repeat(60));
    console.log('ENHANCED SUMMARY:');
    console.log(`  • Total activities: ${activities.length}`);
    console.log(`  • Created: ${createCount} | Updated: ${updateCount}`);
    console.log(`  • Published: ${publishedCount} | Featured: ${featuredCount} | Drafts: ${draftCount}`);

    // Content type summary
    console.log('\nContent Breakdown:');
    if (seriesCount > 0) console.log(`  📗 Series: ${seriesCount}${completedSeriesCount > 0 ? ` (${completedSeriesCount} completed)` : ''}`);
    if (episodeCount > 0) console.log(`  📖 Episodes: ${episodeCount}`);
    if (articleCount > 0) console.log(`  📄 Articles: ${articleCount}`);

    // Article type breakdown
    const articleTypes = activities
      .filter((a: any) => a.content_type === 'article' && a.article_type)
      .reduce((acc: any, a: any) => {
        acc[a.article_type] = (acc[a.article_type] || 0) + 1;
        return acc;
      }, {});

    if (Object.keys(articleTypes).length > 0) {
      console.log('\nArticle Types:');
      Object.entries(articleTypes).forEach(([type, count]) => {
        console.log(`  • ${type}: ${count}`);
      });
    }

    if (totalWords > 0) {
      console.log(`\nContent Metrics:`);
      console.log(`  • Total words: ${totalWords.toLocaleString()}`);
      console.log(`  • Average words: ${avgWords}`);
    }

    // Editor breakdown
    const editorCounts = new Map<string, { total: number, series: number, episodes: number, articles: number }>();
    activities.forEach((a: any) => {
      const editorKey = a.editor_name || 'Unknown';
      const current = editorCounts.get(editorKey) || { total: 0, series: 0, episodes: 0, articles: 0 };

      current.total++;
      if (a.content_type === 'series') {
        current.series++;
      } else if (a.series_id) {
        current.episodes++;
      } else {
        current.articles++;
      }

      editorCounts.set(editorKey, current);
    });

    if (editorCounts.size > 1) {
      console.log('\nEditor Activity:');
      Array.from(editorCounts.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .forEach(([editor, counts]) => {
          const breakdown = [];
          if (counts.series > 0) breakdown.push(`${counts.series} series`);
          if (counts.episodes > 0) breakdown.push(`${counts.episodes} episodes`);
          if (counts.articles > 0) breakdown.push(`${counts.articles} articles`);

          console.log(`  • ${editor}: ${counts.total} total (${breakdown.join(', ')})`);
        });
    }

    log.success('Enhanced activity logs with series support retrieved successfully');
  } catch (error) {
    log.error(`Failed to retrieve logs: ${error}`);
    // Set exit code; allow finally to run for graceful close
    process.exitCode = 1;
  } finally {
    try {
      await closeDbConnection();
    } catch {
      // ignore close errors
    }
  }
}

viewLogs();
