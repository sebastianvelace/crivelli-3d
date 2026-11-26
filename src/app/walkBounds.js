import { ROOM } from '../scene/museum.js';

const WALL_CLEARANCE = 0.3;
const STEP_TOP = -11.6;
const STEP_APPROACH = -11.5;
const PLATFORM_HEIGHT = 0.614;

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
  const x = softLimit(position.x, move.x,
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
  const z = softLimit(position.z, move.z,
    fromMuseum ? (canCross ? -14.1 : frontWall) : approachingLeftWall ? -4.67 : -14.1,
    fromMuseum || canCross ? ROOM.z1 - WALL_CLEARANCE : backWall);

  const inThreshold = windowOpen && z > backWall && z < frontWall;
  position.x = inThreshold ? Math.max(left, Math.min(right, x)) : x;
  position.y = Math.max(1.1, Math.min(inThreshold ? top : 2.6, y + elevation(z) - elevation(position.z)));
  position.z = z;
  return fromMuseum && !windowOpen && approaching && inAperture && z - frontWall < 0.18;
}
