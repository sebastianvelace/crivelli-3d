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
  { name: 'Ancho de una baldosa', a: ['piso_calle', [404, 3890]], b: ['piso_calle', [786, 3890]] },
  { name: 'Ancho de la calle', a: ['piso_calle', [128, 2900]], b: ['piso_calle', [1065, 2900]] },
  { name: 'La Virgen, arrodillada', a: ['maria', [2143, 2576]], b: ['maria', [2143, 3770]] },
  { name: 'Gabriel, arrodillado', a: ['gabriel', [620, 2530]], b: ['gabriel', [620, 3600]] },
  { name: 'Hombre del manto dorado, de pie', a: ['hombre_dorado', [905, 2115]], b: ['hombre_dorado', [905, 2462]] },
  { name: 'Profundidad del cuarto de María', a: ['cuarto_piso', [2200, 3860]], b: ['cuarto_piso', [2200, 3262]] },
  { name: 'Alto del techo del cuarto', a: ['fachada_maria', [2200, 1740]], b: ['fachada_maria', [2200, 3890]] },
  { name: 'Puente sobre la plataforma', a: ['arco_fondo', [700, 1294]], b: ['arco_fondo', [700, 2425]] },
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
    this.markerMat = new THREE.MeshBasicMaterial({ color: 0xffd400, depthTest: false });
    this.lineMat = new THREE.LineBasicMaterial({ color: 0xffd400, depthTest: false });

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
    const hit = this.raycaster.intersectObjects(v.pictureGroup.children, false)[0];
    if (!hit) return;
    const label = v.elementMeshes.get(hit.object.name)?.userData.label ?? hit.object.name;
    if (!this.pending) {
      this.pending = { point: hit.point.clone(), marker: this.marker(hit.point), label };
    } else {
      this.group.remove(this.pending.marker);
      this.add(this.pending.point, hit.point, null);
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
    this.add(this.lift(...preset.a), this.lift(...preset.b), preset.name);
  }

  add(a, b, name) {
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
    div.innerHTML = (name ? `<span>${name}</span>` : '') + `<b>${fmt(d)}</b>` +
      (dy > 0.05 && Math.abs(dy - d) > 0.03 ? ` <small>(vertical ${fmt(dy)})</small>` : '');
    this.overlay.appendChild(div);
    this.items.push({ a: a.clone(), b: b.clone(), objects, div });
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

  /** Cada cuadro: coloca las etiquetas sobre el punto medio de cada medición. */
  update() {
    this.reticle.hidden = !(this.enabled && this.viewer.mode === 'walk' && this.viewer.pointerLock.isLocked);
    const cam = this.viewer.camera;
    const w = this.viewer.renderer.domElement.clientWidth;
    const h = this.viewer.renderer.domElement.clientHeight;
    for (const it of this.items) {
      const mid = it.a.clone().add(it.b).multiplyScalar(0.5);
      const inFront = mid.clone().applyMatrix4(cam.matrixWorldInverse).z < 0;
      const p = mid.project(cam);
      it.div.style.display = inFront ? '' : 'none';
      it.div.style.transform = `translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px) translate(8px, -50%)`;
    }
  }
}

const fmt = (m) => (m < 1 ? `${(m * 100).toFixed(0)} cm` : `${m.toFixed(2).replace('.', ',')} m`);
