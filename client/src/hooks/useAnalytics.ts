import { useEffect, useState } from 'react';
import { loadConfig } from '../env';
import { initializeAnalytics } from '../lib/analytics';

// Tipo para el resultado del hook
interface AnalyticsHookResult {
  loading: boolean;
  initialized: boolean;
  error: Error | null;
  config?: {
    googleAnalyticsId: string;
  };
}

// Variable global para mantener el estado de inicialización
let isGloballyInitialized = false;

/**
 * Hook para inicializar y usar Google Analytics
 * 
 * @returns {AnalyticsHookResult} estado de carga, inicialización y error
 */
export function useAnalytics(): AnalyticsHookResult {
  const [state, setState] = useState<AnalyticsHookResult>({
    loading: !isGloballyInitialized,
    initialized: isGloballyInitialized,
    error: null
  });

  useEffect(() => {
    // Si ya está inicializado, no hacemos nada
    if (isGloballyInitialized) {
      return;
    }
    
    // Variable para controlar si el componente está montado
    let isMounted = true;
    
    async function initialize() {
      try {
        // Carga la configuración desde el servidor
        const config = await loadConfig();
        
        // Verifica si el componente sigue montado antes de actualizar el estado
        if (!isMounted) return;
        
        // Inicializa GA con el ID de la configuración
        if (config.googleAnalyticsId) {
          initializeAnalytics(config.googleAnalyticsId);
          isGloballyInitialized = true;
          
          if (isMounted) {
            setState({
              loading: false,
              initialized: true,
              error: null,
              config
            });
            console.log('Google Analytics initialized successfully');
          }
        } else {
          console.warn('No Google Analytics ID found in configuration');
          if (isMounted) {
            setState({
              loading: false,
              initialized: false,
              error: null,
              config
            });
          }
        }
      } catch (err) {
        // Verifica si el componente sigue montado antes de actualizar el estado
        if (!isMounted) return;
        
        console.error('Error initializing analytics:', err);
        setState({
          loading: false,
          initialized: false,
          error: err instanceof Error ? err : new Error(String(err))
        });
      }
    }

    initialize();
    
    // Función de limpieza
    return () => {
      isMounted = false;
    };
  }, []);

  return state;
}