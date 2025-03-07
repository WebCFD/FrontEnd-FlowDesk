import * as THREE from 'three';

export const makeTextSprite = (message: string, position: THREE.Vector3): THREE.Sprite => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return new THREE.Sprite();

  canvas.width = 256;
  canvas.height = 128;

  // Fill background (dark semi-transparent background for better contrast)
  context.fillStyle = "rgba(0,0,0,0.7)";
  context.fillRect(0, 0, canvas.width, canvas.height);

  // Draw text
  context.font = "bold 24px Arial";
  context.fillStyle = "white"; // White text for better visibility
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(message, canvas.width/2, canvas.height/2);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMaterial = new THREE.SpriteMaterial({ 
    map: texture,
    sizeAttenuation: false, // Makes the sprite size independent of distance
    depthTest: false // Ensures the sprite is always visible
  });
  
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.position.copy(position);
  sprite.position.z += 5; // Offset slightly to avoid overlap with marker
  sprite.scale.set(75, 35, 1); // Larger sprite
  sprite.renderOrder = 999; // Ensure it's drawn on top

  return sprite;
};
