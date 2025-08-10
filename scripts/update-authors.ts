// scripts/update-authors.ts
import { createDbConnection, closeDbConnection } from '../src/db';
import { getDb } from '../src/db';
import { authors, articles } from '../src/db/schema';
import { transliterate } from '../src/utils/transliteration';
import { eq } from 'drizzle-orm';

// Custom mappings for well-known authors
const AUTHOR_CORRECTIONS: Record<string, string> = {
    'premcnd': 'premchand',
    'jyshnkr prsaad': 'jaishankar prasad',
    'gijubhaaii bdhekaa': 'gijubhai badheka',
    'mnntto': 'manto',
    'cndrdhr shrmaa gulerii': 'chandradhar sharma guleri',
};

async function updateAuthors() {
    try {
        console.log('[INFO] Starting author updates');

        await createDbConnection();
        const db = getDb();

        // Get all authors
        const allAuthors = await db.select().from(authors);

        let updated = 0;

        for (const author of allAuthors) {
            const correctedName = AUTHOR_CORRECTIONS[author.name];

            if (correctedName) {
                await db.update(authors)
                    .set({ name: correctedName })
                    .where(eq(authors.id, author.id));

                console.log(`[OK] Updated: ${author.name} -> ${correctedName}`);
                updated++;
            }
        }

        console.log(`[OK] Updated ${updated} authors`);

    } catch (error) {
        console.log(`[ALERT] Author update failed: ${error}`);
        process.exit(1);
    } finally {
        await closeDbConnection();
        process.exit(0);
    }
}

updateAuthors();
