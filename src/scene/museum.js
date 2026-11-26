import * as THREE from 'three';

/** Capa propia del museo: la cámara del pintor no la ve (no entra en la proyección). */
export const MUSEUM_LAYER = 2;
export const ROOM = { x0: -5, x1: 5, z1: 7.5, h: 4.6 };

/**
 * Sala de museo con el panel colgado a su tamaño real.
 *
 * El panel NO se coloca a ojo: es exactamente la "ventana de Alberti" calculada.
 * Mide 146,5 cm de ancho y está a la distancia del ojo que dan los puntos de
 * distancia (≈ 111 cm), con el punto de fuga a la altura del ojo (1,51 m). Así, el
 * piso del museo (y = 0) es el mismo piso de la calle pintada: el cuadro cuelga
 * como una ventana abierta a la calle.
 *
 * En el piso hay una marca justo debajo del ojo de Crivelli. Parado ahí, el cuadro
 * puede volverse transparente sin que la imagen cambie, porque el espacio 3D de
 * detrás proyecta exactamente la pintura.
 */
export function createMuseum(space, calib, paintingTexture) {
  const group = new THREE.Group();
  group.name = 'museum';

  const d = calib.panelWidthCm / 100 / (space.W / space.f); // distancia ojo-cuadro (m)
  const corner = (u, v) => space.pointAtDepth(u, v, d);
  const tl = corner(0, 0);
  const br = corner(space.W, space.H);
  const panelW = br.x - tl.x;
  const panelH = tl.y - br.y;
  const cxp = (tl.x + br.x) / 2;
  const cyp = (tl.y + br.y) / 2;
  const z = -d;

  const wallMat = new THREE.MeshStandardMaterial({ color: '#593b35', roughness: 0.95 });
  const floorMat = new THREE.MeshStandardMaterial({ color: '#5b4330', roughness: 0.8 });
  const ceilingMat = new THREE.MeshStandardMaterial({ color: '#c6b69e', roughness: 0.95 });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#a1917b', roughness: 0.9 });
  const goldMat = new THREE.MeshStandardMaterial({ color: '#b8913f', roughness: 0.35, metalness: 0.7 });

  // Pared del cuadro, con un hueco del tamaño del marco: por ahí se "entra" a la calle.
  const m = 0.09; // ancho del marco
  const wallShape = new THREE.Shape([
    new THREE.Vector2(ROOM.x0, 0), new THREE.Vector2(ROOM.x1, 0),
    new THREE.Vector2(ROOM.x1, ROOM.h), new THREE.Vector2(ROOM.x0, ROOM.h),
  ]);
  wallShape.holes.push(new THREE.Path([
    new THREE.Vector2(tl.x - m, br.y - m), new THREE.Vector2(br.x + m, br.y - m),
    new THREE.Vector2(br.x + m, tl.y + m), new THREE.Vector2(tl.x - m, tl.y + m),
  ]));
  // Doble cara: desde la calle se ve la pared con la ventana que da al museo.
  const wall = new THREE.Mesh(new THREE.ShapeGeometry(wallShape), wallMat.clone());
  wall.material.side = THREE.DoubleSide;
  wall.position.z = z - 0.01;
  group.add(wall);

  // Piso, techo y paredes de la sala (delante del cuadro: z > -d)
  const width = ROOM.x1 - ROOM.x0;
  const depth = ROOM.z1 - z;
  const middle = z + depth / 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.001, middle);
  const ceiling = box(width + 0.03, 0.18, depth + 0.03, ceilingMat, 0, ROOM.h + 0.09, middle);
  ceiling.name = 'museum-ceiling';
  const side = (x, ry) => {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(depth, ROOM.h), wallMat);
    w.rotation.y = ry;
    w.position.set(x, ROOM.h / 2, middle);
    return w;
  };
  const back = new THREE.Mesh(new THREE.PlaneGeometry(width, ROOM.h), wallMat);
  back.position.set(0, ROOM.h / 2, ROOM.z1);
  back.rotation.y = Math.PI;
  group.add(floor, ceiling, side(ROOM.x0, Math.PI / 2), side(ROOM.x1, -Math.PI / 2), back);

  const baseboardMat = new THREE.MeshStandardMaterial({ color: '#3a281f', roughness: 0.67 });
  for (const [height, section, thickness, material] of [
    [ROOM.h - 0.07, 0.14, 0.14, trimMat],
    [ROOM.h - 0.17, 0.06, 0.065, trimMat],
    [0.10, 0.20, 0.055, baseboardMat],
  ]) {
    group.add(
      box(width, section, thickness, material, 0, height, z + thickness / 2),
      box(width, section, thickness, material, 0, height, ROOM.z1 - thickness / 2),
      box(thickness, section, depth, material, ROOM.x0 + thickness / 2, height, middle),
      box(thickness, section, depth, material, ROOM.x1 - thickness / 2, height, middle),
    );
  }

  // Marco dorado (cuatro listones por fuera del panel)
  const bar = (w, h, x, y) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), goldMat);
    b.position.set(x, y, z + 0.035);
    return b;
  };
  group.add(
    bar(panelW + 2 * m, m, cxp, tl.y + m / 2),
    bar(panelW + 2 * m, m, cxp, br.y - m / 2),
    bar(m, panelH, tl.x - m / 2, cyp),
    bar(m, panelH, br.x + m / 2, cyp),
  );

  // El panel pintado: su opacidad baja a 0 cuando "se vuelve ventana".
  const panelMat = new THREE.MeshBasicMaterial({ map: paintingTexture, transparent: true, opacity: 1, depthWrite: true });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), panelMat);
  panel.position.set(cxp, cyp, z);
  group.add(panel);

  const portal = new THREE.Mesh(panel.geometry, new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    depthTest: false,
    stencilWrite: true,
    stencilRef: 1,
    stencilZPass: THREE.ReplaceStencilOp,
  }));
  portal.position.copy(panel.position);
  portal.renderOrder = -3;
  portal.visible = false;
  group.add(portal);

  // Cartela junto al cuadro
  const plaque = textPlane(
    ['Carlo Crivelli (c. 1430–1495)', 'La Anunciación con san Emigdio, 1486', '207 × 146,5 cm · National Gallery, Londres'],
    0.42, 0.16, { bg: '#efe6d2', fg: '#2a2018', size: 34 },
  );
  plaque.position.set(br.x + m + 0.45, 1.45, z + 0.02);
  group.add(plaque);

  // Marca en el piso, justo debajo del ojo
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.16, 0.2, 48),
    new THREE.MeshBasicMaterial({ color: '#ffd400', side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.006, 0);
  const label = textPlane(
    ['EL OJO DE CRIVELLI', `${calib.eyeHeightM.toFixed(2).replace('.', ',')} m de alto · a ${Math.round(d * 100)} cm del cuadro`],
    1.25, 0.35, { bg: '#2a1a14', fg: '#ffe277', size: 64 },
  );
  label.rotation.x = -Math.PI * 0.39;
  label.position.set(0, 0.065, -0.4);
  const eyeDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 16, 12),
    new THREE.MeshBasicMaterial({ color: '#ffe277' }),
  );
  eyeDot.position.copy(space.eye);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.053, 16, 12),
    new THREE.MeshBasicMaterial({ color: '#ffd400', transparent: true, opacity: 0.22, depthWrite: false }),
  );
  eyeDot.add(halo);
  const marker = new THREE.Group();
  marker.add(ring, label, eyeDot);
  group.add(marker);

  addGalleryLighting(group, { x: cxp, y: cyp, z });

  group.traverse((o) => o.layers.set(MUSEUM_LAYER));

  return {
    group,
    panel,
    portal,
    marker,
    windowDistance: d,
    aperture: { x0: tl.x, x1: br.x, y0: br.y, y1: tl.y, z },
    /** Pose inicial: de pie en la sala, algo al costado, mirando el cuadro. */
    startPose: { position: new THREE.Vector3(1.4, 1.66, 5.15), target: new THREE.Vector3(cxp, cyp + 0.3, z) },
    setPanelOpacity(v) {
      panelMat.opacity = v;
      panel.visible = v > 0.001;
      panelMat.depthWrite = v > 0.99;
    },
  };
}

