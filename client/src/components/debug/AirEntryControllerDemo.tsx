/**
 * AirEntryControllerDemo - Demo component to test the new AirEntry architecture
 * 
 * This component demonstrates:
 * - AirEntryController CRUD operations
 * - Real-time synchronization between multiple views
 * - Stable ID generation and management
 * - Conflict resolution during simultaneous edits
 * - Migration from legacy store data
 */

import { useState, useEffect } from 'react';
import { useAirEntryController, useAirEntries, useAirEntryEditor } from '../../hooks/useAirEntryController';
import { ControlledAirEntry } from '../../lib/controllers/AirEntryController';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { storeAdapter } from '../../lib/controllers/StoreAdapter';

interface AirEntryControllerDemoProps {
  currentFloor?: string;
}

export default function AirEntryControllerDemo({ 
  currentFloor = 'ground' 
}: AirEntryControllerDemoProps) {
  
  // Multiple view controllers to test synchronization
  const view1Controller = useAirEntryController({
    viewName: 'demo_view1',
    floorName: currentFloor,
    autoInitialize: true
  });

  const view2Controller = useAirEntryController({
    viewName: 'demo_view2',
    floorName: currentFloor,
    autoInitialize: true
  });

  // Editor for testing edit sessions
  const editor = useAirEntryEditor('demo_editor');

  // Read-only view for testing data access
  const { entries: readOnlyEntries, isLoading: readOnlyLoading } = useAirEntries(currentFloor);

  // Local state for demo
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);
  const [demoStats, setDemoStats] = useState<any>(null);

  // Update stats periodically
  useEffect(() => {
    const updateStats = () => {
      setDemoStats(storeAdapter.getStats());
    };

    updateStats();
    const interval = setInterval(updateStats, 2000);
    return () => clearInterval(interval);
  }, []);

  // ==================== DEMO ACTIONS ====================

  const createTestEntry = async (type: 'window' | 'door' | 'vent') => {
    const randomX = 100 + Math.random() * 200;
    const randomY = 100 + Math.random() * 200;

    const entry = await view1Controller.actions.createEntry(
      currentFloor,
      type,
      { x: randomX, y: randomY, z: 0 },
      { width: 100, height: 80, distanceToFloor: 0 },
      { start: { x: randomX - 50, y: randomY }, end: { x: randomX + 50, y: randomY } },
      { 
        elementState: 'open',
        airTemperature: 20 + Math.random() * 10,
        airDirection: Math.random() > 0.5 ? 'inflow' : 'outflow'
      }
    );

    if (entry) {
      console.log('Demo: Created entry', entry.id);
    }
  };

  const updateTestEntry = async (entryId: string) => {
    const randomTemp = 15 + Math.random() * 20;
    const randomAngle = Math.random() * 90;

    const updated = await view2Controller.actions.updateEntry(entryId, {
      properties: {
        airTemperature: randomTemp,
        verticalAngle: randomAngle
      }
    });

    if (updated) {
      console.log('Demo: Updated entry', entryId, 'with temp', randomTemp);
    }
  };

  const deleteTestEntry = async (entryId: string) => {
    const success = await view1Controller.actions.deleteEntry(entryId);
    if (success) {
      console.log('Demo: Deleted entry', entryId);
      setSelectedEntry(null);
    }
  };

  const testEditSession = async (entry: ControlledAirEntry) => {
    const success = await editor.startEdit(entry);
    if (success) {
      console.log('Demo: Started edit session for', entry.id);
      setSelectedEntry(entry.id);
    } else {
      console.log('Demo: Failed to start edit session for', entry.id);
    }
  };

  const testPropagation = (entryId: string) => {
    view1Controller.actions.propagateUpdate(
      entryId,
      'properties',
      {
        properties: {
          airTemperature: 25,
          flowIntensity: 'high'
        }
      },
      true // immediate
    );
    console.log('Demo: Propagated update for', entryId);
  };

  const forceResync = async () => {
    await view1Controller.actions.forceResync();
    console.log('Demo: Forced resync completed');
  };

  // ==================== RENDER HELPERS ====================

  const renderEntry = (entry: ControlledAirEntry, source: string) => (
    <Card key={`${source}-${entry.id}`} className="mb-4">
      <CardHeader>
        <CardTitle className="text-sm flex items-center justify-between">
          <span>{entry.id}</span>
          <Badge variant={entry.type === 'window' ? 'default' : entry.type === 'door' ? 'secondary' : 'outline'}>
            {entry.type}
          </Badge>
        </CardTitle>
        <CardDescription>
          Floor: {entry.floorName} | Created: {new Date(entry.createdAt).toLocaleTimeString()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-xs space-y-1">
          <div>Position: ({entry.position.x.toFixed(1)}, {entry.position.y.toFixed(1)})</div>
          <div>Dimensions: {entry.dimensions.width}×{entry.dimensions.height}</div>
          {entry.properties?.airTemperature && (
            <div>Temperature: {entry.properties.airTemperature.toFixed(1)}°C</div>
          )}
          {entry.wallPosition && (
            <div>Wall Position: {entry.wallPosition.toFixed(1)}%</div>
          )}
          <div>Modified: {new Date(entry.lastModified).toLocaleTimeString()}</div>
        </div>
        
        <div className="flex gap-2 mt-3">
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => updateTestEntry(entry.id)}
          >
            Update
          </Button>
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => testEditSession(entry)}
            disabled={!editor.canEdit(entry.id)}
          >
            Edit
          </Button>
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => testPropagation(entry.id)}
          >
            Propagate
          </Button>
          <Button 
            size="sm" 
            variant="destructive"
            onClick={() => deleteTestEntry(entry.id)}
          >
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  // ==================== MAIN RENDER ====================

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">AirEntry Controller Demo</h1>
      
      {/* Stats Panel */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>System Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="font-semibold">View 1 Entries</div>
              <div>{view1Controller.state.stats.entriesForFloor}</div>
            </div>
            <div>
              <div className="font-semibold">View 2 Entries</div>
              <div>{view2Controller.state.stats.entriesForFloor}</div>
            </div>
            <div>
              <div className="font-semibold">Read-Only Entries</div>
              <div>{readOnlyEntries.length}</div>
            </div>
            <div>
              <div className="font-semibold">Total Entries</div>
              <div>{view1Controller.state.stats.totalEntries}</div>
            </div>
            <div>
              <div className="font-semibold">Active Editor</div>
              <div>{view1Controller.state.syncState.activeEditor || 'None'}</div>
            </div>
            <div>
              <div className="font-semibold">Editing Entry</div>
              <div>{view1Controller.state.syncState.editingEntryId || 'None'}</div>
            </div>
            <div>
              <div className="font-semibold">Isolation Active</div>
              <div>{view1Controller.state.syncState.isolationActive ? 'Yes' : 'No'}</div>
            </div>
            <div>
              <div className="font-semibold">Store Sync</div>
              <div className={demoStats?.isInitialized ? 'text-green-600' : 'text-red-600'}>
                {demoStats?.isInitialized ? 'Ready' : 'Initializing'}
              </div>
            </div>
          </div>
          
          {demoStats && (
            <div className="mt-4 text-xs">
              <div>Controller Entries: {demoStats.controllerEntries}</div>
              <div>Store Entries: {demoStats.storeEntries}</div>
              <div>Syncing: {demoStats.isSyncing ? 'Yes' : 'No'}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Panel */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Test Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => createTestEntry('window')} variant="outline">
              Create Window
            </Button>
            <Button onClick={() => createTestEntry('door')} variant="outline">
              Create Door
            </Button>
            <Button onClick={() => createTestEntry('vent')} variant="outline">
              Create Vent
            </Button>
            <Separator orientation="vertical" className="h-8" />
            <Button onClick={forceResync} variant="secondary">
              Force Resync
            </Button>
            <Button 
              onClick={() => editor.endEdit()} 
              variant="secondary"
              disabled={!editor.isEditing}
            >
              End Edit Session
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {(view1Controller.state.error || view2Controller.state.error) && (
        <Card className="mb-6 border-red-200">
          <CardHeader>
            <CardTitle className="text-red-700">Errors</CardTitle>
          </CardHeader>
          <CardContent>
            {view1Controller.state.error && (
              <div className="text-red-600 text-sm">View 1: {view1Controller.state.error}</div>
            )}
            {view2Controller.state.error && (
              <div className="text-red-600 text-sm">View 2: {view2Controller.state.error}</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Data Views */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* View 1 */}
        <div>
          <h3 className="text-lg font-semibold mb-4">View 1 Controller</h3>
          {view1Controller.state.isLoading ? (
            <div className="text-gray-500">Loading...</div>
          ) : (
            view1Controller.state.entries.map(entry => renderEntry(entry, 'view1'))
          )}
        </div>

        {/* View 2 */}
        <div>
          <h3 className="text-lg font-semibold mb-4">View 2 Controller</h3>
          {view2Controller.state.isLoading ? (
            <div className="text-gray-500">Loading...</div>
          ) : (
            view2Controller.state.entries.map(entry => renderEntry(entry, 'view2'))
          )}
        </div>

        {/* Read-Only View */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Read-Only View</h3>
          {readOnlyLoading ? (
            <div className="text-gray-500">Loading...</div>
          ) : (
            readOnlyEntries.map(entry => renderEntry(entry, 'readonly'))
          )}
        </div>
      </div>

      {/* Editor Status */}
      {editor.isEditing && editor.editingEntry && (
        <Card className="mt-6 border-blue-200">
          <CardHeader>
            <CardTitle className="text-blue-700">Active Edit Session</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              <div>Editing: {editor.editingEntry.id}</div>
              <div>Type: {editor.editingEntry.type}</div>
              <div>Floor: {editor.editingEntry.floorName}</div>
            </div>
            <Button 
              className="mt-3" 
              variant="outline" 
              onClick={() => editor.endEdit()}
            >
              End Edit
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}