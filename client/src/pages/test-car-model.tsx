import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export default function TestCarModel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Setup scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;

    // Setup camera
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(500, 300, 500);
    camera.lookAt(0, 0, 0);

    // Setup renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    containerRef.current.appendChild(renderer.domElement);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 100, 100);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Add ground plane
    const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x999999 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Load Batmobile model
    const loader = new GLTFLoader();
    
    const loadCarModel = async () => {
      try {
        console.log('Attempting to load car model from /models/car.glb');
        const gltf = await loader.loadAsync('/models/car.glb');
        const carModel = gltf.scene.clone();
        
        // Scale and position the model
        carModel.scale.setScalar(1.0);
        carModel.position.set(0, 0, 0);
        
        // Enable shadows
        carModel.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        
        scene.add(carModel);
        console.log('✅ Batmobile model loaded successfully!');
        
        // Add success indicator
        const successGeometry = new THREE.SphereGeometry(20);
        const successMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const successIndicator = new THREE.Mesh(successGeometry, successMaterial);
        successIndicator.position.set(200, 100, 0);
        scene.add(successIndicator);
        
      } catch (error) {
        console.error('❌ Failed to load car model:', error);
        
        // Add error indicator and fallback
        const errorGeometry = new THREE.SphereGeometry(20);
        const errorMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const errorIndicator = new THREE.Mesh(errorGeometry, errorMaterial);
        errorIndicator.position.set(200, 100, 0);
        scene.add(errorIndicator);
        
        // Add fallback simple car
        const fallbackGeometry = new THREE.BoxGeometry(180, 80, 40);
        const fallbackMaterial = new THREE.MeshStandardMaterial({ color: 0x1E40AF });
        const fallbackCar = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
        fallbackCar.position.set(0, 0, 20);
        fallbackCar.castShadow = true;
        scene.add(fallbackCar);
      }
    };

    loadCarModel();

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div className="w-full h-screen flex flex-col">
      <div className="p-4 bg-gray-100 border-b">
        <h1 className="text-2xl font-bold">Test Car Model - Batmobile 1989</h1>
        <p className="text-gray-600">
          🟢 Esfera verde = Modelo cargado exitosamente | 🔴 Esfera roja = Error en carga (usando fallback)
        </p>
        <p className="text-sm text-gray-500">
          Revisa la consola del navegador para ver los logs de carga del modelo
        </p>
      </div>
      <div 
        ref={containerRef} 
        className="flex-1 w-full"
        style={{ height: 'calc(100vh - 120px)' }}
      />
    </div>
  );
}