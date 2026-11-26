import markings from '../../analysis/data/lines.json';

const SVG = 'http://www.w3.org/2000/svg';

function addShape(parent, type, attributes) {
  const element = document.createElementNS(SVG, type);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  parent.appendChild(element);
  return element;
}

/** Dibuja las marcas en píxeles de la imagen original. */
export function drawPerspectiveOverlay(svg, calib) {
  const { width, height } = markings.image;
  const [cx, cy] = calib.vanishingPoint;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const line = (x1, y1, x2, y2, stroke, strokeWidth, opacity = 1) =>
    addShape(svg, 'line', {
      x1, y1, x2, y2, stroke, 'stroke-width': strokeWidth, opacity, 'vector-effect': 'non-scaling-stroke',
    });

  for (const [x1, y1, x2, y2] of markings.orthogonals) {
    const first = Math.hypot(x1 - cx, y1 - cy) <= Math.hypot(x2 - cx, y2 - cy);
    line(first ? x1 : x2, first ? y1 : y2, cx, cy, '#ff564b', 1, 0.48);
  }
  for (const [x1, y1, x2, y2] of markings.orthogonals) {
    line(x1, y1, x2, y2, '#7ef58d', 2);
  }
  for (const [i, [x1, y1, x2, y2]] of markings.diagonals.entries()) {
    const [dx, dy] = calib.distancePoints[i];
    line(x1, y1, dx, dy, '#51b0ff', 1, 0.66);
    line(x1, y1, x2, y2, '#51b0ff', 2);
  }
  line(0, calib.horizonY, width, calib.horizonY, '#ffe45c', 1.5);
  addShape(svg, 'circle', {
    cx, cy, r: 24, fill: '#ed4439', stroke: '#fff4db', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke',
  });
}
