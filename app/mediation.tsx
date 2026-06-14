import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/lib/AuthContext';
import { useGroup } from '@/lib/GroupContext';
import { supabase } from '@/lib/supabase';
import { genAI } from '@/lib/gemini';
import { translateWithGemini } from '@/lib/translate';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useLanguage } from '@/lib/LanguageContext';

const LANGUAGE_LABELS: Record<string, string> = {
  'zh-Hant': '繁體中文',
  'zh-Hans': '简体中文',
};

function cleanMarkdown(text: string): string {
  return text
    .replace(/^#{1,4}\s/gm, '')
    .replace(/\*\*/g, '')
    .replace(/^\*\s/gm, '')
    .replace(/\*/g, '');
}

function isHeaderLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  // Markdown heading: ## TITLE, ### TITLE, # TITLE
  if (/^#{1,4}\s/.test(trimmed)) return true;

  // Bold heading on its own line: **TITLE**
  if (/^\*\*.+\*\*$/.test(trimmed) && trimmed.length < 80) return true;

  // Numbered heading without markdown: 1. TITLE (short line, < 80 chars)
  if (/^\d+\.\s+.+/.test(trimmed) && trimmed.length < 80) return true;

  return false;
}

function parseSections(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  console.log('parseSections input (first 500 chars):', normalized.substring(0, 500));

  // Find header line indices
  const headerIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isHeaderLine(lines[i])) {
      headerIndices.push(i);
    }
  }

  // Build sections: each section starts at a header line and ends before the next
  if (headerIndices.length >= 3) {
    const sections: string[] = [];
    for (let s = 0; s < headerIndices.length; s++) {
      const start = headerIndices[s];
      const end = s + 1 < headerIndices.length ? headerIndices[s + 1] : lines.length;
      const sectionText = lines.slice(start, end).join('\n').trim();
      if (sectionText) sections.push(sectionText);
    }
    if (sections.length >= 3) return sections.map(cleanMarkdown);
  }

  console.warn('parseSections: could not split into sections, showing full text');
  return [cleanMarkdown(normalized)];
}

