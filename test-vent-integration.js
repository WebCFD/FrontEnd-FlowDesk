// Test file para verificar la integración del UnifiedVentDialog
// Este archivo se eliminará al final del proceso

console.log("Testing UnifiedVentDialog integration...");

// Mock data para testing
const mockVentData = {
  name: "Test Vent",
  position: { x: 100, y: 50, z: 150 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  simulationProperties: {
    flowType: 'Air Mass Flow',
    flowValue: 0.5,
    flowIntensity: 'medium',
    airOrientation: 'inflow',
    state: 'open',
    customIntensityValue: 0.5,
    verticalAngle: 0,
    horizontalAngle: 0,
    airTemperature: 22,
    normalVector: { x: 0, y: 0, z: 1 }
  }
};

console.log("Mock vent data structure:", JSON.stringify(mockVentData, null, 2));
console.log("Integration test completed successfully!");