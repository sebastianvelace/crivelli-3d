import * as THREE from 'three';
import { ROOM } from './museum.js';

const DEFAULT_CENTER = 1.52;
const FIXTURE_DROP = 0.22;
const RAIL_OFFSET = 1.1;

/**
 * Obras decorativas de las paredes laterales y del muro posterior.
 * `width` o `height` (en metros) fijan el tamaño con el que se cuelga; el otro lado sale de la proporción de la imagen.
 * Solo se declara la medida real cuando se conoce con certeza; en las demás la cédula indica que la escala es aproximada.
 */
export const GALLERY_WORKS = [
  {
    id: 'crivelli-rondine', file: 'crivelli-rondine.webp', size: [1156, 1600], height: 1.505,
    wall: 'left', along: 3.9, author: 'Carlo Crivelli', title: 'La Madonna della Rondine',
    details: ['Después de 1490 · 150,5 × 107,3 cm', 'The National Gallery, Londres · NG724.1'],
    commons: 'La Madonna della Rondine (The Madonna of the Swallow).jpg',
  },
  {
    id: 'uccello-hostia', file: 'uccello-hostia.webp', size: [1227, 700], width: 1.0,
    wall: 'left', along: 0.75, author: 'Paolo Uccello', title: 'Milagro de la hostia profanada (escena 1)',
    details: ['1465–1469 · predela', 'Galleria Nazionale delle Marche, Urbino', 'Escala de exhibición aproximada'],
    commons: 'Paolo Uccello - Miracle of the Desecrated Host (Scene 1) - WGA23222.jpg',
  },
  {
    id: 'piero-flagelacion', file: 'piero-flagelacion.webp', size: [1600, 1135], width: 0.815,
    wall: 'left', along: 2.1, author: 'Piero della Francesca', title: 'La flagelación de Cristo',
    details: ['Hacia 1455–1460', 'Galleria Nazionale delle Marche, Urbino', 'Escala de exhibición aproximada'],
    commons: 'Piero della Francesca 042.jpg',
  },
  {
    id: 'masaccio-trinidad', file: 'masaccio-trinidad.webp', size: [793, 1600], height: 2.3, center: 1.55,
    wall: 'left', along: 5.6, author: 'Masaccio', title: 'La Trinidad',
    details: ['1425–1428 · fresco', 'Santa Maria Novella, Florencia', 'El original mide más de 6 m de alto; aquí está reducido'],
    commons: 'Masaccio, trinità.jpg',
  },
  {
    id: 'leonardo-adoracion', file: 'leonardo-adoracion-estudio.webp', size: [1340, 770], width: 0.8,
    wall: 'left', along: 6.85, author: 'Leonardo da Vinci', title: 'Estudio de perspectiva para la Adoración de los Magos',
    details: ['1481 · dibujo', 'Gallerie degli Uffizi, Florencia', 'Escala de exhibición aproximada'],
    commons: "Leonardo, Studio per l'Adorazione dei Magi, Uffizi.jpg",
  },
  {
    id: 'bellini-agonia', file: 'bellini-agonia.webp', size: [1600, 1009], width: 1.27,
    wall: 'right', along: 1.0, author: 'Giovanni Bellini', title: 'La agonía en el huerto',
    details: ['Hacia 1458–1460', 'The National Gallery, Londres · NG726', 'Escala de exhibición aproximada'],
    commons: 'Bellini,Giovanni - Agony in the Garden - National Gallery.jpg',
  },
  {
    id: 'mantegna-agonia', file: 'mantegna-agonia.webp', size: [1600, 1239], width: 0.8,
    wall: 'right', along: 2.4, author: 'Andrea Mantegna', title: 'La agonía en el huerto',
    details: ['Hacia 1455–1456', 'The National Gallery, Londres', 'Escala de exhibición aproximada'],
    commons: 'Mantegna, Andrea - Agony in the Garden - National Gallery, London.jpg',
  },
  {
    id: 'antonello-jeronimo', file: 'antonello-jeronimo.webp', size: [1262, 1600], height: 0.457,
    wall: 'right', along: 3.55, author: 'Antonello da Messina', title: 'San Jerónimo en su estudio',
    details: ['Hacia 1475', 'The National Gallery, Londres · NG1418', 'Escala de exhibición aproximada'],
    commons: 'Antonello da Messina - St Jerome in his study - National Gallery London.jpg',
  },
  {
    id: 'duccio-cena', file: 'duccio-ultima-cena.webp', size: [850, 733], width: 0.8,
    wall: 'right', along: 4.55, author: 'Duccio di Buoninsegna', title: 'La Última Cena (reverso de la Maestà)',
    details: ['1308–1311', "Museo dell'Opera del Duomo, Siena", 'Escala de exhibición aproximada'],
    commons: 'Duccio di Buoninsegna - Last Supper - WGA06786.jpg',
  },
  {
    id: 'crivelli-demidoff', file: 'crivelli-demidoff.webp', size: [1557, 1600], width: 1.4,
    wall: 'right', along: 6.1, author: 'Carlo Crivelli', title: 'Retablo Demidoff',
    details: ['The National Gallery, Londres', 'Escala de exhibición aproximada'],
    commons: 'Carlo Crivelli 005.jpg',
  },
  {
    id: 'cima-tomas', file: 'cima-tomas.webp', size: [1095, 1600], height: 2.2, center: 1.5,
    wall: 'back', along: -3.0, author: 'Cima da Conegliano', title: 'La incredulidad de santo Tomás',
    details: ['1502–1504', 'The National Gallery, Londres · NG816', 'Obra de gran formato, exhibida a escala reducida'],
    commons: 'Cima da Conegliano London NG Incredulita STommaso 1504.jpg',
  },
  {
    id: 'mantegna-virgen', file: 'mantegna-virgen-magdalena.webp', size: [1328, 1600], height: 1.4,
    wall: 'back', along: 3.0, author: 'Andrea Mantegna', title: 'La Virgen con el Niño, la Magdalena y san Juan Bautista',
    details: ['Hacia 1490–1505', 'The National Gallery, Londres · NG274', 'Escala de exhibición aproximada'],
    commons: 'Andrea Mantegna 107.jpg',
  },
];

