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

  // Clear background
  context.fillStyle = "rgba(0,0,0,0.5)";
  context.fillRect(0, 0, canvas.width / pixelRatio, canvas.height / pixelRatio);

  // Draw text with sharp edges
  context.font = "12px 'Arial'";
  context.textAlign = "center";
  context.textBaseline = "middle";

  // Add slight text shadow for better contrast
  context.fillStyle = "rgba(255,255,255,0.8)";
  context.fillText(message, canvas.width / (2 * pixelRatio), canvas.height / (2 * pixelRatio));

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const spriteMaterial = new THREE.SpriteMaterial({ 
    map: texture,
    sizeAttenuation: true  // Enable size attenuation to scale with distance
  });

  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.position.copy(position);
  sprite.position.z += 15;  // Increased offset for better visibility
  sprite.scale.set(40, 10, 1);  // Adjusted scale to be more proportional
  sprite.renderOrder = 999;

  return sprite;
};