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
    .replace(/^#+\s+/gm, '')           // Remove markdown headers
    .replace(/\*\*(.*?)\*\*/g, '$1')   // Remove bold formatting
    .replace(/\*(.*?)\*/g, '$1')       // Remove italic formatting
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // Remove links, keep text
    .replace(/`([^`]+)`/g, '$1')       // Remove code formatting
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const firstParagraph = lines[0] || '';
  return firstParagraph.length <= 150 ? firstParagraph : firstParagraph.substring(0, 147) + '...';
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
 * Create tag slug from tag name
 */
export function createTagSlug(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')    // Remove special characters except spaces and hyphens
    .replace(/\s+/g, '-')        // Replace spaces with hyphens
    .replace(/-+/g, '-')         // Replace multiple hyphens with single
    .replace(/^-|-$/g, '');      // Remove leading/trailing hyphens
}

/**
 * Validate required frontmatter fields
 */
export function validateRequiredFields(frontmatter: any): { isValid: boolean; missing: string[] } {
  const required = ['title', 'local_title', 'author', 'category', 'lang'];
  const missing = required.filter(field => !frontmatter[field] || frontmatter[field].trim() === '');

  return {
    isValid: missing.length === 0,
    missing
  };
}

/**
 * Clean and normalize text content
 */
export function cleanTextContent(content: string): string {
  return content
    .trim()
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .replace(/[""'']/g, '"')        // Normalize quotes
    .replace(/[–—]/g, '-')          // Normalize dashes
    .replace(/…/g, '...');          // Normalize ellipsis
}

/**
 * Format file size for logging
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format processing time for logging
 */
export function formatTime(milliseconds: number): string {
  if (milliseconds < 1000) return `${milliseconds}ms`;
  if (milliseconds < 60000) return `${(milliseconds / 1000).toFixed(1)}s`;
  return `${(milliseconds / 60000).toFixed(1)}m`;
}

/**
 * Validate slug format
 */
export function isValidSlug(slug: string): boolean {
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return slugPattern.test(slug) && slug.length >= 3 && slug.length <= 255;
}

/**
 * Count words in text content
 */
export function countWords(text: string): number {
  return text
    .replace(/[^\w\s]/g, ' ')    // Replace punctuation with spaces
    .replace(/\s+/g, ' ')        // Normalize whitespace
    .trim()
    .split(' ')
    .filter(word => word.length > 0)
    .length;
}

/**
 * Truncate text to specified length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3).trim() + '...';
}

/**
 * Check if a string is a valid language code
 */
export function isValidLanguageCode(code: string): boolean {
  const validCodes = ['hi', 'en', 'bn', 'ta', 'te', 'ml', 'kn', 'gu', 'mr', 'pa', 'or'];
  return validCodes.includes(code.toLowerCase());
}

/**
 * Generate a unique ID for temporary use
 */
export function generateTempId(): string {
  return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Safe JSON stringify with error handling
 */
export function safeStringify(obj: any, indent?: number): string {
  try {
    return JSON.stringify(obj, null, indent);
  } catch (error) {
    return `[JSON Error: ${error}]`;
  }
}
