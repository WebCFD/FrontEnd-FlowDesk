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

export const createDimensionLabel = (text: string, fontSize: number = 28): THREE.Sprite => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const pixelRatio = window.devicePixelRatio || 1;
  const font = `bold ${fontSize}px Arial`;
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const textW = metrics.width;
  const padX = fontSize * 0.6;
  const padY = fontSize * 0.4;
  const w = textW + padX * 2;
  const h = fontSize * 1.4 + padY * 2;
  canvas.width = w * pixelRatio;
  canvas.height = h * pixelRatio;
  ctx.scale(pixelRatio, pixelRatio);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  const r = 4;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, h - r);
  ctx.quadraticCurveTo(w, h, w - r, h);
  ctx.lineTo(r, h);
  ctx.quadraticCurveTo(0, h, 0, h - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(100,116,139,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1e293b';
  ctx.fillText(text, w / 2, h / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    sizeAttenuation: true,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(w / pixelRatio / 5, h / pixelRatio / 5, 1);
  sprite.renderOrder = 999;
  return sprite;
};

export const createDimensionLine = (
  start: THREE.Vector3,
  end: THREE.Vector3,
  label: string,
  color: number = 0x64748b,
  offsetDir?: THREE.Vector3
): THREE.Group => {
  const dimGroup = new THREE.Group();
  const lineMat = new THREE.LineBasicMaterial({ color, linewidth: 1, depthTest: false });

  const dir = new THREE.Vector3().subVectors(end, start);
  const length = dir.length();
  const arrowSize = Math.min(length * 0.08, 5);

  const mainGeo = new THREE.BufferGeometry().setFromPoints([start, end]);
  const mainLine = new THREE.Line(mainGeo, lineMat);
  mainLine.renderOrder = 998;
  dimGroup.add(mainLine);

  const norm = dir.clone().normalize();
  const createArrowhead = (tip: THREE.Vector3, direction: THREE.Vector3) => {
    const perp = new THREE.Vector3();
    if (Math.abs(direction.z) > 0.9) {
      perp.crossVectors(direction, new THREE.Vector3(1, 0, 0)).normalize();
    } else {
      perp.crossVectors(direction, new THREE.Vector3(0, 0, 1)).normalize();
    }
    const p1 = tip.clone().add(direction.clone().multiplyScalar(-arrowSize)).add(perp.clone().multiplyScalar(arrowSize * 0.35));
    const p2 = tip.clone().add(direction.clone().multiplyScalar(-arrowSize)).add(perp.clone().multiplyScalar(-arrowSize * 0.35));
    const geo = new THREE.BufferGeometry().setFromPoints([tip, p1, tip, p2]);
    const line = new THREE.LineSegments(geo, lineMat);
    line.renderOrder = 998;
    return line;
  };

  dimGroup.add(createArrowhead(end, norm));
  dimGroup.add(createArrowhead(start, norm.clone().negate()));

  if (offsetDir) {
    const extLen = 6;
    const ext1Geo = new THREE.BufferGeometry().setFromPoints([
      start.clone().add(offsetDir.clone().multiplyScalar(-extLen)),
      start.clone().add(offsetDir.clone().multiplyScalar(extLen * 0.3)),
    ]);
    const ext2Geo = new THREE.BufferGeometry().setFromPoints([
      end.clone().add(offsetDir.clone().multiplyScalar(-extLen)),
      end.clone().add(offsetDir.clone().multiplyScalar(extLen * 0.3)),
    ]);
    const ext1 = new THREE.Line(ext1Geo, lineMat);
    const ext2 = new THREE.Line(ext2Geo, lineMat);
    ext1.renderOrder = 998;
    ext2.renderOrder = 998;
    dimGroup.add(ext1);
    dimGroup.add(ext2);
  }

  const midPoint = start.clone().add(end).multiplyScalar(0.5);
  const labelSprite = createDimensionLabel(label);
  labelSprite.position.copy(midPoint);
  dimGroup.add(labelSprite);

  return dimGroup;
};

export const createRackModel = (): THREE.Group => {
  const group = new THREE.Group();

  const rackWidth = 60;
  const rackDepth = 100;
  const rackHeight = 200;

  const rackMaterial = new THREE.MeshStandardMaterial({
    color: 0x2d2d2d,
    roughness: 0.6,
    metalness: 0.4,
  });

  const rackGeometry = new THREE.BoxGeometry(rackWidth, rackDepth, rackHeight);
  const rack = new THREE.Mesh(rackGeometry, rackMaterial);
  rack.position.z = rackHeight / 2;
  group.add(rack);

  const slotMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    roughness: 0.8,
    metalness: 0.2,
  });

  const slotCount = 10;
  const slotSpacing = rackHeight / (slotCount + 1);
  for (let i = 1; i <= slotCount; i++) {
    const slotGeometry = new THREE.BoxGeometry(rackWidth * 0.85, 1, rackHeight * 0.045);
    const slot = new THREE.Mesh(slotGeometry, slotMaterial);
    slot.position.set(0, rackDepth / 2 + 0.5, i * slotSpacing);
    group.add(slot);

    const slotBack = new THREE.Mesh(slotGeometry, slotMaterial);
    slotBack.position.set(0, -(rackDepth / 2 + 0.5), i * slotSpacing);
    group.add(slotBack);
  }

  const createArrow = (color: number) => {
    const arrowGroup = new THREE.Group();
    const arrowMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.3,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85,
    });

    const shaftLength = 20;
    const coneHeight = 10;

    const shaftGeometry = new THREE.CylinderGeometry(1.5, 1.5, shaftLength, 8);
    const shaft = new THREE.Mesh(shaftGeometry, arrowMat);

    const coneGeometry = new THREE.ConeGeometry(4, coneHeight, 8);
    const cone = new THREE.Mesh(coneGeometry, arrowMat);

    cone.rotation.z = Math.PI;
    shaft.position.y = shaftLength / 2;
    cone.position.y = -coneHeight / 2;

    arrowGroup.add(shaft);
    arrowGroup.add(cone);

    return arrowGroup;
  };

  const arrowRows = 4;
  const arrowCols = 2;
  const xSpacing = rackWidth * 0.5 / arrowCols;
  const zSpacing = rackHeight * 0.6 / arrowRows;
  const zStart = rackHeight * 0.2;

  for (let r = 0; r < arrowRows; r++) {
    for (let c = 0; c < arrowCols; c++) {
      const x = -xSpacing * (arrowCols - 1) / 2 + c * xSpacing;
      const z = zStart + r * zSpacing;

      const coldArrow = createArrow(0x3b82f6);
      coldArrow.position.set(x, rackDepth / 2 + 20, z);
      group.add(coldArrow);

      const hotArrow = createArrow(0xef4444);
      hotArrow.position.set(x, -(rackDepth / 2 + 20), z);
      group.add(hotArrow);
    }
  }

  return group;
};

