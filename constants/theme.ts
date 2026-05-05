/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#B2AC88'; // Sage Green
const tintColorDark = '#B2AC88';

export const Colors = {
  light: {
    text: '#3E3C38',
    textMuted: '#8B8881',
    background: '#FBFBF9',
    surface: '#FFFFFF',
    tint: tintColorLight,
    icon: '#B2AC88',
    tabIconDefault: '#D9D1C7',
    tabIconSelected: tintColorLight,
    sage: '#B2AC88',
    sand: '#E6D5B8',
    indigo: '#5F7ADB',
  },
  dark: {
    text: '#FBFBF9',
    textMuted: '#D9D1C7',
    background: '#3E3C38',
    surface: '#55534E',
    tint: tintColorDark,
    icon: '#B2AC88',
    tabIconDefault: '#8B8881',
    tabIconSelected: tintColorDark,
    sage: '#B2AC88',
    sand: '#E6D5B8',
    indigo: '#5F7ADB',
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
