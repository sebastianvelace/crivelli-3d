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

  // FrontSide con las normales hacia adentro: desde afuera (vista de maqueta) las paredes no tapan nada.
  const wallMat = new THREE.MeshStandardMaterial({ color: '#4a2a2a', roughness: 0.95 });
  const floorMat = new THREE.MeshStandardMaterial({ color: '#5b4330', roughness: 0.8 });
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
  const depth = ROOM.z1 - z;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x1 - ROOM.x0, depth), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.001, z + depth / 2);
  const ceiling = floor.clone();
  ceiling.material = wallMat;
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM.h;
  const side = (x, ry) => {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(depth, ROOM.h), wallMat);
    w.rotation.y = ry;
    w.position.set(x, ROOM.h / 2, z + depth / 2);
    return w;
  };
  const back = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.x1 - ROOM.x0, ROOM.h), wallMat);
  back.position.set(0, ROOM.h / 2, ROOM.z1);
  back.rotation.y = Math.PI;
  group.add(floor, ceiling, side(ROOM.x0, Math.PI / 2), side(ROOM.x1, -Math.PI / 2), back);

  // Zócalo oscuro
  const skirting = new THREE.Mesh(
    new THREE.BoxGeometry(ROOM.x1 - ROOM.x0, 0.14, 0.03),
    new THREE.MeshStandardMaterial({ color: '#2a1a14', roughness: 0.6 }),
  );
  skirting.position.set(0, 0.07, z + 0.01);
  group.add(skirting);

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
    ['EL OJO DE CRIVELLI', `ojo a ${calib.eyeHeightM.toFixed(2).replace('.', ',')} m · a ${Math.round(d * 100)} cm del cuadro`],
    0.9, 0.2, { bg: null, fg: '#ffd400', size: 40 },
  );
  label.rotation.x = -Math.PI / 2;
  label.position.set(0, 0.007, 0.42);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, space.eyeHeight, 8),
    new THREE.MeshBasicMaterial({ color: '#ffd400', transparent: true, opacity: 0.5 }),
  );
  pole.position.set(0, space.eyeHeight / 2, 0);
  const eyeDot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffd400' }));
  eyeDot.position.copy(space.eye);
  const marker = new THREE.Group();
  marker.add(ring, label, pole, eyeDot);
  group.add(marker);

  // Luces (solo afectan a los materiales del museo; la escena proyectada no usa luces)
  const hemi = new THREE.HemisphereLight('#fff2dc', '#2a1d14', 1.6);
  const spot = new THREE.SpotLight('#fff1d6', 40, 0, 0.55, 0.5, 2);
  spot.position.set(0, ROOM.h - 0.2, 2.2);
  spot.target.position.set(cxp, cyp, z);
  group.add(hemi, spot, spot.target);

  group.traverse((o) => o.layers.set(MUSEUM_LAYER));

  return {
    group,
    panel,
    portal,
    marker,
    windowDistance: d,
    aperture: { x0: tl.x, x1: br.x, y0: br.y, y1: tl.y, z },
    /** Pose inicial: de pie en la sala, algo al costado, mirando el cuadro. */
    startPose: { position: new THREE.Vector3(1.5, 1.62, 4.6), target: new THREE.Vector3(cxp, cyp - 0.15, z) },
    setPanelOpacity(v) {
      panelMat.opacity = v;
      panel.visible = v > 0.001;
      panelMat.depthWrite = v > 0.99;
    },
  };
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
