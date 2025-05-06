import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { trackEvent } from '@/lib/analytics';

/**
 * Props para el componente AnalyticsButton
 */
interface AnalyticsButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  category: string;        // Categoría del evento para Google Analytics
  action: string;          // Acción del evento para Google Analytics
  label?: string;          // Etiqueta opcional del evento
  value?: number;          // Valor opcional del evento
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'; // Variante del botón
  size?: 'default' | 'sm' | 'lg' | 'icon'; // Tamaño del botón
}

/**
 * Componente Button que registra un evento en Google Analytics cuando se hace clic
 */
export const AnalyticsButton = forwardRef<HTMLButtonElement, AnalyticsButtonProps>(
  ({ category, action, label, value, onClick, ...props }, ref) => {
    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      // Registrar el evento en Google Analytics
      trackEvent(category, action, label, value);
      
      // Llamar al manejador de clic original si existe
      onClick && onClick(event);
    };
    
    return <Button ref={ref} onClick={handleClick} {...props} />;
  }
);

AnalyticsButton.displayName = 'AnalyticsButton';