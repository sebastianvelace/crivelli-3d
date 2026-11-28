import * as THREE from 'three';
import { Viewer } from './app/Viewer.js';
import { createTour, TOUR_SECONDS } from './app/tour.js';
import { MeasureTool, PRESETS } from './app/measure.js';
import { drawPerspectiveOverlay } from './scene/perspectiveOverlay.js';
import './style.css';
import './viewer.css';

const BASE = import.meta.env.BASE_URL;

async function loadJSON(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path}`);
  return res.json();
}

const home = document.getElementById('home');
const experience = document.getElementById('experience');
const paintingImage = document.getElementById('home-painting');

async function prepareViewer(progress) {
  const [calibration, sceneData, textureMeta] = await Promise.all([
    loadJSON('data/calibration.json'),
    loadJSON('data/scene.json'),
    loadJSON('data/textures.json').catch((err) => {
      console.warn('Sin texturas inferidas:', err.message);
      return null;
    }),
  ]);
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_, loaded, total) => { progress.value = loaded / total * 100; };
  const loader = new THREE.TextureLoader(manager);
  const [inferred, galleryImage] = await Promise.all([
    loadInferred(loader, textureMeta),
    new THREE.ImageLoader(manager).loadAsync(BASE + 'textures/museo/madonna-rondine.jpg').catch(() => null),
    paintingImage.decode(),
  ]);
  const painting = new THREE.Texture(paintingImage);
  painting.colorSpace = THREE.SRGBColorSpace;
  painting.anisotropy = 8;
  painting.needsUpdate = true;

  const [{ RectAreaLightUniformsLib }] = await Promise.all([
    import('three/examples/jsm/lights/RectAreaLightUniformsLib.js'),
    document.fonts.load('16px Baskervville'),
    document.fonts.load('italic 16px Baskervville'),
  ]);
  RectAreaLightUniformsLib.init();
  const viewer = new Viewer(document.getElementById('app'), calibration, sceneData, painting, inferred, galleryImage);
  setupOverlays(viewer, calibration);
  return setupControls(viewer, calibration);
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

function setupOverlays(viewer, calib) {
  const overlay = document.getElementById('overlay');
  const perspective = document.getElementById('perspective-overlay');
  drawPerspectiveOverlay(perspective, calib);
  const frame = document.getElementById('frame');
  const hud = document.getElementById('hud-mode');
  const numbers = document.getElementById('hud-numbers');
  const hint = document.getElementById('hint');
  const touchWalk = document.getElementById('touch-walk');
  const touchInput = matchMedia('(hover: none) and (pointer: coarse)');
  const formatDecimal = (value) => value.toFixed(2).replace('.', ',');
  numbers.textContent = `Ojo a ${formatDecimal(calib.eyeHeightM)} m de altura y a ${Math.round(viewer.museum.windowDistance * 100)} cm del cuadro. Desviación de la perspectiva: ${formatDecimal(calib.perspectiveErrorMeanDeg)}°.`;
  for (const button of touchWalk.querySelectorAll('button')) {
    const key = button.dataset.key;
    button.addEventListener('pointerdown', (event) => {
      button.setPointerCapture(event.pointerId);
      viewer.keys.add(key);
    });
    button.addEventListener('lostpointercapture', () => viewer.keys.delete(key));
  }
  touchInput.addEventListener('change', () => viewer.emit());

  const modeText = {
    eye: ['En el ojo de Crivelli', 'Elige «Caminar» para cruzar el marco.'],
    walk: ['Caminando', 'Clic para mirar · WASD para caminar · rueda para acercar · Q/E para subir y bajar · Esc suelta el mouse'],
    orbit: ['Vista en órbita', 'Arrastra para girar · usa la rueda para acercarte'],
    model: ['Vista de maqueta', 'El punto dorado marca el ojo del pintor.'],
    transition: ['Cambiando de vista…', ''],
    tour: ['Recorrido guiado', ''],
  };

  viewer.onChange(() => {
    document.body.dataset.mode = viewer.mode;
    const touchWalking = viewer.mode === 'walk' && touchInput.matches;
    touchWalk.hidden = !touchWalking;
    const [title, defaultHint] = modeText[viewer.mode];
    hud.textContent = title;
    const approachingPainting = viewer.mode === 'walk' && !viewer.windowOpen;
    if (approachingPainting) {
      hint.textContent = 'Camina hasta la placa del piso o pulsa «Ojo» para ver cómo se abre el cuadro.';
    } else {
      hint.textContent = touchWalking ? 'Arrastra para mirar y usa las flechas para caminar.' : defaultHint;
    }
  });
  viewer.emit();

  // Reserva espacio para los controles sin deformar la proyección de la pintura.
  let previousRect;
  viewer.onFrame = () => {
    const camera = viewer.camera;
    const framed = viewer.mode === 'eye' || (viewer.mode === 'tour' && viewer.tourFramed);
    const { viewportW: w, viewportH: h, space } = camera;
    if (!w || !h) return;
    const fitHeight = Math.min(h, w * space.H / space.W);
    const side = (w - h * space.W / space.H * 0.94) / 2 >= 240;
    const controlsHeight = viewer.mode === 'eye' && w <= 545 && h > 660 ? 352 : 196;
    const margin = framed && !side ? Math.min(0.94, Math.max(0.44, (h - controlsHeight) / fitHeight)) : 0.94;
    const layout = framed ? (side ? 'side' : 'stacked') : '';
    if (document.body.dataset.framing !== layout) document.body.dataset.framing = layout;
    if (camera.margin !== margin) {
      camera.margin = margin;
      camera.updateProjectionMatrix();
    }
    const r = camera.paintingRect();
    const rectKey = `${r.left}/${r.top}/${r.width}/${r.height}`;
    if (rectKey !== previousRect) {
      previousRect = rectKey;
      document.body.style.setProperty('--painting-left', `${r.left}px`);
      document.body.style.setProperty('--painting-top', `${r.top}px`);
      for (const el of [overlay, frame, perspective]) {
        el.style.left = `${r.left}px`;
        el.style.top = `${r.top}px`;
        el.style.width = `${r.width}px`;
        el.style.height = `${r.height}px`;
      }
    }
    const k = viewer.eyeFactor();
    frame.style.opacity = k.toFixed(3);
    const s = viewer.settings;
    overlay.style.opacity = (s?.overlay ? s.overlayOpacity * k : 0).toFixed(3);
    perspective.toggleAttribute('hidden', viewer.mode !== 'eye' || !viewer.showHelpers);
  };
}

function setupControls(viewer, calib) {
  const gui = document.getElementById('viewer-nav');
  function alignTools() {
    const { bottom, height } = gui.getBoundingClientRect();
    experience.style.setProperty('--tools-top', `${bottom + 9}px`);
    experience.style.setProperty('--nav-height', `${height}px`);
  }
  new ResizeObserver(alignTools).observe(gui);
  const caption = document.getElementById('caption');
  const measure = new MeasureTool(viewer, document.getElementById('measures'));
  const tourControls = document.getElementById('tour-controls');
  const tourProgress = document.getElementById('tour-progress');
  const tourPause = document.getElementById('tour-pause');
  let windowCaptionTimer;
  const tour = createTour(viewer, measure, (state) => {
    clearTimeout(windowCaptionTimer);
    const restoreFocus = !state && tourControls.contains(document.activeElement);
    caption.textContent = state?.caption ?? '';
    viewer.tourFramed = state?.framed ?? false;
    tourControls.hidden = !state;
    tourProgress.textContent = state ? `${state.index + 1} de ${state.count}` : '';
    tourPause.textContent = state?.paused ? 'Reanudar' : 'Pausar';
    if (restoreFocus) document.getElementById('viewer-title').focus({ preventScroll: true });
  });
  viewer.stopTour = () => tour.stop();
  tourPause.addEventListener('click', () => tour.togglePause());
  document.getElementById('tour-next').addEventListener('click', () => tour.next());
  document.getElementById('tour-stop').addEventListener('click', () => tour.stop());
  viewer.onWindowOpened = () => {
    if (tour.active) return;
    caption.textContent = 'El cuadro se abrió. Desde aquí, la calle y la pintura coinciden.';
    clearTimeout(windowCaptionTimer);
    windowCaptionTimer = setTimeout(() => { caption.textContent = ''; }, 4900);
  };

  const tools = document.getElementById('viewer-tools');
  const panels = {
    measure: document.getElementById('measure-panel'),
    options: document.getElementById('options-panel'),
  };
  const toolButtons = [...gui.querySelectorAll('[data-tool]')];
  const title = document.getElementById('tools-title');
  const toolClose = document.getElementById('tools-close');
  let openTool = null;

  function showTool(next, focus = true) {
    const previous = openTool;
    openTool = next;
    if (next) alignTools();
    tools.hidden = !next;
    let activeButton;
    for (const button of toolButtons) {
      const key = button.dataset.tool;
      const open = key === next;
      button.setAttribute('aria-expanded', open);
      panels[key].hidden = !open;
      if (open) activeButton = button;
    }
    if (activeButton) {
      title.textContent = activeButton.textContent;
      if (focus) toolClose.focus();
    } else if (focus && previous) {
      toolButtons.find((button) => button.dataset.tool === previous).focus();
    }
  }
  for (const button of toolButtons) {
    button.addEventListener('click', () => showTool(openTool === button.dataset.tool ? null : button.dataset.tool));
  }
  toolClose.addEventListener('click', () => showTool(null));

  const viewActions = {
    eye: () => { if (viewer.mode !== 'eye') viewer.returnToEye(); },
    walk: () => { tour.stop(); viewer.enterWalk(); },
    model: () => { tour.stop(); if (viewer.mode !== 'model') viewer.enterModel(); },
    orbit: () => { tour.stop(); if (viewer.mode !== 'orbit') viewer.enterOrbit(); },
  };
  const viewButtons = [...experience.querySelectorAll('[data-view]')];
  for (const button of viewButtons) {
    button.addEventListener('click', () => {
      if (tools.contains(button)) document.getElementById('viewer-title').focus({ preventScroll: true });
      showTool(null, false);
      viewActions[button.dataset.view]();
    });
  }

  const measureToggle = document.getElementById('measure-toggle');
  const measureGuide = document.getElementById('measure-guide');
  const hint = document.getElementById('hint');
  const presets = document.getElementById('measure-preset');
  for (const [i, preset] of PRESETS.entries()) presets.add(new Option(preset.name, i));
  measureToggle.addEventListener('click', () => {
    measure.setEnabled(!measure.enabled);
    if (measure.enabled) showTool(null);
    viewer.emit();
  });
  document.getElementById('measure-add').addEventListener('click', () => measure.showPreset(PRESETS[Number(presets.value)]));
  document.getElementById('measure-all').addEventListener('click', () => PRESETS.forEach((preset) => measure.showPreset(preset)));
  document.getElementById('measure-clear').addEventListener('click', () => measure.clear());
  const prevFrame = viewer.onFrame;
  viewer.onFrame = (v) => {
    prevFrame(v);
    measure.update();
  };

  const settings = viewer.settings = {};
  const plan = document.getElementById('plan');
  const planImage = document.getElementById('plan-img');
  const planExpand = document.getElementById('plan-expand');
  const planDialog = document.getElementById('plan-dialog');
  const planDialogImage = document.getElementById('plan-dialog-img');
  planExpand.addEventListener('click', () => {
    planDialogImage.src = planImage.src;
    viewer.keys.clear();
    if (viewer.pointerLock.isLocked) viewer.pointerLock.unlock();
    planDialog.showModal();
  });
  planDialog.addEventListener('close', () => planExpand.focus());
  const overlay = document.getElementById('overlay');
  const applySettings = {
    fillMode: (value) => viewer.setFillMode(value),
    markInferred: (value) => { viewer.uniforms.uMarkInferred.value = Number(value); },
    evidence: (value) => viewer.setEvidenceVisible(value),
    helpers: (value) => viewer.setHelpersVisible(value),
    overlay: (value) => {
      if (value && !overlay.hasAttribute('src')) overlay.src = paintingImage.currentSrc;
    },
    plan: (value) => {
      if (value && !planImage.hasAttribute('src')) planImage.src = BASE + 'data/planta.png';
      plan.hidden = !value;
    },
    fog: (value) => { viewer.fogStrength = value; },
  };
  for (const input of panels.options.querySelectorAll('[data-setting]')) {
    const key = input.dataset.setting;
    const read = () => input.type === 'checkbox' ? input.checked : input.type === 'range' ? input.valueAsNumber : input.value;
    settings[key] = read();
    input.addEventListener(input.type === 'range' ? 'input' : 'change', () => {
      settings[key] = read();
      applySettings[key]?.(settings[key]);
    });
  }
  const planToggle = panels.options.querySelector('[data-setting="plan"]');
  document.getElementById('plan-close').addEventListener('click', () => {
    settings.plan = planToggle.checked = false;
    applySettings.plan(false);
    if (openTool === 'options') planToggle.focus();
    else if (tour.active) tourPause.focus();
    else toolButtons.find((button) => button.dataset.tool === 'options').focus();
  });
  document.getElementById('download-capture').addEventListener('click', () => {
    const link = document.createElement('a');
    link.href = viewer.screenshot();
    link.download = `crivelli3d_${viewer.mode}.png`;
    link.click();
  });
  document.getElementById('start-tour').addEventListener('click', () => {
    showTool(null, false);
    tour.start();
    tourPause.focus();
  });

  const fill = document.getElementById('fill-mode');
  const legend = document.getElementById('legend');
  const descriptions = {
    fiel: 'Deja vacías las superficies que Crivelli no pintó. Las aristas blancas son medidas y las doradas, supuestas.',
    neutro: 'Representa en color yeso las superficies ocultas.',
    inferido: 'Completa las superficies ocultas con textura tomada de las zonas visibles.',
  };
  viewer.onChange(() => {
    for (const button of viewButtons) button.setAttribute('aria-pressed', button.dataset.view === viewer.mode);
    measureToggle.setAttribute('aria-pressed', measure.enabled);
    document.body.dataset.measuring = String(measure.enabled);
    measureGuide.hidden = !measure.enabled;
    measureGuide.textContent = viewer.mode === 'walk'
      ? 'Con el mouse capturado, apunta con la mira y haz clic en dos puntos.'
      : 'Haz clic en dos puntos de la escena para medir la distancia.';
    if (measure.enabled && !viewer.walkBlocked && viewer.mode !== 'transition') {
      hint.textContent = measureGuide.textContent;
    }
    fill.value = settings.fillMode = viewer.fillMode;
    legend.textContent = descriptions[viewer.fillMode];
  });
  viewer.emit();

  window.addEventListener('keydown', (event) => {
    if (experience.hidden || experience.inert || planDialog.open || document.getElementById('credits').open) return;
    if (event.code === 'Escape' && openTool) showTool(null);
    else if (event.code === 'Escape' && tour.active) tour.stop();
    else if (event.code === 'KeyR' && !event.repeat && !event.target.closest?.('input, select, textarea')) viewer.returnToEye();
  });

  window.crivelli = { viewer, tour, calib, settings, gui, measure };
  return { viewer, tour, measure, closeTools: () => showTool(null, false) };
}

function setupNavigation() {
  const artworkInfo = document.getElementById('credits');
  for (const button of document.querySelectorAll('[data-credits]')) {
    button.addEventListener('click', () => artworkInfo.showModal());
  }
  artworkInfo.addEventListener('click', (event) => {
    if (event.target !== artworkInfo) return;
    const box = artworkInfo.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) artworkInfo.close();
  });

  const loading = document.getElementById('loading');
  const message = document.getElementById('load-message');
  const progress = document.getElementById('load-progress');
  const buttons = [...home.querySelectorAll('[data-entry]')];
  const duration = document.getElementById('tour-duration');
  duration.textContent = `Recorrido · ${Math.floor(TOUR_SECONDS / 60)} min ${TOUR_SECONDS % 60} s`;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let scene = null;
  let pending = false;
  let lastEntry;

  for (const button of buttons) {
    button.addEventListener('click', async () => {
      if (pending) return;
      pending = true;
      lastEntry = button;
      if (!scene) {
        buttons.forEach((entry) => { entry.disabled = true; });
        loading.hidden = progress.hidden = false;
        progress.removeAttribute('value');
        message.textContent = 'Preparando la sala…';
        try {
          scene = await prepareViewer(progress);
        } catch (error) {
          console.error(error);
          progress.hidden = true;
          message.textContent = 'No se pudo abrir el visor 3D. Comprueba que tu navegador tenga WebGL habilitado y vuelve a intentarlo.';
          pending = false;
          return;
        } finally {
          buttons.forEach((entry) => { entry.disabled = false; });
          if (scene) loading.hidden = true;
          else if (!artworkInfo.open) button.focus();
        }
      }

      const travel = reducedMotion.matches ? 0 : 1.45;
      const fading = travel > 0;
      if (fading) {
        home.style.top = `${-window.scrollY}px`;
        home.dataset.leaving = '';
      } else {
        home.hidden = true;
      }
      home.inert = true;
      experience.inert = true;
      experience.hidden = false;
      window.scrollTo(0, 0);
      const { viewer, tour } = scene;
      viewer.renderer.setAnimationLoop(null);
      viewer.keys.clear();
      viewer.resize();
      viewer.timer.reset();
      // Cámara y fundido comparten el mismo avance para mantenerlos sincronizados.
      const onProgress = fading ? (t) => { home.style.opacity = 1 - THREE.MathUtils.smoothstep(t, 0.02, 0.93); } : undefined;
      const guided = button.dataset.entry === 'tour';
      const arrival = new Promise((resolve) => viewer.enterMuseum(resolve, {
        fromEntrance: true, duration: travel, onProgress, mode: guided ? 'tour' : 'walk',
      }));
      viewer.tick();
      viewer.timer.reset();
      viewer.renderer.setAnimationLoop(() => viewer.tick());
      await arrival;
      home.hidden = true;
      delete home.dataset.leaving;
      home.style.removeProperty('top');
      home.style.removeProperty('opacity');
      experience.inert = false;
      viewer.keys.clear();
      pending = false;
      if (guided) {
        tour.start();
        document.getElementById('tour-pause').focus({ preventScroll: true });
      } else {
        document.getElementById('viewer-title').focus({ preventScroll: true });
      }
    });
  }

  document.getElementById('go-home').addEventListener('click', () => {
    const { viewer, tour, measure, closeTools } = scene;
    closeTools();
    tour.stop();
    measure.setEnabled(false);
    measure.clear();
    viewer.renderer.setAnimationLoop(null);
    viewer.keys.clear();
    if (viewer.pointerLock.isLocked) viewer.pointerLock.unlock();
    experience.hidden = true;
    home.hidden = false;
    home.inert = false;
    lastEntry.focus({ preventScroll: true });
  });
}

setupNavigation();
