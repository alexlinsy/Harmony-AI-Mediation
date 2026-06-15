import { supabase } from '@/lib/supabase';
import { genAI } from '@/lib/gemini';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TriggerTopic {
  topic: string;
  percentage: number;
}

export interface DayCount {
  day: number;
  count: number;
}

export interface HarmonyMonth {
  month: string;
  total: number;
  resolved: number;
  rate: number;
  peacePoints: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch UUIDs of all groups the user belongs to.
 */
async function getUserGroupIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId);

  if (error) {
    console.error('insights: failed to fetch group ids', error);
    return [];
  }

  return (data ?? []).map((row) => row.group_id);
}

/**
 * Extract all string values from a JSONB action_memos object.
 */
function extractMemoStrings(memos: Record<string, unknown>): string[] {
  const results: string[] = [];
  for (const val of Object.values(memos)) {
    if (typeof val === 'string' && val.trim().length > 0) {
      results.push(val.trim());
    }
  }
  return results;
}

/**
 * Fallback: build TriggerTopic[] from category distribution and action_memo
 * keywords when the AI call fails.
 */
function fallbackTriggers(
  categories: string[],
  memoTexts: string[],
): TriggerTopic[] {
  // Count category occurrences
  const catCounts = new Map<string, number>();
  for (const c of categories) {
    catCounts.set(c, (catCounts.get(c) ?? 0) + 1);
  }
  // Build keyword-to-category mapping from memo texts
  const keywords = memoTexts
    .join(' ')
    .split(/[\s,;\n]+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 2);

  const keywordFreq = new Map<string, number>();
  for (const kw of keywords) {
    keywordFreq.set(kw, (keywordFreq.get(kw) ?? 0) + 1);
  }

  // Merge: create topic labels from the most common categories, with the top
  // keyword appended when available
  const sortedCats = [...catCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  );
  const sortedKeywords = [...keywordFreq.entries()].sort(
    (a, b) => b[1] - a[1],
  );

  const topKeyword = sortedKeywords.length > 0 ? sortedKeywords[0][0] : null;

  // Build 3-5 topics from categories enriched with the top keyword
  const topics: { label: string; count: number }[] = [];
  for (const [cat, count] of sortedCats.slice(0, 5)) {
    const label =
      topKeyword && !cat.toLowerCase().includes(topKeyword)
        ? `${cat} ${topKeyword.charAt(0).toUpperCase() + topKeyword.slice(1)}`
        : cat;
    // Merge duplicates with same label
    const existing = topics.find((t) => t.label === label);
    if (existing) {
      existing.count += count;
    } else {
      topics.push({ label, count });
    }
  }

  const total = topics.reduce((s, t) => s + t.count, 0) || 1;
  return topics
    .map((t) => ({ topic: t.label, percentage: Math.round((t.count / total) * 100) }))
    .sort((a, b) => b.percentage - a.percentage);
}

// ---------------------------------------------------------------------------
// JSON extraction helper — Gemini often wraps JSON in markdown code blocks
// ---------------------------------------------------------------------------

/**
 * Extract a JSON array from a Gemini response that may be wrapped in
 * markdown code fences (```json ... ```) or contain surrounding text.
 */
function extractJsonFromText(text: string): unknown {
  // 1. Try direct parse first (clean JSON response)
  try {
    return JSON.parse(text);
  } catch {
    // fall through to extraction
  }

  // 2. Extract from ```json ... ``` or ``` ... ``` code blocks
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // fall through
    }
  }

  // 3. Find the first '[' and last ']' to extract an array
  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
    try {
      return JSON.parse(text.slice(arrStart, arrEnd + 1));
    } catch {
      // fall through
    }
  }

  // 4. Give up — throw so the caller uses the fallback
  throw new Error('Could not extract valid JSON from Gemini response');
}

// ---------------------------------------------------------------------------
// Function A: Trigger Analysis (via Gemini)
// ---------------------------------------------------------------------------

const TRIGGER_ANALYSIS_PROMPT = `You analyze conflict mediation data to identify specific trigger topics. Extract 3-5 specific trigger topics (e.g., 'household chores', 'weekend scheduling', 'children education', 'financial spending', 'communication style') with percentage estimates summing to 100. Return ONLY a raw JSON array — no markdown, no code fences, no surrounding text: [{"topic": string, "percentage": number}]`;