function box(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function addGalleryLighting(room, painting) {
  const lighting = new THREE.Group();
  lighting.name = 'museum-lighting';
  const bronze = new THREE.MeshStandardMaterial({ color: '#403530', metalness: 0.32, roughness: 0.52 });
  const warmGlass = new THREE.MeshBasicMaterial({ color: '#fff2d4' });
  const housing = new THREE.CylinderGeometry(0.073, 0.108, 0.21, 24);
  const lens = new THREE.CircleGeometry(0.085, 24);
  const down = new THREE.Vector3(0, -1, 0);

  for (const z of [0.32, 3.6]) {
    const width = z < 1 ? 3.8 : 7.4;
    lighting.add(box(width, 0.046, 0.055, bronze, 0, ROOM.h - 0.027, z));
  }
  for (const [x, z, to, power, spread] of [
    [painting.x - 1.36, 0.32, [painting.x - 0.42, painting.y, painting.z], 30, 0.47],
    [painting.x + 1.36, 0.32, [painting.x + 0.42, painting.y, painting.z], 30, 0.47],
    [-3.15, 3.6, [ROOM.x0 + 0.03, 1.65, 3.45], 44, 0.52],
    [3.15, 3.6, [ROOM.x1 - 0.03, 1.65, 3.45], 44, 0.52],
  ]) {
    const from = new THREE.Vector3(x, ROOM.h - 0.31, z);
    const target = new THREE.Vector3(...to);
    const direction = target.clone().sub(from).normalize();
    const fixture = new THREE.Group();
    fixture.position.copy(from);
    fixture.quaternion.setFromUnitVectors(down, direction);
    const glass = new THREE.Mesh(lens, warmGlass);
    glass.rotation.x = Math.PI / 2;
    glass.position.y = -0.106;
    fixture.add(new THREE.Mesh(housing, bronze), glass);
    lighting.add(fixture, box(0.043, 0.23, 0.043, bronze, x, ROOM.h - 0.15, z));

    const spot = new THREE.SpotLight('#fff0d7', power, 9, spread, 0.7, 2);
    spot.position.copy(from).addScaledVector(direction, 0.115);
    spot.target.position.copy(target);
    lighting.add(spot, spot.target);
  }

  const ambient = new THREE.HemisphereLight('#fff7e8', '#79644f', 1.75);
  const bounce = new THREE.PointLight('#ffe9cb', 13, 8, 2);
  bounce.position.set(0, 3.1, 2.9);
  lighting.add(ambient, bounce);
  room.add(lighting);
}

/** Plano con texto dibujado en un canvas (cartelas y rótulos del museo). */
function textPlane(lines, w, h, { bg, fg, size }) {
  const scale = 1024 / w;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lh = canvas.height / (lines.length + 0.6);
  lines.forEach((t, i) => {
    ctx.font = `${i === 0 ? 'bold ' : ''}${size * (i === 0 ? 1.15 : 1)}px Georgia, serif`;
    ctx.fillText(t, canvas.width / 2, lh * (i + 0.8));
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: !bg, side: THREE.DoubleSide }),
  );
}
