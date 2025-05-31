import { useRef, useEffect, useState } from "react";
import Canvas3D from "./Canvas3D";
import * as THREE from "three";
import { TextureGenerator } from "./textureGenerator";

interface Point {
  x: number;
  y: number;
}

interface Line {
  start: Point;
  end: Point;
}

interface AirEntry {
  type: "window" | "door" | "vent";
  position: Point;
  dimensions: {
    width: number;
    height: number;
    distanceToFloor?: number;
  };
  line: Line;
}

interface FloorData {
  lines: Line[];
  airEntries: AirEntry[];
  hasClosedContour: boolean;
  name: string;
  stairPolygons?: any[];
}

interface FurnitureItem {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
}

interface RoomSketchProProps {
  width?: number;
  height?: number;
  instanceId?: string;
  lines?: Line[];
  airEntries?: AirEntry[];
  roomHeight?: number;
  onFurnitureAdd?: (item: FurnitureItem) => void;
  wallTransparency: number;
  onWallTransparencyChange: (value: number) => void;
  currentFloor?: string;
  floors?: Record<string, FloorData>;
  onComponentMount?: () => void;
  materialTheme?: "modern" | "classic" | "industrial";
}

/**
 * RoomSketchPro - Nueva implementación como wrapper de Canvas3D
 * 
 * Usa Canvas3D internamente con presentationMode=true para eliminar
 * duplicación de código y garantizar geometría idéntica
 */
