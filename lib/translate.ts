import { genAI } from './gemini';

const LANG_NAMES: Record<string, string> = {
  'zh-Hant': 'Traditional Chinese (繁體中文)',
  'zh-Hans': 'Simplified Chinese (简体中文)',
  en: 'English',
};

/**
 * Translates text to the target language using Gemini, auto-detecting the source.
 * Preserves Markdown formatting during translation.
 */
export async function translateWithGemini(
  text: string,
  targetLanguage: 'en' | 'zh-Hant' | 'zh-Hans'
): Promise<string> {
  const targetName = LANG_NAMES[targetLanguage];

  const prompt = `You are a professional translator. Detect the language of the following text and translate it accurately into ${targetName}.

CRITICAL RULES:
1. Auto-detect the source language, then translate the entire text into ${targetName}.
2. PRESERVE ALL Markdown formatting exactly as-is: **bold**, *italic*, bullet lists (- or *), numbered lists (1. 2. etc.), headings (# ## ###), line breaks, and any other Markdown syntax.
3. NEVER translate proper names, usernames, or personal identifiers — keep them exactly as written.
4. Maintain the same tone, structure, and paragraph breaks as the original.
5. Output ONLY the translated text with no explanations, notes, or commentary before or after.
6. Do NOT wrap the output in code fences or quotes.

TEXT TO TRANSLATE:
${text}`;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const translated = response.text().trim();
    return translated;
  } catch (error) {
    console.error('Translation Error:', error);
    throw new Error(
      `Failed to translate to ${targetName}. Please try again.`
    );
  }
}
