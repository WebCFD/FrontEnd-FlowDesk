import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { trackPageView } from '../../lib/analytics';

/**
 * Componente que registra las vistas de página cuando cambia la URL
 * Este componente debe ser colocado cerca de la raíz de la aplicación, después de AnalyticsProvider
 */
export function PageViewTracker() {
  const [location] = useLocation();

  // Registra una vista de página cada vez que cambia la ubicación
  useEffect(() => {
    // Espera un momento para que el título de la página se actualice
    setTimeout(() => {
      trackPageView(location, document.title);
    }, 100);
  }, [location]);

  // Este componente no renderiza nada
  return null;
}