export async function fetchTriggerAnalysis(
  userId: string,
): Promise<TriggerTopic[]> {
  try {
    const groupIds = await getUserGroupIds(userId);
    if (groupIds.length === 0) return [];

    // Fetch completed/resolved sessions
    const { data: sessions, error: sessError } = await supabase
      .from('mediation_sessions')
      .select('id, action_memos, category')
      .in('group_id', groupIds)
      .in('status', ['completed', 'resolved']);

    if (sessError) {
      console.error('insights: fetch sessions error', sessError);
      return [];
    }
    if (!sessions || sessions.length === 0) return [];

    const sessionIds = sessions.map((s) => s.id);

    // Fetch session inputs
    const { data: inputs, error: inpError } = await supabase
      .from('session_inputs')
      .select('content')
      .in('session_id', sessionIds);

    if (inpError) {
      console.error('insights: fetch inputs error', inpError);
      return [];
    }

    // Build prompt payload
    const inputTexts = (inputs ?? []).map((i) => i.content).filter(Boolean);
    const memoTexts: string[] = [];
    const categories: string[] = [];

    for (const s of sessions) {
      if (s.category) categories.push(s.category);
      if (s.action_memos && typeof s.action_memos === 'object') {
        memoTexts.push(
          ...extractMemoStrings(s.action_memos as Record<string, unknown>),
        );
      }
    }

    // Call Gemini
    const combined = [
      ...inputTexts.slice(0, 20), // avoid excessive tokens
      ...memoTexts.slice(0, 20),
    ].join('\n');

    if (!combined.trim()) {
      // No text data — fall back to categories only
      return fallbackTriggers(categories, []);
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
    });

    const result = await model.generateContent(
      `${TRIGGER_ANALYSIS_PROMPT}\n\nData:\n${combined}`,
    );
    const text = result.response.text();

    // Parse JSON response — Gemini may wrap JSON in markdown code blocks
    const parsed: unknown = extractJsonFromText(text);

    if (
      !Array.isArray(parsed) ||
      !parsed.every(
        (item: unknown) =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as Record<string, unknown>).topic === 'string' &&
          typeof (item as Record<string, unknown>).percentage === 'number',
      )
    ) {
      throw new Error('Unexpected response shape from Gemini');
    }

    const topics = parsed as TriggerTopic[];
    return topics.sort((a, b) => b.percentage - a.percentage);
  } catch (err) {
    console.error('insights: fetchTriggerAnalysis error, using fallback', err);

    // Attempt fallback: re-fetch needed data inside fallback
    try {
      const groupIds = await getUserGroupIds(userId);
      if (groupIds.length === 0) return [];

      const { data: sessions } = await supabase
        .from('mediation_sessions')
        .select('category, action_memos')
        .in('group_id', groupIds)
        .in('status', ['completed', 'resolved']);

      if (!sessions || sessions.length === 0) return [];

      const memoTexts: string[] = [];
      const categories: string[] = [];
      for (const s of sessions) {
        if (s.category) categories.push(s.category);
        if (s.action_memos && typeof s.action_memos === 'object') {
          memoTexts.push(
            ...extractMemoStrings(s.action_memos as Record<string, unknown>),
          );
        }
      }
      return fallbackTriggers(categories, memoTexts);
    } catch (fallbackErr) {
      console.error(
        'insights: fallback for fetchTriggerAnalysis also failed',
        fallbackErr,
      );
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Function B: Conflict Patterns (day-of-week distribution)
// ---------------------------------------------------------------------------

export async function fetchConflictPatterns(
  userId: string,
): Promise<DayCount[]> {
  try {
    const groupIds = await getUserGroupIds(userId);
    if (groupIds.length === 0) return buildEmptyDayCounts();

    const { data: sessions, error } = await supabase
      .from('mediation_sessions')
      .select('created_at')
      .in('group_id', groupIds)
      .in('status', ['completed', 'resolved']);

    if (error) {
      console.error('insights: fetch sessions for patterns error', error);
      return buildEmptyDayCounts();
    }

    if (!sessions || sessions.length === 0) return buildEmptyDayCounts();

    // Group by day-of-week in TypeScript
    const dayCounts = new Array<number>(7).fill(0);
    for (const s of sessions) {
      const d = new Date(s.created_at);
      const dow = d.getUTCDay(); // 0=Sun .. 6=Sat
      dayCounts[dow] += 1;
    }

    return dayCounts.map((count, day) => ({ day, count }));
  } catch (err) {
    console.error('insights: fetchConflictPatterns error', err);
    return buildEmptyDayCounts();
  }
}

function buildEmptyDayCounts(): DayCount[] {
  return Array.from({ length: 7 }, (_, day) => ({ day, count: 0 }));
}

// ---------------------------------------------------------------------------
// Function C: Harmony Index (monthly trend over last 6 months)
// ---------------------------------------------------------------------------

export async function fetchHarmonyIndex(
  userId: string,
): Promise<HarmonyMonth[]> {
  try {
    const groupIds = await getUserGroupIds(userId);
    if (groupIds.length === 0) return buildEmptyMonths();

    const { data: sessions, error } = await supabase
      .from('mediation_sessions')
      .select('created_at, status')
      .in('group_id', groupIds)
      .in('status', ['completed', 'resolved']);

    if (error) {
      console.error('insights: fetch sessions for harmony index error', error);
      return buildEmptyMonths();
    }

    // Build a map of YYYY-MM => { total, resolved }
    const monthMap = new Map<
      string,
      { total: number; resolved: number }
    >();

    for (const s of sessions ?? []) {
      const key = s.created_at.slice(0, 7); // "2026-01"
      const entry = monthMap.get(key) ?? { total: 0, resolved: 0 };
      entry.total += 1;
      if (s.status === 'resolved') {
        entry.resolved += 1;
      }
      monthMap.set(key, entry);
    }

    // Build last 6 months (including current partial month)
    const now = new Date();
    const months: HarmonyMonth[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const data = monthMap.get(key) ?? { total: 0, resolved: 0 };
      months.push({
        month: key,
        total: data.total,
        resolved: data.resolved,
        rate: data.total > 0 ? data.resolved / data.total : 0,
        peacePoints: data.resolved * 10,
      });
    }

    return months;
  } catch (err) {
    console.error('insights: fetchHarmonyIndex error', err);
    return buildEmptyMonths();
  }
}

function buildEmptyMonths(): HarmonyMonth[] {
  const now = new Date();
  const months: HarmonyMonth[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({
      month: key,
      total: 0,
      resolved: 0,
      rate: 0,
      peacePoints: 0,
    });
  }
  return months;
}