export function RoomSketchPro({
  width = 800,
  height = 600,
  instanceId = "default",
  lines = [],
  airEntries = [],
  roomHeight = 250, // cm
  onFurnitureAdd,
  wallTransparency,
  onWallTransparencyChange,
  currentFloor = "ground",
  floors,
  onComponentMount,
  materialTheme = "modern"
}: RoomSketchProProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedTheme, setSelectedTheme] = useState(materialTheme);
  const canvas3DRef = useRef<any>(null);
  const appliedTexturesRef = useRef<boolean>(false);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const texturesRef = useRef<{
    brick?: THREE.Texture;
    wood?: THREE.Texture;
    metal?: THREE.Texture;
  }>({});

  // Convert props to Canvas3D format
  const canvas3DFloors = floors || {
    [currentFloor]: {
      name: currentFloor,
      lines: lines,
      airEntries: airEntries,
      hasClosedContour: lines.length > 2
    }
  };

  // Convert roomHeight from cm to Canvas3D format (which expects cm)
  const ceilingHeightCm = roomHeight;

  // Create procedural textures with perfect horizontal orientation
  const createBrickTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Background mortar color
    ctx.fillStyle = '#e0d8d0';
    ctx.fillRect(0, 0, 256, 128);

    // Dimensiones de ladrillos más pequeños para mayor repetición
    const brickWidth = 40;
    const brickHeight = 12;
    const mortarThickness = 2;

    // Color uniforme de ladrillo
    const brickColor = { r: 155, g: 85, b: 70 };

    // Crear hileras horizontales perfectas
    let yPos = mortarThickness;
    let rowIndex = 0;
    
    while (yPos + brickHeight <= 128) {
      // Desplazamiento alternado para cada hilera
      const offsetX = (rowIndex % 2) * (brickWidth / 2);
      
      let xPos = offsetX + mortarThickness;
      
      // Dibujar ladrillos en esta hilera
      while (xPos + brickWidth <= 256 + offsetX) {
        // Solo dibujar si el ladrillo está dentro del canvas
        if (xPos >= 0 && xPos + brickWidth <= 256) {
          // Color base con mínima variación
          const variation = 5;
          const red = brickColor.r + (Math.random() - 0.5) * variation;
          const green = brickColor.g + (Math.random() - 0.5) * variation;
          const blue = brickColor.b + (Math.random() - 0.5) * variation;
          
          // Dibujar el ladrillo
          ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
          ctx.fillRect(xPos, yPos, brickWidth - mortarThickness, brickHeight - mortarThickness);
          
          // Sombra sutil en la parte inferior
          ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
          ctx.fillRect(xPos, yPos + brickHeight - mortarThickness - 1, brickWidth - mortarThickness, 1);
        }
        
        xPos += brickWidth;
      }
      
      yPos += brickHeight;
      rowIndex++;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, 3); // Repetir el patrón más veces
    return texture;
  };

  const createWoodTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Wood base color
    ctx.fillStyle = '#8b4513';
    ctx.fillRect(0, 0, 256, 256);

    // Wood grain lines
    for (let i = 0; i < 20; i++) {
      const y = i * 12;
      ctx.strokeStyle = `rgba(139, 69, 19, ${0.3 + Math.random() * 0.4})`;
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      
      // Create wavy grain lines
      for (let x = 0; x < 256; x += 10) {
        const waveY = y + Math.sin(x * 0.02) * 3;
        ctx.lineTo(x, waveY);
      }
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    return texture;
  };

  const createMetalTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Metal base color
    ctx.fillStyle = '#708090';
    ctx.fillRect(0, 0, 256, 256);

    // Add brushed metal effect
    for (let i = 0; i < 100; i++) {
      const alpha = 0.1 + Math.random() * 0.2;
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.random() * 256, 0);
      ctx.lineTo(Math.random() * 256, 256);
      ctx.stroke();
    }

    // Add darker lines for contrast
    for (let i = 0; i < 50; i++) {
      const alpha = 0.1 + Math.random() * 0.2;
      ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.random() * 256, 0);
      ctx.lineTo(Math.random() * 256, 256);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    return texture;
  };

  // Callback when Canvas3D scene is ready
  const handleSceneReady = (scene: THREE.Scene, renderer: THREE.WebGLRenderer, camera: THREE.Camera) => {
    console.log('RSP: Scene ready, storing references');
    sceneRef.current = scene;
    rendererRef.current = renderer;
    cameraRef.current = camera;
    
    // Wait for walls to be generated before applying textures
    // Use multiple attempts with increasing delays
    const attempts = [1000, 2000, 3000];
    
    const tryApplyTextures = (attemptIndex = 0) => {
      console.log(`RSP: Attempt ${attemptIndex + 1} to find walls after ${attempts[attemptIndex]}ms`);
      
      // Check if walls exist
      let wallCount = 0;
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh && object.userData?.type === 'wall') {
          wallCount++;
        }
      });
      
      if (wallCount > 0 || attemptIndex >= attempts.length - 1) {
        console.log(`RSP: Found ${wallCount} walls, applying textures`);
        applyThemeTextures();
      } else if (attemptIndex < attempts.length - 1) {
        setTimeout(() => tryApplyTextures(attemptIndex + 1), attempts[attemptIndex + 1] - attempts[attemptIndex]);
      }
    };
    
    setTimeout(() => tryApplyTextures(), attempts[0]);
  };

  // Function to apply textures to Canvas3D scene materials
  const applyThemeTextures = () => {
    if (!sceneRef.current) {
      console.log('RSP: Scene not ready yet, skipping texture application');
      return;
    }

    console.log('RSP: Applying textures for theme:', selectedTheme);
    
    // Debug: Log all objects in the scene to understand what's there
    const allObjects: any[] = [];
    sceneRef.current.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        allObjects.push({
          type: object.type,
          userData: object.userData,
          material: object.material?.type || 'unknown'
        });
      }
    });
    
    console.log('RSP: All mesh objects in scene:');
    allObjects.forEach((obj, index) => {
      console.log(`  ${index}: type=${obj.type}, userData=`, obj.userData, `material=${obj.material}`);
    });
    
    // Find all wall meshes in the scene
    const wallMeshes: THREE.Mesh[] = [];
    sceneRef.current.traverse((object) => {
      if (object instanceof THREE.Mesh && object.userData?.type === 'wall') {
        wallMeshes.push(object);
      }
    });

    console.log(`RSP: Found ${wallMeshes.length} wall meshes to texture`);

    // Generate textures if not already created
    if (!texturesRef.current.brick) {
      texturesRef.current.brick = createBrickTexture();
      texturesRef.current.wood = createWoodTexture();
      texturesRef.current.metal = createMetalTexture();
      console.log('RSP: Generated procedural textures');
    }

    // Apply theme-specific materials to walls
    wallMeshes.forEach((wallMesh, index) => {
      const originalMaterial = wallMesh.material as THREE.MeshPhongMaterial;
      
      // Force regenerate UV coordinates for texture mapping
      const geometry = wallMesh.geometry as THREE.BufferGeometry;
      console.log(`RSP: Generating UV coordinates for wall ${index}`);
      const positionAttribute = geometry.attributes.position;
      const uvs = [];
      
      // Generate UV coordinates using world coordinates for consistent horizontal orientation
      for (let i = 0; i < positionAttribute.count; i++) {
        const x = positionAttribute.getX(i);
        const y = positionAttribute.getY(i);
        const z = positionAttribute.getZ(i);
        
        // Use horizontal distance (combining X and Z) and height Y for UV mapping
        // This ensures horizontal brick orientation regardless of wall direction
        const horizontalDistance = Math.sqrt(x * x + z * z);
        const u = horizontalDistance * 0.3; // Scale factor for brick size
        const v = y * 0.3; // Vertical scaling based on height
        
        uvs.push(u, v);
      }
      
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.attributes.uv.needsUpdate = true;
      
      // Create new material based on theme
      let newMaterial: THREE.MeshPhongMaterial;
      
      switch (selectedTheme) {
        case "modern":
          newMaterial = new THREE.MeshPhongMaterial({
            map: texturesRef.current.brick, // Use brick texture
            opacity: originalMaterial.opacity,
            transparent: originalMaterial.transparent,
            side: originalMaterial.side
          });
          break;
        case "classic":
          newMaterial = new THREE.MeshPhongMaterial({
            map: texturesRef.current.wood, // Use wood texture
            opacity: originalMaterial.opacity,
            transparent: originalMaterial.transparent,
            side: originalMaterial.side
          });
          break;
        case "industrial":
          newMaterial = new THREE.MeshPhongMaterial({
            map: texturesRef.current.metal, // Use metal texture
            opacity: originalMaterial.opacity,
            transparent: originalMaterial.transparent,
            side: originalMaterial.side
          });
          break;
        default:
          return; // Keep original material
      }
      
      wallMesh.material = newMaterial;
      console.log(`RSP: Applied ${selectedTheme} texture to wall ${index}`);
    });

    // Mark that textures have been applied
    appliedTexturesRef.current = true;
    
    // Force a render update
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  };

  useEffect(() => {
    if (onComponentMount) {
      onComponentMount();
    }
  }, [onComponentMount]);

  // Apply textures when theme changes
  useEffect(() => {
    applyThemeTextures();
  }, [selectedTheme]);

  // Theme configurations with different Canvas3D parameters
  const themeConfig = {
    modern: {
      name: "Moderno",
      description: "Estilo contemporáneo con materiales limpios",
      wallTransparencyMultiplier: 1.0,
      backgroundStyle: "light"
    },
    classic: {
      name: "Clásico", 
      description: "Estilo tradicional con acabados cálidos",
      wallTransparencyMultiplier: 0.8,
      backgroundStyle: "warm"
    },
    industrial: {
      name: "Industrial",
      description: "Estilo urbano con acabados metálicos",
      wallTransparencyMultiplier: 0.6,
      backgroundStyle: "dark"
    }
  };

  // Calculate theme-adjusted transparency
  const themeAdjustedTransparency = wallTransparency * themeConfig[selectedTheme].wallTransparencyMultiplier;

  // Theme background styles
  const getThemeBackground = () => {
    switch (selectedTheme) {
      case "modern":
        return "bg-gradient-to-br from-gray-50 to-blue-50";
      case "classic":
        return "bg-gradient-to-br from-amber-50 to-orange-50";
      case "industrial":
        return "bg-gradient-to-br from-gray-700 to-gray-900";
      default:
        return "bg-gray-100";
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-full ${getThemeBackground()}`}
      style={{ width, height, minHeight: '400px' }}
    >
      <Canvas3D
        floors={canvas3DFloors}
        currentFloor={currentFloor}
        ceilingHeight={ceilingHeightCm}
        wallTransparency={themeAdjustedTransparency}
        presentationMode={true} // Modo presentación para RSP
        isMeasureMode={false}
        isEraserMode={false}
        onUpdateAirEntry={undefined}
        onDeleteAirEntry={undefined}
        onSceneReady={handleSceneReady}
      />
      
      {/* Controles específicos de RSP */}
      <div className="absolute top-2 right-2 z-10 bg-white p-2 rounded shadow space-y-2">
        {/* Control de transparencia - mantiene compatibilidad */}
        <div>
          <label className="block text-xs mb-1">Wall Transparency</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={wallTransparency}
            onChange={(e) => onWallTransparencyChange(parseFloat(e.target.value))}
            className="w-20"
          />
        </div>

        {/* Selector de tema - preparado para sistema de materiales */}
        <div>
          <label className="block text-xs mb-1">Tema</label>
          <select
            value={selectedTheme}
            onChange={(e) => setSelectedTheme(e.target.value as typeof materialTheme)}
            className="text-xs w-20 px-1 py-0.5 border rounded"
          >
            {Object.entries(themeConfig).map(([key, config]) => (
              <option key={key} value={key}>
                {config.name}
              </option>
            ))}
          </select>
        </div>
      </div>



      {/* Información del tema actual */}
      <div className="absolute bottom-2 left-2 z-10 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
        RSP v2.0 - Tema: {themeConfig[selectedTheme].name}
      </div>
    </div>
  );
}

export default RoomSketchPro;