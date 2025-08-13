// src/services/contentProcessor/utils.ts

// Shared Logging Utilities
export const log = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warn: (msg: string) => console.log(`[WARN] ${msg}`),
  error: (msg: string) => console.log(`[ERROR] ${msg}`),
  success: (msg: string) => console.log(`[OK] ${msg}`),
  alert: (msg: string) => console.log(`[ALERT] ${msg}`)
};

/**
 * Extract short description from markdown content
 */
export function extractShortDescription(markdownContent: string): string {
  const lines = markdownContent
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const firstParagraph = lines[0] || '';
  return firstParagraph.length <= 150 ? firstParagraph : firstParagraph.substring(0, 147) + '...';
}

/**
 * Parse duration from various formats
 */
export function parseDuration(duration: string | number | undefined): number | null {
  if (!duration) return null;
  if (typeof duration === 'number') return duration;

  const durationStr = duration.toString();
  if (durationStr.includes(':')) {
    const parts = durationStr.split(':');
    if (parts.length === 2) {
      const minutes = parseInt(parts[0], 10);
      const seconds = parseInt(parts[1], 10);
      if (!isNaN(minutes) && !isNaN(seconds)) {
        return minutes * 60 + seconds;
      }
    }
    if (parts.length === 3) {
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      const seconds = parseInt(parts[2], 10);
      if (!isNaN(hours) && !isNaN(minutes) && !isNaN(seconds)) {
        return hours * 3600 + minutes * 60 + seconds;
      }
    }
  }

  const parsed = parseInt(durationStr.replace(/[^\d]/g, ''), 10);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Process tags from various formats
 */
export function processTags(tags: string | string[] | undefined): string[] {
  if (!tags) return [];

  if (typeof tags === 'string') {
    return tags.split(/[,;|]/)
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);
  }

  if (Array.isArray(tags)) {
    return tags.map(tag => tag.toString().trim()).filter(tag => tag.length > 0);
  }

  return [];
}

/**
 * Generate URL-friendly slug
 */
export function generateSlug(title: string, author: string): string {
  const titleSlug = title
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const authorSlug = author
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return `${titleSlug || 'untitled'}_by_${authorSlug || 'unknown'}`;
}

/**
 * Create tag slug
 */
export function createTagSlug(tag: string): string {
  return tag.replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
}
