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
  airEntryTransparency?: number;
  onAirEntryTransparencyChange?: (value: number) => void;
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
  airEntryTransparency = 1.0,
  onAirEntryTransparencyChange,
  currentFloor = "ground",
  floors,
  onComponentMount,
  materialTheme = "modern"
}: RoomSketchProProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedTheme, setSelectedTheme] = useState(materialTheme);
  const [lightingIntensity, setLightingIntensity] = useState(1.5);
  const canvas3DRef = useRef<any>(null);
  const appliedTexturesRef = useRef<boolean>(false);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const texturesRef = useRef<{
    brick?: THREE.Texture;
    wood?: THREE.Texture;
    metal?: THREE.Texture;
    door?: THREE.Texture;
    window?: THREE.Texture;
    vent?: THREE.Texture;
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

  const createDoorTexture = (theme: string = selectedTheme) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Base door color - varies by theme
    let baseColor, panelColor, handleColor;
    switch (theme) {
      case "modern":
        baseColor = '#FFFFFF'; // White modern door
        panelColor = '#F5F5F5';
        handleColor = '#C0C0C0';
        break;
      case "classic":
        baseColor = '#8B4513'; // Classic wood
        panelColor = '#7A3612';
        handleColor = '#FFD700';
        break;
      case "industrial":
        baseColor = '#4A4A4A'; // Dark metal
        panelColor = '#3A3A3A';
        handleColor = '#CCCCCC';
        break;
      default:
        baseColor = '#FFFFFF';
        panelColor = '#F5F5F5';
        handleColor = '#C0C0C0';
    }
    
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 256, 512);

    // Vetas de madera
    ctx.strokeStyle = '#5A2D0A';
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * 51.2);
      ctx.lineTo(256, i * 51.2);
      ctx.stroke();
    }

    // Paneles de puerta más grandes y visibles
    const panelWidth = 200;
    const panelHeight = 120;
    const marginX = 28;
    const marginY = 40;

    // Panel superior
    ctx.strokeStyle = theme === 'classic' ? '#4A1F05' : '#888888';
    ctx.lineWidth = 8;
    ctx.strokeRect(marginX, marginY, panelWidth, panelHeight);
    ctx.fillStyle = panelColor;
    ctx.fillRect(marginX + 4, marginY + 4, panelWidth - 8, panelHeight - 8);

    // Panel medio
    ctx.strokeRect(marginX, marginY + 160, panelWidth, panelHeight);
    ctx.fillRect(marginX + 4, marginY + 164, panelWidth - 8, panelHeight - 8);

    // Panel inferior
    ctx.strokeRect(marginX, marginY + 320, panelWidth, panelHeight);
    ctx.fillRect(marginX + 4, marginY + 324, panelWidth - 8, panelHeight - 8);

    // Manija de puerta
    ctx.fillStyle = handleColor;
    ctx.beginPath();
    ctx.arc(200, 256, 12, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = theme === 'classic' ? '#B8860B' : '#666666';
    ctx.lineWidth = 2;
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  };

  const createWindowTexture = (theme: string = selectedTheme) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Fondo de ventana - varies by theme
    let glassColor, frameColor;
    switch (theme) {
      case "modern":
        glassColor = '#F0F8FF'; // Very light blue glass
        frameColor = '#FFFFFF'; // White frame
        break;
      case "classic":
        glassColor = '#F5F5DC'; // Beige glass
        frameColor = '#8B4513'; // Brown frame
        break;
      case "industrial":
        glassColor = '#E6E6FA'; // Lavender glass
        frameColor = '#696969'; // Dark gray frame
        break;
      default:
        glassColor = '#F0F8FF';
        frameColor = '#FFFFFF';
    }
    
    ctx.fillStyle = glassColor;
    ctx.fillRect(0, 0, 256, 256);

    // Marco de ventana
    ctx.strokeStyle = frameColor;
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, 244, 244);

    // Marco interior - casi blanco
    ctx.strokeStyle = '#F5F5F5';
    ctx.lineWidth = 8;
    ctx.strokeRect(12, 12, 232, 232);

    // Cruz central más visible
    ctx.strokeStyle = '#D0D0D0';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(128, 12);
    ctx.lineTo(128, 244);
    ctx.moveTo(12, 128);
    ctx.lineTo(244, 128);
    ctx.stroke();

    // Reflejo más pronunciado
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillRect(20, 20, 100, 100);

    // Gradiente de cristal
    const gradient = ctx.createLinearGradient(0, 0, 256, 256);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
    gradient.addColorStop(1, 'rgba(135, 206, 250, 0.3)');
    ctx.fillStyle = gradient;
    ctx.fillRect(16, 16, 224, 224);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  };

  const createVentTexture = (theme: string = selectedTheme) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Fondo de rejilla - always industrial style
    const backColor = '#708090'; // Slate gray
    const slotColor = '#2F4F4F'; // Dark slate gray slots
    const frameColor = '#2F2F2F'; // Dark frame
    
    ctx.fillStyle = backColor;
    ctx.fillRect(0, 0, 256, 256);

    // Marco exterior grueso con tono azulado
    ctx.strokeStyle = '#4A6B8A';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 248, 248);

    // Marco interior más luminoso
    ctx.strokeStyle = '#7BA3CC';
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, 232, 232);

    // Láminas horizontales de rejilla con gris azulado brillante
    for (let y = 25; y < 240; y += 12) {
      // Sombra azul grisácea debajo de cada lámina
      ctx.fillStyle = '#8099B3';
      ctx.fillRect(20, y + 4, 216, 4);
      
      // Lámina principal - gris azulado brillante
      ctx.fillStyle = '#F8FCFF';
      ctx.fillRect(20, y, 216, 8);
      
      // Highlight superior muy brillante con toque azul
      ctx.fillStyle = "rgba(240, 248, 255)";
      ctx.fillRect(20, y, 216, 2);
      
      // Reflejo metálico brillante en el centro
      ctx.fillStyle = '#E8F4FD';
      ctx.fillRect(20, y + 1, 216, 1);
      
      // Borde lateral con tono azulado metálico
      ctx.fillStyle = '#B8D4E8';
      ctx.fillRect(20, y, 2, 8);
      ctx.fillRect(234, y, 2, 8);
    }

    // Tornillos en las esquinas con acabado azulado
    const screwPositions = [[30, 30], [226, 30], [30, 226], [226, 226]];
    screwPositions.forEach(([x, y]) => {
      // Base del tornillo
      ctx.fillStyle = '#6B8CA8';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, 2 * Math.PI);
      ctx.fill();
      
      // Highlight brillante
      ctx.fillStyle = '#A8C8E0';
      ctx.beginPath();
      ctx.arc(x - 1, y - 1, 3, 0, 2 * Math.PI);
      ctx.fill();
      
      // Cruz del tornillo
      ctx.strokeStyle = '#4A6B8A';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 4, y);
      ctx.lineTo(x + 4, y);
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x, y + 4);
      ctx.stroke();
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
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

    // Generate textures (force regeneration for development)
    texturesRef.current.brick = createBrickTexture();
    texturesRef.current.wood = createWoodTexture();
    texturesRef.current.metal = createMetalTexture();
    texturesRef.current.door = createDoorTexture();
    texturesRef.current.window = createWindowTexture();
    texturesRef.current.vent = createVentTexture();
    console.log('RSP: Generated procedural textures including doors, windows, and vents');

    // Apply theme-specific materials to walls
    wallMeshes.forEach((wallMesh, index) => {
      const originalMaterial = wallMesh.material as THREE.MeshPhongMaterial;
      
      // Force regenerate UV coordinates for texture mapping
      const geometry = wallMesh.geometry as THREE.BufferGeometry;
      console.log(`RSP: Generating UV coordinates for wall ${index}`);
      const positionAttribute = geometry.attributes.position;
      const uvs = [];
      
      // Generate UV coordinates with simple triangle mapping that worked before
      for (let i = 0; i < positionAttribute.count; i += 3) {
        // Standard triangle UV mapping
        uvs.push(0, 0);   // First vertex
        uvs.push(1, 0);   // Second vertex  
        uvs.push(0, 1);   // Third vertex
      }
      
      // Handle any remaining vertices
      const remaining = positionAttribute.count % 3;
      for (let i = 0; i < remaining; i++) {
        uvs.push(0, 0);
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



    // Apply textures to air entries (doors, windows, vents)
    const airEntryMeshes: THREE.Mesh[] = [];
    if (sceneRef.current) {
      sceneRef.current.traverse((object) => {
        if (object instanceof THREE.Mesh && object.userData && object.userData.type && 
            ["door", "window", "vent"].includes(object.userData.type)) {
          airEntryMeshes.push(object);
        }
      });
    }

    console.log(`RSP: Found ${airEntryMeshes.length} air entry meshes to texture`);

    airEntryMeshes.forEach((airEntryMesh, index) => {
      const airEntryType = airEntryMesh.userData.type;
      const originalMaterial = airEntryMesh.material as THREE.MeshPhongMaterial;
      
      let texture: THREE.Texture | undefined;
      let materialColor = 0xffffff;

      switch (airEntryType) {
        case "door":
          texture = texturesRef.current.door;
          materialColor = 0x8B4513; // Brown for doors
          break;
        case "window":
          texture = texturesRef.current.window;
          materialColor = 0xF0F8FF; // Very light blue for windows
          break;
        case "vent":
          texture = texturesRef.current.vent;
          materialColor = 0xB8B8B8; // Aluminum for vents
          break;
        default:
          return; // Skip unknown types
      }

      if (texture) {
        // Add UV coordinates if missing
        const geometry = airEntryMesh.geometry as THREE.BufferGeometry;
        if (!geometry.attributes.uv) {
          const positionAttribute = geometry.attributes.position;
          const uvs = [];
          
          for (let i = 0; i < positionAttribute.count; i += 3) {
            uvs.push(0, 0, 1, 0, 0, 1);
          }
          
          const remaining = positionAttribute.count % 3;
          for (let i = 0; i < remaining; i++) {
            uvs.push(0, 0);
          }
          
          geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        }

        // Create new material with texture and custom transparency
        const newMaterial = new THREE.MeshPhongMaterial({
          map: texture,
          color: materialColor,
          opacity: airEntryTransparency,
          transparent: airEntryTransparency < 1.0,
          side: originalMaterial.side
        });
        
        airEntryMesh.material = newMaterial;
        console.log(`RSP: Applied ${airEntryType} texture to air entry ${index} with opacity ${airEntryTransparency}`);
      }
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

  // Update air entry transparency when it changes
  const updateAirEntryTransparency = () => {
    if (!sceneRef.current) return;

    const airEntryMeshes: THREE.Mesh[] = [];
    sceneRef.current.traverse((object) => {
      if (object instanceof THREE.Mesh && object.userData && object.userData.type && 
          ["door", "window", "vent"].includes(object.userData.type)) {
        airEntryMeshes.push(object);
      }
    });

    airEntryMeshes.forEach((airEntryMesh) => {
      const material = airEntryMesh.material as THREE.MeshPhongMaterial;
      if (material) {
        material.opacity = airEntryTransparency;
        material.transparent = airEntryTransparency < 1.0;
        material.needsUpdate = true;
      }
    });

    // Force a render update
    if (rendererRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }

    console.log(`RSP: Updated air entry transparency to ${airEntryTransparency}`);
  };

  // Apply textures when theme changes
  useEffect(() => {
    // Force texture regeneration
    appliedTexturesRef.current = false;
    applyThemeTextures();
  }, [selectedTheme]);

  // Update air entry transparency when it changes
  useEffect(() => {
    if (sceneRef.current) {
      updateAirEntryTransparency();
    }
  }, [airEntryTransparency]);

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
        lightingIntensity={lightingIntensity} // Control de intensidad de iluminación
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

        {/* Control de transparencia de puertas y ventanas */}
        {onAirEntryTransparencyChange && (
          <div>
            <label className="block text-xs mb-1">Door/Window Transparency</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={airEntryTransparency}
              onChange={(e) => onAirEntryTransparencyChange(parseFloat(e.target.value))}
              className="w-20"
            />
          </div>
        )}

        {/* Control de intensidad de iluminación */}
        <div>
          <label className="block text-xs mb-1">Lighting Intensity</label>
          <input
            type="range"
            min={1.0}
            max={5.0}
            step={0.1}
            value={lightingIntensity}
            onChange={(e) => setLightingIntensity(parseFloat(e.target.value))}
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