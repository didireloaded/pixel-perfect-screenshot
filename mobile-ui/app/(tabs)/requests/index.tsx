import { useState } from 'react';
import { useRouter } from 'expo-router';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { Card, Chip, EmptyState, ListRow, Screen, Separator } from '../../../components/ui';
import { mockData } from '../../../mock/mockData';
import { useTheme } from '../../../theme/useTheme';
import { haptics } from '../../../lib/haptics';

export default function Requests() { const c = useTheme(); const router = useRouter(); const [segment, setSegment] = useState(0); const kinds = ['Leave', 'Departures', 'Corrections'] as const; const items = mockData.requests.filter(r => r.kind === kinds[segment]); return <Screen><SegmentedControl values={[...kinds]} selectedIndex={segment} onChange={e => { setSegment(e.nativeEvent.selectedSegmentIndex); void haptics.selection(); }} tintColor={c.surface} backgroundColor={c.chipNeutralBg} style={{ marginBottom: 20 }} />{items.length ? <Card>{items.map((r, i) => <ListRow key={r.id} title={r.title} subtitle={r.subtitle} trailing={<Chip label={r.status} variant={r.status === 'Approved' ? 'success' : r.status === 'Pending' ? 'warning' : 'muted'} />} onPress={() => router.push({ pathname: '/request/[id]', params: { id: r.id } })} />)}</Card> : <EmptyState icon="file-tray-outline" title="No requests" description="Your requests and their status will appear here." action="New request" onAction={() => router.push('/request/new')} />}</Screen>; }
