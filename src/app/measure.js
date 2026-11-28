import * as THREE from 'three';
import { HELPER_LAYER } from '../scene/perspectiveHelpers.js';

/**
 * Herramienta de medición (single view metrology, Criminisi et al.).
 *
 * Un clic sobre la escena es un rayo desde la cámara; su primer corte con un
 * elemento da un punto 3D en metros. Dos clics dan una distancia. Desde el ojo de
 * Crivelli esto equivale a medir DENTRO de la pintura: cada píxel cae en el plano
 * que le corresponde, así que la distancia sale en metros reales (a la escala que
 * fija la altura del ojo).
 *
 * Las mediciones sugeridas se definen igual que la escena: un píxel de la pintura
 * y el elemento sobre el cual se proyecta.
 */
export const PRESETS = [
  { name: 'Ancho de una baldosa', kind: 'prediccion', a: ['piso_calle', [404, 3890]], b: ['piso_calle', [786, 3890]] },
  { name: 'Ancho de la calle', kind: 'prediccion', a: ['piso_calle', [128, 2900]], b: ['piso_calle', [1065, 2900]] },
  { name: 'La Virgen, arrodillada', kind: 'prediccion', a: ['maria', [2143, 2576]], b: ['maria', [2143, 3770]] },
  { name: 'Gabriel, arrodillado', kind: 'supuesto', assumedHeight: 1.20, a: ['gabriel', [620, 2530]], b: ['gabriel', [620, 3600]] },
  { name: 'Fraile, de pie', kind: 'supuesto', assumedHeight: 1.65, a: ['fraile', [425, 2255]], b: ['fraile', [420, 2655]] },
  { name: 'Hombre del manto dorado, de pie', kind: 'prediccion', a: ['hombre_dorado', [905, 2115]], b: ['hombre_dorado', [905, 2462]] },
  { name: 'Profundidad del cuarto de María', kind: 'prediccion', a: ['cuarto_piso', [2200, 3860]], b: ['cuarto_piso', [2200, 3262]] },
  { name: 'Alto del techo del cuarto', kind: 'prediccion', a: ['fachada_maria', [2200, 1740]], b: ['fachada_maria', [2200, 3890]] },
  { name: 'Puente sobre la plataforma', kind: 'prediccion', a: ['arco_fondo', [700, 1294]], b: ['arco_fondo', [700, 2425]] },
];

