import * as THREE from 'three';

/**
 * Cámara del pintor: su frustum es EXACTAMENTE el rectángulo de la pintura.
 * Punto principal = punto de fuga (cx, cy), distancia focal f (px).
 * En el plano near, el borde izquierdo de la imagen (u = 0) está en
 * x = (0 - cx) / f * near, etc. (modelo estenopeico con eje descentrado).
 */
export function createPainterCamera(space, near, far) {
  const cam = new THREE.PerspectiveCamera();
  cam.position.copy(space.eye);
  cam.near = near;
  cam.far = far;
  const k = near / space.f;
  const left = (0 - space.cx) * k;
  const right = (space.W - space.cx) * k;
  const top = (space.cy - 0) * k;
  const bottom = (space.cy - space.H) * k;
  cam.projectionMatrix.makePerspective(left, right, top, bottom, near, far);
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  // Que nadie recalcule esta proyección "a la manera estándar".
  cam.updateProjectionMatrix = () => {};
  cam.updateMatrixWorld(true);
  return cam;
}

/**
 * Cámara del visitante. Su proyección se interpola con "painterness" t:
 *   t = 1 -> el frustum de Crivelli: la pintura entera centrada en pantalla,
 *            con el punto principal en el punto de fuga (eje descentrado).
 *   t = 0 -> una cámara simétrica normal, cómoda para caminar.
 * Interpolar los bordes del frustum (no solo el FOV) es lo que permite que la
 * escena "se convierta" suavemente en la pintura al volver al ojo.
 */
export class VisitorCamera extends THREE.PerspectiveCamera {
  constructor(space) {
    super(70, 1, 0.05, 400);
    this.space = space;
    this.painterness = 1;
    this.freeFov = 70;
    this.viewportW = 1;
    this.viewportH = 1;
    this.margin = 0.94; // la pintura ocupa el 94% del lado limitante
  }

  setViewport(w, h) {
    this.viewportW = w;
    this.viewportH = h;
    this.aspect = w / h;
    this.updateProjectionMatrix();
  }

  /** Escala píxeles-de-pintura -> píxeles-de-pantalla cuando t = 1. */
  paintingScale() {
    const { W, H } = this.space;
    return Math.min(this.viewportW / W, this.viewportH / H) * this.margin;
  }

  /** Rectángulo (CSS px) que ocupa la pintura en pantalla cuando t = 1. */
  paintingRect() {
    const s = this.paintingScale();
    const w = this.space.W * s;
    const h = this.space.H * s;
    return { left: (this.viewportW - w) / 2, top: (this.viewportH - h) / 2, width: w, height: h };
  }

  updateProjectionMatrix() {
    if (!this.space) return super.updateProjectionMatrix();
    const { W, H, cx, cy, f } = this.space;
    const n = this.near;

    // Frustum del pintor (en unidades de "tangente", es decir, en el plano z = -1)
    const s = this.paintingScale();
    const Ws = this.viewportW / s;
    const Hs = this.viewportH / s;
    const p = {
      l: (W / 2 - Ws / 2 - cx) / f,
      r: (W / 2 + Ws / 2 - cx) / f,
      t: (cy - (H / 2 - Hs / 2)) / f,
      b: (cy - (H / 2 + Hs / 2)) / f,
    };
    // Frustum simétrico "de visitante"
    const tv = Math.tan(THREE.MathUtils.degToRad(this.freeFov / 2));
    const q = { l: -tv * this.aspect, r: tv * this.aspect, t: tv, b: -tv };

    const k = this.painterness;
    const lerp = (a, b) => a + (b - a) * k;
    this.fov = this.freeFov; // lo usan OrbitControls para el paneo
    this.projectionMatrix.makePerspective(
      lerp(q.l, p.l) * n, lerp(q.r, p.r) * n, lerp(q.t, p.t) * n, lerp(q.b, p.b) * n, n, this.far,
    );
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }
}
