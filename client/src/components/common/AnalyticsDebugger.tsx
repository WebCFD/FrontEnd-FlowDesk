import { useEffect, useState } from 'react';
import { useAnalytics } from '../../hooks/useAnalytics';
import { getConfig } from '../../env';
import { ReactGA } from '../../lib/analytics';

/**
 * Componente para mostrar el estado de Google Analytics en modo desarrollo.
 * Este componente solo debe usarse durante el desarrollo para verificar que GA está funcionando.
 */
export function AnalyticsDebugger() {
  const { initialized, loading, error } = useAnalytics(); 
  const [config, setConfig] = useState({ googleAnalyticsId: '' });
  const [lastEvents, setLastEvents] = useState<any[]>([]);
  const [expandEvents, setExpandEvents] = useState(false);

  // Cargar configuración para mostrarla
  useEffect(() => {
    getConfig().googleAnalyticsId && setConfig(getConfig());
  }, []);

  // Interceptar eventos de GA en desarrollo
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || !initialized) {
      return;
    }

    // Función para capturar eventos
    const captureEvent = (event: any) => {
      setLastEvents(prev => {
        const newEvents = [...prev, event];
        // Limitar a los últimos 5 eventos
        return newEvents.slice(-5);
      });
    };

    // Sobrescribir temporalmente la función de evento
    const originalEvent = ReactGA.event;
    ReactGA.event = (params) => {
      captureEvent(params);
      return originalEvent(params);
    };

    // Restaurar función original al desmontar
    return () => {
      ReactGA.event = originalEvent;
    };
  }, [initialized]);

  // Solo mostrar en desarrollo
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black/80 text-white p-3 rounded-lg text-xs font-mono z-50 max-w-xs shadow-lg">
      <div className="mb-2 font-bold border-b pb-1 flex justify-between items-center">
        <span>Analytics Status</span>
        <button 
          onClick={() => setExpandEvents(!expandEvents)}
          className="text-xs text-blue-300 hover:text-blue-200"
        >
          {expandEvents ? 'Hide Events' : 'Show Events'}
        </button>
      </div>
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

        {expandEvents && initialized && (
          <div className="mt-2 border-t pt-2">
            <div className="font-bold mb-1">Recent Events:</div>
            {lastEvents.length === 0 ? (
              <div className="text-gray-400 italic">No events yet</div>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {lastEvents.map((event, i) => (
                  <div key={i} className="text-[10px] bg-gray-800 p-1 rounded">
                    <div className="text-blue-300">{event.category} / {event.action}</div>
                    {event.label && <div className="text-gray-300">Label: {event.label}</div>}
                    {event.value && <div className="text-gray-300">Value: {event.value}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}