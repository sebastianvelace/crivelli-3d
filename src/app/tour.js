import * as THREE from 'three';
import { lookQuaternion } from './Viewer.js';
import { PRESETS } from './measure.js';

const STOPS = [
  { caption: 'La Anunciación cuelga en el museo a su tamaño real.', pose: 'museum', hold: 4 },
  { caption: 'La marca amarilla señala el lugar desde donde Crivelli construyó la perspectiva.', pos: [0.4, 1.58, 1.65], look: [0, 0.3, 0], fov: 60, travel: 4, hold: 2 },
  { caption: 'Al llegar al ojo, el cuadro se abre. La calle coincide con la pintura.', pose: 'eye', travel: 3, hold: 5 },
  { caption: 'La altura de Gabriel se supuso para fijar la escala; la de María es una predicción: sale 1,22 m de rodillas. Al fondo, el hombre del manto dorado mide 1,83 m: Crivelli no es del todo coherente.', pose: 'eye', measure: true, hold: 5 },
  { caption: 'Entramos al cuadro. El piso de baldosas se vuelve un plano real.', pos: [0.05, 1.51, -1.65], look: [-0.2, 1.2, -8], travel: 4, hold: 2 },
  { caption: 'En el muro izquierdo se ven la escalera, el niño y las figuras del balcón.', pos: [-0.4, 1.9, -4.5], look: [-2, 2, -6.9], fov: 61, travel: 5, hold: 3 },
  { caption: 'En modo fiel, los huecos muestran las superficies que Crivelli dejó fuera de la pintura.', pos: [-0.58, 1.7, -9.5], look: [0.4, 1.2, -1], fill: 'fiel', travel: 4, hold: 3 },
  { caption: 'En modo inferido, los fragmentos ocultos se completan a partir de la textura visible.', fill: 'inferido', hold: 4 },
  { caption: 'La casa de María tiene una fachada, un techo de vigas y un cuarto detrás de las pilastras.', pos: [-0.4, 1.4, -2.3], look: [2.1, 1.3, -3.2], fill: 'neutro', travel: 5, hold: 3 },
  { caption: 'La maqueta deja ver cómo se distribuyen las fachadas, el arco y el fondo.', pos: [-38, 50, 58], look: [0.4, 3, -11], fov: 14, exterior: true, travel: 5, hold: 4 },
  { caption: 'Al volver al ojo, el espacio vuelve a ser la pintura.', pose: 'eye', travel: 5, hold: 3 },
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
      for (const id of ['maria', 'gabriel', 'hombre_dorado']) {
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
      viewer.animateTo({ ...pose, duration: stage.travel }, () => arrive(stage));
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
