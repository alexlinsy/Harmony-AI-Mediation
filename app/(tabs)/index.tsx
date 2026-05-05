import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, StyleSheet, FlatList, ActivityIndicator, Keyboard, Alert } from 'react-native';
import { Colors } from '@/constants/Colors';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/lib/AuthContext';
import { useGroup } from '@/lib/GroupContext';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { getTherapistModel } from '@/lib/gemini';
import * as FileSystem from 'expo-file-system';
import * as Speech from 'expo-speech';
import VoiceChatUI from '@/components/VoiceChatUI';

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

  async function initializeSession() {
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
        .select('id')
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

  const sendMessage = async () => {
    if (!inputText.trim() || !chatSession) return;

    const userText = inputText.trim();
    const newMessage: Message = { id: Date.now().toString(), role: 'user', text: userText };
    
    setMessages(prev => [...prev, newMessage]);
    setInputText('');
    setIsTyping(true);
    Keyboard.dismiss();

    try {
      const result = await chatSession.sendMessage(userText);
      const responseText = result.response.text();
      
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: responseText }]);
      
      // Also speak the response out loud
      Speech.speak(responseText, { pitch: 1, rate: 0.95 });
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
      const base64Audio = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      
      const prompt = `Please listen to this audio clip. 
1. Transcribe what the user said exactly. 
2. Provide your emotional support response as a therapist.
You must output a raw, valid JSON object with NO markdown formatting, like this:
{ "transcript": "user text", "response": "your response" }`;

      const result = await chatSession.sendMessage([
        { text: prompt },
        { inlineData: { data: base64Audio, mimeType: Platform.OS === 'ios' ? 'audio/m4a' : 'audio/mp4' } }
      ]);

      const jsonText = result.response.text();
      const cleanJson = jsonText.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      
      setMessages(prev => [...prev, { id: Date.now().toString() + '_u', role: 'user', text: parsed.transcript }]);
      setMessages(prev => [...prev, { id: Date.now().toString() + '_a', role: 'model', text: parsed.response }]);
      
      Speech.speak(parsed.response, { pitch: 1, rate: 0.95 });

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
      Alert.alert("Mediation Ready", "Both statements received! Initializing AI Group Mediation...");
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
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {hasSubmittedSummary && (
            <TouchableOpacity style={[styles.breatheButton, { backgroundColor: '#E8EAF6' }]} onPress={handleStartMediationClick}>
              <IconSymbol name="play.fill" size={16} color={Colors.indigo} />
              <Text style={[styles.breatheText, { color: Colors.indigo }]}>Start Mediation</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.breatheButton} onPress={navigateToBreathe}>
            <IconSymbol name="wind" size={20} color={Colors.sage} />
            <Text style={styles.breatheText}>Breathe</Text>
          </TouchableOpacity>
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
    backgroundColor: Colors.sand,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  breatheText: {
    color: Colors.sage,
    fontWeight: '500',
    marginLeft: 6,
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
  }
});
