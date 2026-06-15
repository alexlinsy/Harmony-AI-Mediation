import React, { useCallback } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  type WithSpringConfig,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const DEFAULT_SPRING_CONFIG: WithSpringConfig = {
  mass: 0.5,
  damping: 12,
  stiffness: 200,
};

const isIOS = process.env.EXPO_OS === 'ios';

interface ZenPressableProps extends Omit<PressableProps, 'style' | 'onPressIn' | 'onPressOut'> {
  /** Optional container style applied to the outer View */
  style?: StyleProp<ViewStyle>;
  /** How much to scale down on press in (default 0.97) */
  scaleAmount?: number;
  /** Whether to trigger haptic feedback on press in (default true) */
  hapticEnabled?: boolean;
  children: React.ReactNode;
}

export default function ZenPressable({
  onPress,
  style,
  scaleAmount = 0.97,
  hapticEnabled = true,
  disabled = false,
  children,
  ...rest
}: ZenPressableProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn = useCallback(() => {
    if (disabled) return;

    scale.value = withSpring(scaleAmount, DEFAULT_SPRING_CONFIG);
    opacity.value = withSpring(0.85, DEFAULT_SPRING_CONFIG);

    if (hapticEnabled && isIOS) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [disabled, scaleAmount, hapticEnabled, scale, opacity]);

  const handlePressOut = useCallback(() => {
    if (disabled) return;

    scale.value = withSpring(1, DEFAULT_SPRING_CONFIG);
    opacity.value = withSpring(1, DEFAULT_SPRING_CONFIG);
  }, [disabled, scale, opacity]);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      {...rest}
    >
      <Animated.View style={[style, animatedStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
