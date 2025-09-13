const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

// Crear un archivo .vtkjs compatible con HttpDataSetReader
async function createVTKJSFile() {
  const zip = new JSZip();
  
  // Datos de la pirámide (5 puntos)
  const points = new Float32Array([
    -0.5, -0.5, -0.5,  // Point 0
     0.5, -0.5, -0.5,  // Point 1  
     0.5,  0.5, -0.5,  // Point 2
    -0.5,  0.5, -0.5,  // Point 3
     0.0,  0.0,  0.8   // Point 4 (apex)
  ]);
  
  // Definir triángulos (6 faces: 2 base + 4 sides)
  const polys = new Uint32Array([
    // Base (quad split into 2 triangles)
    3, 0, 1, 2,  // Triangle 1
    3, 0, 2, 3,  // Triangle 2
    // Sides (4 triangular faces)
    3, 0, 1, 4,  // Side 1
    3, 1, 2, 4,  // Side 2
    3, 2, 3, 4,  // Side 3  
    3, 3, 0, 4   // Side 4
  ]);
  
  // Datos de presión (valores variados para ver colores)
  const pressure = new Float32Array([
    0.1,  // Point 0 - blue (low)
    0.3,  // Point 1 - green
    0.5,  // Point 2 - yellow  
    0.7,  // Point 3 - orange
    0.9   // Point 4 - red (high)
  ]);
  
  // Datos de velocidad (vector 3D para cada punto)
  const velocity = new Float32Array([
    0.1, 0.0, 0.0,  // Point 0
    0.2, 0.1, 0.0,  // Point 1
    0.3, 0.2, 0.1,  // Point 2  
    0.2, 0.3, 0.1,  // Point 3
    0.0, 0.0, 0.2   // Point 4
  ]);
  
  // index.json - metadata principal
  const indexJson = {
    version: "1.0",
    type: "vtkPolyData",
    size: 5,
    points: {
      ref: {
        id: "points",
        url: "data/points.float32"
      },
      type: "Float32Array",
      size: 15
    },
    polys: {
      ref: {
        id: "polys", 
        url: "data/polys.uint32"
      },
      type: "Uint32Array",
      size: 24
    },
    pointData: {
      arrays: [
        {
          data: {
            ref: {
              id: "pressure",
              url: "data/pressure.float32"
            },
            type: "Float32Array",
            name: "p",
            size: 5,
            numberOfComponents: 1
          }
        },
        {
          data: {
            ref: {
              id: "velocity",
              url: "data/velocity.float32"
            },
            type: "Float32Array", 
            name: "U",
            size: 15,
            numberOfComponents: 3
          }
        }
      ]
    }
  };
  
  // Agregar archivos al ZIP
  zip.file("index.json", JSON.stringify(indexJson, null, 2));
  
  // Crear carpeta data/ con archivos binarios
  zip.file("data/points.float32", Buffer.from(points.buffer));
  zip.file("data/polys.uint32", Buffer.from(polys.buffer));  
  zip.file("data/pressure.float32", Buffer.from(pressure.buffer));
  zip.file("data/velocity.float32", Buffer.from(velocity.buffer));
  
  // Generar ZIP y guardar
  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
  
  // Guardar archivo
  const outputPath = path.join(__dirname, 'client', 'public', 'cfd-data.vtkjs');
  fs.writeFileSync(outputPath, zipBuffer);
  
  console.log(`✅ Created VTKjs file: ${outputPath}`);
  console.log(`📊 File size: ${zipBuffer.length} bytes`);
  console.log(`📦 Contains: index.json + 4 binary data files`);
  
  return outputPath;
}

// Ejecutar
createVTKJSFile().catch(console.error);