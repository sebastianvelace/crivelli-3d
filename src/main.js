import * as THREE from 'three';
import GUI from 'lil-gui';
import { Viewer } from './app/Viewer.js';
import { createTour, TOUR_SECONDS } from './app/tour.js';
import { MeasureTool, PRESETS } from './app/measure.js';
import './style.css';

const BASE = import.meta.env.BASE_URL;

async function loadJSON(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path}`);
  return res.json();
}

async function main() {
  const [calibration, sceneData, textureMeta] = await Promise.all([
    loadJSON('data/calibration.json'),
    loadJSON('data/scene.json'),
    loadJSON('data/textures.json').catch((err) => {
      console.warn('Sin texturas inferidas:', err.message);
      return null;
    }),
  ]);
  const progress = document.getElementById('load-progress');
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_, loaded, total) => { progress.value = loaded / total * 100; };
  const loader = new THREE.TextureLoader(manager);
  const [painting, inferred] = await Promise.all([
    loader.loadAsync(BASE + 'painting/crivelli_ng739_2048.jpg'),
    loadInferred(loader, textureMeta),
  ]);
  painting.colorSpace = THREE.SRGBColorSpace;
  painting.anisotropy = 8;

  const viewer = new Viewer(document.getElementById('app'), calibration, sceneData, painting, inferred);
  setupOverlays(viewer, calibration, painting.image);
  setupGui(viewer, calibration);
  document.getElementById('loading').remove();
}

async function loadInferred(loader, meta) {
  if (!meta) return null;
  try {
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

function setupOverlays(viewer, calib, overlay) {
  document.getElementById('overlay').replaceWith(overlay);
  overlay.id = 'overlay';
  overlay.alt = '';
  const frame = document.getElementById('frame');
  const hud = document.getElementById('hud-mode');
  const numbers = document.getElementById('hud-numbers');
  const hint = document.getElementById('hint');
  const touchWalk = document.getElementById('touch-walk');
  const touchInput = matchMedia('(hover: none) and (pointer: coarse)');
  const formatDecimal = (value) => value.toFixed(2).replace('.', ',');
  numbers.textContent = `Ojo a ${formatDecimal(calib.eyeHeightM)} m de altura y a ${Math.round(viewer.museum.windowDistance * 100)} cm del cuadro · ` +
    `la perspectiva de Crivelli se desvía ${formatDecimal(calib.perspectiveErrorMeanDeg)}°`;
  for (const button of touchWalk.querySelectorAll('button')) {
    const key = button.dataset.key;
    button.addEventListener('pointerdown', (event) => {
      button.setPointerCapture(event.pointerId);
      viewer.keys.add(key);
    });
    button.addEventListener('lostpointercapture', () => viewer.keys.delete(key));
  }
  touchInput.addEventListener('change', () => viewer.emit());

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
    document.body.dataset.mode = viewer.mode;
    legend.innerHTML = LEGEND[viewer.fillMode] ?? '';
    // En el museo y en el ojo todo es pintura: la leyenda de los modos no aplica.
    legend.hidden = ['museum', 'eye', 'tour', 'transition'].includes(viewer.mode) || viewer.walkBlocked;
    numbers.hidden = !['museum', 'eye'].includes(viewer.mode);
    const touchWalking = viewer.mode === 'walk' && touchInput.matches;
    touchWalk.hidden = !touchWalking;
    const [title, defaultHint] = MODE_TEXT[viewer.mode] ?? ['', ''];
    const text = viewer.walkBlocked
      ? 'Parate en la marca amarilla (o usá «Volver al ojo») para que el cuadro se abra'
      : touchWalking ? 'Arrastra para mirar · usa las flechas para caminar' : defaultHint;
    hud.textContent = title;
    hint.textContent = text;
  });
  viewer.emit();

  // Cada cuadro: el marco y la superposición se ajustan al rectángulo de la pintura
  // y aparecen solo cuando estamos en el ojo.
  viewer.onFrame = () => {
    const camera = viewer.camera;
    const framed = viewer.mode === 'tour' && viewer.tourFramed;
    const side = (camera.viewportW - camera.viewportH * camera.space.W / camera.space.H * 0.94) / 2 >= 200;
    const margin = framed && !side ? Math.min(0.94, Math.max(0.5, 1 - 144 / camera.viewportH)) : 0.94;
    if (camera.margin !== margin) {
      camera.margin = margin;
      camera.updateProjectionMatrix();
    }
    const r = viewer.camera.paintingRect();
    if (framed) {
      document.body.dataset.tourFrame = side ? 'side' : 'stacked';
      document.body.style.setProperty('--painting-left', `${r.left}px`);
    } else if (document.body.dataset.tourFrame) {
      delete document.body.dataset.tourFrame;
    }
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
  const measure = new MeasureTool(viewer, document.getElementById('measures'));
  const tourControls = document.getElementById('tour-controls');
  const tourProgress = document.getElementById('tour-progress');
  const tourPause = document.getElementById('tour-pause');
  let windowCaptionTimer;
  const tour = createTour(viewer, measure, (state) => {
    clearTimeout(windowCaptionTimer);
    caption.textContent = state?.caption ?? '';
    caption.style.opacity = state ? 1 : 0;
    viewer.tourFramed = state?.framed ?? false;
    tourControls.hidden = !state;
    tourProgress.textContent = state ? `${state.index + 1}/${state.count}` : '';
    tourPause.textContent = state?.paused ? 'Reanudar' : 'Pausar';
  });
  viewer.stopTour = () => tour.stop();
  tourPause.addEventListener('click', () => tour.togglePause());
  document.getElementById('tour-next').addEventListener('click', () => tour.next());
  document.getElementById('tour-stop').addEventListener('click', () => tour.stop());

  // Cuando el cuadro se vuelve ventana por primera vez, se cuenta qué pasó.
  viewer.onWindowOpened = () => {
    if (tour.active) return;
    caption.textContent = 'El cuadro se volvió transparente y nada cambió: detrás hay un espacio que proyecta exactamente la pintura.';
    caption.style.opacity = 1;
    clearTimeout(windowCaptionTimer);
    windowCaptionTimer = setTimeout(() => {
      caption.style.opacity = 0;
      caption.textContent = '';
    }, 6500);
  };

  const gui = new GUI({ title: 'Crivelli 3D' });
  if (matchMedia('(max-width: 767px)').matches) gui.close();
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

  gui.add(actions, 'museo').name('Volver al museo');
  gui.add(actions, 'volver').name('Volver al ojo (R)');
  gui.add(actions, 'caminar').name('Entrar y caminar');
  gui.add(actions, 'maqueta').name('Modo maqueta');
  gui.add(actions, 'recorrido').name(`Recorrido guiado (${TOUR_SECONDS} s)`);
  const meas = gui.addFolder('Medir');
  const advanced = gui.addFolder('Avanzado').close();
  advanced.add(actions, 'orbita').name('Modo órbita');

  const fill = advanced.addFolder('Lo que Crivelli no pintó');
  fill.add(settings, 'fillMode', { 'Fiel al cuadro': 'fiel', 'Neutro (yeso)': 'neutro', Inferido: 'inferido' })
    .name('Modo').onChange((v) => viewer.setFillMode(v));
  fill.add(settings, 'markInferred').name('Marcar lo inferido').onChange((v) => {
    viewer.uniforms.uMarkInferred.value = v ? 1 : 0;
  });
  fill.add(settings, 'evidence').name('Aristas: medido / supuesto').onChange((v) => viewer.setEvidenceVisible(v));

  // Medir dentro de la pintura (single view metrology)
  const prevFrame = viewer.onFrame;
  viewer.onFrame = (v) => {
    prevFrame?.(v);
    measure.update();
  };
  const presetNames = Object.fromEntries(PRESETS.map((p, i) => [p.name, i]));
  const measureState = { on: false, preset: 0 };
  const measureToggle = meas.add(measureState, 'on').name('Medir con dos clics').onChange((v) => measure.setEnabled(v));
  meas.add(measureState, 'preset', presetNames).name('Medición sugerida').onChange((i) => measure.showPreset(PRESETS[i]));
  meas.add({ all: () => PRESETS.forEach((p) => measure.showPreset(p)) }, 'all').name('Mostrar todas');
  meas.add({ clear: () => measure.clear() }, 'clear').name('Borrar mediciones');
  meas.close();

  const check = advanced.addFolder('Comprobar la geometría');
  check.add(settings, 'overlay').name('Superponer la pintura');
  check.add(settings, 'overlayOpacity', 0, 1, 0.01).name('Opacidad');
  check.add(settings, 'helpers').name('Líneas y punto de fuga 3D').onChange((v) => viewer.setHelpersVisible(v));
  check.add(settings, 'plan').name('Planta reconstruida').onChange((v) => {
    const img = document.getElementById('plan-img');
    if (v && !img.hasAttribute('src')) img.src = BASE + 'data/planta.png';
    document.getElementById('plan').classList.toggle('visible', v);
  });

  const extras = advanced.addFolder('Extras');
  extras.add(settings, 'fog', 0, 1, 0.01).name('Perspectiva aérea (Leonardo)').onChange((v) => {
    viewer.fogStrength = v;
  });
  extras.add(actions, 'captura').name('Guardar captura PNG');
  extras.close();

  advanced.add(actions, 'creditos').name('Créditos y fuentes');
  // Si el modo cambia desde código (por ejemplo, el recorrido guiado), el panel lo refleja.
  viewer.onChange(() => {
    if (measureState.on !== measure.enabled) {
      measureState.on = measure.enabled;
      measureToggle.updateDisplay();
    }
    if (settings.fillMode !== viewer.fillMode) {
      settings.fillMode = viewer.fillMode;
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
    }
  });
  const credits = document.getElementById('credits');
  document.getElementById('credits-close').addEventListener('click', () => credits.close());
  credits.addEventListener('click', (event) => {
    if (event.target !== credits) return;
    const rect = credits.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      credits.close();
    }
  });

  // Atajo: tecla R = volver al ojo
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR') viewer.returnToEye();
    if (e.code === 'Escape' && tour.active) tour.stop();
  });

  // Exponer para depuración y capturas desde la consola
  window.crivelli = { viewer, tour, calib, settings, gui, measure };
}

main().catch((err) => {
  console.error(err);
  document.getElementById('loading').textContent = `Error: ${err.message}`;
});
