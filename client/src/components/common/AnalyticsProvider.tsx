import { ReactNode } from 'react';
import { useAnalytics } from '../../hooks/useAnalytics';
import { PageViewTracker } from './PageViewTracker';
import { AnalyticsDebugger } from './AnalyticsDebugger';

interface AnalyticsProviderProps {
  children: ReactNode;
  debug?: boolean;
}

/**
 * Proveedor de Google Analytics para la aplicación
 * Inicializa Google Analytics y proporciona seguimiento de páginas automático
 */
export function AnalyticsProvider({ children, debug = false }: AnalyticsProviderProps) {
  // Inicializa Google Analytics
  const { initialized, error } = useAnalytics();
  
  // Imprimir información de depuración si se solicita
  if (debug && process.env.NODE_ENV === 'development') {
    console.log('Analytics initialized:', initialized);
    if (error) {
      console.error('Analytics initialization error:', error);
    }
  }
  
  return (
    <>
      {/* Componente que rastrea automáticamente las vistas de página */}
      <PageViewTracker />
      
      {/* Renderizar los componentes hijo */}
      {children}
      
      {/* Mostrar depurador de analytics en modo desarrollo si debug=true */}
      {debug && <AnalyticsDebugger />}
    </>
  );
}