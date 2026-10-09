import { Card, Chip, EmptyState, ListRow, Screen } from '../components/ui';
import { mockData } from '../mock/mockData';
export default function Corrections() { const items = mockData.requests.filter(r => r.kind === 'Corrections'); return <Screen>{items.length ? <Card>{items.map(r => <ListRow key={r.id} title={r.title} subtitle={r.subtitle} trailing={<Chip label={r.status} variant="success" />} />)}</Card> : <EmptyState icon="time-outline" title="No corrections" description="Submitted corrections will appear here." />}</Screen>; }
