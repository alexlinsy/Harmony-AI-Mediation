import { IconSymbol } from '@/components/ui/icon-symbol';
import VoiceChatUI from '@/components/VoiceChatUI';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/lib/AuthContext';
import { getTherapistModel } from '@/lib/gemini';
import { useGroup } from '@/lib/GroupContext';
import { supabase } from '@/lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLanguage } from '@/lib/LanguageContext';

type Message = {
  id: string;
  role: 'user' | 'model';
  text: string;
};

export default function ChatMediatorScreen() {
  const { user } = useAuth();
  const { activeGroup } = useGroup();
  const { t, locale } = useLanguage();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [chatSession, setChatSession] = useState<any>(null);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string>('waiting');
  const [sessionConfirmations, setSessionConfirmations] = useState<string[]>([]);
  const [hasSubmittedSummary, setHasSubmittedSummary] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [groupMemberCount, setGroupMemberCount] = useState(0);
  const [sessionInputs, setSessionInputs] = useState<any[]>([]);
  const nudgeDetectedRef = useRef(false);

  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isCooldownVisible, setIsCooldownVisible] = useState(false);
  const cooldownCountdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const subscribedGroupRef = useRef<string | null>(null);

  // Initialize Chat & Session
  useEffect(() => {
    if (!activeGroup) return;
    const groupId = activeGroup.id;

    // Skip if already subscribed to this group
    if (subscribedGroupRef.current === groupId) return;

    initializeSession();

    const channel = supabase.channel(`session_updates_${groupId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_inputs' },
        async () => {
          try {
            const sid = activeSessionIdRef.current;
            await fetchSessionInputs(sid);
            const { data: session } = await supabase
              .from('mediation_sessions')
              .select('status')
              .eq('id', sid)
              .single();
            if (session?.status === 'ready') {
              setSessionStatus('ready');
            }
          } catch (err) {
            console.error('Realtime session_inputs handler error:', err);
          }
        }
      )
      .on(
              'postgres_changes',
              { event: 'UPDATE', schema: 'public', table: 'mediation_sessions' },
              (payload) => {
                if (payload.new.group_id === activeGroup.id) {
                  const newStatus = payload.new.status as string;
                  const newNudgedBy = payload.new.nudged_by as string | null;

                  setSessionStatus(newStatus);
                  setSessionConfirmations(payload.new.confirmations ?? []);

                  if (newNudgedBy && newNudgedBy !== user?.id) {
                    nudgeDetectedRef.current = true;
                  }

                  if (newStatus === 'resolved') {
                    initializeSession();
                  }
                }
              }
            )
            .subscribe();

    channelRef.current = channel;
    subscribedGroupRef.current = groupId;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      subscribedGroupRef.current = null;
    };
  }, [activeGroup]);

  useEffect(() => {
  }, []);

  useEffect(() => {
    if (sessionStatus === 'ready') {
      router.push('/mediation');
    }
  }, [sessionStatus, router]);

  async function initializeSession() {
    try {
    setMessages([]);
    setHasSubmittedSummary(false);
    setIsGeneratingSummary(false);
    setSessionInputs([]);
    setChatSession(null);
    nudgeDetectedRef.current = false;

    const { count } = await supabase
      .from('group_members')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', activeGroup!.id);
    setGroupMemberCount(count || 0);

    let { data: sessionData, error: sessionError } = await supabase
      .from('mediation_sessions')
      .select('id, status, confirmations')
      .eq('group_id', activeGroup!.id)
      .neq('status', 'resolved')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionError?.code === '42703') {
      console.warn('confirmations column missing in DB, retrying select without it');
      const retry = await supabase
        .from('mediation_sessions')
        .select('id, status')
        .eq('group_id', activeGroup!.id)
        .neq('status', 'resolved')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      sessionData = retry.data as any;
      sessionError = retry.error;
    } else if (sessionError) {
      console.error('Session fetch error:', sessionError);
    }

    if (!sessionData) {
      const { data: newSession, error: insertError } = await supabase
        .from('mediation_sessions')
        .insert({ group_id: activeGroup!.id })
        .select('id, status')
        .single();

      if (insertError) {
        console.warn('Insert failed (likely race), retrying select:', insertError.message);
        const retry = await supabase
          .from('mediation_sessions')
          .select('id, status, confirmations')
          .eq('group_id', activeGroup!.id)
          .neq('status', 'resolved')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        sessionData = retry.data as any;
      } else {
        sessionData = newSession as any;
      }
    }
    setActiveSessionId(sessionData?.id || null);
      activeSessionIdRef.current = sessionData?.id || null;
    setSessionStatus(sessionData?.status || 'waiting');
    setSessionConfirmations((sessionData as any)?.confirmations ?? []);

    const model = getTherapistModel(locale);

    const greetings: Record<string, { user: string; model: string }> = {
      'zh-Hant': {
        user: '你好，我需要一些情緒支持。',
        model: '歡迎來到這個安全的空間。深呼吸一下。我會不帶批判地傾聽。最近有什麼困擾你的事情嗎？',
      },
      'zh-Hans': {
        user: '你好，我需要一些情绪支持。',
        model: '欢迎来到这个安全的空间。深呼吸一下。我会不带批判地倾听。最近有什么困扰你的事情吗？',
      },
    };
    const greeting = greetings[locale] || {
      user: "Hello, I need some emotional support.",
      model: "Welcome to this safe space. Take a deep breath. I'm here to listen without judgment. What's been troubling you recently?",
    };

    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: greeting.user }] },
        { role: 'model', parts: [{ text: greeting.model }] }
      ]
    });
    setChatSession(chat);
    setMessages([{ id: 'init', role: 'model', text: greeting.model }]);

    fetchSessionInputs(sessionData?.id);
    } catch (error) {
      console.error('Session initialization failed:', error);
      Alert.alert(
        t('chat.sessionUnavailable'),
        t('chat.sessionRetry')
      );
    }
  }

  async function fetchSessionInputs(sessionId: string | null = activeSessionId) {
    if (!sessionId) return;
    const { data: inputs } = await supabase
      .from('session_inputs')
      .select('*')
      .eq('session_id', sessionId);

    setSessionInputs(inputs || []);
    const userHasSubmitted = inputs?.some(input => input.user_id === user?.id);
    if (userHasSubmitted) {
      setHasSubmittedSummary(true);
    }
  }

  const isChinese = (text: string): boolean => {
    const chineseChars = text.match(/[一-鿿]/g) || [];
    return chineseChars.length > text.length * 0.2;
  };

  const speakText = (text: string) => {
    Speech.stop();
    if (isChinese(text)) {
      Speech.speak(text, { language: 'zh-CN', pitch: 1.0, rate: 0.9, volume: 1.0 });
    } else {
      Speech.speak(text, { language: 'en-GB', pitch: 1.0, rate: 0.85, volume: 1.0 });
    }
  };

  const analyzeAndTriggerCooldown = async (userText: string): Promise<boolean> => {
    try {
      const model = getTherapistModel(locale);
      const tempChat = model.startChat();
      const prompt = `You are an emotional safety monitor. Analyze the following message for signs of extreme emotional distress, rage, panic, or crisis.
Respond ONLY with a raw JSON object, no markdown:
{"triggered": true/false, "reason": "brief reason"}

Set triggered=true ONLY if the message shows: extreme rage/aggression, crisis/self-harm risk, complete emotional breakdown, or highly abusive language.

Message: "${userText}"`;
      const result = await tempChat.sendMessage(prompt);
      const raw = result.response.text().replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(raw);
      if (parsed.triggered === true) {
        console.log('Cooldown triggered:', parsed.reason);
        return true;
      }
    } catch (e) {
      console.log('Emotion analysis failed silently:', e);
    }
    return false;
  };

  const triggerCooldown = (lang: 'zh' | 'en' = 'en') => {
    setIsCooldownVisible(true);
    Speech.stop();
    if (lang === 'zh') {
      Speech.speak(
        '我能感受到你现在非常崩溃。没关系，让我们暂停一下。在继续之前，请先和我一起做几次深呼吸。',
        { language: 'zh-CN', pitch: 1.0, rate: 0.8, volume: 1.0 }
      );
    } else {
      Speech.speak(
        "I can feel how overwhelmed you are right now. Let's pause for a moment. Please take some deep breaths with me before we continue.",
        { language: 'en-GB', pitch: 1.0, rate: 0.8, volume: 1.0 }
      );
    }
  };

  const handleCooldownComplete = () => {
    setIsCooldownVisible(false);
    router.push('/breathe');
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !chatSession) return;

    const userText = inputText.trim();
    const newMessage: Message = { id: Date.now().toString(), role: 'user', text: userText };

    setMessages(prev => [...prev, newMessage]);
    setInputText('');
    setIsTyping(true);
    Keyboard.dismiss();

    try {
      const shouldCooldown = await analyzeAndTriggerCooldown(userText);
      if (shouldCooldown) {
        triggerCooldown(isChinese(userText) ? 'zh' : 'en');
        setIsTyping(false);
        return;
      }

      const result = await chatSession.sendMessage(userText);
      const responseText = result.response.text();

      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: responseText }]);

      speakText(responseText);
    } catch (error) {
      console.error("Chat Error:", error);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: t('chat.errorGeneric') }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleProcessAudio = async (uri: string) => {
    setIsVoiceMode(false);
    setIsTyping(true);

    try {
      const base64Audio = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      console.log("Audio data length:", base64Audio.length);

      const prompt = `You are a transcriber and therapist.
1. LISTEN carefully to the provided audio.
2. TRANSCRIBE exactly what the user said in the audio into the "transcript" field. Preserve the original language (Chinese or English).
3. Detect the language of the transcript. If Chinese, respond in Chinese. If English, respond in English.
4. RESPOND with a warm, empathetic therapist reply in the same language as the transcript, in the "response" field.
Output JSON ONLY: { "transcript": "...", "response": "..." }`;

      const result = await chatSession.sendMessage([
        { text: prompt },
        { inlineData: { data: base64Audio, mimeType: Platform.OS === 'ios' ? 'audio/mp4' : 'audio/mp4' } }
      ]);

      const jsonText = result.response.text();
      const cleanJson = jsonText.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      const shouldCooldown = await analyzeAndTriggerCooldown(parsed.transcript);
      if (shouldCooldown) {
        triggerCooldown(isChinese(parsed.transcript) ? 'zh' : 'en');
        setIsTyping(false);
        return;
      }

      setMessages(prev => [...prev, { id: Date.now().toString() + '_u', role: 'user', text: parsed.transcript }]);
      setMessages(prev => [...prev, { id: Date.now().toString() + '_a', role: 'model', text: parsed.response }]);

      speakText(parsed.response);

    } catch (error) {
      console.error("Audio processing error:", error);
      Alert.alert(t('common.error'), t('chat.audioError'));
    } finally {
      setIsTyping(false);
    }
  };

  const handleSubmitMediation = async () => {
    if (!activeSessionId) {
      Alert.alert(t('chat.sessionUnavailable'), t('chat.sessionBusy'));
      return;
    }
    if (!chatSession) {
      Alert.alert(t('chat.sessionUnavailable'), t('chat.aiInitializing'));
      return;
    }
    if (messages.length <= 1) {
      Alert.alert(t('chat.notReady'), t('chat.needMoreFeelings'));
      return;
    }
    setIsGeneratingSummary(true);

    try {
      const summaryPrompt = "Please summarize the user's core grievance, the facts, and their underlying feelings from our conversation into a clear, single paragraph using Non-Violent Communication principles. Do not address the user directly, just output the summary.";
      const result = await chatSession.sendMessage(summaryPrompt);
      const summaryText = result.response.text();

      const { error: insertError } = await supabase.from('session_inputs').insert({
        session_id: activeSessionId,
        user_id: user?.id,
        content: summaryText,
        input_type: 'text'
      });

      if (insertError) {
        console.error("Insert error:", insertError);
        Alert.alert(t('common.error'), t('chat.summaryError'));
        return;
      }

      setHasSubmittedSummary(true);

      const { data: inputs } = await supabase
        .from('session_inputs')
        .select('*')
        .eq('session_id', activeSessionId);

      setSessionInputs(inputs || []);

      if ((inputs?.length || 0) >= groupMemberCount && groupMemberCount > 1) {
        await supabase
          .from('mediation_sessions')
          .update({ status: 'ready' })
          .eq('id', activeSessionId);
        setSessionStatus('ready');
      }
    } catch (error) {
      console.error("Error generating summary:", error);
      Alert.alert(t('common.error'), t('chat.summaryGenericError'));
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const navigateToBreathe = () => {
    router.push('/breathe');
  };

  const navigateToVoice = () => {
    setIsVoiceMode(true);
  };

  const isReadyForMediation = sessionInputs.length >= groupMemberCount && groupMemberCount > 1;

  const handleStartMediationClick = async () => {
    if (isReadyForMediation) {
      router.push('/mediation');
    } else if (activeSessionIdRef.current) {
      const { error } = await supabase
        .from('mediation_sessions')
        .update({ nudged_by: user?.id })
        .eq('id', activeSessionIdRef.current);

      if (error) {
        console.error('Failed to send nudge:', error);
      }

      Alert.alert(
        t('chat.nudgeSent'),
        t('chat.nudgeSentMsg')
      );
    }
  };

  const handleConfirmResolution = async () => {
    if (!activeSessionId || !user) return;
    try {
      const newConfirmations = [...new Set([...sessionConfirmations, user.id])];

      const isNowResolved = newConfirmations.length >= groupMemberCount;
      const newStatus = isNowResolved ? 'resolved' : 'completed';

      const { error: updateError } = await supabase
        .from('mediation_sessions')
        .update({
           confirmations: newConfirmations,
           status: newStatus
        })
        .eq('id', activeSessionId);

      if (updateError) {
        if (updateError.code === '42703') {
          console.warn('confirmations column missing, retrying update without it');
          await supabase
            .from('mediation_sessions')
            .update({ status: newStatus })
            .eq('id', activeSessionId);
        } else {
          console.error('Confirm resolution error:', updateError);
          return;
        }
      }

      if (isNowResolved) {
         Alert.alert(t('chat.harmonyRestored'), t('chat.peacePoints'));
      }
    } catch (error) {
      console.error('Confirm resolution failed:', error);
    }
  };

  if (!activeGroup) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <Text style={{ color: Colors.text, fontSize: 24, fontWeight: '300', marginBottom: 16 }}>{t('chat.noGroupTitle')}</Text>
        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: Colors.sage }]} onPress={() => router.replace('/')}>
          <Text style={{ color: Colors.surface, fontWeight: '500' }}>{t('chat.noGroupAction')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.aiBubble]}>
        <Text style={[styles.messageText, { color: isUser ? Colors.surface : Colors.text }]}>
          {item.text}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: Colors.background }}>

      {/* Emotional Cooldown Modal */}
      <Modal visible={isCooldownVisible} transparent animationType="fade">
        <View style={styles.cooldownOverlay}>
          <View style={styles.cooldownCard}>
            <Text style={styles.cooldownEmoji}>🌊</Text>
            <Text style={styles.cooldownTitle}>{t('chat.cooldownTitle')}</Text>
            <Text style={styles.cooldownBody}>
              {t('chat.cooldownBody')}
            </Text>
            <TouchableOpacity style={styles.cooldownButton} onPress={handleCooldownComplete}>
              <Text style={styles.cooldownButtonText}>{t('chat.cooldownButton')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setIsCooldownVisible(false)} style={{ marginTop: 16 }}>
              <Text style={{ color: Colors.textMuted, fontSize: 14 }}>{t('chat.cooldownContinue')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Voice Chat Modal Overlay */}
      <VoiceChatUI
        visible={isVoiceMode}
        onClose={() => setIsVoiceMode(false)}
        onProcessAudio={handleProcessAudio}
      />

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{activeGroup.name}</Text>
          <Text style={styles.headerSubtitle}>{t('chat.sessionSubtitle')}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TouchableOpacity style={[styles.breatheButton, { width: 110 }]} onPress={navigateToBreathe}>
            <IconSymbol name="wind" size={16} color={Colors.surface} />
            <Text style={styles.breatheText}>{t('chat.breathe')}</Text>
          </TouchableOpacity>
          {hasSubmittedSummary && (
            <TouchableOpacity style={[styles.breatheButton, { width: 110 }]} onPress={handleStartMediationClick}>
              <IconSymbol name="play.fill" size={16} color={Colors.surface} />
              <Text style={[styles.breatheText, { fontSize: 13, marginLeft: 6 }]}>{t('chat.mediation')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Chat Area */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.chatContainer}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {isTyping && (
        <View style={styles.typingIndicator}>
          <ActivityIndicator size="small" color={Colors.sage} />
          <Text style={styles.typingText}>{t('chat.typing')}</Text>
        </View>
      )}

      {/* Conditional Bottom Area */}
      {!hasSubmittedSummary ? (
        <View style={styles.bottomAreaContainer}>
          {messages.length > 1 && (
            <TouchableOpacity
              style={styles.submitMediationButton}
              onPress={handleSubmitMediation}
              disabled={isGeneratingSummary}
            >
              {isGeneratingSummary ? (
                <ActivityIndicator size="small" color={Colors.sage} />
              ) : (
                <Text style={styles.submitMediationText}>{t('chat.submitReady')}</Text>
              )}
            </TouchableOpacity>
          )}

          <View style={styles.inputWrapper}>
            <TouchableOpacity style={styles.voiceButton} onPress={navigateToVoice}>
              <IconSymbol name="mic.fill" size={24} color={Colors.sage} />
            </TouchableOpacity>

            <TextInput
              style={styles.textInput}
              placeholder={t('chat.placeholder')}
              placeholderTextColor={Colors.textMuted}
              value={inputText}
              onChangeText={setInputText}
              multiline
            />

            <TouchableOpacity
              style={[styles.sendButton, { backgroundColor: inputText.trim() ? Colors.sage : Colors.sand }]}
              onPress={sendMessage}
              disabled={!inputText.trim()}
            >
              <IconSymbol name="arrow.up" size={20} color={Colors.surface} />
            </TouchableOpacity>
          </View>
        </View>
      ) : sessionStatus === 'completed' ? (
        <View style={{ padding: 24, paddingBottom: Platform.OS === 'ios' ? 110 : 80, alignItems: 'center' }}>
          {sessionConfirmations.includes(user?.id || '') ? (
             <Text style={{ color: Colors.textMuted, fontSize: 14, fontWeight: '300', textAlign: 'center' }}>
               {t('chat.waitingConfirm')}
             </Text>
          ) : (
             <TouchableOpacity style={[styles.primaryButton, { backgroundColor: Colors.sage, width: '100%', alignItems: 'center' }]} onPress={handleConfirmResolution}>
                <Text style={{ color: Colors.surface, fontSize: 16, fontWeight: '600' }}>{t('chat.confirmResolution')}</Text>
             </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={{ padding: 24, paddingBottom: Platform.OS === 'ios' ? 110 : 80, alignItems: 'center' }}>
          <Text style={{ color: Colors.textMuted, fontSize: 14, fontWeight: '300' }}>
            {t('chat.inputDisabled')}
          </Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    shadowColor: Colors.sage,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 2,
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '300',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '300',
    color: Colors.textMuted,
  },
  breatheButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.sage,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
  },
  breatheText: {
    color: Colors.surface,
    fontWeight: '500',
    marginLeft: 4,
  },
  chatContainer: {
    padding: 24,
    paddingBottom: 40,
  },
  messageBubble: {
    maxWidth: '85%',
    padding: 18,
    borderRadius: 24,
    marginBottom: 16,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.sage,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: 4,
    shadowColor: Colors.sage,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 1,
  },
  messageText: {
    fontSize: 16,
    fontWeight: '300',
    lineHeight: 24,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 16,
  },
  typingText: {
    marginLeft: 8,
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '300',
  },
  bottomAreaContainer: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    shadowColor: Colors.sage,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 5,
  },
  submitMediationButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.background,
  },
  submitMediationText: {
    color: Colors.indigo,
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    paddingBottom: Platform.OS === 'ios' ? 110 : 80,
  },
  voiceButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textInput: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: 16,
    color: Colors.text,
    maxHeight: 120,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  primaryButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 32,
  },
  card: {
    borderRadius: 32,
    shadowColor: Colors.sage,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 40,
    elevation: 5,
  },
  cooldownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  cooldownCard: {
    backgroundColor: Colors.surface,
    borderRadius: 32,
    padding: 36,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
    width: '100%',
  },
  cooldownEmoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  cooldownTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  cooldownBody: {
    fontSize: 16,
    fontWeight: '300',
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 28,
  },
  cooldownButton: {
    backgroundColor: Colors.sage,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 24,
    width: '100%',
    alignItems: 'center',
  },
  cooldownButtonText: {
    color: Colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
});
