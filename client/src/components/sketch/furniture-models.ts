import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export interface FurnitureModel {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  yOffset: number;
}

export const createTableModel = (): THREE.Group => {
  const group = new THREE.Group();

  // Table top
  const topGeometry = new THREE.BoxGeometry(80, 60, 5);
  const topMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x8B4513,
    roughness: 0.7,
    metalness: 0.2
  });
  const top = new THREE.Mesh(topGeometry, topMaterial);
  top.position.z = 72.5; // Position at top of legs
  group.add(top);

  // Table legs
  const legGeometry = new THREE.BoxGeometry(5, 5, 70);
  const legMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x8B4513,
    roughness: 0.8,
    metalness: 0.1
  });

  // Create four legs
  const legPositions = [
    { x: 35, y: 25 },
    { x: -35, y: 25 },
    { x: 35, y: -25 },
    { x: -35, y: -25 }
  ];

  legPositions.forEach(pos => {
    const leg = new THREE.Mesh(legGeometry, legMaterial);
    leg.position.set(pos.x, pos.y, 35); // Half height of legs
    group.add(leg);
  });

  return group;
};

export const createPersonModel = (): THREE.Group => {
  const group = new THREE.Group();

  // Materials
  const skinMaterial = new THREE.MeshStandardMaterial({
    color: 0xE0AC69, // Skin tone
    roughness: 0.3,
    metalness: 0.2
  });

  const clothingMaterial = new THREE.MeshStandardMaterial({
    color: 0x4A5568, // Dark gray for clothing
    roughness: 0.7,
    metalness: 0.1
  });

  // Torso (body)
  const torsoGeometry = new THREE.CapsuleGeometry(12, 40, 8, 16);
  const torso = new THREE.Mesh(torsoGeometry, clothingMaterial);
  torso.position.z = 60; // Center of body height
  group.add(torso);

  // Neck
  const neckGeometry = new THREE.CylinderGeometry(4, 5, 8, 16);
  const neck = new THREE.Mesh(neckGeometry, skinMaterial);
  neck.position.z = 84; // Above torso
  group.add(neck);

  // Head (more detailed with face direction)
  const headGeometry = new THREE.SphereGeometry(10, 32, 32);
  const head = new THREE.Mesh(headGeometry, skinMaterial);
  head.position.z = 98; // Above neck
  group.add(head);

  // Arms
  const createArm = (isLeft: boolean) => {
    const armGroup = new THREE.Group();

    // Upper arm
    const upperArmGeometry = new THREE.CapsuleGeometry(4, 20, 8, 8);
    const upperArm = new THREE.Mesh(upperArmGeometry, clothingMaterial);
    upperArm.position.z = -10;
    armGroup.add(upperArm);

    // Elbow joint
    const elbowGeometry = new THREE.SphereGeometry(4, 16, 16);
    const elbow = new THREE.Mesh(elbowGeometry, clothingMaterial);
    elbow.position.z = -20;
    armGroup.add(elbow);

    // Lower arm
    const lowerArmGeometry = new THREE.CapsuleGeometry(3.5, 20, 8, 8);
    const lowerArm = new THREE.Mesh(lowerArmGeometry, skinMaterial);
    lowerArm.position.z = -30;
    armGroup.add(lowerArm);

    // Hand
    const handGeometry = new THREE.SphereGeometry(4, 16, 16);
    const hand = new THREE.Mesh(handGeometry, skinMaterial);
    hand.position.z = -40;
    armGroup.add(hand);

    // Position the entire arm
    armGroup.position.set(isLeft ? 16 : -16, 0, 75);
    armGroup.rotation.x = Math.PI * 0.1; // Slight forward tilt

    return armGroup;
  };

  // Add both arms
  group.add(createArm(true)); // Left arm
  group.add(createArm(false)); // Right arm

  // Legs
  const createLeg = (isLeft: boolean) => {
    const legGroup = new THREE.Group();

    // Upper leg
    const upperLegGeometry = new THREE.CapsuleGeometry(5, 25, 8, 8);
    const upperLeg = new THREE.Mesh(upperLegGeometry, clothingMaterial);
    upperLeg.position.z = -12.5;
    legGroup.add(upperLeg);

    // Knee joint
    const kneeGeometry = new THREE.SphereGeometry(5, 16, 16);
    const knee = new THREE.Mesh(kneeGeometry, clothingMaterial);
    knee.position.z = -25;
    legGroup.add(knee);

    // Lower leg
    const lowerLegGeometry = new THREE.CapsuleGeometry(4.5, 25, 8, 8);
    const lowerLeg = new THREE.Mesh(lowerLegGeometry, clothingMaterial);
    lowerLeg.position.z = -37.5;
    legGroup.add(lowerLeg);

    // Foot
    const footGeometry = new THREE.BoxGeometry(8, 12, 4);
    const foot = new THREE.Mesh(footGeometry, skinMaterial);
    foot.position.z = -52;
    foot.position.y = 2; // Slight forward position for feet
    legGroup.add(foot);

    // Position the entire leg
    legGroup.position.set(isLeft ? 8 : -8, 0, 60);

    return legGroup;
  };

  // Add both legs
  group.add(createLeg(true)); // Left leg
  group.add(createLeg(false)); // Right leg

  return group;
};

