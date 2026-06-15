import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import '../global.css';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { GroupProvider } from '@/lib/GroupContext';
import { LanguageProvider } from '@/lib/LanguageContext';
import { NotificationsProvider } from '@/lib/NotificationsContext';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === 'login' || segments[0] === 'register';

    if (!session && !inAuthGroup) {
      router.replace('/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)/groups');
    }
  }, [session, isLoading, segments]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="register" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen name="breathe" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="archives/index" options={{ headerShown: false, animation: 'slide_from_right', presentation: 'card' }} />
        <Stack.Screen name="archives/[id]" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="mediation" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <GroupProvider>
        <LanguageProvider>
          <NotificationsProvider>
            <RootLayoutNav />
          </NotificationsProvider>
        </LanguageProvider>
      </GroupProvider>
    </AuthProvider>
  );
}
