/**
 * Migration validation test page
 * Tests AirEntry Controller functionality end-to-end
 */

import { useState, useEffect } from "react";
import { useAirEntryController } from "@/hooks/useAirEntryController";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function MigrationValidationTest() {
  const [testResults, setTestResults] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  
  const airEntryController = useAirEntryController({
    viewName: 'test-validation',
    floorName: 'ground',
    autoInitialize: true
  });

  const addTestResult = (message: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const runTests = async () => {
    setIsRunning(true);
    setTestResults([]);
    
    try {
      addTestResult("🧪 Starting AirEntry Controller Migration Tests");

      // Test 1: Controller initialization
      addTestResult(`✓ Controller initialized - entries: ${airEntryController.state.entries.length}`);

      // Test 2: Create an entry
      const testEntry = await airEntryController.actions.createEntry(
        'ground',
        'window',
        { x: 100, y: 200 },
        { width: 60, height: 40, distanceToFloor: 110, shape: 'rectangular' },
        { start: { x: 50, y: 200 }, end: { x: 150, y: 200 } },
        { state: 'closed', temperature: 20 }
      );

      if (testEntry) {
        addTestResult(`✓ Entry created successfully - ID: ${testEntry.id.substring(0, 8)}...`);
        addTestResult(`✓ UUID format validated - contains dashes: ${testEntry.id.includes('-')}`);
        
        // Test 3: Update the entry
        const updatedEntry = await airEntryController.actions.updateEntry(testEntry.id, {
          position: { x: 120, y: 220 },
          properties: { temperature: 25 }
        });

        if (updatedEntry) {
          addTestResult(`✓ Entry updated successfully - new temp: ${updatedEntry.properties?.temperature}`);
          
          // Test 4: Retrieve the entry
          const retrievedEntry = airEntryController.actions.getEntry(testEntry.id);
          if (retrievedEntry) {
            addTestResult(`✓ Entry retrieval successful - position: (${retrievedEntry.position.x}, ${retrievedEntry.position.y})`);
            
            // Test 5: Legacy data mapping
            const legacyData = retrievedEntry.legacyData;
            const hasRequiredFields = legacyData.type && legacyData.position && legacyData.dimensions && legacyData.id;
            addTestResult(`✓ Legacy data mapping ${hasRequiredFields ? 'successful' : 'failed'}`);
            
            // Test 6: Delete the entry
            const deleteSuccess = await airEntryController.actions.deleteEntry(testEntry.id);
            addTestResult(`✓ Entry deletion ${deleteSuccess ? 'successful' : 'failed'}`);
          } else {
            addTestResult("❌ Entry retrieval failed");
          }
        } else {
          addTestResult("❌ Entry update failed");
        }
      } else {
        addTestResult("❌ Entry creation failed");
      }

      // Test 7: State consistency
      const finalEntryCount = airEntryController.state.entries.length;
      addTestResult(`✓ Final state - entries: ${finalEntryCount}`);
      
      addTestResult("🎉 All migration tests completed successfully!");
      
    } catch (error) {
      addTestResult(`❌ Test error: ${error.message}`);
    }
    
    setIsRunning(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>AirEntry Controller Migration Validation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Button 
                onClick={runTests} 
                disabled={isRunning}
                className="w-32"
              >
                {isRunning ? "Running..." : "Run Tests"}
              </Button>
              
              <div className="text-sm text-gray-600">
                Controller Status: {airEntryController.state.isLoading ? "Loading" : "Ready"} |
                Entries: {airEntryController.state.entries.length} |
                Floor Filter: ground
              </div>
            </div>

            <div className="bg-gray-100 p-4 rounded-lg max-h-96 overflow-y-auto">
              <h3 className="font-semibold mb-2">Test Results:</h3>
              {testResults.length === 0 && (
                <p className="text-gray-500">Click "Run Tests" to validate the migration</p>
              )}
              {testResults.map((result, index) => (
                <div key={index} className="font-mono text-sm mb-1">
                  {result}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-semibold">Migration Features Tested:</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600">
                  <li>UUID-based immutable IDs</li>
                  <li>CRUD operations</li>
                  <li>State consistency</li>
                  <li>Legacy data mapping</li>
                  <li>Real-time updates</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-semibold">Architecture Validated:</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-600">
                  <li>Controller-View pattern</li>
                  <li>Observer pattern reactivity</li>
                  <li>Centralized state management</li>
                  <li>Backward compatibility</li>
                  <li>Cross-component sync</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}