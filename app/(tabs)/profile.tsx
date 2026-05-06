import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function ProfileScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [groupCount, setGroupCount] = useState(0);
  const [peacePoints, setPeacePoints] = useState(0);
  const [recentHistory, setRecentHistory] = useState<any[]>([]);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(user?.user_metadata?.full_name || '');

  useEffect(() => {
    if (user) {
      fetchUserData();
    }
  }, [user]);

  const fetchUserData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Group Count
      const { count: groupsJoined } = await supabase
        .from('group_members')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user?.id);

      setGroupCount(groupsJoined || 0);

      // 2. Fetch Peace Points (10 per completed session)
      // We count completed sessions for groups user belongs to
      const { data: userGroups } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', user?.id);

      const groupIds = userGroups?.map(g => g.group_id) || [];

      if (groupIds.length > 0) {
        const { count: sessionsCount } = await supabase
          .from('mediation_sessions')
          .select('*', { count: 'exact', head: true })
          .in('group_id', groupIds)
          .eq('status', 'completed');

        setPeacePoints((sessionsCount || 0) * 10);

        // 3. Fetch Recent History (for the summary)
        const { data: history } = await supabase
          .from('mediation_sessions')
          .select(`
            id, 
            created_at, 
            status,
            groups (name)
          `)
          .in('group_id', groupIds)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(3);

        setRecentHistory(history || []);
      }
    } catch (error) {
      console.error('Error fetching profile data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateName = async () => {
    if (!editedName.trim()) return;

    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: editedName.trim() }
      });

      if (error) throw error;
      setIsEditingName(false);
    } catch (error) {
      console.error("Error updating name:", error);
      Alert.alert("Error", "Could not update name.");
    }
  };


  const getRank = (points: number) => {
    if (points >= 60) return { title: 'Zen Master', subtitle: 'Peaceful Arbiter', color: Colors.sage };
    if (points >= 40) return { title: 'Still Water', subtitle: 'Calm Mediator', color: Colors.sage };
    if (points >= 20) return { title: 'Seedling', subtitle: 'Growing Harmony', color: Colors.sage };
    return { title: 'Seedling', subtitle: 'Growing Harmony', color: Colors.sage };
  };

  const rank = getRank(peacePoints);
  const progress = Math.min(peacePoints / 60, 1); // Max 60 for the visual bar

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 32, paddingTop: 80, paddingBottom: 120 }}>
        <Text style={styles.headerTitle}>My Sanctuary</Text>

        {loading ? (
          <ActivityIndicator size="large" color={Colors.sage} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Section 1: User Info */}
            <View style={styles.userCard}>
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{user?.email?.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ marginLeft: 20, flex: 1 }}>
                {isEditingName ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TextInput
                      style={[styles.userName, { borderBottomWidth: 1, borderBottomColor: Colors.sage, minWidth: 100, paddingVertical: 0 }]}
                      value={editedName}
                      onChangeText={setEditedName}
                      autoFocus
                      onBlur={() => setIsEditingName(false)}
                      onSubmitEditing={handleUpdateName}
                    />
                    <TouchableOpacity onPress={handleUpdateName} style={{ marginLeft: 12 }}>
                      <IconSymbol name="checkmark.circle.fill" size={24} color={Colors.sage} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => setIsEditingName(true)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.userName}>{user?.user_metadata?.full_name || 'Guardian'}</Text>
                    <IconSymbol name="pencil" size={14} color={Colors.textMuted} style={{ marginLeft: 8 }} />
                  </TouchableOpacity>
                )}
                <Text style={styles.userStats}>{groupCount} Groups Joined & Created</Text>
              </View>
            </View>

            {/* Section 2: Progression */}
            <View style={styles.progressionCard}>
              <Text style={styles.sectionLabel}>Progression</Text>

              <View style={styles.gaugeContainer}>
                {/* Semi-circular Gauge (Visual Representation) */}
                <View style={styles.gaugeBackground} />
                <View style={[styles.gaugeFill, { transform: [{ rotate: `${-135 + (progress * 180)}deg` }] }]} />

                <View style={styles.gaugeCover}>
                  <Text style={styles.pointsNumber}>{peacePoints}</Text>
                  <Text style={styles.pointsLabel}>Peace Points</Text>
                </View>
              </View>

              <View style={styles.rankBadge}>
                <IconSymbol name="medal.fill" size={24} color={rank.color} />
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.rankTitle}>{rank.title}</Text>
                  <Text style={styles.rankSubtitle}>{rank.subtitle}</Text>
                </View>
              </View>
            </View>

            {/* Section 3: History */}
            <TouchableOpacity
              style={styles.archiveCard}
              onPress={() => router.push('/archives')}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <IconSymbol name="archivebox.fill" size={24} color={Colors.sage} />
                  <View style={{ marginLeft: 16 }}>
                    <Text style={styles.archiveTitle}>The Archives</Text>
                  </View>
                </View>
                <IconSymbol name="chevron.right" size={20} color={Colors.textMuted} />
              </View>
            </TouchableOpacity>

            <View style={{ marginTop: 24 }}>
              <Text style={styles.historyLabel}>Recent Meditations</Text>
              {recentHistory.map((item) => (
                <View key={item.id} style={styles.historyItem}>
                  <Text style={styles.historyGroup}>{item.groups?.name}</Text>
                  <Text style={styles.historyDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
                </View>
              ))}
              {recentHistory.length === 0 && (
                <Text style={styles.noHistory}>No completed mediations yet.</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    color: Colors.text,
    fontSize: 36,
    fontWeight: '200',
    marginBottom: 32,
    letterSpacing: 1,
  },
  userCard: {
    backgroundColor: Colors.surface,
    padding: 24,
    borderRadius: 32,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: Colors.sage,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 4,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.sage,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.surface,
    fontSize: 28,
    fontWeight: '300',
  },
  userName: {
    fontSize: 22,
    fontWeight: '500',
    color: Colors.text,
    marginBottom: 4,
  },
  userStats: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '300',
  },
  progressionCard: {
    backgroundColor: Colors.surface,
    padding: 24,
    borderRadius: 32,
    marginBottom: 24,
    alignItems: 'center',
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
    marginBottom: 24,
    fontWeight: '600',
  },
  gaugeContainer: {
    width: 200,
    height: 100, // Half circle height
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 16,
  },
  gaugeBackground: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 12,
    borderColor: Colors.background,
  },
  gaugeFill: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 12,
    borderColor: Colors.sage,
    borderBottomColor: 'transparent',
    borderRightColor: 'transparent',
    top: 0,
  },
  gaugeCover: {
    position: 'absolute',
    bottom: -12,
    width: 200,
    alignItems: 'center',
  },
  pointsNumber: {
    fontSize: 48,
    fontWeight: '200',
    color: Colors.text,
  },
  pointsLabel: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '300',
    marginBottom: 10,
  },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    marginTop: 8,
  },
  rankTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: Colors.text,
  },
  rankSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '300',
  },
  archiveCard: {
    backgroundColor: Colors.surface,
    padding: 24,
    borderRadius: 32,
    shadowColor: Colors.sage,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 4,
  },
  archiveTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: Colors.text,
  },
  archiveSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '300',
  },
  historyLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
    marginBottom: 16,
    marginLeft: 4,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  historyGroup: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: '400',
  },
  historyDate: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '300',
  },
  noHistory: {
    textAlign: 'center',
    color: Colors.textMuted,
    marginTop: 20,
    fontWeight: '300',
  }
});
