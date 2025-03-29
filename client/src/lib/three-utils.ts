import * as THREE from 'three';

// Define an interface for text sprite parameters
interface TextSpriteOptions {
  fontsize?: number;
  fontface?: string;
  textColor?: { r: number; g: number; b: number; a: number };
  backgroundColor?: { r: number; g: number; b: number; a: number };
  borderColor?: { r: number; g: number; b: number; a: number };
  borderThickness?: number;
  padding?: number;
}

// Make a text sprite with options, or with a simple position
export const makeTextSprite = (
  message: string, 
  positionOrOptions: THREE.Vector3 | TextSpriteOptions
): THREE.Sprite => {
  // Default options
  const options: TextSpriteOptions = {
    fontsize: 12,
    fontface: 'Arial',
    textColor: { r: 0, g: 0, b: 0, a: 1.0 },
    backgroundColor: { r: 255, g: 255, b: 255, a: 0.0 },
    borderColor: { r: 0, g: 0, b: 0, a: 0.0 },
    borderThickness: 0,
    padding: 0
  };
  
  // Initialize position
  let position: THREE.Vector3;
  
  // Check if the first argument is a Vector3 (backward compatibility)
  if (positionOrOptions instanceof THREE.Vector3) {
    position = positionOrOptions;
  } else {
    // It's an options object, merge with defaults
    Object.assign(options, positionOrOptions);
    position = new THREE.Vector3(0, 0, 0); // Default position
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return new THREE.Sprite();

  // Use device pixel ratio for sharp rendering
  const pixelRatio = window.devicePixelRatio || 1;
  
  // Adjust canvas size based on font size and message length
  const fontSize = options.fontsize || 12;
  const estimatedWidth = Math.max(message.length * fontSize * 0.6, 128);
  const estimatedHeight = fontSize * 2;
  
  canvas.width = (estimatedWidth + (options.padding || 0) * 2) * pixelRatio;
  canvas.height = (estimatedHeight + (options.padding || 0) * 2) * pixelRatio;
  context.scale(pixelRatio, pixelRatio);

  // Clear background
  context.fillStyle = `rgba(${options.backgroundColor?.r || 255}, ${options.backgroundColor?.g || 255}, ${options.backgroundColor?.b || 255}, ${options.backgroundColor?.a || 0})`;
  context.fillRect(0, 0, canvas.width / pixelRatio, canvas.height / pixelRatio);

  // Draw border if thickness > 0
  if ((options.borderThickness || 0) > 0) {
    context.strokeStyle = `rgba(${options.borderColor?.r || 0}, ${options.borderColor?.g || 0}, ${options.borderColor?.b || 0}, ${options.borderColor?.a || 1})`;
    context.lineWidth = options.borderThickness || 0;
    context.strokeRect(
      options.borderThickness || 0,
      options.borderThickness || 0,
      (canvas.width / pixelRatio) - 2 * (options.borderThickness || 0),
      (canvas.height / pixelRatio) - 2 * (options.borderThickness || 0)
    );
  }

  // Draw text
  context.font = `${options.fontsize}px '${options.fontface}'`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = `rgba(${options.textColor?.r || 0}, ${options.textColor?.g || 0}, ${options.textColor?.b || 0}, ${options.textColor?.a || 1})`;
  context.fillText(message, canvas.width / (2 * pixelRatio), canvas.height / (2 * pixelRatio));

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const spriteMaterial = new THREE.SpriteMaterial({ 
    map: texture,
    sizeAttenuation: true,  // Enable size attenuation to scale with distance
    depthTest: false,       // Ensure text is always visible
    transparent: true       // Required for transparency
  });

  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.position.copy(position);
  
  // Scale based on canvas dimensions
  const scaleX = canvas.width / pixelRatio / 10;
  const scaleY = canvas.height / pixelRatio / 10;
  sprite.scale.set(scaleX, scaleY, 1);
  
  sprite.renderOrder = 999999;  // Very high render order to ensure it's always on top

  return sprite;
};