export class MeasureTool {
  constructor(viewer, overlay) {
    this.viewer = viewer;
    this.overlay = overlay; // contenedor HTML de las etiquetas
    this.reticle = document.getElementById('reticle');
    this.enabled = false;
    this.pending = null;
    this.items = [];
    this.group = new THREE.Group();
    viewer.scene.add(this.group);
    this.raycaster = new THREE.Raycaster();

    this.markerGeo = new THREE.SphereGeometry(0.035, 16, 12);
    this.markerMat = new THREE.MeshBasicMaterial({ toneMapped: false, color: 0xffd400, depthTest: false });
    this.lineMat = new THREE.LineBasicMaterial({ toneMapped: false, color: 0xffd400, depthTest: false });

    // Clic (no arrastre) sobre el canvas
    const el = viewer.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
    el.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
      this.onClick(e);
    });
  }

  setEnabled(v) {
    this.enabled = v;
    this.viewer.renderer.domElement.style.cursor = v ? 'crosshair' : '';
    if (!v && this.pending) {
      this.group.remove(this.pending.marker);
      this.pending = null;
    }
  }

  onClick(e) {
    const v = this.viewer;
    const walking = v.mode === 'walk';
    if (!this.enabled || v.mode === 'tour' || v.animation || (walking && !v.pointerLock.isLocked)) return;
    const rect = v.renderer.domElement.getBoundingClientRect();
    const ndc = walking ? new THREE.Vector2() :
      new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, v.camera);
    if (v.portalActive) {
      if (!v.windowOpen) return;
      const { x0, x1, y0, y1, z } = v.museum.aperture;
      const { origin, direction } = this.raycaster.ray;
      if (direction.z >= 0) return;
      const portalHit = this.raycaster.ray.at((z - origin.z) / direction.z, new THREE.Vector3());
      if (portalHit.x < x0 || portalHit.x > x1 || portalHit.y < y0 || portalHit.y > y1) return;
    }
    const hit = this.raycaster.intersectObjects(v.pictureGroup.children.filter((mesh) => mesh.visible), false)[0];
    if (!hit) return;
    const label = v.elementMeshes.get(hit.object.name)?.userData.label ?? hit.object.name;
    if (!this.pending) {
      this.pending = { point: hit.point.clone(), marker: this.marker(hit.point), label };
    } else {
      this.group.remove(this.pending.marker);
      this.add(this.pending.point, hit.point);
      this.pending = null;
    }
  }

  marker(p) {
    const m = new THREE.Mesh(this.markerGeo, this.markerMat);
    m.position.copy(p);
    m.renderOrder = 10;
    m.layers.set(HELPER_LAYER);
    this.group.add(m);
    return m;
  }

  /** Punto 3D de un píxel de la pintura sobre el plano de un elemento. */
  lift(elementId, px) {
    return this.viewer.space.intersect(px[0], px[1], this.viewer.planes.get(elementId));
  }

  showPreset(preset) {
    if (this.items.some(({ name }) => name === preset.name)) return;
    this.add(this.lift(...preset.a), this.lift(...preset.b), preset);
  }

  add(a, b, { name, kind, assumedHeight } = {}) {
    const objects = [this.marker(a), this.marker(b)];
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), this.lineMat);
    line.renderOrder = 10;
    line.layers.set(HELPER_LAYER);
    this.group.add(line);
    objects.push(line);

    const d = a.distanceTo(b);
    const dy = Math.abs(a.y - b.y);
    const div = document.createElement('div');
    div.className = 'measure-label';
    if (name) {
      const title = document.createElement('span');
      title.textContent = name;
      div.appendChild(title);
    }
    const value = document.createElement('b');
    value.textContent = assumedHeight ? `Trazado: ${fmt(d)}` : fmt(d);
    div.appendChild(value);
    if (dy > 0.05 && Math.abs(dy - d) > 0.03) {
      const vertical = document.createElement('small');
      vertical.textContent = ` · vertical ${fmt(dy)}`;
      div.appendChild(vertical);
    }
    if (kind) {
      const metadata = document.createElement('small');
      metadata.className = 'measure-kind';
      metadata.textContent = kind === 'supuesto' ? `Supuesto (${fmt(assumedHeight)})` : 'Predicción';
      div.dataset.kind = kind;
      div.appendChild(metadata);
    }
    this.overlay.appendChild(div);
    this.items.push({ a: a.clone(), b: b.clone(), name, objects, div });
  }

  clear() {
    for (const it of this.items) {
      it.objects.forEach((o) => this.group.remove(o));
      it.objects[2].geometry.dispose();
      it.div.remove();
    }
    this.items = [];
    if (this.pending) this.group.remove(this.pending.marker);
    this.pending = null;
  }

  /** Ubica los rótulos cerca de su segmento y evita cruces cuando hay varias mediciones. */
  update() {
    this.reticle.hidden = !(this.enabled && this.viewer.mode === 'walk' && this.viewer.pointerLock.isLocked);
    const cam = this.viewer.camera;
    const w = this.viewer.renderer.domElement.clientWidth;
    const h = this.viewer.renderer.domElement.clientHeight;
    const visible = [];
    for (const it of this.items) {
      const mid = it.a.clone().add(it.b).multiplyScalar(0.5);
      const p = mid.project(cam);
      const inFrame = Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && Math.abs(p.z) <= 1;
      it.div.hidden = !inFrame;
      if (inFrame) visible.push({ el: it.div, x: (p.x + 1) * w / 2, y: (1 - p.y) * h / 2 });
    }
    const sized = visible.map(({ el, x, y }) => ({ el, x, y, width: el.offsetWidth, height: el.offsetHeight }));
    const placed = [];
    for (const label of sized) {
      const position = placeLabel(label, placed, w, h);
      label.el.style.visibility = position ? '' : 'hidden';
      if (!position) continue;
      label.el.style.transform = `translate(${position.left}px, ${position.top}px)`;
      placed.push(position);
    }
  }
}

function placeLabel(label, occupied, w, h) {
  const { x, y, width, height } = label;
  const pad = 7;
  const gap = 5;
  const right = w - width - pad;
  const bottom = h - height - pad;
  if (right < pad || bottom < pad) return null;

  const preferredX = x + 8;
  const preferredY = y - height / 2;
  const xs = [preferredX, x - width - 8, pad, right];
  const ys = [preferredY, pad, bottom];
  for (const box of occupied) {
    xs.push(box.right + gap, box.left - width - gap);
    ys.push(box.bottom + gap, box.top - height - gap);
  }
  let best = null;
  let distance = Infinity;
  for (const candidateX of new Set(xs.map((p) => Math.min(right, Math.max(pad, p))))) {
    for (const candidateY of new Set(ys.map((p) => Math.min(bottom, Math.max(pad, p))))) {
      const rect = { left: candidateX, right: candidateX + width, top: candidateY, bottom: candidateY + height };
      if (occupied.some((box) => rect.left < box.right + gap && rect.right > box.left - gap &&
          rect.top < box.bottom + gap && rect.bottom > box.top - gap)) continue;
      const score = 1.25 * (candidateX - preferredX) ** 2 + (candidateY - preferredY) ** 2;
      if (score >= distance) continue;
      best = rect;
      distance = score;
    }
  }
  return best;
}

const fmt = (m) => (m < 1 ? `${(m * 100).toFixed(0)} cm` : `${m.toFixed(2).replace('.', ',')} m`);
