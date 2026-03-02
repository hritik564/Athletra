export type ThemeColors = {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  accent: string;
  accentLight: string;
  accentDark: string;
  background: string;
  surface: string;
  surfaceLight: string;
  surfaceHighlight: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  success: string;
  warning: string;
  error: string;
  calorieRing: string;
  proteinRing: string;
  carbsRing: string;
  fatRing: string;
  waterRing: string;
  border: string;
};

export const DarkColors: ThemeColors = {
  primary: '#1B7FE3',
  primaryLight: '#4DA3FF',
  primaryDark: '#0D5BB5',
  accent: '#FF6B35',
  accentLight: '#FF8A5C',
  accentDark: '#E55A2B',
  background: '#0B1120',
  surface: '#121B2E',
  surfaceLight: '#1A2540',
  surfaceHighlight: '#243358',
  text: '#F0F4F8',
  textSecondary: '#8A9BBF',
  textMuted: '#5A6B8A',
  success: '#2ECC71',
  warning: '#F39C12',
  error: '#E74C3C',
  calorieRing: '#FF6B35',
  proteinRing: '#1B7FE3',
  carbsRing: '#F39C12',
  fatRing: '#E74C3C',
  waterRing: '#00BCD4',
  border: '#1A2540',
};

export const LightColors: ThemeColors = {
  primary: '#1B7FE3',
  primaryLight: '#4DA3FF',
  primaryDark: '#0D5BB5',
  accent: '#FF6B35',
  accentLight: '#FF8A5C',
  accentDark: '#E55A2B',
  background: '#F5F7FA',
  surface: '#FFFFFF',
  surfaceLight: '#EEF2F7',
  surfaceHighlight: '#E1E8F0',
  text: '#1A2138',
  textSecondary: '#5A6785',
  textMuted: '#8B95AD',
  success: '#2ECC71',
  warning: '#F39C12',
  error: '#E74C3C',
  calorieRing: '#FF6B35',
  proteinRing: '#1B7FE3',
  carbsRing: '#F39C12',
  fatRing: '#E74C3C',
  waterRing: '#00BCD4',
  border: '#E1E8F0',
};

export function getColors(theme: 'light' | 'dark'): ThemeColors {
  return theme === 'light' ? LightColors : DarkColors;
}

const Colors = DarkColors;
export default Colors;
