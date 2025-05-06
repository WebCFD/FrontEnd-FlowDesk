import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { trackPageView } from '../../lib/analytics';
import { useAnalytics } from '../../hooks/useAnalytics';

/**
 * Componente que registra las vistas de página cuando cambia la URL
 * Este componente debe ser colocado cerca de la raíz de la aplicación, después de AnalyticsProvider
 */
export function PageViewTracker() {
  const [location] = useLocation();
  const { initialized } = useAnalytics();

  // Registra una vista de página cada vez que cambia la ubicación
  useEffect(() => {
    // Solo registrar la vista si GA está inicializado
    if (!initialized) {
      return;
    }
    
    // Espera un momento para que el título de la página se actualice
    const timer = setTimeout(() => {
      trackPageView(location, document.title);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [location, initialized]);

  // Este componente no renderiza nada
  return null;
}