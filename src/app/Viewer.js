import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PictureSpace, resolvePlanes, buildElementGeometry } from '../core/pictureSpace.js';
import { createProjectiveMaterial, createSharedUniforms, FILL_MODES } from '../core/projectiveMaterial.js';
import { createPainterCamera, VisitorCamera } from '../core/cameras.js';
import { createPerspectiveHelpers, createEyeMarker, HELPER_LAYER } from '../scene/perspectiveHelpers.js';
import { createMuseum, MUSEUM_LAYER, ROOM, SKYLIGHT_HEIGHT } from '../scene/museum.js';
import { constrainWalk } from './walkBounds.js';

const PAINTER_NEAR = 0.3;
const PAINTER_FAR = 200;
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/**
 * Visor principal. Modos:
 *   'eye'   -> en el ojo de Crivelli; la escena coincide con la pintura.
 *   'walk'  -> primera persona (WASD + mouse con PointerLock).
 *   'orbit' -> órbita libre alrededor de la calle.
 *   'model' -> "maqueta": vista casi isométrica, como la reconstrucción de la Flagelación.
 */
export class Viewer {
  constructor(container, calibration, sceneData, paintingTexture, inferred, galleryImage) {
    this.container = container;
    this.calib = calibration;
    this.space = new PictureSpace(calibration);
    this.mode = 'walk';
    this.exteriorTransition = false;
    this.windowOpen = false; // ¿el cuadro ya se volvió ventana?
    this.listeners = new Set();
    this.animation = null;
    this.keys = new Set();

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, stencil: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    // Esta versión de three.js integra el filtrado suave en PCFShadowMap.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#17130f');
    const distribution = new THREE.PMREMGenerator(this.renderer);
    const roomLight = new RoomEnvironment();
    this.environmentTarget = distribution.fromScene(roomLight, 0.035);
    this.scene.environment = this.environmentTarget.texture;
    this.scene.environmentIntensity = 0.4;
    distribution.dispose();
    roomLight.dispose();

    // Cámaras
    this.painterCamera = createPainterCamera(this.space, PAINTER_NEAR, PAINTER_FAR);
    this.camera = new VisitorCamera(this.space);
    this.camera.position.copy(this.space.eye);
    this.camera.layers.enable(HELPER_LAYER);
    this.camera.layers.enable(MUSEUM_LAYER);

    // Mapa de profundidad visto desde el ojo (para detectar zonas ocultas)
    const rtW = 1400;
    const rtH = Math.round((rtW * this.space.H) / this.space.W);
    this.depthTarget = inferred?.ownership ? null : new THREE.WebGLRenderTarget(rtW, rtH, {
      depthTexture: new THREE.DepthTexture(rtW, rtH, THREE.UnsignedIntType),
    });

    this.uniforms = createSharedUniforms(paintingTexture, this.depthTarget?.depthTexture, PAINTER_NEAR, PAINTER_FAR);
    this.uniforms.uOwnership.value = inferred?.ownership ?? null;
    this.uniforms.uHasOwnership.value = !!inferred?.ownership;
    this.uniforms.uPainterViewProj.value.multiplyMatrices(
      this.painterCamera.projectionMatrix,
      this.painterCamera.matrixWorldInverse,
    );

    this.buildPicture(sceneData, inferred);
    this.buildHelpers(paintingTexture);
    this.museum = createMuseum(this.space, calibration, paintingTexture, galleryImage);
    this.scene.add(this.museum.group);
    this.eyeBacking = new THREE.Mesh(this.museum.panel.geometry, new THREE.MeshBasicMaterial({
      map: paintingTexture, toneMapped: false, depthWrite: false, depthTest: false,
    }));
    this.eyeBacking.position.copy(this.museum.panel.position);
    this.eyeBacking.name = 'respaldo_cuadro';
    this.eyeBacking.renderOrder = -2;
    this.eyeBacking.layers.set(HELPER_LAYER);
    this.eyeBacking.visible = false;
    this.scene.add(this.eyeBacking);
    this.buildThreshold();
    this.panelOpacity = 1;
    if (this.depthTarget) this.renderDepth();
    this.renderer.shadowMap.needsUpdate = true;

    // Controles
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enabled = false;
    this.orbit.enableDamping = true;
    this.pointerLock = new PointerLockControls(this.camera, this.renderer.domElement);
    // OrbitControls reorienta la cámara hacia su target al crearse: fijamos la pose
    // inicial después. Se empieza en el museo, de pie frente al cuadro.
    const start = this.museum.startPose;
    this.camera.position.copy(start.position);
    this.camera.quaternion.copy(lookQuaternion(start.position, start.target));
    this.camera.painterness = 0;
    this.camera.freeFov = 60;
    this.renderer.domElement.addEventListener('click', (event) => {
      if (this.mode === 'walk' && !this.animation && event.pointerType !== 'touch' && !this.pointerLock.isLocked) {
        this.pointerLock.lock();
      }
    });
    this.renderer.domElement.addEventListener('wheel', (event) => {
      if (this.mode !== 'walk' || this.animation || event.ctrlKey) return;
      event.preventDefault();
      const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 :
        event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? this.camera.viewportH : 1;
      const fov = this.walkFov ?? this.camera.freeFov;
      this.walkFov = THREE.MathUtils.clamp(fov * Math.exp(event.deltaY * scale * 0.0012), 26, 80);
    }, { passive: false });
    // Teclas apretadas. Si la ventana pierde el foco (Esc del pointer lock, cambio
    // de pestaña, clic en el panel) el navegador no envía "keyup" y la tecla quedaría
    // apretada para siempre: por eso se vacía el conjunto en esos casos.
    const typing = (e) => e.target instanceof HTMLElement && e.target.closest('input, select, textarea, dialog[open]');
    window.addEventListener('keydown', (e) => {
      if (!typing(e) && !e.repeat) this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    const releaseAll = () => this.keys.clear();
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', releaseAll);
    document.addEventListener('pointerlockchange', releaseAll);
    this.renderer.domElement.addEventListener('contextmenu', releaseAll);
    this.setupTouchLook();

    this.timer = new THREE.Timer();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this.tick());
  }

  // ---------------------------------------------------------------- escena

  setupTouchLook() {
    const canvas = this.renderer.domElement;
    let touch = null;
    const angle = new THREE.Euler(0, 0, 0, 'YXZ');
    canvas.addEventListener('pointerdown', (event) => {
      if (this.mode !== 'walk' || event.pointerType !== 'touch' || touch) return;
      touch = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(touch.id);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (this.mode !== 'walk' || touch?.id !== event.pointerId) return;
      angle.setFromQuaternion(this.camera.quaternion);
      angle.y -= (event.clientX - touch.x) * 0.004;
      angle.x = THREE.MathUtils.clamp(angle.x - (event.clientY - touch.y) * 0.004, -1.54, 1.54);
      this.camera.quaternion.setFromEuler(angle);
      touch.x = event.clientX;
      touch.y = event.clientY;
    });
    canvas.addEventListener('lostpointercapture', (event) => {
      if (touch?.id === event.pointerId) touch = null;
    });
  }

  buildPicture(sceneData, inferred) {
    this.planes = resolvePlanes(this.space, sceneData.elements);
    this.pictureGroup = new THREE.Group();
    this.elementMeshes = new Map();
    this.streetFills = [];
    // Aristas de evidencia (capa de ayudas, fuera de la proyección):
    // blanco = plano medido en la pintura, ámbar discontinuo = plano supuesto.
    this.evidenceEdges = new THREE.Group();
    const edgeMeasured = new THREE.LineBasicMaterial({ color: 0xf3ead8, transparent: true, opacity: 0.45, toneMapped: false });
    const edgeAssumed = new THREE.LineDashedMaterial({ color: 0xffb000, dashSize: 0.12, gapSize: 0.08, transparent: true, toneMapped: false });
    this.edgeMaterials = [[edgeMeasured, 0.45], [edgeAssumed, 1]];

    for (const el of sceneData.elements) {
      const info = inferred?.meta[el.id];
      const geometry = buildElementGeometry(this.space, el, this.planes.get(el.id), info?.bounds);
      const material = createProjectiveMaterial(this.uniforms, {
        uInferred: { value: inferred?.textures.get(el.id) ?? null },
        uBackColor: { value: new THREE.Color(info?.backColor ?? '#6e6456') },
        uHasInferred: { value: !!inferred?.textures.has(el.id) },
        uArchitecture: { value: el.kind !== 'figure' },
        uOwner: { value: info?.owner ?? 0 },
        uInferredOnly: { value: el.evidence === 'inferred' },
      });
      material.toneMapped = false;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = el.id;
      mesh.userData = { label: el.label, kind: el.kind, evidence: el.evidence, seenFraction: info?.seenFraction };
      this.pictureGroup.add(mesh);
      this.elementMeshes.set(el.id, mesh);
      if (el.walkOnly) this.streetFills.push(mesh);

      if (el.walkOnly) continue;
      const assumed = el.evidence !== 'measured';
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 1), assumed ? edgeAssumed : edgeMeasured);
      if (assumed) edges.computeLineDistances();
      edges.layers.set(HELPER_LAYER);
      this.evidenceEdges.add(edges);
    }
    this.scene.add(this.pictureGroup, this.evidenceEdges);
    this.setFillMode('neutro');

