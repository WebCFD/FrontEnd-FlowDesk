import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";

interface Canvas3DMinimalProps {
  wallTransparency: number;
}

export default function Canvas3DMinimal({
  wallTransparency = 0.5,
}: Canvas3DMinimalProps) {
  // Container ref to hold our canvas
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Three.js objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<TrackballControls | null>(null);
  const cubeRef = useRef<THREE.Mesh | null>(null);
  
  // Flag to track if a render is needed
  const needsRenderRef = useRef<boolean>(true);
  
  // Main initialization effect
  useEffect(() => {
    // Skip if container is not available
    if (!containerRef.current) return;
    
    console.log("Canvas3DMinimal initializing...");
    
    // Get container dimensions
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    
    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;
    
    // Create camera
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 5, 10);
    cameraRef.current = camera;
    
    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Add controls
    const controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 2.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.noZoom = false;
    controls.noPan = false;
    controls.staticMoving = true;
    controls.dynamicDampingFactor = 0.2;
    controlsRef.current = controls;
    
    // Add a light
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 1, 1);
    scene.add(light);
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    
    // Add a grid helper
    const gridHelper = new THREE.GridHelper(20, 20);
    scene.add(gridHelper);
    
    // Add a demo cube
    const geometry = new THREE.BoxGeometry(5, 5, 5);
    const material = new THREE.MeshPhongMaterial({ 
      color: 0x00ff00,
      transparent: true, 
      opacity: wallTransparency 
    });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);
    cubeRef.current = cube;
    
    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      if (cubeRef.current) {
        cubeRef.current.rotation.x += 0.005;
        cubeRef.current.rotation.y += 0.01;
        needsRenderRef.current = true;
      }
      
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      
      if (needsRenderRef.current) {
        rendererRef.current?.render(scene, camera);
        needsRenderRef.current = false;
      }
    };
    animate();
    
    // Handle window resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      
      renderer.setSize(width, height);
      needsRenderRef.current = true;
    };
    
    window.addEventListener("resize", handleResize);
    
    // Clean up function
    return () => {
      console.log("Canvas3DMinimal cleaning up...");
      
      window.removeEventListener("resize", handleResize);
      
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
      
      if (rendererRef.current) {
        rendererRef.current.dispose();
        
        if (containerRef.current && rendererRef.current.domElement.parentNode) {
          containerRef.current.removeChild(rendererRef.current.domElement);
        }
      }
      
      // Dispose of geometries and materials
      if (cubeRef.current) {
        if (cubeRef.current.geometry) cubeRef.current.geometry.dispose();
        if (cubeRef.current.material) {
          if (Array.isArray(cubeRef.current.material)) {
            cubeRef.current.material.forEach(material => material.dispose());
          } else {
            cubeRef.current.material.dispose();
          }
        }
      }
    };
  }, []); // Empty dependency array - only run once on mount
  
  // Update effect for wall transparency
  useEffect(() => {
    if (!cubeRef.current) return;
    
    if (cubeRef.current.material && !Array.isArray(cubeRef.current.material)) {
      const material = cubeRef.current.material as THREE.MeshPhongMaterial;
      if (material.transparent) {
        material.opacity = wallTransparency;
        needsRenderRef.current = true;
      }
    }
  }, [wallTransparency]);
  
  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: "100%", 
        height: "400px",
        border: "1px solid #ccc",
        borderRadius: "4px",
        overflow: "hidden"
      }}
    />
  );
}