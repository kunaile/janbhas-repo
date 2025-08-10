// src/services/webhook.ts
/**
 * GitHub webhook handler service
 * Processes incoming webhook requests and triggers content synchronization
 */
import { Request, Response } from 'express';
import { extractCommitInfo, filterRelevantCommits } from './fileProcessor';
import { processCommitChanges } from './contentProcessor';

/**
 * Main webhook handler for GitHub push events
 * Validates payload and triggers content processing pipeline
 */
export async function webhookHandler(req: Request, res: Response): Promise<void> {
    console.log('📨 Received GitHub webhook');

    try {
        const payload = req.body;

        // Validate webhook payload
        if (!isValidPushEvent(payload)) {
            console.log('ℹ️ Ignoring non-push event or invalid payload');
            res.status(200).json({
                success: true,
                message: 'Ignored (not a relevant push event)'
            });
            return;
        }

        // Check if push is to main branch
        if (payload.ref !== 'refs/heads/main') {
            console.log(`ℹ️ Ignoring push to branch: ${payload.ref}`);
            res.status(200).json({
                success: true,
                message: `Ignored push to ${payload.ref}`
            });
            return;
        }

        console.log('🚀 Processing push to main branch...');
        console.log(`📦 Repository: ${payload.repository?.full_name}`);
        console.log(`👤 Pushed by: ${payload.pusher?.name}`);

        // Extract commit information
        const commits = extractCommitInfo(payload);
        const relevantCommits = filterRelevantCommits(commits);

        if (relevantCommits.length === 0) {
            console.log('ℹ️ No markdown files changed in commits');
            res.status(200).json({
                success: true,
                message: 'No markdown files to process'
            });
            return;
        }

        console.log(`🔄 Found ${relevantCommits.length} commits with markdown changes`);

        // Process the changes
        await processCommitChanges(relevantCommits);

        res.status(200).json({
            success: true,
            message: 'Content sync completed successfully',
            processed: {
                commits: relevantCommits.length,
                files: relevantCommits.reduce((total, commit) => total + commit.files.length, 0)
            }
        });

    } catch (error) {
        console.error('❌ Webhook processing failed:', error);

        res.status(500).json({
            success: false,
            message: 'Content sync failed',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}

/**
 * Validates that the webhook payload is a push event we can process
 */
function isValidPushEvent(payload: any): boolean {
    return (
        payload &&
        payload.ref &&
        payload.commits &&
        Array.isArray(payload.commits) &&
        payload.repository &&
        payload.pusher
    );
}

/**
 * Optional: Webhook signature verification for security
 * Uncomment and configure if you want to verify webhook signatures
 */
/*
import { createHmac } from 'crypto';

function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = `sha256=${createHmac('sha256', secret)
        .update(payload)
        .digest('hex')}`;
    return signature === expectedSignature;
}
*/
