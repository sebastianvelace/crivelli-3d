import * as THREE from 'three';
import { createMuseumMaterials } from './museumMaterials.js';

/** La cámara del pintor nunca dibuja esta capa. */
export const MUSEUM_LAYER = 2;
export const ROOM = { x0: -5, x1: 5, z1: 7.5, h: 5 };
export const SKYLIGHT_HEIGHT = 6.75;
export const BENCH = { x: 0, fromPainting: 3.75, width: 1.8, depth: 0.45 };

/** Construye la sala alrededor de la ventana de Alberti calibrada. */
export function createMuseum(space, calib, paintingTexture, galleryImage) {
  const group = new THREE.Group();
  group.name = 'museum';
  const d = calib.panelWidthCm / 100 / (space.W / space.f);
  const tl = space.pointAtDepth(0, 0, d);
  const br = space.pointAtDepth(space.W, space.H, d);
  const panelW = br.x - tl.x;
  const panelH = tl.y - br.y;
  const cx = (tl.x + br.x) / 2;
  const cy = (tl.y + br.y) / 2;
  const z = -d;
  const width = ROOM.x1 - ROOM.x0;
  const depth = ROOM.z1 - z;
  const mid = z + depth / 2;
  const materials = createMuseumMaterials(width, depth);
  const frameWidth = 0.16;

  const wallShape = new THREE.Shape([
    new THREE.Vector2(ROOM.x0, 0), new THREE.Vector2(ROOM.x1, 0),
    new THREE.Vector2(ROOM.x1, ROOM.h), new THREE.Vector2(ROOM.x0, ROOM.h),
  ]);
  // El marco cubre el hueco de obra. El borde interior y el stencil conservan el rectángulo calibrado.
  const overlap = frameWidth - 0.025;
  wallShape.holes.push(new THREE.Path([
    new THREE.Vector2(tl.x - overlap, br.y - overlap), new THREE.Vector2(br.x + overlap, br.y - overlap),
    new THREE.Vector2(br.x + overlap, tl.y + overlap), new THREE.Vector2(tl.x - overlap, tl.y + overlap),
  ]));
  const frontMaterial = materials.wall.clone();
  frontMaterial.side = THREE.DoubleSide;
  const frontWall = new THREE.Mesh(new THREE.ShapeGeometry(wallShape), frontMaterial);
  frontWall.position.z = z - 0.01;
  frontWall.receiveShadow = true;
  group.add(frontWall, floor(width, depth, mid, materials.floor));

  for (const x of [ROOM.x0, ROOM.x1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(depth, ROOM.h), materials.wall);
    wall.position.set(x, ROOM.h / 2, mid);
    wall.rotation.y = x === ROOM.x0 ? Math.PI / 2 : -Math.PI / 2;
    wall.receiveShadow = true;
    group.add(wall);
  }
  addVault(group, z, mid, materials.ceiling);
  addStonework(group, z, mid, materials.stone);
  addAnnex(group, width, materials);
  if (galleryImage) group.add(createGalleryArtwork(galleryImage, materials.gold, mid));

  const frame = createFrame(cx, cy, z, panelW, panelH, frameWidth, materials.gold);
  group.add(frame);
  const panelMat = new THREE.MeshBasicMaterial({
    map: paintingTexture, transparent: true, opacity: 1, depthWrite: true, toneMapped: false,
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), panelMat);
  panel.position.set(cx, cy, z);
  group.add(panel);

  const portal = new THREE.Mesh(panel.geometry, new THREE.MeshBasicMaterial({
    colorWrite: false, depthWrite: false, depthTest: false, toneMapped: false,
    stencilWrite: true, stencilRef: 1, stencilZPass: THREE.ReplaceStencilOp,
  }));
  portal.position.copy(panel.position);
  portal.renderOrder = -3;
  portal.visible = false;
  group.add(portal);

  const plaque = createPlaque();
  plaque.position.set(br.x + frameWidth + 0.35 + 0.15, 1.45, z + 0.018);
  group.add(plaque);
  const marker = createEyePlate(calib, d);
  group.add(marker, createBench(z + BENCH.fromPainting));
  const shadowLight = addGalleryLighting(group, cx, cy, z, mid);
  group.traverse((object) => object.layers.set(MUSEUM_LAYER));
  shadowLight.shadow.camera.layers.set(MUSEUM_LAYER);

  return {
    group, panel, portal, marker, plaque, shadowLight,
    windowDistance: d,
    aperture: { x0: tl.x, x1: br.x, y0: br.y, y1: tl.y, z },
    startPose: { position: new THREE.Vector3(1.7, 1.66, 5.35), target: new THREE.Vector3(cx, cy + 0.47, z) },
    setPanelOpacity(v) {
      panelMat.opacity = v;
      panel.visible = v > 0.001;
      panelMat.depthWrite = v > 0.99;
    },
  };
}

