import * as THREE from 'three';

export const makeTextSprite = (message: string, position: THREE.Vector3): THREE.Sprite => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return new THREE.Sprite();

  // Use device pixel ratio for sharp rendering
  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = 128 * pixelRatio;  // Reduced from 256 to 128
  canvas.height = 32 * pixelRatio;  // Reduced from 64 to 32
  context.scale(pixelRatio, pixelRatio);

  // Clear background
  context.fillStyle = "rgba(0,0,0,0.5)";
  context.fillRect(0, 0, canvas.width / pixelRatio, canvas.height / pixelRatio);

  // Draw text with sharp edges
  context.font = "10px 'Arial'";  // Reduced from 14px to 10px
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
    sizeAttenuation: false  // Makes the sprite size independent of distance
  });

  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.position.copy(position);
  sprite.position.z += 2;  // Reduced offset from 5 to 2
  sprite.scale.set(10, 2.5, 1);  // Reduced scale from (20, 5, 1) to (10, 2.5, 1)
  sprite.renderOrder = 999;  // Ensure it's drawn on top

  return sprite;
};