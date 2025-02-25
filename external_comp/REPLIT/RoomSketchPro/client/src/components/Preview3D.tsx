import { useEffect, useRef } from "react";
import * as THREE from "three";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";
import type { RoomEditorState } from "@/hooks/useRoomEditor";

interface Preview3DProps {
  editor: RoomEditorState;
}

function calculateWallOrientationMatrix(wall: {
  start: { x: number; y: number };
  end: { x: number; y: number };
}) {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const dirX = dx / length;
  const dirY = dy / length;
  const wallDir = new THREE.Vector3(dirX, dirY, 0);
  const matrix = new THREE.Matrix4();
  matrix.lookAt(
    new THREE.Vector3(0, 0, 0),
    wallDir,
    new THREE.Vector3(0, 0, 1),
  );
  return {
    matrix,
    wallDir,
  };
}

export default function Preview3D({ editor }: Preview3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Setup scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    // Get container dimensions
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    // Setup camera with proper aspect ratio
    const camera = new THREE.PerspectiveCamera(
      55,
      containerWidth / containerHeight,
      0.1,
      10000,
    );

    // Setup renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerWidth, containerHeight);
    containerRef.current.appendChild(renderer.domElement);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(500, 500, 800);
    scene.add(sunLight);

    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0xffffff, 0.6);
    scene.add(hemiLight);

    // Add trackball controls with increased speed
    const controls = new TrackballControls(camera, renderer.domElement);
    controls.enabled = true;
    controls.rotateSpeed = 2.5;
    controls.zoomSpeed = 2;
    controls.panSpeed = 2;
    controls.noZoom = false;
    controls.noPan = false;
    controls.staticMoving = true;
    controls.dynamicDampingFactor = 0.3;

    // Initial camera setup - centered at origin
    camera.position.set(0, 0, 800); // Position camera directly above origin
    camera.up.set(0, 1, 0); // Set Z as up direction
    camera.lookAt(0, 0, 0); // Look at origin
    // You might need to manually set the rotation
    // camera.rotation.set(-Math.PI/2, 0, 0);

    controls.update();

    // Add coordinate axes helper centered at origin
    const axesHelper = new THREE.AxesHelper(200);
    scene.add(axesHelper);

    // Add floor grid centered at origin
    const gridHelper = new THREE.GridHelper(2000, 200, 0x000000, 0xcccccc);
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.position.z = -0.0;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.3;
    scene.add(gridHelper);

    // Create room geometry if it's a closed contour
    if (editor.isClosedContour() && editor.walls.length > 0) {
      // Create a shape from the walls
      const shape = new THREE.Shape();
      const firstWall = editor.walls[0];
      shape.moveTo(firstWall.start.x, firstWall.start.y);

      editor.walls.forEach((wall) => {
        shape.lineTo(wall.end.x, wall.end.y);
      });

      // Create geometry
      const geometry = new THREE.ExtrudeGeometry(shape, {
        steps: 1,
        depth: 300,
        bevelEnabled: false,
      });

      // Log base vertices coordinates
      console.log("=== Room Base Vertices (Centimeters) ===");
      const vertices = geometry.getAttribute("position");
      const baseVertices = new Set<string>(); // Use Set to avoid duplicates
      const scaleFactor = (editor.gridSize / 20) * 25; // Same scale as wall measurements

      for (let i = 0; i < vertices.count; i++) {
        const x = vertices.getX(i);
        const y = vertices.getY(i);
        const z = vertices.getZ(i);

        // Only log vertices at z=0 (base of the room)
        if (Math.abs(z) < 0.1) {
          // Small threshold for floating point comparison
          // Convert to centimeters
          const xCm = (x / editor.gridSize) * scaleFactor;
          const yCm = (y / editor.gridSize) * scaleFactor;

          const vertexKey = `${xCm.toFixed(2)},${yCm.toFixed(2)}`;
          if (!baseVertices.has(vertexKey)) {
            baseVertices.add(vertexKey);
            console.log(
              `Vertex ${i}: (${xCm.toFixed(2)}cm, ${yCm.toFixed(2)}cm, 0.00cm)`,
            );
          }
        }
      }

      // Create materials
      const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        metalness: 0.2,
        roughness: 0.8,
      });

      const roofMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        metalness: 0.2,
        roughness: 0.8,
      });

      // Create room mesh
      const roomMesh = new THREE.Mesh(geometry, [wallMaterial, roofMaterial]);
      scene.add(roomMesh);

      // Position camera based on room dimensions
      const box = new THREE.Box3().setFromObject(roomMesh);
      const center = box.getCenter(new THREE.Vector3());
      //camera.position.copy(center);
      // camera.position.add(new THREE.Vector3(300, -300, 300)); // Add offset for isometric view
      //controls.target.copy(center);
      controls.update();

      // Add doors
      editor.doors.forEach((door) => {
        const doorGroup = new THREE.Group();
        const parentWall = editor.walls.find((wall) =>
          isPointOnWall(door.position, wall),
        );

        if (parentWall) {
          const { wallDir } = calculateWallOrientationMatrix(parentWall);
          const normalAngle = door.rotation + Math.PI / 2;
          const doorNormal = new THREE.Vector3(
            Math.cos(normalAngle),
            Math.sin(normalAngle),
            0,
          ).normalize();

          const doorGeometry = new THREE.BoxGeometry(
            door.width,
            door.height,
            10,
          );
          const doorMaterial = new THREE.MeshStandardMaterial({
            color: 0x166534,
            transparent: true,
            opacity: 0.7,
            metalness: 0.6,
            roughness: 0.4,
          });

          const doorMesh = new THREE.Mesh(doorGeometry, doorMaterial);
          doorMesh.position.set(0, door.height / 2, 0);

          const rotationMatrix = new THREE.Matrix4();
          rotationMatrix.lookAt(
            new THREE.Vector3(0, 0, 0),
            doorNormal,
            new THREE.Vector3(0, 0, 1),
          );

          doorGroup.setRotationFromMatrix(rotationMatrix);
          doorGroup.add(doorMesh);
          doorGroup.position.set(door.position.x, door.position.y, 0);
        }
        scene.add(doorGroup);
      });

      // Add windows
      editor.windows.forEach((window) => {
        const windowGroup = new THREE.Group();
        const parentWall = editor.walls.find((wall) =>
          isPointOnWall(window.position, wall),
        );

        if (parentWall) {
          const { wallDir } = calculateWallOrientationMatrix(parentWall);
          const normalAngle = window.rotation + Math.PI / 2;
          const windowNormal = new THREE.Vector3(
            Math.cos(normalAngle),
            Math.sin(normalAngle),
            0,
          ).normalize();

          const windowGeometry = new THREE.BoxGeometry(
            window.width,
            window.height,
            10,
          );
          const windowMaterial = new THREE.MeshStandardMaterial({
            color: 0x22c55e,
            transparent: true,
            opacity: 0.5,
            metalness: 0.4,
            roughness: 0.2,
          });

          const windowMesh = new THREE.Mesh(windowGeometry, windowMaterial);
          windowMesh.position.set(0, window.height / 2, 0);

          const rotationMatrix = new THREE.Matrix4();
          rotationMatrix.lookAt(
            new THREE.Vector3(0, 0, 0),
            windowNormal,
            new THREE.Vector3(0, 0, 1),
          );

          windowGroup.setRotationFromMatrix(rotationMatrix);
          windowGroup.add(windowMesh);
          windowGroup.position.set(
            window.position.x,
            window.position.y,
            window.zPosition || 100,
          );
        }
        scene.add(windowGroup);
      });

      // Add grid points (vents)
      editor.gridPoints.forEach((grid) => {
        const gridGroup = new THREE.Group();
        const parentWall = editor.walls.find((wall) =>
          isPointOnWall(grid.position, wall),
        );

        if (parentWall) {
          const { wallDir } = calculateWallOrientationMatrix(parentWall);
          const normalAngle = grid.rotation + Math.PI / 2;
          const gridNormal = new THREE.Vector3(
            Math.cos(normalAngle),
            Math.sin(normalAngle),
            0,
          ).normalize();

          const gridGeometry = new THREE.BoxGeometry(
            grid.width,
            grid.height,
            10,
          );
          const gridMaterial = new THREE.MeshStandardMaterial({
            color: 0x3b82f6,
            transparent: true,
            opacity: 0.6,
            metalness: 0.5,
            roughness: 0.5,
          });

          const gridMesh = new THREE.Mesh(gridGeometry, gridMaterial);
          gridMesh.position.set(0, grid.height / 2, 0);

          const rotationMatrix = new THREE.Matrix4();
          rotationMatrix.lookAt(
            new THREE.Vector3(0, 0, 0),
            gridNormal,
            new THREE.Vector3(0, 0, 1),
          );

          gridGroup.setRotationFromMatrix(rotationMatrix);
          gridGroup.add(gridMesh);
          gridGroup.position.set(
            grid.position.x,
            grid.position.y,
            grid.zPosition || 150,
          );
        }
        scene.add(gridGroup);
      });
    }

    // Animation loop (moved outside the if statement)
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle window resize (moved outside the if statement)
    const handleResize = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      controls.handleResize();
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      renderer.dispose();
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [editor]);

  return (
    <div
      ref={containerRef}
      className="w-full h-[600px] border border-border rounded-md relative overflow-hidden"
      style={{ touchAction: "none" }}
    >
      {!editor.isClosedContour() && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80">
          <p className="text-muted-foreground">
            Complete a closed shape to see 3D preview
          </p>
        </div>
      )}
    </div>
  );
}

function isPointOnWall(
  point: { x: number; y: number },
  wall: { start: { x: number; y: number }; end: { x: number; y: number } },
): boolean {
  const tolerance = 0.1;
  const dist = pointLineDistance(point, wall.start, wall.end);
  return dist <= tolerance;
}

function pointLineDistance(
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy);
  const closestX = a.x + dx * Math.min(1, Math.max(0, t));
  const closestY = a.y + dy * Math.min(1, Math.max(0, t));
  const dist = Math.sqrt((point.x - closestX) ** 2 + (point.y - closestY) ** 2);
  return dist;
}
