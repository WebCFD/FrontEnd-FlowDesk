import { useEffect, useState } from 'react';
import { loadConfig } from '../env';
import { initializeAnalytics, trackPageView } from '../lib/analytics';

/**
 * Hook para inicializar y usar Google Analytics
 * 
 * @returns {Object} estado de carga y error
 */
export function useAnalytics() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function initialize() {
      try {
        setLoading(true);
        // Carga la configuración desde el servidor
        const config = await loadConfig();
        
        // Inicializa GA con el ID de la configuración
        if (config.googleAnalyticsId) {
          initializeAnalytics(config.googleAnalyticsId);
          
          // Registra la vista de página inicial
          trackPageView(window.location.pathname, document.title);
          
          console.log('Google Analytics initialized successfully');
        } else {
          console.warn('No Google Analytics ID found in configuration');
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Error initializing analytics:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      }
    }

    initialize();
  }, []);

  return { loading, error };
}