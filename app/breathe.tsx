import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  makeMutable,
  type SharedValue,
} from 'react-native-reanimated';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/Colors';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useLanguage } from '@/lib/LanguageContext';
import { useRouter } from 'expo-router';
import ZenPressable from '@/components/ZenPressable';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type BreathPhase = 'Inhale' | 'Hold' | 'Exhale';

interface ParticleState {
  id: number;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  scale: SharedValue<number>;
  opacity: SharedValue<number>;
  angle: number;
  color: string;
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const INHALE_DURATION = 4000;
const HOLD_DURATION = 2000;
const EXHALE_DURATION = 4000;
const CYCLE_DURATION = INHALE_DURATION + HOLD_DURATION + EXHALE_DURATION;
const PARTICLE_COUNT = 10;
const PARTICLE_RIPPLE_DURATION = 1800;
const PARTICLE_SIZE = 5;
const PARTICLE_DISTANCE = 120;

const PARTICLE_COLORS = [Colors.sage, Colors.sand];

// 0.5 s of 8-bit unsigned PCM silence at 8000 Hz — valid WAV for offline ambient placeholder.
// Generated programmatically; replace with a zen audio asset when available.
const SILENCE_WAV_BASE64 =
  'UklGRsQPAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YaAPAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIA';

// Generate evenly spaced angles around the circle
function generateAngles(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i * (360 / count)) * (Math.PI / 180));
}

// ─────────────────────────────────────────────
// Particle Component
// ─────────────────────────────────────────────

function Particle({ particle }: { particle: ParticleState }) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: particle.translateX.value },
      { translateY: particle.translateY.value },
      { scale: particle.scale.value },
    ],
    opacity: particle.opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          // Center the particle origin within the glass container
          left: '50%',
          top: '50%',
          width: PARTICLE_SIZE,
          height: PARTICLE_SIZE,
          borderRadius: PARTICLE_SIZE / 2,
          backgroundColor: particle.color,
          // Offset by half the particle size so it radiates from its center
          marginLeft: -PARTICLE_SIZE / 2,
          marginTop: -PARTICLE_SIZE / 2,
        },
        animatedStyle,
      ]}
    />
  );
}

// ─────────────────────────────────────────────
// Helpers to trigger particles on phase change
// ─────────────────────────────────────────────

function animateParticlesOutward(particles: ParticleState[]) {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const angle = p.angle;
    const tx = Math.cos(angle) * PARTICLE_DISTANCE;
    const ty = Math.sin(angle) * PARTICLE_DISTANCE;

    p.translateX.value = withTiming(tx, {
      duration: PARTICLE_RIPPLE_DURATION,
      easing: Easing.out(Easing.ease),
    });
    p.translateY.value = withTiming(ty, {
      duration: PARTICLE_RIPPLE_DURATION,
      easing: Easing.out(Easing.ease),
    });
    p.scale.value = withTiming(1.5, {
      duration: PARTICLE_RIPPLE_DURATION,
      easing: Easing.out(Easing.ease),
    });
    p.opacity.value = withTiming(0, {
      duration: PARTICLE_RIPPLE_DURATION,
      easing: Easing.out(Easing.ease),
    });
  }
}

function resetParticles(particles: ParticleState[]) {
  for (const p of particles) {
    p.translateX.value = 0;
    p.translateY.value = 0;
    p.scale.value = 0;
    p.opacity.value = 0.6;
  }
}

// ─────────────────────────────────────────────
// Helpers for haptics (iOS only)
// ─────────────────────────────────────────────

const isIOS = process.env.EXPO_OS === 'ios';

