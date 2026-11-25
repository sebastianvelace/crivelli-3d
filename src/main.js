import * as THREE from 'three';
import GUI from 'lil-gui';
import { Viewer } from './app/Viewer.js';
import { createTour } from './app/tour.js';
import './style.css';

const BASE = import.meta.env.BASE_URL;

async function loadJSON(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path}`);
  return res.json();
}

async function main() {
  const [calibration, sceneData] = await Promise.all([
    loadJSON('data/calibration.json'),
    loadJSON('data/scene.json'),
  ]);
  const painting = await new THREE.TextureLoader().loadAsync(BASE + 'painting/crivelli_ng739_2048.jpg');
  painting.colorSpace = THREE.SRGBColorSpace;
  painting.anisotropy = 8;

  const viewer = new Viewer(document.getElementById('app'), calibration, sceneData, painting);
  setupOverlays(viewer, calibration);
  setupGui(viewer, calibration);
  document.getElementById('loading').remove();
}

// ------------------------------------------------------------------ overlays HTML

function setupOverlays(viewer, calib) {
  const overlay = document.getElementById('overlay');
  const frame = document.getElementById('frame');
  const hud = document.getElementById('hud-mode');
  const hint = document.getElementById('hint');
  overlay.src = BASE + 'painting/crivelli_ng739_2048.jpg';
  document.getElementById('plan-img').src = BASE + 'data/planta.png';
  document.getElementById('hud-numbers').textContent =
    `f = ${calib.focalPx.toFixed(0)} px · ojo a ${calib.eyeHeightM.toFixed(2)} m · ` +
    `error de perspectiva ${calib.perspectiveErrorMeanDeg.toFixed(2)}° (${calib.linesUsed} rectas)`;

  const MODE_TEXT = {
    eye: ['En el ojo de Crivelli', 'Usa el panel para entrar al cuadro.'],
    walk: ['Caminando', 'Clic para mirar con el mouse · WASD para moverte · Shift para correr · Q/E para bajar o subir · Esc para soltar'],
    orbit: ['Órbita', 'Arrastra para girar · rueda para acercar · clic derecho para desplazar'],
    model: ['Maqueta', 'Vista casi axonométrica. El punto amarillo es el ojo del pintor.'],
    transition: ['…', ''],
    tour: ['Recorrido guiado', ''],
  };

  viewer.onChange(() => {
    const [title, text] = MODE_TEXT[viewer.mode] ?? ['', ''];
    hud.textContent = title;
    hint.textContent = text;
    hint.style.opacity = text ? 1 : 0;
  });
  viewer.emit();

  // Cada cuadro: el marco y la superposición se ajustan al rectángulo de la pintura
  // y aparecen solo cuando estamos en el ojo.
  viewer.onFrame = () => {
    const r = viewer.camera.paintingRect();
    for (const el of [overlay, frame]) {
      el.style.left = `${r.left}px`;
      el.style.top = `${r.top}px`;
      el.style.width = `${r.width}px`;
      el.style.height = `${r.height}px`;
    }
    const k = viewer.eyeFactor();
    frame.style.opacity = k.toFixed(3);
    const s = viewer.settings;
    overlay.style.opacity = (s?.overlay ? s.overlayOpacity * k : 0).toFixed(3);
  };
}

// ------------------------------------------------------------------ panel lil-gui

function setupGui(viewer, calib) {
  const settings = {
    overlay: false,
    overlayOpacity: 0.5,
    helpers: false,
    plan: false,
    occlusion: true,
    highlight: false,
    fog: 0,
  };
  viewer.settings = settings;

  const caption = document.getElementById('caption');
  const tour = createTour(viewer, (text) => {
    caption.textContent = text ?? '';
    caption.style.opacity = text ? 1 : 0;
  });
  viewer.stopTour = () => tour.stop();

  const gui = new GUI({ title: 'Crivelli 3D' });
  const actions = {
    volver: () => viewer.returnToEye(),
    caminar: () => { tour.stop(); viewer.enterWalk(); },
    orbita: () => { tour.stop(); viewer.enterOrbit(); },
    maqueta: () => { tour.stop(); viewer.enterModel(); },
    recorrido: () => tour.start(),
    captura: () => {
      const a = document.createElement('a');
      a.href = viewer.screenshot();
      a.download = `crivelli3d_${viewer.mode}.png`;
      a.click();
    },
    creditos: () => document.getElementById('credits').showModal(),
  };

  gui.add(actions, 'volver').name('⟲ Volver al ojo de Crivelli');
  gui.add(actions, 'caminar').name('Entrar y caminar (WASD)');
  gui.add(actions, 'orbita').name('Modo órbita');
  gui.add(actions, 'maqueta').name('Modo maqueta');

  const check = gui.addFolder('Comprobar la geometría');
  check.add(settings, 'overlay').name('Superponer la pintura');
  check.add(settings, 'overlayOpacity', 0, 1, 0.01).name('Opacidad');
  check.add(settings, 'helpers').name('Líneas y punto de fuga 3D').onChange((v) => viewer.setHelpersVisible(v));
  check.add(settings, 'plan').name('Planta reconstruida').onChange((v) => {
    document.getElementById('plan').classList.toggle('visible', v);
  });
  check.add(settings, 'occlusion').name('Ocultar lo no pintado').onChange((v) => {
    viewer.uniforms.uOcclusion.value = v ? 1 : 0;
  });
  check.add(settings, 'highlight').name('Resaltar zonas ocultas').onChange((v) => {
    viewer.uniforms.uHighlight.value = v ? 0.65 : 0;
  });

  const extras = gui.addFolder('Extras');
  extras.add(settings, 'fog', 0, 1, 0.01).name('Perspectiva aérea (Leonardo)').onChange((v) => {
    viewer.fogStrength = v;
  });
  extras.add(actions, 'recorrido').name('▶ Recorrido guiado (60 s)');
  extras.add(actions, 'captura').name('Guardar captura PNG');
  extras.close();

  gui.add(actions, 'creditos').name('Créditos y fuentes');
  document.getElementById('credits-close').addEventListener('click', () => document.getElementById('credits').close());

  // Atajo: tecla R = volver al ojo
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR' && viewer.mode !== 'walk') viewer.returnToEye();
  });

  // Exponer para depuración y capturas desde la consola
  window.crivelli = { viewer, tour, calib };
}

main().catch((err) => {
  console.error(err);
  document.getElementById('loading').textContent = `Error: ${err.message}`;
});
