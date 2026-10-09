import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { BlurView } from 'expo-blur';
import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { Avatar } from '../../components/ui';
import { mockData } from '../../mock/mockData';
import { useTheme } from '../../theme/useTheme';
import { hairline } from '../../theme/tokens';
import { haptics } from '../../lib/haptics';

const tabs = [
  { name: 'today', label: 'Today', icon: 'home-outline', selected: 'home', symbol: 'house' },
  { name: 'jobs', label: 'Jobs', icon: 'briefcase-outline', selected: 'briefcase', symbol: 'briefcase' },
  { name: 'hours', label: 'My hours', icon: 'time-outline', selected: 'time', symbol: 'clock' },
  { name: 'requests', label: 'Requests', icon: 'file-tray-full-outline', selected: 'file-tray-full', symbol: 'tray.full' },
] as const;
export default function TabLayout() {
  const c = useTheme(); const insets = useSafeAreaInsets();
  return <Tabs tabBar={({ state, navigation }) => <BlurView intensity={80} tint="systemThickMaterial" style={{ borderTopWidth: hairline, borderTopColor: c.separator, height: 49 + insets.bottom, flexDirection: 'row', paddingBottom: insets.bottom, backgroundColor: Platform.OS === 'android' ? c.surface : undefined }}>{tabs.map((tab, i) => { const focused = state.index === i; return <Pressable key={tab.name} accessibilityRole="tab" accessibilityState={{ selected: focused }} onPress={() => { void haptics.selection(); navigation.navigate(tab.name); }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, gap: 2 }}><SymbolView name={(focused ? `${tab.symbol}.fill` : tab.symbol) as ComponentProps<typeof SymbolView>['name']} size={24} tintColor={focused ? c.accent : c.textTertiary} fallback={<Ionicons name={(focused ? tab.selected : tab.icon) as keyof typeof Ionicons.glyphMap} size={24} color={focused ? c.accent : c.textTertiary} />} /><Text maxFontSizeMultiplier={1.2} style={{ color: focused ? c.accent : c.textTertiary, fontSize: 10, fontWeight: '500' }}>{tab.label}</Text></Pressable>; })}</BlurView>} screenOptions={{ headerShown: false }}>
    <Tabs.Screen name="today" options={{ title: 'Today' }} />
    <Tabs.Screen name="jobs" options={{ title: 'Jobs' }} />
    <Tabs.Screen name="hours" options={{ title: 'My hours' }} />
    <Tabs.Screen name="requests" options={{ title: 'Requests' }} />
  </Tabs>;
}
