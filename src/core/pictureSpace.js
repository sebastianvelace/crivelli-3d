import * as THREE from 'three';

/**
 * "Espacio pictórico": convierte píxeles de la pintura en puntos 3D.
 *
 * Convención del mundo (metros):
 *   - El ojo del pintor está en E = (0, Hc, 0) y mira hacia -Z.
 *   - El piso de la calle es el plano y = 0.
 *   - X crece hacia la derecha; la profundidad es D = -z.
 *
 * Cámara estenopeica con punto principal en el punto de fuga (cx, cy) y
 * distancia focal f en píxeles. El rayo que sale del ojo por el píxel (u, v) es
 *   d = ((u - cx) / f, -(v - cy) / f, -1)
 * (el signo menos en y porque en la imagen v crece hacia abajo).
 */
export class PictureSpace {
  constructor(calibration) {
    this.W = calibration.imageWidth;
    this.H = calibration.imageHeight;
    this.cx = calibration.vanishingPoint[0];
    this.cy = calibration.vanishingPoint[1];
    this.f = calibration.focalPx;
    this.eyeHeight = calibration.eyeHeightM;
    this.eye = new THREE.Vector3(0, this.eyeHeight, 0);
    // Distancia máxima de un rayo: evita puntos "en el infinito" cerca del horizonte.
    this.maxRayT = 160;
  }

  /** Dirección (sin normalizar) del rayo por el píxel (u, v). */
  ray(u, v) {
    return new THREE.Vector3((u - this.cx) / this.f, -(v - this.cy) / this.f, -1);
  }

  /**
   * Intersección del rayo (u, v) con un plano {normal, c} (normal · p = c).
   * Devuelve null si el plano queda detrás del ojo.
   */
  intersect(u, v, plane) {
    const d = this.ray(u, v);
    const denom = plane.normal.dot(d);
    if (Math.abs(denom) < 1e-9) return null;
    let t = (plane.c - plane.normal.dot(this.eye)) / denom;
    if (t <= 0) return null;
    t = Math.min(t, this.maxRayT);
    return this.eye.clone().addScaledVector(d, t);
  }

  /** Punto de la pintura (u, v) colocado sobre un plano frontal a profundidad D. */
  pointAtDepth(u, v, depth) {
    return this.eye.clone().addScaledVector(this.ray(u, v), depth);
  }
}

const AXES = {
  horizontal: new THREE.Vector3(0, 1, 0),
  side: new THREE.Vector3(1, 0, 0),
  frontal: new THREE.Vector3(0, 0, 1),
};

/**
 * Resuelve el plano de cada elemento de scene.json, en orden, porque un
 * elemento puede anclarse a otro ya resuelto (por ejemplo, el techo del cuarto
 * se ancla en la fachada y la pared del fondo se ancla en el techo).
 */
export function resolvePlanes(space, elements) {
  const planes = new Map();
  planes.set('ground', { type: 'horizontal', normal: AXES.horizontal, c: 0 });

  for (const el of elements) {
    const spec = el.plane;
    const normal = AXES[spec.type];
    if (!normal) throw new Error(`Tipo de plano desconocido en ${el.id}: ${spec.type}`);
    let c;

    if (spec.anchor) {
      // Proyectamos el píxel ancla sobre el plano del elemento de referencia y
      // tomamos la coordenada que fija nuestro plano (y, x o z según el tipo).
      const ref = planes.get(spec.anchor.on);
      if (!ref) throw new Error(`${el.id}: el ancla apunta a "${spec.anchor.on}", que aún no existe`);
      const p = space.intersect(spec.anchor.px[0], spec.anchor.px[1], ref);
      if (!p) throw new Error(`${el.id}: el ancla no corta el plano de referencia`);
      c = spec.type === 'horizontal' ? p.y : spec.type === 'side' ? p.x : p.z;
    } else if (spec.from) {
      // Plano paralelo a otro, desplazado "offset" metros (más profundo si offset > 0).
      c = planes.get(spec.from).c;
    } else if (spec.type === 'horizontal') {
      c = spec.y ?? 0;
    } else if (spec.type === 'side') {
      c = spec.x;
    } else {
      c = -spec.depth; // frontal: z = -D
    }

    const offset = spec.offset ?? 0;
    if (spec.type === 'frontal') c -= offset; // más profundidad = z más negativo
    else c += offset;

    planes.set(el.id, { type: spec.type, normal, c });
  }
  return planes;
}

/** Coordenadas 2D dentro del plano, para triangular el polígono. */
function to2D(type, p) {
  if (type === 'horizontal') return new THREE.Vector2(p.x, p.z);
  if (type === 'side') return new THREE.Vector2(p.z, p.y);
  return new THREE.Vector2(p.x, p.y);
}

/**
 * Construye la geometría de un elemento: cada vértice del polígono (en píxeles)
 * se lleva a 3D cortando su rayo con el plano del elemento ("lifting"), y el
 * resultado se triangula con sus huecos (puertas, arcos).
 * Por construcción, visto desde el ojo, cada vértice cae exactamente sobre su
 * píxel: por eso la vista inicial reproduce la pintura.
 */
export function buildElementGeometry(space, el, plane) {
  const lift = (pts) =>
    pts.map(([u, v]) => {
      const p = space.intersect(u, v, plane);
      if (!p) throw new Error(`${el.id}: el vértice (${u}, ${v}) no corta su plano`);
      return p;
    });

  const contour3 = lift(el.polygon);
  const holes3 = (el.holes ?? []).map(lift);
  const contour2 = contour3.map((p) => to2D(plane.type, p));
  const holes2 = holes3.map((h) => h.map((p) => to2D(plane.type, p)));
  const faces = THREE.ShapeUtils.triangulateShape(contour2, holes2);

  const all = [...contour3, ...holes3.flat()];
  const positions = new Float32Array(all.length * 3);
  all.forEach((p, i) => p.toArray(positions, i * 3));

  // Orientamos todas las caras hacia el ojo: así "cara frontal" significa
  // "la cara que el pintor vio", y la de atrás se pinta de color neutro.
  const index = [];
  const centroid = all.reduce((acc, p) => acc.add(p), new THREE.Vector3()).divideScalar(all.length);
  const toEye = space.eye.clone().sub(centroid);
  for (const [a, b, c] of faces) {
    const n = new THREE.Vector3()
      .subVectors(all[b], all[a])
      .cross(new THREE.Vector3().subVectors(all[c], all[a]));
    if (n.dot(toEye) >= 0) index.push(a, b, c);
    else index.push(a, c, b);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
