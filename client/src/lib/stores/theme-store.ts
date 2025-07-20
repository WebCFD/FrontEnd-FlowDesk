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
  updateCSSVariables: (theme: Theme) => void;
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
        
        // Apply CSS custom properties directly to root
        get().updateCSSVariables(theme);
      },
      
      updateCSSVariables: (theme: Theme) => {
        const root = document.documentElement;
        const isDark = theme.appearance === 'dark' || 
          (theme.appearance === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

        // Set primary color
        root.style.setProperty('--primary', theme.primary);

        // Define theme variants with complete color palettes
        const themeVariants = {
          professional: {
            light: {
              background: 'hsl(0 0% 100%)',
              foreground: 'hsl(222.2 84% 4.9%)',
              card: 'hsl(0 0% 100%)',
              'card-foreground': 'hsl(222.2 84% 4.9%)',
              popover: 'hsl(0 0% 100%)',
              'popover-foreground': 'hsl(222.2 84% 4.9%)',
              'primary-foreground': 'hsl(210 40% 98%)',
              secondary: 'hsl(210 40% 96%)',
              'secondary-foreground': 'hsl(222.2 84% 4.9%)',
              muted: 'hsl(210 40% 96%)',
              'muted-foreground': 'hsl(215.4 16.3% 46.9%)',
              accent: 'hsl(210 40% 96%)',
              'accent-foreground': 'hsl(222.2 84% 4.9%)',
              destructive: 'hsl(0 84.2% 60.2%)',
              'destructive-foreground': 'hsl(210 40% 98%)',
              border: 'hsl(214.3 31.8% 91.4%)',
              'border-light': 'hsl(220 13% 95%)',
              'border-medium': 'hsl(220 13% 85%)',
              'border-strong': 'hsl(220 13% 75%)',
              input: 'hsl(214.3 31.8% 91.4%)',
              ring: theme.primary,
            },
            dark: {
              background: 'hsl(222.2 84% 4.9%)',
              foreground: 'hsl(210 40% 98%)',
              card: 'hsl(222.2 84% 4.9%)',
              'card-foreground': 'hsl(210 40% 98%)',
              popover: 'hsl(222.2 84% 4.9%)',
              'popover-foreground': 'hsl(210 40% 98%)',
              'primary-foreground': 'hsl(222.2 84% 4.9%)',
              secondary: 'hsl(217.2 32.6% 17.5%)',
              'secondary-foreground': 'hsl(210 40% 98%)',
              muted: 'hsl(217.2 32.6% 17.5%)',
              'muted-foreground': 'hsl(215 20.2% 65.1%)',
              accent: 'hsl(217.2 32.6% 17.5%)',
              'accent-foreground': 'hsl(210 40% 98%)',
              destructive: 'hsl(0 62.8% 30.6%)',
              'destructive-foreground': 'hsl(210 40% 98%)',
              border: 'hsl(217.2 32.6% 17.5%)',
              'border-light': 'hsl(217.2 32.6% 20%)',
              'border-medium': 'hsl(217.2 32.6% 25%)',
              'border-strong': 'hsl(0 0% 0%)',
              input: 'hsl(217.2 32.6% 17.5%)',
              ring: theme.primary,
            }
          },
          tint: {
            light: {
              background: 'hsl(210 40% 98%)',
              foreground: 'hsl(215 25% 27%)',
              card: 'hsl(210 60% 97%)',
              'card-foreground': 'hsl(215 25% 27%)',
              popover: 'hsl(210 60% 97%)',
              'popover-foreground': 'hsl(215 25% 27%)',
              'primary-foreground': 'hsl(210 20% 98%)',
              secondary: 'hsl(210 60% 90%)',
              'secondary-foreground': 'hsl(215 25% 27%)',
              muted: 'hsl(210 60% 90%)',
              'muted-foreground': 'hsl(215.4 16.3% 56.9%)',
              accent: 'hsl(210 70% 88%)',
              'accent-foreground': 'hsl(215 25% 27%)',
              destructive: 'hsl(0 84.2% 60.2%)',
              'destructive-foreground': 'hsl(210 20% 98%)',
              border: 'hsl(210 60% 85%)',
              'border-light': 'hsl(210 40% 92%)',
              'border-medium': 'hsl(210 50% 80%)',
              'border-strong': 'hsl(210 60% 70%)',
              input: 'hsl(210 60% 85%)',
              ring: theme.primary,
            },
            dark: {
              background: 'hsl(220 18% 8%)',
              foreground: 'hsl(210 25% 88%)',
              card: 'hsl(220 20% 10%)',
              'card-foreground': 'hsl(210 25% 88%)',
              popover: 'hsl(220 20% 10%)',
              'popover-foreground': 'hsl(210 25% 88%)',
              'primary-foreground': 'hsl(222.2 84% 4.9%)',
              secondary: 'hsl(215 25% 18%)',
              'secondary-foreground': 'hsl(210 25% 88%)',
              muted: 'hsl(215 25% 18%)',
              'muted-foreground': 'hsl(217.9 10.6% 64.9%)',
              accent: 'hsl(215 30% 22%)',
              'accent-foreground': 'hsl(210 25% 88%)',
              destructive: 'hsl(0 62.8% 30.6%)',
              'destructive-foreground': 'hsl(210 20% 98%)',
              border: 'hsl(215 25% 18%)',
              'border-light': 'hsl(215 25% 22%)',
              'border-medium': 'hsl(215 25% 30%)',
              'border-strong': 'hsl(0 0% 0%)',
              input: 'hsl(215 25% 18%)',
              ring: theme.primary,
            }
          },
          vibrant: {
            light: {
              background: 'hsl(210 100% 97%)',
              foreground: 'hsl(0 0% 9%)',
              card: 'hsl(210 100% 98%)',
              'card-foreground': 'hsl(0 0% 9%)',
              popover: 'hsl(210 100% 98%)',
              'popover-foreground': 'hsl(0 0% 9%)',
              'primary-foreground': 'hsl(210 20% 98%)',
              secondary: 'hsl(210 100% 92%)',
              'secondary-foreground': 'hsl(0 0% 9%)',
              muted: 'hsl(210 100% 94%)',
              'muted-foreground': 'hsl(215.4 16.3% 36.9%)',
              accent: 'hsl(210 100% 90%)',
              'accent-foreground': 'hsl(0 0% 9%)',
              destructive: 'hsl(0 90% 55%)',
              'destructive-foreground': 'hsl(210 20% 98%)',
              border: 'hsl(210 80% 80%)',
              'border-light': 'hsl(210 50% 90%)',
              'border-medium': 'hsl(210 70% 75%)',
              'border-strong': 'hsl(210 90% 60%)',
              input: 'hsl(210 80% 80%)',
              ring: theme.primary,
            },
            dark: {
              background: 'hsl(224 71.4% 2%)',
              foreground: 'hsl(210 20% 98%)',
              card: 'hsl(224 71.4% 3%)',
              'card-foreground': 'hsl(210 20% 98%)',
              popover: 'hsl(224 71.4% 3%)',
              'popover-foreground': 'hsl(210 20% 98%)',
              'primary-foreground': 'hsl(222.2 84% 4.9%)',
              secondary: 'hsl(215 35% 20%)',
              'secondary-foreground': 'hsl(210 20% 98%)',
              muted: 'hsl(215 35% 20%)',
              'muted-foreground': 'hsl(217.9 10.6% 64.9%)',
              accent: 'hsl(215 40% 25%)',
              'accent-foreground': 'hsl(210 20% 98%)',
              destructive: 'hsl(0 70% 40%)',
              'destructive-foreground': 'hsl(210 20% 98%)',
              border: 'hsl(215 35% 20%)',
              'border-light': 'hsl(215 35% 25%)',
              'border-medium': 'hsl(215 35% 35%)',
              'border-strong': 'hsl(0 0% 0%)',
              input: 'hsl(215 35% 20%)',
              ring: theme.primary,
            }
          }
        } as const;

        // Get the appropriate color scheme
        const colorScheme = themeVariants[theme.variant][isDark ? 'dark' : 'light'];

        // Apply all color variables
        Object.entries(colorScheme).forEach(([key, value]) => {
          root.style.setProperty(`--${key}`, value);
        });

        // Force body background update
        document.body.style.backgroundColor = `var(--background)`;
        document.body.style.color = `var(--foreground)`;
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