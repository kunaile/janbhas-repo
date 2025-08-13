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
} {
  const args = process.argv.slice(2);
  return {
    recent: args.includes('--recent'),
    limit: parseInt(args.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '20'),
    help: args.includes('--help')
  };
}

function showHelp() {
  console.log(`
Content Logs Viewer - Usage:

  pnpm logs [options]

Options:
  --recent           Show only recent activity (last 7 days)
  --limit=N          Limit results to N entries (default: 20)
  --help             Show this help message

Examples:
  pnpm logs --recent
  pnpm logs --limit=50
  pnpm logs --recent --limit=10
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
    let whereClause = sql`a.deleted_at IS NULL`;
    if (options.recent) {
      whereClause = sql`a.deleted_at IS NULL AND a.updated_at >= NOW() - INTERVAL '7 days'`;
    }

    // Get recent article activity with editor info - FIX: Access .rows property
    const activitiesResult = await db.execute(sql`
      SELECT 
        a.title,
        a.local_title,
        a.slug,
        a.is_published,
        a.created_at,
        a.updated_at,
        e.name as editor_name,
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
    `);
    const activities = activitiesResult.rows; // ✅ Fixed: Access .rows

    if (activities.length === 0) {
      console.log('No recent activity found.');
      return;
    }

    console.log(`Showing ${activities.length} recent activities${options.recent ? ' (last 7 days)' : ''}:\n`);

    activities.forEach((activity: any) => {
      const date = new Date(activity.updated_at).toLocaleString();
      const actionIcon = activity.action_type === 'created' ? '✨' : '📝';
      const statusIcon = activity.is_published ? '📢' : '📄';
      const editor = activity.editor_github ?
        `${activity.editor_name} (@${activity.editor_github})` :
        activity.editor_name;

      console.log(`${actionIcon} ${statusIcon} ${activity.local_title || activity.title}`);
      console.log(`    ${activity.action_type.toUpperCase()} by ${editor}`);
      console.log(`    ${date}`);
      console.log(`    Status: ${activity.is_published ? 'Published' : 'Draft'}`);
      console.log(`    Slug: ${activity.slug}`);
      console.log('');
    });

    // Show summary stats - FIX: Access array methods on activities (now an array)
    const createCount = activities.filter((a: any) => a.action_type === 'created').length;
    const updateCount = activities.filter((a: any) => a.action_type === 'updated').length;
    const publishedCount = activities.filter((a: any) => a.is_published).length;

    console.log('='.repeat(50));
    console.log('Summary:');
    console.log(`  • Created: ${createCount}`);
    console.log(`  • Updated: ${updateCount}`);
    console.log(`  • Published: ${publishedCount}`);
    console.log(`  • Drafts: ${activities.length - publishedCount}`);

    log.success('Activity logs retrieved successfully');

  } catch (error) {
    log.error(`Failed to retrieve logs: ${error}`);
    process.exit(1);
  }
}

viewLogs();
