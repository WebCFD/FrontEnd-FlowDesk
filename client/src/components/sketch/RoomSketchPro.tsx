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

  // Create procedural textures
  const createBrickTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Background mortar color (más claro y realista)
    ctx.fillStyle = '#e8e0d8';
    ctx.fillRect(0, 0, 512, 256);

    // Dimensiones más realistas de ladrillos
    const brickWidth = 120;
    const brickHeight = 40;
    const mortarWidth = 8;

    // Colores base para ladrillos más realistas
    const brickColors = [
      { r: 165, g: 85, b: 65 },   // Rojo ladrillo clásico
      { r: 150, g: 75, b: 55 },   // Más oscuro
      { r: 180, g: 95, b: 75 },   // Más claro
      { r: 140, g: 70, b: 50 },   // Oscuro
      { r: 170, g: 90, b: 70 }    // Medio
    ];

    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        // Patrón de desplazamiento alternado (típico de ladrillos)
        const offsetX = (row % 2) * (brickWidth / 2);
        const x = col * brickWidth + offsetX + mortarWidth;
        const y = row * brickHeight + mortarWidth;

        // Saltar si el ladrillo está fuera del canvas
        if (x + brickWidth > 512 || y + brickHeight > 256) continue;

        // Seleccionar color de ladrillo aleatoriamente
        const baseColor = brickColors[Math.floor(Math.random() * brickColors.length)];
        
        // Añadir variación sutil al color
        const variation = 15;
        const red = Math.max(0, Math.min(255, baseColor.r + (Math.random() - 0.5) * variation));
        const green = Math.max(0, Math.min(255, baseColor.g + (Math.random() - 0.5) * variation));
        const blue = Math.max(0, Math.min(255, baseColor.b + (Math.random() - 0.5) * variation));
        
        // Dibujar el ladrillo base
        ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
        ctx.fillRect(x, y, brickWidth - mortarWidth, brickHeight - mortarWidth);

        // Añadir textura interna al ladrillo
        for (let i = 0; i < 8; i++) {
          const spotX = x + Math.random() * (brickWidth - mortarWidth);
          const spotY = y + Math.random() * (brickHeight - mortarWidth);
          const spotSize = 1 + Math.random() * 2;
          
          ctx.fillStyle = `rgba(${red + 20}, ${green + 20}, ${blue + 20}, 0.3)`;
          ctx.fillRect(spotX, spotY, spotSize, spotSize);
        }

        // Sombra en la parte inferior del ladrillo
        const gradient = ctx.createLinearGradient(x, y + brickHeight - mortarWidth - 8, x, y + brickHeight - mortarWidth);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y + brickHeight - mortarWidth - 8, brickWidth - mortarWidth, 8);

        // Highlight en la parte superior
        ctx.fillStyle = `rgba(255, 255, 255, 0.1)`;
        ctx.fillRect(x, y, brickWidth - mortarWidth, 2);
      }
    }

    // Añadir algunas grietas aleatorias al mortero
    ctx.strokeStyle = 'rgba(160, 150, 140, 0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 20; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * 512, Math.random() * 256);
      ctx.lineTo(Math.random() * 512, Math.random() * 256);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 1);
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
      
      // Ensure the geometry has UV coordinates for texture mapping
      const geometry = wallMesh.geometry as THREE.BufferGeometry;
      if (!geometry.attributes.uv) {
        console.log(`RSP: Adding UV coordinates to wall ${index}`);
        const positionAttribute = geometry.attributes.position;
        const uvs = [];
        
        // Generate UV coordinates for each vertex
        for (let i = 0; i < positionAttribute.count; i++) {
          // For walls, we map based on vertex index within each face
          const faceIndex = Math.floor(i / 3);
          const vertexIndex = i % 3;
          
          // Basic UV mapping for triangles
          if (vertexIndex === 0) {
            uvs.push(0, 0); // Bottom-left
          } else if (vertexIndex === 1) {
            uvs.push(1, 0); // Bottom-right
          } else {
            uvs.push(0.5, 1); // Top-center
          }
        }
        
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      }
      
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