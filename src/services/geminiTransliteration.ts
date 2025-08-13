// src/services/geminiTransliteration.ts

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY || '');

export type TransliterationItem = {
    text: string;
    type: 'title' | 'author' | 'category' | 'subcategory' | 'tag';
    language: string;
};

export type TransliterationResult = {
    original: string;
    transliterated: string;
    type: 'title' | 'author' | 'category' | 'subcategory' | 'tag';
};

// Rate limiting configuration
const RATE_LIMIT = {
    MAX_BATCH_SIZE: 50, // Maximum items per batch
    MAX_RETRIES: 5,
    INITIAL_DELAY: 1000, // 1 second
    MAX_DELAY: 30000, // 30 seconds
    BACKOFF_MULTIPLIER: 2
};

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoffDelay(attempt: number): number {
    const delay = RATE_LIMIT.INITIAL_DELAY * Math.pow(RATE_LIMIT.BACKOFF_MULTIPLIER, attempt - 1);
    return Math.min(delay + Math.random() * 1000, RATE_LIMIT.MAX_DELAY); // Add jitter
}

/**
 * Create optimized structured prompt for batch transliteration
 */
function createStructuredBatchPrompt(items: TransliterationItem[]): string {
    // Group items by language for better context
    const itemsByLanguage = items.reduce((acc, item, index) => {
        if (!acc[item.language]) acc[item.language] = [];
        acc[item.language].push({ ...item, index });
        return acc;
    }, {} as Record<string, Array<TransliterationItem & { index: number }>>);

    const languagePrompts = Object.entries(itemsByLanguage).map(([lang, langItems]) => {
        const itemList = langItems.map(item =>
            `${item.index}. ${item.type.toUpperCase()}: "${item.text}"`
        ).join('\n');

        return `LANGUAGE: ${lang.toUpperCase()}\n${itemList}`;
    }).join('\n\n');

    return `You are an expert in Indian language transliteration. Convert the following texts to accurate English transliteration with proper phonetic pronunciation.

CRITICAL REQUIREMENTS:
1. ALWAYS start transliterated words with the correct first letter - never omit it
2. Use proper phonetic accuracy (e.g., "पूस की रात" = "poos ki raat", NOT "puus kii raat")
3. Use natural word spacing and pronunciation
4. For author names, use commonly accepted transliterations if known
5. For categories/subcategories/tags, use simple, clear English equivalents
6. Each transliteration must be complete - no missing letters or characters
7. Return ONLY valid JSON array with no additional text or formatting

EXAMPLES OF CORRECT OUTPUT:
- "प्रेमचंद" (author) should become "premchand"
- "गुल्ली डण्डा" (title) should become "gulli danda"
- "पूस की रात" (title) should become "poos ki raat"
- "बाल कथाएँ" (category) should become "children stories"
- "कविता" (category) should become "poetry"
- "नैतिक कहानी" (tag) should become "moral story"

INPUT TEXTS:
${languagePrompts}

REQUIRED JSON OUTPUT FORMAT (use lowercase transliterations):
[
  {
    "index": 0,
    "original": "original_text",
    "transliterated": "lowercase transliteration",
    "type": "title_or_author_or_category_or_subcategory_or_tag"
  }
]

Return ONLY the JSON array, no other text.`;
}

/**
 * Process API response and extract results
 */
function processApiResponse(response: string, originalItems: TransliterationItem[]): TransliterationResult[] {
    try {
        // Extract JSON from response
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            throw new Error('Invalid response format - no JSON array found');
        }

        const rawResults = JSON.parse(jsonMatch[0]);

        if (!Array.isArray(rawResults)) {
            throw new Error('Response is not an array');
        }

        // Validate and clean results
        const results: TransliterationResult[] = [];

        for (const rawResult of rawResults) {
            const { index, original, transliterated, type } = rawResult;

            if (typeof index !== 'number' || index < 0 || index >= originalItems.length) {
                console.warn(`Invalid index in response: ${index}`);
                continue;
            }

            const originalItem = originalItems[index];

            if (!transliterated || typeof transliterated !== 'string') {
                console.warn(`Empty transliteration for: "${originalItem.text}"`);
                continue;
            }

            // Clean transliteration
            const cleaned = transliterated.toLowerCase().trim()
                .replace(/[^\w\s\-']/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            if (!cleaned) {
                console.warn(`Cleaning resulted in empty transliteration for: "${originalItem.text}"`);
                continue;
            }

            results.push({
                original: originalItem.text,
                transliterated: cleaned,
                type: originalItem.type
            });
        }

        return results;
    } catch (error) {
        throw new Error(`Failed to process API response: ${error}`);
    }
}

/**
 * Make API call with retry logic and exponential backoff
 */
