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
  onFurnitureAdd?: (floorName: string, item: FurnitureItem) => void;
  onUpdateFurniture?: (floorName: string, index: number, item: FurnitureItem) => void;
  onDeleteFurniture?: (floorName: string, index: number) => void;
  wallTransparency: number;
  onWallTransparencyChange: (value: number) => void;
  airEntryTransparency?: number;
  onAirEntryTransparencyChange?: (value: number) => void;
  currentFloor?: string;
  floors?: Record<string, FloorData>;
  isMultifloor?: boolean;
  floorParameters?: Record<string, { ceilingHeight: number; floorDeck: number }>;
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
  onUpdateFurniture,
  onDeleteFurniture,
  wallTransparency,
  onWallTransparencyChange,
  airEntryTransparency = 1.0,
  onAirEntryTransparencyChange,
  currentFloor = "ground",
  floors,
  isMultifloor = true,
  floorParameters = {},
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

  // Load your actual brick texture image
  const createBrickTexture = () => {
    console.log('RSP: Loading your brick texture image from /brick_texture.png');
    const loader = new THREE.TextureLoader();
    const texture = loader.load(
      '/brick_texture.png',
      (loadedTexture) => {
        console.log('RSP: Your brick texture loaded successfully!', loadedTexture.image.width, 'x', loadedTexture.image.height);
        loadedTexture.needsUpdate = true;
      },
      (progress) => {
        console.log('RSP: Loading progress:', progress);
      },
      (error) => {
        console.error('RSP: Failed to load your brick texture:', error);
        console.log('RSP: Trying to load from:', window.location.origin + '/brick_texture.png');
      }
    );
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    texture.needsUpdate = true;
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
    // For modern theme, use the uploaded door texture
    if (theme === "modern") {
      const texture = new THREE.TextureLoader().load('/modern_door_texture.png');
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      return texture;
    }

    // For industrial theme, use the uploaded red door texture
    if (theme === "industrial") {
      const texture = new THREE.TextureLoader().load('/industrial_door_texture.png');
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      return texture;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Base door color - varies by theme
    let baseColor, panelColor, handleColor;
    switch (theme) {
      case "classic":
        baseColor = '#FFFFFF'; // Same as modern - white door
        panelColor = '#F5F5F5';
        handleColor = '#C0C0C0';
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
    ctx.strokeStyle = '#888888';
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
    ctx.strokeStyle = '#666666';
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

    // Cristal azul más intenso para todos los temas
    const glassColor = '#1E90FF'; // Dodger blue (azul más intenso)
    
    // Color del marco según el tema
    let frameColor;
    switch (theme) {
      case "modern":
        frameColor = '#FFFFFF'; // White frame
        break;
      case "classic":
        frameColor = '#8B4513'; // Brown frame
        break;
      case "industrial":
        frameColor = '#696969'; // Dark gray frame
        break;
      default:
        frameColor = '#FFFFFF';
    }
    
    ctx.fillStyle = glassColor;
    ctx.fillRect(0, 0, 256, 256);

    // Marco de ventana
    ctx.strokeStyle = frameColor;
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, 244, 244);

    // Marco interior del mismo color que el marco exterior
    ctx.strokeStyle = frameColor;
    ctx.lineWidth = 8;
    ctx.strokeRect(12, 12, 232, 232);

    // Cruz central del mismo color que el marco
    ctx.strokeStyle = frameColor;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(128, 12);
    ctx.lineTo(128, 244);
    ctx.moveTo(12, 128);
    ctx.lineTo(244, 128);
    ctx.stroke();

    // Sin reflejo para mantener color uniforme
    // Color azul uniforme en toda la superficie del cristal
    ctx.fillStyle = glassColor;
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

    sceneRef.current = scene;
    rendererRef.current = renderer;
    cameraRef.current = camera;
    
    // Wait for walls to be generated before applying textures
    // Use multiple attempts with increasing delays
    const attempts = [1000, 2000, 3000];
    
    const tryApplyTextures = (attemptIndex = 0) => {

      
      // Check if walls exist
      let wallCount = 0;
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh && object.userData?.type === 'wall') {
          wallCount++;
        }
      });
      
      if (wallCount > 0 || attemptIndex >= attempts.length - 1) {

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
      return;
    }
    
    // Find all wall meshes in the scene
    const wallMeshes: THREE.Mesh[] = [];
    sceneRef.current.traverse((object) => {
      if (object instanceof THREE.Mesh && object.userData?.type === 'wall') {
        wallMeshes.push(object);
      }
    });



    // Generate textures
    
    // Load your brick texture and apply it when ready
    TextureGenerator.createBrickTexture().then((brickTexture) => {
      texturesRef.current.brick = brickTexture;
      
      // Apply texture to walls for classic theme
      if (sceneRef.current && selectedTheme === "classic") {
        const wallMeshes: THREE.Mesh[] = [];
        sceneRef.current.traverse((object) => {
          if (object instanceof THREE.Mesh && object.userData?.type === 'wall') {
            wallMeshes.push(object);
          }
        });
        
        wallMeshes.forEach((wallMesh) => {
          const originalMaterial = wallMesh.material as THREE.MeshPhongMaterial;
          const geometry = wallMesh.geometry as THREE.BufferGeometry;
          
          // Generate UV coordinates if missing
          const uvAttribute = geometry.getAttribute('uv');
          if (!uvAttribute) {
            const positions = geometry.getAttribute('position');
            const uvs = new Float32Array(positions.count * 2);
            
            for (let i = 0; i < positions.count; i++) {
              const u = (i % 2);
              const v = Math.floor(i / 2) % 2;
              uvs[i * 2] = u;
              uvs[i * 2 + 1] = v;
            }
            
            geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
          }
          
          const newMaterial = new THREE.MeshPhongMaterial({
            map: brickTexture,
            opacity: wallTransparency,
            transparent: wallTransparency < 1.0,
            side: originalMaterial.side
          });
          
          wallMesh.material = newMaterial;
          wallMesh.material.needsUpdate = true;
        });
      }
    }).catch((error) => {
      console.error('Failed to load brick texture, using fallback');
      texturesRef.current.brick = createBrickTexture();
    });
    
    // Generate other textures immediately
    texturesRef.current.wood = createWoodTexture();
    texturesRef.current.metal = createMetalTexture();
    texturesRef.current.door = createDoorTexture();
    texturesRef.current.window = createWindowTexture();
    texturesRef.current.vent = createVentTexture();


    // Apply theme-specific materials to walls (only non-modern themes since modern waits for brick texture)
    wallMeshes.forEach((wallMesh, index) => {
      const originalMaterial = wallMesh.material as THREE.MeshPhongMaterial;
      const geometry = wallMesh.geometry as THREE.BufferGeometry;
      
      // Generate UV coordinates if missing
      const uvAttribute = geometry.getAttribute('uv');
      if (!uvAttribute) {
        const positions = geometry.getAttribute('position');
        const uvs = new Float32Array(positions.count * 2);
        
        for (let i = 0; i < positions.count; i++) {
          const u = (i % 2);
          const v = Math.floor(i / 2) % 2;
          uvs[i * 2] = u;
          uvs[i * 2 + 1] = v;
        }
        
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      }
      
      // Create new material based on theme
      let newMaterial: THREE.MeshPhongMaterial;
      
      switch (selectedTheme) {
        case "modern":
          // Load marble texture for modern theme
          const marbleTexture = new THREE.TextureLoader().load('/marble_texture.png');
          marbleTexture.wrapS = THREE.RepeatWrapping;
          marbleTexture.wrapT = THREE.RepeatWrapping;
          marbleTexture.repeat.set(4, 4);
          newMaterial = new THREE.MeshPhongMaterial({
            map: marbleTexture,
            opacity: wallTransparency,
            transparent: wallTransparency < 1.0,
            side: originalMaterial.side
          });
          break;
        case "classic":
          // Skip classic theme here - handled in brick texture promise above
          return;
        case "industrial":
          // Load industrial metal texture
          const industrialTexture = new THREE.TextureLoader().load('/industrial_wall_texture.png');
          industrialTexture.wrapS = THREE.RepeatWrapping;
          industrialTexture.wrapT = THREE.RepeatWrapping;
          industrialTexture.repeat.set(4, 4);
          newMaterial = new THREE.MeshPhongMaterial({
            map: industrialTexture,
            opacity: wallTransparency,
            transparent: wallTransparency < 1.0,
            side: originalMaterial.side
          });
          break;
        default:
          return;
      }
      
      wallMesh.material = newMaterial;
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



    airEntryMeshes.forEach((airEntryMesh, index) => {
      const airEntryType = airEntryMesh.userData.type;
      const originalMaterial = airEntryMesh.material as THREE.MeshPhongMaterial;
      
      let texture: THREE.Texture | undefined;
      let materialColor = 0xffffff;

      switch (airEntryType) {
        case "door":
          texture = texturesRef.current.door;
          // Color varies by theme to match uploaded textures
          if (selectedTheme === "modern") {
            materialColor = 0xD1D5DB; // Light gray for modern doors
          } else if (selectedTheme === "industrial") {
            materialColor = 0xDC2626; // Red for industrial doors
          } else {
            materialColor = 0x8B4513; // Brown for classic theme
          }
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

        // Create new material with texture using original opacity for better visibility
        const newMaterial = new THREE.MeshPhongMaterial({
          map: texture,
          color: materialColor,
          opacity: originalMaterial.opacity,
          transparent: originalMaterial.transparent,
          side: originalMaterial.side,
          emissive: 0x222222, // Subtle gray glow
          emissiveIntensity: 0.2 // Low intensity for natural look
        });
        
        airEntryMesh.material = newMaterial;
        airEntryMesh.renderOrder = 2; // Render after walls
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
        isMultifloor={isMultifloor}
        floorParameters={floorParameters}
        onUpdateAirEntry={undefined}
        onDeleteAirEntry={undefined}
        onSceneReady={handleSceneReady}
        onFurnitureAdd={onFurnitureAdd} // Pass furniture callback to Canvas3D
        onUpdateFurniture={onUpdateFurniture} // Enable furniture editing in RSP
        onDeleteFurniture={onDeleteFurniture} // Enable furniture deletion in RSP
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