export default function MediationScreen() {
  const { user } = useAuth();
  const { activeGroup } = useGroup();
  const { t, locale } = useLanguage();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [isWatcher, setIsWatcher] = useState(false);
  const [mediationResult, setMediationResult] = useState<string>('');
  const [actionMemo, setActionMemo] = useState<string>('');
  const [eventType, setEventType] = useState<string>('');
  const [currentSection, setCurrentSection] = useState(0);

  // Translation state
  const [translatedResult, setTranslatedResult] = useState<string | null>(null);
  const [translatedActionMemo, setTranslatedActionMemo] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  const watcherChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const subscribedWatcherSidRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeGroup) {
      startMediationProcess();
    }
    return () => {
      if (watcherChannelRef.current) {
        supabase.removeChannel(watcherChannelRef.current);
        watcherChannelRef.current = null;
        subscribedWatcherSidRef.current = null;
      }
    };
  }, [activeGroup]);

  const enterWatcherMode = (sid: string) => {
    // Skip if already subscribed to this session
    if (subscribedWatcherSidRef.current === sid) return;

    setIsWatcher(true);
    setLoading(false);

    const channel = supabase.channel(`mediation_watcher_${sid}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mediation_sessions',
          filter: 'id=eq.' + sid,
        },
        (payload: any) => {
          const newStatus = payload.new.status as string;
          if (newStatus === 'completed' || newStatus === 'resolved') {
            fetchCompletedResult(sid);
          }
        }
      )
      .subscribe();

    watcherChannelRef.current = channel;
    subscribedWatcherSidRef.current = sid;

    pollForCompletion(sid);
  };

  const pollForCompletion = async (sid: string) => {
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const { data } = await supabase
        .from('mediation_sessions')
        .select('status, result_content, action_memos, category')
        .eq('id', sid)
        .single();

      if (data && (data.status === 'completed' || data.status === 'resolved')) {
        if (data.result_content) {
          displayResult(data.result_content, data.action_memos, data.category || '');
        }
        return;
      }
    }
    Alert.alert(
      t('mediation.stillWaiting'),
      t('mediation.stillWaitingBody'),
      [{ text: t('common.ok') }]
    );
  };

  const fetchCompletedResult = async (sid: string) => {
    const { data } = await supabase
      .from('mediation_sessions')
      .select('result_content, action_memos, category')
      .eq('id', sid)
      .single();

    if (data?.result_content) {
      displayResult(data.result_content, data.action_memos, data.category || '');
    }
  };

  const displayResult = (result: string, memos: any, category: string) => {
    if (watcherChannelRef.current) {
      supabase.removeChannel(watcherChannelRef.current);
      watcherChannelRef.current = null;
      subscribedWatcherSidRef.current = null;
    }
    setMediationResult(result);
    const myMemo = memos?.[user?.id || ''] || 'Focus on patience and active listening.';
    setActionMemo(myMemo);
    setEventType(category);
    setIsWatcher(false);
    setLoading(false);

    // Auto-translate for Chinese-locale users
    if (locale === 'zh-Hant' || locale === 'zh-Hans') {
      translateMediationResult(result, myMemo, locale);
    }
  };

  const translateMediationResult = async (resultText: string, memoText: string, targetLang: 'zh-Hant' | 'zh-Hans' | 'en') => {
    setIsTranslating(true);
    try {
      const [translated, translatedMemo] = await Promise.all([
        translateWithGemini(resultText, targetLang),
        translateWithGemini(memoText, targetLang),
      ]);
      setTranslatedResult(translated);
      setTranslatedActionMemo(translatedMemo);
    } catch (error: any) {
      console.error('Auto-translate error:', error);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleToggleTranslation = async () => {
    // If currently showing translation, revert to English original
    if (translatedResult) {
      setTranslatedResult(null);
      setTranslatedActionMemo(null);
      return;
    }

    // Determine target: translate to the user's preferred Chinese variant
    const targetLang: 'zh-Hant' | 'zh-Hans' =
      locale === 'zh-Hant' ? 'zh-Hant' : 'zh-Hans';

    await translateMediationResult(mediationResult, actionMemo, targetLang);
  };

  const ENGLISH_SECTIONS = [
    '1. THE MEDIATOR: Provide an objective judgment from a neutral perspective. Identify where the primary responsibility lies and if an apology is needed.',
    '2. VALIDATION: Acknowledge the sincerity and effort of both parties for sitting down to resolve this.',
    '3. THE COMMON GROUND: Find the balance and shared goals. Explain that their starting points or intentions might be aligned even if styles differed.',
    '4. FACTS VS FEELINGS: Clearly distinguish what happened (facts) vs the internal interpretation (feelings).',
    '5. THE PATH FORWARD: Guide them to propose solutions.',
    '6. VALUE EXCHANGE: Suggest small concessions each side can make.',
    '7. REPAIR & RENEWAL: End with an encouraging, positive tone focusing on repairing the relationship.',
  ];

  const startMediationProcess = async () => {
    setLoading(true);
    let sid: string | null = null;
    try {
      const { data: sessionData } = await supabase
        .from('mediation_sessions')
        .select('id, status')
        .eq('group_id', activeGroup!.id)
        .eq('status', 'ready')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessionData) {
        sid = sessionData.id;

        const { data: claimed } = await supabase
          .from('mediation_sessions')
          .update({ status: 'processing' })
          .eq('id', sid)
          .eq('status', 'ready')
          .select();

        if (!claimed || claimed.length === 0) {
          enterWatcherMode(sid!);
          return;
        }

        const { data: inputs } = await supabase
          .from('session_inputs')
          .select('content, user_id')
          .eq('session_id', sid);

        if (!inputs || inputs.length < 2) {
          Alert.alert(
            t('mediation.waitingForParties'),
            t('mediation.waitingForPartiesBody')
          );
          await supabase
            .from('mediation_sessions')
            .update({ status: 'ready' })
            .eq('id', sid);
          router.back();
          return;
        }

        // Fetch usernames for all participants
        const userIds = [...new Set(inputs.map((i: any) => i.user_id))];
        const { data: participants } = await supabase
          .from('profiles')
          .select('id, username, email')
          .in('id', userIds);

        const nameMap: Record<string, string> = {};
        participants?.forEach((p: any) => {
          nameMap[p.id] = p.username || p.email?.split('@')[0] || 'Anonymous';
        });

        const model = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          systemInstruction: 'You are a mediation result generator. You ONLY output valid JSON. Never output explanations, markdown fences, or any text outside the JSON object. Follow the user prompt exactly.',
        });
        const inputsText = inputs
          .map((input: any) => `${nameMap[input.user_id] || 'Anonymous'}: ${input.content}`)
          .join('\n\n');

        const prompt =
'You are the Master Mediator. I will provide you with summaries of feelings from multiple parties involved in a conflict.\n' +
'Your task is to provide an absolute objective, neutral, and constructive arbitration.\n' +
'CRITICAL: Never translate or modify usernames — keep all names exactly as provided.\n\n' +
'PARTIES SUMMARIES:\n' +
inputsText + '\n\n' +
'PLEASE FOLLOW THIS 7-STEP STRUCTURE:\n' +
ENGLISH_SECTIONS[0] + '\n' +
ENGLISH_SECTIONS[1] + '\n' +
ENGLISH_SECTIONS[2] + '\n' +
ENGLISH_SECTIONS[3] + '\n' +
ENGLISH_SECTIONS[4] + '\n' +
ENGLISH_SECTIONS[5] + '\n' +
ENGLISH_SECTIONS[6] + '\n\n' +
'Also, categorize this conflict into one of these types: Household, Financial, Emotional, Communication, or Other.\n\n' +
'Output JSON ONLY with the following exact schema:\n' +
'{\n' +
'  "result": "the full 7-step mediation text in Markdown format",\n' +
'  "action_memos": {\n' +
`    "${userIds[0] || 'user_1'}": "a brief bulleted action memo for ${nameMap[userIds[0]] || 'this user'}",\n` +
`    "${userIds[1] || 'user_2'}": "a brief bulleted action memo for ${nameMap[userIds[1]] || 'this user'}"\n` +
'  },\n' +
'  "event_type": "one of the types mentioned above"\n' +
'}';

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let jsonText = response.text().replace(/```json|```/g, '').trim();
        // If the response has text outside the JSON object, extract just the JSON
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) jsonText = jsonMatch[0];
        const parsed = JSON.parse(jsonText);

        setMediationResult(parsed.result);

        const myMemo = parsed.action_memos?.[user?.id || ''] || 'Focus on patience and active listening.';
        setActionMemo(myMemo);
        setEventType(parsed.event_type);

        await supabase
          .from('mediation_sessions')
          .update({
            status: 'completed',
            result_content: parsed.result,
            action_memos: parsed.action_memos,
            category: parsed.event_type
          })
          .eq('id', sid);

      } else {
        const { data: activeSession } = await supabase
          .from('mediation_sessions')
          .select('id, status, result_content, action_memos, category')
          .eq('group_id', activeGroup!.id)
          .in('status', ['processing', 'completed'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeSession) {
          if (activeSession.status === 'processing') {
            enterWatcherMode(activeSession.id!);
            return;
          } else if (activeSession.status === 'completed' && activeSession.result_content) {
            displayResult(
              activeSession.result_content,
              activeSession.action_memos,
              activeSession.category || ''
            );
            return;
          }
        }

        Alert.alert(
          t('mediation.noActiveSession'),
          t('mediation.noActiveSessionBody')
        );
        router.back();
        return;
      }

    } catch (error) {
      console.error('Mediation Error:', error);
      if (sid) {
        try {
          await supabase
            .from('mediation_sessions')
            .update({ status: 'ready' })
            .eq('id', sid);
        } catch (_) {}
      }
      Alert.alert(t('common.error'), t('mediation.errorOverwhelmed'));
    } finally {
      setLoading(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.sage} />
        <Text style={styles.loadingText}>{t('mediation.loadingText')}</Text>
      </View>
    );
  }

  // Watcher state - mediation is being generated by the other user
  if (isWatcher) {
    return (
      <View style={styles.waitingContainer}>
        <View style={styles.waitingCard}>
          <ActivityIndicator size="large" color={Colors.indigo} />
          <Text style={styles.waitingTitle}>{t('mediation.waitingTitle')}</Text>
          <Text style={styles.waitingBody}>
            {t('mediation.waitingBody')}
          </Text>
          <Text style={styles.waitingHint}>
            {t('mediation.waitingHint')}
          </Text>
        </View>
      </View>
    );
  }

  const isShowingTranslation = translatedResult !== null;
  const translateTarget: 'zh-Hant' | 'zh-Hans' =
    locale === 'zh-Hant' ? 'zh-Hant' : 'zh-Hans';
  const translateTargetLabel = LANGUAGE_LABELS[translateTarget] || '简体中文';

  const activeText = isShowingTranslation ? (translatedResult ?? mediationResult) : mediationResult;
  const sections = parseSections(activeText);
  const isLastSection = currentSection >= sections.length - 1;
  const isFirstSection = currentSection === 0;

  const extractSectionTitle = (section: string): string => {
    const match = section.match(/^(?:#{1,3}\s)?(?:\d+)\.\s*(.+)/m);
    return match ? match[1].trim() : '';
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 64, paddingBottom: 100 }}>
        <View style={styles.header}>
          <IconSymbol name="leaf.fill" size={32} color={Colors.sage} />
          <Text style={styles.headerTitle}>{t('mediation.resultTitle')}</Text>
          <Text style={styles.categoryBadge}>{eventType}</Text>
        </View>

        {/* Translate Button */}
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          {isTranslating ? (
            <View style={styles.translateLoadingContainer}>
              <ActivityIndicator size="small" color={Colors.indigo} />
              <Text style={styles.translateLoadingText}>{t('mediation.translating')}</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.translateButton}
              onPress={handleToggleTranslation}
              activeOpacity={0.7}
            >
              <IconSymbol
                name={isShowingTranslation ? 'doc.text' : 'globe'}
                size={16}
                color={Colors.sage}
                style={{ marginRight: 8 }}
              />
              <Text style={styles.translateButtonText}>
                {isShowingTranslation ? t('mediation.showOriginal') : t('mediation.translateTo', { language: translateTargetLabel })}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Section indicator */}
        <View style={styles.sectionIndicator}>
          <Text style={styles.sectionStepText}>
            {t('mediation.stepOf', { current: String(currentSection + 1), total: String(sections.length) })}
          </Text>
          <Text style={styles.sectionTitle}>
            {extractSectionTitle(sections[currentSection])}
          </Text>
        </View>

        {/* Progress dots */}
        <View style={styles.progressDots}>
          {sections.map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressDot,
                i === currentSection ? styles.progressDotActive : null,
              ]}
            />
          ))}
        </View>

        <View style={styles.resultCard}>
          <Text style={styles.resultText}>
            {sections[currentSection]}
          </Text>
        </View>

        {/* Navigation buttons */}
        <View style={styles.navRow}>
          {!isFirstSection && (
            <TouchableOpacity
              style={styles.prevButton}
              onPress={() => setCurrentSection(c => c - 1)}
              activeOpacity={0.7}
            >
              <IconSymbol name="chevron.left" size={18} color={Colors.sage} style={{ marginRight: 4 }} />
              <Text style={styles.prevButtonText}>{t('mediation.previous')}</Text>
            </TouchableOpacity>
          )}

          {isLastSection ? (
            <TouchableOpacity
              style={styles.endMediationButton}
              onPress={() => router.back()}
              activeOpacity={0.7}
            >
              <Text style={styles.doneButtonText}>{t('mediation.endMediation')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.continueButton}
              onPress={() => setCurrentSection(c => c + 1)}
              activeOpacity={0.7}
            >
              <Text style={styles.doneButtonText}>{t('mediation.continue')}</Text>
              <IconSymbol name="chevron.right" size={18} color={Colors.surface} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          )}
        </View>

        {/* Action memo – only on last section */}
        {isLastSection && (
          <View style={styles.memoCard}>
            <Text style={styles.memoTitle}>{t('mediation.actionMemo')}</Text>
            <Text style={styles.memoText}>
              {isShowingTranslation && translatedActionMemo ? translatedActionMemo : actionMemo}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}


const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 18,
    color: Colors.textMuted,
    textAlign: 'center',
    fontWeight: '300',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '500',
    color: Colors.text,
    marginTop: 12,
  },
  categoryBadge: {
    marginTop: 8,
    backgroundColor: Colors.sage,
    color: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    overflow: 'hidden',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  resultCard: {
    backgroundColor: Colors.surface,
    padding: 24,
    borderRadius: 32,
    marginBottom: 24,
    shadowColor: Colors.sage,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 4,
  },
  resultText: {
    fontSize: 16,
    lineHeight: 26,
    color: Colors.text,
    fontWeight: '300',
  },
  memoCard: {
    backgroundColor: '#F0F4F8',
    padding: 24,
    borderRadius: 24,
    marginTop: 24,
    marginBottom: 32,
    borderLeftWidth: 4,
    borderLeftColor: Colors.sage,
  },
  memoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  memoText: {
    fontSize: 15,
    lineHeight: 24,
    color: Colors.text,
    fontWeight: '400',
  },
  doneButton: {
    backgroundColor: Colors.sage,
    paddingVertical: 18,
    borderRadius: 24,
    alignItems: 'center',
    shadowColor: Colors.sage,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 5,
  },
  doneButtonText: {
    color: Colors.surface,
    fontSize: 18,
    fontWeight: '600',
  },
  waitingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  waitingCard: {
    backgroundColor: Colors.surface,
    borderRadius: 32,
    padding: 36,
    alignItems: 'center',
    shadowColor: Colors.sage,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 5,
    width: '100%',
  },
  waitingTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 12,
  },
  waitingBody: {
    fontSize: 16,
    fontWeight: '300',
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 12,
  },
  waitingHint: {
    fontSize: 14,
    fontWeight: '300',
    color: Colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  translateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.sage,
  },
  translateButtonText: {
    fontSize: 14,
    color: Colors.sage,
    fontWeight: '500',
  },
  translateLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  translateLoadingText: {
    fontSize: 14,
    color: Colors.indigo,
    fontWeight: '400',
    marginLeft: 8,
  },
  sectionIndicator: {
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionStepText: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '500',
    letterSpacing: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 4,
    textAlign: 'center',
  },
  progressDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E0D8C8',
  },
  progressDotActive: {
    backgroundColor: Colors.sage,
    width: 24,
    borderRadius: 4,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 24,
  },
  prevButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.sage,
    flex: 1,
  },
  prevButtonText: {
    fontSize: 16,
    color: Colors.sage,
    fontWeight: '500',
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 24,
    backgroundColor: Colors.sage,
    flex: 1,
  },
  endMediationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 24,
    backgroundColor: Colors.sage,
    shadowColor: Colors.sage,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 5,
    flex: 1,
  },
});
