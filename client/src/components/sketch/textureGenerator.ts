import * as THREE from "three";

/**
 * Generador de texturas procedurales para materiales
 */
export class TextureGenerator {
  /**
   * Carga tu textura de ladrillos real con Promise
   */
  static createBrickTexture(): Promise<THREE.Texture> {
    console.log('🧱 TextureGenerator: Starting to load your brick texture');
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      const texture = loader.load(
        '/brick_texture.png',
        (loadedTexture) => {
          console.log('🧱 TextureGenerator: Your brick texture loaded successfully!', loadedTexture.image.width, 'x', loadedTexture.image.height);
          loadedTexture.wrapS = THREE.RepeatWrapping;
          loadedTexture.wrapT = THREE.RepeatWrapping;
          loadedTexture.repeat.set(2, 2);
          loadedTexture.needsUpdate = true;
          console.log('🧱 TextureGenerator: Texture ready to use');
          resolve(loadedTexture);
        },
        (progress) => {
          console.log('🧱 TextureGenerator: Loading progress:', progress);
        },
        (error) => {
          console.error('🧱 TextureGenerator: Failed to load your brick texture:', error);
          reject(error);
        }
      );
    });
  }

  /**
   * Genera una textura de madera
   */
  static createWoodTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    canvas.width = 256;
    canvas.height = 256;
    
    // Crear gradiente de madera
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, '#8b4513');
    gradient.addColorStop(0.5, '#a0522d');
    gradient.addColorStop(1, '#8b4513');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Añadir vetas de madera
    ctx.strokeStyle = '#654321';
    ctx.lineWidth = 2;
    
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * 32);
      ctx.quadraticCurveTo(canvas.width / 2, i * 32 + 10, canvas.width, i * 32);
      ctx.stroke();
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    
    return texture;
  }

  /**
   * Genera una textura metálica
   */
  static createMetalTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    canvas.width = 128;
    canvas.height = 128;
    
    // Base metálica
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, '#c0c0c0');
    gradient.addColorStop(1, '#808080');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Añadir ruido metálico
    for (let i = 0; i < 100; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const size = Math.random() * 2;
      
      ctx.fillStyle = Math.random() > 0.5 ? '#d3d3d3' : '#696969';
      ctx.fillRect(x, y, size, size);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    
    return texture;
  }
}