function box(w, h, d, material, x, y, z, casts = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = casts;
  return mesh;
}

function floor(width, depth, z, material) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.z = z;
  mesh.receiveShadow = true;
  return mesh;
}

function addVault(room, front, mid, material) {
  const outer = [
    [ROOM.x0, ROOM.h, front], [ROOM.x1, ROOM.h, front],
    [ROOM.x1, ROOM.h, ROOM.z1], [ROOM.x0, ROOM.h, ROOM.z1],
  ];
  const inner = [
    [-2.7, SKYLIGHT_HEIGHT, mid - 1.85], [2.7, SKYLIGHT_HEIGHT, mid - 1.85],
    [2.7, SKYLIGHT_HEIGHT, mid + 1.85], [-2.7, SKYLIGHT_HEIGHT, mid + 1.85],
  ];
  const positions = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    positions.push(...outer[i], ...outer[j], ...inner[j], ...outer[i], ...inner[j], ...inner[i]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  room.add(new THREE.Mesh(geometry, material));

  const glass = new THREE.MeshBasicMaterial({ color: '#eef0ee', toneMapped: false });
  const mullion = new THREE.MeshStandardMaterial({ color: '#61676b', roughness: 0.68 });
  room.add(box(5.4, 0.04, 3.7, glass, 0, SKYLIGHT_HEIGHT + 0.018, mid));
  for (let i = -2; i <= 2; i++) {
    room.add(box(0.036, 0.035, 3.7, mullion, i * 1.35, SKYLIGHT_HEIGHT - 0.012, mid));
  }
  for (const offset of [-1.85, 0, 1.85]) {
    room.add(box(5.4, 0.035, 0.036, mullion, 0, SKYLIGHT_HEIGHT - 0.012, mid + offset));
  }
}

function addStonework(room, front, mid, material) {
  const width = ROOM.x1 - ROOM.x0;
  const depth = ROOM.z1 - front;
  for (const [y, height, lip] of [[4.94, 0.12, 0.15], [4.84, 0.08, 0.10], [4.78, 0.04, 0.055], [0.10, 0.20, 0.045]]) {
    const casts = y > 4;
    room.add(box(width, height, lip, material, 0, y, front + lip / 2, casts));
    const rearSections = casts ? [[0, width]] : [[-3.1, 3.8], [3.1, 3.8]];
    for (const [x, length] of rearSections) room.add(box(length, height, lip, material, x, y, ROOM.z1 - lip / 2, casts));
    for (const x of [ROOM.x0 + lip / 2, ROOM.x1 - lip / 2]) {
      room.add(box(lip, height, depth, material, x, y, mid, casts));
    }
  }
  for (const x of [ROOM.x0 + 0.12, ROOM.x1 - 0.12]) {
    for (const z of [front + 0.12, ROOM.z1 - 0.12]) {
      room.add(box(0.24, 4.73, 0.24, material, x, 2.365, z));
    }
  }
}

function addAnnex(room, width, { wall, stone, floor: oak, ceiling }) {
  const z = ROOM.z1;
  const radius = 1.05;
  const spring = 2.32;
  const sideWidth = width / 2 - radius;
  for (const sign of [-1, 1]) {
    room.add(
      box(sideWidth, ROOM.h, 0.16, wall, sign * (radius + sideWidth / 2), ROOM.h / 2, z + 0.08),
      box(0.16, spring, 0.21, stone, sign * (radius + 0.08), spring / 2, z + 0.015),
      box(0.11, 3.75, 2.14, wall, sign * 1.54, 1.875, z + 1.10),
    );
  }
  const spandrel = new THREE.Shape();
  spandrel.moveTo(-radius, ROOM.h);
  spandrel.lineTo(-radius, spring);
  spandrel.absarc(0, spring, radius, Math.PI, 0, true);
  spandrel.lineTo(radius, ROOM.h);
  spandrel.closePath();
  const arch = new THREE.Shape();
  const innerRadius = radius - 0.008;
  arch.moveTo(-radius - 0.16, spring);
  arch.absarc(0, spring, radius + 0.16, Math.PI, 0, true);
  arch.lineTo(innerRadius, spring);
  arch.absarc(0, spring, innerRadius, 0, Math.PI, false);
  arch.closePath();
  for (const [shape, depth, material, offset] of [[spandrel, 0.16, wall, 0], [arch, 0.21, stone, -0.085]]) {
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 }), material);
    mesh.position.z = z + offset;
    room.add(mesh);
  }
  room.add(
    floor(3.1, 2.15, z + 1.075, oak),
    box(3.2, 3.75, 0.12, wall, 0, 1.875, z + 2.15),
    box(3.2, 0.1, 2.18, ceiling, 0, 3.75, z + 1.12),
  );
  const wash = new THREE.RectAreaLight('#f6f3ed', 4.8, 2.1, 1.4);
  wash.position.set(0, 3.68, z + 1.25);
  wash.lookAt(0, 0.6, z + 1.55);
  room.add(wash);
}