export const createTopVentBoxModel = (simulationProperties?: { state?: string; airOrientation?: string }): THREE.Group => {
  const group = new THREE.Group();

  const boxWidth = 50;
  const boxDepth = 50;
  const boxHeight = 150;

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x8a8a8a,
    roughness: 0.4,
    metalness: 0.6,
  });

  const bodyGeometry = new THREE.BoxGeometry(boxWidth, boxDepth, boxHeight);
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.z = boxHeight / 2;
  group.add(body);

  const edgeMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b6b6b,
    roughness: 0.3,
    metalness: 0.7,
  });
  const edgeThickness = 1.5;
  const edges = [
    { size: [boxWidth + edgeThickness, edgeThickness, edgeThickness], pos: [0, boxDepth / 2, 0] },
    { size: [boxWidth + edgeThickness, edgeThickness, edgeThickness], pos: [0, -boxDepth / 2, 0] },
    { size: [boxWidth + edgeThickness, edgeThickness, edgeThickness], pos: [0, boxDepth / 2, boxHeight] },
    { size: [boxWidth + edgeThickness, edgeThickness, edgeThickness], pos: [0, -boxDepth / 2, boxHeight] },
    { size: [edgeThickness, edgeThickness, boxHeight], pos: [boxWidth / 2, boxDepth / 2, boxHeight / 2] },
    { size: [edgeThickness, edgeThickness, boxHeight], pos: [-boxWidth / 2, boxDepth / 2, boxHeight / 2] },
    { size: [edgeThickness, edgeThickness, boxHeight], pos: [boxWidth / 2, -boxDepth / 2, boxHeight / 2] },
    { size: [edgeThickness, edgeThickness, boxHeight], pos: [-boxWidth / 2, -boxDepth / 2, boxHeight / 2] },
  ];
  for (const edge of edges) {
    const geo = new THREE.BoxGeometry(edge.size[0], edge.size[1], edge.size[2]);
    const mesh = new THREE.Mesh(geo, edgeMaterial);
    mesh.position.set(edge.pos[0], edge.pos[1], edge.pos[2]);
    group.add(mesh);
  }

  const state = simulationProperties?.state || 'open';
  const airOrientation = simulationProperties?.airOrientation || 'inflow';

  const ventColor = state === 'open' ? 0x22c55e : 0x666666;
  const ventOpacity = state === 'open' ? 0.4 : 0.6;

  const grilleMaterial = new THREE.MeshStandardMaterial({
    color: ventColor,
    roughness: 0.3,
    metalness: 0.5,
    transparent: true,
    opacity: ventOpacity,
    side: THREE.DoubleSide,
  });

  const slotCount = 8;
  const slotWidth = boxWidth * 0.8;
  const slotDepthSize = boxDepth * 0.8 / (slotCount * 2 - 1);
  const startY = -boxDepth * 0.4;
  for (let i = 0; i < slotCount; i++) {
    const slotGeo = new THREE.BoxGeometry(slotWidth, slotDepthSize, 1.5);
    const slot = new THREE.Mesh(slotGeo, grilleMaterial);
    slot.position.set(0, startY + i * slotDepthSize * 2, boxHeight + 0.5);
    group.add(slot);
  }

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: ventColor,
    roughness: 0.3,
    metalness: 0.6,
  });
  const frameThickness = 2;
  const frameSegments = [
    { size: [boxWidth * 0.9, frameThickness, frameThickness], pos: [0, boxDepth * 0.42, boxHeight + 0.5] },
    { size: [boxWidth * 0.9, frameThickness, frameThickness], pos: [0, -boxDepth * 0.42, boxHeight + 0.5] },
    { size: [frameThickness, boxDepth * 0.84, frameThickness], pos: [boxWidth * 0.44, 0, boxHeight + 0.5] },
    { size: [frameThickness, boxDepth * 0.84, frameThickness], pos: [-boxWidth * 0.44, 0, boxHeight + 0.5] },
  ];
  for (const seg of frameSegments) {
    const geo = new THREE.BoxGeometry(seg.size[0], seg.size[1], seg.size[2]);
    const mesh = new THREE.Mesh(geo, frameMaterial);
    mesh.position.set(seg.pos[0], seg.pos[1], seg.pos[2]);
    group.add(mesh);
  }

  if (state === 'open') {
    const arrowColor = 0x22c55e;
    const arrowMat = new THREE.MeshStandardMaterial({
      color: arrowColor,
      roughness: 0.3,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85,
    });

    const arrowPositions = [
      [-10, -10], [10, -10],
      [-10, 10],  [10, 10],
    ];

    const isOutlet = airOrientation === 'outflow';
    const direction = isOutlet ? 1 : -1;

    for (const [x, y] of arrowPositions) {
      const arrowGroup = new THREE.Group();

      const shaftLength = 15;
      const coneHeight = 8;
      const arrowTotalLength = shaftLength + coneHeight;

      const shaftGeometry = new THREE.CylinderGeometry(1.2, 1.2, shaftLength, 8);
      const shaft = new THREE.Mesh(shaftGeometry, arrowMat);
      shaft.rotation.x = Math.PI / 2;

      const coneGeometry = new THREE.ConeGeometry(3.5, coneHeight, 8);
      const cone = new THREE.Mesh(coneGeometry, arrowMat);

      if (isOutlet) {
        shaft.position.z = shaftLength / 2;
        cone.rotation.x = -Math.PI / 2;
        cone.position.z = shaftLength + coneHeight / 2;
        arrowGroup.position.set(x, y, boxHeight + 3);
      } else {
        shaft.position.z = coneHeight + shaftLength / 2;
        cone.rotation.x = Math.PI / 2;
        cone.position.z = coneHeight / 2;
        arrowGroup.position.set(x, y, boxHeight + 3);
      }

      arrowGroup.add(shaft);
      arrowGroup.add(cone);
      arrowGroup.userData = { type: 'topVentArrow' };
      group.add(arrowGroup);
    }
  }

  return group;
};

