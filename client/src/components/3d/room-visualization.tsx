import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

const points = Array.from({ length: 5 }, (_, i) => {
  const t = i / 4;
  return [
    Math.sin(t * Math.PI * 2) * 2,
    Math.cos(t * Math.PI * 2) * 1.5 + 1,
    (t - 0.5) * 4
  ];
});

export function RoomVisualization() {
  const roomRef = useRef<THREE.Group>(null);
  const streamlinesRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (roomRef.current) {
      roomRef.current.rotation.y = 0;
    }
  }, []);

  useFrame(({ clock }) => {
    if (roomRef.current) {
      roomRef.current.rotation.y = clock.getElapsedTime() * 0.2;
    }
    if (streamlinesRef.current) {
      streamlinesRef.current.children.forEach((line, i) => {
        const offset = Math.sin(clock.getElapsedTime() * 0.5 + i) * 0.5;
        line.position.z = offset;
      });
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

      {/* Streamlines */}
      <group ref={streamlinesRef}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Line
            key={i}
            points={points.map(([x, y, z]) => [x, y, z + i])}
            color="#00a8ff"
            lineWidth={1}
            segments
            dashed={false}
          />
        ))}
      </group>
    </group>
  );
}