import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { Card, PrimaryButton, Screen } from '../../components/ui';
import { useTheme } from '../../theme/useTheme';
import { typography } from '../../theme/tokens';
export default function NewRequest() { const c = useTheme(); const [summary, setSummary] = useState(''); return <Screen><Text style={[typography.title1, { color: c.textPrimary, marginBottom: 16 }]}>New request</Text><Card><Text style={[typography.footnote, { color: c.textSecondary }]}>Leave request summary</Text><TextInput value={summary} onChangeText={setSummary} multiline placeholder="Dates and reason" placeholderTextColor={c.textTertiary} style={{ minHeight: 110, backgroundColor: c.bg, borderRadius: 12, padding: 12, color: c.textPrimary, marginTop: 8, textAlignVertical: 'top' }} /><View style={{ height: 16 }} /><PrimaryButton title="Submit request" disabled={!summary.trim()} onPress={() => Alert.alert('Demo only', 'This request was not submitted.')} /></Card></Screen>; }
