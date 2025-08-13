// scripts/view-logs.ts

import { createDbConnection, getDb } from '../src/db';
import { articles, editors } from '../src/db/schema';
import { sql, desc, eq, isNull } from 'drizzle-orm';

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
} {
  const args = process.argv.slice(2);
  return {
    recent: args.includes('--recent'),
    limit: parseInt(args.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '20'),
    help: args.includes('--help'),
    editor: args.find(arg => arg.startsWith('--editor='))?.split('=')[1],
    featured: args.includes('--featured'),
    published: args.includes('--published')
  };
}

function showHelp() {
  console.log(`
Content Logs Viewer - Usage:

  pnpm logs [options]

Options:
  --recent           Show only recent activity (last 7 days)
  --limit=N          Limit results to N entries (default: 20)
  --editor=NAME      Filter by editor name or GitHub username
  --featured         Show only featured articles
  --published        Show only published articles
  --help             Show this help message

Examples:
  pnpm logs --recent
  pnpm logs --limit=50
  pnpm logs --recent --limit=10
  pnpm logs --editor=john --featured
  pnpm logs --published --limit=30
  `);
}

async function viewLogs() {
  try {
    const options = parseArgs();

    if (options.help) {
      showHelp();
      process.exit(0);
    }

    log.info('Fetching content activity logs...');

    await createDbConnection();
    const db = getDb();

    console.log('\n=== CONTENT ACTIVITY LOGS ===\n');

    // Build query conditions
    const whereConditions: string[] = ['a.deleted_at IS NULL']; // ✅ Fixed: explicitly type as string[]

    if (options.recent) {
      whereConditions.push("a.updated_at >= NOW() - INTERVAL '7 days'");
    }

    if (options.featured) {
      whereConditions.push('a.is_featured = true');
    }

    if (options.published) {
      whereConditions.push('a.is_published = true');
    }

    if (options.editor) {
      whereConditions.push(`(e.name ILIKE '%${options.editor}%' OR e.github_user_name ILIKE '%${options.editor}%')`);
    }

    const whereClause = whereConditions.join(' AND ');

    // Get recent article activity with editor info
    const activitiesResult = await db.execute(sql.raw(`
      SELECT 
        a.title,
        a.local_title,
        a.slug,
        a.is_published,
        a.is_featured,
        a.word_count,
        a.duration,
        a.created_at,
        a.updated_at,
        e.name as editor_name,
        e.email as editor_email,
        e.github_user_name as editor_github,
        CASE 
          WHEN a.created_at = a.updated_at THEN 'created'
          ELSE 'updated'
        END as action_type
      FROM articles a
      LEFT JOIN editors e ON a.editor_id = e.id
      WHERE ${whereClause}
      ORDER BY a.updated_at DESC
      LIMIT ${options.limit}
    `));
    const activities = activitiesResult.rows;

    if (activities.length === 0) {
      console.log('No activities found matching the criteria.');
      return;
    }

    // Build filter description
    let filterDesc = '';
    const filters: string[] = []; // ✅ Fixed: explicitly type as string[]
    if (options.recent) filters.push('last 7 days');
    if (options.featured) filters.push('featured only');
    if (options.published) filters.push('published only');
    if (options.editor) filters.push(`editor: ${options.editor}`);
    if (filters.length > 0) {
      filterDesc = ` (${filters.join(', ')})`;
    }

    console.log(`Showing ${activities.length} activities${filterDesc}:\n`);

    activities.forEach((activity: any, index: number) => {
      const date = new Date(activity.updated_at).toLocaleString();
      const actionIcon = activity.action_type === 'created' ? '✨' : '📝';
      const statusIcon = activity.is_published ? '📢' : '📄';
      const featuredIcon = activity.is_featured ? '⭐' : '';

      let editor = activity.editor_name || 'Unknown Editor';
      if (activity.editor_github) editor += ` (@${activity.editor_github})`;
      if (activity.editor_email) editor += ` <${activity.editor_email}>`;

      console.log(`${index + 1}. ${actionIcon} ${statusIcon}${featuredIcon} ${activity.local_title || activity.title}`);
      console.log(`    ${activity.action_type.toUpperCase()} by ${editor}`);
      console.log(`    ${date}`);

      const statusParts: string[] = []; // ✅ Fixed: explicitly type as string[]
      statusParts.push(activity.is_published ? 'Published' : 'Draft');
      if (activity.is_featured) statusParts.push('Featured');
      if (activity.word_count) statusParts.push(`${activity.word_count} words`);
      if (activity.duration) {
        const minutes = Math.floor(activity.duration / 60);
        const seconds = activity.duration % 60;
        statusParts.push(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      }

      console.log(`    Status: ${statusParts.join(' • ')}`);
      console.log(`    Slug: ${activity.slug}`);
      console.log('');
    });

    // Show summary stats
    const createCount = activities.filter((a: any) => a.action_type === 'created').length;
    const updateCount = activities.filter((a: any) => a.action_type === 'updated').length;
    const publishedCount = activities.filter((a: any) => a.is_published).length;
    const featuredCount = activities.filter((a: any) => a.is_featured).length;
    const draftCount = activities.length - publishedCount;

    // Calculate word count and duration totals
    const totalWords = activities.reduce((sum: number, a: any) => sum + (a.word_count || 0), 0);
    const totalDuration = activities.reduce((sum: number, a: any) => sum + (a.duration || 0), 0);
    const avgWords = Math.round(totalWords / activities.length);

    console.log('='.repeat(50));
    console.log('Summary:');
    console.log(`  • Total activities: ${activities.length}`);
    console.log(`  • Created: ${createCount}`);
    console.log(`  • Updated: ${updateCount}`);
    console.log(`  • Published: ${publishedCount}`);
    console.log(`  • Featured: ${featuredCount}`);
    console.log(`  • Drafts: ${draftCount}`);

    if (totalWords > 0) {
      console.log(`  • Total words: ${totalWords.toLocaleString()}`);
      console.log(`  • Average words: ${avgWords}`);
    }

    if (totalDuration > 0) {
      const hours = Math.floor(totalDuration / 3600);
      const minutes = Math.floor((totalDuration % 3600) / 60);
      console.log(`  • Total duration: ${hours}h ${minutes}m`);
    }

    // Show editor breakdown
    const editorCounts = new Map<string, number>();
    activities.forEach((a: any) => {
      const editorKey = a.editor_name || 'Unknown';
      editorCounts.set(editorKey, (editorCounts.get(editorKey) || 0) + 1);
    });

    if (editorCounts.size > 1) {
      console.log('\nEditor Activity:');
      Array.from(editorCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([editor, count]) => {
          console.log(`  • ${editor}: ${count} activities`);
        });
    }

    log.success('Activity logs retrieved successfully');

  } catch (error) {
    log.error(`Failed to retrieve logs: ${error}`);
    process.exit(1);
  }
}

viewLogs();
