import * as THREE from 'three';
import { lookQuaternion } from './Viewer.js';
import { PRESETS } from './measure.js';

// Vista al frente, dentro de la calle: arco, fraile y muros pintados; nada de reversos ni de museo al fondo.
const STREET_COMPARISON = { pos: [-0.5, 1.6, -3.2], look: [0.3, 1.6, -10], fov: 56 };

const STOPS = [
  { caption: 'La Anunciación cuelga en el museo a su tamaño real: 207 × 146,7 cm.', pose: 'museum', hold: 3 },
  { caption: 'La placa del piso marca el ojo de Crivelli, el punto desde donde, según la calibración, se organiza su perspectiva.', pos: [0.4, 1.58, 1.65], look: [0, 0.3, 0], fov: 60, travel: 3, hold: 2 },
  { caption: 'Al llegar al ojo, la calle coincide con la pintura.', pose: 'eye', travel: 3, hold: 4 },
  { caption: 'Las alturas del fraile y de Gabriel son supuestos para fijar la escala. A esa escala, la altura de María (1,22 m de rodillas) y la del hombre del manto dorado (1,83 m) son predicciones.', pose: 'eye', measure: true, hold: 5 },
  { caption: 'Entras al cuadro: el piso de baldosas deja de ser una imagen y se vuelve un plano real.', pos: [0.05, 1.51, -1.65], look: [-0.2, 1.2, -8], travel: 3, hold: 2 },
  { caption: 'En el muro izquierdo se ven el niño, las figuras del balcón y el muro de ladrillo. Su posición en profundidad es un supuesto.', pos: [0.0, 1.9, -2.6], look: [-0.9, 2.15, -5.2], fov: 46, travel: 4, hold: 3 },
  { ...STREET_COMPARISON, caption: 'Modo fiel: solo aparece lo pintado. Lo negro es lo que Crivelli dejó fuera, como el suelo que tapan las figuras.', fill: 'fiel', travel: 3, hold: 3 },
  { ...STREET_COMPARISON, caption: 'Modo inferido: esos huecos se rellenan con textura de zonas vecinas. Es una hipótesis, no una medida.', fill: 'inferido', hold: 3 },
  {
    caption: 'La logia es una caja 3D con techo de casetones, alfombra y pavo real. Es una reconstrucción a partir de lo pintado, no una foto del edificio.',
    pos: [1.4, 3.2, -1.3], look: [1.4, 3.8, -2.5], fov: 75, via: [[0.0, 2.3, -2.2]],
    fill: 'neutro', travel: 4, hold: 4,
  },
  {
    caption: 'La columna de María es un elemento propio, separado de la fachada: se lee el capitel con su decoración.',
    pos: [0.55, 1.9, -1.35], look: [1.35, 2.2, -3.0], fov: 50, via: [[0.1, 2.5, -1.8]], travel: 3, hold: 3,
  },
  {
    caption: 'El cuarto de María: pilastras, estantes de madera y la figura de María. Lo que no se pintó queda vacío.',
    pos: [0.7, 1.45, -1.45], look: [1.75, 1.25, -3.1], fov: 58, travel: 3, hold: 3,
  },
  { caption: 'Vuelves al ojo: el espacio vuelve a ser la pintura.', pose: 'eye', travel: 3, hold: 2 },
  { caption: 'En el Sidereus Nuncius (1610), Galileo estimó la altura de las montañas lunares a partir de la longitud de sus sombras en el terminador.', pose: 'eye', hold: 6 },
  { caption: 'En su carta a Lodovico Cigoli (1612), Galileo habla de cómo la pintura hace ver relieve sobre una superficie plana. Cigoli, pintor amigo, puso una Luna manchada a los pies de María en Santa Maria Maggiore. La analogía: leer profundidad en una imagen plana y tratar la sombra como información.', pose: 'eye', hold: 9 },
  { caption: 'La maqueta deja ver la caja de la logia, la columna, el arco y el fondo de la calle.', pos: [-36, 44, 60], look: [0.3, 3.2, -10.5], fov: 11.5, exterior: true, travel: 4, hold: 4 },
];

