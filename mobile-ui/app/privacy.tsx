import { Text } from 'react-native';
import { Card, Screen } from '../components/ui';
import { useTheme } from '../theme/useTheme';
import { typography } from '../theme/tokens';
export default function Privacy() { const c = useTheme(); return <Screen><Card><Text style={[typography.title2, { color: c.textPrimary, marginBottom: 8 }]}>Location and attendance</Text><Text style={[typography.subhead, { color: c.textSecondary, lineHeight: 22 }]}>This UI demo collects no location, attendance, or personal information. The production app verifies location only during authorized work and stops site monitoring when the shift ends. Review your employer’s policy for retention and access details.</Text></Card></Screen>; }
