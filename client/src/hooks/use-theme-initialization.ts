import { useEffect } from 'react';
import { useThemeStore } from '@/lib/stores/theme-store';

/**
 * Hook to initialize theme on app startup
 * Should be called in App.tsx or main layout component
 */
export const useThemeInitialization = () => {
  const { applyTheme } = useThemeStore();

  useEffect(() => {
    // Apply theme on app initialization
    applyTheme();
    
    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      const { theme } = useThemeStore.getState();
      if (theme.appearance === 'system') {
        applyTheme();
      }
    };
    
    mediaQuery.addEventListener('change', handleSystemThemeChange);
    
    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, [applyTheme]);
};