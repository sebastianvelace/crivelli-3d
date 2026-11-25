import * as THREE from 'three';

/**
 * Projective texture mapping desde el ojo de Crivelli.
 *
 * Cada fragmento se proyecta con la matriz (proyección · vista) de la cámara del
 * pintor: sus coordenadas NDC dan directamente las coordenadas de textura dentro
 * de la pintura. Es el mismo principio de la "ventana" de Alberti, pero al revés:
 * en vez de pintar lo que se ve por la ventana, "devolvemos" la pintura al espacio.
 *
 * Zonas ocultas: igual que un shadow map, comparamos la distancia del fragmento al
 * ojo con la del mapa de profundidad visto desde el ojo. Si algo lo tapaba en la
 * pintura, el pintor nunca vio ese trozo: se pinta de un color neutro.
 */
export function createProjectiveMaterial(shared) {
  return new THREE.ShaderMaterial({
    uniforms: shared,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform mat4 uPainterViewProj;
      varying vec4 vPainterClip;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vPainterClip = uPainterViewProj * world;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uPainting;
      uniform sampler2D uDepth;
      uniform float uNear;
      uniform float uFar;
      uniform float uOcclusion;     // 1 = marcar zonas ocultas, 0 = estirar la pintura
      uniform vec3 uNeutral;        // color "yeso" de lo que el pintor no mostró
      uniform vec3 uFogColor;       // perspectiva aérea (Leonardo): azul de lo lejano
      uniform float uFogDensity;
      uniform float uFogAmount;
      uniform float uHighlight;     // resalta lo oculto en rosa (modo didáctico)
      varying vec4 vPainterClip;
      varying vec3 vWorldPos;
      varying vec3 vNormal;

      // Profundidad del depth buffer [0,1] -> distancia a lo largo del eje de la cámara.
      float linearDepth(float d) {
        float z = d * 2.0 - 1.0;
        return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
      }

      void main() {
        vec3 ndc = vPainterClip.xyz / vPainterClip.w;
        vec2 uv = ndc.xy * 0.5 + 0.5;
        bool inFrame = vPainterClip.w > 0.0 && all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));

        bool seen = false;
        if (inFrame) {
          // En perspectiva, w del clip = distancia del fragmento al ojo a lo largo de -Z.
          float firstHit = linearDepth(texture2D(uDepth, uv).r);
          seen = uOcclusion < 0.5 || vPainterClip.w <= firstHit * 1.004 + 0.03;
        }

        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        float light = 0.62 + 0.38 * max(dot(n, normalize(vec3(0.4, 0.8, 0.45))), 0.0);
        vec3 color = uNeutral * light * (gl_FrontFacing ? 1.0 : 0.78);
        if (!seen && inFrame) color = mix(color, vec3(0.85, 0.35, 0.55), uHighlight);

        if (seen && gl_FrontFacing) color = texture2D(uPainting, uv).rgb;

        float dist = length(vWorldPos - cameraPosition);
        float fog = (1.0 - exp(-uFogDensity * dist)) * uFogAmount;
        color = mix(color, uFogColor, fog);

        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

/** Uniforms compartidos por todos los materiales proyectivos. */
export function createSharedUniforms(paintingTexture, depthTexture, near, far) {
  return {
    uPainting: { value: paintingTexture },
    uDepth: { value: depthTexture },
    uPainterViewProj: { value: new THREE.Matrix4() },
    uNear: { value: near },
    uFar: { value: far },
    uOcclusion: { value: 1 },
    uNeutral: { value: new THREE.Color('#c9bba2') },
    uFogColor: { value: new THREE.Color('#9fb6cf') },
    uFogDensity: { value: 0.045 },
    uFogAmount: { value: 0 },
    uHighlight: { value: 0 },
  };
}
