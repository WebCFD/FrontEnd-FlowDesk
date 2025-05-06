import { useEffect, useState } from 'react';
import { useAnalytics } from '../../hooks/useAnalytics';
import { getConfig } from '../../env';

/**
 * Componente para mostrar el estado de Google Analytics en modo desarrollo.
 * Este componente solo debe usarse durante el desarrollo para verificar que GA está funcionando.
 */
export function AnalyticsDebugger() {
  const { initialized, loading, error } = useAnalytics(); 
  const [config, setConfig] = useState({ googleAnalyticsId: '' });

  // Cargar configuración para mostrarla
  useEffect(() => {
    getConfig().googleAnalyticsId && setConfig(getConfig());
  }, []);

  // Solo mostrar en desarrollo
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black/80 text-white p-3 rounded-lg text-xs font-mono z-50 max-w-xs shadow-lg">
      <div className="mb-2 font-bold border-b pb-1">Analytics Status</div>
      <div className="space-y-1">
        <div className="flex justify-between">
          <span>ID:</span>
          <span className={config.googleAnalyticsId ? 'text-green-400' : 'text-red-400'}>
            {config.googleAnalyticsId 
              ? `${config.googleAnalyticsId.substring(0, 3)}...` 
              : 'Missing'}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Status:</span>
          <span className={initialized ? 'text-green-400' : loading ? 'text-yellow-400' : 'text-red-400'}>
            {initialized ? 'Initialized' : loading ? 'Loading...' : 'Not Initialized'}
          </span>
        </div>
        {error && (
          <div className="flex justify-between">
            <span>Error:</span>
            <span className="text-red-400 truncate">{error.message}</span>
          </div>
        )}
      </div>
    </div>
  );
}