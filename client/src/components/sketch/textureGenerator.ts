import * as THREE from "three";

/**
 * Generador de texturas procedurales para materiales
 */
export class TextureGenerator {
  /**
   * Genera una textura de ladrillos usando canvas
   */
  static createBrickTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    // Configuración de la textura
    canvas.width = 512;
    canvas.height = 512;
    
    const brickWidth = 64;
    const brickHeight = 32;
    const mortarWidth = 4;
    
    // Color de fondo (mortero)
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Dibujar ladrillos
    ctx.fillStyle = '#d4a574';
    
    for (let y = 0; y < canvas.height; y += brickHeight + mortarWidth) {
      for (let x = 0; x < canvas.width; x += brickWidth + mortarWidth) {
        // Alternar filas para patrón de ladrillos
        const offset = Math.floor(y / (brickHeight + mortarWidth)) % 2 === 0 ? 0 : (brickWidth + mortarWidth) / 2;
        const brickX = x + offset;
        
        // Dibujar ladrillo si está dentro del canvas
        if (brickX < canvas.width) {
          ctx.fillRect(brickX, y, Math.min(brickWidth, canvas.width - brickX), brickHeight);
          
          // Añadir sombra para profundidad
          ctx.fillStyle = '#c49660';
          ctx.fillRect(brickX, y + brickHeight - 3, Math.min(brickWidth, canvas.width - brickX), 3);
          ctx.fillStyle = '#d4a574';
        }
      }
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 4);
    
    return texture;
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