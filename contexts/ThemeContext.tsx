import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeColors, DarkColors, LightColors } from '@/constants/colors';

type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
}

const STORAGE_KEY = 'app_theme';

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  isDark: true,
  colors: DarkColors,
  toggleTheme: () => {},
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('dark');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val === 'light' || val === 'dark') {
        setThemeState(val);
      }
      setLoaded(true);
    });
  }, []);

  const setTheme = useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme);
    AsyncStorage.setItem(STORAGE_KEY, newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const colors = theme === 'light' ? LightColors : DarkColors;

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={{ theme, isDark: theme === 'dark', colors, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function useColors(): ThemeColors {
  const { colors } = useContext(ThemeContext);
  return colors;
}

export function useThemedStyles<T>(createStyles: (colors: ThemeColors) => T): T {
  const colors = useColors();
  return useMemo(() => createStyles(colors), [colors]);
}
