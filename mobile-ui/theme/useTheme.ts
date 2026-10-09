import { useColorScheme } from 'react-native';
import { palette } from './tokens';
export function useTheme() { return palette[useColorScheme() === 'dark' ? 'dark' : 'light']; }
