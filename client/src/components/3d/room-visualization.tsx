import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function RoomVisualization() {
  const roomRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (roomRef.current) {
      roomRef.current.rotation.y = 0;
    }
  }, []);

  useFrame(({ clock }) => {
    if (roomRef.current) {
      roomRef.current.rotation.y = clock.getElapsedTime() * 0.2;
    }
  });

  return (
    <group ref={roomRef}>
      {/* Room */}
      <mesh receiveShadow castShadow>
        <boxGeometry args={[6, 4, 6]} />
        <meshStandardMaterial 
          color="#ffffff" 
          transparent 
          opacity={0.1} 
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Window */}
      <mesh position={[3.01, 1, 0]} castShadow>
        <boxGeometry args={[0.1, 1.5, 1.5]} />
        <meshStandardMaterial color="#87CEEB" />
      </mesh>

      {/* Door */}
      <mesh position={[0, 0, 3.01]} castShadow>
        <boxGeometry args={[1, 2.5, 0.1]} />
        <meshStandardMaterial color="#8B4513" />
      </mesh>

      {/* Simple Air Streamlines */}
      {Array.from({ length: 3 }).map((_, i) => (
        <mesh key={i} position={[0, 1 + i * 0.5, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 4, 8]} />
          <meshStandardMaterial color="#00a8ff" transparent opacity={0.3} />
        </mesh>
      ))}
    </group>
  );
}