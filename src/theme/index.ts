import { useColorScheme } from 'react-native';
import { useSettings } from '../store/settings';

export type Theme = {
  dark: boolean;
  bg: string;
  surface: string;
  surfaceAlt: string;
  brand: string;
  tabActive: string;
  tabInactive: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  divider: string;
  placeholder: string;
  accent: string;
  accentSoft: string;
  accentTrack: string;
  chip: string;
  menu: string;
  scrim: string;
  danger: string;
  warning: string;
  success: string;
  icon: string;
  navBar: string;
  navPill: string;
  navActive: string;
  mobile: string;
  mobileSoft: string;
  wifi: string;
  wifiSoft: string;
  track: string;
  hero: [string, string, string];
};

export const light: Theme = {
  dark: false,
  bg: '#EEF0F4',
  surface: '#F9FAFC',
  surfaceAlt: '#FFFFFF',
  brand: '#3B2AB0',
  tabActive: '#3B2AB0',
  tabInactive: '#8A86A8',
  text: '#121316',
  textSecondary: '#767884',
  textTertiary: '#A0A2AC',
  divider: '#E4E4EC',
  placeholder: '#E3E3EA',
  accent: '#5B3BF4',
  accentSoft: '#9C8CFA',
  accentTrack: '#E7E2FF',
  chip: '#E8E8EE',
  menu: '#FBFBFD',
  scrim: 'rgba(12,10,24,0.34)',
  danger: '#E5484D',
  warning: '#EE9A2E',
  success: '#17A665',
  icon: '#3A3B45',
  navBar: '#FFFFFF',
  navPill: '#EEEBFF',
  navActive: '#5B3BF4',
  mobile: '#6A47F6',
  mobileSoft: '#E6E0FF',
  wifi: '#13A9C4',
  wifiSoft: '#D6F3F8',
  track: '#ECEBF3',
  hero: ['#5A15F1', '#6A5CF7', '#7591FB'],
};

export const dark: Theme = {
  dark: true,
  bg: '#0B0B10',
  surface: '#16161D',
  surfaceAlt: '#1D1D26',
  brand: '#B8ACFF',
  tabActive: '#C3B9FF',
  tabInactive: '#6E6B86',
  text: '#F1F1F6',
  textSecondary: '#9C9BAA',
  textTertiary: '#6E6D7C',
  divider: '#2A2A34',
  placeholder: '#2A2A33',
  accent: '#8C78FF',
  accentSoft: '#6C59E0',
  accentTrack: '#2A2450',
  chip: '#262630',
  menu: '#23232C',
  scrim: 'rgba(0,0,0,0.58)',
  danger: '#FF6B6F',
  warning: '#FFB057',
  success: '#3DD68C',
  icon: '#D6D5E0',
  navBar: '#1E1E27',
  navPill: '#2F2B4D',
  navActive: '#B8ACFF',
  mobile: '#9580FF',
  mobileSoft: '#2C2652',
  wifi: '#3CCDE6',
  wifiSoft: '#15343B',
  track: '#262630',
  hero: ['#4A12CF', '#5A4FE0', '#5D78E8'],
};

export function useTheme(): Theme {
  const system = useColorScheme();
  const mode = useSettings((s) => s.theme);
  const isDark = mode === 'system' ? system === 'dark' : mode === 'dark';
  return isDark ? dark : light;
}

export const fonts = {
  brand: 'Outfit_700Bold',
  brandMedium: 'Outfit_500Medium',
};
