import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLanguage, LocaleCode } from '@/lib/LanguageContext';

const LANGUAGE_OPTIONS = [
  { value: 'en' as LocaleCode, labelKey: 'profile.language.en', nativeLabelKey: 'language.en' },
  { value: 'zh-Hant' as LocaleCode, labelKey: 'profile.language.zh-Hant', nativeLabelKey: 'language.zh-Hant' },
  { value: 'zh-Hans' as LocaleCode, labelKey: 'profile.language.zh-Hans', nativeLabelKey: 'language.zh-Hans' },
] as const;

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { t, changeLanguage, locale } = useLanguage();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [groupCount, setGroupCount] = useState(0);
  const [peacePoints, setPeacePoints] = useState(0);
  const [recentHistory, setRecentHistory] = useState<any[]>([]);
  const [preferredLanguage, setPreferredLanguage] = useState<LocaleCode>('en');

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

      // 2. Fetch language preference from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('preferred_language')
        .eq('id', user?.id)
        .single();

      if (profile?.preferred_language) {
        setPreferredLanguage(profile.preferred_language as LocaleCode);
      }

      // 3. Fetch Peace Points (10 per completed session)
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
          .eq('status', 'resolved');

        setPeacePoints((sessionsCount || 0) * 10);

        // 4. Fetch Recent History (for the summary)
        const { data: history } = await supabase
          .from('mediation_sessions')
          .select(`
            id,
            created_at,
            status,
            groups (name)
          `)
          .in('group_id', groupIds)
          .in('status', ['completed', 'resolved'])
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
      Alert.alert(t('common.error'), t('profile.updateNameError'));
    }
  };

  const handleLanguageChange = async (lang: LocaleCode) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ preferred_language: lang })
        .eq('id', user?.id);

      if (error) throw error;
      setPreferredLanguage(lang);
      changeLanguage(lang); // Update UI immediately
    } catch (error) {
      console.error('Error updating preferred language:', error);
      Alert.alert(t('common.error'), t('profile.updateLangError'));
    }
  };

  const getRank = (points: number) => {
    if (points >= 60) return { title: t('profile.rank.zenMaster'), subtitle: t('profile.rank.zenMasterSub'), color: Colors.sage };
    if (points >= 40) return { title: t('profile.rank.stillWater'), subtitle: t('profile.rank.stillWaterSub'), color: Colors.sage };
    if (points >= 20) return { title: t('profile.rank.seedling'), subtitle: t('profile.rank.seedlingSub'), color: Colors.sage };
    return { title: t('profile.rank.seedling'), subtitle: t('profile.rank.seedlingSub'), color: Colors.sage };
  };

  const rank = getRank(peacePoints);
  const progress = Math.min(peacePoints / 60, 1);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 32, paddingTop: 80, paddingBottom: 120 }}>
        <Text style={styles.headerTitle}>{t('profile.sanctuaryTitle')}</Text>

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
                    <Text style={styles.userName}>{user?.user_metadata?.full_name || t('profile.defaultName')}</Text>
                    <IconSymbol name="pencil" size={14} color={Colors.textMuted} style={{ marginLeft: 8 }} />
                  </TouchableOpacity>
                )}
                <Text style={styles.userStats}>{t('profile.groupsCount', { count: String(groupCount) })}</Text>
              </View>
            </View>

            {/* Section 2: Progression */}
            <View style={styles.progressionCard}>
              <Text style={styles.sectionLabel}>{t('profile.progression')}</Text>

              <View style={styles.gaugeContainer}>
                <View style={styles.gaugeBackground} />
                <View style={[styles.gaugeFill, { transform: [{ rotate: `${-135 + (progress * 180)}deg` }] }]} />

                <View style={styles.gaugeCover}>
                  <Text style={styles.pointsNumber}>{peacePoints}</Text>
                  <Text style={styles.pointsLabel}>{t('profile.peacePoints')}</Text>
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

            {/* Section 2b: Language Preference */}
            <View style={styles.progressionCard}>
              <Text style={styles.sectionLabel}>{t('profile.preferredLanguage')}</Text>
              {LANGUAGE_OPTIONS.map((option) => {
                const isSelected = preferredLanguage === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.languageOption,
                      isSelected && styles.languageOptionSelected,
                    ]}
                    onPress={() => handleLanguageChange(option.value)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.languageLabel,
                          isSelected && styles.languageLabelSelected,
                        ]}
                      >
                        {t(option.nativeLabelKey)}
                      </Text>
                      <Text
                        style={[
                          styles.languageSubtext,
                          isSelected && { color: Colors.textMuted },
                        ]}
                      >
                        {t(option.labelKey)}
                      </Text>
                    </View>
                    {isSelected && (
                      <IconSymbol
                        name="checkmark.circle.fill"
                        size={22}
                        color={Colors.sage}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Section 3: History & Insights */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 }}>
              <TouchableOpacity
                style={[styles.archiveCard, { flex: 1, marginRight: 8 }]}
                onPress={() => router.push('/archives')}
              >
                <IconSymbol name="archivebox.fill" size={24} color={Colors.sage} style={{ marginBottom: 8 }} />
                <Text style={styles.archiveTitle}>{t('profile.archives')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.archiveCard, { flex: 1, marginLeft: 8 }]}
                onPress={() => router.push('/explore')}
              >
                <IconSymbol name="chart.bar.fill" size={24} color={Colors.sage} style={{ marginBottom: 8 }} />
                <Text style={styles.archiveTitle}>{t('profile.insights')}</Text>
              </TouchableOpacity>
            </View>

            <View style={{ marginTop: 24 }}>
              <Text style={styles.historyLabel}>{t('profile.recentMeditations')}</Text>
              {recentHistory.map((item) => (
                <View key={item.id} style={styles.historyItem}>
                  <Text style={styles.historyGroup}>{item.groups?.name}</Text>
                  <Text style={styles.historyDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
                </View>
              ))}
              {recentHistory.length === 0 && (
                <Text style={styles.noHistory}>{t('profile.noMeditations')}</Text>
              )}
            </View>

            {/* Logout Button */}
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={() => signOut()}
              activeOpacity={0.8}
            >
              <Text style={styles.logoutButtonText}>{t('profile.logout')}</Text>
            </TouchableOpacity>
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
    height: 100,
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
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 8,
    backgroundColor: Colors.background,
  },
  languageOptionSelected: {
    backgroundColor: '#F0F4E8',
    borderWidth: 1,
    borderColor: Colors.sage,
  },
  languageLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
  },
  languageLabelSelected: {
    color: Colors.text,
    fontWeight: '600',
  },
  languageSubtext: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
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
  },
  logoutButton: {
    marginTop: 32,
    paddingVertical: 16,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Colors.textMuted,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: Colors.textMuted,
    fontSize: 16,
    fontWeight: '400',
  }
});
