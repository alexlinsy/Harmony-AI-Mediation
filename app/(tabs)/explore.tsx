import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useLanguage } from '@/lib/LanguageContext';

export default function InsightsScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [totalSessions, setTotalSessions] = useState(0);

  useEffect(() => {
    if (user) {
      fetchInsights();
    }
  }, [user]);

  const fetchInsights = async () => {
    setLoading(true);
    try {
      // Get groups the user belongs to
      const { data: userGroups } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', user?.id);

      const groupIds = userGroups?.map(g => g.group_id) || [];

      if (groupIds.length > 0) {
        const { data: sessions } = await supabase
          .from('mediation_sessions')
          .select('category')
          .in('group_id', groupIds)
          .in('status', ['completed', 'resolved']);

        const counts: Record<string, number> = {
          Household: 0,
          Financial: 0,
          Emotional: 0,
          Communication: 0,
          Other: 0,
        };

        let total = 0;
        sessions?.forEach(session => {
          if (session.category && counts[session.category] !== undefined) {
            counts[session.category]++;
          } else {
            counts['Other']++;
          }
          total++;
        });

        setCategoryCounts(counts);
        setTotalSessions(total);
      }
    } catch (error) {
      console.error('Error fetching insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const categories = [
    { key: 'Emotional', icon: 'heart.fill', color: '#FFB3B3' },
    { key: 'Communication', icon: 'bubble.left.and.bubble.right.fill', color: '#B3D4FF' },
    { key: 'Household', icon: 'house.fill', color: Colors.sage },
    { key: 'Financial', icon: 'dollarsign.circle.fill', color: '#FFE4B3' },
    { key: 'Other', icon: 'ellipsis.circle.fill', color: Colors.textMuted },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 80, paddingBottom: 120 }}>
        <Text style={styles.headerTitle}>{t('explore.title')}</Text>
        <Text style={styles.subtitle}>{t('explore.subtitle')}</Text>

        {loading ? (
          <ActivityIndicator size="large" color={Colors.sage} style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.chartContainer}>
            {totalSessions === 0 ? (
              <View style={{ paddingVertical: 20 }}>
                <IconSymbol name="chart.bar" size={48} color={Colors.textMuted} style={{ alignSelf: 'center', marginBottom: 16 }} />
                <Text style={styles.noDataText}>{t('explore.noData')}</Text>
              </View>
            ) : (
              categories.map(cat => {
                const count = categoryCounts[cat.key] || 0;
                const percentage = totalSessions > 0 ? (count / totalSessions) * 100 : 0;

                return (
                  <View key={cat.key} style={styles.barRow}>
                    <View style={styles.labelContainer}>
                      <IconSymbol name={cat.icon as any} size={20} color={cat.color} />
                      <Text style={styles.labelText}>{t(`explore.category.${cat.key}`)}</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${percentage}%`, backgroundColor: cat.color }]} />
                    </View>
                    <Text style={styles.countText}>{count}</Text>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    fontSize: 32,
    fontWeight: '300',
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textMuted,
    fontWeight: '300',
    marginBottom: 32,
  },
  chartContainer: {
    backgroundColor: Colors.surface,
    padding: 24,
    borderRadius: 32,
    shadowColor: Colors.sage,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 4,
  },
  noDataText: {
    textAlign: 'center',
    color: Colors.textMuted,
    fontWeight: '300',
    lineHeight: 24,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 130,
  },
  labelText: {
    fontSize: 14,
    fontWeight: '400',
    color: Colors.text,
    marginLeft: 8,
  },
  barTrack: {
    flex: 1,
    height: 12,
    backgroundColor: Colors.background,
    borderRadius: 6,
    overflow: 'hidden',
    marginHorizontal: 12,
  },
  barFill: {
    height: '100%',
    borderRadius: 6,
  },
  countText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    width: 24,
    textAlign: 'right',
  }
});
