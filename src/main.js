import * as THREE from 'three';
import GUI from 'lil-gui';
import { Viewer } from './app/Viewer.js';
import { createTour } from './app/tour.js';
import { MeasureTool, PRESETS } from './app/measure.js';
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
  const loader = new THREE.TextureLoader();
  const painting = await loader.loadAsync(BASE + 'painting/crivelli_ng739_2048.jpg');
  painting.colorSpace = THREE.SRGBColorSpace;
  painting.anisotropy = 8;

  // Texturas del modo inferido (horneadas por analysis/infer.py). Si faltan, la
  // app sigue funcionando en los modos fiel y neutro.
  const inferred = await loadInferred(loader);

  const viewer = new Viewer(document.getElementById('app'), calibration, sceneData, painting, inferred);
  setupOverlays(viewer, calibration);
  setupGui(viewer, calibration);
  document.getElementById('loading').remove();
}

async function loadInferred(loader) {
  try {
    const meta = await loadJSON('data/textures.json');
    const entries = await Promise.all(
      Object.entries(meta).map(async ([id, info]) => {
        const tex = await loader.loadAsync(BASE + info.file);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        return [id, tex];
      }),
    );
    return { meta, textures: new Map(entries) };
  } catch (err) {
    console.warn('Sin texturas inferidas:', err.message);
    return null;
  }
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
    museum: ['En el museo', 'Así cuelga el cuadro en la sala. «Volver al ojo de Crivelli» te lleva a la marca amarilla del piso (o caminá hasta ella).'],
    eye: ['En el ojo de Crivelli', 'Desde aquí la calle y la pintura son la misma imagen. «Entrar y caminar» para entrar.'],
    walk: ['Caminando', 'Clic para mirar con el mouse · WASD para moverte · Shift para correr · Q/E para bajar o subir · Esc para soltar'],
    orbit: ['Órbita', 'Arrastra para girar · rueda para acercar · clic derecho para desplazar'],
    model: ['Maqueta', 'Vista casi axonométrica. El punto amarillo es el ojo del pintor.'],
    transition: ['…', ''],
    tour: ['Recorrido guiado', ''],
  };

  const LEGEND = {
    fiel: '<b>Fiel al cuadro.</b> Solo existe lo que Crivelli pintó: los huecos son lo que nunca mostró. ' +
      'Aristas: <span class="sw measured"></span> plano medido en la pintura · <span class="sw assumed"></span> plano supuesto.',
    neutro: '<b>Neutro.</b> Lo que el pintor no mostró se pinta de color yeso, sin inventar textura.',
    inferido: '<b>Inferido.</b> Los muros y fondos ocultos se rellenan con inpainting a partir de lo visto; el piso ' +
      'queda neutro. Activa «Marcar lo inferido» para verlo rayado.',
  };
  const legend = document.getElementById('legend');

  viewer.onChange(() => {
    legend.innerHTML = LEGEND[viewer.fillMode] ?? '';
    // En el museo y en el ojo todo es pintura: la leyenda de los modos no aplica.
    legend.style.display = viewer.mode === 'museum' || viewer.mode === 'eye' ? 'none' : '';
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
    fillMode: 'neutro',
    markInferred: false,
    evidence: false,
    fog: 0,
  };
  viewer.settings = settings;

  const caption = document.getElementById('caption');
  const tour = createTour(viewer, (text) => {
    caption.textContent = text ?? '';
    caption.style.opacity = text ? 1 : 0;
  });
  viewer.stopTour = () => tour.stop();

  // Cuando el cuadro se vuelve ventana por primera vez, se cuenta qué pasó.
  viewer.onWindowOpened = () => {
    caption.textContent = 'El cuadro se volvió transparente y nada cambió: detrás hay un espacio que proyecta exactamente la pintura.';
    caption.style.opacity = 1;
    setTimeout(() => (caption.style.opacity = 0), 6500);
  };

  const gui = new GUI({ title: 'Crivelli 3D' });
  const actions = {
    volver: () => viewer.returnToEye(),
    museo: () => viewer.enterMuseum(),
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
  gui.add(actions, 'museo').name('Volver al museo');
  gui.add(actions, 'caminar').name('Entrar y caminar (WASD)');
  gui.add(actions, 'orbita').name('Modo órbita');
  gui.add(actions, 'maqueta').name('Modo maqueta');

  const fill = gui.addFolder('Lo que Crivelli no pintó');
  fill.add(settings, 'fillMode', { 'Fiel al cuadro': 'fiel', 'Neutro (yeso)': 'neutro', Inferido: 'inferido' })
    .name('Modo').onChange((v) => viewer.setFillMode(v));
  fill.add(settings, 'markInferred').name('Marcar lo inferido').onChange((v) => {
    viewer.uniforms.uMarkInferred.value = v ? 1 : 0;
  });
  fill.add(settings, 'evidence').name('Aristas: medido / supuesto').onChange((v) => viewer.setEvidenceVisible(v));

  // Medir dentro de la pintura (single view metrology)
  const measure = new MeasureTool(viewer, document.getElementById('measures'));
  const prevFrame = viewer.onFrame;
  viewer.onFrame = (v) => {
    prevFrame?.(v);
    measure.update();
  };
  const presetNames = Object.fromEntries(PRESETS.map((p, i) => [p.name, i]));
  const measureState = { on: false, preset: 0 };
  const meas = gui.addFolder('Medir (metrología de una vista)');
  meas.add(measureState, 'on').name('Medir con dos clics').onChange((v) => measure.setEnabled(v));
  meas.add(measureState, 'preset', presetNames).name('Medición sugerida').onChange((i) => measure.showPreset(PRESETS[i]));
  meas.add({ all: () => PRESETS.forEach((p) => measure.showPreset(p)) }, 'all').name('Mostrar todas');
  meas.add({ clear: () => measure.clear() }, 'clear').name('Borrar mediciones');
  meas.close();

  const check = gui.addFolder('Comprobar la geometría');
  check.add(settings, 'overlay').name('Superponer la pintura');
  check.add(settings, 'overlayOpacity', 0, 1, 0.01).name('Opacidad');
  check.add(settings, 'helpers').name('Líneas y punto de fuga 3D').onChange((v) => viewer.setHelpersVisible(v));
  check.add(settings, 'plan').name('Planta reconstruida').onChange((v) => {
    document.getElementById('plan').classList.toggle('visible', v);
  });

  const extras = gui.addFolder('Extras');
  extras.add(settings, 'fog', 0, 1, 0.01).name('Perspectiva aérea (Leonardo)').onChange((v) => {
    viewer.fogStrength = v;
  });
  extras.add(actions, 'recorrido').name('▶ Recorrido guiado (60 s)');
  extras.add(actions, 'captura').name('Guardar captura PNG');
  extras.close();

  gui.add(actions, 'creditos').name('Créditos y fuentes');
  // Si el modo cambia desde código (por ejemplo, el recorrido guiado), el panel lo refleja.
  viewer.onChange(() => {
    if (settings.fillMode !== viewer.fillMode) {
      settings.fillMode = viewer.fillMode;
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
    }
  });
  document.getElementById('credits-close').addEventListener('click', () => document.getElementById('credits').close());

  // Atajo: tecla R = volver al ojo
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR') viewer.returnToEye();
  });

  // Exponer para depuración y capturas desde la consola
  window.crivelli = { viewer, tour, calib, settings, gui, measure };
}

main().catch((err) => {
  console.error(err);
  document.getElementById('loading').textContent = `Error: ${err.message}`;
});
