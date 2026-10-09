import { Platform, StyleSheet } from 'react-native';

export const palette = {
  light: { bg: '#F5F4F7', surface: '#FFFFFF', surfaceElevated: '#FFFFFF', textPrimary: '#12101A', textSecondary: '#6B6779', textTertiary: '#9A96A8', separator: '#ECEAF1', accent: '#5B4BE0', accentPressed: '#4A3CC7', success: '#2E9E6B', warning: '#C9860B', danger: '#D14343', chipNeutralBg: '#F1F0F5', chipNeutralText: '#4B4757', chipAccentBg: '#EDE9FE', chipAccentText: '#5B4BE0' },
  dark: { bg: '#111017', surface: '#1E1C26', surfaceElevated: '#292631', textPrimary: '#F6F4FA', textSecondary: '#C2BECF', textTertiary: '#9994AA', separator: '#393541', accent: '#A99EFF', accentPressed: '#8C7DF2', success: '#63C995', warning: '#E7B35F', danger: '#F17777', chipNeutralBg: '#302D39', chipNeutralText: '#E0DCEB', chipAccentBg: '#393153', chipAccentText: '#C2B9FF' },
} as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radii = { card: 16, cardSmall: 12, chip: 999, button: 14, sheet: 28, fab: 28 } as const;
export const typography = {
  display: { fontSize: 34, fontWeight: '700', letterSpacing: -0.4 },
  title1: { fontSize: 22, fontWeight: '700' }, title2: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 17, fontWeight: '400' }, bodyEmph: { fontSize: 17, fontWeight: '600' },
  callout: { fontSize: 16, fontWeight: '400' }, subhead: { fontSize: 15, fontWeight: '400' },
  footnote: { fontSize: 13, fontWeight: '400' }, caption: { fontSize: 12, fontWeight: '400' },
  mono: { fontSize: 15, fontWeight: '500', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
} as const;
export const hairline = StyleSheet.hairlineWidth;
export const shadows = { card: { shadowColor: '#12101A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 }, sheet: { shadowColor: '#12101A', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.08, shadowRadius: 16 }, fab: { shadowColor: '#12101A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 12 } };
