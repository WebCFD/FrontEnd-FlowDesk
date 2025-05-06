import { AnchorHTMLAttributes } from 'react';
import { Link } from 'wouter';
import { trackEvent } from '@/lib/analytics';

/**
 * Props para AnalyticsExternalLink
 */
interface AnalyticsExternalLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  category: string; // Categoría del evento para Google Analytics
  action: string;   // Acción del evento para Google Analytics
  label?: string;   // Etiqueta opcional del evento
  value?: number;   // Valor opcional del evento
}

/**
 * Enlace externo (a) que registra un evento en Google Analytics cuando se hace clic
 */
export function AnalyticsExternalLink({
  category,
  action,
  label,
  value,
  onClick,
  children,
  ...props
}: AnalyticsExternalLinkProps) {
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    // Registrar el evento en Google Analytics
    trackEvent(category, action, label || props.href, value);
    
    // Llamar al manejador de clic original si existe
    onClick && onClick(event);
  };
  
  return (
    <a onClick={handleClick} {...props}>
      {children}
    </a>
  );
}

/**
 * Props para AnalyticsInternalLink
 */
interface AnalyticsInternalLinkProps {
  category: string;     // Categoría del evento para Google Analytics
  action: string;       // Acción del evento para Google Analytics
  label?: string;       // Etiqueta opcional del evento
  value?: number;       // Valor opcional del evento
  to: string;           // Ruta de destino
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void; // Manejador de clic opcional
  className?: string;   // Clase CSS
  children: React.ReactNode; // Contenido del enlace
}

/**
 * Enlace interno (Link de wouter) que registra un evento en Google Analytics cuando se hace clic
 */
export function AnalyticsInternalLink({
  category,
  action,
  label,
  value,
  to,
  onClick,
  children,
  ...props
}: AnalyticsInternalLinkProps) {
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    // Registrar el evento en Google Analytics
    trackEvent(category, action, label || to, value);
    
    // Llamar al manejador de clic original si existe
    onClick && onClick(event);
  };
  
  return (
    <Link to={to} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
}