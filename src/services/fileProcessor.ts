// src/services/fileProcessor.ts

/**
 * File processing service for handling Git webhook payloads
 * Analyzes file changes and categorizes them by operation type
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export type FileChange = {
    filename: string;
    status: 'added' | 'modified' | 'removed' | 'renamed';
    previousFilename?: string;
};

export type CommitInfo = {
    username: string;
    timestamp: string;
    message: string;
    files: FileChange[];
};

/**
 * Extracts commit information from GitHub webhook payload
 * Processes each commit and analyzes file changes
 */
export function extractCommitInfo(payload: any): CommitInfo[] {
    const commits: CommitInfo[] = [];

    if (!payload.commits || !Array.isArray(payload.commits)) {
        console.warn('⚠️ No commits found in webhook payload');
        return commits;
    }

    for (const commit of payload.commits) {
        const commitInfo: CommitInfo = {
            username: commit.author?.username || commit.committer?.username || 'unknown',
            timestamp: commit.timestamp || new Date().toISOString(),
            message: commit.message || '',
            files: []
        };

        // Process added files
        if (commit.added && Array.isArray(commit.added)) {
            for (const filename of commit.added) {
                if (isMarkdownFile(filename)) {
                    commitInfo.files.push({
                        filename,
                        status: 'added'
                    });
                }
            }
        }

        // Process modified files
        if (commit.modified && Array.isArray(commit.modified)) {
            for (const filename of commit.modified) {
                if (isMarkdownFile(filename)) {
                    commitInfo.files.push({
                        filename,
                        status: 'modified'
                    });
                }
            }
        }

        // Process removed files
        if (commit.removed && Array.isArray(commit.removed)) {
            for (const filename of commit.removed) {
                if (isMarkdownFile(filename)) {
                    commitInfo.files.push({
                        filename,
                        status: 'removed'
                    });
                }
            }
        }

        commits.push(commitInfo);
        console.log(`📋 Processed commit by ${commitInfo.username}: ${commitInfo.files.length} markdown files changed`);
    }

    return commits;
}

/**
 * Checks if a file is a markdown file we should process
 */
function isMarkdownFile(filename: string): boolean {
    return filename.startsWith('content/') &&
        (filename.endsWith('.md') || filename.endsWith('.mdx'));
}

/**
 * Reads and validates a markdown file exists and is accessible
 */
export function getMarkdownFileContent(filename: string): string | null {
    try {
        const projectRoot = process.cwd();
        const fullPath = join(projectRoot, filename);
        return readFileSync(fullPath, 'utf8');
    } catch (error) {
        console.error(`❌ Error reading file ${filename}:`, error);
        return null;
    }
}

/**
 * Filters commits to only those affecting the main branch
 * and containing markdown file changes
 */
export function filterRelevantCommits(commits: CommitInfo[]): CommitInfo[] {
    return commits.filter(commit =>
        commit.files.length > 0 // Only commits with markdown file changes
    );
}
