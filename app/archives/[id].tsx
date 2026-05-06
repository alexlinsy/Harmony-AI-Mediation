import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Colors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function ArchiveDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    if (id) {
      fetchSessionDetail();
    }
  }, [id]);

  const fetchSessionDetail = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('mediation_sessions')
        .select('*, groups(name)')
        .eq('id', id)
        .single();
      
      setSession(data);
    } catch (error) {
      console.error('Error fetching session detail:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.sage} />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Record not found.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: Colors.sage, marginTop: 12 }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 64, paddingBottom: 100 }}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol name="chevron.left" size={24} color={Colors.text} />
          <Text style={styles.backText}>Archives</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.groupName}>{session.groups?.name}</Text>
          <Text style={styles.date}>{new Date(session.created_at).toLocaleDateString()} • {session.category}</Text>
        </View>

        <View style={styles.resultCard}>
          <Text style={styles.sectionLabel}>Arbitration Result</Text>
          <Text style={styles.resultText}>{session.result_content}</Text>
        </View>

        {session.action_memo && (
          <View style={styles.memoCard}>
            <Text style={styles.memoTitle}>Action Memo 📝</Text>
            <Text style={styles.memoText}>{session.action_memo}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    color: Colors.textMuted,
    fontSize: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  backText: {
    fontSize: 16,
    color: Colors.text,
    marginLeft: 8,
  },
  header: {
    marginBottom: 40,
  },
  groupName: {
    fontSize: 28,
    fontWeight: '500',
    color: Colors.text,
    marginBottom: 8,
  },
  date: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '300',
    textTransform: 'uppercase',
    letterSpacing: 1,
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
  sectionLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 20,
    fontWeight: '600',
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
});
