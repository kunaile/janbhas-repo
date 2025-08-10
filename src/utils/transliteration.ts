// src/utils/transliteration.ts
import Sanscript from '@indic-transliteration/sanscript';
import { readFileSync } from 'fs';
import { join } from 'path';

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
 * Cache for loaded author mappings to avoid repeated file reads
 */
const authorMappingCache: Map<string, Record<string, string>> = new Map();

/**
 * Loads author mappings from JSON file for a specific language
 * 
 * @param langCode - Language code (e.g., 'hi', 'bn')
 * @returns Author mappings object
 */
function loadAuthorMappings(langCode: string): Record<string, string> {
    // Check cache first
    if (authorMappingCache.has(langCode)) {
        return authorMappingCache.get(langCode)!;
    }

    try {
        const mappingFile = join(__dirname, '../data', `author-mappings.${langCode}.json`);
        const fileContent = readFileSync(mappingFile, 'utf8');
        const mappingData = JSON.parse(fileContent);

        const mappings = mappingData.author_mappings || {};

        // Cache the mappings
        authorMappingCache.set(langCode, mappings);

        console.log(`[OK] Loaded ${Object.keys(mappings).length} author mappings for ${langCode}`);
        return mappings;

    } catch (error) {
        console.warn(`[WARN] Could not load author mappings for ${langCode}: ${error}`);
        // Return empty object if file doesn't exist
        const emptyMappings = {};
        authorMappingCache.set(langCode, emptyMappings);
        return emptyMappings;
    }
}

/**
 * Gets all available author mappings for multiple languages
 * 
 * @param languages - Array of language codes to load
 * @returns Combined mappings from all languages
 */
function getAllAuthorMappings(languages: string[] = ['hi', 'bn']): Record<string, string> {
    const combinedMappings: Record<string, string> = {};

    for (const lang of languages) {
        const langMappings = loadAuthorMappings(lang);
        Object.assign(combinedMappings, langMappings);
    }

    return combinedMappings;
}

/**
 * Maps language codes to their corresponding Sanscript identifiers
 */
function getScriptFromLanguage(langCode: string): string {
    switch (langCode.toLowerCase()) {
        case 'hi':
        case 'mr':
        case 'sa':
        case 'ne':
            return 'devanagari';
        case 'bn':
            return 'bengali';
        case 'gu':
            return 'gujarati';
        case 'kn':
            return 'kannada';
        case 'ml':
            return 'malayalam';
        case 'or':
            return 'oriya';
        case 'pa':
            return 'gurmukhi';
        case 'ta':
            return 'tamil';
        case 'te':
            return 'telugu';
        case 'en':
            return 'iast';
        default:
            return 'devanagari';
    }
}

/**
 * Transliterates text from Indian scripts to Latin using Sanscript
 * 
 * @param text - Text to transliterate
 * @param options - Configuration options
 * @returns Transliterated text in Latin script
 */