export const createArmchairModel = (): THREE.Group => {
  const group = new THREE.Group();

  const chairMaterial = new THREE.MeshStandardMaterial({
    color: 0x718096,
    roughness: 0.7,
    metalness: 0.3
  });

  // Seat
  const seatGeometry = new THREE.BoxGeometry(60, 50, 10);
  const seat = new THREE.Mesh(seatGeometry, chairMaterial);
  seat.position.z = 25;
  group.add(seat);

  // Back
  const backGeometry = new THREE.BoxGeometry(60, 10, 50);
  const back = new THREE.Mesh(backGeometry, chairMaterial);
  back.position.set(0, -20, 45);
  group.add(back);

  // Arms
  const armGeometry = new THREE.BoxGeometry(10, 40, 30);
  const leftArm = new THREE.Mesh(armGeometry, chairMaterial);
  leftArm.position.set(35, 0, 35);
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeometry, chairMaterial);
  rightArm.position.set(-35, 0, 35);
  group.add(rightArm);

  // Legs
  const legGeometry = new THREE.CylinderGeometry(3, 3, 20, 8);
  const legMaterial = new THREE.MeshStandardMaterial({
    color: 0x4A5568,
    roughness: 0.5,
    metalness: 0.5
  });

  const legPositions = [
    { x: 25, y: 20 },
    { x: -25, y: 20 },
    { x: 25, y: -20 },
    { x: -25, y: -20 }
  ];

  legPositions.forEach(pos => {
    const leg = new THREE.Mesh(legGeometry, legMaterial);
    leg.position.set(pos.x, pos.y, 10);
    group.add(leg);
  });

  return group;
};

export const createCarModel = async (): Promise<THREE.Group> => {
  const group = new THREE.Group();
  const loader = new GLTFLoader();

  try {
    // Try to load the Batmobile model
    const gltf = await loader.loadAsync('/models/car.glb');
    const carModel = gltf.scene.clone();
    
    // Scale the model to appropriate size
    const scale = 1.0; // Adjust scale as needed
    carModel.scale.setScalar(scale);
    
    // Ensure the car sits on the ground
    carModel.position.z = 0;
    
    group.add(carModel);
    return group;
  } catch (error) {
    console.warn("Failed to load car model, using fallback:", error);
    
    // Fallback to procedural model if GLB loading fails
    const carBodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x1E40AF,
      roughness: 0.2,
      metalness: 0.8
    });

    const glassMaterial = new THREE.MeshStandardMaterial({
      color: 0x87CEEB,
      transparent: true,
      opacity: 0.6,
      roughness: 0.1,
      metalness: 0.1
    });

    const tireMaterial = new THREE.MeshStandardMaterial({
      color: 0x2D3748,
      roughness: 0.9,
      metalness: 0.1
    });

    // Main body
    const bodyGeometry = new THREE.BoxGeometry(180, 80, 40);
    const body = new THREE.Mesh(bodyGeometry, carBodyMaterial);
    body.position.z = 35;
    group.add(body);

    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(18, 18, 12, 16);
    const wheelPositions = [
      { x: 80, y: 50 },   // Front left
      { x: 80, y: -50 },  // Front right
      { x: -80, y: 50 },  // Rear left
      { x: -80, y: -50 }  // Rear right
    ];

    wheelPositions.forEach(pos => {
      const wheel = new THREE.Mesh(wheelGeometry, tireMaterial);
      wheel.position.set(pos.x, pos.y, 18);
      wheel.rotation.z = Math.PI / 2;
      group.add(wheel);
    });

    return group;
  }
};