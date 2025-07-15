/**
 * Canvas3D-New.tsx - Modern Canvas3D using AirEntryController
 * 
 * This is a simplified, modern version of Canvas3D that demonstrates:
 * - Clean separation of concerns using AirEntryController
 * - Reactive state management without complex prop drilling
 * - Simplified AirEntry handling with stable IDs
 * - Real-time synchronization without timing issues
 * - No state fragmentation or shared reference bugs
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";
import { makeTextSprite } from "@/lib/three-utils";
import AirEntryDialog from "./AirEntryDialog";
import { ViewDirection } from "./Toolbar3D";
import { useAirEntryController, useAirEntryEditor } from "../../hooks/useAirEntryController";
import { ControlledAirEntry } from "../../lib/controllers/AirEntryController";

// Simplified interfaces - AirEntry data comes from controller
interface Point {
  x: number;
  y: number;
}

interface Line {
  start: Point;
  end: Point;
}

interface FloorData {
  lines: Line[];
  hasClosedContour: boolean;
  name: string;
}

interface Canvas3DNewProps {
  floors: Record<string, FloorData>;
  currentFloor: string;
  ceilingHeight?: number;
  floorDeckThickness?: number;
  wallTransparency: number;
  isMeasureMode?: boolean;
  isEraserMode?: boolean;
  presentationMode?: boolean;
  allowAirEntryEditing?: boolean;
  lightingIntensity?: number;
  floorParameters?: Record<string, { ceilingHeight: number; floorDeck: number }>;
}

// Constants
const CANVAS_CONFIG = {
  centerX: 400,
  centerY: 300,
};
const PIXELS_TO_CM = 0.1;

const transform2DTo3D = (point: Point, height: number = 0): THREE.Vector3 => {
  const relativeX = point.x - CANVAS_CONFIG.centerX;
  const relativeY = CANVAS_CONFIG.centerY - point.y;

  return new THREE.Vector3(
    relativeX * PIXELS_TO_CM,
    relativeY * PIXELS_TO_CM,
    height,
  );
};

export default function Canvas3DNew({
  floors,
  currentFloor,
  ceilingHeight = 250,
  floorDeckThickness = 20,
  wallTransparency = 0.7,
  presentationMode = false,
  allowAirEntryEditing = true,
  lightingIntensity = 0.8,
  floorParameters = {}
}: Canvas3DNewProps) {
  
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const controlsRef = useRef<TrackballControls>();
  
  // AirEntry Controller Integration
  const { state: airEntryState, actions: airEntryActions } = useAirEntryController({
    viewName: 'canvas3d',
    floorName: currentFloor,
    autoInitialize: true
  });
  
  const {
    editingEntry,
    canEdit,
    startEdit,
    endEdit,
    updateEntry,
    isEditing
  } = useAirEntryEditor('canvas3d');

  // Local state
  const [isInitialized, setIsInitialized] = useState(false);

  // ==================== SCENE INITIALIZATION ====================

  const initializeScene = useCallback(() => {
    if (!containerRef.current || isInitialized) return;

    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;

    // Create camera
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      2000
    );
    camera.position.set(100, 100, 100);
    cameraRef.current = camera;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Create controls
    const controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 2.0;
    controls.zoomSpeed = 1.5;
    controls.panSpeed = 1.0;
    controlsRef.current = controls;

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0x404040, lightingIntensity * 0.4);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, lightingIntensity * 0.8);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Add event listeners
    setupEventListeners();

    setIsInitialized(true);
    console.log('Canvas3D-New: Scene initialized');
  }, [isInitialized, lightingIntensity]);

  // ==================== EVENT HANDLING ====================

  const setupEventListeners = useCallback(() => {
    if (!rendererRef.current) return;

    const handleDoubleClick = (event: MouseEvent) => {
      if (presentationMode && !allowAirEntryEditing) return;

      const mouse = new THREE.Vector2();
      const rect = rendererRef.current!.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current!);

      // Check for AirEntry intersection
      const airEntryMeshes = sceneRef.current!.children.filter(
        child => child.userData.type === 'airEntry'
      );

      const intersects = raycaster.intersectObjects(airEntryMeshes);
      if (intersects.length > 0) {
        const mesh = intersects[0].object;
        const entryId = mesh.userData.entryId;
        
        if (entryId) {
          handleAirEntryEdit(entryId);
        }
      }
    };

    rendererRef.current.domElement.addEventListener('dblclick', handleDoubleClick);

    return () => {
      if (rendererRef.current) {
        rendererRef.current.domElement.removeEventListener('dblclick', handleDoubleClick);
      }
    };
  }, [presentationMode, allowAirEntryEditing]);

  // ==================== AIRENTRY HANDLING ====================

  const handleAirEntryEdit = useCallback(async (entryId: string) => {
    const entry = airEntryActions.getEntry(entryId);
    if (!entry || !canEdit(entryId)) {
      console.warn('Cannot edit entry:', entryId);
      return;
    }

    const success = await startEdit(entry);
    if (!success) {
      console.warn('Failed to start edit session for:', entryId);
    }
  }, [airEntryActions, canEdit, startEdit]);

  const handleAirEntryUpdate = useCallback(async (updates: any) => {
    if (!editingEntry) return;

    // Convert dialog format to controller format
    const controllerUpdates = {
      position: updates.position ? {
        x: updates.position.x,
        y: updates.position.y,
        z: updates.position.z || editingEntry.position.z
      } : undefined,
      dimensions: updates.dimensions ? {
        width: updates.dimensions.width,
        height: updates.dimensions.height,
        distanceToFloor: updates.dimensions.distanceToFloor,
        shape: updates.dimensions.shape
      } : undefined,
      properties: updates.properties,
      wallPosition: updates.wallPosition
    };

    // Filter out undefined values
    const filteredUpdates = Object.fromEntries(
      Object.entries(controllerUpdates).filter(([_, value]) => value !== undefined)
    );

    const updatedEntry = await updateEntry(filteredUpdates);
    
    if (updatedEntry) {
      // Update 3D mesh immediately for visual feedback
      updateAirEntryMesh(updatedEntry);
      
      // Propagate update to other views
      airEntryActions.propagateUpdate(
        editingEntry.id,
        'complete',
        filteredUpdates,
        true // immediate
      );
    }
  }, [editingEntry, updateEntry, airEntryActions]);

  // ==================== 3D SCENE MANAGEMENT ====================

  const updateAirEntryMesh = useCallback((entry: ControlledAirEntry) => {
    if (!sceneRef.current) return;

    // Find existing mesh
    const existingMesh = sceneRef.current.children.find(
      child => child.userData.entryId === entry.id
    );

    if (existingMesh) {
      // Update position
      const worldPos = transform2DTo3D(entry.position, entry.dimensions.distanceToFloor || 0);
      existingMesh.position.copy(worldPos);

      // Update scale
      existingMesh.scale.set(
        entry.dimensions.width * PIXELS_TO_CM,
        entry.dimensions.height * PIXELS_TO_CM,
        1
      );

      // Update userData
      existingMesh.userData = {
        ...existingMesh.userData,
        entry: { ...entry }
      };
    }
  }, []);

  const createAirEntryMesh = useCallback((entry: ControlledAirEntry): THREE.Mesh => {
    const geometry = new THREE.PlaneGeometry(1, 1);
    let material: THREE.Material;

    // Different materials for different types
    switch (entry.type) {
      case 'window':
        material = new THREE.MeshPhongMaterial({ 
          color: 0x87CEEB, 
          transparent: true, 
          opacity: 0.7 
        });
        break;
      case 'door':
        material = new THREE.MeshPhongMaterial({ 
          color: 0x8B4513, 
          transparent: true, 
          opacity: 0.8 
        });
        break;
      case 'vent':
        material = new THREE.MeshPhongMaterial({ 
          color: 0x708090, 
          transparent: true, 
          opacity: 0.6 
        });
        break;
      default:
        material = new THREE.MeshPhongMaterial({ color: 0x888888 });
    }

    const mesh = new THREE.Mesh(geometry, material);
    
    // Position
    const worldPos = transform2DTo3D(entry.position, entry.dimensions.distanceToFloor || 0);
    mesh.position.copy(worldPos);
    
    // Scale
    mesh.scale.set(
      entry.dimensions.width * PIXELS_TO_CM,
      entry.dimensions.height * PIXELS_TO_CM,
      1
    );

    // UserData for identification
    mesh.userData = {
      type: 'airEntry',
      entryId: entry.id,
      entry: { ...entry }
    };

    return mesh;
  }, []);

  const rebuildScene = useCallback(() => {
    if (!sceneRef.current || airEntryState.isLoading) return;

    // Clear existing AirEntry meshes
    const airEntryMeshes = sceneRef.current.children.filter(
      child => child.userData.type === 'airEntry'
    );
    airEntryMeshes.forEach(mesh => sceneRef.current!.remove(mesh));

    // Create floor geometry (simplified for demo)
    const floorData = floors[currentFloor];
    if (floorData && floorData.lines.length > 0) {
      createFloorGeometry(floorData);
    }

    // Add AirEntry meshes from controller
    airEntryState.entries.forEach(entry => {
      const mesh = createAirEntryMesh(entry);
      sceneRef.current!.add(mesh);
    });

    console.log(`Canvas3D-New: Scene rebuilt with ${airEntryState.entries.length} AirEntries`);
  }, [floors, currentFloor, airEntryState.entries, airEntryState.isLoading, createAirEntryMesh]);

  const createFloorGeometry = useCallback((floorData: FloorData) => {
    if (!sceneRef.current) return;

    // Simple floor plane (for demo - you can enhance this)
    const geometry = new THREE.PlaneGeometry(1000, 1000);
    const material = new THREE.MeshPhongMaterial({ 
      color: 0xf0f0f0, 
      transparent: true, 
      opacity: 0.3 
    });
    const floor = new THREE.Mesh(geometry, material);
    floor.rotation.x = -Math.PI / 2;
    floor.userData.type = 'floor';
    
    // Remove existing floor
    const existingFloor = sceneRef.current.children.find(
      child => child.userData.type === 'floor'
    );
    if (existingFloor) {
      sceneRef.current.remove(existingFloor);
    }
    
    sceneRef.current.add(floor);
  }, []);

  // ==================== ANIMATION LOOP ====================

  const animate = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !controlsRef.current) {
      return;
    }

    controlsRef.current.update();
    rendererRef.current.render(sceneRef.current, cameraRef.current);
    requestAnimationFrame(animate);
  }, []);

  // ==================== EFFECTS ====================

  // Initialize scene
  useEffect(() => {
    initializeScene();
    return () => {
      // Cleanup
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
    };
  }, [initializeScene]);

  // Start animation loop
  useEffect(() => {
    if (isInitialized) {
      animate();
    }
  }, [isInitialized, animate]);

  // Rebuild scene when data changes
  useEffect(() => {
    if (isInitialized) {
      rebuildScene();
    }
  }, [isInitialized, rebuildScene]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ==================== RENDER ====================

  return (
    <div className="relative w-full h-full">
      {/* 3D Canvas Container */}
      <div 
        ref={containerRef} 
        className="w-full h-full"
        style={{ minHeight: '400px' }}
      />

      {/* Loading State */}
      {airEntryState.isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-50">
          <div className="text-lg">Loading AirEntries...</div>
        </div>
      )}

      {/* Error State */}
      {airEntryState.error && (
        <div className="absolute top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{airEntryState.error}</span>
        </div>
      )}

      {/* Stats Display (Debug) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute bottom-4 left-4 bg-black bg-opacity-70 text-white p-2 rounded text-sm">
          <div>Entries: {airEntryState.stats.entriesForFloor}</div>
          <div>Editing: {isEditing ? editingEntry?.id : 'None'}</div>
          <div>Editor: {airEntryState.syncState.activeEditor || 'None'}</div>
        </div>
      )}

      {/* AirEntry Dialog */}
      {editingEntry && (
        <AirEntryDialog
          isOpen={true}
          onOpenChange={(open) => {
            if (!open) {
              endEdit();
            }
          }}
          airEntry={{
            id: editingEntry.id,
            type: editingEntry.type,
            position: editingEntry.position,
            dimensions: editingEntry.dimensions,
            properties: editingEntry.properties,
            line: editingEntry.line,
            wallPosition: editingEntry.wallPosition
          }}
          onConfirm={handleAirEntryUpdate}
          floorName={editingEntry.floorName}
          initialValues={{
            position: editingEntry.position,
            dimensions: editingEntry.dimensions,
            properties: editingEntry.properties,
            wallPosition: editingEntry.wallPosition || 50
          }}
        />
      )}
    </div>
  );
}