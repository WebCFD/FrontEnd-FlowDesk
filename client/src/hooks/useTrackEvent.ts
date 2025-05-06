import { useCallback } from 'react';
import { trackEvent } from '../lib/analytics';

/**
 * Hook personalizado para rastrear eventos de analytics
 * Facilita el rastreo de eventos en componentes funcionales
 * 
 * @returns Una función para rastrear eventos
 */
export function useTrackEvent() {
  /**
   * Registra un evento en Google Analytics
   * @param category Categoría del evento
   * @param action Acción del evento
   * @param label Etiqueta opcional
   * @param value Valor numérico opcional
   */
  const track = useCallback((
    category: string,
    action: string,
    label?: string,
    value?: number
  ) => {
    trackEvent(category, action, label, value);
  }, []);

  return track;
}