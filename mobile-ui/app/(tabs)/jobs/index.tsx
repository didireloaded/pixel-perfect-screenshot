import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { Card, Chip, EmptyState, Screen } from '../../../components/ui';
import { mockData } from '../../../mock/mockData';
import { useTheme } from '../../../theme/useTheme';
import { typography } from '../../../theme/tokens';
import { haptics } from '../../../lib/haptics';

export default function Jobs() { const c = useTheme(); const router = useRouter(); const [segment, setSegment] = useState(0); const options = ['Upcoming', 'Assigned', 'Completed'] as const; const jobs = mockData.jobs.filter(j => j.status === options[segment]); return <Screen><SegmentedControl values={[...options]} selectedIndex={segment} onChange={e => { setSegment(e.nativeEvent.selectedSegmentIndex); void haptics.selection(); }} tintColor={c.surface} backgroundColor={c.chipNeutralBg} style={{ marginBottom: 20 }} />{jobs.length ? jobs.map(j => <Pressable key={j.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/job/[id]', params: { id: j.id } })} style={({ pressed }) => ({ marginBottom: 14, opacity: pressed ? 0.7 : 1 })}><Card><Text style={[typography.title2, { color: c.textPrimary }]}>{j.title}</Text><Text style={[typography.subhead, { color: c.textSecondary, marginTop: 6 }]}>{j.destination}</Text><Text style={[typography.footnote, { color: c.textSecondary, marginVertical: 12 }]}>{j.date} · {j.time}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}><Chip label={j.supervisor} /><Chip label={j.status} variant={j.status === 'Completed' ? 'success' : 'accent'} /></View></Card></Pressable>) : <EmptyState icon="briefcase-outline" title="No jobs here" description="Your assigned work will appear here when it is scheduled." />}</Screen>; }