export const createSideVentBoxModel = (simulationProperties?: { state?: string; airOrientation?: string }): THREE.Group => {
  const group = new THREE.Group();

  const boxWidth = 150;
  const boxDepth = 50;
  const boxHeight = 50;

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x8a8a8a,
    roughness: 0.4,
    metalness: 0.6,
  });

  const bodyGeometry = new THREE.BoxGeometry(boxWidth, boxDepth, boxHeight);
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.z = boxHeight / 2;
  group.add(body);

  const edgeMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b6b6b,
    roughness: 0.3,
    metalness: 0.7,
  });
  const edgeThickness = 1.5;
  const edges = [
    { size: [boxWidth + edgeThickness, edgeThickness, edgeThickness], pos: [0, boxDepth / 2, 0] },
    { size: [boxWidth + edgeThickness, edgeThickness, edgeThickness], pos: [0, -boxDepth / 2, 0] },
    { size: [boxWidth + edgeThickness, edgeThickness, edgeThickness], pos: [0, boxDepth / 2, boxHeight] },
    { size: [boxWidth + edgeThickness, edgeThickness, edgeThickness], pos: [0, -boxDepth / 2, boxHeight] },
    { size: [edgeThickness, edgeThickness, boxHeight], pos: [boxWidth / 2, boxDepth / 2, boxHeight / 2] },
    { size: [edgeThickness, edgeThickness, boxHeight], pos: [-boxWidth / 2, boxDepth / 2, boxHeight / 2] },
    { size: [edgeThickness, edgeThickness, boxHeight], pos: [boxWidth / 2, -boxDepth / 2, boxHeight / 2] },
    { size: [edgeThickness, edgeThickness, boxHeight], pos: [-boxWidth / 2, -boxDepth / 2, boxHeight / 2] },
  ];
  for (const edge of edges) {
    const geo = new THREE.BoxGeometry(edge.size[0], edge.size[1], edge.size[2]);
    const mesh = new THREE.Mesh(geo, edgeMaterial);
    mesh.position.set(edge.pos[0], edge.pos[1], edge.pos[2]);
    group.add(mesh);
  }

  const state = simulationProperties?.state || 'open';
  const airOrientation = simulationProperties?.airOrientation || 'inflow';

  const ventColor = state === 'open' ? 0x22c55e : 0x666666;
  const ventOpacity = state === 'open' ? 0.4 : 0.6;

  const grilleMaterial = new THREE.MeshStandardMaterial({
    color: ventColor,
    roughness: 0.3,
    metalness: 0.5,
    transparent: true,
    opacity: ventOpacity,
    side: THREE.DoubleSide,
  });

  const slotCount = 6;
  const slotWidth = boxWidth * 0.8;
  const slotHeightSize = boxHeight * 0.8 / (slotCount * 2 - 1);
  const startZ = boxHeight * 0.1;
  for (let i = 0; i < slotCount; i++) {
    const slotGeo = new THREE.BoxGeometry(slotWidth, 1.5, slotHeightSize);
    const slot = new THREE.Mesh(slotGeo, grilleMaterial);
    slot.position.set(0, boxDepth / 2 + 0.5, startZ + slotHeightSize / 2 + i * slotHeightSize * 2);
    group.add(slot);
  }

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: ventColor,
    roughness: 0.3,
    metalness: 0.6,
  });
  const frameThickness = 2;
  const frameSegments = [
    { size: [boxWidth * 0.9, frameThickness, frameThickness], pos: [0, boxDepth / 2 + 0.5, boxHeight * 0.08] },
    { size: [boxWidth * 0.9, frameThickness, frameThickness], pos: [0, boxDepth / 2 + 0.5, boxHeight * 0.92] },
    { size: [frameThickness, frameThickness, boxHeight * 0.84], pos: [boxWidth * 0.44, boxDepth / 2 + 0.5, boxHeight / 2] },
    { size: [frameThickness, frameThickness, boxHeight * 0.84], pos: [-boxWidth * 0.44, boxDepth / 2 + 0.5, boxHeight / 2] },
  ];
  for (const seg of frameSegments) {
    const geo = new THREE.BoxGeometry(seg.size[0], seg.size[1], seg.size[2]);
    const mesh = new THREE.Mesh(geo, frameMaterial);
    mesh.position.set(seg.pos[0], seg.pos[1], seg.pos[2]);
    group.add(mesh);
  }

  if (state === 'open') {
    const arrowColor = 0x22c55e;
    const arrowMat = new THREE.MeshStandardMaterial({
      color: arrowColor,
      roughness: 0.3,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85,
    });

    const arrowPositions = [
      [-30, boxHeight * 0.3],
      [30, boxHeight * 0.3],
      [-30, boxHeight * 0.7],
      [30, boxHeight * 0.7],
    ];

    const isOutlet = airOrientation === 'outflow';
    const direction = isOutlet ? 1 : -1;

    for (const [x, z] of arrowPositions) {
      const arrowGroup = new THREE.Group();

      const shaftLength = 15;
      const coneHeight = 8;

      const shaftGeometry = new THREE.CylinderGeometry(1.2, 1.2, shaftLength, 8);
      const shaft = new THREE.Mesh(shaftGeometry, arrowMat);

      const coneGeometry = new THREE.ConeGeometry(3.5, coneHeight, 8);
      const cone = new THREE.Mesh(coneGeometry, arrowMat);

      if (isOutlet) {
        shaft.position.y = shaftLength / 2;
        cone.position.y = shaftLength + coneHeight / 2;
        arrowGroup.position.set(x, boxDepth / 2 + 3, z);
      } else {
        cone.rotation.z = Math.PI;
        cone.position.y = coneHeight / 2;
        shaft.position.y = coneHeight + shaftLength / 2;
        arrowGroup.position.set(x, boxDepth / 2 + 3, z);
      }

      arrowGroup.add(shaft);
      arrowGroup.add(cone);
      arrowGroup.userData = { type: 'sideVentArrow' };
      group.add(arrowGroup);
    }
  }

  return group;
};

export const createBlockModel = (): THREE.Group => {
  const group = new THREE.Group();

  // Simple cube block with completely matte material (no shine or reflections)
  const blockGeometry = new THREE.BoxGeometry(80, 80, 80);
  const blockMaterial = new THREE.MeshLambertMaterial({
    color: 0xf5f5f5, // Very light gray, almost white
  });
  
  const block = new THREE.Mesh(blockGeometry, blockMaterial);
  block.position.z = 40; // Half height to sit on ground
  group.add(block);

  return group;
};