function triggerInhaleHaptics() {
  if (!isIOS) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

function triggerInhaleMidHaptics() {
  if (!isIOS) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

function triggerExhaleHaptics() {
  if (!isIOS) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

function triggerExhaleMidHaptics() {
  if (!isIOS) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

// ─────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────

export default function BreatheScreen() {
  const router = useRouter();
  const { t } = useLanguage();

  // Breathing animation values
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.5);
  const [phase, setPhase] = useState<BreathPhase>('Inhale');

  // Sound toggle
  const [soundEnabled, setSoundEnabled] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Create particle shared values via `makeMutable` (not a React hook, so safe inside
  // Array.from callbacks). Wrapped in useRef so arrays are created once on mount.
  const particleTranslateX = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => makeMutable(0))
  ).current;
  const particleTranslateY = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => makeMutable(0))
  ).current;
  const particleScale = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => makeMutable(0))
  ).current;
  const particleOpacity = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => makeMutable(0))
  ).current;

  // Build particle objects from the stable shared-value arrays (one-time initialization)
  const particles = useRef<ParticleState[]>(
    (() => {
      const angles = generateAngles(PARTICLE_COUNT);
      return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        id: i,
        translateX: particleTranslateX[i],
        translateY: particleTranslateY[i],
        scale: particleScale[i],
        opacity: particleOpacity[i],
        angle: angles[i],
        color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
      }));
    })()
  ).current;

  // ── Sound setup ──

  // Local file path where the silent ambient WAV is written.
  // expo-av does not support inline data URIs, so we write the WAV to disk first.
  const ambientWavPath = useRef(
    FileSystem.documentDirectory + 'harmony_ambient_silence.wav'
  ).current;

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    }).catch(() => {
      // Audio mode not available on this platform — sound toggle will be a no-op
    });
    return () => {
      soundRef.current?.unloadAsync();
      soundRef.current = null;
      // Clean up the temp WAV file on unmount
      FileSystem.deleteAsync(ambientWavPath, { idempotent: true }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ambientWavPath is a stable useRef value, effect should only run on mount
  }, []);

  const toggleSound = useCallback(async () => {
    if (soundEnabled) {
      await soundRef.current?.pauseAsync();
      setSoundEnabled(false);
    } else {
      // TODO: Replace with actual zen ambient audio asset (e.g. gentle rain / singing bowl).
      if (!soundRef.current) {
        try {
          // Write the WAV to local storage — expo-av plays from file:// URIs, not data URIs.
          await FileSystem.writeAsStringAsync(ambientWavPath, SILENCE_WAV_BASE64, {
            encoding: FileSystem.EncodingType.Base64,
          });

          const { sound } = await Audio.Sound.createAsync(
            { uri: ambientWavPath },
            { isLooping: true, volume: 0.3 }
          );
          soundRef.current = sound;
        } catch {
          // Audio pipeline unavailable — sound stays visually muted
          return;
        }
      }
      await soundRef.current?.playAsync();
      setSoundEnabled(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ambientWavPath is a stable useRef value
  }, [soundEnabled]);

  // ── Breathing cycle ──

  useEffect(() => {
    const breatheCycle = () => {
      // Phase: Inhale (4s)
      setPhase('Inhale');
      triggerInhaleHaptics();
      animateParticlesOutward(particles);

      scale.value = withTiming(2.5, {
        duration: INHALE_DURATION,
        easing: Easing.inOut(Easing.ease),
      });
      opacity.value = withTiming(1, {
        duration: INHALE_DURATION,
        easing: Easing.inOut(Easing.ease),
      });

      // Mid-inhale haptic fires at INHALE_DURATION / 2 (2s), not at the end
      setTimeout(() => {
        triggerInhaleMidHaptics();
      }, INHALE_DURATION / 2);

      // Phase transition to Hold at INHALE_DURATION (4s)
      setTimeout(() => {

        // Phase: Hold (2s)
        setPhase('Hold');

        setTimeout(() => {
          // Phase: Exhale (4s)
          setPhase('Exhale');
          triggerExhaleHaptics();
          animateParticlesOutward(particles);

          scale.value = withTiming(1, {
            duration: EXHALE_DURATION,
            easing: Easing.inOut(Easing.ease),
          });
          opacity.value = withTiming(0.5, {
            duration: EXHALE_DURATION,
            easing: Easing.inOut(Easing.ease),
          });

          // Mid-exhale haptic fires at EXHALE_DURATION/2 (2s) relative to exhale start,
          // which is the correct midpoint of the exhale phase.
          setTimeout(() => {
            triggerExhaleMidHaptics();
          }, EXHALE_DURATION / 2);
        }, HOLD_DURATION);
      }, INHALE_DURATION);
    };

    // Prime particles before the first cycle so they start at opacity 0.6 / scale 0
    resetParticles(particles);
    breatheCycle();
    const interval = setInterval(() => {
      resetParticles(particles);
      breatheCycle();
    }, CYCLE_DURATION);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- breathing cycle should only run once on mount; particles/scale/opacity/ambientWavPath are stable refs that don't trigger re-runs
  }, []);

  // ── Animated styles ──

  const circleAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  // ── Phase helpers ──

  const phaseDotColor =
    phase === 'Inhale' ? Colors.sage : phase === 'Hold' ? Colors.sand : Colors.indigo;

  // ── Render ──

  return (
    <View style={styles.container}>
      {/* Close button */}
      <ZenPressable style={styles.closeButton} onPress={() => router.back()}>
        <IconSymbol name="xmark" size={28} color={Colors.textMuted} />
      </ZenPressable>

      {/* Sound toggle */}
      <ZenPressable style={styles.soundToggle} onPress={toggleSound}>
        <IconSymbol
          name={soundEnabled ? 'speaker.wave.2.fill' : 'speaker.slash.fill'}
          size={24}
          color={Colors.textMuted}
        />
      </ZenPressable>

      <Text style={styles.title}>{t('breathe.title')}</Text>
      <Text style={styles.subtitle}>{t('breathe.subtitle')}</Text>

      {/* Glassmorphism container */}
      <View style={styles.glassContainer}>
        {/* Subtle sage backdrop so the semi-transparent glass reads against the page */}
        <View style={styles.glassBackdrop} />
        <View style={styles.glassInner}>
          {/* Particle layer */}
          {particles.map((p) => (
            <Particle key={p.id} particle={p} />
          ))}

          {/* Breathing circle */}
          <Animated.View style={[styles.circle, circleAnimatedStyle]} />
          <Text style={styles.phaseText}>
            {phase === 'Inhale'
              ? t('breathe.phaseInhaleShort')
              : phase === 'Hold'
                ? t('breathe.phaseHoldShort')
                : t('breathe.phaseExhaleShort')}
          </Text>
        </View>
      </View>

      {/* Phase indicator */}
      <View style={styles.phaseIndicatorRow}>
        <View style={[styles.phaseDot, { backgroundColor: phaseDotColor }]} />
        <Text style={styles.phaseLabel}>
          {phase === 'Inhale'
            ? t('breathe.phaseInhale')
            : phase === 'Hold'
              ? t('breathe.phaseHold')
              : t('breathe.phaseExhale')}
        </Text>
        <Text style={styles.phaseTimer}>
          {phase === 'Inhale' || phase === 'Exhale' ? '4s' : '2s'}
        </Text>
      </View>

      {/* End Session */}
      <ZenPressable style={styles.endButton} onPress={() => router.back()}>
        <Text style={styles.endButtonText}>{t('breathe.endSession')}</Text>
      </ZenPressable>
    </View>
  );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────

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
  soundToggle: {
    position: 'absolute',
    top: 60,
    left: 32,
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
  /**
   * Glassmorphism container that wraps the breathing circle and particles.
   * Semi-transparent white background with a sage-tinted border for visible depth,
   * layered over a subtly darker circular backdrop so the glass reads against the
   * near-white page background.
   */
  glassContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  glassBackdrop: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(178, 172, 136, 0.08)', // subtle sage tint behind glass
  },
  glassInner: {
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    // shadow-zen equivalent
    shadowColor: Colors.sage,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 40,
    elevation: 4,
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
    color: Colors.text,
    zIndex: 10,
  },
  phaseIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  phaseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  phaseLabel: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '400',
  },
  phaseTimer: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '300',
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
  },
});
