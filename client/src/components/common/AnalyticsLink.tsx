import { ReactNode } from 'react';
import { Link } from 'wouter';
import { trackEvent } from '../../lib/analytics';

interface AnalyticsLinkProps {
  // Propiedades específicas de wouter Link
  href: string;
  
  // Propiedades de evento de Google Analytics
  analyticsCategory: string;
  analyticsAction: string;
  analyticsLabel?: string;
  analyticsValue?: number;
  
  // Propiedad para deshabilitar el seguimiento
  disableTracking?: boolean;
  
  // Otras props
  children: ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * Componente de enlace que registra eventos en Google Analytics cuando se hace clic
 */
export function AnalyticsLink({
  href,
  analyticsCategory,
  analyticsAction,
  analyticsLabel,
  analyticsValue,
  disableTracking = false,
  onClick,
  children,
  ...props
}: AnalyticsLinkProps) {
  // Manejador de clic que registra el evento y luego ejecuta el manejador original
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Registra el evento si el seguimiento está habilitado
    if (!disableTracking) {
      trackEvent(analyticsCategory, analyticsAction, analyticsLabel, analyticsValue);
    }
    
    // Ejecuta el manejador original si existe
    if (onClick) {
      onClick(e);
    }
  };
  
  return (
    <Link href={href}>
      <a
        onClick={handleClick}
        {...props}
      >
        {children}
      </a>
    </Link>
  );
}