function createFrame(cx, cy, z, width, height, lip, material) {
  const profile = new THREE.Shape();
  profile.moveTo(0, 0.006);
  profile.lineTo(0, 0.028);
  profile.lineTo(0.012, 0.028);
  profile.lineTo(0.02, 0.018);
  profile.quadraticCurveTo(0.032, 0.012, 0.055, 0.051);
  profile.quadraticCurveTo(0.082, 0.081, 0.106, 0.061);
  profile.lineTo(0.127, 0.053);
  profile.lineTo(0.14, 0.071);
  profile.lineTo(lip, 0.071);
  profile.lineTo(lip, 0);
  profile.closePath();
  const strip = new THREE.ExtrudeGeometry(profile, { depth: 1, bevelEnabled: false, curveSegments: 8 });
  const frame = new THREE.Group();
  frame.name = 'museum-frame';
  for (const [ox, oy, length, edge] of [[0, 1, width, height], [1, 0, height, width],
    [0, -1, width, height], [-1, 0, height, width]]) {
    const geo = strip.clone();
    const positions = geo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const outward = positions.getX(i);
      const forward = positions.getY(i);
      const along = (positions.getZ(i) - 0.5) * (length + 2 * outward);
      positions.setXYZ(i, cx + ox * (edge / 2 + outward) + oy * along,
        cy + oy * (edge / 2 + outward) - ox * along, z - 0.007 + forward);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    frame.add(mesh);
  }
  strip.dispose();
  return frame;
}

function createBench(z) {
  const wood = new THREE.MeshStandardMaterial({ color: '#86633f', roughness: 0.58 });
  const leather = new THREE.MeshStandardMaterial({ color: '#343230', roughness: 0.62 });
  const bench = new THREE.Group();
  bench.name = 'museum-bench';
  bench.position.set(BENCH.x, 0, z);
  bench.add(
    box(BENCH.width - 0.04, 0.08, BENCH.depth - 0.045, wood, 0, 0.335, 0, true),
    box(BENCH.width, 0.074, BENCH.depth, leather, 0, 0.412, 0, true),
  );
  for (const x of [-0.73, 0.73]) {
    for (const localZ of [-0.146, 0.146]) bench.add(box(0.086, 0.31, 0.08, wood, x, 0.155, localZ, true));
  }
  return bench;
}

function createGalleryArtwork(image, frameMaterial, z) {
  const height = 1.505;
  const width = 1.073;
  const canvas = document.createElement('canvas');
  canvas.height = 256;
  canvas.width = Math.round(canvas.height * image.naturalWidth / image.naturalHeight);
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  panel.position.z = 0.008;
  panel.name = 'madonna-rondine';
  const frame = box(width + 0.085, height + 0.085, 0.042, frameMaterial, 0, 0, -0.017);
  const artwork = new THREE.Group();
  artwork.position.set(ROOM.x0 + 0.05, 1.56, z);
  artwork.rotation.y = Math.PI / 2;
  artwork.add(frame, panel);
  return artwork;
}

