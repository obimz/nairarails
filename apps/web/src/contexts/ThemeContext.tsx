/**
 * ThemeContext.tsx - Light/Dark mode theme provider
 * 
 * Manages theme state and provides smooth transitions between light and dark modes
 * with proper localStorage persistence and system preference detection.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isSystemTheme: boolean;
  setIsSystemTheme: (useSystem: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

function getSystemTheme(): Theme {
  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

function getInitialTheme(): { theme: Theme; isSystemTheme: boolean } {
  if (typeof window === 'undefined') {
    return { theme: 'dark', isSystemTheme: true };
  }

  const stored = localStorage.getItem('nairarails-theme');
  const isSystemStored = localStorage.getItem('nairarails-use-system-theme');
  
  if (stored && (stored === 'light' || stored === 'dark')) {
    return {
      theme: stored as Theme,
      isSystemTheme: isSystemStored === 'true'
    };
  }

  return {
    theme: getSystemTheme(),
    isSystemTheme: true
  };
}

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [mounted, setMounted] = useState(false);
  const [{ theme, isSystemTheme }, setState] = useState(getInitialTheme);

  // Handle system theme changes
  useEffect(() => {
    if (!mounted) {
      setMounted(true);
      return;
    }

    if (isSystemTheme) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        setState(prev => ({ ...prev, theme: e.matches ? 'dark' : 'light' }));
      };

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [isSystemTheme, mounted]);

  // Apply theme to document
  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    
    // Update meta theme-color for mobile browsers
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'dark' ? '#0A0E14' : '#FFFFFF');
    }
  }, [theme, mounted]);

  // Persist theme preferences
  useEffect(() => {
    if (!mounted) return;
    
    localStorage.setItem('nairarails-theme', theme);
    localStorage.setItem('nairarails-use-system-theme', isSystemTheme.toString());
  }, [theme, isSystemTheme, mounted]);

  const setTheme = (newTheme: Theme) => {
    setState({ theme: newTheme, isSystemTheme: false });
  };

  const toggleTheme = () => {
    setState(prev => ({
      theme: prev.theme === 'dark' ? 'light' : 'dark',
      isSystemTheme: false
    }));
  };

  const setIsSystemTheme = (useSystem: boolean) => {
    setState(prev => ({
      theme: useSystem ? getSystemTheme() : prev.theme,
      isSystemTheme: useSystem
    }));
  };

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return <div style={{ visibility: 'hidden' }}>{children}</div>;
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        isSystemTheme,
        setIsSystemTheme
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}