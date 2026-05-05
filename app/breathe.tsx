import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, withSequence } from 'react-native-reanimated';
import { Colors } from '@/constants/Colors';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from 'expo-router';

export default function BreatheScreen() {
  const router = useRouter();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.5);
  const [phase, setPhase] = useState('Inhale');

  useEffect(() => {
    // 4s Inhale, 2s Hold, 4s Exhale
    const breatheCycle = () => {
      setPhase('Inhale');
      scale.value = withTiming(2.5, { duration: 4000, easing: Easing.inOut(Easing.ease) });
      opacity.value = withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.ease) });

      setTimeout(() => {
        setPhase('Hold');
        
        setTimeout(() => {
          setPhase('Exhale');
          scale.value = withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.ease) });
          opacity.value = withTiming(0.5, { duration: 4000, easing: Easing.inOut(Easing.ease) });
        }, 2000);
      }, 4000);
    };

    breatheCycle();
    const interval = setInterval(breatheCycle, 10000); // 10s total cycle

    return () => clearInterval(interval);
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
      opacity: opacity.value,
    };
  });

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
        <IconSymbol name="xmark" size={28} color={Colors.textMuted} />
      </TouchableOpacity>

      <Text style={styles.title}>Harmony Meditation</Text>
      <Text style={styles.subtitle}>Follow the circle to regulate your breathing.</Text>

      <View style={styles.circleContainer}>
        <Animated.View style={[styles.circle, animatedStyle]} />
        <Text style={styles.phaseText}>{phase}</Text>
      </View>

      <TouchableOpacity style={styles.endButton} onPress={() => router.back()}>
        <Text style={styles.endButtonText}>End Session</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 32,
    zIndex: 10,
    padding: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '300',
    color: Colors.text,
    marginTop: 40,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '300',
    color: Colors.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  circleContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  circle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.sage,
    position: 'absolute',
  },
  phaseText: {
    fontSize: 24,
    fontWeight: '400',
    color: Colors.surface,
    zIndex: 10,
  },
  endButton: {
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 32,
    backgroundColor: Colors.surface,
    shadowColor: Colors.sage,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 2,
  },
  endButtonText: {
    color: Colors.sage,
    fontSize: 18,
    fontWeight: '500',
  }
});
