'use client';

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';

interface ThemeContextType {
  theme: string | undefined;
  setTheme: (theme: string) => void;
  resolvedTheme: 'light' | 'dark';
  themes: string[];
  systemTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'system',
  setTheme: () => {},
  resolvedTheme: 'dark',
  themes: ['light', 'dark', 'system'],
  systemTheme: 'dark',
});

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'plannrai-theme',
  attribute = 'class',
}: {
  children: React.ReactNode;
  defaultTheme?: string;
  storageKey?: string;
  attribute?: string;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
  [key: string]: any;
}) {
  const [theme, setThemeState] = useState<string>(defaultTheme);
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      setThemeState(saved);
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemTheme(media.matches ? 'dark' : 'light');

    const listener = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [storageKey]);

  const resolvedTheme: 'light' | 'dark' = useMemo(() => {
    if (theme === 'system') {
      return systemTheme;
    }
    return theme === 'light' ? 'light' : 'dark';
  }, [theme, systemTheme]);

  useEffect(() => {
    const root = document.documentElement;
    if (attribute === 'class') {
      root.classList.remove('light', 'dark');
      root.classList.add(resolvedTheme);
    } else {
      root.setAttribute(attribute, resolvedTheme);
    }
  }, [resolvedTheme, attribute]);

  const setTheme = (newTheme: string) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(storageKey, newTheme);
    } catch {
      // ignore
    }
  };

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      resolvedTheme,
      themes: ['light', 'dark', 'system'],
      systemTheme,
    }),
    [theme, resolvedTheme, systemTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

