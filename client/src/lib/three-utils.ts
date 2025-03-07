import * as THREE from 'three';

export const makeTextSprite = (message: string, position: THREE.Vector3): THREE.Sprite => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return new THREE.Sprite();

  // Use device pixel ratio for sharp rendering
  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = 128 * pixelRatio;
  canvas.height = 32 * pixelRatio;
  context.scale(pixelRatio, pixelRatio);

  // Clear background - fully transparent
  context.fillStyle = "rgba(0,0,0,0)";
  context.fillRect(0, 0, canvas.width / pixelRatio, canvas.height / pixelRatio);

  // Draw text with sharp edges
  context.font = "12px 'Arial'";
  context.textAlign = "center";
  context.textBaseline = "middle";

  // Black text
  context.fillStyle = "#000000";
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
  sprite.position.z += 15;  // Increased offset for better visibility
  sprite.scale.set(40, 10, 1);  // Adjusted scale to be more proportional
  sprite.renderOrder = 999999;  // Very high render order to ensure it's always on top

  return sprite;
};