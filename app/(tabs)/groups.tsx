import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useGroup } from '@/lib/GroupContext';
import { useRouter } from 'expo-router';

type Group = {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
};

export default function GroupsScreen() {
  const { user } = useAuth();
  const { activeGroup, setActiveGroup } = useGroup();
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  // States for Modals/Prompts
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  useEffect(() => {
    if (user) {
      fetchGroups();
    }
  }, [user]);

  async function fetchGroups() {
    setLoading(true);
    // Fetch groups where the current user is a member
    const { data, error } = await supabase
      .from('groups')
      .select('id, name, invite_code, created_by, group_members!inner(user_id)')
      .eq('group_members.user_id', user?.id);

    if (error) {
      console.error('Error fetching groups:', error);
    } else if (data) {
      setGroups(data as unknown as Group[]);
    }
    setLoading(false);
  }

  const generateInviteCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  async function handleCreateGroup() {
    if (!newGroupName.trim()) return Alert.alert('Enter a group name');
    
    const code = generateInviteCode();
    
    // 1. Create Group
    const { data: groupData, error: groupError } = await supabase
      .from('groups')
      .insert({ name: newGroupName, invite_code: code, created_by: user?.id })
      .select()
      .single();

    if (groupError) return Alert.alert('Error', groupError.message);

    // 2. Add current user as member
    if (groupData) {
      const { error: memberError } = await supabase
        .from('group_members')
        .insert({ group_id: groupData.id, user_id: user?.id });

      if (memberError) return Alert.alert('Error', memberError.message);
      
      Alert.alert('Group Created!', `Your invite code is: ${code}`);
      setNewGroupName('');
      setIsCreating(false);
      fetchGroups();
    }
  }

  async function handleJoinGroup() {
    if (!inviteCode.trim()) return Alert.alert('Enter an invite code');

    // 1. Find group by code
    const { data: groupData, error: groupError } = await supabase
      .from('groups')
      .select('id')
      .eq('invite_code', inviteCode)
      .single();

    if (groupError || !groupData) return Alert.alert('Error', 'Invalid invite code or group not found.');

    // 2. Join group
    const { error: memberError } = await supabase
      .from('group_members')
      .insert({ group_id: groupData.id, user_id: user?.id });

    if (memberError) {
      if (memberError.code === '23505') { // Unique violation
        Alert.alert('Notice', 'You are already in this group.');
      } else {
        Alert.alert('Error', memberError.message);
      }
    } else {
      Alert.alert('Success', 'You have joined the group!');
    }
    
    setInviteCode('');
    setIsJoining(false);
    fetchGroups();
  }

  const selectGroup = (group: Group) => {
    setActiveGroup(group);
    router.replace('/'); // Navigate to Mediator (index.tsx)
  };

  const handleDeleteGroup = (group: Group) => {
    const isCreator = user?.id === group.created_by;
    const title = isCreator ? "Delete Group" : "Leave Group";
    const message = isCreator 
      ? `Are you sure you want to permanently delete "${group.name}" and all its data?`
      : `Are you sure you want to leave "${group.name}"?`;
    const actionText = isCreator ? "Delete" : "Leave";

    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: actionText, 
          style: "destructive",
          onPress: async () => {
            let error;
            if (isCreator) {
              const res = await supabase
                .from('groups')
                .delete()
                .eq('id', group.id);
              error = res.error;
            } else {
              const res = await supabase
                .from('group_members')
                .delete()
                .eq('group_id', group.id)
                .eq('user_id', user?.id);
              error = res.error;
            }

            if (error) {
              Alert.alert('Error', error.message);
            } else {
              if (activeGroup?.id === group.id) {
                setActiveGroup(null);
              }
              fetchGroups();
            }
          }
        }
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 32, paddingTop: 80, paddingBottom: 120 }}>
        <Text style={{ color: Colors.text, fontSize: 36, fontWeight: '500', marginBottom: 8, letterSpacing: 0.5 }}>
          Your Groups
        </Text>
        <Text style={{ color: Colors.textMuted, marginBottom: 32, fontWeight: '300', fontSize: 16 }}>
          Select a space to begin mediation.
        </Text>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 }}>
          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: Colors.surface, flex: 1, marginRight: 8 }]}
            onPress={() => { setIsCreating(true); setIsJoining(false); }}
          >
            <Text style={{ color: Colors.sage, textAlign: 'center', fontWeight: '500' }}>+ Create Group</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: Colors.surface, flex: 1, marginLeft: 8 }]}
            onPress={() => { setIsJoining(true); setIsCreating(false); }}
          >
            <Text style={{ color: Colors.sage, textAlign: 'center', fontWeight: '500' }}>Join Group</Text>
          </TouchableOpacity>
        </View>

        {isCreating && (
          <View style={[styles.card, { backgroundColor: Colors.surface, marginBottom: 24 }]}>
            <Text style={{ color: Colors.text, fontSize: 18, marginBottom: 16, fontWeight: '400' }}>Create a Safe Space</Text>
            <TextInput
              style={styles.input}
              placeholder="Group Name (e.g., Family)"
              placeholderTextColor={Colors.textMuted}
              value={newGroupName}
              onChangeText={setNewGroupName}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <TouchableOpacity onPress={() => setIsCreating(false)} style={{ padding: 12 }}>
                <Text style={{ color: Colors.textMuted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreateGroup} style={[styles.primaryButton, { backgroundColor: Colors.sage, marginLeft: 16 }]}>
                <Text style={{ color: Colors.surface, fontWeight: '500' }}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isJoining && (
          <View style={[styles.card, { backgroundColor: Colors.surface, marginBottom: 24 }]}>
            <Text style={{ color: Colors.text, fontSize: 18, marginBottom: 16, fontWeight: '400' }}>Join a Group</Text>
            <TextInput
              style={styles.input}
              placeholder="6-Digit Invite Code"
              placeholderTextColor={Colors.textMuted}
              value={inviteCode}
              onChangeText={setInviteCode}
              keyboardType="number-pad"
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <TouchableOpacity onPress={() => setIsJoining(false)} style={{ padding: 12 }}>
                <Text style={{ color: Colors.textMuted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleJoinGroup} style={[styles.primaryButton, { backgroundColor: Colors.sage, marginLeft: 16 }]}>
                <Text style={{ color: Colors.surface, fontWeight: '500' }}>Join</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {loading ? (
          <ActivityIndicator size="large" color={Colors.sage} style={{ marginTop: 40 }} />
        ) : (
          groups.map(group => (
            <TouchableOpacity 
              key={group.id} 
              style={[styles.groupCard, { backgroundColor: Colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
              onPress={() => selectGroup(group)}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.text, fontSize: 20, fontWeight: '400', marginBottom: 4 }}>{group.name}</Text>
                <Text style={{ color: Colors.textMuted, fontSize: 14, fontWeight: '300' }}>Invite Code: {group.invite_code}</Text>
              </View>
              <TouchableOpacity 
                onPress={() => handleDeleteGroup(group)}
                style={{ padding: 12, marginLeft: 8 }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="trash-outline" size={24} color={Colors.sage} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}

        {!loading && groups.length === 0 && (
          <Text style={{ color: Colors.textMuted, textAlign: 'center', marginTop: 40, fontWeight: '300' }}>
            You haven't joined any groups yet.
          </Text>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    paddingVertical: 16,
    borderRadius: 24,
    shadowColor: Colors.sage,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 2,
  },
  card: {
    padding: 24,
    borderRadius: 24,
    shadowColor: Colors.sage,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 2,
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    padding: 16,
    color: Colors.text,
    marginBottom: 16,
  },
  primaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
  },
  groupCard: {
    padding: 24,
    borderRadius: 24,
    marginBottom: 16,
    shadowColor: Colors.sage,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 3,
  }
});
