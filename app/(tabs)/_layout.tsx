import { Tabs } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/Colors';
import { useLanguage } from '@/lib/LanguageContext';

export default function TabLayout() {
  const { t } = useLanguage();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.sage,
        tabBarInactiveTintColor: Colors.textMuted,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopWidth: 0,
          elevation: 0,
          shadowColor: Colors.sage,
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.15,
          shadowRadius: 40,
          position: 'absolute',
          bottom: 32,
          left: 32,
          right: 32,
          borderRadius: 32,
          height: 64,
          paddingBottom: 0,
        },
        tabBarItemStyle: {
          paddingVertical: 10,
        },
        tabBarShowLabel: false,
      }}>
      <Tabs.Screen
        name="groups"
        options={{
          title: t('tabs.groups'),
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.2.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.mediator'),
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="leaf.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: t('tabs.insights'),
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="chart.bar.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.sanctuary'),
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="person.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
