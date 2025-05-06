import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { trackEvent } from '../../lib/analytics';

interface AnalyticsButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  // Propiedades de evento de Google Analytics
  analyticsCategory: string;
  analyticsAction: string;
  analyticsLabel?: string;
  analyticsValue?: number;
  
  // Propiedad para deshabilitar el seguimiento
  disableTracking?: boolean;
  
  // Props estándar de botón shadcn
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

/**
 * Componente de botón que registra eventos en Google Analytics cuando se hace clic
 */
export const AnalyticsButton = forwardRef<HTMLButtonElement, AnalyticsButtonProps>(
  (
    {
      analyticsCategory,
      analyticsAction,
      analyticsLabel,
      analyticsValue,
      disableTracking = false,
      onClick,
      children,
      ...props
    },
    ref
  ) => {
    // Manejador de clic que registra el evento y luego ejecuta el manejador original
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
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
      <Button
        ref={ref}
        onClick={handleClick}
        {...props}
      >
        {children}
      </Button>
    );
  }
);