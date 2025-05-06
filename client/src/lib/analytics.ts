import ReactGA from 'react-ga4';
import { getConfig } from '../env';

// Se inicializará con el ID de tracking cuando se llame a initialize
let isInitialized = false;

/**
 * Inicializa Google Analytics
 * @param forceMeasurementId - ID de medición opcional para forzar su uso en lugar del de la configuración
 */
export const initializeAnalytics = (forceMeasurementId?: string): void => {
  // Solo inicializa una vez
  if (isInitialized) return;
  
  const measurementId = forceMeasurementId || getConfig().googleAnalyticsId;
  
  // No inicializa si no hay ID
  if (!measurementId) {
    console.warn('No Google Analytics ID provided. Analytics not initialized.');
    return;
  }

  ReactGA.initialize(measurementId);
  isInitialized = true;
  
  console.log('Google Analytics initialized with ID:', measurementId);
};

/**
 * Registra una vista de página
 * @param path - La ruta de la página (p. ej., '/dashboard')
 * @param title - El título de la página
 */
export const trackPageView = (path: string, title?: string): void => {
  if (!isInitialized) {
    // Modo silencioso, no mostramos warnings ya que PageViewTracker manejará la espera
    return;
  }

  ReactGA.send({ 
    hitType: "pageview", 
    page: path,
    title: title
  });
};

/**
 * Registra un evento personalizado
 * @param category - Categoría del evento
 * @param action - Acción realizada
 * @param label - Etiqueta opcional 
 * @param value - Valor numérico opcional
 */
export const trackEvent = (
  category: string,
  action: string,
  label?: string,
  value?: number
): void => {
  // Siempre logueamos en desarrollo para debugging
  if (process.env.NODE_ENV === 'development') {
    console.debug('📊 Analytics Event:', { 
      category, 
      action, 
      label, 
      value,
      status: isInitialized ? 'sent' : 'pending' 
    });
  }
  
  // Si no está inicializado, no enviamos el evento a GA
  if (!isInitialized) {
    return;
  }

  // Envía el evento a Google Analytics
  ReactGA.event({
    category,
    action,
    label,
    value,
  });
};

// Exportamos el objeto ReactGA para casos de uso avanzados si es necesario
export { ReactGA };