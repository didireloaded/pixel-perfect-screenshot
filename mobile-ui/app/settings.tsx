import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Avatar, Card, ListRow, Screen, Separator } from '../components/ui';
import { mockData } from '../mock/mockData';
import { useTheme } from '../theme/useTheme';
import { typography } from '../theme/tokens';
export default function Settings() { const c = useTheme(); const router = useRouter(); return <Screen><Card><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Avatar name={mockData.employee.name} size={56} /><View><Text style={[typography.title2, { color: c.textPrimary }]}>{mockData.employee.name}</Text><Text style={[typography.footnote, { color: c.textSecondary }]}>{mockData.employee.number} · Demo account</Text></View></View></Card><View style={{ height: 16 }} /><Card><ListRow icon="shield-checkmark-outline" title="Privacy information" subtitle="Location and data use" onPress={() => router.push('/privacy')} /><Separator /><ListRow icon="information-circle-outline" title="About this demo" subtitle="Mock data only · no account is connected" /></Card></Screen>; }
