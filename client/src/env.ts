// Interfaz para la configuración
interface Config {
  googleAnalyticsId: string;
}

// Configuración por defecto
let config: Config = {
  googleAnalyticsId: '',
};

// Función para cargar la configuración desde el servidor
export async function loadConfig(): Promise<Config> {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) {
      throw new Error('Error al cargar la configuración');
    }
    config = await response.json();
    return config;
  } catch (error) {
    console.error('Error al cargar la configuración:', error);
    return config;
  }
}

// Función para obtener la configuración actual
export function getConfig(): Config {
  return config;
}