function addGalleryLighting(room, x, y, z, mid) {
  const sky = new THREE.RectAreaLight('#f4f1ea', 5, 5.3, 3.6);
  sky.position.set(0, SKYLIGHT_HEIGHT - 0.08, mid);
  sky.lookAt(0, 0, mid);
  room.add(sky, new THREE.HemisphereLight('#f5f7fa', '#beb6a6', 0.34));
  const housing = new THREE.MeshStandardMaterial({ color: '#52585d', metalness: 0.55, roughness: 0.48 });
  const lens = new THREE.MeshBasicMaterial({ color: '#fff2d9', toneMapped: false });
  const cylinder = new THREE.CylinderGeometry(0.071, 0.083, 0.19, 24);
  const bezel = new THREE.TorusGeometry(0.073, 0.006, 8, 24);
  const face = new THREE.CircleGeometry(0.067, 24);
  const railZ = z + 2.35;
  const railY = ROOM.h - 0.1;
  room.add(box(3.3, 0.04, 0.07, housing, x, railY, railZ));
  const target = new THREE.Vector3(x, y, z);
  for (const ox of [-1.12, 0, 1.12]) {
    const fixture = new THREE.Group();
    fixture.position.set(x + ox, railY - 0.22, railZ);
    fixture.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), target.clone().sub(fixture.position).normalize());
    for (const geometry of [bezel, face]) {
      const mesh = new THREE.Mesh(geometry, geometry === face ? lens : housing);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = -0.096;
      fixture.add(mesh);
    }
    fixture.add(new THREE.Mesh(cylinder, housing));
    room.add(fixture, box(0.035, 0.17, 0.035, housing, x + ox, railY - 0.095, railZ));
  }
  const spot = new THREE.SpotLight('#ffd8a6', 88, 12, 0.44, 0.8, 2);
  const origin = new THREE.Vector3(x, railY - 0.22, railZ);
  spot.position.copy(origin).addScaledVector(target.clone().sub(origin).normalize(), 0.12);
  spot.target.position.copy(target);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.camera.near = 0.5;
  spot.shadow.camera.far = 9;
  spot.shadow.bias = -0.00012;
  spot.shadow.normalBias = 0.008;
  spot.shadow.radius = 3;
  room.add(spot, spot.target);
  return spot;
}

function createPlaque() {
  const lines = [
    ['Carlo Crivelli', 126, 115],
    ['Hacia 1430/1435 – hacia 1494', 76, 245],
    ['La Anunciación, con san Emigdio, 1486', 92, 390, true],
    ['Temple al huevo con algo de óleo sobre lienzo', 82, 555],
    ['207 × 146,7 cm', 82, 652],
    ['Donado por Lord Taunton, 1864 · NG739', 82, 812],
    ['The National Gallery, Londres', 82, 910],
    ['Pintada para el convento de la Anunziata de Ascoli Piceno.', 72, 1125],
    ['La calle fuga hacia un único punto, a la altura del ojo del pintor.', 72, 1223],
  ];
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1502;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#efebe2';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1b1b1a';
  ctx.textBaseline = 'top';
  for (const [line, size, y, italic] of lines) {
    ctx.font = `${italic ? 'italic ' : ''}${size}px Baskervville, Georgia, serif`;
    ctx.fillText(line, 92, y, 1864);
  }
  const raster = document.createElement('canvas');
  raster.width = 640;
  raster.height = Math.round(640 * 22 / 30);
  raster.getContext('2d').drawImage(canvas, 0, 0, raster.width, raster.height);
  const texture = new THREE.CanvasTexture(raster);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.22),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
  plaque.name = 'museum-plaque';
  return plaque;
}

function createEyePlate(calib, distance) {
  const marker = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: '#a08045', metalness: 1, roughness: 0.4 });
  const plate = box(0.56, 0.004, 0.14, brass, 0, 0.002, 0);
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.canvas.width = 512;
  ctx.canvas.height = 128;
  ctx.fillStyle = '#3d311d';
  ctx.font = 'bold 23px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const height = calib.eyeHeightM.toFixed(2).replace('.', ',');
  ctx.fillText(`EL OJO DE CRIVELLI · ${height} m · ${Math.round(distance * 100)} cm`, 256, 64, 460);
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const inscription = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.14),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
  inscription.rotation.x = -Math.PI / 2;
  inscription.position.y = 0.0042;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.316, 0.326, 64),
    new THREE.MeshBasicMaterial({ color: '#eccd40', transparent: true, opacity: 0.65, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.004;
  marker.add(plate, inscription, ring);
  return marker;
}
