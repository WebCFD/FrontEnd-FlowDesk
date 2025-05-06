import { useCallback } from 'react';
import { trackEvent } from '../lib/analytics';

interface TrackEventOptions {
  category: string;
  action: string;
  label?: string;
  value?: number;
}

/**
 * Hook para crear fácilmente funciones que registren eventos en Google Analytics
 * 
 * @param options Opciones para el evento
 * @returns Una función que registra el evento cuando se llama
 */
export function useTrackEvent(options: TrackEventOptions) {
  const { category, action, label, value } = options;
  
  return useCallback(() => {
    trackEvent(category, action, label, value);
  }, [category, action, label, value]);
}

/**
 * Hook para crear fácilmente un manejador de eventos de click que registre en Google Analytics
 * 
 * @param options Opciones para el evento
 * @returns Una función que se puede usar como onClick handler
 */
export function useTrackClick(options: TrackEventOptions) {
  const trackClickEvent = useTrackEvent(options);
  
  return useCallback((e: React.MouseEvent<HTMLElement>) => {
    // Ejecuta el seguimiento de eventos
    trackClickEvent();
    
    // No detiene la propagación del evento, por lo que otros controladores seguirán funcionando
  }, [trackClickEvent]);
}

/**
 * Función para crear un manejador de eventos que registre y luego ejecute otro manejador
 * 
 * @param options Opciones para el evento
 * @param handler El manejador original que se ejecutará después del seguimiento
 * @returns Una función que registra el evento y luego ejecuta el manejador original
 */
export function withTracking<T extends (...args: any[]) => any>(
  options: TrackEventOptions,
  handler?: T
): (...args: Parameters<T>) => ReturnType<T> | undefined {
  return (...args: Parameters<T>) => {
    // Registra el evento
    trackEvent(options.category, options.action, options.label, options.value);
    
    // Ejecuta el manejador original si existe
    if (handler) {
      return handler(...args);
    }
    return undefined;
  };
}