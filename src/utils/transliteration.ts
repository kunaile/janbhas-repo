// src/utils/transliteration.ts
import { transliterate as transliterateLibrary, slugify } from 'transliteration';

/**
 * Language code to name mapping
 */
const LANGUAGE_NAMES: Record<string, string> = {
    'hi': 'Hindi',
    'bn': 'Bengali',
    'ta': 'Tamil',
    'te': 'Telugu',
    'ml': 'Malayalam',
    'kn': 'Kannada',
    'gu': 'Gujarati',
    'mr': 'Marathi',
    'pa': 'Punjabi',
    'or': 'Odia',
    'en': 'English'
};

/**
 * Transliterates text from any script to Latin/English using the transliteration library
 * This library supports many scripts including Devanagari, Bengali, Tamil, etc.
 * 
 * @param text - The text to transliterate
 * @param options - Optional configuration for transliteration
 * @returns Transliterated text in lowercase
 */
export function transliterate(text: string, options?: { lowercase?: boolean }): string {
    if (!text || typeof text !== 'string') {
        return '';
    }

    const { lowercase = true } = options || {};

    // Use the transliteration library to convert to Latin script
    let result = transliterateLibrary(text, {
        unknown: '?', // Replace unknown characters with ?
        replace: [], // No custom replacements by default
        replaceAfter: [], // No post-processing replacements
    });

    // Clean up the result
    result = result
        .replace(/\s+/g, ' ')          // Multiple spaces to single space
        .replace(/[^\w\s\-]/g, '')     // Remove special characters except hyphens
        .trim();

    return lowercase ? result.toLowerCase() : result;
}

/**
 * Generates a URL-friendly slug from title and author
 * Format: "transliterated-title_by_transliterated-author"
 * Uses the transliteration library's built-in slugify function
 * 
 * @param title - Article title in any script
 * @param author - Author name in any script  
 * @returns URL-friendly slug
 */
export function generateSlug(title: string, author: string): string {
    if (!title || !author) {
        console.warn('⚠️ Missing title or author for slug generation');
        return 'untitled_by_unknown';
    }

    // Use slugify for better URL-friendly conversion
    const titleSlug = slugify(title, {
        lowercase: true,
        separator: '-',
        replace: [], // No custom replacements
    });

    const authorSlug = slugify(author, {
        lowercase: true,
        separator: '-',
        replace: [],
    });

    // Clean up any multiple hyphens and ensure valid format
    const cleanTitle = titleSlug
        .replace(/-+/g, '-')           // Multiple hyphens to single
        .replace(/^-|-$/g, '')         // Remove leading/trailing hyphens
        .replace(/[^a-z0-9\-]/g, '');  // Ensure only valid characters

    const cleanAuthor = authorSlug
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .replace(/[^a-z0-9\-]/g, '');

    // Handle edge cases where transliteration might fail
    const finalTitle = cleanTitle || 'untitled';
    const finalAuthor = cleanAuthor || 'unknown';

    return `${finalTitle}_by_${finalAuthor}`;
}

/**
 * Normalizes text for database storage
 * Converts to lowercase and removes extra whitespace
 * 
 * @param text - Text to normalize
 * @returns Normalized text
 */
export function normalizeText(text: string): string {
    if (!text || typeof text !== 'string') {
        return '';
    }

    return text.trim().toLowerCase();
}

/**
 * Gets the English name for a language code
 * 
 * @param langCode - Language code (e.g., 'hi', 'bn')
 * @returns English language name
 */
export function getLanguageName(langCode: string): string {
    return LANGUAGE_NAMES[langCode.toLowerCase()] || langCode.toUpperCase();
}
