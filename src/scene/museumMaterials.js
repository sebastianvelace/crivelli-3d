import * as THREE from 'three';

function randomSequence(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function surface(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return canvas.getContext('2d');
}

function repeatTexture(canvas, x, y, color = true) {
  const texture = new THREE.CanvasTexture(canvas);
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(x, y);
  texture.anisotropy = 4;
  return texture;
}

function mineral(rgb, roughness, grain, seed) {
  const color = surface(128);
  const rough = surface(128);
  const albedo = color.createImageData(128, 128);
  const textureRoughness = rough.createImageData(128, 128);
  const random = randomSequence(seed);
  for (let i = 0; i < albedo.data.length; i += 4) {
    const shade = (random() + random() - 1) * grain;
    for (let c = 0; c < 3; c++) {
      albedo.data[i + c] = rgb[c] + shade;
      textureRoughness.data[i + c] = 255 * roughness + shade;
    }
    albedo.data[i + 3] = textureRoughness.data[i + 3] = 255;
  }
  color.putImageData(albedo, 0, 0);
  rough.putImageData(textureRoughness, 0, 0);
  return new THREE.MeshStandardMaterial({
    map: repeatTexture(color.canvas, 3, 2),
    roughness: 1,
    roughnessMap: repeatTexture(rough.canvas, 3, 2, false),
  });
}

function oak(width, depth) {
  const ctx = surface(512);
  const random = randomSequence(739);
  const woods = ['#b99466', '#c09e74', '#bc9a6e', '#c6a980', '#b18b60', '#c3a57b', '#b6946e', '#c0a478'];
  for (let i = 0; i < woods.length; i++) {
    const x = i * 64;
    ctx.fillStyle = woods[i];
    ctx.fillRect(x, 0, 64, 512);
    for (let j = 0; j < 82; j++) {
      const x0 = x + 2 + random() * 60;
      const shift = (random() - 0.5) * 13;
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.bezierCurveTo(x0 + shift, 140, x0 - shift, 340, x0, 512);
      ctx.strokeStyle = j % 3 ? 'rgba(86,55,29,0.08)' : 'rgba(245,218,175,0.11)';
      ctx.lineWidth = 0.5 + random() * 1.4;
      ctx.stroke();
    }
    ctx.fillStyle = '#8f7253';
    ctx.fillRect(x, 0, 1, 512);
    ctx.fillRect(x, 65 + Math.round(random() * 360), 64, 1);
  }
  return new THREE.MeshStandardMaterial({ map: repeatTexture(ctx.canvas, width / (woods.length * 0.18), depth / 2.5), roughness: 0.62 });
}

export function createMuseumMaterials(width, depth) {
  const stone = mineral([123, 128, 132], 0.85, 14, 739);
  return {
    wall: mineral([210, 205, 196], 0.9, 6, 59),
    stone,
    floor: oak(width, depth),
    ceiling: new THREE.MeshStandardMaterial({ color: '#e6e5e1', roughness: 0.91 }),
    gold: new THREE.MeshStandardMaterial({ color: '#c9a14a', metalness: 1, roughness: 0.4, roughnessMap: stone.roughnessMap }),
  };
}
