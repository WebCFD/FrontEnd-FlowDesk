import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Theme {
  primary: string;
  variant: 'professional' | 'tint' | 'vibrant';
  appearance: 'light' | 'dark' | 'system';
}

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Partial<Theme>) => void;
  applyTheme: () => void;
  resetToDefault: () => void;
}

// Default theme (current setup = Professional Light)
const DEFAULT_THEME: Theme = {
  primary: '#0096FF', // Current blue color
  variant: 'professional',
  appearance: 'light'
};

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme: DEFAULT_THEME,
      
      setTheme: (newTheme) => {
        set((state) => ({
          theme: { ...state.theme, ...newTheme }
        }));
        // Apply theme immediately after setting
        setTimeout(() => get().applyTheme(), 0);
      },
      
      applyTheme: () => {
        const { theme } = get();
        
        // Update theme.json via API call
        fetch('/api/theme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            primary: theme.primary,
            variant: theme.variant,
            appearance: theme.appearance,
            radius: 0.5 // Keep current radius fixed
          })
        }).catch(console.error);
        
        // Apply CSS custom properties immediately
        const root = document.documentElement;
        
        // Convert hex to HSL for CSS custom properties
        const hexToHsl = (hex: string) => {
          const r = parseInt(hex.slice(1, 3), 16) / 255;
          const g = parseInt(hex.slice(3, 5), 16) / 255;
          const b = parseInt(hex.slice(5, 7), 16) / 255;
          
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          let h = 0, s = 0, l = (max + min) / 2;
          
          if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
              case r: h = (g - b) / d + (g < b ? 6 : 0); break;
              case g: h = (b - r) / d + 2; break;
              case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
          }
          
          return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
        };
        
        // Apply primary color
        root.style.setProperty('--primary', hexToHsl(theme.primary));
        
        // Apply appearance (dark/light mode)
        if (theme.appearance === 'dark') {
          root.classList.add('dark');
          root.classList.remove('light');
        } else if (theme.appearance === 'light') {
          root.classList.add('light');
          root.classList.remove('dark');
        } else if (theme.appearance === 'system') {
          // System mode - detect user preference
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          console.log('System appearance detected:', prefersDark ? 'dark' : 'light');
          if (prefersDark) {
            root.classList.add('dark');
            root.classList.remove('light');
          } else {
            root.classList.add('light');
            root.classList.remove('dark');
          }
        }
        
        // Apply theme variant by updating CSS classes
        // Remove existing variant classes from both html and body
        root.classList.remove('theme-professional', 'theme-tint', 'theme-vibrant');
        document.body.classList.remove('theme-professional', 'theme-tint', 'theme-vibrant');
        
        // Add new variant class to both html and body - this will use CSS defined in theme-variants.css
        root.classList.add(`theme-${theme.variant}`);
        document.body.classList.add(`theme-${theme.variant}`);
        
        console.log('Applied theme variant:', theme.variant);
        console.log('Root classes after theme application:', root.className);
        console.log('Applied appearance:', theme.appearance);
        console.log('Dark class present:', root.classList.contains('dark'));
        console.log('Light class present:', root.classList.contains('light'));
      },
      
      resetToDefault: () => {
        set({ theme: DEFAULT_THEME });
        get().applyTheme();
      }
    }),
    {
      name: 'flowdesk-theme-store',
      version: 1,
    }
  )
);