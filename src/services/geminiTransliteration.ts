// src/services/geminiTransliteration.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY || '');

export type TransliterationItem = {
    text: string;
    type: 'title' | 'author';
    language: string;
};

export type TransliterationResult = {
    original: string;
    transliterated: string;
    type: 'title' | 'author';
};

/**
 * Post-process transliteration to fix case issues and missing letters
 */
function cleanTransliterationResult(text: string): string {
    if (!text || typeof text !== 'string') {
        return '';
    }

    // Trim whitespace
    let cleaned = text.trim();

    // Ensure we have content
    if (!cleaned) {
        return '';
    }

    // Fix common transliteration issues
    cleaned = cleaned
        // Fix spacing issues
        .replace(/\s+/g, ' ')
        // Remove non-Latin characters except spaces and hyphens
        .replace(/[^\x00-\x7F\s\-]/g, '')
        // Remove extra punctuation but keep apostrophes for valid contractions
        .replace(/[^\w\s\-']/g, ' ')
        // Fix multiple spaces again after punctuation removal
        .replace(/\s+/g, ' ')
        .trim();

    // Ensure consistent lowercase
    cleaned = cleaned.toLowerCase();

    // Validate that we still have meaningful content
    if (!cleaned || cleaned.length === 0) {
        console.warn('Transliteration resulted in empty string after cleaning');
        return '';
    }

    return cleaned;
}

/**
 * Enhanced prompt for consistent transliteration
 */
function createPrompt(items: TransliterationItem[]): string {
    return `You are an expert in Indian language transliteration. Convert the following texts to accurate English transliteration with proper phonetic pronunciation.

CRITICAL REQUIREMENTS:
1. ALWAYS start transliterated words with the correct first letter - never omit it
2. Use proper phonetic accuracy (e.g., "पूस की रात" = "poos ki raat", NOT "puus kii raat")
3. Use natural word spacing and pronunciation  
4. For author names, use commonly accepted transliterations if known
5. Output should be in proper title case initially (we'll handle lowercase conversion)
6. Each transliteration must be complete - no missing letters or characters
7. Return ONLY valid JSON array with no additional text or formatting

EXAMPLES OF CORRECT OUTPUT:
- "प्रेमचंद" should become "Premchand" (not "premchand" or "remchand")
- "गुल्ली डण्डा" should become "Gulli Danda" (not "gulli damda")
- "पूस की रात" should become "Poos Ki Raat" (not "puus kii raat")

INPUT TEXTS:
${items.map((item, i) => `${i + 1}. ${item.type.toUpperCase()}: "${item.text}" (Language: ${item.language})`).join('\n')}

REQUIRED JSON OUTPUT FORMAT:
[
  {
    "original": "original_text",
    "transliterated": "Proper Title Case Transliteration",
    "type": "title_or_author"
  }
]`;
}

/**
 * Batch transliterate using Gemini API with enhanced error handling
 */
export async function batchTransliterate(items: TransliterationItem[]): Promise<TransliterationResult[]> {
    if (!process.env.GOOGLE_GEMINI_API_KEY) {
        throw new Error('GOOGLE_GEMINI_API_KEY not configured');
    }

    if (items.length === 0) {
        return [];
    }

    console.log(`[INFO] Transliterating ${items.length} items using Gemini API`);

    try {
        const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            generationConfig: {
                temperature: 0.1, // Lower temperature for more consistent results
                topK: 1,
                topP: 0.8,
            }
        });

        const prompt = createPrompt(items);

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Extract JSON from response
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            throw new Error('Invalid response format - no JSON found');
        }

        const rawResults = JSON.parse(jsonMatch[0]) as TransliterationResult[];

        // Validate count
        if (rawResults.length !== items.length) {
            throw new Error(`Expected ${items.length} results, got ${rawResults.length}`);
        }

        // Process and clean each result
        const cleanedResults: TransliterationResult[] = [];

        for (let i = 0;i < items.length;i++) {
            const item = items[i];
            const rawResult = rawResults[i];

            if (!rawResult.transliterated || rawResult.transliterated.trim() === '') {
                throw new Error(`Empty transliteration for: "${item.text}"`);
            }

            // Clean and ensure proper case handling
            const cleanedTransliteration = cleanTransliterationResult(rawResult.transliterated);

            if (!cleanedTransliteration) {
                throw new Error(`Cleaning resulted in empty transliteration for: "${item.text}"`);
            }

            cleanedResults.push({
                original: item.text,
                transliterated: cleanedTransliteration,
                type: item.type
            });
        }

        console.log(`[OK] Successfully transliterated and cleaned ${cleanedResults.length} items`);
        return cleanedResults;

    } catch (error) {
        console.error(`[ERROR] Gemini transliteration failed: ${error}`);
        throw new Error(`Transliteration failed: ${error}`);
    }
}
