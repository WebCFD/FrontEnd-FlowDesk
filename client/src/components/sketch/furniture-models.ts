import * as THREE from "three";

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

  // Body material
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x4A5568,
    roughness: 0.9,
    metalness: 0.1
  });

  // Body (torso)
  const bodyGeometry = new THREE.CylinderGeometry(15, 15, 60, 8);
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.z = 30; // Half height of body
  group.add(body);

  // Head
  const headGeometry = new THREE.SphereGeometry(12, 16, 16);
  const head = new THREE.Mesh(headGeometry, bodyMaterial);
  head.position.z = 72; // Position above body
  group.add(head);

  // Legs
  const legGeometry = new THREE.CylinderGeometry(5, 5, 50, 8);
  const leftLeg = new THREE.Mesh(legGeometry, bodyMaterial);
  leftLeg.position.set(8, 0, 25);
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeometry, bodyMaterial);
  rightLeg.position.set(-8, 0, 25);
  group.add(rightLeg);

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