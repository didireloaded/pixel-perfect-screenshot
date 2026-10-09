import { Card, EmptyState, ListRow, Screen, Separator } from '../components/ui';
import { mockData } from '../mock/mockData';
export default function Notifications() { return <Screen>{mockData.notifications.length ? <Card>{mockData.notifications.map((item, i) => <ListRow key={i} icon="notifications-outline" title={item} />)}</Card> : <EmptyState icon="notifications-outline" title="All caught up" description="Your updates will appear here." />}</Screen>; }