/** Ubica una obra en su pared: posición del centro, rotación y vector hacia la sala. */
function wallPlacement(wall, along, center) {
  if (wall === 'left') return { position: new THREE.Vector3(ROOM.x0 + 0.02, center, along), rotation: Math.PI / 2, normal: new THREE.Vector3(1, 0, 0) };
  if (wall === 'right') return { position: new THREE.Vector3(ROOM.x1 - 0.02, center, along), rotation: -Math.PI / 2, normal: new THREE.Vector3(-1, 0, 0) };
  return { position: new THREE.Vector3(along, center, ROOM.z1 - 0.02), rotation: Math.PI, normal: new THREE.Vector3(0, 0, -1) };
}

function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const attempt = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(attempt).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = attempt;
  }
  if (line) lines.push(line);
  return lines;
}

function createLabel(work) {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 468;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#efebe2';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0d0d0c';
  ctx.textBaseline = 'top';
  const x = 40;
  const maxWidth = canvas.width - 2 * x;
  let y = 30;
  ctx.font = '56px Baskervville, Georgia, serif';
  ctx.fillText(work.author, x, y, maxWidth);
  y += 72;
  ctx.font = 'italic 46px Baskervville, Georgia, serif';
  for (const line of wrap(ctx, work.title, maxWidth)) {
    ctx.fillText(line, x, y, maxWidth);
    y += 56;
  }
  y += 12;
  ctx.font = '36px Baskervville, Georgia, serif';
  ctx.fillStyle = '#161615';
  for (const detail of work.details) {
    for (const line of wrap(ctx, detail, maxWidth)) {
      ctx.fillText(line, x, y, maxWidth);
      y += 46;
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.2106),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  label.name = `cedula-${work.id}`;
  return label;
}

function createFrameGeometry(width, height, lip) {
  const outer = new THREE.Shape();
  const w = width / 2 + lip;
  const h = height / 2 + lip;
  outer.moveTo(-w, -h);
  outer.lineTo(w, -h);
  outer.lineTo(w, h);
  outer.lineTo(-w, h);
  outer.closePath();
  const hole = new THREE.Path();
  const iw = width / 2 - 0.01;
  const ih = height / 2 - 0.01;
  hole.moveTo(-iw, -ih);
  hole.lineTo(-iw, ih);
  hole.lineTo(iw, ih);
  hole.lineTo(iw, -ih);
  hole.closePath();
  outer.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(outer, {
    depth: 0.03, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1,
  });
  return geometry;
}

function createGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255, 214, 160, 0.55)');
  gradient.addColorStop(0.55, 'rgba(255, 206, 150, 0.2)');
  gradient.addColorStop(1, 'rgba(255, 200, 140, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Galería decorativa. Las obras no se pueden abrir ni medir y ningún elemento proyecta sombra.
 * Cada obra tiene su foco de riel (modelo visible) y un halo aditivo sobre el muro: así la sala
 * no suma luces con sombra ni más luces reales al presupuesto del cuadro principal.
 */
export function createGallery(frameMaterial, housing) {
  const group = new THREE.Group();
  group.name = 'museum-gallery';
  const lens = new THREE.MeshBasicMaterial({ color: '#fff2d9', toneMapped: false });
  const glowTexture = createGlowTexture();
  const glowMaterial = new THREE.MeshBasicMaterial({
    map: glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const cylinder = new THREE.CylinderGeometry(0.05, 0.058, 0.14, 16);
  const face = new THREE.CircleGeometry(0.046, 16);
  const stem = new THREE.BoxGeometry(0.03, 0.19, 0.03);
  const works = [];
  const RAIL_Y = ROOM.h - 0.1;

  const rails = [
    { from: new THREE.Vector3(ROOM.x0 + RAIL_OFFSET, RAIL_Y, -0.2), to: new THREE.Vector3(ROOM.x0 + RAIL_OFFSET, RAIL_Y, ROOM.z1 - 0.3) },
    { from: new THREE.Vector3(ROOM.x1 - RAIL_OFFSET, RAIL_Y, -0.2), to: new THREE.Vector3(ROOM.x1 - RAIL_OFFSET, RAIL_Y, ROOM.z1 - 0.3) },
    { from: new THREE.Vector3(-4.3, RAIL_Y, ROOM.z1 - RAIL_OFFSET), to: new THREE.Vector3(-1.6, RAIL_Y, ROOM.z1 - RAIL_OFFSET) },
    { from: new THREE.Vector3(1.6, RAIL_Y, ROOM.z1 - RAIL_OFFSET), to: new THREE.Vector3(4.3, RAIL_Y, ROOM.z1 - RAIL_OFFSET) },
  ];
  for (const { from, to } of rails) {
    const length = from.distanceTo(to);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, length), housing);
    rail.position.copy(from).add(to).multiplyScalar(0.5);
    rail.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
    group.add(rail);
  }

  for (const work of GALLERY_WORKS) {
    const aspect = work.size[0] / work.size[1];
    const height = work.height ?? work.width / aspect;
    const width = work.width ?? work.height * aspect;
    const center = work.center ?? DEFAULT_CENTER;
    const lip = 0.04 + 0.02 * Math.min(width, height);
    const place = wallPlacement(work.wall, work.along, center);

    const artwork = new THREE.Group();
    artwork.name = work.id;
    artwork.position.copy(place.position);
    artwork.rotation.y = place.rotation;

    const material = new THREE.MeshBasicMaterial({ color: '#3b3530', toneMapped: false });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    panel.position.z = 0.012;
    panel.name = `obra-${work.id}`;
    const frame = new THREE.Mesh(createFrameGeometry(width, height, lip), frameMaterial);
    frame.position.z = -0.004;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(width + 1.5, height + 1.2), glowMaterial);
    glow.position.z = -0.011;
    artwork.add(glow, frame, panel);

    const label = createLabel(work);
    if (height > 1.0) label.position.set(width / 2 + lip + 0.24, -height / 2 + 0.55, 0.003);
    else label.position.set(0, -height / 2 - lip - 0.17, 0.003);
    artwork.add(label);
    group.add(artwork);

    // Foco de riel: cuelga del riel y apunta al centro de la obra.
    const target = place.position.clone();
    const origin = place.position.clone().addScaledVector(place.normal, RAIL_OFFSET);
    origin.y = RAIL_Y - FIXTURE_DROP;
    const fixture = new THREE.Group();
    fixture.position.copy(origin);
    fixture.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), target.clone().sub(origin).normalize());
    const barrel = new THREE.Mesh(cylinder, housing);
    const disc = new THREE.Mesh(face, lens);
    disc.rotation.x = Math.PI / 2;
    disc.position.y = -0.071;
    fixture.add(barrel, disc);
    const post = new THREE.Mesh(stem, housing);
    post.position.set(origin.x, RAIL_Y - 0.095, origin.z);
    group.add(fixture, post);

    works.push({ ...work, material, hang: [artwork, fixture, post] });
  }

  let loading = null;

  return {
    group,
    works,
    /**
     * Carga las imágenes en segundo plano, una por una, para no frenar la entrada al museo.
     * En celulares se omiten las del muro posterior.
     */
    load(baseUrl, { lite = false } = {}) {
      if (loading) return loading;
      const loader = new THREE.TextureLoader();
      loading = (async () => {
        for (const work of works) {
          if (lite && work.wall === 'back') {
            for (const part of work.hang) part.visible = false;
            continue;
          }
          try {
            const texture = await loader.loadAsync(`${baseUrl}gallery/${work.file}`);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = 4;
            work.material.map = texture;
            work.material.color.set('#ffffff');
            work.material.needsUpdate = true;
          } catch (error) {
            console.warn(`No se pudo cargar ${work.file}:`, error.message);
          }
          await new Promise((resolve) => setTimeout(resolve, 220));
        }
      })();
      return loading;
    },
  };
}
