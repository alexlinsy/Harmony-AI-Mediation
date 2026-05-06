import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/lib/AuthContext';
import { useGroup } from '@/lib/GroupContext';
import { supabase } from '@/lib/supabase';
import { getTherapistModel } from '@/lib/gemini';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function MediationScreen() {
  const { user } = useAuth();
  const { activeGroup } = useGroup();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [mediationResult, setMediationResult] = useState<string>('');
  const [actionMemo, setActionMemo] = useState<string>('');
  const [eventType, setEventType] = useState<string>('');

  useEffect(() => {
    if (activeGroup) {
      startMediationProcess();
    }
  }, [activeGroup]);

  const startMediationProcess = async () => {
    setLoading(true);
    try {
      // 1. Get the active session for this group
      const { data: sessionData } = await supabase
        .from('mediation_sessions')
        .select('id')
        .eq('group_id', activeGroup!.id)
        .neq('status', 'completed')
        .single();
      
      if (!sessionData) {
        Alert.alert("Error", "No active mediation session found.");
        router.back();
        return;
      }

      // 2. Fetch all summaries for this session
      const { data: inputs } = await supabase
        .from('session_inputs')
        .select('content, user_id')
        .eq('session_id', sessionData.id);
      
      if (!inputs || inputs.length < 2) {
        Alert.alert("Waiting", "The AI is waiting for all parties to submit their feelings.");
        router.back();
        return;
      }

      // 3. Generate Mediation using Gemini
      const model = getTherapistModel();
      const prompt = `You are the Master Mediator. I will provide you with summaries of feelings from multiple parties involved in a conflict.
Your task is to provide an absolute objective, neutral, and constructive arbitration.

PARTIES SUMMARIES:
${inputs.map((input, index) => `Party ${index + 1}: ${input.content}`).join('\n\n')}

PLEASE FOLLOW THIS 7-STEP STRUCTURE:
1. THE MEDIATOR: Provide an objective judgment from a neutral perspective. Identify where the primary responsibility lies and if an apology is needed.
2. VALIDATION: Acknowledge the sincerity and effort of both parties for sitting down to resolve this.
3. THE COMMON GROUND: Find the balance and shared goals. Explain that their starting points or intentions might be aligned even if styles differed.
4. FACTS VS FEELINGS: Clearly distinguish what happened (facts) vs the internal interpretation (feelings).
5. THE PATH FORWARD: Guide them to propose solutions.
6. VALUE EXCHANGE: Suggest small concessions each side can make.
7. RITUAL ENDING: End with an encouraging, positive tone focusing on repairing the relationship.

Also, categorize this conflict into one of these types: Household, Financial, Emotional, Communication, or Other.

Output JSON ONLY:
{
  "result": "the full 7-step mediation text in Markdown format",
  "action_memo": "a brief bulleted action memo for improvement",
  "event_type": "one of the types mentioned above"
}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const jsonText = response.text().replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(jsonText);

      setMediationResult(parsed.result);
      setActionMemo(parsed.action_memo);
      setEventType(parsed.event_type);

      // 4. Save to Supabase
      // First, update the session status and save the result
      await supabase
        .from('mediation_sessions')
        .update({ 
          status: 'completed', 
          result_content: parsed.result,
          action_memo: parsed.action_memo,
          category: parsed.event_type
        })
        .eq('id', sessionData.id);

    } catch (error) {
      console.error('Mediation Error:', error);
      Alert.alert("Error", "The Master Mediator is currently overwhelmed. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.sage} />
        <Text style={styles.loadingText}>The Master Mediator is reviewing your hearts...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 64, paddingBottom: 100 }}>
        <View style={styles.header}>
          <IconSymbol name="leaf.fill" size={32} color={Colors.sage} />
          <Text style={styles.headerTitle}>Mediation Result</Text>
          <Text style={styles.categoryBadge}>{eventType}</Text>
        </View>

        <View style={styles.resultCard}>
          <Text style={styles.resultText}>{mediationResult}</Text>
        </View>

        <View style={styles.memoCard}>
          <Text style={styles.memoTitle}>Action Memo 📝</Text>
          <Text style={styles.memoText}>{actionMemo}</Text>
        </View>

        <TouchableOpacity 
          style={styles.doneButton}
          onPress={() => router.replace('/')}
        >
          <Text style={styles.doneButtonText}>Return with Peace</Text>
        </TouchableOpacity>
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
  }
});
