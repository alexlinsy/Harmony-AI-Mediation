import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';

type ArchiveGroup = {
  name: string;
  sessions: any[];
};

export default function ArchivesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [groupedArchives, setGroupedArchives] = useState<ArchiveGroup[]>([]);

  useEffect(() => {
    if (user) {
      fetchArchives();
    }
  }, [user]);

  const fetchArchives = async () => {
    setLoading(true);
    try {
      // 1. Fetch user's groups
      const { data: userGroups } = await supabase
        .from('group_members')
        .select('group_id, groups(name)')
        .eq('user_id', user?.id);
      
      const groupIds = userGroups?.map(g => g.group_id) || [];
      
      if (groupIds.length > 0) {
        // 2. Fetch completed sessions for these groups
        const { data: sessions } = await supabase
          .from('mediation_sessions')
          .select(`
            id,
            created_at,
            category,
            group_id,
            groups (name)
          `)
          .in('group_id', groupIds)
          .eq('status', 'completed')
          .order('created_at', { ascending: false });
        
        // 3. Group by group name
        const groupsMap: { [key: string]: any[] } = {};
        sessions?.forEach(session => {
          const groupName = session.groups?.name || 'Unknown Group';
          if (!groupsMap[groupName]) groupsMap[groupName] = [];
          groupsMap[groupName].push(session);
        });

        const grouped = Object.entries(groupsMap).map(([name, sessions]) => ({
          name,
          sessions
        }));

        setGroupedArchives(grouped);
      }
    } catch (error) {
      console.error('Error fetching archives:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 64, paddingBottom: 100 }}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol name="chevron.left" size={24} color={Colors.text} />
          <Text style={styles.backText}>Sanctuary</Text>
        </TouchableOpacity>

        <Text style={styles.title}>The Archives</Text>

        {loading ? (
          <ActivityIndicator size="large" color={Colors.sage} style={{ marginTop: 40 }} />
        ) : groupedArchives.length === 0 ? (
          <View style={styles.emptyContainer}>
            <IconSymbol name="archivebox" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Your archives are currently empty. Complete a mediation to see it here.</Text>
          </View>
        ) : (
          groupedArchives.map((group, index) => (
            <View key={index} style={styles.groupSection}>
              <View style={styles.groupHeader}>
                <IconSymbol name="person.2.fill" size={18} color={Colors.sage} />
                <Text style={styles.groupName}>{group.name}</Text>
              </View>
              
              {group.sessions.map((session) => (
                <TouchableOpacity 
                  key={session.id} 
                  style={styles.sessionItem}
                  onPress={() => router.push(`/archives/${session.id}`)}
                >
                  <View style={styles.sessionContent}>
                    <Text style={styles.sessionTitle}>
                      {new Date(session.created_at).toLocaleDateString()} • {session.category || 'Conflict'}
                    </Text>
                    <IconSymbol name="chevron.right" size={16} color={Colors.textMuted} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  backText: {
    fontSize: 16,
    color: Colors.text,
    marginLeft: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '200',
    color: Colors.text,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '300',
    marginBottom: 40,
  },
  groupSection: {
    marginBottom: 32,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingLeft: 4,
  },
  groupName: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginLeft: 10,
  },
  sessionItem: {
    backgroundColor: Colors.surface,
    padding: 20,
    borderRadius: 20,
    marginBottom: 12,
    shadowColor: Colors.sage,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  sessionContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionTitle: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: '400',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 16,
    fontSize: 16,
    fontWeight: '300',
    paddingHorizontal: 40,
    lineHeight: 24,
  }
});