    // Suelo neutro "infinito" (solo visual, fuera de la proyección). Se dibuja
    // primero y sin escribir profundidad: es un fondo, nunca tapa a la escena.
    // (Un abanico centrado bajo la cámara tiene un vértice con w = 0 en clip
    // space; algunos rasterizadores interpolan mal esa profundidad.)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 240),
      new THREE.MeshBasicMaterial({ color: '#2a241d', depthWrite: false, toneMapped: false }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.02, -60);
    ground.renderOrder = -1;
    ground.layers.set(HELPER_LAYER);
    this.scene.add(ground);
    this.ground = ground;
    this.streetSky = this.buildStreetSky(inferred?.meta.fondo_cielo?.meanColor);
  }

  buildStreetSky(color = '#81969a') {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(125, 32, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      uniforms: { uSky: { value: new THREE.Color(color) }, uMarkInferred: this.uniforms.uMarkInferred },
      vertexShader: /* glsl */ `
        varying vec3 vDirection;
        void main() {
          vDirection = position - cameraPosition;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSky;
        uniform float uMarkInferred;
        varying vec3 vDirection;
        void main() {
          float elevation = normalize(vDirection).y;
          vec3 horizon = mix(uSky, vec3(0.68, 0.57, 0.41), 0.55);
          vec3 ground = mix(uSky, vec3(0.31, 0.22, 0.13), 0.69);
          vec3 zenith = mix(uSky, vec3(0.22, 0.37, 0.51), 0.64);
          vec3 color = mix(horizon, ground, smoothstep(0.0, 0.72, -elevation));
          color = mix(color, zenith, smoothstep(0.0, 0.75, elevation));
          if (uMarkInferred > 0.5) {
            float stripe = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) / 14.0));
            color = mix(color, vec3(0.92, 0.36, 0.62), 0.28 + 0.22 * stripe);
          }
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }
      `,
      toneMapped: false,
    }));
    sky.renderOrder = -2;
    sky.layers.set(HELPER_LAYER);
    sky.visible = false;
    this.scene.add(sky);
    return sky;
  }

  buildThreshold() {
    const { x0, x1, z } = this.museum.aperture;
    const bounds = this.elementMeshes.get('piso_calle').geometry;
    bounds.computeBoundingBox();
    const floorStart = bounds.boundingBox.max.z;
    const threshold = new THREE.Mesh(
      new THREE.PlaneGeometry(x1 - x0, z - floorStart),
      new THREE.MeshBasicMaterial({ color: '#827767', depthWrite: false, toneMapped: false }),
    );
    threshold.name = 'umbral_supuesto';
    threshold.userData.evidence = 'assumed';
    threshold.userData.note = 'Piso de yeso entre el marco y el comienzo del piso pintado.';
    threshold.rotation.x = -Math.PI / 2;
    threshold.position.set((x0 + x1) / 2, 0, (z + floorStart) / 2);
    threshold.renderOrder = -1;
    threshold.layers.set(HELPER_LAYER);
    this.scene.add(threshold);
    this.threshold = threshold;
  }

  buildHelpers(paintingTexture) {
    this.showHelpers = false;
    this.helpers = createPerspectiveHelpers(this.space, this.calib, this.planes, paintingTexture);
    this.helpers.visible = false;
    this.eyeMarker = createEyeMarker(this.space);
    this.eyeMarker.visible = false;
    this.scene.add(this.helpers, this.eyeMarker);
  }

  /** Render de profundidad desde el ojo del pintor (una sola vez: la cámara no se mueve). */
  renderDepth() {
    // La cámara del pintor solo ve la capa 0 (la escena), no las ayudas.
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, colorWrite: false });
    this.scene.overrideMaterial = material;
    this.renderer.setRenderTarget(this.depthTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.painterCamera);
    this.renderer.setRenderTarget(null);
    this.scene.overrideMaterial = null;
    material.dispose();
  }

  // ---------------------------------------------------------------- modos

  onChange(fn) {
    this.listeners.add(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this);
  }

  setMode(mode) {
    if (mode !== 'walk') this.walkFov = null;
    this.mode = mode;
    this.exteriorTransition = false;
    this.walkBlocked = false;
    this.orbit.enabled = mode === 'orbit' || mode === 'model';
    if (mode !== 'walk' && this.pointerLock.isLocked) this.pointerLock.unlock();
    this.setHelpersVisible(this.showHelpers);
    this.emit();
  }

  /** Anima posición, orientación, "painterness" y FOV. */
  animateTo({ position, quaternion, painterness, fov, path, duration = 2.5, onProgress }, onDone) {
    this.orbit.enabled = false;
    if (this.pointerLock.isLocked) this.pointerLock.unlock();
    this.animation = {
      t: 0,
      duration,
      path,
      from: {
        position: this.camera.position.clone(),
        quaternion: this.camera.quaternion.clone(),
        painterness: this.camera.painterness,
        fov: this.camera.freeFov,
      },
      to: {
        position: position ?? this.camera.position.clone(),
        quaternion: quaternion ?? this.camera.quaternion.clone(),
        painterness: painterness ?? this.camera.painterness,
        fov: fov ?? this.camera.freeFov,
      },
      onProgress,
      onDone,
    };
    this.emit();
  }

  /** El momento clave: volver al ojo de Crivelli; la escena vuelve a ser la pintura. */
  returnToEye(duration = 3.2) {
    this.stopTour?.();
    this.setMode('transition');
    this.animateTo(
      { position: this.space.eye.clone(), quaternion: new THREE.Quaternion(), painterness: 1, fov: 70, duration },
      () => {
        this.setMode('eye');
        // Desde aquí el cuadro puede volverse transparente sin que la imagen cambie.
        this.openWindow();
      },
    );
  }

  openWindow() {
    if (this.windowOpen) return;
    this.windowOpen = true;
    this.onWindowOpened?.();
  }

  /** Entra a la sala con el cuadro cerrado. */
  enterMuseum(onDone, { fromEntrance = false, duration = 3, onProgress, mode = 'walk' } = {}) {
    if (mode !== 'tour') this.stopTour?.();
    const { position, target } = this.museum.startPose;
    const quaternion = lookQuaternion(position, target);
    const arrive = () => {
      this.windowOpen = false;
      this.setMode(mode);
      onDone?.();
    };
    if (fromEntrance) {
      this.animation = null;
      this.windowOpen = false;
      this.panelOpacity = 1;
      this.museum.setPanelOpacity(1);
      this.camera.position.copy(position);
      if (duration > 0) this.camera.position.add(new THREE.Vector3(0.32, 0.13, 1.05));
      this.camera.quaternion.copy(lookQuaternion(this.camera.position, target));
      this.camera.painterness = 0;
      this.camera.freeFov = 60;
      this.camera.updateProjectionMatrix();
      if (duration === 0) {
        arrive();
        return;
      }
    }
    this.setMode('transition');
    this.animateTo(
      { position, quaternion, painterness: 0, fov: 60, duration, onProgress },
      arrive,
    );
  }

  enterWalk() {
    if (this.mode === 'walk') return;
    const exterior = this.mode === 'orbit' || this.mode === 'model';
    if (!this.windowOpen && !exterior) {
      this.enterMuseum();
      return;
    }
    this.windowOpen = true;
    const target = this.space.eye.clone().add(new THREE.Vector3(0, 0, -1.6));
    this.setMode('transition');
    this.animateTo(
      { position: target, quaternion: new THREE.Quaternion(), painterness: 0, fov: 70, duration: 1.6 },
      () => this.setMode('walk'),
    );
  }

  enterOrbit() {
    const target = new THREE.Vector3(-0.1, 1.3, -6);
    const pos = new THREE.Vector3(-3.4, 3.4, 1.8);
    this.setMode('transition');
    this.exteriorTransition = true;
    this.animateTo(
      { position: pos, quaternion: lookQuaternion(pos, target), painterness: 0, fov: 60, duration: 2.2 },
      () => {
        this.orbit.target.copy(target);
        this.setMode('orbit');
      },
    );
  }

  enterModel() {
    // Vista casi axonométrica: lejos y con un FOV muy estrecho (como una maqueta).
    const target = new THREE.Vector3(0.4, 3, -11);
    const dir = new THREE.Vector3(-0.55, 0.75, 1).normalize();
    const pos = target.clone().addScaledVector(dir, 120);
    this.setMode('transition');
    this.exteriorTransition = true;
    this.eyeMarker.visible = true;
    this.animateTo(
      { position: pos, quaternion: lookQuaternion(pos, target), painterness: 0, fov: 11, duration: 2.6 },
      () => {
        this.orbit.target.copy(target);
        this.setMode('model');
      },
    );
  }

  /** 'fiel' | 'neutro' | 'inferido': qué se muestra donde el pintor no pintó nada. */
  setFillMode(mode) {
    this.fillMode = mode;
    this.uniforms.uMode.value = FILL_MODES[mode];
    this.evidenceEdges.visible = mode === 'fiel' || this.showEvidence === true;
    this.emit();
  }

  setEvidenceVisible(v) {
    this.showEvidence = v;
    this.evidenceEdges.visible = v || this.fillMode === 'fiel';
  }

  setHelpersVisible(v) {
    this.showHelpers = v;
    this.helpers.visible = v && this.mode !== 'eye';
    this.eyeMarker.visible = this.helpers.visible || this.mode === 'model';
  }

  /** 0..1: qué tanto estamos "dentro de la pintura" (en el ojo y con t = 1). */
  eyeFactor() {
    const dist = this.camera.position.distanceTo(this.space.eye);
    const ang = this.camera.quaternion.angleTo(new THREE.Quaternion());
    const k = Math.max(0, 1 - dist / 0.25) * Math.max(0, 1 - ang / 0.2);
    return THREE.MathUtils.smoothstep(this.camera.painterness, 0.85, 1) * k;
  }

  // ---------------------------------------------------------------- bucle

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.setViewport(w, h);
    this.emit();
  }

  tick() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);

    if (this.animation && !this.animation.paused) {
      const a = this.animation;
      a.t = Math.min(1, a.t + dt / a.duration);
      const e = easeInOut(a.t);
      if (a.path) a.path.getPointAt(e, this.camera.position);
      else this.camera.position.lerpVectors(a.from.position, a.to.position, e);
      this.camera.quaternion.slerpQuaternions(a.from.quaternion, a.to.quaternion, e);
      // El frustum cambia al final del viaje: así el "clic" de la pintura llega al llegar.
      const pe = a.to.painterness > a.from.painterness ? easeInOut(Math.max(0, (a.t - 0.35) / 0.65)) : easeInOut(Math.min(1, a.t / 0.6));
      this.camera.painterness = THREE.MathUtils.lerp(a.from.painterness, a.to.painterness, pe);
      this.camera.freeFov = THREE.MathUtils.lerp(a.from.fov, a.to.fov, e);
      this.camera.updateProjectionMatrix();
      a.onProgress?.(a.t);
      if (a.t >= 1) {
        this.animation = null;
        a.onDone?.();
      }
    } else if (!this.animation && this.mode === 'walk') {
      if (this.walkFov != null) {
        this.camera.freeFov = THREE.MathUtils.damp(this.camera.freeFov, this.walkFov, 13, dt);
        if (Math.abs(this.camera.freeFov - this.walkFov) < 0.05) {
          this.camera.freeFov = this.walkFov;
          this.walkFov = null;
        }
        this.camera.updateProjectionMatrix();
      }
      this.walk(dt);
    } else if (this.orbit.enabled) {
      this.orbit.update();
    }

    const target = this.windowOpen ? 0 : 1;
    this.panelOpacity += (target - this.panelOpacity) * Math.min(1, dt * 1.6);
    if (Math.abs(target - this.panelOpacity) < 0.002) this.panelOpacity = target;
    this.museum.setPanelOpacity(this.panelOpacity);
    this.updatePortal();

    // Perspectiva aérea: solo fuera del ojo (en el ojo manda la pintura).
    this.uniforms.uFogAmount.value = (this.fogStrength ?? 0) * (1 - this.camera.painterness);
    // Las aristas de evidencia se desvanecen al llegar al ojo: ahí manda la pintura.
    const k = this.eyeFactor();
    this.uniforms.uAtPainterEye.value = k > 1 - 1e-6;
    this.eyeBacking.visible = k > 0.995;
    this.museum.plaque.material.opacity = 1 - THREE.MathUtils.smoothstep(k, 0.85, 0.95);
    this.museum.plaque.visible = k < 0.95;
    for (const [m, base] of this.edgeMaterials) m.opacity = base * (1 - k);
    this.renderer.render(this.scene, this.camera);
    this.sampleMuseumPerformance();
    this.onFrame?.(this);
  }

  sampleMuseumPerformance() {
    if (this.museumPerformance) return;
    const inMuseum = this.portalActive && this.camera.painterness === 0 &&
      (this.mode === 'walk' || this.mode === 'tour');
    if (!inMuseum || document.hidden) {
      this.museumSample = null;
      return;
    }
    this.museumSample ??= { seconds: 0, frames: 0, calls: 0 };
    const sample = this.museumSample;
    sample.seconds += this.timer.getDelta();
    sample.frames++;
    sample.calls = Math.max(sample.calls, this.renderer.info.render.calls);
    if (sample.seconds < 2) return;
    const fps = sample.frames / sample.seconds;
    const degraded = fps < 40;
    if (degraded) {
      this.museum.shadowLight.castShadow = false;
      this.renderer.shadowMap.enabled = false;
      this.renderer.setPixelRatio(1);
    }
    this.museumPerformance = { fps, calls: sample.calls, degraded };
  }

  updatePortal() {
    const { x, y, z } = this.camera.position;
    const onMuseumSide = z >= this.museum.aperture.z;
    const outsideRoom = onMuseumSide && (x < ROOM.x0 || x > ROOM.x1 || y < 0 || y > SKYLIGHT_HEIGHT || z > ROOM.z1);
    const exterior = this.mode === 'orbit' || this.mode === 'model' ||
      (this.mode === 'transition' && this.exteriorTransition) || (this.mode === 'tour' && this.tourExterior);
    const inStreet = !onMuseumSide && !exterior;
    for (const mesh of this.streetFills) mesh.visible = inStreet;
    this.streetSky.visible = inStreet && this.fillMode !== 'fiel';
    this.museum.group.visible = !outsideRoom && !exterior;
    const usePortal = onMuseumSide && this.museum.group.visible;
    this.museum.portal.visible = usePortal;
    this.ground.visible = !usePortal && !this.streetSky.visible;
    this.threshold.visible = !onMuseumSide && this.museum.group.visible;
    if (this.portalActive === usePortal) return;
    this.portalActive = usePortal;
    const materials = [...this.pictureGroup.children.map((mesh) => mesh.material),
      ...this.edgeMaterials.map(([material]) => material)];
    for (const material of materials) {
      material.stencilWrite = usePortal;
      material.stencilWriteMask = 0;
      material.stencilRef = 1;
      material.stencilFunc = THREE.EqualStencilFunc;
    }
  }

  walk(dt) {
    const speed = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 4.5 : 1.8) * dt;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
    const move = new THREE.Vector3();
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) move.add(forward);
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) move.sub(forward);
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) move.add(right);
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) move.sub(right);
    move.normalize().multiplyScalar(speed);
    if (this.keys.has('KeyE')) move.y += speed;
    if (this.keys.has('KeyQ')) move.y -= speed;
    const blocked = constrainWalk(this.camera.position, move, this.museum.aperture, this.windowOpen);
    if (this.walkBlocked !== blocked) {
      this.walkBlocked = blocked;
      this.emit();
    }
    if (!this.windowOpen && this.camera.position.distanceTo(this.space.eye) < 0.22) {
      this.returnToEye(0.75);
    }
  }

  /** Captura PNG del canvas (para docs/). */
  screenshot() {
    return this.renderer.domElement.toDataURL('image/png');
  }
}

export function lookQuaternion(from, to) {
  const m = new THREE.Matrix4().lookAt(from, to, new THREE.Vector3(0, 1, 0));
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
