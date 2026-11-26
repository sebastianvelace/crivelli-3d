import * as THREE from 'three';
import { lookQuaternion } from './Viewer.js';

/**
 * Recorrido guiado de ~60 s para grabar en video: sale del ojo, entra a la calle,
 * mira la casa de María, se asoma a su cuarto, sube para ver la maqueta y vuelve
 * al ojo de Crivelli, donde la escena se convierte otra vez en la pintura.
 */
const STOPS = [
  { caption: 'El ojo de Crivelli: el único lugar desde donde la calle es la pintura.', pos: [0, 1.51, 0], look: [0, 1.51, -5], t: 1, fov: 70, hold: 4 },
  { caption: 'Entramos al cuadro: el piso de baldosas se vuelve un plano real.', pos: [0.05, 1.51, -1.6], look: [-0.2, 1.2, -8], t: 0, fov: 70, dur: 5, hold: 2 },
  { caption: 'Gabriel y san Emigdio son "cartones" a la profundidad que dicta la perspectiva.', pos: [1.1, 1.35, -1.2], look: [-0.3, 1.0, -2.6], t: 0, fov: 65, dur: 6, hold: 3 },
  { caption: 'La calle se aleja hacia el punto de fuga: la escalera, el arco y el puente.', pos: [-0.5, 1.6, -5.5], look: [0, 1.6, -14], t: 0, fov: 65, dur: 7, hold: 3 },
  { caption: 'Modo fiel: mirando hacia atrás solo queda lo que Crivelli pintó; los huecos son lo que nunca mostró.', pos: [-0.6, 1.7, -9.5], look: [0.4, 1.2, -1], t: 0, fov: 70, dur: 6, hold: 4, fill: 'fiel' },
  { caption: 'Modo neutro: lo que el pintor no mostró queda en color yeso, sin inventar nada.', pos: [-0.6, 1.7, -9.5], look: [0.4, 1.2, -1], t: 0, fov: 70, dur: 0.1, hold: 4, fill: 'neutro' },
  { caption: 'La casa de María: fachada, techo de vigas y el cuarto detrás de las pilastras.', pos: [-0.4, 1.4, -2.3], look: [2.1, 1.3, -3.2], t: 0, fov: 70, dur: 6, hold: 3 },
  { caption: 'Vista de maqueta: la geometría completa, como en la reconstrucción de la Flagelación.', pos: [-38, 50, 58], look: [0.4, 3, -11], t: 0, fov: 14, dur: 6, hold: 4 },
  { caption: 'Volvemos al ojo… y el espacio vuelve a ser la pintura.', pos: [0, 1.51, 0], look: [0, 1.51, -5], t: 1, fov: 70, dur: 6, hold: 3 },
];

export function createTour(viewer, onCaption) {
  let cancelled = false;
  let timer = null;

  const run = (i) => {
    if (cancelled || i >= STOPS.length) {
      onCaption(null);
      viewer.setMode('eye');
      return;
    }
    const s = STOPS[i];
    onCaption(s.caption);
    if (s.fill) viewer.setFillMode(s.fill);
    // Las paradas "en el ojo" usan la calibración exacta, no un número fijo.
    const atEye = s.t === 1;
    const position = atEye ? viewer.space.eye.clone() : new THREE.Vector3(...s.pos);
    const quaternion = atEye ? new THREE.Quaternion() : lookQuaternion(position, new THREE.Vector3(...s.look));
    const next = () => {
      timer = setTimeout(() => run(i + 1), (s.hold ?? 2) * 1000);
    };
    if (i === 0) {
      // Desde el museo el viaje hasta el ojo es más largo; al llegar, el cuadro se vuelve ventana.
      const duration = viewer.camera.position.distanceTo(viewer.space.eye) > 1 ? 3.2 : 1.2;
      viewer.animateTo({ position, quaternion, painterness: s.t, fov: s.fov, duration }, () => {
        viewer.windowOpen = true;
        next();
      });
    } else {
      viewer.animateTo({ position, quaternion, painterness: s.t, fov: s.fov, duration: s.dur }, next);
    }
  };

  return {
    start() {
      cancelled = false;
      viewer.setMode('tour');
      run(0);
    },
    stop() {
      cancelled = true;
      clearTimeout(timer);
      onCaption(null);
    },
  };
}
