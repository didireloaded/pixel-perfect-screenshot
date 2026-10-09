import 'react-native-gesture-handler';
import { Stack, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Pressable, Text, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Avatar } from '../components/ui';
import { mockData } from '../mock/mockData';
import { useTheme } from '../theme/useTheme';
import { haptics } from '../lib/haptics';

export default function RootLayout() {
  const c = useTheme(); const router = useRouter(); const scheme = useColorScheme();
  return <GestureHandlerRootView style={{ flex: 1 }}><BottomSheetModalProvider><StatusBar style={scheme === 'dark' ? 'light' : 'dark'} /><Stack screenOptions={{ headerStyle: { backgroundColor: c.bg }, headerTintColor: c.accent, headerShadowVisible: false, headerBlurEffect: 'systemThickMaterial', contentStyle: { backgroundColor: c.bg }, headerBackTitle: 'Back', gestureEnabled: true, headerLeft: () => <Avatar name={mockData.employee.name} onPress={() => router.push('/settings')} />, headerRight: () => <Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={() => { void haptics.light(); router.push('/notifications'); }} style={{ minWidth: 44, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5 }}><Ionicons name="notifications-outline" size={20} color={c.accent} /><Text style={{ color: c.accent, fontSize: 13 }}>Alerts</Text></Pressable> }}>
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="job/[id]" options={{ title: 'Job detail' }} />
    <Stack.Screen name="request/[id]" options={{ title: 'Request detail' }} />
    <Stack.Screen name="request/new" options={{ title: 'New request' }} />
    <Stack.Screen name="corrections" options={{ title: 'Correction history' }} />
    <Stack.Screen name="privacy" options={{ title: 'Privacy' }} />
    <Stack.Screen name="settings" options={{ title: 'Account settings' }} />
    <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
  </Stack></BottomSheetModalProvider></GestureHandlerRootView>;
}