export function transliterate(text: string, options?: { lowercase?: boolean; lang?: string }): string {
    if (!text || typeof text !== 'string') {
        return '';
    }

    const { lowercase = true, lang = 'hi' } = options || {};
    const sourceScript = getScriptFromLanguage(lang);

    try {
        let result = Sanscript.t(text, sourceScript, 'iast');

        // Normalize diacritical marks
        result = result
            .replace(/ā/g, 'a').replace(/ī/g, 'i').replace(/ū/g, 'u')
            .replace(/ṛ/g, 'ri').replace(/ṝ/g, 'rri').replace(/ḷ/g, 'li')
            .replace(/ṃ/g, 'm').replace(/ṁ/g, 'm').replace(/ḥ/g, 'h')
            .replace(/ṭ/g, 't').replace(/ḍ/g, 'd').replace(/ṇ/g, 'n')
            .replace(/ś/g, 'sh').replace(/ṣ/g, 'sh')
            .replace(/ʻ/g, '').replace(/'/g, '').replace(/'/g, '')
            .replace(/"/g, '').replace(/"/g, '').replace(/"/g, '')
            .replace(/\s+/g, ' ').trim();

        return lowercase ? result.toLowerCase() : result;

    } catch (error) {
        console.warn(`[WARN] Sanscript transliteration failed: ${error}`);
        return text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    }
}

/**
 * Enhanced transliteration for author names using JSON mappings
 * Loads mappings from language-specific JSON files
 * 
 * @param authorName - Author name in original script
 * @param langCode - Language code for loading appropriate mappings
 * @returns Transliterated author name
 */
export function transliterateAuthorName(authorName: string, langCode: string = 'hi'): string {
    if (!authorName || typeof authorName !== 'string') {
        return '';
    }

    const cleanName = authorName.trim();

    // Load language-specific mappings
    const languageMappings = loadAuthorMappings(langCode);

    // Check exact match first
    if (languageMappings[cleanName]) {
        return languageMappings[cleanName];
    }

    // Check without quotes/apostrophes
    const nameWithoutQuotes = cleanName.replace(/[''"]/g, '');
    if (languageMappings[nameWithoutQuotes]) {
        return languageMappings[nameWithoutQuotes];
    }

    // Try other common languages as fallback
    const allMappings = getAllAuthorMappings(['hi', 'bn', 'ta', 'te']);
    if (allMappings[cleanName]) {
        return allMappings[cleanName];
    }
    if (allMappings[nameWithoutQuotes]) {
        return allMappings[nameWithoutQuotes];
    }

    // Fall back to automatic transliteration
    return transliterate(cleanName, { lang: langCode });
}

/**
 * Generates a URL-friendly slug from title and author
 * 
 * @param title - Article title in original script
 * @param author - Author name in original script  
 * @param language - Language code for script detection
 * @returns URL-friendly slug
 */
export function generateSlug(title: string, author: string, language: string = 'hi'): string {
    if (!title || !author) {
        console.warn('[WARN] Missing title or author for slug generation');
        return 'untitled_by_unknown';
    }

    const titleSlug = transliterate(title, { lang: language })
        .replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
        .replace(/-+/g, '-').replace(/^-|-$/g, '');

    const authorSlug = transliterateAuthorName(author, language)
        .replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
        .replace(/-+/g, '-').replace(/^-|-$/g, '');

    const finalTitle = titleSlug || 'untitled';
    const finalAuthor = authorSlug || 'unknown';

    return `${finalTitle}_by_${finalAuthor}`;
}

/**
 * Normalizes text for database storage
 */
export function normalizeText(text: string): string {
    if (!text || typeof text !== 'string') {
        return '';
    }
    return text.trim().toLowerCase();
}

/**
 * Gets the English name for a language code
 */
export function getLanguageName(langCode: string): string {
    return LANGUAGE_NAMES[langCode.toLowerCase()] || langCode.toUpperCase();
}

/**
 * Dynamically adds a new author mapping to a specific language
 * Also saves it to the JSON file for persistence
 * 
 * @param originalName - Original name in native script
 * @param transliteratedName - Transliterated name in Latin script
 * @param langCode - Language code
 */
export async function addAuthorMapping(
    originalName: string,
    transliteratedName: string,
    langCode: string = 'hi'
): Promise<void> {
    try {
        const mappings = loadAuthorMappings(langCode);
        mappings[originalName] = transliteratedName.toLowerCase();

        // Update cache
        authorMappingCache.set(langCode, mappings);

        // Save to file
        const mappingFile = join(__dirname, '../data', `author-mappings.${langCode}.json`);
        const fileData = {
            language: getLanguageName(langCode),
            language_code: langCode,
            script: getScriptFromLanguage(langCode),
            author_mappings: mappings
        };

        const fs = await import('fs/promises');
        await fs.writeFile(mappingFile, JSON.stringify(fileData, null, 2), 'utf8');

        console.log(`[OK] Added author mapping: ${originalName} -> ${transliteratedName} (${langCode})`);

    } catch (error) {
        console.error(`[ERROR] Failed to add author mapping: ${error}`);
    }
}

/**
 * Gets current author mappings for a language
 */
export function getAuthorMappings(langCode: string = 'hi'): Record<string, string> {
    return { ...loadAuthorMappings(langCode) };
}

/**
 * Clears the author mapping cache (useful for testing)
 */
export function clearMappingCache(): void {
    authorMappingCache.clear();
}
