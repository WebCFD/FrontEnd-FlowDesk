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
    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      const { theme } = useThemeStore.getState();
      if (theme.appearance === 'system') {
        console.log('System theme changed:', e.matches ? 'dark' : 'light');
        applyTheme();
      }
    };
    
    // Add event listener for system theme changes
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemThemeChange);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handleSystemThemeChange);
    }
    
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleSystemThemeChange);
      } else {
        mediaQuery.removeListener(handleSystemThemeChange);
      }
    };
  }, [applyTheme]);
};