export const TOUR_SECONDS = STOPS.reduce((total, { travel = 0, hold }) => total + travel + hold, 0);

export function createTour(viewer, measure, onUpdate) {
  let index = -1;
  let paused = false;
  let arrived = false;
  let timer = null;
  let remaining = 0;
  let deadline = 0;

  const poseFor = (stop) => {
    if (stop.pose === 'eye') {
      return { position: viewer.space.eye, quaternion: new THREE.Quaternion(), painterness: 1, fov: 70 };
    }
    if (!stop.pos) return null;
    const position = new THREE.Vector3(...stop.pos);
    return { position, quaternion: lookQuaternion(position, new THREE.Vector3(...stop.look)), painterness: 0, fov: stop.fov ?? 70 };
  };

  function update() {
    const stop = STOPS[index];
    onUpdate(stop ? { index, count: STOPS.length, caption: stop.caption, framed: stop.pose === 'eye', paused } : null);
  }

  function applyPose(pose) {
    if (!pose) return;
    viewer.camera.position.copy(pose.position);
    viewer.camera.quaternion.copy(pose.quaternion);
    viewer.camera.painterness = pose.painterness;
    viewer.camera.freeFov = pose.fov;
    viewer.camera.updateProjectionMatrix();
  }

  function wait() {
    if (paused) return;
    deadline = performance.now() + remaining;
    timer = setTimeout(() => run(index + 1), remaining);
  }

  function arrive(stop) {
    if (stop.pose === 'eye') viewer.openWindow();
    if (stop.measure) {
      for (const id of ['maria', 'gabriel', 'fraile', 'hombre_dorado']) {
        measure.showPreset(PRESETS.find((preset) => preset.a[0] === id));
      }
    }
    arrived = true;
    remaining = stop.hold * 1000;
    wait();
  }

  function run(next) {
    clearTimeout(timer);
    timer = null;
    measure.clear();
    if (next >= STOPS.length) {
      stop();
      return;
    }
    index = next;
    arrived = false;
    const stage = STOPS[index];
    viewer.tourExterior = stage.exterior === true;
    viewer.setFillMode(stage.fill ?? viewer.fillMode);
    update();
    if (stage.pose === 'museum') {
      viewer.enterMuseum(() => arrive(stage), { fromEntrance: true, duration: 0, mode: 'tour' });
      return;
    }
    const pose = poseFor(stage);
    if (stage.travel) {
      const path = stage.via && new THREE.CatmullRomCurve3([
        viewer.camera.position.clone(), ...stage.via.map((point) => new THREE.Vector3(...point)), pose.position,
      ]);
      viewer.animateTo({ ...pose, path, duration: stage.travel }, () => arrive(stage));
      viewer.animation.paused = paused;
    } else {
      applyPose(pose);
      arrive(stage);
    }
  }

  function stop() {
    if (index < 0) return;
    index = -1;
    clearTimeout(timer);
    timer = null;
    viewer.animation = null;
    viewer.tourExterior = false;
    viewer.openWindow();
    viewer.setFillMode('neutro');
    measure.clear();
    viewer.camera.margin = 0.94;
    viewer.camera.updateProjectionMatrix();
    update();
    if (viewer.eyeFactor() > 0.999) viewer.setMode('eye');
    else viewer.returnToEye(1.2);
  }

  return {
    get active() { return index >= 0; },
    start() {
      clearTimeout(timer);
      viewer.animation = null;
      paused = false;
      measure.setEnabled(false);
      viewer.setFillMode('neutro');
      run(0);
    },
    stop,
    togglePause() {
      if (index < 0) return;
      paused = !paused;
      if (viewer.animation) viewer.animation.paused = paused;
      else if (paused) {
        clearTimeout(timer);
        remaining = Math.max(0, deadline - performance.now());
      } else wait();
      update();
    },
    next() {
      if (index < 0) return;
      if (!arrived && STOPS[index].pose === 'eye') {
        applyPose(poseFor(STOPS[index]));
        viewer.openWindow();
      }
      viewer.animation = null;
      run(index + 1);
    },
  };
}
