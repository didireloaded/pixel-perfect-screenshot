import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { Card, Chip, EmptyState, Screen } from '../../components/ui';
import { mockData } from '../../mock/mockData';
import { useTheme } from '../../theme/useTheme';
import { typography } from '../../theme/tokens';
export default function RequestDetail() { const { id } = useLocalSearchParams<{ id: string }>(); const c = useTheme(); const r = mockData.requests.find(x => x.id === id); if (!r) return <Screen><EmptyState icon="document-outline" title="Request not found" description="This demo request is unavailable." /></Screen>; return <Screen><Text style={[typography.title1, { color: c.textPrimary, marginBottom: 14 }]}>{r.title}</Text><Card><Chip label={r.status} variant={r.status === 'Approved' ? 'success' : 'warning'} /><Text style={[typography.subhead, { color: c.textSecondary, marginTop: 16 }]}>{r.subtitle}</Text><Text style={[typography.body, { color: c.textPrimary, marginTop: 16 }]}>{r.detail}</Text></Card></Screen>; }
