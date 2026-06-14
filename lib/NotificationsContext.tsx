import React, { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';
import { useLanguage } from './LanguageContext';

// Expo Go doesn't support expo-notifications properly.
// Check executionEnvironment: "storeClient" = production/development build, anything else = Expo Go.
const isExpoGo =
  Constants.expoConfig?.extra?.eas?.projectId == null &&
  Constants.executionEnvironment !== 'storeClient';

// Only configure the handler in non-Expo-Go environments
if (!isExpoGo) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

type NotificationsContextType = {
  requestPermission: () => Promise<boolean>;
};

const NotificationsContext = createContext<NotificationsContextType>({
  requestPermission: async () => false,
});

function showAlert(title: string, body: string) {
  // Small delay to avoid alert collisions when multiple events fire close together
  setTimeout(() => {
    Alert.alert(title, body);
  }, 100);
}

async function showNotification(title: string, body: string) {
  if (isExpoGo) {
    showAlert(title, body);
  } else {
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title, body, sound: true },
        trigger: null,
      });
    } catch {
      // Fall back to Alert if notification fails
      showAlert(title, body);
    }
  }
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const userGroupsRef = useRef<string[]>([]);
  const setupIdRef = useRef(0);
  // Track per-session state so we don't depend on payload.old (empty without REPLICA IDENTITY FULL)
  const sessionStateRef = useRef<Record<string, { status: string; nudgedBy: string | null }>>({});

  const requestPermission = useCallback(async () => {
    if (isExpoGo) return false;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  }, []);

  useEffect(() => {
    if (!user) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    if (!isExpoGo) {
      requestPermission();
    }

    const setupId = ++setupIdRef.current;
    let aborted = false;

    const setupChannel = async () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      const { data: memberships } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', user.id);

      if (aborted || setupId !== setupIdRef.current) return;

      const groupIds = memberships?.map(m => m.group_id) || [];
      userGroupsRef.current = groupIds;

      if (groupIds.length === 0) return;

      // Seed sessionStateRef with current DB state so we don't fire stale notifications
      const { data: activeSessions } = await supabase
        .from('mediation_sessions')
        .select('id, status, nudged_by')
        .in('group_id', groupIds)
        .in('status', ['waiting', 'ready', 'processing', 'completed']);
      if (activeSessions) {
        for (const s of activeSessions) {
          sessionStateRef.current[s.id] = {
            status: s.status,
            nudgedBy: (s.nudged_by as string) || null,
          };
        }
      }

      const channelName = `notifications_${user.id}`;
      const channel = supabase.channel(channelName)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'session_inputs' },
          async (payload: any) => {
            try {
              const sessionId = payload.new.session_id;

              const { data: session } = await supabase
                .from('mediation_sessions')
                .select('group_id')
                .eq('id', sessionId)
                .single();

              if (!session || !userGroupsRef.current.includes(session.group_id)) return;
              if (payload.new.user_id === user.id) return;

              const { data: ownInput } = await supabase
                .from('session_inputs')
                .select('id')
                .eq('session_id', sessionId)
                .eq('user_id', user.id)
                .maybeSingle();

              if (!ownInput) {
                await showNotification(
                  t('chat.partnerSubmitted'),
                  t('chat.partnerSubmittedMsg')
                );
              }
            } catch (err) {
              console.error('Notification handler error:', err);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'mediation_sessions' },
          async (payload: any) => {
            try {
              if (!userGroupsRef.current.includes(payload.new.group_id)) return;

              const sessionId = payload.new.id as string;
              const newStatus = payload.new.status as string;
              const newNudgedBy = (payload.new.nudged_by as string) || null;
              const prev = sessionStateRef.current[sessionId];

              // Status change: ready (someone submitted everything, mediation can begin)
              if (newStatus === 'ready' && prev?.status !== 'ready') {
                await showNotification(
                  t('mediation.readyTitle'),
                  t('mediation.readyBody')
                );
              }

              // Status change: processing (other user claimed the mediation — go watch)
              if (newStatus === 'processing' && prev?.status !== 'processing') {
                await showNotification(
                  t('mediation.startedTitle'),
                  t('mediation.startedBody')
                );
              }

              // Status change: completed (mediation result is ready)
              if (newStatus === 'completed' && prev?.status !== 'completed') {
                await showNotification(
                  t('mediation.completedTitle'),
                  t('mediation.completedBody')
                );
              }

              // Nudge: another user is waiting
              if (newNudgedBy && newNudgedBy !== user.id && newNudgedBy !== prev?.nudgedBy) {
                await showNotification(
                  t('chat.partnerWaiting'),
                  t('chat.partnerWaitingMsg')
                );
              }

              // Track current state for next update
              sessionStateRef.current[sessionId] = {
                status: newStatus,
                nudgedBy: newNudgedBy,
              };
            } catch (err) {
              console.error('Notification handler error:', err);
            }
          }
        )
        .subscribe();

      if (!aborted && setupId === setupIdRef.current) {
        channelRef.current = channel;
      } else {
        supabase.removeChannel(channel);
      }
    };

    setupChannel();

    return () => {
      aborted = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user]);

  return (
    <NotificationsContext.Provider value={{ requestPermission }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationsContext);
