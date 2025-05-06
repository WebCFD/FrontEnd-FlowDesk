import { ReactNode } from 'react';
import { useAnalytics } from '../../hooks/useAnalytics';

interface AnalyticsProviderProps {
  children: ReactNode;
}

/**
 * Componente que inicializa Google Analytics
 * Este componente debe ser colocado cerca de la raíz de la aplicación
 */
export function AnalyticsProvider({ children }: AnalyticsProviderProps) {
  // Inicializa Google Analytics
  useAnalytics();
  
  // Simplemente renderiza los children
  return <>{children}</>;
}