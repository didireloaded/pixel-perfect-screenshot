import * as Haptics from 'expo-haptics';
export const haptics = { selection: () => Haptics.selectionAsync().catch(() => {}), light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}), success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}) };
