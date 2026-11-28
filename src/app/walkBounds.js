import { BENCH, ROOM } from '../scene/museum.js';

const WALL_CLEARANCE = 0.3;
const STEP_TOP = -11.6;
const STEP_APPROACH = -11.5;
const PLATFORM_HEIGHT = 0.614;
const STREET_END = -13.5;

// Cerca de una pared solo se amortigua la componente que apunta hacia ella.
function softLimit(position, step, min, max) {
  if (step === 0) return position;
  const direction = Math.sign(step);
  const distance = direction > 0 ? max - position : position - min;
  if (distance <= 0) return position;
  const free = Math.max(0, distance - WALL_CLEARANCE);
  const eased = Math.min(WALL_CLEARANCE, distance) * -Math.expm1(-Math.max(0, Math.abs(step) - free) / WALL_CLEARANCE);
  return position + direction * (Math.min(Math.abs(step), free) + eased);
}

function elevation(z) {
  return PLATFORM_HEIGHT * Math.max(0, Math.min(1, (STEP_APPROACH - z) / (STEP_APPROACH - STEP_TOP)));
}

export function constrainWalk(position, move, aperture, windowOpen) {
  const fromMuseum = position.z >= aperture.z;
  const left = aperture.x0 + 0.037;
  const right = aperture.x1 - 0.038;
  const bottom = aperture.y0 + 0.06;
  const top = aperture.y1 - 0.06;
  const frontWall = aperture.z + 0.058;
  const backWall = aperture.z - 0.058;
  let x = softLimit(position.x, move.x,
    fromMuseum ? ROOM.x0 + WALL_CLEARANCE : position.z > -4.67 ? -2.2 : -1.55,
    fromMuseum ? ROOM.x1 - WALL_CLEARANCE : 0.60);
  const y = softLimit(position.y, move.y, 1.1, 2.6);

  // Usa el punto del segmento en el marco, incluso si un cuadro abarca el cruce completo.
  const approaching = fromMuseum ? move.z < 0 : move.z > 0;
  const ratio = approaching ? Math.min(1, (aperture.z - position.z) / move.z) : 1;
  const crossX = position.x + (x - position.x) * ratio;
  const crossY = position.y + (y - position.y) * ratio;
  const inAperture = crossX >= left && crossX <= right && crossY >= bottom && crossY <= top;
  const canCross = windowOpen && inAperture;
  const approachingLeftWall = !fromMuseum && x < -1.55 && position.z > -4.67;
  let z = softLimit(position.z, move.z,
    fromMuseum ? (canCross ? STREET_END : frontWall) : approachingLeftWall ? -4.67 : STREET_END,
    fromMuseum || canCross ? ROOM.z1 - WALL_CLEARANCE : backWall);

  if (fromMuseum) {
    const benchZ = aperture.z + BENCH.fromPainting;
    const x0 = BENCH.x - BENCH.width / 2 - WALL_CLEARANCE;
    const x1 = BENCH.x + BENCH.width / 2 + WALL_CLEARANCE;
    const z0 = benchZ - BENCH.depth / 2 - WALL_CLEARANCE;
    const z1 = benchZ + BENCH.depth / 2 + WALL_CLEARANCE;
    if (position.z > z0 && position.z < z1) {
      if (position.x <= x0) x = softLimit(position.x, x - position.x, -Infinity, x0);
      if (position.x >= x1) x = softLimit(position.x, x - position.x, x1, Infinity);
    }
    if (x > x0 && x < x1) {
      if (position.z <= z0) z = softLimit(position.z, z - position.z, -Infinity, z0);
      if (position.z >= z1) z = softLimit(position.z, z - position.z, z1, Infinity);
    }
  }

  const inThreshold = windowOpen && z > backWall && z < frontWall;
  position.x = inThreshold ? Math.max(left, Math.min(right, x)) : x;
  position.y = Math.max(1.1, Math.min(inThreshold ? top : 2.6, y + elevation(z) - elevation(position.z)));
  position.z = z;
  return fromMuseum && !windowOpen && approaching && inAperture && z - frontWall < 0.18;
}