async function makeApiCallWithRetry(prompt: string, attempt: number = 1): Promise<string> {
    try {
        console.log(`[INFO] Making Gemini API call (attempt ${attempt}/${RATE_LIMIT.MAX_RETRIES})`);

        const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            generationConfig: {
                temperature: 0.1,
                topK: 1,
                topP: 0.8,
                maxOutputTokens: 8192,
            },
        });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        if (!text || text.trim() === '') {
            throw new Error('Empty response from Gemini API');
        }

        return text;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Check if it's a rate limit or overload error
        const isRetryableError =
            errorMessage.includes('503') ||
            errorMessage.includes('overloaded') ||
            errorMessage.includes('rate limit') ||
            errorMessage.includes('429') ||
            errorMessage.includes('quota');

        if (isRetryableError && attempt < RATE_LIMIT.MAX_RETRIES) {
            const delay = calculateBackoffDelay(attempt);
            console.warn(`[WARN] API call failed (attempt ${attempt}): ${errorMessage}`);
            console.log(`[INFO] Retrying in ${delay}ms...`);

            await sleep(delay);
            return makeApiCallWithRetry(prompt, attempt + 1);
        }

        throw error;
    }
}

/**
 * Split items into manageable batches
 */
function createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0;i < items.length;i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
    }
    return batches;
}

/**
 * Optimized batch transliteration with single API call per batch
 */
export async function batchTransliterate(items: TransliterationItem[]): Promise<TransliterationResult[]> {
    if (!process.env.GOOGLE_GEMINI_API_KEY) {
        throw new Error('GOOGLE_GEMINI_API_KEY not configured');
    }

    if (items.length === 0) {
        return [];
    }

    console.log(`[INFO] Starting optimized batch transliteration for ${items.length} items`);

    // Split into batches if needed
    const batches = createBatches(items, RATE_LIMIT.MAX_BATCH_SIZE);
    const allResults: TransliterationResult[] = [];

    for (let batchIndex = 0;batchIndex < batches.length;batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`[INFO] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} items)`);

        try {
            // Create structured prompt for entire batch
            const prompt = createStructuredBatchPrompt(batch);

            // Make single API call for entire batch
            const response = await makeApiCallWithRetry(prompt);

            // Process response
            const batchResults = processApiResponse(response, batch);
            allResults.push(...batchResults);

            console.log(`[OK] Batch ${batchIndex + 1} completed: ${batchResults.length}/${batch.length} items processed`);

            // Add delay between batches to avoid overwhelming the API
            if (batchIndex < batches.length - 1) {
                await sleep(1000); // 1 second delay between batches
            }

        } catch (error) {
            console.error(`[ERROR] Batch ${batchIndex + 1} failed: ${error}`);
            throw new Error(`Batch transliteration failed: ${error}`);
        }
    }

    console.log(`[OK] Optimized batch transliteration completed: ${allResults.length}/${items.length} items successful`);
    return allResults;
}

/**
 * Legacy function for backward compatibility
 */
export async function batchTransliterateTexts(items: TransliterationItem[]): Promise<Map<string, string>> {
    const results = await batchTransliterate(items);

    const resultMap = new Map<string, string>();
    for (const result of results) {
        resultMap.set(result.original, result.transliterated);
    }

    return resultMap;
}

/**
 * Enhanced metadata transliteration with single API call
 */
export async function transliterateContentMetadata(
    categories: string[],
    subCategories: string[],
    tags: string[],
    language: string = 'hi'
): Promise<{
    categories: Map<string, string>;
    subCategories: Map<string, string>;
    tags: Map<string, string>;
}> {
    const items: TransliterationItem[] = [
        ...categories.map(cat => ({ text: cat, type: 'category' as const, language })),
        ...subCategories.map(subCat => ({ text: subCat, type: 'subcategory' as const, language })),
        ...tags.map(tag => ({ text: tag, type: 'tag' as const, language }))
    ];

    if (items.length === 0) {
        return {
            categories: new Map(),
            subCategories: new Map(),
            tags: new Map()
        };
    }

    // Single API call for all metadata
    const results = await batchTransliterate(items);

    const categoryMap = new Map<string, string>();
    const subCategoryMap = new Map<string, string>();
    const tagMap = new Map<string, string>();

    for (const result of results) {
        switch (result.type) {
            case 'category':
                categoryMap.set(result.original, result.transliterated);
                break;
            case 'subcategory':
                subCategoryMap.set(result.original, result.transliterated);
                break;
            case 'tag':
                tagMap.set(result.original, result.transliterated);
                break;
        }
    }

    return {
        categories: categoryMap,
        subCategories: subCategoryMap,
        tags: tagMap
    };
}
