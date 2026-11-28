import * as THREE from 'three';

export const HELPER_LAYER = 1;

/**
 * Ayudas didácticas en 3D (no participan en la proyección de la textura):
 *  - la "ventana" de Alberti: el cuadro a su tamaño real (146,5 cm) y a la
 *    distancia correcta del ojo, con la pintura semitransparente;
 *  - la pirámide visual (del ojo a las esquinas del cuadro);
 *  - el rayo céntrico (ojo -> punto de fuga) y el horizonte;
 *  - las ortogonales: rectas paralelas a la calle que en 3D nunca se cortan,
 *    pero que vistas desde el ojo convergen en el punto de fuga;
 *  - los puntos de distancia y las diagonales a 45° de las baldosas.
 */
export function createPerspectiveHelpers(space, calib, planes, paintingTexture) {
  const group = new THREE.Group();
  group.name = 'perspectiveHelpers';

  // Distancia del ojo al cuadro en metros: ancho real / ancho en "tangente".
  const d = calib.panelWidthCm / 100 / (space.W / space.f);
  const corner = (u, v) => space.pointAtDepth(u, v, d);
  const tl = corner(0, 0);
  const tr = corner(space.W, 0);
  const br = corner(space.W, space.H);
  const bl = corner(0, space.H);
  const vpOnWindow = corner(space.cx, space.cy);

  // Ventana de Alberti con la pintura
  const windowGeo = new THREE.BufferGeometry().setFromPoints([bl, br, tr, tl]);
  windowGeo.setIndex([0, 1, 2, 0, 2, 3]);
  windowGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  const windowMesh = new THREE.Mesh(
    windowGeo,
    new THREE.MeshBasicMaterial({ toneMapped: false, map: paintingTexture, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
  );
  group.add(windowMesh);

  const line = (points, color, opacity = 1) =>
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ toneMapped: false, color, transparent: opacity < 1, opacity }),
    );
  const segments = (pairs, color, opacity = 1) =>
    new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(pairs.flat()),
      new THREE.LineBasicMaterial({ toneMapped: false, color, transparent: opacity < 1, opacity }),
    );

  // Marco de la ventana y pirámide visual
  group.add(line([tl, tr, br, bl, tl], 0xd8b45a));
  group.add(segments([tl, tr, br, bl].map((c) => [space.eye, c]), 0xd8b45a, 0.55));

  // Rayo céntrico y horizonte (sobre la ventana y prolongado a lo lejos)
  const far = space.pointAtDepth(space.cx, space.cy, 70);
  group.add(line([space.eye, far], 0xff3b3b));
  group.add(line([corner(0, space.cy), corner(space.W, space.cy)], 0xffd400));
  group.add(line([space.pointAtDepth(-3000, space.cy, 70), space.pointAtDepth(6000, space.cy, 70)], 0xffd400, 0.5));

  // Ojo y punto de fuga
  const dot = (p, color, r) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ toneMapped: false, color }));
    m.position.copy(p);
    return m;
  };
  group.add(dot(space.eye, 0xffd400, 0.06));
  group.add(dot(vpOnWindow, 0xff3b3b, 0.025));

  // Puntos de distancia: sobre el horizonte, a ±d del punto de fuga en la ventana.
  const dpL = vpOnWindow.clone().add(new THREE.Vector3(-d, 0, 0));
  const dpR = vpOnWindow.clone().add(new THREE.Vector3(d, 0, 0));
  group.add(dot(dpL, 0x3c82ff, 0.025), dot(dpR, 0x3c82ff, 0.025));

  // Ortogonales en 3D: juntas longitudinales de baldosas y aristas de las paredes.
  const D0 = calib.floorFrontDepthM;
  const s = calib.tileSizeM;
  const ortho = [];
  const x0 = (35 - space.cx) * D0 / space.f; // junta medida en el borde frontal (u = 35 px)
  for (let k = -1; k <= 6; k++) {
    const x = x0 + k * s;
    ortho.push([new THREE.Vector3(x, 0.005, -D0), new THREE.Vector3(x, 0.005, -11.4)]);
  }
  const xl = planes.get('pared_izquierda').c;
  const xr = planes.get('pared_derecha').c;
  for (const y of [0, 3, 6]) {
    ortho.push([new THREE.Vector3(xl, y, -4.5), new THREE.Vector3(xl, y, -60)]);
    ortho.push([new THREE.Vector3(xr, y, -D0), new THREE.Vector3(xr, y, -60)]);
  }
  group.add(segments(ortho, 0xff3b3b, 0.75));

  // Diagonales de baldosas a 45°: fugan a los puntos de distancia
  const diag = [];
  for (let k = -2; k <= 4; k++) {
    const x = x0 + k * s;
    diag.push([new THREE.Vector3(x, 0.006, -D0), new THREE.Vector3(x + 4 * s, 0.006, -D0 - 4 * s)]);
  }
  group.add(segments(diag, 0x3c82ff, 0.9));

  group.traverse((o) => o.layers.set(HELPER_LAYER));
  return group;
}

/** Marcador del ojo para el modo maqueta (siempre visible en ese modo). */
export function createEyeMarker(space) {
  const g = new THREE.Group();
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), new THREE.MeshBasicMaterial({ toneMapped: false, color: 0xffd400 }));
  eye.position.copy(space.eye);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, space.eyeHeight, 8),
    new THREE.MeshBasicMaterial({ toneMapped: false, color: 0xffd400 }),
  );
  pole.position.set(0, space.eyeHeight / 2, 0);
  g.add(eye, pole);
  g.traverse((o) => o.layers.set(HELPER_LAYER));
  return g;
}
