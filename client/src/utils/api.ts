// utils/api.ts - Detecta automáticamente el entorno
export const getApiBaseUrl = () => {
  // En development: usar same-origin (puerto 5000 vía Vite/Express unificado)
  if (import.meta.env.DEV) {
    return import.meta.env.VITE_API_BASE_URL || ''; // Same-origin por defecto
  }
  
  // En producción: usar la misma URL base
  return ''; // Relativo al dominio actual
};

export const getVTKUrl = (simulationId: number, filename = 'result') => {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}/api/simulations/${simulationId}/results/${filename}.vtkjs`;
};

// Método robusto para cargar VTK
export const loadVTKFile = async (url: string) => {
  console.log('[VTK] Loading from:', url);
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const contentType = response.headers.get('Content-Type') || '';
    const contentLength = response.headers.get('Content-Length') || '0';
    
    console.log('[VTK] Response:', { 
      contentType, 
      contentLength: parseInt(contentLength),
      url 
    });
    
    // Validar que no sea HTML de error
    if (contentType.includes('text/html')) {
      const text = await response.text();
      throw new Error(`Server returned HTML error page: ${text.substring(0, 200)}`);
    }
    
    // Validar tamaño mínimo
    if (parseInt(contentLength) < 100) {
      throw new Error('File too small, likely an error response');
    }
    
    return url; // URL válida para VTK.js
    
  } catch (error) {
    console.error('[VTK] Load validation failed:', error);
    throw error;
  }
};