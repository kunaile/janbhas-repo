// src/utils/transliteration.ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { batchTransliterate, type TransliterationItem, type TransliterationResult } from '../services/geminiTransliteration';

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

const authorMappingCache: Map<string, Record<string, string>> = new Map();

function loadAuthorMappings(langCode: string): Record<string, string> {
    if (authorMappingCache.has(langCode)) {
        return authorMappingCache.get(langCode)!;
    }

    try {
        const mappingFile = join(__dirname, '../data', `author-mappings.${langCode}.json`);
        const fileContent = readFileSync(mappingFile, 'utf8');
        const mappingData = JSON.parse(fileContent);
        const mappings = mappingData.author_mappings || {};
        authorMappingCache.set(langCode, mappings);
        return mappings;
    } catch (error) {
        console.warn(`[WARN] Could not load author mappings for ${langCode}`);
        const emptyMappings = {};
        authorMappingCache.set(langCode, emptyMappings);
        return emptyMappings;
    }
}

/**
 * Enhanced batch transliteration with consistent case handling
 */
export async function batchTransliterateTexts(
    items: Array<{ text: string; type: 'title' | 'author'; language: string }>
): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    if (items.length === 0) {
        return results;
    }

    // Check custom author mappings first
    const itemsToProcess: TransliterationItem[] = [];

    for (const item of items) {
        if (item.type === 'author') {
            const mappings = loadAuthorMappings(item.language);
            const cleanName = item.text.replace(/[''"]/g, '');

            if (mappings[item.text] || mappings[cleanName]) {
                const mapped = mappings[item.text] || mappings[cleanName];
                results.set(item.text, mapped.toLowerCase()); // Ensure lowercase
                console.log(`[OK] Used custom mapping: ${item.text} -> ${mapped.toLowerCase()}`);
                continue;
            }
        }

        itemsToProcess.push(item);
    }

    if (itemsToProcess.length === 0) {
        return results;
    }

    // Process remaining items with Gemini API
    try {
        const geminiResults = await batchTransliterate(itemsToProcess);

        for (const result of geminiResults) {
            // Ensure all results are lowercase and properly formatted
            const finalResult = result.transliterated.toLowerCase().trim();

            if (!finalResult) {
                throw new Error(`Empty result after processing for: "${result.original}"`);
            }

            results.set(result.original, finalResult);
            console.log(`[OK] Transliterated: "${result.original}" -> "${finalResult}"`);
        }

        return results;

    } catch (error) {
        console.error(`[ERROR] Batch transliteration failed: ${error}`);
        throw error;
    }
}

/**
 * Single text transliteration
 */
export async function transliterate(text: string, options?: { lang?: string }): Promise<string> {
    const { lang = 'hi' } = options || {};

    if (!text || typeof text !== 'string') {
        throw new Error(`Invalid text for transliteration: "${text}"`);
    }

    const items = [{ text, type: 'title' as const, language: lang }];
    const results = await batchTransliterateTexts(items);

    const result = results.get(text);
    if (!result) {
        throw new Error(`Transliteration failed for: "${text}"`);
    }

    return result;
}

/**
 * Author name transliteration
 */
export async function transliterateAuthorName(authorName: string, langCode: string = 'hi'): Promise<string> {
    if (!authorName || typeof authorName !== 'string') {
        throw new Error(`Invalid author name: "${authorName}"`);
    }

    const items = [{ text: authorName, type: 'author' as const, language: langCode }];
    const results = await batchTransliterateTexts(items);

    const result = results.get(authorName);
    if (!result) {
        throw new Error(`Author transliteration failed for: "${authorName}"`);
    }

    return result;
}

/**
 * Generate slug with enhanced validation
 */
export async function generateSlug(title: string, author: string, language: string = 'hi'): Promise<string> {
    if (!title || !author) {
        throw new Error('Title and author are required for slug generation');
    }

    const items = [
        { text: title, type: 'title' as const, language },
        { text: author, type: 'author' as const, language }
    ];

    const results = await batchTransliterateTexts(items);

    const titleResult = results.get(title);
    const authorResult = results.get(author);

    if (!titleResult || !authorResult) {
        throw new Error('Slug generation failed - transliteration incomplete');
    }

    // Create URL-friendly slug
    const titleSlug = titleResult
        .replace(/\s+/g, '-')           // Spaces to hyphens
        .replace(/[^a-z0-9\-]/g, '')    // Keep only alphanumeric and hyphens
        .replace(/-+/g, '-')            // Multiple hyphens to single
        .replace(/^-|-$/g, '');         // Remove leading/trailing hyphens

    const authorSlug = authorResult
        .replace(/\s+/g, '-')           // Spaces to hyphens
        .replace(/[^a-z0-9\-]/g, '')    // Keep only alphanumeric and hyphens
        .replace(/-+/g, '-')            // Multiple hyphens to single
        .replace(/^-|-$/g, '');         // Remove leading/trailing hyphens

    if (!titleSlug || !authorSlug) {
        throw new Error('Slug generation failed - empty results after cleaning');
    }

    return `${titleSlug}_by_${authorSlug}`;
}

/**
 * Utility functions
 */
export function normalizeText(text: string): string {
    if (!text || typeof text !== 'string') {
        throw new Error(`Invalid text for normalization: "${text}"`);
    }
    return text.trim().toLowerCase();
}

export function getLanguageName(langCode: string): string {
    return LANGUAGE_NAMES[langCode.toLowerCase()] || langCode.toUpperCase();
}

export function getAuthorMappings(langCode: string = 'hi'): Record<string, string> {
    return { ...loadAuthorMappings(langCode) };
}
