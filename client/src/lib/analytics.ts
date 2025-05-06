import ReactGA from 'react-ga4';

// Se inicializará con el ID de tracking cuando se llame a initialize
let isInitialized = false;

/**
 * Inicializa Google Analytics
 * @param measurementId - El ID de medición de Google Analytics (G-XXXXXXXXXX)
 */
export const initializeAnalytics = (measurementId: string): void => {
  // Solo inicializa una vez
  if (isInitialized) return;

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
    console.warn('Google Analytics no está inicializado. La vista de página no será registrada.');
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
  if (!isInitialized) {
    console.warn('Google Analytics no está inicializado. El evento no será registrado.');
    return;
  }

  ReactGA.event({
    category,
    action,
    label,
    value,
  });
};

// Exportamos el objeto ReactGA para casos de uso avanzados si es necesario
export { ReactGA };