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

type Message = {
  id: string;
  role: 'user' | 'model';
  text: string;
};

export default function ChatMediatorScreen() {
  const { user } = useAuth();
  const { activeGroup } = useGroup();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [chatSession, setChatSession] = useState<any>(null);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [hasSubmittedSummary, setHasSubmittedSummary] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [groupMemberCount, setGroupMemberCount] = useState(0);
  const [sessionInputs, setSessionInputs] = useState<any[]>([]);

  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isCooldownVisible, setIsCooldownVisible] = useState(false);
  const cooldownCountdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flatListRef = useRef<FlatList>(null);

  // Initialize Chat & Session
  useEffect(() => {
    if (activeGroup) {
      initializeSession();

      // Subscribe to real-time updates for inputs in this group's active session
      const channel = supabase.channel('session_updates')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'session_inputs' },
          () => {
            fetchSessionInputs(); // Re-fetch to check if everyone is done
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [activeGroup]);

  // Initialize TTS voice settings
  useEffect(() => {
    // Note: expo-speech in Expo Go cannot guarantee speaker routing on iOS.
    // Volume/routing is controlled by iOS hardware after recording.
  }, []);

  async function initializeSession() {
    // Reset all session state when switching groups
    setMessages([]);
    setHasSubmittedSummary(false);
    setIsGeneratingSummary(false);
    setSessionInputs([]);
    setChatSession(null);

    // 1. Get group member count
    const { count } = await supabase
      .from('group_members')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', activeGroup!.id);
    setGroupMemberCount(count || 0);

    // 2. Get or create Supabase Session
    let { data: sessionData } = await supabase
      .from('mediation_sessions')
      .select('id, status')
      .eq('group_id', activeGroup!.id)
      .neq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!sessionData) {
      const { data: newSession } = await supabase
        .from('mediation_sessions')
        .insert({ group_id: activeGroup!.id })
        .select('id, status')
        .single();
      sessionData = newSession;
    }
    setActiveSessionId(sessionData?.id || null);

    // 3. Initialize Gemini Chat
    const model = getTherapistModel();
    const initialGreeting = "Welcome to this safe space. Take a deep breath. I'm here to listen without judgment. What's been troubling you recently?";
    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: "Hello, I need some emotional support." }] },
        { role: 'model', parts: [{ text: initialGreeting }] }
      ]
    });
    setChatSession(chat);
    setMessages([{ id: 'init', role: 'model', text: initialGreeting }]);

    // 4. Check if current user already submitted a summary for this session
    fetchSessionInputs(sessionData?.id);
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

  // Detect if text is predominantly Chinese
  const isChinese = (text: string): boolean => {
    const chineseChars = text.match(/[\u4e00-\u9fff]/g) || [];
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

  // Analyze emotional intensity and trigger cooldown if too extreme
  const analyzeAndTriggerCooldown = async (userText: string): Promise<boolean> => {
    try {
      const model = getTherapistModel();
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
      // Check emotional intensity first
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
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "I'm sorry, I encountered an issue processing that. Please take a deep breath and try again." }]);
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

      // Check if transcript shows extreme emotion
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
      Alert.alert("Error", "Could not process audio. Please try again.");
    } finally {
      setIsTyping(false);
    }
  };

  const handleSubmitMediation = async () => {
    if (!chatSession || !activeSessionId || messages.length <= 1) return;
    setIsGeneratingSummary(true);

    try {
      // 1. Ask AI to summarize the entire conversation
      const summaryPrompt = "Please summarize the user's core grievance, the facts, and their underlying feelings from our conversation into a clear, single paragraph using Non-Violent Communication principles. Do not address the user directly, just output the summary.";
      const result = await chatSession.sendMessage(summaryPrompt);
      const summaryText = result.response.text();

      // 2. Save the summary to Supabase
      await supabase.from('session_inputs').insert({
        session_id: activeSessionId,
        user_id: user?.id,
        content: summaryText,
        input_type: 'text'
      });

      setHasSubmittedSummary(true);
      fetchSessionInputs();
    } catch (error) {
      console.error("Error generating summary:", error);
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

  const handleStartMediationClick = () => {
    if (isReadyForMediation) {
      router.push('/mediation');
    } else {
      Alert.alert("Waiting for Partner", "A notification has been sent reminding them to share their version of the conflict.");
    }
  };

  if (!activeGroup) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <Text style={{ color: Colors.text, fontSize: 24, fontWeight: '300', marginBottom: 16 }}>No Group Selected</Text>
        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: Colors.sage }]} onPress={() => router.replace('/')}>
          <Text style={{ color: Colors.surface, fontWeight: '500' }}>Go to Groups</Text>
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
            <Text style={styles.cooldownTitle}>Let's Pause for a Moment</Text>
            <Text style={styles.cooldownBody}>
              I can sense you're feeling very overwhelmed right now. That's completely okay. Before we continue, let's take a few deep breaths together to help calm your mind and body.
            </Text>
            <TouchableOpacity style={styles.cooldownButton} onPress={handleCooldownComplete}>
              <Text style={styles.cooldownButtonText}>Start Breathing Exercise 🌬️</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setIsCooldownVisible(false)} style={{ marginTop: 16 }}>
              <Text style={{ color: Colors.textMuted, fontSize: 14 }}>I'm okay, continue</Text>
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
          <Text style={styles.headerSubtitle}>Therapy Session</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TouchableOpacity style={[styles.breatheButton, { width: 110 }]} onPress={navigateToBreathe}>
            <IconSymbol name="wind" size={16} color={Colors.surface} />
            <Text style={styles.breatheText}>Breathe</Text>
          </TouchableOpacity>
          {hasSubmittedSummary && (
            <TouchableOpacity style={[styles.breatheButton, { width: 110 }]} onPress={handleStartMediationClick}>
              <IconSymbol name="play.fill" size={16} color={Colors.surface} />
              <Text style={[styles.breatheText, { fontSize: 13, marginLeft: 6 }]}>Mediation</Text>
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
          <Text style={styles.typingText}>Harmony is typing...</Text>
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
                <Text style={styles.submitMediationText}>I'm ready for Group Mediation</Text>
              )}
            </TouchableOpacity>
          )}

          <View style={styles.inputWrapper}>
            <TouchableOpacity style={styles.voiceButton} onPress={navigateToVoice}>
              <IconSymbol name="mic.fill" size={24} color={Colors.sage} />
            </TouchableOpacity>

            <TextInput
              style={styles.textInput}
              placeholder="Share your feelings..."
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
      ) : (
        <View style={{ padding: 24, paddingBottom: Platform.OS === 'ios' ? 110 : 80, alignItems: 'center' }}>
          <Text style={{ color: Colors.textMuted, fontSize: 14, fontWeight: '300' }}>
            Input disabled. Waiting for others to complete their sessions.
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
