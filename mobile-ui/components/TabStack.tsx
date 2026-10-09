import { Stack, useRouter } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from './ui';
import { mockData } from '../mock/mockData';
import { useTheme } from '../theme/useTheme';
import { haptics } from '../lib/haptics';
export function TabStack({ title, large = false, newRequest = false }: { title: string; large?: boolean; newRequest?: boolean }) { const c = useTheme(); const router = useRouter(); return <Stack screenOptions={{ title, headerLargeTitle: large, headerStyle: { backgroundColor: c.bg }, headerTintColor: c.accent, headerShadowVisible: false, headerBlurEffect: 'systemThickMaterial', headerLeft: () => <Avatar name={mockData.employee.name} onPress={() => router.push('/settings')} />, headerRight: () => newRequest ? <Pressable accessibilityRole="button" accessibilityLabel="New request" onPress={() => { void haptics.light(); router.push('/request/new'); }} style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}><Ionicons name="add" size={26} color={c.accent} /></Pressable> : <Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={() => { void haptics.light(); router.push('/notifications'); }} style={{ minWidth: 44, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="notifications-outline" size={19} color={c.accent} /><Text style={{ color: c.accent, fontSize: 13 }}>Alerts</Text></Pressable> }} />; }
