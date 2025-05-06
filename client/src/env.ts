// Variables de entorno para el cliente
export const env = {
  // ID de Google Analytics (accedemos a través de import.meta.env)
  GOOGLE_ANALYTICS_ID: import.meta.env.VITE_GOOGLE_ANALYTICS_ID || '',
};