/**
 * Editor de los polígonos de la escena (public/data/scene.json) sobre la pintura.
 *
 *  - Arrastrar un vértice:            moverlo.
 *  - Clic sobre una arista:           insertar un vértice ahí.
 *  - Alt + clic (o Supr sobre él):    borrar el vértice bajo el cursor.
 *  - "Restaurar ROI":                 volver al polígono trazado a mano antes de GrabCut.
 *
 * Todas las coordenadas están en píxeles de la imagen original. Después de exportar,
 * se guarda el archivo como public/data/scene.json y se vuelve a correr
 * `python analysis/infer.py` para rehacer las texturas del modo inferido.
 */

const HIT_PX = 9; // radio (en pantalla) para tomar un vértice o una arista

export function createPolygonEditor({ ctx, toScreen, onChange }) {
  let scene = null;
  let selected = null; // id del elemento
  let dragging = null; // { ring, index }
  let hover = null;

  const element = () => scene?.elements.find((e) => e.id === selected);

  /** Anillos editables del elemento: el contorno y sus huecos. */
  const rings = (el) => [el.polygon, ...(el.holes ?? []),
    ...(el.projectionParts ?? []).flatMap((part) => [part.polygon, ...(part.holes ?? [])])];

  function nearestVertex(p, scale) {
    const el = element();
    if (!el) return null;
    let best = null;
    rings(el).forEach((ring, r) =>
      ring.forEach(([x, y], i) => {
        const d = Math.hypot(x - p[0], y - p[1]) * scale;
        if (d < HIT_PX && (!best || d < best.d)) best = { ring: r, index: i, d };
      }),
    );
    return best;
  }

  function nearestEdge(p, scale) {
    const el = element();
    if (!el) return null;
    let best = null;
    rings(el).forEach((ring, r) => {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const abx = b[0] - a[0];
        const aby = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / (abx * abx + aby * aby || 1)));
        const q = [a[0] + t * abx, a[1] + t * aby];
        const d = Math.hypot(q[0] - p[0], q[1] - p[1]) * scale;
        if (d < HIT_PX && (!best || d < best.d)) best = { ring: r, index: i + 1, point: q, d };
      }
    });
    return best;
  }

  function removeVertex(v) {
    const ring = rings(element())[v.ring];
    if (ring.length > 3) ring.splice(v.index, 1);
    onChange();
  }

  return {
    setScene(s) {
      scene = s;
      selected = s.elements.find((e) => e.kind === 'figure')?.id ?? s.elements[0].id;
    },
    getScene: () => scene,
    get selected() {
      return selected;
    },
    select(id) {
      selected = id;
      onChange();
    },
    restoreRoi() {
      const el = element();
      if (!el?.roi) return;
      el.polygon = structuredClone(el.roi);
      if (el.roiHoles) el.holes = structuredClone(el.roiHoles);
      else delete el.holes;
      el.silhouette = 'manual';
      onChange();
    },

    onDown(p, event, scale) {
      const v = nearestVertex(p, scale);
      if (v && event.altKey) {
        removeVertex(v);
        return true;
      }
      if (v) {
        dragging = v;
        return true;
      }
      const e = nearestEdge(p, scale);
      if (e) {
        rings(element())[e.ring].splice(e.index, 0, e.point.map((x) => Math.round(x)));
        dragging = { ring: e.ring, index: e.index };
        element().silhouette = 'manual';
        onChange();
        return true;
      }
      return false;
    },
    onMove(p, scale) {
      if (dragging) {
        rings(element())[dragging.ring][dragging.index] = p.map((x) => Math.round(x));
        element().silhouette = 'manual';
        onChange();
      } else {
        hover = nearestVertex(p, scale);
      }
    },
    onUp() {
      dragging = null;
    },
    onKey(key) {
      if ((key === 'Delete' || key === 'Backspace') && hover) {
        removeVertex(hover);
        hover = null;
      }
    },

    draw() {
      if (!scene) return;
      const path = (ring) => {
        ctx.beginPath();
        ring.forEach(([x, y], i) => {
          const [sx, sy] = toScreen(x, y);
          i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
        });
        ctx.closePath();
      };
      // Todos los elementos, tenues
      for (const el of scene.elements) {
        if (el.id === selected) continue;
        ctx.strokeStyle = el.kind === 'figure' ? 'rgba(255,120,200,0.55)' : 'rgba(120,200,255,0.4)';
        ctx.lineWidth = 1;
        rings(el).forEach((r) => (path(r), ctx.stroke()));
      }
      const el = element();
      if (!el) return;
      if (el.modelPolygon) {
        ctx.strokeStyle = '#ffe05b';
        ctx.setLineDash([6, 4]);
        path(el.modelPolygon);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (el.roi) {
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = 'rgba(255,210,0,0.8)';
        path(el.roi);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = 'rgba(46,230,90,0.12)';
      ctx.strokeStyle = '#2ee65a';
      ctx.lineWidth = 2;
      rings(el).forEach((r) => {
        path(r);
        ctx.fill();
        ctx.stroke();
      });
      rings(el).forEach((r, ri) =>
        r.forEach(([x, y], i) => {
          const [sx, sy] = toScreen(x, y);
          const isHover = hover && hover.ring === ri && hover.index === i;
          ctx.fillStyle = isHover ? '#ff3b3b' : '#ffffff';
          ctx.fillRect(sx - 3, sy - 3, 6, 6);
        }),
      );
    },

    stats() {
      const el = element();
      if (!el) return '';
      const n = rings(el).reduce((a, r) => a + r.length, 0);
      const evidence = { measured: 'medida', assumed: 'supuesta', inferred: 'inferida' };
      return `${el.label}<br>${n} vértices · silueta: ${el.silhouette ?? 'manual'} · evidencia: ${evidence[el.evidence] ?? el.evidence}`;
    },
  };
}
