import * as THREE from 'three';

/** Modos de relleno de lo que el pintor no mostró. */
export const FILL_MODES = { fiel: 0, neutro: 1, inferido: 2 };

/**
 * Projective texture mapping desde el ojo de Crivelli.
 *
 * Cada fragmento se proyecta con la matriz (proyección · vista) de la cámara del
 * pintor: sus coordenadas NDC dan directamente las coordenadas de textura dentro
 * de la pintura. Es la "ventana" de Alberti al revés: en vez de pintar lo que se
 * ve por la ventana, "devolvemos" la pintura al espacio.
 *
 * El mapa de asignación permite a una sola superficie tomar el color de cada
 * píxel. Las regiones que carecen de pintura usan la textura horneada, salvo en
 * el modo fiel, donde se conservan los huecos de información.
 */
export function createProjectiveMaterial(shared, perElement) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, ...perElement },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform mat4 uPainterViewProj;
      varying vec4 vPainterClip;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying vec2 vUv;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vUv = uv;
        vPainterClip = uPainterViewProj * world;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uPainting;
      uniform sampler2D uDepth;
      uniform sampler2D uInferred;  // textura plana del elemento (vista + inferida)
      uniform vec3 uBackColor;      // reverso de los cartones en el modo inferido
      uniform sampler2D uOwnership;
      uniform bool uHasOwnership;
      uniform float uOwner;
      uniform bool uHasInferred;
      uniform bool uArchitecture;
      uniform bool uInferredOnly;
      uniform float uNear;
      uniform float uFar;
      uniform float uMode;          // 0 fiel, 1 neutro, 2 inferido
      uniform bool uAtPainterEye;
      uniform float uMarkInferred;  // 1 = rayado rosa sobre todo lo no pintado
      uniform vec3 uNeutral;        // color "yeso"
      uniform vec3 uFogColor;       // perspectiva aérea (Leonardo): azul de lo lejano
      uniform float uFogDensity;
      uniform float uFogAmount;
      varying vec4 vPainterClip;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying vec2 vUv;

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
        if (inFrame && !uInferredOnly && (uAtPainterEye || gl_FrontFacing)) {
          if (uHasOwnership) {
            seen = uOwner > 0.0 && abs(texture2D(uOwnership, uv).r * 255.0 - uOwner) < 0.5;
          } else if (uAtPainterEye) {
            seen = true;
          } else {
            float firstHit = linearDepth(texture2D(uDepth, uv).r);
            seen = vPainterClip.w <= firstHit * 1.004 + 0.03;
          }
        }

        // El soporte del cuadro cubre las zonas sin geometría al llegar al ojo.
        if (uAtPainterEye && !seen) discard;

        // Fiel: lo que Crivelli no pintó simplemente no existe.
        if (!seen && uMode < 0.5) discard;

        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        float light = 0.62 + 0.38 * max(dot(n, normalize(vec3(0.4, 0.8, 0.45))), 0.0);

        vec3 color;
        if (seen) {
          color = texture2D(uPainting, uv).rgb;
        } else if (uHasInferred) {
          color = (gl_FrontFacing || uArchitecture)
            ? texture2D(uInferred, vUv).rgb * (gl_FrontFacing ? 1.0 : 0.78 + 0.22 * light)
            : uBackColor * light;
          // El relleno por color atenúa el detalle; el modo inferido lo conserva.
          if (uMode < 1.5) color = mix(color, uBackColor, 0.16);
        } else {
          color = uNeutral * light * (gl_FrontFacing ? 1.0 : 0.78);
        }

        // Rayado en pantalla: marca honesta de todo lo que es hipótesis
        if (!seen && uMarkInferred > 0.5) {
          float stripe = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) / 14.0));
          color = mix(color, vec3(0.92, 0.36, 0.62), 0.28 + 0.22 * stripe);
        }

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
    uOwnership: { value: null },
    uHasOwnership: { value: false },
    uPainterViewProj: { value: new THREE.Matrix4() },
    uNear: { value: near },
    uFar: { value: far },
    uMode: { value: FILL_MODES.neutro },
    uAtPainterEye: { value: false },
    uMarkInferred: { value: 0 },
    uNeutral: { value: new THREE.Color('#c9bba2') },
    uFogColor: { value: new THREE.Color('#9fb6cf') },
    uFogDensity: { value: 0.045 },
    uFogAmount: { value: 0 },
  };
}
