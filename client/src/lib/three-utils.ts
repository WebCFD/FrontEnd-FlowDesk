import * as THREE from 'three';

export const makeTextSprite = (message: string, position: THREE.Vector3): THREE.Sprite => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return new THREE.Sprite();

  canvas.width = 128;  // Reduced from 256
  canvas.height = 64;  // Reduced from 128

  // Fill background (dark semi-transparent background for better contrast)
  context.fillStyle = "rgba(0,0,0,0.5)";  // More transparent background
  context.fillRect(0, 0, canvas.width, canvas.height);

  // Draw text
  context.font = "bold 16px Arial";  // Smaller font size
  context.fillStyle = "white";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(message, canvas.width/2, canvas.height/2);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMaterial = new THREE.SpriteMaterial({ 
    map: texture,
    sizeAttenuation: false  // Makes the sprite size independent of distance
  });

  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.position.copy(position);
  sprite.position.z += 2;  // Smaller offset from the point
  sprite.scale.set(30, 15, 1);  // Smaller scale values
  sprite.renderOrder = 999;  // Ensure it's drawn on top

  return sprite;
};