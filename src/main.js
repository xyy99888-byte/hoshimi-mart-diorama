/* ============================================================
   雨夜の街角 — HOSHIMI MART
   A tiny, collectible rainy-night convenience-store diorama.
   Three.js r128 / cel-shaded / fully procedural.
   ============================================================ */
'use strict';

// ------------------------------------------------------------
// Small utilities
// ------------------------------------------------------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const FONT_JP = '"Yu Gothic UI", "Yu Gothic", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif';
const FONT_EN = '"Trebuchet MS", "Yu Gothic UI", "Meiryo", sans-serif';

// ------------------------------------------------------------
// Weather state (sunny day / rainy night, same miniature)
// ------------------------------------------------------------
const WEATHER_KEY = 'hoshimi-weather';
const queryWeather = new URLSearchParams(window.location.search).get('weather');
let storedWeather = null;
try {
  storedWeather = window.localStorage.getItem(WEATHER_KEY);
} catch (e) {
  storedWeather = null;
}
const initialWeather = queryWeather === 'rain' || queryWeather === 'sunny'
  ? queryWeather
  : (storedWeather === 'rain' ? 'rain' : 'sunny');
let weatherTarget = initialWeather === 'sunny' ? 1 : 0;
let weatherMix = weatherTarget;
let weatherTransitionFrom = weatherMix;
let weatherTransitionStart = performance.now();
if (weatherMix > 0.5) document.body.classList.add('sunny');

// ------------------------------------------------------------
// Renderer / scene / camera
// ------------------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.86;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x070c17, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070c17);
scene.fog = new THREE.FogExp2(0x08101c, 0.0165);

// A soft, deep rainy-night gradient dome. It is environment only; every
// physical scene object still lives on the square plinth.
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(62, 32, 18),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x03050c) },
      uHorizon: { value: new THREE.Color(0x0c1a2d) },
      uBottom: { value: new THREE.Color(0x04070d) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uBottom;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 col = mix(uHorizon, uTop, smoothstep(-0.02, 0.42, h));
        col = mix(uBottom, col, smoothstep(-0.52, 0.03, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
);
skyDome.renderOrder = -100;
scene.add(skyDome);

const camera = new THREE.PerspectiveCamera(36.5, window.innerWidth / window.innerHeight, 0.1, 120);
const CAM_TARGET = new THREE.Vector3(-0.2, 0.8, 0.2);
const CAM_DIR = new THREE.Vector3(12.58, 6.22, 15.17).normalize();
camera.position.copy(CAM_TARGET).addScaledVector(CAM_DIR, 20.72);
camera.lookAt(CAM_TARGET);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.copy(CAM_TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.enablePan = false;
controls.rotateSpeed = 0.65;
controls.zoomSpeed = 0.75;
controls.minDistance = 10.5;
controls.maxDistance = 30;
controls.minPolarAngle = 0.12;
controls.maxPolarAngle = 1.46;
controls.autoRotate = false;
controls.autoRotateSpeed = 0.42;
let fittedDistance = 21.0;

function fitModelToViewport(resetDirection = false) {
  const aspect = window.innerWidth / window.innerHeight;
  const halfV = Math.tan((camera.fov * Math.PI) / 360);
  const halfH = halfV * aspect;
  // The square plinth and the overhead wires define the widest silhouette.
  const needed = Math.max(7.0 / halfH, 6.7 / halfV) * 1.02;
  const dir = resetDirection
    ? CAM_DIR.clone()
    : camera.position.clone().sub(controls.target).normalize();
  fittedDistance = needed;
  camera.position.copy(controls.target).addScaledVector(dir, needed);
  controls.minDistance = Math.min(8, needed * 0.55);
  controls.maxDistance = Math.max(30, needed * 1.4);
  camera.lookAt(controls.target);
  controls.update();
}
fitModelToViewport(true);

// ------------------------------------------------------------
// Post-processing (gentle anime neon bloom)
// ------------------------------------------------------------
const composer = new THREE.EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new THREE.RenderPass(scene, camera));
const bloomPass = new THREE.UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.5,
  0.6,
  0.85
);
composer.addPass(bloomPass);

// Hand-tuned cel/anime grade: richer saturation, cool shadows, warm highlights,
// and a soft optical vignette. Absolutely no overlay UI.
const gradePass = new THREE.ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1.28 },
    uContrast: { value: 1.04 },
    uVignette: { value: 0.3 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 c = tex.rgb;
      float luma = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(luma), c, uSaturation);
      c = (c - 0.5) * uContrast + 0.5;
      // cool, inky shadows / warm sodium highlights
      c += vec3(-0.008, 0.004, 0.020) * (1.0 - smoothstep(0.0, 0.55, luma));
      c += vec3(0.022, 0.010, -0.008) * smoothstep(0.55, 1.0, luma);
      vec2 q = vUv - 0.5;
      float vig = 1.0 - uVignette * smoothstep(0.20, 0.78, dot(q, q) * 1.8);
      c *= vig;
      gl_FragColor = vec4(max(c, 0.0), tex.a);
    }
  `,
});
composer.addPass(gradePass);

// ------------------------------------------------------------
// Lighting — cool rainy night + one warm shop interior
// ------------------------------------------------------------
const ambient = new THREE.AmbientLight(0x53688f, 0.09);
ambient.name = 'ambient';
scene.add(ambient);
const hemi = new THREE.HemisphereLight(0x8ba9de, 0x19111f, 0.11);
hemi.name = 'hemi';
scene.add(hemi);

const moon = new THREE.DirectionalLight(0xc5d7ff, 1.02);
moon.name = 'sunKey';
moon.position.set(-7.5, 14.0, 10.5);
moon.target.position.set(-1.0, 0, -2.0);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
moon.shadow.camera.near = 1;
moon.shadow.camera.far = 38;
moon.shadow.camera.left = -13;
moon.shadow.camera.right = 13;
moon.shadow.camera.top = 13;
moon.shadow.camera.bottom = -13;
moon.shadow.bias = -0.00085;
moon.shadow.normalBias = 0.04;
scene.add(moon);
scene.add(moon.target);

// Cool rim from behind keeps the diorama silhouetted and gives the cel bands
// a crisp second edge.
const rimLight = new THREE.DirectionalLight(0x6f8cff, 0.3);
rimLight.name = 'rimLight';
rimLight.position.set(9, 6, -10);
rimLight.target.position.set(-1, 1.2, -2.5);
scene.add(rimLight);
scene.add(rimLight.target);

// Warm interior spill
const interiorLightA = new THREE.PointLight(0xff9f50, 1.5, 9.5, 1.75);
interiorLightA.position.set(-1.7, 2.55, -2.7);
scene.add(interiorLightA);

const interiorLightB = new THREE.PointLight(0xffb877, 0.98, 8.0, 1.75);
interiorLightB.position.set(-0.15, 2.65, -4.35);
scene.add(interiorLightB);

// Daylight-only warm fill so the shop interior stays legible when the bright
// sun casts the street into higher contrast.
const dayFill = new THREE.PointLight(0xffdca8, 0, 9.0, 1.55);
dayFill.name = 'dayFill';
dayFill.position.set(-1.15, 2.45, -2.65);
scene.add(dayFill);

// Fridge-cool fill
const fridgeFill = new THREE.PointLight(0xb8ecff, 0.5, 5.5, 1.8);
fridgeFill.position.set(-1.7, 1.9, -5.15);
scene.add(fridgeFill);

// Street lamp — a downward spot, not a bare point light, so the roof does not
// collect mysterious circular light pools.
const streetLight = new THREE.SpotLight(0xffb16a, 2.2, 12.0, Math.PI / 3.1, 0.58, 1.55);
streetLight.name = 'streetLampLight';
streetLight.position.set(-3.68, 4.42, 2.45);
streetLight.target.position.set(-3.25, 0.08, 2.85);
streetLight.castShadow = false;
scene.add(streetLight);
scene.add(streetLight.target);

// Vending-machine glow
const vendingLight = new THREE.PointLight(0x8fe3ef, 0.3, 4.0, 1.8);
vendingLight.position.set(2.95, 1.35, -3.0);
scene.add(vendingLight);

// ------------------------------------------------------------
// Cel-shading ramp + shared materials
// ------------------------------------------------------------
function makeRamp(steps) {
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => {
    data[i * 4 + 0] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  });
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
const TOON_RAMP = makeRamp([40, 92, 162, 238]);
const TOON_RAMP_SOFT = makeRamp([78, 132, 194, 245]);

function toon(color, opts = {}) {
  const mat = new THREE.MeshToonMaterial({
    color,
    gradientMap: opts.soft ? TOON_RAMP_SOFT : TOON_RAMP,
    emissive: opts.emissive === undefined ? 0x000000 : opts.emissive,
    emissiveIntensity: opts.emissiveIntensity === undefined ? 1 : opts.emissiveIntensity,
  });
  if (opts.map) mat.map = opts.map;
  if (opts.transparent) {
    mat.transparent = true;
    mat.opacity = opts.opacity === undefined ? 1 : opts.opacity;
  }
  if (opts.side) mat.side = opts.side;
  if (opts.depthWrite !== undefined) mat.depthWrite = opts.depthWrite;
  if (opts.flatShading) mat.flatShading = true;
  return mat;
}

function basic(color, opts = {}) {
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: opts.transparent || false,
    opacity: opts.opacity === undefined ? 1 : opts.opacity,
    side: opts.side || THREE.FrontSide,
    blending: opts.blending === undefined ? THREE.NormalBlending : opts.blending,
    depthWrite: opts.depthWrite === undefined ? true : opts.depthWrite,
    map: opts.map || null,
  });
  if (opts.toneMapped !== undefined) mat.toneMapped = opts.toneMapped;
  return mat;
}

// ------------------------------------------------------------
// Canvas textures
// ------------------------------------------------------------
const maxAniso = renderer.capabilities.getMaxAnisotropy();

function canvasTexture(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = maxAniso;
  if (opts.repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  tex.needsUpdate = true;
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function jpText(ctx, text, x, y, size, color, font = FONT_JP, weight = '700') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function fitText(ctx, text, maxWidth, startSize, font = FONT_EN, weight = '700') {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px ${font}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  } while (size > 10);
  return size;
}

// Soft radial glow used by sprites and contact shadows.
const RADIAL_TEX = canvasTexture(128, 128, (ctx, w, h) => {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.62)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
});

const SOFT_BLOB_TEX = canvasTexture(128, 128, (ctx, w, h) => {
  const g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.72)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.36)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
});

// Vertical soft falloff for fake wet reflections.
const REFLECT_TEX = canvasTexture(128, 512, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0.02)');
  g.addColorStop(0.16, 'rgba(255,255,255,0.36)');
  g.addColorStop(0.48, 'rgba(255,255,255,0.14)');
  g.addColorStop(0.8, 'rgba(255,255,255,0.05)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const side = ctx.createLinearGradient(0, 0, w, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.22, 'rgba(0,0,0,0)');
  side.addColorStop(0.78, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
});

function makeGlowSprite(color, size, x, y, z, opacity = 0.7, parent = scene) {
  const mat = new THREE.SpriteMaterial({
    map: RADIAL_TEX,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });
  const s = new THREE.Sprite(mat);
  s.position.set(x, y, z);
  s.scale.set(size, size, 1);
  s.userData.rainOnly = true;
  s.userData.glowBaseOpacity = opacity;
  parent.add(s);
  return s;
}

// ------------------------------------------------------------
// Geometry helpers
// ------------------------------------------------------------
const OUTLINE_MAT = new THREE.MeshBasicMaterial({
  color: 0x141625,
  side: THREE.BackSide,
  fog: false,
});

// Invisible raycast pads live on layer 1, so the camera never draws them.
const INVISIBLE_HIT_MAT = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0,
  depthWrite: false,
  colorWrite: false,
  side: THREE.DoubleSide,
  fog: false,
});
const HIT_LAYER = 1;

function addOutline(mesh, k = 0.014) {
  const hull = new THREE.Mesh(mesh.geometry, OUTLINE_MAT);
  hull.scale.setScalar(1 + k);
  hull.renderOrder = -1;
  hull.castShadow = false;
  hull.receiveShadow = false;
  mesh.add(hull);
  return mesh;
}

function box(parent, mat, w, h, d, x, y, z, opts = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  if (opts.ry) mesh.rotation.y = opts.ry;
  if (opts.rx) mesh.rotation.x = opts.rx;
  if (opts.rz) mesh.rotation.z = opts.rz;
  mesh.castShadow = opts.cast === undefined ? true : opts.cast;
  mesh.receiveShadow = opts.receive === undefined ? true : opts.receive;
  if (opts.outline) addOutline(mesh, opts.outline === true ? 0.014 : opts.outline);
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, mat, rTop, rBot, h, x, y, z, opts = {}) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, opts.seg || 14, 1, !!opts.open);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  if (opts.rx) mesh.rotation.x = opts.rx;
  if (opts.ry) mesh.rotation.y = opts.ry;
  if (opts.rz) mesh.rotation.z = opts.rz;
  mesh.castShadow = opts.cast === undefined ? true : opts.cast;
  mesh.receiveShadow = opts.receive === undefined ? true : opts.receive;
  if (opts.outline) addOutline(mesh, opts.outline === true ? 0.014 : opts.outline);
  parent.add(mesh);
  return mesh;
}

function sphere(parent, mat, r, x, y, z, opts = {}) {
  const geo = new THREE.SphereGeometry(r, opts.seg || 14, opts.seg || 10);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = opts.cast === undefined ? true : opts.cast;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function tube(parent, mat, w, h, d, x, y, z, opts = {}) {
  // thin box helper
  return box(parent, mat, w, h, d, x, y, z, opts);
}

function barBetween(parent, mat, p1, p2, radius, opts = {}) {
  const a = new THREE.Vector3(p1[0], p1[1], p1[2]);
  const b = new THREE.Vector3(p2[0], p2[1], p2[2]);
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(radius, radius, len, opts.seg || 8);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function plane(parent, mat, w, h, x, y, z, opts = {}) {
  const geo = new THREE.PlaneGeometry(w, h, opts.segX || 1, opts.segY || 1);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(
    opts.rx === undefined ? -Math.PI / 2 : opts.rx,
    opts.ry || 0,
    opts.rz || 0
  );
  mesh.castShadow = false;
  mesh.receiveShadow = opts.receive || false;
  if (opts.renderOrder !== undefined) mesh.renderOrder = opts.renderOrder;
  parent.add(mesh);
  return mesh;
}

function texturedPlane(parent, tex, w, h, x, y, z, opts = {}) {
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: opts.transparent || false,
    opacity: opts.opacity === undefined ? 1 : opts.opacity,
    side: opts.side || THREE.FrontSide,
    depthWrite: opts.depthWrite === undefined ? true : opts.depthWrite,
    toneMapped: opts.toneMapped === undefined ? true : opts.toneMapped,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(opts.rx === undefined ? 0 : opts.rx, opts.ry || 0, opts.rz || 0);
  mesh.renderOrder = opts.renderOrder === undefined ? 0 : opts.renderOrder;
  parent.add(mesh);
  return mesh;
}

// ------------------------------------------------------------
// World container + assembler
// ------------------------------------------------------------
const world = new THREE.Group();
world.name = 'HOSHIMI-MART-DIORAMA';
scene.add(world);

const kits = [];
function kit(name, delay, opts = {}) {
  const g = new THREE.Group();
  g.name = name;
  g.userData.assemble = {
    delay,
    fromY: opts.fromY === undefined ? -1.0 : opts.fromY,
    duration: opts.duration === undefined ? 0.72 : opts.duration,
    scaleFrom: opts.scaleFrom === undefined ? 0.97 : opts.scaleFrom,
    spin: opts.spin || 0,
  };
  world.add(g);
  kits.push(g);
  return g;
}

// wet-look decals
function reflectionStrip(parent, color, w, l, x, z, opacity, rot = 0, y = 0.047) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uSeed: { value: Math.random() * 10.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uSeed;
      varying vec2 vUv;
      void main() {
        float side = smoothstep(0.0, 0.34, vUv.x) * (1.0 - smoothstep(0.66, 1.0, vUv.x));
        float head = smoothstep(0.0, 0.78, vUv.y);
        float tail = 1.0 - smoothstep(0.88, 1.0, vUv.y);
        float shimmer = 0.68 + 0.32 * (0.5 + 0.5 * sin(vUv.x * 91.0 + uSeed + sin(vUv.y * 23.0) * 2.4));
        float band = 0.16 + 0.84 * head;
        float alpha = side * band * tail * shimmer * uOpacity;
        gl_FragColor = vec4(uColor * (0.64 + 0.36 * head), alpha);
      }
    `,
    transparent: true,
    blending: THREE.NormalBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = rot;
  mesh.position.set(x, y, z);
  mesh.renderOrder = 5;
  mesh.userData.rainOnly = true;
  parent.add(mesh);
  return mesh;
}

const PUDDLE_TEX = canvasTexture(256, 256, (ctx, w, h) => {
  const g = ctx.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.92)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.72)');
  g.addColorStop(0.82, 'rgba(255,255,255,0.24)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
});

const puddleRecords = [];
function puddle(parent, x, z, sx, sz, rot = 0, opacity = 0.55, y = 0.044) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x24455b) },
      uOpacity: { value: opacity },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.54, 1.0, d)) * uOpacity;
        float rim = smoothstep(0.58, 0.9, d) * (1.0 - smoothstep(0.9, 1.0, d));
        float sheen = smoothstep(0.15, 0.72, d) * (1.0 - smoothstep(0.72, 1.0, d));
        vec3 col = uColor + vec3(0.05, 0.09, 0.13) * sheen + vec3(0.08, 0.14, 0.19) * rim;
        gl_FragColor = vec4(col, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 24), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = rot;
  mesh.scale.set(sx, sz, 1);
  mesh.position.set(x, y, z);
  mesh.renderOrder = 3;
  mesh.userData.rainOnly = true;
  parent.add(mesh);
  puddleRecords.push({ x, z, sx, sz, rot, opacity, y, parent });
  return mesh;
}

function softLightPool(parent, color, w, d, x, z, opacity, y = 0.171) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float d = length((vUv - 0.5) * vec2(1.0, 1.3)) * 2.0;
        float a = (1.0 - smoothstep(0.0, 1.0, d)) * uOpacity;
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.renderOrder = 5;
  mesh.userData.rainOnly = true;
  parent.add(mesh);
  return mesh;
}

// ------------------------------------------------------------
// Texture library
// ------------------------------------------------------------
const TEX = {};

TEX.roof = canvasTexture(512, 512, (ctx, w, h) => {
  ctx.fillStyle = '#c7baa4';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 7000; i++) {
    const v = rand(0, 1);
    ctx.fillStyle = `rgba(${v > 0.5 ? '255,250,235' : '78,70,58'},${rand(0.02, 0.09)})`;
    ctx.fillRect(rand(0, w), rand(0, h), rand(1, 3), rand(1, 2));
  }
  ctx.strokeStyle = 'rgba(94,84,70,0.32)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    const y = 40 + i * 105;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const x = 20 + i * 140;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(70,62,50,${rand(0.03, 0.12)})`;
    ctx.beginPath();
    ctx.ellipse(rand(0, w), rand(0, h), rand(1, 6), rand(1, 4), rand(0, TAU), 0, TAU);
    ctx.fill();
  }
});

TEX.asphaltDay = canvasTexture(512, 512, (ctx, w, h) => {
  ctx.fillStyle = '#7c7973';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {
    const v = rand(0, 1);
    ctx.fillStyle = `rgba(${v > 0.5 ? '226,222,210' : '58,55,50'},${rand(0.03, 0.12)})`;
    ctx.fillRect(rand(0, w), rand(0, h), rand(1, 3), rand(1, 3));
  }
  ctx.strokeStyle = 'rgba(76,72,66,0.26)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    let x = rand(0, w);
    let y = rand(0, h);
    ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) {
      x += rand(-45, 45);
      y += rand(25, 70);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}, { repeat: [7, 7] });

TEX.sidewalkDay = canvasTexture(512, 512, (ctx, w, h) => {
  ctx.fillStyle = '#c1b9a8';
  ctx.fillRect(0, 0, w, h);
  const n = 4;
  const cell = w / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = rand(-8, 8);
      ctx.fillStyle = `rgb(${195 + v},${187 + v},${170 + v})`;
      ctx.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
      ctx.fillStyle = 'rgba(255,255,255,0.11)';
      ctx.fillRect(x * cell + 6, y * cell + 5, cell - 12, 2);
    }
  }
  ctx.strokeStyle = 'rgba(142,134,118,0.55)';
  ctx.lineWidth = 4;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cell);
    ctx.lineTo(w, i * cell);
    ctx.stroke();
  }
  for (let i = 0; i < 350; i++) {
    ctx.fillStyle = `rgba(110,104,92,${rand(0.02, 0.07)})`;
    ctx.fillRect(rand(0, w), rand(0, h), rand(1, 3), rand(1, 2));
  }
}, { repeat: [7, 7] });

TEX.stoneAlleyDay = canvasTexture(512, 512, (ctx, w, h) => {
  ctx.fillStyle = '#a69e8e';
  ctx.fillRect(0, 0, w, h);
  const n = 5;
  const cell = w / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = `rgb(${rand(156, 174)},${rand(148, 166)},${rand(132, 150)})`;
      ctx.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
    }
  }
  ctx.strokeStyle = 'rgba(102,94,82,0.55)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(w, i * cell); ctx.stroke();
  }
}, { repeat: [2, 5] });

TEX.asphalt = canvasTexture(512, 512, (ctx, w, h) => {
  ctx.fillStyle = '#2a3140';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {
    const v = rand(0, 1);
    ctx.fillStyle = `rgba(${v > 0.5 ? '160,175,198' : '8,12,20'},${rand(0.03, 0.12)})`;
    ctx.fillRect(rand(0, w), rand(0, h), rand(1, 3), rand(1, 3));
  }
  // faint wet seams and cracks
  ctx.strokeStyle = 'rgba(10,14,22,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    let x = rand(0, w);
    let y = rand(0, h);
    ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) {
      x += rand(-45, 45);
      y += rand(25, 70);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}, { repeat: [7, 7] });

TEX.sidewalk = canvasTexture(512, 512, (ctx, w, h) => {
  ctx.fillStyle = '#4f5967';
  ctx.fillRect(0, 0, w, h);
  const n = 4;
  const cell = w / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = rand(-8, 8);
      ctx.fillStyle = `rgb(${80 + v},${90 + v},${106 + v})`;
      ctx.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      ctx.fillRect(x * cell + 6, y * cell + 5, cell - 12, 2);
    }
  }
  ctx.strokeStyle = 'rgba(44,50,64,0.65)';
  ctx.lineWidth = 4;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cell);
    ctx.lineTo(w, i * cell);
    ctx.stroke();
  }
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(30,36,48,${rand(0.03, 0.1)})`;
    ctx.fillRect(rand(0, w), rand(0, h), rand(1, 4), rand(1, 2));
  }
}, { repeat: [7, 7] });

TEX.interiorFloor = canvasTexture(512, 512, (ctx, w, h) => {
  ctx.fillStyle = '#d9cfb9';
  ctx.fillRect(0, 0, w, h);
  const n = 6;
  const cell = w / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#e8dfcb' : '#cfc4ad';
      ctx.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x * cell + 5, y * cell + 5, cell - 10, 3);
    }
  }
  ctx.strokeStyle = 'rgba(120,108,88,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cell);
    ctx.lineTo(w, i * cell);
    ctx.stroke();
  }
}, { repeat: [3, 3] });

TEX.stoneAlley = canvasTexture(512, 512, (ctx, w, h) => {
  ctx.fillStyle = '#3a3e46';
  ctx.fillRect(0, 0, w, h);
  const n = 5;
  const cell = w / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = `rgb(${rand(48, 66)},${rand(52, 70)},${rand(62, 82)})`;
      ctx.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
    }
  }
  ctx.strokeStyle = 'rgba(18,20,27,0.6)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(w, i * cell); ctx.stroke();
  }
}, { repeat: [2, 5] });

TEX.tactile = canvasTexture(128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#d8b44c';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#b89332';
  for (let y = 16; y < h; y += 32) {
    for (let x = 16; x < w; x += 32) {
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, TAU);
      ctx.fill();
    }
  }
}, { repeat: [8, 2] });

TEX.grate = canvasTexture(128, 512, (ctx, w, h) => {
  ctx.fillStyle = '#1a2028';
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 22) {
    ctx.fillStyle = '#5a6471';
    ctx.fillRect(6, y + 3, w - 12, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(6, y + 3, w - 12, 1);
    ctx.fillStyle = '#2d3540';
    ctx.fillRect(4, y + 10, w - 8, 8);
  }
}, { repeat: [1, 8] });

TEX.manhole = canvasTexture(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#303845';
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w / 2, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#6f7a87';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(w / 2, h / 2, 116, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(w / 2, h / 2, 96, 0, TAU); ctx.stroke();
  ctx.lineWidth = 3;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    ctx.beginPath();
    ctx.moveTo(w / 2 + Math.cos(a) * 34, h / 2 + Math.sin(a) * 34);
    ctx.lineTo(w / 2 + Math.cos(a) * 90, h / 2 + Math.sin(a) * 90);
    ctx.stroke();
  }
  ctx.fillStyle = '#252c37';
  ctx.beginPath(); ctx.arc(w / 2, h / 2, 30, 0, TAU); ctx.fill();
});

TEX.storeSign = canvasTexture(1024, 168, (ctx, w, h) => {
  ctx.fillStyle = '#fff9e9';
  ctx.fillRect(0, 0, w, h);
  // subtle lightbox gradients
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.45, 'rgba(255,244,218,0.15)');
  g.addColorStop(1, 'rgba(241,224,188,0.28)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // green top rule + orange/green lower stripes
  ctx.fillStyle = '#2b7357';
  ctx.fillRect(0, 0, w, 13);
  ctx.fillStyle = '#2b7357';
  ctx.fillRect(0, 143, w, 25);
  ctx.fillStyle = '#ef9a49';
  ctx.fillRect(0, 136, w, 8);

  // logo: mint circle + star
  ctx.fillStyle = '#2b7357';
  ctx.beginPath(); ctx.arc(92, 84, 55, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff9e9';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 34 : 14;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = 92 + Math.cos(a) * r;
    const py = 84 + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ef9a49';
  ctx.beginPath(); ctx.arc(116, 54, 9, 0, TAU); ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#244d3d';
  ctx.font = `800 90px ${FONT_JP}`;
  ctx.fillText('星見マート', 174, 90);
  ctx.fillStyle = '#2b7357';
  ctx.font = `700 25px ${FONT_EN}`;
  ctx.fillText('HOSHIMI MART', 180, 137);
  ctx.fillStyle = '#e88d3e';
  ctx.font = `800 22px ${FONT_EN}`;
  ctx.fillText('FRESH  ·  FRIENDLY  ·  LOCAL', 398, 137);

  // 24H badge
  ctx.fillStyle = '#f6a24e';
  roundRect(ctx, 842, 33, 138, 72, 16);
  ctx.fill();
  ctx.fillStyle = '#fff9e9';
  ctx.font = `900 48px ${FONT_EN}`;
  ctx.textAlign = 'center';
  ctx.fillText('24H', 911, 71);
  ctx.font = `700 20px ${FONT_JP}`;
  ctx.fillText('年中無休', 911, 128);
});

TEX.sideSign = canvasTexture(256, 640, (ctx, w, h) => {
  ctx.fillStyle = '#fff9e9';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2b7357';
  ctx.fillRect(0, 0, w, 96);
  ctx.fillStyle = '#fff9e9';
  ctx.font = `900 68px ${FONT_EN}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('24H', w / 2, 50);
  ctx.fillStyle = '#244d3d';
  const chars = '星見マート';
  for (let i = 0; i < chars.length; i++) {
    ctx.font = `800 52px ${FONT_JP}`;
    ctx.fillText(chars[i], w / 2, 148 + i * 72);
  }
  ctx.fillStyle = '#ef9a49';
  ctx.fillRect(0, 596, w, 44);
  ctx.fillStyle = '#fff9e9';
  ctx.font = `700 22px ${FONT_EN}`;
  ctx.fillText('OPEN', w / 2, 618);
});

TEX.pylon = canvasTexture(512, 1024, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#fffdf2');
  g.addColorStop(0.6, '#fff5df');
  g.addColorStop(1, '#f6e4c5');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#2b7357';
  ctx.lineWidth = 16;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.fillStyle = '#2b7357';
  ctx.fillRect(0, 0, w, 76);
  ctx.fillStyle = '#fff9e9';
  ctx.font = `800 34px ${FONT_EN}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('HOSHIMI MART', w / 2, 39);

  ctx.fillStyle = '#2b7357';
  ctx.beginPath(); ctx.arc(w / 2, 180, 74, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff9e9';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 45 : 18;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = w / 2 + Math.cos(a) * r;
    const py = 180 + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#244d3d';
  ctx.font = `800 54px ${FONT_JP}`;
  ctx.fillText('星見マート', w / 2, 310);
  ctx.fillStyle = '#e88d3e';
  ctx.font = `800 54px ${FONT_EN}`;
  ctx.fillText('24 HOURS', w / 2, 380);

  const items = [
    ['ATM', '現金サービス'],
    ['COFFEE', '淹れたてコーヒー'],
    ['ODEN', 'おでん はじめました'],
    ['FRIED', 'からあげ・ホットスナック'],
  ];
  items.forEach((it, i) => {
    const y = 470 + i * 120;
    ctx.fillStyle = i % 2 === 0 ? '#f2e7cf' : '#fff8e8';
    roundRect(ctx, 42, y, w - 84, 92, 14);
    ctx.fill();
    ctx.fillStyle = '#2b7357';
    ctx.font = `800 30px ${FONT_EN}`;
    ctx.textAlign = 'left';
    ctx.fillText(it[0], 72, y + 34);
    ctx.fillStyle = '#5d5a52';
    ctx.font = `600 23px ${FONT_JP}`;
    ctx.fillText(it[1], 72, y + 66);
  });
  ctx.fillStyle = '#ef9a49';
  ctx.fillRect(0, h - 60, w, 60);
  ctx.fillStyle = '#fff9e9';
  ctx.font = `700 24px ${FONT_JP}`;
  ctx.textAlign = 'center';
  ctx.fillText('地域の、すぐそばに。', w / 2, h - 29);
});

function vendingTexture(bodyColor, accent, brand) {
  return canvasTexture(512, 1024, (ctx, w, h) => {
    ctx.fillStyle = bodyColor;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, w, 122);
    ctx.fillStyle = '#fffdf6';
    ctx.font = `900 52px ${FONT_EN}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(brand, w / 2, 61);

    // glowing product window
    ctx.fillStyle = '#f7fbff';
    roundRect(ctx, 26, 148, 460, 570, 18);
    ctx.fill();
    const drinks = [
      ['#e84b4b', '#ffe2a2'], ['#2f6bd8', '#cfe7ff'], ['#67b95c', '#ecffca'],
      ['#efb63f', '#fff0bd'], ['#d75db2', '#ffd8f2'], ['#4aaebb', '#d7feff'],
      ['#e86b35', '#ffe1c8'], ['#7357c9', '#e4d9ff'], ['#d8d2c1', '#ffffff'],
    ];
    for (let row = 0; row < 5; row++) {
      const y = 188 + row * 104;
      ctx.fillStyle = '#dfe7ee';
      ctx.fillRect(44, y + 74, 424, 9);
      for (let col = 0; col < 5; col++) {
        const x = 62 + col * 82;
        const d = drinks[(row * 3 + col) % drinks.length];
        ctx.fillStyle = d[0];
        roundRect(ctx, x, y + 6, 54, 74, 9);
        ctx.fill();
        ctx.fillStyle = d[1];
        ctx.fillRect(x + 9, y + 30, 36, 24);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect(x + 7, y + 10, 7, 28);
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(x + 19, y + 64, 16, 4);
      }
    }

    // coin / selection panel
    ctx.fillStyle = '#202734';
    roundRect(ctx, 34, 748, 444, 124, 12);
    ctx.fill();
    ctx.fillStyle = '#72e5ff';
    ctx.fillRect(58, 770, 150, 40);
    ctx.fillStyle = '#0e1724';
    ctx.font = `700 20px ${FONT_EN}`;
    ctx.textAlign = 'left';
    ctx.fillText('¥ 130', 68, 790);
    ctx.fillStyle = '#e8edf2';
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(280 + (i % 3) * 48, 764 + Math.floor(i / 3) * 42, 34, 26);
    }
    ctx.fillStyle = '#a7b2bf';
    ctx.fillRect(58, 828, 32, 30);
    ctx.fillRect(104, 828, 32, 30);

    // dispenser
    ctx.fillStyle = '#151a22';
    roundRect(ctx, 44, 888, 424, 92, 12);
    ctx.fill();
    ctx.fillStyle = '#3c4654';
    ctx.fillRect(72, 914, 366, 34);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 990, w, 34);
  });
}

TEX.vendingRed = vendingTexture('#b8343e', '#f3d7b0', 'DRINK');
TEX.vendingBlue = vendingTexture('#23538f', '#f1dfc0', 'COOL');

TEX.fridge = canvasTexture(512, 1024, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#f7ffff');
  g.addColorStop(0.5, '#e7fbff');
  g.addColorStop(1, '#d5f3ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const colors = ['#df4a4a', '#3c7bda', '#55b765', '#efb844', '#d765b6', '#49aeb9', '#ef7b3d', '#8268d8'];
  for (let row = 0; row < 6; row++) {
    const y = 62 + row * 158;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(14, y + 100, w - 28, 18);
    ctx.fillStyle = 'rgba(55,95,120,0.3)';
    ctx.fillRect(14, y + 118, w - 28, 6);
    for (let col = 0; col < 6; col++) {
      const x = 28 + col * 78;
      const c = colors[(row * 2 + col) % colors.length];
      ctx.fillStyle = c;
      roundRect(ctx, x, y + 10, 48, 92, 10);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.fillRect(x + 8, y + 34, 32, 24);
      ctx.fillStyle = 'rgba(20,30,40,0.45)';
      ctx.fillRect(x + 15, y + 82, 18, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(x + 6, y + 16, 5, 28);
    }
  }
  // glass reflection streaks
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(20, h); ctx.lineTo(230, 0); ctx.lineTo(330, 0); ctx.lineTo(120, h);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
});

TEX.glassDecal = canvasTexture(512, 192, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.93)';
  roundRect(ctx, 10, 18, 490, 156, 18);
  ctx.fill();
  ctx.strokeStyle = '#2b7357';
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.fillStyle = '#2b7357';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 54px ${FONT_JP}`;
  ctx.fillText('24時間営業', 256, 74);
  ctx.fillStyle = '#e88d3e';
  ctx.font = `800 31px ${FONT_EN}`;
  ctx.fillText('OPEN  ·  ATM  ·  COFFEE', 256, 133);
});

function decalTexture(label, sub, color) {
  return canvasTexture(256, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,252,240,0.92)';
    roundRect(ctx, 4, 4, w - 8, h - 8, 14);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(14, 14, 8, h - 28);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 47px ${FONT_JP}`;
    ctx.fillText(label, w / 2 + 5, 50);
    ctx.fillStyle = '#65604f';
    ctx.font = `700 20px ${FONT_EN}`;
    ctx.fillText(sub, w / 2 + 5, 91);
  });
}
TEX.decalATM = decalTexture('ATM', 'CASH SERVICE', '#2b7357');
TEX.decalCoffee = decalTexture('コーヒー', 'FRESH COFFEE', '#a35a2e');
TEX.decalOden = decalTexture('おでん', 'HOT FOOD', '#c04b2f');

function aisleTexture(main, sub) {
  return canvasTexture(512, 144, (ctx, w, h) => {
    ctx.fillStyle = '#fff9e8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2b7357';
    ctx.fillRect(0, 0, w, 16);
    ctx.fillRect(0, h - 16, w, 16);
    ctx.fillStyle = '#244d3d';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 52px ${FONT_JP}`;
    ctx.fillText(main, w / 2, 65);
    ctx.fillStyle = '#e88d3e';
    ctx.font = `700 21px ${FONT_EN}`;
    ctx.fillText(sub, w / 2, 112);
  });
}
TEX.aisleRice = aisleTexture('おにぎり・お弁当', 'RICE & BENTO');
TEX.aisleDrink = aisleTexture('飲料・お酒', 'DRINKS & SAKE');
TEX.aisleSnack = aisleTexture('お菓子・雑貨', 'SNACKS & GOODS');

TEX.hotCase = canvasTexture(512, 256, (ctx, w, h) => {
  ctx.fillStyle = '#f5d28a';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#e78a36';
  ctx.fillRect(0, 0, w, 42);
  ctx.fillStyle = '#fff6dc';
  ctx.font = `800 28px ${FONT_JP}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('HOT SNACK', w / 2, 22);
  const foods = ['#d9822c', '#f0b441', '#b9622a', '#e9a63a', '#cf7a36'];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      ctx.fillStyle = foods[(row * 4 + col) % foods.length];
      roundRect(ctx, 26 + col * 118, 70 + row * 90, 96, 62, 18);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,244,200,0.6)';
      roundRect(ctx, 36 + col * 118, 78 + row * 90, 76, 16, 8);
      ctx.fill();
    }
  }
});

TEX.cigarette = canvasTexture(512, 512, (ctx, w, h) => {
  ctx.fillStyle = '#f7f0df';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2b7357';
  ctx.fillRect(0, 0, w, 56);
  ctx.fillStyle = '#fff9e9';
  ctx.font = `800 26px ${FONT_JP}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('たばこ ・ 切手 ・ 収納', w / 2, 30);
  const cols = ['#e8ddd0', '#d7e5ee', '#c6d9d0', '#ecd3c9', '#d8d0e6', '#e9e3c2'];
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 7; col++) {
      const x = 26 + col * 68;
      const y = 82 + row * 58;
      ctx.fillStyle = cols[(row + col) % cols.length];
      ctx.fillRect(x, y, 52, 46);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(x + 4, y + 4, 44, 8);
      ctx.fillStyle = ['#c04b3a', '#3c6e9e', '#446b4f'][(row * col) % 3];
      ctx.fillRect(x + 8, y + 24, 36, 10);
    }
  }
});

TEX.poster = canvasTexture(512, 384, (ctx, w, h) => {
  ctx.fillStyle = '#6f5335';
  ctx.fillRect(0, 0, w, h);
  // cork grain
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(${rand(90, 160)},${rand(70, 120)},${rand(40, 80)},${rand(0.05, 0.2)})`;
    ctx.fillRect(rand(0, w), rand(0, h), rand(1, 4), rand(1, 3));
  }
  ctx.strokeStyle = '#4a3520';
  ctx.lineWidth = 16;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  const posters = [
    { x: 35, y: 35, w: 200, h: 145, bg: '#e8e2d2', title: '夏祭り', accent: '#d3543d' },
    { x: 260, y: 30, w: 210, h: 150, bg: '#f5e6b8', title: '防犯', accent: '#2b7357' },
    { x: 55, y: 210, w: 190, h: 138, bg: '#d7e4ea', title: '新商品', accent: '#3a6f9b' },
    { x: 277, y: 212, w: 180, h: 135, bg: '#e9d4c8', title: '求人', accent: '#b0543f' },
  ];
  posters.forEach((p) => {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(p.x + 5, p.y + 6, p.w, p.h);
    ctx.fillStyle = p.bg;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = p.accent;
    ctx.fillRect(p.x, p.y, p.w, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `800 19px ${FONT_JP}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.title, p.x + 10, p.y + 13);
    ctx.fillStyle = '#5d5a52';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(p.x + 12, p.y + 45 + i * 13, p.w - 30 - (i % 3) * 16, 4);
    }
    ctx.fillStyle = 'rgba(200,70,50,0.6)';
    ctx.beginPath(); ctx.arc(p.x + p.w - 30, p.y + p.h - 28, 13, 0, TAU); ctx.fill();
  });
  // tape corners
  ctx.fillStyle = 'rgba(242,231,197,0.6)';
  ctx.fillRect(12, 12, 55, 18);
  ctx.fillRect(w - 70, h - 28, 55, 18);
});

TEX.plaque = canvasTexture(1024, 144, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#c9a763');
  g.addColorStop(0.35, '#f0d79a');
  g.addColorStop(0.65, '#c3a059');
  g.addColorStop(1, '#98753b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(65,48,22,0.85)';
  ctx.lineWidth = 9;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.fillStyle = '#2f3c33';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 49px ${FONT_JP}`;
  ctx.fillText('星見マート  ·  雨夜の街角', w / 2, 58);
  ctx.font = `600 27px ${FONT_EN}`;
  ctx.fillText('HOSHIMI MART  /  RAINY NIGHT CORNER', w / 2, 107);
});

function roadTextTexture(text) {
  return canvasTexture(512, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(235,239,228,0.9)';
    ctx.font = `900 160px ${FONT_JP}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2);
  });
}
TEX.stopText = roadTextTexture('止まれ');

TEX.doorMat = canvasTexture(512, 256, (ctx, w, h) => {
  ctx.fillStyle = '#263d35';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#d7c9a2';
  ctx.lineWidth = 10;
  ctx.strokeRect(12, 12, w - 24, h - 24);
  ctx.fillStyle = '#e6dcc1';
  ctx.font = `800 52px ${FONT_EN}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('WELCOME', w / 2, 104);
  ctx.fillStyle = '#d5a862';
  ctx.font = `700 27px ${FONT_JP}`;
  ctx.fillText('いらっしゃいませ', w / 2, 172);
});

TEX.staffDoor = canvasTexture(256, 512, (ctx, w, h) => {
  ctx.fillStyle = '#6d7479';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#4a5056';
  ctx.lineWidth = 10;
  ctx.strokeRect(12, 12, w - 24, h - 24);
  ctx.fillStyle = '#454b50';
  ctx.fillRect(32, 80, w - 64, 150);
  ctx.fillStyle = '#b7c0c5';
  ctx.fillRect(w - 58, 280, 16, 80);
  ctx.fillStyle = '#e8e4d4';
  roundRect(ctx, 38, 380, w - 76, 74, 8);
  ctx.fill();
  ctx.fillStyle = '#333936';
  ctx.font = `800 27px ${FONT_JP}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('STAFF ONLY', w / 2, 417);
});

TEX.noren = canvasTexture(512, 256, (ctx, w, h) => {
  ctx.fillStyle = '#35536d';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 12; i++) ctx.fillRect(0, i * 22, w, 5);
  ctx.fillStyle = '#e9e0c9';
  ctx.beginPath(); ctx.arc(w / 2, 100, 55, 0, TAU); ctx.fill();
  ctx.fillStyle = '#273d52';
  ctx.font = `800 58px ${FONT_JP}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('酒', w / 2, 102);
  ctx.fillStyle = '#e9e0c9';
  ctx.font = `700 26px ${FONT_JP}`;
  ctx.fillText('星見酒店', w / 2, 190);
});

TEX.glassRain = canvasTexture(512, 1024, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  // soft diagonal sky reflection
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, 'rgba(210,242,255,0)');
  g.addColorStop(0.38, 'rgba(210,242,255,0.10)');
  g.addColorStop(0.5, 'rgba(236,250,255,0.22)');
  g.addColorStop(0.62, 'rgba(210,242,255,0.08)');
  g.addColorStop(1, 'rgba(210,242,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // diagonal glints
  ctx.strokeStyle = 'rgba(230,250,255,0.17)';
  ctx.lineWidth = 7;
  [0.15, 0.42, 0.75].forEach((t) => {
    ctx.beginPath();
    ctx.moveTo(w * t - 40, h);
    ctx.lineTo(w * t + 170, 0);
    ctx.stroke();
  });
  // rain droplets and thin runnels
  for (let i = 0; i < 70; i++) {
    const x = rand(8, w - 8);
    const y = rand(30, h - 30);
    const r = rand(0.6, 2.8);
    ctx.fillStyle = `rgba(240,252,255,${rand(0.12, 0.32)})`;
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.7, r * 1.8, 0, 0, TAU); ctx.fill();
    if (i % 4 === 0) {
      ctx.strokeStyle = `rgba(225,248,255,${rand(0.06, 0.15)})`;
      ctx.lineWidth = rand(0.6, 1.3);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rand(-3, 3), y + rand(20, 90)); ctx.stroke();
    }
  }
});

TEX.neonATM = canvasTexture(512, 200, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  ctx.shadowColor = '#59e8ff';
  ctx.shadowBlur = 28;
  ctx.strokeStyle = '#8bf4ff';
  ctx.lineWidth = 7;
  roundRect(ctx, 14, 16, w - 28, h - 32, 20);
  ctx.stroke();
  ctx.fillStyle = '#d9fbff';
  ctx.font = `900 94px ${FONT_EN}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ATM', w / 2, h / 2 - 4);
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#93f2ff';
  ctx.font = `700 23px ${FONT_JP}`;
  ctx.fillText('現金サービス', w / 2, h - 33);
});

TEX.neonOpen = canvasTexture(512, 180, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  ctx.shadowColor = '#ff5d86';
  ctx.shadowBlur = 26;
  ctx.strokeStyle = '#ff8ba7';
  ctx.lineWidth = 7;
  roundRect(ctx, 16, 16, w - 32, h - 32, 26);
  ctx.stroke();
  ctx.fillStyle = '#ffdce4';
  ctx.font = `900 92px ${FONT_EN}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('OPEN', w / 2, 82);
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#ff9bb1';
  ctx.font = `700 24px ${FONT_JP}`;
  ctx.fillText('営業中', w / 2, 144);
});

TEX.autoDoor = canvasTexture(256, 128, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,250,230,0.9)';
  roundRect(ctx, 6, 6, w - 12, h - 12, 10);
  ctx.fill();
  ctx.fillStyle = '#2b7357';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 28px ${FONT_JP}`;
  ctx.fillText('自動ドア', w / 2, 50);
  ctx.font = `700 19px ${FONT_EN}`;
  ctx.fillText('AUTOMATIC DOOR', w / 2, 88);
});

function repeatTexture(src, sx, sy, rotation = 0) {
  const t = src.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(sx, sy);
  t.rotation = rotation;
  t.needsUpdate = true;
  return t;
}
TEX.grateX = repeatTexture(TEX.grate, 9, 1);
TEX.grateZ = repeatTexture(TEX.grate, 9, 1, Math.PI / 2);

// ------------------------------------------------------------
// Shared cel-shading material palette
// ------------------------------------------------------------
const M = {
  plinthWood: toon(0x2b2430),
  plinthStone: toon(0x242c39),
  brass: toon(0xa58146, { emissive: 0x241605, emissiveIntensity: 0.4 }),
  asphalt: toon(0xffffff, { map: TEX.asphalt, soft: true }),
  sidewalk: toon(0xffffff, { map: TEX.sidewalk, soft: true }),
  stoneAlley: toon(0xffffff, { map: TEX.stoneAlley }),
  curb: toon(0x9aa2ad),
  curbDark: toon(0x707986),
  paintWhite: toon(0xe6e4d5, { emissive: 0x1a1a15, emissiveIntensity: 0.2 }),
  paintYellow: toon(0xd8b34c),
  metal: toon(0x9ba4ad),
  metalDark: toon(0x333b47),
  metalLight: toon(0xb3bcc4),
  wallCream: toon(0xcdbb9e),
  wallCreamDark: toon(0xb3a084),
  wallShadow: toon(0x857b6c),
  roof: toon(0xffffff, { map: TEX.roof }),
  trimGreen: toon(0x2b5c4b),
  trimGreenLight: toon(0x3e7b62),
  orange: toon(0xef9a49),
  interiorWall: toon(0xe3cbaa, { emissive: 0x2a1a08, emissiveIntensity: 0.25 }),
  interiorWallCool: toon(0xd8cab5, { emissive: 0x15100a, emissiveIntensity: 0.18 }),
  ceiling: toon(0xf1dfbd, { emissive: 0x4a351a, emissiveIntensity: 0.28 }),
  interiorFloor: toon(0xcbb598, { map: TEX.interiorFloor, emissive: 0x1f1408, emissiveIntensity: 0.25 }),
  shelfFrame: toon(0xc2b297),
  shelfWhite: toon(0xd9cbb2),
  shelfMetal: toon(0x6d6a60),
  shelfBack: toon(0x9a896f),
  productColors: [
    0xff4f43, 0xffa42e, 0x41c96d, 0x3d7dff, 0xaf5dff, 0xff51a6,
    0x36d8e0, 0xffd342, 0xff7c2e, 0x53d69a, 0xd92e46, 0x5d7dff,
  ],
  fridgeFrame: toon(0xe8e7df),
  fridgeDark: toon(0x3c4954),
  warmLight: basic(0xfff3cc),
  warmLightSoft: basic(0xffe6b2),
  coolLight: basic(0xd6f7ff),
  neonGreen: basic(0x89f7c2),
  neonPink: basic(0xff94bc),
  neonBlue: basic(0x86e8ff, { transparent: true, opacity: 0.9 }),
  red: toon(0xc44a43),
  blue: toon(0x3d6fa8),
  glass: new THREE.MeshPhongMaterial({
    color: 0x9fd3e6,
    transparent: true,
    opacity: 0.055,
    shininess: 35,
    specular: 0x6d95a4,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
  glassBright: new THREE.MeshBasicMaterial({
    color: 0xb9ecff,
    transparent: true,
    opacity: 0.09,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
  glassDark: new THREE.MeshPhongMaterial({
    color: 0x193344,
    transparent: true,
    opacity: 0.35,
    shininess: 80,
    specular: 0xbbeeff,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
  asphaltPlain: toon(0x2b3241),
  woodDark: toon(0x4c3a2f),
  wood: toon(0x79573c),
  cardboard: toon(0xb58f62),
  concrete: toon(0x81858b),
  concreteDark: toon(0x5e6268),
  paper: toon(0xf2e7ca),
  greenPlastic: toon(0x40725a),
  bluePlastic: toon(0x3d6b8e),
  redPlastic: toon(0xa64b48),
  tire: toon(0x22252c),
  bikeFrame: toon(0xd7cdb4),
  bikeRed: toon(0x9c4f4b),
  rainPuddle: toon(0x203042),
};

M.asphalt.userData.weatherMaps = { rain: TEX.asphalt, sun: TEX.asphaltDay };
M.sidewalk.userData.weatherMaps = { rain: TEX.sidewalk, sun: TEX.sidewalkDay };
M.stoneAlley.userData.weatherMaps = { rain: TEX.stoneAlley, sun: TEX.stoneAlleyDay };

const SIDEWALK_TOP = 0.16;
const STORE_X0 = -4.75;
const STORE_X1 = 1.18;
const STORE_Z0 = -5.95;
const STORE_Z1 = -0.95;
const STORE_CX = (STORE_X0 + STORE_X1) / 2;
const STORE_W = STORE_X1 - STORE_X0;
const STORE_D = STORE_Z1 - STORE_Z0;
const INTERIOR_FLOOR = 0.17;

function contactShadow(parent, x, z, w, d, opacity = 0.42, y = SIDEWALK_TOP + 0.007) {
  const mat = new THREE.MeshBasicMaterial({
    map: SOFT_BLOB_TEX,
    transparent: true,
    opacity,
    depthWrite: false,
    color: 0x000000,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.renderOrder = 2;
  parent.add(mesh);
  return mesh;
}

// ------------------------------------------------------------
// Display plinth and square base
// ------------------------------------------------------------
const plinth = kit('00-展示底座', 0.05, { fromY: -0.9, scaleFrom: 0.985 });
{
  box(plinth, M.plinthWood, 14.32, 0.16, 14.32, 0, -0.6, 0, { outline: 0.004, receive: false });
  box(plinth, M.plinthStone, 13.88, 0.52, 13.88, 0, -0.26, 0, { outline: 0.004, receive: false });
  // warm wood reveal
  box(plinth, M.brass, 13.93, 0.022, 13.93, 0, -0.505, 0, { cast: false, receive: false });
  // inlaid brass rim around the diorama top
  const rimY = 0.039;
  box(plinth, M.brass, 13.78, 0.014, 0.035, 0, rimY, -6.855, { cast: false });
  box(plinth, M.brass, 13.78, 0.014, 0.035, 0, rimY, 6.855, { cast: false });
  box(plinth, M.brass, 0.035, 0.014, 13.78, -6.855, rimY, 0, { cast: false });
  box(plinth, M.brass, 0.035, 0.014, 13.78, 6.855, rimY, 0, { cast: false });
  // museum plaque
  texturedPlane(plinth, TEX.plaque, 2.65, 0.373, -1.3, -0.245, 6.941, { toneMapped: true });
  // tiny brass corner caps
  [[-6.86, -6.86], [6.86, -6.86], [-6.86, 6.86], [6.86, 6.86]].forEach(([x, z]) => {
    cylinder(plinth, M.brass, 0.075, 0.09, 0.03, x, 0.043, z, { seg: 10, cast: false, receive: false });
  });
  contactShadow(plinth, 0, 0, 15.8, 15.8, 0.32, -0.7);
}

// ------------------------------------------------------------
// Street surfaces
// ------------------------------------------------------------
const asphaltKit = kit('01-沥青路面', 0.14, { fromY: -0.55, scaleFrom: 0.99 });
{
  const asphalt = box(asphaltKit, M.asphalt, 13.76, 0.04, 13.76, 0, 0.02, 0, { cast: false });
  asphalt.receiveShadow = true;
}

const walkKit = kit('02-人行道', 0.30, { fromY: -0.55, scaleFrom: 0.985 });
{
  // near-side L-shaped block
  box(walkKit, M.sidewalk, 10.08, 0.13, 8.88, -1.84, 0.095, -2.44, { cast: false, outline: 0.006 });
  // far side walks
  box(walkKit, M.sidewalk, 13.72, 0.13, 1.53, 0, 0.095, 6.115, { cast: false });
  box(walkKit, M.sidewalk, 1.03, 0.13, 12.23, 6.365, 0.095, -0.765, { cast: false });
  // alley floor
  box(walkKit, M.stoneAlley, 2.05, 0.018, 5.9, -5.8, 0.169, -3.9, { cast: false, receive: true });
  // curbs
  box(walkKit, M.curb, 10.08, 0.16, 0.17, -1.84, 0.12, 1.955, { cast: false, outline: 0.008 });
  box(walkKit, M.curb, 0.17, 0.16, 8.88, 3.155, 0.12, -2.44, { cast: false, outline: 0.008 });
  box(walkKit, M.curb, 13.72, 0.16, 0.17, 0, 0.12, 5.305, { cast: false });
  box(walkKit, M.curb, 0.17, 0.16, 12.23, 5.805, 0.12, -0.765, { cast: false });
  // curb corner quarter-ish
  box(walkKit, M.curb, 0.35, 0.16, 0.35, 3.02, 0.12, 1.82, { cast: false });
  // tactile paving at the corner
  plane(walkKit, toon(0xffffff, { map: TEX.tactile, emissive: 0x171003, emissiveIntensity: 0.25 }), 1.55, 0.30, 2.34, 0.169, 1.72, { receive: false });
  plane(walkKit, toon(0xffffff, { map: TEX.tactile, emissive: 0x171003, emissiveIntensity: 0.25 }), 0.30, 1.3, 3.03, 0.169, 0.9, { receive: false });
  // gutter strips
  plane(walkKit, toon(0xffffff, { map: TEX.grateX }), 9.55, 0.24, -1.65, 0.047, 2.19, { receive: false, renderOrder: 1 });
  plane(walkKit, toon(0xffffff, { map: TEX.grateZ }), 0.24, 8.6, 3.28, 0.047, -2.2, { receive: false, renderOrder: 1 });
  // manhole covers
  plane(walkKit, toon(0xffffff, { map: TEX.manhole }), 0.78, 0.78, -0.8, 0.052, 3.05, { receive: false, renderOrder: 1 });
  plane(walkKit, toon(0xffffff, { map: TEX.manhole }), 0.62, 0.62, 4.35, 0.052, -4.35, { receive: false, renderOrder: 1 });
  // small drain in alley
  box(walkKit, M.metalDark, 0.45, 0.02, 0.3, -5.95, 0.183, -3.0, { cast: false });
}

// ------------------------------------------------------------
// Road markings + reflective crosswalk
// ------------------------------------------------------------
const markKit = kit('03-路面标线', 0.50, { fromY: -0.28, scaleFrom: 1.0 });
{
  // dashed centre line, front road
  for (let i = 0; i < 7; i++) {
    const x = -6.4 + i * 1.15;
    box(markKit, M.paintWhite, 0.62, 0.012, 0.13, x, 0.049, 3.68, { cast: false, receive: false });
  }
  // dashed centre line, side road
  for (let i = 0; i < 5; i++) {
    const z = -6.3 + i * 1.05;
    box(markKit, M.paintWhite, 0.13, 0.012, 0.56, 4.53, 0.049, z, { cast: false, receive: false });
  }
  for (let i = 0; i < 3; i++) {
    const z = 2.9 + i * 1.05;
    box(markKit, M.paintWhite, 0.13, 0.012, 0.56, 4.53, 0.049, z, { cast: false, receive: false });
  }
  // near-side pedestrian crossing across the front road
  for (let i = 0; i < 4; i++) {
    const x = 2.06 + i * 0.32;
    box(markKit, M.paintWhite, 0.21, 0.014, 2.95, x, 0.052, 3.67, { cast: false, receive: false });
    reflectionStrip(markKit, 0xcfe2ef, 0.22, 2.9, x, 3.67, 0.10, Math.PI / 2);
  }
  // crossing across the side road
  for (let i = 0; i < 4; i++) {
    const z = 0.92 + i * 0.31;
    box(markKit, M.paintWhite, 2.48, 0.014, 0.2, 4.52, 0.052, z, { cast: false, receive: false });
    reflectionStrip(markKit, 0xcfe2ef, 2.4, 0.2, 4.52, z, 0.10, 0);
  }
  // stop line
  box(markKit, M.paintWhite, 2.25, 0.014, 0.17, 4.5, 0.052, 1.98, { cast: false, receive: false });
  // 止まれ road lettering
  plane(markKit, new THREE.MeshBasicMaterial({ map: TEX.stopText, transparent: true, opacity: 0.92, depthWrite: false }), 1.65, 0.82, 4.5, 0.057, 2.82, { receive: false, renderOrder: 2 });
  // parking bay on the side street
  box(markKit, M.paintWhite, 0.09, 0.012, 2.55, 4.72, 0.05, -1.85, { cast: false, receive: false });
  box(markKit, M.paintWhite, 0.09, 0.012, 2.55, 5.72, 0.05, -1.85, { cast: false, receive: false });
  box(markKit, M.paintWhite, 1.09, 0.012, 0.09, 5.22, 0.05, -3.12, { cast: false, receive: false });
  box(markKit, M.paintWhite, 1.09, 0.012, 0.09, 5.22, 0.05, -0.58, { cast: false, receive: false });
  // P letter in bay
  const pTex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(232,236,226,0.9)';
    ctx.lineWidth = 18;
    ctx.font = `900 190px ${FONT_EN}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText('P', w / 2, h / 2 + 8);
  });
  plane(markKit, new THREE.MeshBasicMaterial({ map: pTex, transparent: true, opacity: 0.85, depthWrite: false }), 0.85, 0.85, 5.22, 0.056, -1.85, { receive: false, renderOrder: 2 });
  reflectionStrip(markKit, 0x9ed9e8, 1.2, 2.1, 5.15, -1.85, 0.07);
}

// ------------------------------------------------------------
// Puddles + fake wet reflections
// ------------------------------------------------------------
const wetKit = kit('04-积水与倒影', 0.72, { fromY: -0.18, scaleFrom: 1.0 });
{
  puddle(wetKit, -1.2, 1.5, 1.35, 0.48, 0.2, 0.55, 0.164);
  puddle(wetKit, 1.75, 1.35, 0.72, 0.32, -0.3, 0.5, 0.164);
  puddle(wetKit, -5.9, -1.3, 0.78, 0.5, 0.1, 0.5, 0.164);
  puddle(wetKit, 5.15, 2.8, 1.1, 0.45, -0.5, 0.5);
  puddle(wetKit, 4.55, 4.55, 0.7, 0.3, 0.2, 0.45);
  puddle(wetKit, 0.5, 4.5, 0.8, 0.35, 0.7, 0.42);
  puddle(wetKit, 5.25, -4.35, 0.55, 0.28, 0.0, 0.4);
  puddle(wetKit, -3.3, 1.05, 0.9, 0.25, 0.35, 0.38, 0.164);
  puddle(wetKit, -4.55, -0.65, 0.34, 0.2, 0.1, 0.5, 0.17);
  // warm shop window spill on the sidewalk — broken into reflected columns
  reflectionStrip(wetKit, 0xff8f2f, 0.58, 3.2, -4.05, 0.5, 0.5, 0, 0.169);
  reflectionStrip(wetKit, 0xffa23c, 0.5, 3.5, -3.2, 0.55, 0.42, 0, 0.169);
  reflectionStrip(wetKit, 0xffa74a, 0.75, 3.6, -2.2, 0.55, 0.5, 0, 0.169);
  reflectionStrip(wetKit, 0xffb35a, 0.42, 2.9, -1.2, 0.65, 0.4, 0, 0.169);
  reflectionStrip(wetKit, 0xffa23e, 0.58, 3.0, -0.2, 0.55, 0.46, 0, 0.169);
  reflectionStrip(wetKit, 0xffc077, 0.3, 2.1, 0.65, 0.4, 0.35, 0, 0.169);
  reflectionStrip(wetKit, 0xffd59a, 0.22, 1.2, 0.2, 0.1, 0.3, 0, 0.169);
  // very broad, faint bounce light
  reflectionStrip(wetKit, 0xff9d48, 3.5, 1.5, -1.6, 1.0, 0.09, 0, 0.169);
  // green fascia + cyan ATM neon glow on the pavers
  reflectionStrip(wetKit, 0x27cf7f, 2.0, 2.2, -2.3, 0.15, 0.18, 0, 0.169);
  reflectionStrip(wetKit, 0x43d9e9, 0.65, 1.7, -3.72, 0.3, 0.2, 0, 0.169);
  // vending machine cyan
  reflectionStrip(wetKit, 0x2c93b9, 0.9, 2.4, 2.65, -2.75, 0.38, 0, 0.169);
  reflectionStrip(wetKit, 0xb9557a, 0.5, 1.5, 2.6, -3.65, 0.2, 0, 0.169);
  // street lamp reflection on the road
  const lampRoadReflection = reflectionStrip(wetKit, 0xffa94f, 0.5, 3.6, -3.68, 3.65, 0.34);
  lampRoadReflection.userData.lampOnly = true;
  // long wet-road columns that link the glowing shop to the street
  reflectionStrip(wetKit, 0xff8a2e, 0.55, 3.7, -3.4, 3.55, 0.25);
  reflectionStrip(wetKit, 0xff9a3d, 0.42, 4.0, -2.45, 3.6, 0.3);
  reflectionStrip(wetKit, 0xffb258, 0.34, 3.3, -1.35, 3.55, 0.22);
  reflectionStrip(wetKit, 0xff8a2e, 0.75, 2.7, -1.5, 3.05, 0.18);
  reflectionStrip(wetKit, 0x49d9d2, 0.3, 2.0, 3.55, 1.1, 0.14);
  // pylon sign reflection
  reflectionStrip(wetKit, 0x62e7b2, 0.4, 2.40, 5.98, 0.82, 0.2, 0, 0.169);
  // crosswalk wet sheen
  reflectionStrip(wetKit, 0xbfe7ff, 2.5, 1.2, 4.5, 1.95, 0.12);
  reflectionStrip(wetKit, 0xcfeaff, 0.2, 2.6, 2.28, 3.7, 0.22);
  reflectionStrip(wetKit, 0xc7e6f8, 0.16, 2.7, 2.72, 3.7, 0.18);
  reflectionStrip(wetKit, 0xdcf1ff, 0.14, 2.5, 3.02, 3.7, 0.16);
  reflectionStrip(wetKit, 0xffb05c, 0.5, 1.5, 2.5, 3.7, 0.1);
  puddle(wetKit, 2.85, 4.45, 0.62, 0.24, 0.3, 0.55);
  // broad warm light pools under the glazing
  softLightPool(wetKit, 0xffad5e, 2.9, 1.7, -3.2, 0.75, 0.055);
  softLightPool(wetKit, 0xffad5e, 3.2, 1.9, -0.9, 0.9, 0.055);
  softLightPool(wetKit, 0xffad5e, 1.6, 1.2, 0.9, 0.35, 0.045);
  const lampPool = softLightPool(wetKit, 0xffa34f, 3.5, 3.5, -3.68, 1.65, 0.06, 0.172);
  lampPool.userData.lampOnly = true;
  // a large foreground puddle catches the shop and the sky
  puddle(wetKit, 0.8, 4.32, 1.45, 0.5, 0.35, 0.66);
  softLightPool(wetKit, 0x7fa6c4, 1.9, 0.8, 0.8, 4.32, 0.09, 0.049);
  reflectionStrip(wetKit, 0xff9f43, 0.3, 1.0, 0.85, 4.3, 0.24);
  // cool wet-asphalt sheen across the road
  softLightPool(wetKit, 0x38617f, 9.5, 3.1, -1.6, 3.72, 0.06, 0.049);
  softLightPool(wetKit, 0x315a78, 2.4, 7.8, 4.5, -1.3, 0.045, 0.049);
  // a couple of narrow reflected light columns from the shopfront
  reflectionStrip(wetKit, 0xffa04a, 0.28, 3.6, -2.6, 3.1, 0.12, 0, 0.049);
  reflectionStrip(wetKit, 0xffb861, 0.22, 3.1, -0.35, 3.2, 0.1, 0, 0.049);
  // cool glints on the wet road
  softLightPool(wetKit, 0x87b8d4, 1.6, 0.55, 0.9, 4.45, 0.055, 0.049);
  softLightPool(wetKit, 0x87b8d4, 1.1, 0.4, 4.7, 2.45, 0.05, 0.049);
}

// ------------------------------------------------------------
// Convenience-store building shell
// ------------------------------------------------------------
const bodyKit = kit('10-便利店主体', 1.05, { fromY: -1.25, scaleFrom: 0.96, duration: 0.95 });
{
  // foundation band
  box(bodyKit, M.wallShadow, STORE_W + 0.12, 0.12, STORE_D + 0.12, STORE_CX, 0.215, -3.45, {
    cast: false,
    outline: 0.006,
  });
  // back wall
  box(bodyKit, M.wallCream, STORE_W, 3.4, 0.15, STORE_CX, 1.85, STORE_Z0 + 0.075, {
    outline: 0.017,
  });
  // left wall
  box(bodyKit, M.wallCreamDark, 0.15, 3.4, STORE_D, STORE_X0 + 0.075, 1.85, -3.45, {
    outline: 0.017,
  });
  // right wall
  box(bodyKit, M.wallCream, 0.15, 3.4, STORE_D, STORE_X1 - 0.075, 1.85, -3.45, {
    outline: 0.017,
  });
  // front corner pillars
  box(bodyKit, M.wallCream, 0.32, 2.5, 0.22, -4.58, 1.37, -0.94, { outline: 0.018 });
  box(bodyKit, M.wallCream, 0.26, 2.5, 0.22, 1.04, 1.37, -0.94, { outline: 0.018 });
  // fascia beam above the shopfront
  box(bodyKit, M.wallCream, STORE_W, 0.98, 0.2, STORE_CX, 3.08, -0.94, { outline: 0.019 });
  // roof slab
  box(bodyKit, M.roof, 6.38, 0.18, 5.48, STORE_CX, 3.64, -3.45, { outline: 0.016 });
  // parapet
  box(bodyKit, M.wallCream, 6.32, 0.3, 0.1, STORE_CX, 3.82, -5.72, { outline: 0.012 });
  box(bodyKit, M.wallCream, 0.1, 0.3, 5.35, -4.88, 3.82, -3.45, { outline: 0.012 });
  box(bodyKit, M.wallCream, 0.1, 0.3, 5.35, 1.32, 3.82, -3.45, { outline: 0.012 });
  box(bodyKit, M.wallCream, 6.32, 0.28, 0.1, STORE_CX, 3.8, -0.78, { outline: 0.012 });
  // dark green trim line along the side walls
  box(bodyKit, M.trimGreen, 0.025, 0.22, STORE_D, STORE_X1 + 0.003, 2.56, -3.45, { cast: false });
  box(bodyKit, M.trimGreen, 0.025, 0.22, STORE_D, STORE_X0 - 0.003, 2.56, -3.45, { cast: false });
  // side wall panel joints
  for (let i = 0; i < 7; i++) {
    box(bodyKit, M.wallShadow, 0.02, 2.1, 0.035, STORE_X1 + 0.005, 1.35, -5.55 + i * 0.66, {
      cast: false,
      receive: false,
    });
  }
  // downpipes
  cylinder(bodyKit, M.curb, 0.055, 0.055, 3.3, -4.84, 1.85, -0.82, { seg: 8 });
  cylinder(bodyKit, M.curb, 0.055, 0.055, 3.3, 1.3, 1.85, -0.82, { seg: 8 });
  for (let i = 0; i < 4; i++) {
    box(bodyKit, M.metalDark, 0.12, 0.05, 0.09, -4.84, 0.5 + i * 0.85, -0.85, { cast: false });
    box(bodyKit, M.metalDark, 0.12, 0.05, 0.09, 1.3, 0.5 + i * 0.85, -0.85, { cast: false });
  }
  // small exterior meter boxes
  box(bodyKit, M.metal, 0.28, 0.4, 0.12, 1.36, 1.3, -4.72, { outline: 0.01 });
  cylinder(bodyKit, M.metalDark, 0.02, 0.02, 2.8, 1.39, 1.7, -5.4, { seg: 6 });
  // a small community notice board on the side wall, above the vending row
  box(bodyKit, M.woodDark, 0.035, 0.5, 0.84, STORE_X1 + 0.012, 2.38, -2.34, { cast: false });
  texturedPlane(bodyKit, TEX.poster, 0.76, 0.44, STORE_X1 + 0.035, 2.38, -2.34, { ry: Math.PI / 2 });
  box(bodyKit, M.wood, 0.05, 0.035, 0.9, STORE_X1 + 0.025, 2.64, -2.34, { cast: false });
  // side-wall details: poster, vents and a little 24H lightbox
  const sidePosterTex = canvasTexture(512, 720, (ctx, w, h) => {
    ctx.fillStyle = '#f7edd8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2b7357';
    ctx.fillRect(0, 0, w, 104);
    ctx.fillStyle = '#fff9e9';
    ctx.font = `800 43px ${FONT_JP}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('おいしい毎日。', w / 2, 54);
    ctx.fillStyle = '#e88d3e';
    ctx.beginPath(); ctx.arc(w / 2, 275, 130, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f3cd7b';
    ctx.beginPath(); ctx.arc(w / 2, 275, 96, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8f4f2d';
    ctx.beginPath(); ctx.ellipse(w / 2, 268, 66, 32, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f5e2b6';
    ctx.beginPath(); ctx.ellipse(w / 2, 252, 54, 21, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2b7357';
    ctx.font = `800 48px ${FONT_JP}`;
    ctx.fillText('できたて おにぎり', w / 2, 492);
    ctx.fillStyle = '#5f594c';
    ctx.font = `700 26px ${FONT_JP}`;
    ctx.fillText('毎朝、店内で炊きたて。', w / 2, 552);
    ctx.fillStyle = '#e88d3e';
    ctx.fillRect(0, 640, w, 80);
    ctx.fillStyle = '#fff9e9';
    ctx.font = `700 26px ${FONT_EN}`;
    ctx.fillText('HOSHIMI MART', w / 2, 681);
  });
  texturedPlane(bodyKit, sidePosterTex, 0.72, 1.0, STORE_X1 + 0.008, 2.4, -1.65, { ry: Math.PI / 2 });
  box(bodyKit, M.metalDark, 0.03, 0.28, 0.52, STORE_X1 + 0.006, 3.22, -3.05, { cast: false });
  box(bodyKit, M.metalLight, 0.02, 0.02, 0.46, STORE_X1 + 0.022, 3.13, -3.05, { cast: false });
  box(bodyKit, M.metalLight, 0.02, 0.02, 0.46, STORE_X1 + 0.022, 3.20, -3.05, { cast: false });
  box(bodyKit, M.metalLight, 0.02, 0.02, 0.46, STORE_X1 + 0.022, 3.27, -3.05, { cast: false });
  // open lightbox over the service door
  const openTex = canvasTexture(512, 180, (ctx, w, h) => {
    ctx.fillStyle = '#fff9e9';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#2b7357';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.fillStyle = '#2b7357';
    ctx.font = `900 78px ${FONT_EN}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('OPEN 24H', w / 2, h / 2);
  });
  const openSign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.78, 0.275),
    new THREE.MeshBasicMaterial({ map: openTex })
  );
  openSign.position.set(STORE_X1 + 0.01, 2.52, -5.08);
  openSign.rotation.y = Math.PI / 2;
  bodyKit.add(openSign);
  // left-wall service door facing the alley + community notice board
  texturedPlane(bodyKit, TEX.staffDoor, 0.8, 1.58, STORE_X0 - 0.008, 1.19, -4.55, {
    ry: -Math.PI / 2,
  });
  box(bodyKit, M.metalLight, 0.05, 0.07, 0.94, STORE_X0 - 0.01, 2.03, -4.55, { cast: false });
  box(bodyKit, M.metalLight, 0.05, 1.66, 0.07, STORE_X0 - 0.01, 1.19, -5.02, { cast: false });
  box(bodyKit, M.metalLight, 0.05, 1.66, 0.07, STORE_X0 - 0.01, 1.19, -4.08, { cast: false });
  box(bodyKit, M.metalLight, 0.12, 0.13, 0.3, STORE_X0 - 0.03, 2.33, -4.55, { cast: false });
  box(bodyKit, M.warmLight, 0.02, 0.03, 0.22, STORE_X0 - 0.09, 2.26, -4.55, { cast: false, receive: false });
  makeGlowSprite(0xffbd76, 0.8, STORE_X0 - 0.1, 2.24, -4.55, 0.15, bodyKit);
  box(bodyKit, M.woodDark, 0.03, 0.62, 1.05, STORE_X0 - 0.012, 1.72, -2.48, { cast: false });
  texturedPlane(bodyKit, TEX.poster, 0.96, 0.54, STORE_X0 - 0.032, 1.72, -2.48, {
    ry: -Math.PI / 2,
  });
  box(bodyKit, M.wood, 0.05, 0.03, 1.12, STORE_X0 - 0.025, 2.03, -2.48, { cast: false });
  // rear service door + light
  texturedPlane(bodyKit, TEX.staffDoor, 0.82, 1.64, STORE_X1 + 0.006, 1.24, -5.08, {
    ry: Math.PI / 2,
  });
  box(bodyKit, M.metalDark, 0.05, 0.14, 0.3, 1.23, 2.24, -5.08, { cast: false });
  const serviceGlow = basic(0xffe0a0);
  box(bodyKit, serviceGlow, 0.03, 0.08, 0.24, 1.21, 2.22, -5.08, { cast: false, receive: false });
  // rear clutter: crates & bucket
  const backYard = kit('11-后巷杂物', 3.35, { fromY: -0.8, scaleFrom: 0.9 });
  box(backYard, M.cardboard, 0.48, 0.36, 0.38, 0.55, 0.34, -6.35, { outline: 0.012, ry: 0.08 });
  box(backYard, M.cardboard, 0.42, 0.3, 0.34, 0.28, 0.31, -6.42, { outline: 0.012, ry: -0.1 });
  box(backYard, M.cardboard, 0.34, 0.27, 0.3, 0.72, 0.295, -6.48, { outline: 0.012, ry: 0.2 });
  cylinder(backYard, M.bluePlastic, 0.16, 0.18, 0.36, -0.25, 0.34, -6.4, { seg: 12 });
  cylinder(backYard, M.metalDark, 0.13, 0.13, 0.9, 0.95, 0.61, -6.3, { seg: 10 });
  box(backYard, M.wallShadow, 0.8, 0.04, 0.5, -0.6, 0.25, -6.45, { cast: false });
}

// ------------------------------------------------------------
// Shopfront: glass, mullions, automatic sliding doors
// ------------------------------------------------------------
const frontKit = kit('12-玻璃橱窗与自动门', 2.55, { fromY: -0.9, scaleFrom: 0.985, duration: 0.8 });
const DOOR = { left: null, right: null, open: 0, target: 0 };
{
  const glassZ = -0.932;
  const frameZ = -0.9;
  const frameMat = M.trimGreen;
  // bottom kick panel
  box(frontKit, M.wallCreamDark, STORE_W - 0.4, 0.27, 0.14, STORE_CX, 0.31, -0.91, {
    outline: 0.008,
  });
  box(frontKit, M.trimGreen, STORE_W - 0.5, 0.055, 0.16, STORE_CX, 0.455, -0.9, { cast: false });
  // head rail
  box(frontKit, frameMat, STORE_W - 0.45, 0.11, 0.16, STORE_CX, 2.57, frameZ, { outline: 0.006 });
  // mullions between fixed window panes
  [-4.42, -3.0, -1.6, -0.5].forEach((x) => {
    box(frontKit, frameMat, 0.075, 2.12, 0.16, x, 1.5, frameZ, { outline: 0.006 });
  });
  box(frontKit, frameMat, 0.075, 2.12, 0.16, 0.92, 1.5, frameZ, { outline: 0.006 });
  // window glass panes (three)
  [
    [-3.71, 1.39],
    [-2.3, 1.37],
    [-1.05, 1.07],
  ].forEach(([x, w]) => {
    plane(frontKit, M.glass, w, 2.08, x, 1.51, glassZ, {
      rx: 0,
      receive: false,
    });
    // diagonal glints plus a whisper of rain-on-glass
    const streak = new THREE.Mesh(
      new THREE.PlaneGeometry(0.09, 2.15),
      new THREE.MeshBasicMaterial({
        color: 0xd6f4ff,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    streak.position.set(x - w * 0.16, 1.55, glassZ + 0.004);
    streak.rotation.z = 0.5;
    frontKit.add(streak);
    const glassRain = texturedPlane(frontKit, TEX.glassRain, w, 2.08, x, 1.51, glassZ + 0.009, {
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    glassRain.userData.rainOnly = true;
  });
  // window decal / opening-hours sticker
  texturedPlane(frontKit, TEX.glassDecal, 1.02, 0.383, -2.3, 1.33, glassZ + 0.01, {
    transparent: true,
  });
  // small product stickers near the bottom of the windows
  texturedPlane(frontKit, TEX.decalCoffee, 0.52, 0.26, -3.9, 0.92, glassZ + 0.01, {
    transparent: true,
  });
  texturedPlane(frontKit, TEX.decalOden, 0.48, 0.24, -0.95, 0.9, glassZ + 0.01, {
    transparent: true,
  });
  texturedPlane(frontKit, TEX.decalATM, 0.46, 0.23, -3.3, 0.9, glassZ + 0.01, {
    transparent: true,
  });
  // automatic sliding doors
  const doorTop = 2.5;
  const doorBottom = 0.47;
  const doorH = doorTop - doorBottom;
  const makeDoorPanel = (centerX, width, handleX) => {
    const g = new THREE.Group();
    g.position.x = 0;
    const frame = M.metalDark;
    box(g, frame, 0.055, doorH, 0.06, centerX - width / 2, doorBottom + doorH / 2, -0.945, {
      outline: 0.006,
    });
    box(g, frame, 0.055, doorH, 0.06, centerX + width / 2, doorBottom + doorH / 2, -0.945, {
      outline: 0.006,
    });
    box(g, frame, width, 0.07, 0.06, centerX, doorTop, -0.945, { outline: 0.006 });
    box(g, frame, width, 0.08, 0.06, centerX, doorBottom, -0.945, { outline: 0.006 });
    plane(g, M.glass, width - 0.1, doorH - 0.14, centerX, doorBottom + doorH / 2, -0.934, {
      rx: 0,
      receive: false,
    });
    // handle
    cylinder(g, M.metalLight, 0.022, 0.022, 0.75, handleX, 1.35, -0.91, { seg: 8 });
    frontKit.add(g);
    return g;
  };
  // left panel occupies -0.47..0.23, right panel 0.23..0.93
  DOOR.left = makeDoorPanel(-0.12, 0.7, 0.13);
  DOOR.right = makeDoorPanel(0.58, 0.7, 0.35);
  [DOOR.left, DOOR.right].forEach((g) => {
    g.traverse((o) => {
      o.userData.noMerge = true;
      if (o.isMesh) o.castShadow = false;
    });
  });
  // automatic door sensor
  box(frontKit, M.metalDark, 0.32, 0.1, 0.13, 0.23, 2.62, -0.8, { outline: 0.006 });
  box(frontKit, M.neonGreen, 0.08, 0.025, 0.02, 0.23, 2.58, -0.733, { cast: false, receive: false });
  texturedPlane(frontKit, TEX.autoDoor, 0.42, 0.21, 0.2, 2.08, glassZ + 0.012, { transparent: true });
  // threshold
  box(frontKit, M.metal, 1.42, 0.035, 0.28, 0.2, 0.178, -0.88, { cast: false });
  // entrance mat
  plane(frontKit, toon(0xffffff, { map: TEX.doorMat }), 1.45, 0.66, 0.2, 0.169, -0.48, { receive: false });
  // puddle right by the door
  puddle(frontKit, 0.72, -0.28, 0.48, 0.18, 0.2, 0.35, 0.164);
  // little chrome kick plates
  box(frontKit, M.metalLight, 0.06, 0.18, 0.02, -0.48, 0.57, -0.883, { cast: false });
  box(frontKit, M.metalLight, 0.06, 0.18, 0.02, 0.92, 0.57, -0.883, { cast: false });
}

// ------------------------------------------------------------
// Illuminated fascia sign + projecting side sign
// ------------------------------------------------------------
const signKit = kit('13-便利店招牌', 3.05, { fromY: -0.75, scaleFrom: 0.92, duration: 0.85 });
{
  box(signKit, M.metalDark, 5.48, 0.76, 0.14, STORE_CX, 3.1, -0.86, { outline: 0.009 });
  box(signKit, M.warmLight, 5.4, 0.7, 0.03, STORE_CX, 3.1, -0.782, { cast: false, receive: false });
  texturedPlane(signKit, TEX.storeSign, 5.4, 0.7, STORE_CX, 3.1, -0.764, { toneMapped: true });
  // sign end caps & light spill
  makeGlowSprite(0xffe7b6, 2.4, -3.8, 3.1, -0.55, 0.1, signKit);
  makeGlowSprite(0xffe7b6, 1.8, 0.2, 3.1, -0.55, 0.08, signKit);
  // a vivid green neon underline turns the fascia into a real lightbox
  const neonUnderline = box(signKit, M.neonGreen, 5.28, 0.022, 0.022, STORE_CX, 2.715, -0.755, {
    cast: false, receive: false,
  });
  neonUnderline.userData.rainOnly = true;
  makeGlowSprite(0x6effc1, 3.6, STORE_CX, 2.72, -0.65, 0.08, signKit);
  // projecting vertical box sign
  box(signKit, M.metalDark, 0.5, 1.42, 0.12, 1.42, 2.58, -1.25, { outline: 0.009 });
  box(signKit, M.warmLight, 0.46, 1.38, 0.02, 1.42, 2.58, -1.18, { cast: false, receive: false });
  texturedPlane(signKit, TEX.sideSign, 0.46, 1.36, 1.42, 2.58, -1.165);
  // bracket to wall
  box(signKit, M.metalDark, 0.3, 0.07, 0.07, 1.27, 3.15, -1.25, { cast: false });
  box(signKit, M.metalDark, 0.3, 0.07, 0.07, 1.27, 2.01, -1.25, { cast: false });
  makeGlowSprite(0x95f5cc, 1.15, 1.42, 2.58, -1.0, 0.16, signKit);
  // round 24H plate on the side wall
  const plateTex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff9e9';
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 118, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#2b7357'; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 108, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#2b7357';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 94px ${FONT_EN}`;
    ctx.fillText('24H', w / 2, h / 2 - 10);
    ctx.fillStyle = '#e88d3e';
    ctx.font = `800 32px ${FONT_JP}`;
    ctx.fillText('年中無休', w / 2, h / 2 + 66);
  });
  const plate = new THREE.Mesh(
    new THREE.CircleGeometry(0.24, 32),
    new THREE.MeshBasicMaterial({ map: plateTex, transparent: true })
  );
  plate.position.set(1.425, 2.42, -1.7);
  plate.rotation.y = Math.PI / 2;
  signKit.add(plate);
  makeGlowSprite(0xffe2a8, 0.8, 1.48, 2.42, -1.7, 0.18, signKit);
}

// ------------------------------------------------------------
// Entrance canopy & warm downlights
// ------------------------------------------------------------
const canopyKit = kit('14-入口雨棚', 2.95, { fromY: -0.6, scaleFrom: 0.94 });
{
  box(canopyKit, M.wallCream, 2.18, 0.09, 1.08, 0.22, 2.88, -0.42, { outline: 0.01 });
  box(canopyKit, M.trimGreen, 2.18, 0.10, 0.1, 0.22, 2.87, 0.09, { outline: 0.006 });
  box(canopyKit, M.warmLightSoft, 1.8, 0.025, 0.8, 0.22, 2.826, -0.42, { cast: false, receive: false });
  // downlight discs
  cylinder(canopyKit, M.warmLight, 0.08, 0.08, 0.025, -0.32, 2.815, -0.35, { seg: 16, cast: false, receive: false });
  cylinder(canopyKit, M.warmLight, 0.08, 0.08, 0.025, 0.76, 2.815, -0.35, { seg: 16, cast: false, receive: false });
  // slim wall brackets that stay safely above the glass line
  box(canopyKit, M.metalDark, 0.05, 0.05, 0.22, -0.82, 2.61, -0.82, { cast: false });
  box(canopyKit, M.metalDark, 0.05, 0.05, 0.22, 1.26, 2.61, -0.82, { cast: false });
  // canopy edge light strip
  box(canopyKit, M.warmLight, 2.0, 0.015, 0.02, 0.22, 2.845, 0.088, { cast: false, receive: false });
  const canopyLight = new THREE.PointLight(0xffd9a0, 0.34, 3.2, 1.8);
  canopyLight.position.set(0.2, 2.55, -0.2);
  canopyKit.add(canopyLight);
}

// ------------------------------------------------------------
// Extra interior textures
// ------------------------------------------------------------
TEX.interiorBand = canvasTexture(1024, 180, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#fff9e8');
  g.addColorStop(1, '#f0e4c9');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2b7357';
  ctx.fillRect(0, 0, w, 12);
  ctx.fillRect(0, h - 18, w, 18);
  ctx.fillStyle = '#e88d3e';
  ctx.fillRect(0, h - 25, w, 7);
  ctx.fillStyle = '#2b7357';
  ctx.beginPath(); ctx.arc(88, 86, 45, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff9e9';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 28 : 11;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = 88 + Math.cos(a) * r;
    const py = 86 + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#244d3d';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `800 55px ${FONT_JP}`;
  ctx.fillText('星見マート', 155, 78);
  ctx.fillStyle = '#2b7357';
  ctx.font = `700 22px ${FONT_EN}`;
  ctx.fillText('HOSHIMI MART', 158, 122);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#e88d3e';
  ctx.font = `800 28px ${FONT_JP}`;
  ctx.fillText('いつも、すぐそばに。', w - 55, 86);
  ctx.fillStyle = '#6b604c';
  ctx.font = `600 19px ${FONT_EN}`;
  ctx.fillText('FRESH FOOD  ·  DAILY GOODS  ·  ATM', w - 55, 124);
});

TEX.priceTag = canvasTexture(256, 128, (ctx, w, h) => {
  ctx.fillStyle = '#fffdf4';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#d9cfb4';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, w - 4, h - 4);
  ctx.fillStyle = '#2b7357';
  ctx.font = `900 52px ${FONT_EN}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('¥128', w / 2, 48);
  ctx.fillStyle = '#e88d3e';
  ctx.font = `700 26px ${FONT_JP}`;
  ctx.fillText('税込', w / 2, 96);
});

function magazineCover(title, sub, bg, accent) {
  return canvasTexture(256, 384, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 22, h);
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.beginPath();
    ctx.moveTo(38, 190);
    ctx.bezierCurveTo(52, 100, 160, 62, 214, 108);
    ctx.bezierCurveTo(236, 184, 200, 276, 96, 286);
    ctx.bezierCurveTo(62, 266, 44, 228, 38, 190);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(25,30,36,0.32)';
    ctx.beginPath();
    ctx.ellipse(132, 212, 45, 70, 0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.fillRect(36, 26, 180, 58);
    ctx.fillStyle = '#fffdf6';
    ctx.font = `900 34px ${FONT_JP}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, 132, 56);
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.fillRect(34, 300, 188, 52);
    ctx.fillStyle = '#3b3b3b';
    ctx.font = `800 22px ${FONT_EN}`;
    ctx.fillText(sub, 128, 326);
    ctx.fillStyle = accent;
    ctx.font = `700 16px ${FONT_JP}`;
    ctx.fillText('今月の特集', 128, 365);
  });
}
TEX.mags = [
  magazineCover('夏の旅', 'SUMMER TRIP', '#e8d6b1', '#d15d45'),
  magazineCover('週末', 'WEEKEND', '#c7dbe2', '#39718a'),
  magazineCover('料理', 'COOKING', '#e9dcc6', '#b2783c'),
  magazineCover('アニメ', 'ANIME', '#d7c9e6', '#7456a4'),
  magazineCover('クルマ', 'CAR LIFE', '#d6d9dc', '#4a5967'),
  magazineCover('ファッション', 'FASHION', '#e5cfd0', '#a64c5c'),
];

TEX.clock = canvasTexture(256, 256, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#f7f2e4';
  ctx.beginPath(); ctx.arc(w / 2, h / 2, 116, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#2b5c4b'; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(w / 2, h / 2, 109, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#3b443f';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const r1 = i % 3 === 0 ? 82 : 92;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(a);
    ctx.fillRect(-3, -r1, 6, 22);
    ctx.restore();
  }
  ctx.strokeStyle = '#2b3b36';
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(w / 2, h / 2); ctx.lineTo(w / 2 + 32, h / 2 - 42); ctx.stroke();
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(w / 2, h / 2); ctx.lineTo(w / 2 - 54, h / 2 + 5); ctx.stroke();
  ctx.fillStyle = '#e88d3e';
  ctx.beginPath(); ctx.arc(w / 2, h / 2, 8, 0, TAU); ctx.fill();
});

TEX.atm = canvasTexture(512, 1024, (ctx, w, h) => {
  ctx.fillStyle = '#d9d5c9';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2b7357';
  ctx.fillRect(0, 0, w, 120);
  ctx.fillStyle = '#fffdf2';
  ctx.font = `900 56px ${FONT_EN}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ATM', w / 2, 60);
  ctx.fillStyle = '#182129';
  roundRect(ctx, 48, 156, w - 96, 346, 18);
  ctx.fill();
  ctx.fillStyle = '#8fe8dc';
  ctx.textAlign = 'left';
  ctx.font = `700 30px ${FONT_JP}`;
  ctx.fillText('いらっしゃいませ', 84, 208);
  ctx.fillStyle = '#d9fbff';
  ctx.font = `900 66px ${FONT_EN}`;
  ctx.fillText('¥ 10,000', 84, 284);
  ctx.fillStyle = 'rgba(255,255,255,0.24)';
  ctx.fillRect(84, 328, 320, 3);
  ctx.fillStyle = '#b9f8ef';
  ctx.font = `600 25px ${FONT_JP}`;
  ctx.fillText('お引き出し  ·  お預け入れ', 84, 378);
  ctx.fillStyle = '#b9f8ef';
  ctx.fillRect(84, 420, 320, 48);
  ctx.fillStyle = '#083a34';
  ctx.font = `800 32px ${FONT_JP}`;
  ctx.textAlign = 'center';
  ctx.fillText('暗証番号を入力', w / 2, 445);
  ctx.fillStyle = '#313a42';
  roundRect(ctx, 72, 548, 368, 172, 12);
  ctx.fill();
  const keys = ['1','2','3','4','5','6','7','8','9','*','0','#'];
  keys.forEach((k, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    ctx.fillStyle = '#e6e2d5';
    roundRect(ctx, 98 + col * 112, 570 + row * 36, 88, 27, 5);
    ctx.fill();
    ctx.fillStyle = '#3f4548';
    ctx.font = `700 18px ${FONT_EN}`;
    ctx.textAlign = 'center';
    ctx.fillText(k, 142 + col * 112, 584 + row * 36);
  });
  ctx.fillStyle = '#2b3036';
  roundRect(ctx, 76, 770, 360, 80, 10);
  ctx.fill();
  ctx.fillStyle = '#0c1217';
  ctx.fillRect(104, 796, 304, 26);
  ctx.fillStyle = '#d9d5c9';
  ctx.font = `700 24px ${FONT_JP}`;
  ctx.textAlign = 'center';
  ctx.fillText('ご利用ありがとうございました', w / 2, 918);
});

TEX.posterChicken = canvasTexture(512, 720, (ctx, w, h) => {
  ctx.fillStyle = '#f3e4c9';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#d96832';
  ctx.fillRect(0, 0, w, 150);
  ctx.fillStyle = '#fff9e8';
  ctx.font = `900 76px ${FONT_JP}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('からあげ', w / 2, 76);
  ctx.fillStyle = '#c38132';
  roundRect(ctx, 70, 205, 372, 250, 60);
  ctx.fill();
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = ['#e3a23a', '#c87e27', '#f0b84b'][i % 3];
    ctx.beginPath();
    ctx.ellipse(130 + i * 63, 300 + (i % 2) * 55, 45, 35, 0.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,245,210,0.65)';
    ctx.beginPath(); ctx.arc(118 + i * 63, 288 + (i % 2) * 55, 12, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = '#5f3b20';
  ctx.font = `800 44px ${FONT_JP}`;
  ctx.fillText('揚げたて 100円', w / 2, 535);
  ctx.fillStyle = '#e88d3e';
  ctx.font = `700 27px ${FONT_JP}`;
  ctx.fillText('ホットスナック 好評発売中', w / 2, 595);
  ctx.fillStyle = '#2b7357';
  ctx.fillRect(0, 660, w, 60);
  ctx.fillStyle = '#fff9e8';
  ctx.font = `700 24px ${FONT_JP}`;
  ctx.fillText('HOSHIMI MART', w / 2, 690);
});

TEX.posterCoffee = canvasTexture(512, 720, (ctx, w, h) => {
  ctx.fillStyle = '#f2eadc';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#5e4131';
  ctx.fillRect(0, 0, w, 120);
  ctx.fillStyle = '#fff8ea';
  ctx.font = `900 58px ${FONT_JP}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('淹れたてコーヒー', w / 2, 62);
  // cup
  ctx.fillStyle = '#e8ddc7';
  roundRect(ctx, 128, 216, 256, 230, 36);
  ctx.fill();
  ctx.fillStyle = '#7b5033';
  ctx.beginPath(); ctx.ellipse(256, 228, 108, 32, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#e8ddc7';
  ctx.lineWidth = 30;
  ctx.beginPath(); ctx.arc(388, 318, 74, -1.1, 1.1); ctx.stroke();
  // steam
  ctx.strokeStyle = 'rgba(255,255,255,0.52)';
  ctx.lineWidth = 10;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(206 + i * 50, 198);
    ctx.bezierCurveTo(186 + i * 50, 160, 230 + i * 50, 145, 208 + i * 50, 112);
    ctx.stroke();
  }
  ctx.fillStyle = '#5e4131';
  ctx.font = `800 44px ${FONT_JP}`;
  ctx.fillText('HOT  COFFEE', w / 2, 525);
  ctx.fillStyle = '#a35a2e';
  ctx.font = `700 28px ${FONT_JP}`;
  ctx.fillText('S  ¥100  /  M  ¥150', w / 2, 585);
  ctx.fillStyle = '#2b7357';
  ctx.fillRect(0, 660, w, 60);
  ctx.fillStyle = '#fff9e8';
  ctx.font = `700 24px ${FONT_JP}`;
  ctx.fillText('毎朝ひきたて', w / 2, 690);
});

TEX.posterOden = canvasTexture(512, 720, (ctx, w, h) => {
  ctx.fillStyle = '#f1e3ca';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#9e3f33';
  ctx.fillRect(0, 0, w, 132);
  ctx.fillStyle = '#fff7e5';
  ctx.font = `900 62px ${FONT_JP}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('おでん', w / 2, 68);
  ctx.fillStyle = '#bf7943';
  ctx.beginPath(); ctx.ellipse(256, 360, 168, 120, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#8e542f';
  ctx.beginPath(); ctx.ellipse(256, 356, 135, 91, 0, 0, TAU); ctx.fill();
  const items = ['#e3b968', '#d8c48e', '#b36a35', '#efe0b2', '#c78b4d'];
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = items[i % items.length];
    ctx.beginPath();
    ctx.ellipse(150 + i * 43, 340 + (i % 3) * 32, 34, 25, 0.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#d9b47a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(150 + i * 43, 340 + (i % 3) * 32);
    ctx.lineTo(178 + i * 43, 290 + (i % 3) * 32);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 9;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(210 + i * 45, 210);
    ctx.bezierCurveTo(190 + i * 45, 175, 235 + i * 45, 155, 215 + i * 45, 120);
    ctx.stroke();
  }
  ctx.fillStyle = '#9e3f33';
  ctx.font = `800 42px ${FONT_JP}`;
  ctx.fillText('あったか 80円〜', w / 2, 548);
  ctx.fillStyle = '#2b7357';
  ctx.fillRect(0, 660, w, 60);
  ctx.fillStyle = '#fff9e8';
  ctx.font = `700 24px ${FONT_JP}`;
  ctx.fillText('冬の定番', w / 2, 690);
});

TEX.caution = canvasTexture(256, 320, (ctx, w, h) => {
  ctx.fillStyle = '#e9b83d';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#22262c';
  ctx.fillRect(14, 14, w - 28, h - 28);
  ctx.fillStyle = '#f2cd55';
  ctx.beginPath();
  ctx.moveTo(w / 2, 42); ctx.lineTo(w - 50, 170); ctx.lineTo(50, 170); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#22262c';
  ctx.font = `900 72px ${FONT_EN}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', w / 2, 126);
  ctx.fillStyle = '#f4e5b5';
  ctx.font = `800 28px ${FONT_JP}`;
  ctx.fillText('足元注意', w / 2, 220);
  ctx.font = `700 22px ${FONT_JP}`;
  ctx.fillText('WET FLOOR', w / 2, 258);
});

TEX.salePoster = canvasTexture(512, 512, (ctx, w, h) => {
  ctx.fillStyle = '#f7efdd';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#d95743';
  ctx.fillRect(0, 0, w, 80);
  ctx.fillStyle = '#fffdf2';
  ctx.font = `900 49px ${FONT_JP}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('新発売', w / 2, 42);
  ctx.fillStyle = '#2b7357';
  ctx.font = `900 62px ${FONT_JP}`;
  ctx.fillText('限定', w / 2, 150);
  ctx.fillStyle = '#e8b74f';
  ctx.beginPath(); ctx.arc(w / 2, 300, 110, 0, TAU); ctx.fill();
  ctx.fillStyle = '#d95743';
  ctx.beginPath(); ctx.arc(w / 2, 300, 82, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fffdf2';
  ctx.font = `900 35px ${FONT_EN}`;
  ctx.fillText('NEW', w / 2, 288);
  ctx.font = `800 26px ${FONT_JP}`;
  ctx.fillText('おにぎり', w / 2, 330);
  ctx.fillStyle = '#5b5343';
  ctx.font = `700 22px ${FONT_JP}`;
  ctx.fillText('梅・鮭・ツナマヨ', w / 2, 452);
  ctx.fillStyle = '#d95743';
  ctx.font = `800 20px ${FONT_JP}`;
  ctx.fillText('期間限定', w / 2, 488);
});

const PRODUCT_MATS = new Map();
function productMat(color) {
  if (!PRODUCT_MATS.has(color)) {
    PRODUCT_MATS.set(color, toon(color, { soft: true, emissive: color, emissiveIntensity: 0.3 }));
  }
  return PRODUCT_MATS.get(color);
}

function addProduct(parent, x, y, z, kind, color, scale = 1) {
  const mat = productMat(color);
  if (kind === 'can') {
    const m = cylinder(parent, mat, 0.048 * scale, 0.048 * scale, 0.18 * scale, x, y + 0.09 * scale, z, { seg: 10, cast: false });
    const cap = basic(0xe9e4d8);
    cylinder(parent, cap, 0.049 * scale, 0.049 * scale, 0.012, x, y + 0.184 * scale, z, { seg: 10, cast: false, receive: false });
    return m;
  }
  if (kind === 'bottle') {
    cylinder(parent, mat, 0.043 * scale, 0.052 * scale, 0.2 * scale, x, y + 0.1 * scale, z, { seg: 10, cast: false });
    cylinder(parent, basic(0xf1eee3), 0.022, 0.028, 0.06 * scale, x, y + 0.23 * scale, z, { seg: 8, cast: false, receive: false });
    return;
  }
  if (kind === 'bag') {
    box(parent, mat, 0.15 * scale, 0.22 * scale, 0.07 * scale, x, y + 0.11 * scale, z, {
      cast: false,
      receive: false,
      ry: rand(-0.14, 0.14),
      outline: 0.006,
    });
    return;
  }
  box(parent, mat, 0.14 * scale, 0.17 * scale, 0.1 * scale, x, y + 0.085 * scale, z, {
    cast: false,
    receive: false,
    ry: rand(-0.1, 0.1),
  });
}

// ------------------------------------------------------------
// Store interior shell
// ------------------------------------------------------------
const interiorKit = kit('20-店内空间', 1.5, { fromY: -1.0, scaleFrom: 0.98 });
{
  // tiled floor
  plane(interiorKit, M.interiorFloor, STORE_W - 0.25, STORE_D - 0.2, STORE_CX, 0.172, -3.43, {
    receive: false,
    renderOrder: 1,
  });
  // ceiling
  box(interiorKit, M.ceiling, STORE_W - 0.28, 0.06, STORE_D - 0.24, STORE_CX, 3.1, -3.43, {
    cast: false,
    receive: false,
  });
  // ceiling shadow reveal
  box(interiorKit, M.wallShadow, STORE_W - 0.3, 0.07, 0.08, STORE_CX, 3.05, -0.99, { cast: false });
  // back wall wainscot / brand band
  box(interiorKit, M.interiorWallCool, 5.55, 0.55, 0.04, STORE_CX, 0.47, -5.79, { cast: false });
  texturedPlane(interiorKit, TEX.interiorBand, 5.35, 0.55, STORE_CX, 2.75, -5.786);
  // side wall trims
  box(interiorKit, M.trimGreen, 0.03, 0.12, 4.75, -4.57, 0.45, -3.43, { cast: false });
  box(interiorKit, M.trimGreen, 0.03, 0.12, 4.75, 0.985, 0.45, -3.43, { cast: false });
  // left wall poster set
  texturedPlane(interiorKit, TEX.posterChicken, 0.76, 1.06, -4.585, 1.91, -2.12, { ry: Math.PI / 2, toneMapped: true });
  texturedPlane(interiorKit, TEX.posterCoffee, 0.66, 0.93, -4.585, 1.82, -3.22, { ry: Math.PI / 2, toneMapped: true });
  texturedPlane(interiorKit, TEX.clock, 0.42, 0.42, -4.578, 2.66, -2.65, { ry: Math.PI / 2, transparent: true });
  // back wall clock area / little notices
  texturedPlane(interiorKit, TEX.posterOden, 0.62, 0.87, -4.585, 1.72, -4.3, { ry: Math.PI / 2, toneMapped: true });
  // ceiling cross beams
  for (let i = 0; i < 3; i++) {
    box(interiorKit, M.wallShadow, 5.45, 0.11, 0.09, STORE_CX, 3.035, -2.0 - i * 1.35, { cast: false });
  }
  // interior lights (no shadows, warm)
  const l1 = new THREE.PointLight(0xffb46a, 0.92, 6.0, 1.8);
  l1.position.set(-3.25, 2.72, -2.25);
  interiorKit.add(l1);
  const l2 = new THREE.PointLight(0xffb46a, 0.82, 6.0, 1.8);
  l2.position.set(-0.35, 2.66, -3.3);
  interiorKit.add(l2);
  const l3 = new THREE.PointLight(0xffd79a, 0.62, 5.0, 1.8);
  l3.position.set(-2.2, 2.55, -4.9);
  interiorKit.add(l3);
  // ceiling light trays
  const panelPositions = [
    [-3.35, -2.1], [-1.85, -2.1], [-0.35, -2.1],
    [-3.35, -3.9], [-1.85, -3.9], [-0.35, -3.9],
    [-2.6, -5.1], [-0.8, -5.1],
  ];
  panelPositions.forEach(([x, z]) => {
    box(interiorKit, M.shelfMetal, 1.05, 0.035, 0.44, x, 3.072, z, { cast: false, receive: false });
    box(interiorKit, M.warmLight, 0.92, 0.022, 0.35, x, 3.051, z, { cast: false, receive: false });
    makeGlowSprite(0xffedc4, 0.55, x, 2.99, z, 0.12, interiorKit);
  });
}

// ------------------------------------------------------------
// Refrigerator wall
// ------------------------------------------------------------
const fridgeKit = kit('21-冷藏饮料柜', 1.78, { fromY: -0.8, scaleFrom: 0.94 });
{
  const centers = [-3.62, -2.47, -1.32, -0.17];
  centers.forEach((cx, idx) => {
    // cabinet body
    box(fridgeKit, M.fridgeFrame, 1.07, 2.24, 0.66, cx, 1.29, -5.43, { outline: 0.008 });
    // glowing stocked interior
    texturedPlane(fridgeKit, TEX.fridge, 0.99, 2.08, cx, 1.29, -5.088, { toneMapped: false });
    // glass door
    plane(fridgeKit, M.glass, 1.0, 2.08, cx, 1.29, -5.066, { rx: 0, receive: false });
    // door frames
    box(fridgeKit, M.fridgeDark, 0.045, 2.1, 0.05, cx - 0.52, 1.29, -5.06, { cast: false });
    box(fridgeKit, M.fridgeDark, 0.045, 2.1, 0.05, cx + 0.52, 1.29, -5.06, { cast: false });
    box(fridgeKit, M.fridgeDark, 1.05, 0.05, 0.05, cx, 2.32, -5.06, { cast: false });
    box(fridgeKit, M.fridgeDark, 1.05, 0.06, 0.05, cx, 0.26, -5.06, { cast: false });
    box(fridgeKit, M.fridgeDark, 0.035, 2.0, 0.04, cx, 1.29, -5.055, { cast: false });
    // handles
    cylinder(fridgeKit, M.metalLight, 0.016, 0.016, 0.7, cx - 0.08, 1.27, -5.015, { seg: 8 });
    cylinder(fridgeKit, M.metalLight, 0.016, 0.016, 0.7, cx + 0.08, 1.27, -5.015, { seg: 8 });
    // header lightbox
    box(fridgeKit, M.trimGreen, 1.06, 0.18, 0.07, cx, 2.48, -5.05, { cast: false });
    box(fridgeKit, M.warmLight, 0.96, 0.12, 0.015, cx, 2.48, -5.009, { cast: false, receive: false });
    const headerTex = canvasTexture(512, 80, (ctx, w, h) => {
      ctx.fillStyle = '#fff9e9';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2b7357';
      ctx.font = `800 38px ${FONT_JP}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(idx % 2 === 0 ? 'つめたい飲料' : 'COLD DRINKS', w / 2, h / 2);
    });
    texturedPlane(fridgeKit, headerTex, 0.94, 0.12, cx, 2.48, -5.0);
    // glass reflection
    const gl = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 1.4),
      new THREE.MeshBasicMaterial({
        color: 0xd8f7ff,
        transparent: true,
        opacity: 0.055,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    gl.position.set(cx - 0.22, 1.4, -5.045);
    gl.rotation.z = 0.12;
    fridgeKit.add(gl);
  });
  // top sign / brand strip above fridges
  box(fridgeKit, M.trimGreen, 5.25, 0.18, 0.06, -1.895, 2.67, -5.68, { cast: false });
  const coldTex = canvasTexture(1024, 100, (ctx, w, h) => {
    ctx.fillStyle = '#2b7357';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff9e9';
    ctx.font = `800 46px ${FONT_EN}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('COLD  DRINKS  ·  ICE  CREAM  ·  24H', w / 2, h / 2);
  });
  texturedPlane(fridgeKit, coldTex, 5.15, 0.48, -1.895, 2.94, -5.77);
}

// ------------------------------------------------------------
// Gondola shelves and products
// ------------------------------------------------------------
function buildGondola(parent, cx, cz, width) {
  const topY = 1.47;
  // base plinth
  box(parent, M.shelfWhite, width + 0.08, 0.16, 0.84, cx, 0.25, cz, { outline: 0.008 });
  box(parent, M.trimGreen, width + 0.06, 0.035, 0.86, cx, 0.335, cz, { cast: false });
  // end frames
  box(parent, M.shelfFrame, 0.08, 1.4, 0.8, cx - width / 2, 0.87, cz, { outline: 0.007 });
  box(parent, M.shelfFrame, 0.08, 1.4, 0.8, cx + width / 2, 0.87, cz, { outline: 0.007 });
  // back / centre spine
  box(parent, M.shelfBack, width + 0.02, 1.32, 0.07, cx, 0.86, cz, { cast: false });
  // shelf boards
  const levels = [0.48, 0.78, 1.08, 1.38];
  levels.forEach((y) => {
    box(parent, M.shelfWhite, width + 0.02, 0.045, 0.78, cx, y, cz, { cast: false });
    box(parent, M.trimGreen, width + 0.02, 0.022, 0.02, cx, y - 0.036, cz + 0.395, { cast: false });
    box(parent, M.trimGreen, width + 0.02, 0.022, 0.02, cx, y - 0.036, cz - 0.395, { cast: false });
    // warm shelf-edge light strips make the merchandise read from the street
    box(parent, M.warmLight, width - 0.1, 0.012, 0.012, cx, y - 0.052, cz + 0.405, { cast: false, receive: false });
    box(parent, M.warmLight, width - 0.1, 0.012, 0.012, cx, y - 0.052, cz - 0.405, { cast: false, receive: false });
  });
  const columns = 8;
  const step = (width - 0.25) / columns;
  levels.forEach((y, li) => {
    for (let side = -1; side <= 1; side += 2) {
      for (let c = 0; c < columns; c++) {
        const px = cx - width / 2 + 0.16 + c * step + rand(-0.012, 0.012);
        const pz = cz + side * 0.225;
        const kindRoll = Math.random();
        const kind = kindRoll < 0.38 ? 'can' : kindRoll < 0.66 ? 'bottle' : kindRoll < 0.86 ? 'bag' : 'box';
        const color = M.productColors[Math.floor(Math.random() * M.productColors.length)];
        const scale = 0.9 + Math.random() * 0.26;
        addProduct(parent, px, y + 0.026, pz, kind, color, scale);
        if (Math.random() > 0.55) {
          const color2 = M.productColors[Math.floor(Math.random() * M.productColors.length)];
          addProduct(parent, px + 0.075, y + 0.026, pz + (side > 0 ? -0.065 : 0.065), 'can', color2, 0.82);
        }
      }
    }
    // price tags on the front rail
    for (let c = 0; c < 4; c++) {
      const px = cx - width / 2 + 0.35 + c * ((width - 0.55) / 4);
      texturedPlane(parent, TEX.priceTag, 0.19, 0.095, px, y - 0.06, cz + 0.408, { transparent: true });
    }
  });
  // promotional topper
  const topper = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85, 0.28),
    new THREE.MeshBasicMaterial({ map: TEX.salePoster, transparent: true, opacity: 0.94, side: THREE.DoubleSide })
  );
  topper.position.set(cx - width / 2 + 0.58, topY + 0.22, cz);
  topper.rotation.y = 0.05;
  parent.add(topper);
  box(parent, M.cardboard, 0.34, 0.2, 0.28, cx + width / 2 - 0.35, topY + 0.19, cz, {
    outline: 0.008,
    cast: false,
  });
  // small top signage
  const topSignTex = canvasTexture(256, 96, (ctx, w, h) => {
    ctx.fillStyle = '#fff9e9';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2b7357';
    ctx.fillRect(0, h - 18, w, 18);
    ctx.fillStyle = '#d95743';
    ctx.font = `900 32px ${FONT_JP}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('おすすめ', w / 2, 36);
  });
  texturedPlane(parent, topSignTex, 0.58, 0.22, cx + width / 2 - 0.35, topY + 0.36, cz + 0.02);
}

const shelfAKit = kit('22-货架A与商品', 1.98, { fromY: -0.75, scaleFrom: 0.94, duration: 0.8 });
buildGondola(shelfAKit, -2.45, -2.55, 2.95);
const shelfBKit = kit('23-货架B与商品', 2.16, { fromY: -0.75, scaleFrom: 0.94, duration: 0.8 });
buildGondola(shelfBKit, -2.5, -3.62, 2.8);

// ------------------------------------------------------------
// Checkout counter + hot food + coffee
// ------------------------------------------------------------
const counterKit = kit('24-收银台', 2.28, { fromY: -0.7, scaleFrom: 0.94 });
{
  // L-shaped counter, main run across the shop
  box(counterKit, M.wallCream, 1.62, 0.92, 0.66, -0.1, 0.63, -2.82, { outline: 0.009 });
  box(counterKit, M.trimGreen, 1.64, 0.09, 0.68, -0.1, 0.58, -2.82, { cast: false });
  box(counterKit, M.wood, 1.74, 0.07, 0.78, -0.1, 1.12, -2.82, { outline: 0.006 });
  // side run along the right wall
  box(counterKit, M.wallCream, 0.58, 0.92, 1.25, 0.62, 0.63, -3.35, { outline: 0.009 });
  box(counterKit, M.trimGreen, 0.6, 0.09, 1.27, 0.62, 0.58, -3.35, { cast: false });
  box(counterKit, M.wood, 0.7, 0.07, 1.35, 0.62, 1.12, -3.35, { outline: 0.006 });
  // under-counter service panel + step
  box(counterKit, M.metalDark, 0.38, 0.14, 0.55, -0.1, 0.3, -2.47, { cast: false });
  // register
  box(counterKit, M.metalDark, 0.4, 0.34, 0.3, -0.2, 1.32, -2.72, { outline: 0.008 });
  const screenTex = canvasTexture(256, 192, (ctx, w, h) => {
    ctx.fillStyle = '#0a1a20';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#88f4e4';
    ctx.font = `700 20px ${FONT_JP}`;
    ctx.fillText('星見マート', 18, 36);
    ctx.fillStyle = '#d9fff8';
    ctx.font = `900 36px ${FONT_EN}`;
    ctx.fillText('¥ 1,280', 18, 92);
    ctx.fillStyle = '#6bd7c6';
    ctx.fillRect(18, 112, 90, 8);
    ctx.fillRect(18, 130, 140, 8);
    ctx.fillRect(18, 148, 62, 8);
    ctx.fillStyle = '#ffb969';
    ctx.font = `700 16px ${FONT_JP}`;
    ctx.fillText('お会計ありがとう', 18, 178);
  });
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.36, 0.26),
    new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false })
  );
  screen.position.set(-0.2, 1.57, -2.56);
  screen.rotation.x = -0.12;
  counterKit.add(screen);
  box(counterKit, M.metalDark, 0.2, 0.06, 0.14, -0.2, 1.52, -2.87, { cast: false });
  // card terminal
  box(counterKit, M.metalLight, 0.14, 0.18, 0.1, 0.1, 1.25, -2.58, { outline: 0.006, cast: false });
  box(counterKit, M.neonGreen, 0.06, 0.025, 0.065, 0.1, 1.33, -2.52, { cast: false, receive: false });
  // hot snack case
  const hotX = 0.37;
  const hotZ = -2.72;
  box(counterKit, M.metalDark, 0.62, 0.05, 0.56, hotX, 1.17, hotZ, { cast: false });
  box(counterKit, M.metalDark, 0.62, 0.05, 0.56, hotX, 1.55, hotZ, { cast: false });
  box(counterKit, M.glass, 0.58, 0.34, 0.52, hotX, 1.36, hotZ, { cast: false, receive: false });
  texturedPlane(counterKit, TEX.hotCase, 0.57, 0.29, hotX, 1.36, hotZ + 0.267, { toneMapped: false });
  // glow on the hot case
  makeGlowSprite(0xffb75f, 0.65, hotX, 1.43, hotZ + 0.06, 0.18, counterKit);
  // coffee machine
  box(counterKit, M.wallCream, 0.46, 0.66, 0.4, 0.42, 1.52, -3.45, { outline: 0.008 });
  box(counterKit, M.metalDark, 0.32, 0.22, 0.03, 0.42, 1.7, -3.24, { cast: false });
  box(counterKit, M.neonBlue, 0.22, 0.12, 0.01, 0.42, 1.7, -3.22, { cast: false, receive: false, transparent: true, opacity: 0.9 });
  box(counterKit, M.metalLight, 0.1, 0.06, 0.1, 0.42, 1.24, -3.23, { cast: false });
  cylinder(counterKit, M.wallCream, 0.055, 0.045, 0.1, 0.42, 1.18, -3.23, { seg: 10, cast: false });
  // cup stack
  for (let i = 0; i < 4; i++) {
    cylinder(counterKit, M.wallCream, 0.035, 0.03, 0.055, 0.62, 1.18 + i * 0.055, -2.95, { seg: 8, cast: false });
  }
  // oden pot
  cylinder(counterKit, M.metalLight, 0.22, 0.18, 0.15, -0.55, 1.23, -2.62, { seg: 16, cast: false });
  cylinder(counterKit, toon(0x7a4c2c), 0.2, 0.2, 0.02, -0.55, 1.315, -2.62, { seg: 16, cast: false, receive: false });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    sphere(counterKit, toon(i % 2 ? 0xd8b168 : 0xc98d4d), 0.04, -0.55 + Math.cos(a) * 0.09, 1.335, -2.62 + Math.sin(a) * 0.09, { seg: 8, cast: false });
  }
  // receipt printer, trays, small props
  box(counterKit, M.metalDark, 0.22, 0.14, 0.24, -0.52, 1.23, -2.95, { cast: false });
  box(counterKit, M.paper, 0.12, 0.01, 0.3, -0.52, 1.31, -2.84, { cast: false, receive: false, ry: 0.15 });
  box(counterKit, M.cardboard, 0.25, 0.08, 0.2, -0.1, 1.2, -2.45, { cast: false });
  // under-counter warm light strip
  box(counterKit, M.warmLight, 1.55, 0.025, 0.015, -0.1, 0.48, -2.485, { cast: false, receive: false });
  // anti-slip mat on floor behind counter
  plane(counterKit, toon(0x3b4850), 1.4, 0.5, 0.2, 0.174, -3.58, { receive: false });
}

// ------------------------------------------------------------
// Magazine rack, ATM, baskets, back counter
// ------------------------------------------------------------
const detailKit = kit('25-杂志架与ATM', 2.4, { fromY: -0.7, scaleFrom: 0.93 });
{
  // magazine rack facing the front glass
  const rx = -3.55;
  const rz = -1.43;
  box(detailKit, M.shelfFrame, 1.55, 0.88, 0.34, rx, 0.61, rz, { outline: 0.008 });
  box(detailKit, M.trimGreen, 1.57, 0.04, 0.36, rx, 0.24, rz, { cast: false });
  const tiers = [0.38, 0.62, 0.86, 1.1];
  tiers.forEach((y, ti) => {
    box(detailKit, M.shelfWhite, 1.5, 0.035, 0.3, rx, y - 0.04, rz + 0.1, { cast: false });
    for (let c = 0; c < 4; c++) {
      const cover = TEX.mags[(ti * 4 + c) % TEX.mags.length];
      const w = 0.26;
      const h = 0.3;
      const px = rx - 0.59 + c * 0.39;
      texturedPlane(detailKit, cover, w, h, px, y + 0.13, rz + 0.176, { toneMapped: true });
      box(detailKit, M.paper, w, 0.012, 0.02, px, y - 0.015, rz + 0.172, { cast: false });
    }
    box(detailKit, M.metalLight, 1.48, 0.018, 0.018, rx, y + 0.02, rz + 0.285, { cast: false });
  });
  // little hanging sign above magazines
  const magSign = canvasTexture(512, 110, (ctx, w, h) => {
    ctx.fillStyle = '#fff9e9'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2b7357'; ctx.fillRect(0, 0, w, 12); ctx.fillRect(0, h - 12, w, 12);
    ctx.fillStyle = '#244d3d'; ctx.font = `800 42px ${FONT_JP}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('雑誌・コミック', w / 2, 55);
  });
  texturedPlane(detailKit, magSign, 1.2, 0.26, rx, 1.42, rz + 0.1);

  // ATM at the back left
  box(detailKit, M.wallCream, 0.74, 1.62, 0.5, -4.14, 0.98, -4.72, { outline: 0.01 });
  texturedPlane(detailKit, TEX.atm, 0.68, 1.5, -4.14, 0.98, -4.465, { toneMapped: false });
  box(detailKit, M.trimGreen, 0.74, 0.1, 0.52, -4.14, 1.86, -4.72, { outline: 0.006 });
  makeGlowSprite(0x8beedd, 0.9, -4.14, 1.82, -4.3, 0.13, detailKit);

  // blue shopping baskets by the door
  for (let i = 0; i < 4; i++) {
    box(detailKit, M.bluePlastic, 0.4, 0.11, 0.3, -0.92, 0.24 + i * 0.085, -1.32, {
      outline: 0.006,
      cast: false,
    });
  }
  // wire basket handle
  barBetween(detailKit, M.metalDark, [-1.08, 0.56, -1.33], [-0.96, 0.68, -1.33], 0.012);
  barBetween(detailKit, M.metalDark, [-0.76, 0.56, -1.33], [-0.88, 0.68, -1.33], 0.012);

  // wet-floor caution sign
  const cg = new THREE.Group();
  cg.position.set(-0.05, SIDEWALK_TOP + 0.01, -1.32);
  const cautionMat = new THREE.MeshBasicMaterial({ map: TEX.caution, side: THREE.DoubleSide });
  const signA = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), cautionMat);
  signA.position.set(0, 0.52, 0.02);
  signA.rotation.x = -0.2;
  cg.add(signA);
  const signB = signA.clone();
  signB.position.z = -0.02;
  signB.rotation.x = -0.2;
  signB.rotation.y = Math.PI;
  cg.add(signB);
  barBetween(cg, M.metalLight, [-0.12, 0.03, 0], [0.12, 0.03, 0], 0.012);
  detailKit.add(cg);

  // back prep cabinet + microwave glow
  box(detailKit, M.shelfFrame, 1.25, 0.92, 0.48, 0.18, 0.62, -4.1, { outline: 0.008 });
  box(detailKit, M.wood, 1.32, 0.06, 0.54, 0.18, 1.1, -4.1, { cast: false });
  box(detailKit, M.metalDark, 0.48, 0.33, 0.35, -0.15, 1.31, -4.13, { outline: 0.008 });
  box(detailKit, basic(0xffd586), 0.2, 0.22, 0.01, -0.22, 1.3, -3.945, { cast: false, receive: false });
  box(detailKit, M.metalDark, 0.08, 0.03, 0.03, 0.05, 1.31, -3.945, { cast: false });
  // coffee cup tower
  for (let i = 0; i < 6; i++) {
    cylinder(detailKit, M.wallCream, 0.04, 0.034, 0.06, 0.5, 1.14 + i * 0.052, -4.18, { seg: 8, cast: false });
  }
  // colorful in-window sale poster (built after the texture library is ready)
  texturedPlane(detailKit, TEX.salePoster, 0.62, 0.62, -3.66, 1.7, -0.918, {
    transparent: true,
    opacity: 0.97,
  });
  // neon OPEN sign inside the right-hand door glass
  const openNeon = new THREE.Mesh(
    new THREE.PlaneGeometry(0.56, 0.197),
    new THREE.MeshBasicMaterial({
      map: TEX.neonOpen,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  );
  openNeon.position.set(0.64, 1.54, -1.02);
  openNeon.userData.rainOnly = true;
  detailKit.add(openNeon);
  makeGlowSprite(0xff6e96, 0.8, 0.64, 1.54, -1.0, 0.2, detailKit);
  // cyan ATM neon above the left window line
  const atmNeon = new THREE.Mesh(
    new THREE.PlaneGeometry(0.56, 0.22),
    new THREE.MeshBasicMaterial({
      map: TEX.neonATM,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  );
  atmNeon.position.set(-3.72, 2.3, -1.02);
  atmNeon.userData.rainOnly = true;
  detailKit.add(atmNeon);
  makeGlowSprite(0x67eaff, 0.9, -3.72, 2.3, -1.0, 0.22, detailKit);
  // small warm pendant lamps inside the glazed frontage
  [-3.35, -1.92, -0.55].forEach((x) => {
    barBetween(detailKit, M.metalDark, [x, 3.05, -1.25], [x, 2.58, -1.25], 0.008);
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 0.17, 12, 1, true),
      toon(0x344c43, { side: THREE.DoubleSide })
    );
    shade.position.set(x, 2.52, -1.25);
    detailKit.add(shade);
    sphere(detailKit, M.warmLight, 0.045, x, 2.47, -1.25, { seg: 8, cast: false });
    makeGlowSprite(0xffca85, 0.65, x, 2.46, -1.23, 0.2, detailKit);
  });
  // wall-mounted cigarette display facing the shop
  box(detailKit, M.trimGreen, 0.82, 1.18, 0.08, 0.58, 1.74, -4.68, { outline: 0.008 });
  texturedPlane(detailKit, TEX.cigarette, 0.76, 1.08, 0.58, 1.74, -4.634, { toneMapped: true });
  box(detailKit, M.metalDark, 0.72, 0.04, 0.12, 0.58, 2.34, -4.61, { cast: false });
  // small "COFFEE" sign
  const coffeeSign = canvasTexture(512, 160, (ctx, w, h) => {
    ctx.fillStyle = '#f4ecdb'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#2b7357'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.fillStyle = '#6b4b32'; ctx.font = `900 58px ${FONT_EN}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('COFFEE', w / 2, 72);
    ctx.fillStyle = '#a35a2e'; ctx.font = `700 28px ${FONT_JP}`;
    ctx.fillText('挽きたて ・ 淹れたて', w / 2, 122);
  });
  texturedPlane(detailKit, coffeeSign, 0.75, 0.235, 0.2, 2.63, -4.66);
}

// ------------------------------------------------------------
// Hanging aisle signs
// ------------------------------------------------------------
const hangingKit = kit('26-悬挂导视牌', 2.62, { fromY: -0.6, scaleFrom: 0.92 });
{
  const signs = [
    { tex: TEX.aisleRice, x: -2.80, z: -1.85, w: 1.15 },
    { tex: TEX.aisleDrink, x: -1.45, z: -2.25, w: 1.05 },
    { tex: TEX.aisleSnack, x: -0.35, z: -3.5, w: 1.0 },
  ];
  signs.forEach((s) => {
    box(hangingKit, M.metalLight, s.w, 0.025, 0.026, s.x, 2.34, s.z, { cast: false });
    const mat = new THREE.MeshBasicMaterial({ map: s.tex, side: THREE.DoubleSide });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(s.w * 0.92, 0.27), mat);
    sign.position.set(s.x, 2.2, s.z);
    hangingKit.add(sign);
    barBetween(hangingKit, M.metalDark, [s.x - s.w * 0.34, 2.35, s.z], [s.x - s.w * 0.34, 3.05, s.z], 0.009);
    barBetween(hangingKit, M.metalDark, [s.x + s.w * 0.34, 2.35, s.z], [s.x + s.w * 0.34, 3.05, s.z], 0.009);
  });
  // swaying little sale banners near the front
  const bannerTex = canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#fff9e8'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#d95743'; ctx.lineWidth = 10; ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#d95743'; ctx.font = `900 64px ${FONT_JP}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('新商品', w / 2, 90);
    ctx.fillStyle = '#2b7357'; ctx.font = `800 36px ${FONT_JP}`;
    ctx.fillText('続々入荷', w / 2, 160);
    ctx.fillStyle = '#e88d3e'; ctx.font = `700 25px ${FONT_EN}`;
    ctx.fillText('NEW ARRIVALS', w / 2, 211);
  });
  [-3.6, -1.0].forEach((x) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.52, 0.42),
      new THREE.MeshBasicMaterial({ map: bannerTex, side: THREE.DoubleSide, transparent: true })
    );
    m.position.set(x, 2.56, -1.05);
    hangingKit.add(m);
    barBetween(hangingKit, M.metalDark, [x - 0.2, 2.78, -1.05], [x - 0.2, 3.05, -1.05], 0.007);
    barBetween(hangingKit, M.metalDark, [x + 0.2, 2.78, -1.05], [x + 0.2, 3.05, -1.05], 0.007);
  });
}

// ------------------------------------------------------------
// Street furniture textures
// ------------------------------------------------------------
TEX.parkingSign = canvasTexture(256, 256, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#2765a3';
  ctx.beginPath(); ctx.arc(w / 2, h / 2, 118, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#f6f4e7'; ctx.lineWidth = 12;
  ctx.beginPath(); ctx.arc(w / 2, h / 2, 110, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#f6f4e7';
  ctx.font = `900 152px ${FONT_EN}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('P', w / 2, h / 2 + 8);
});

TEX.stopSign = canvasTexture(512, 512, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#f7f2e2';
  ctx.beginPath();
  ctx.moveTo(w / 2, h - 26);
  ctx.lineTo(34, 98);
  ctx.lineTo(w - 34, 98);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c53e35';
  ctx.beginPath();
  ctx.moveTo(w / 2, h - 56);
  ctx.lineTo(72, 122);
  ctx.lineTo(w - 72, 122);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fffdf2';
  ctx.font = `900 84px ${FONT_JP}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('止まれ', w / 2, 238);
  ctx.font = `700 34px ${FONT_EN}`;
  ctx.fillText('STOP', w / 2, 314);
});

TEX.streetPlate = canvasTexture(512, 160, (ctx, w, h) => {
  ctx.fillStyle = '#2b5b50';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#e9e2cf';
  ctx.lineWidth = 8;
  ctx.strokeRect(7, 7, w - 14, h - 14);
  ctx.fillStyle = '#f4eedb';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 58px ${FONT_JP}`;
  ctx.fillText('星見町', w / 2, 60);
  ctx.font = `600 24px ${FONT_EN}`;
  ctx.fillText('HOSHIMI  CHO', w / 2, 113);
});

TEX.streetPlateBlue = canvasTexture(512, 140, (ctx, w, h) => {
  ctx.fillStyle = '#24507e';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#f1ede0';
  ctx.lineWidth = 7;
  ctx.strokeRect(7, 7, w - 14, h - 14);
  ctx.fillStyle = '#f5f0e2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 40px ${FONT_JP}`;
  ctx.fillText('星見マート前', w / 2, 52);
  ctx.font = `600 23px ${FONT_EN}`;
  ctx.fillText('HOSHIMI MART', w / 2, 98);
});

function recycleIcon(label, sub, color) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 12;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 105, 0, TAU); ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `900 69px ${FONT_JP}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, w / 2, 104);
    ctx.font = `700 24px ${FONT_EN}`;
    ctx.fillText(sub, w / 2, 167);
  });
}
TEX.binCan = recycleIcon('かん', 'CANS', '#f3eedf');
TEX.binPet = recycleIcon('ペット', 'PET', '#f3eedf');
TEX.binPaper = recycleIcon('紙', 'PAPER', '#f3eedf');

TEX.poleNotice = canvasTexture(256, 512, (ctx, w, h) => {
  ctx.fillStyle = '#f3edda';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2b7357';
  ctx.fillRect(0, 0, w, 72);
  ctx.fillStyle = '#fff9e9';
  ctx.font = `800 34px ${FONT_JP}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('お知らせ', w / 2, 37);
  ctx.fillStyle = '#5e5b4e';
  ctx.font = `600 22px ${FONT_JP}`;
  ctx.fillText('電柱の美化に', w / 2, 122);
  ctx.fillText('ご協力ください', w / 2, 156);
  ctx.fillStyle = '#d95743';
  ctx.beginPath(); ctx.arc(w / 2, 250, 58, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff9e9';
  ctx.font = `900 68px ${FONT_EN}`;
  ctx.fillText('!', w / 2, 245);
  ctx.fillStyle = '#5e5b4e';
  ctx.font = `600 18px ${FONT_JP}`;
  ctx.fillText('星見町内会', w / 2, 360);
  ctx.fillStyle = '#2b7357';
  ctx.fillRect(26, 420, w - 52, 30);
  ctx.fillStyle = '#fff9e9';
  ctx.font = `600 16px ${FONT_JP}`;
  ctx.fillText('HOSHIMI TOWN', w / 2, 436);
});

// ------------------------------------------------------------
// Vending machines
// ------------------------------------------------------------
const vendingKit = kit('30-自动贩卖机', 3.22, { fromY: -0.85, scaleFrom: 0.93 });
{
  const specs = [
    { z: -3.72, tex: TEX.vendingRed, body: 0xb8343e },
    { z: -2.62, tex: TEX.vendingBlue, body: 0x23538f },
  ];
  specs.forEach((s, i) => {
    box(vendingKit, M.metalDark, 0.96, 0.12, 1.05, 1.63, 0.24, s.z, { cast: false });
      box(vendingKit, toon(s.body), 0.94, 1.9, 1.02, 1.63, 1.23, s.z, { outline: 0.018 });
    // glowing front
    texturedPlane(vendingKit, s.tex, 0.95, 1.9, 2.104, 1.23, s.z, { ry: Math.PI / 2, toneMapped: false });
    // top lightbox lip
    box(vendingKit, M.wallCream, 0.99, 0.06, 1.07, 1.63, 2.2, s.z, { cast: false });
    box(vendingKit, M.warmLight, 0.02, 0.08, 0.9, 2.112, 2.14, s.z, { cast: false, receive: false });
    // side panel seams
    box(vendingKit, M.metalLight, 0.02, 1.55, 0.04, 2.106, 1.2, s.z - 0.49, { cast: false });
    box(vendingKit, M.metalLight, 0.02, 1.55, 0.04, 2.106, 1.2, s.z + 0.49, { cast: false });
    // feet and gap shadow
    box(vendingKit, M.metalDark, 0.86, 0.06, 0.92, 1.63, 0.26, s.z, { cast: false });
    contactShadow(vendingKit, 1.63, s.z, 1.3, 1.3, 0.32, SIDEWALK_TOP + 0.006);
    // recycle bin between machines
    if (i === 0) {
      box(vendingKit, M.greenPlastic, 0.42, 0.55, 0.42, 2.14, 0.43, s.z + 0.62, { outline: 0.008 });
      box(vendingKit, M.metalDark, 0.34, 0.06, 0.34, 2.14, 0.73, s.z + 0.62, { cast: false });
      const opening = new THREE.Mesh(
        new THREE.CircleGeometry(0.11, 18),
        new THREE.MeshBasicMaterial({ color: 0x0d1016 })
      );
      opening.position.set(2.354, 0.5, s.z + 0.62);
      opening.rotation.y = Math.PI / 2;
      vendingKit.add(opening);
    }
    makeGlowSprite(i === 0 ? 0xffc6ad : 0xa9e8ff, 1.3, 2.25, 1.25, s.z, 0.2, vendingKit);
  });
  // machine top units
  box(vendingKit, M.metalDark, 0.3, 0.16, 0.9, 1.62, 2.29, -3.17, { cast: false });
  cylinder(vendingKit, M.metalLight, 0.09, 0.09, 0.06, 2.04, 1.32, -3.72, { seg: 14, cast: false, rz: Math.PI / 2 });
}

// ------------------------------------------------------------
// Bicycle
// ------------------------------------------------------------
const bikeKit = kit('31-自行车', 3.48, { fromY: -0.7, scaleFrom: 0.9, duration: 0.8 });
{
  const bx = 2.55;
  const wheelR = 0.31;
  const rearZ = -1.5;
  const frontZ = -0.53;
  const wheelY = SIDEWALK_TOP + wheelR;
  const tireGeo = new THREE.TorusGeometry(wheelR, 0.028, 8, 28);
  const wheelPositions = [[bx, wheelY, rearZ], [bx, wheelY, frontZ]];
  const wheelGroups = [];
  wheelPositions.forEach(([x, y, z]) => {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(x, y, z);
    bikeKit.add(wheelGroup);
    const tire = new THREE.Mesh(tireGeo, M.tire);
    tire.rotation.y = Math.PI / 2;
    tire.castShadow = true;
    wheelGroup.add(tire);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(wheelR - 0.035, 0.011, 6, 24), M.metalLight);
    rim.rotation.y = Math.PI / 2;
    wheelGroup.add(rim);
    for (let s = 0; s < 8; s++) {
      const a = (s / 8) * TAU;
      barBetween(
        wheelGroup,
        M.metalLight,
        [0, 0, 0],
        [0, Math.sin(a) * (wheelR - 0.045), Math.cos(a) * (wheelR - 0.045)],
        0.004
      );
    }
    cylinder(wheelGroup, M.metalDark, 0.035, 0.035, 0.08, 0, 0, 0, { seg: 8, rz: Math.PI / 2 });
    wheelGroup.traverse((o) => {
      if (o.isMesh) {
        o.userData.noMerge = true;
        o.castShadow = false;
      }
    });
    wheelGroups.push(wheelGroup);
  });
  bikeKit.userData.wheelGroups = wheelGroups;
  const rearTrailAnchor = new THREE.Object3D();
  rearTrailAnchor.position.set(bx, SIDEWALK_TOP + 0.02, rearZ);
  bikeKit.add(rearTrailAnchor);
  bikeKit.userData.rearTrailAnchor = rearTrailAnchor;
  const bb = [bx, wheelY - 0.02, (rearZ + frontZ) / 2];
  const seatTop = [bx, SIDEWALK_TOP + 0.93, rearZ + 0.27];
  const headTop = [bx, SIDEWALK_TOP + 0.88, frontZ - 0.08];
  const headBottom = [bx, SIDEWALK_TOP + 0.59, frontZ - 0.04];
  const rearAxle = [bx, wheelY, rearZ];
  const frontAxle = [bx, wheelY, frontZ];
  barBetween(bikeKit, M.bikeRed, rearAxle, seatTop, 0.022);
  barBetween(bikeKit, M.bikeRed, seatTop, bb, 0.024);
  barBetween(bikeKit, M.bikeFrame, bb, headBottom, 0.024);
  barBetween(bikeKit, M.bikeFrame, seatTop, headTop, 0.022);
  barBetween(bikeKit, M.bikeRed, headBottom, headTop, 0.026);
  barBetween(bikeKit, M.metalDark, headBottom, frontAxle, 0.016);
  barBetween(bikeKit, M.metalDark, rearAxle, bb, 0.014);
  // handlebar
  barBetween(bikeKit, M.metalDark, [bx, SIDEWALK_TOP + 0.9, frontZ - 0.1], [bx, SIDEWALK_TOP + 1.08, frontZ - 0.12], 0.02);
  barBetween(bikeKit, M.metalLight, [bx - 0.24, SIDEWALK_TOP + 1.06, frontZ - 0.1], [bx + 0.24, SIDEWALK_TOP + 1.06, frontZ - 0.1], 0.018);
  cylinder(bikeKit, M.tire, 0.028, 0.028, 0.08, bx - 0.25, SIDEWALK_TOP + 1.06, frontZ - 0.1, { seg: 8, rz: Math.PI / 2 });
  cylinder(bikeKit, M.tire, 0.028, 0.028, 0.08, bx + 0.25, SIDEWALK_TOP + 1.06, frontZ - 0.1, { seg: 8, rz: Math.PI / 2 });
  // saddle
  box(bikeKit, M.tire, 0.2, 0.055, 0.32, bx, SIDEWALK_TOP + 1.01, rearZ + 0.29, { outline: 0.008, cast: true });
  barBetween(bikeKit, M.metalLight, [bx, SIDEWALK_TOP + 0.98, rearZ + 0.29], [bx, SIDEWALK_TOP + 1.03, rearZ + 0.29], 0.012);
  // front basket
  const basketY = SIDEWALK_TOP + 0.92;
  const basketZ = frontZ + 0.18;
  box(bikeKit, M.metalDark, 0.32, 0.03, 0.28, bx, basketY - 0.1, basketZ, { cast: false });
  for (let i = 0; i < 5; i++) {
    barBetween(bikeKit, M.metalDark, [bx - 0.15, basketY - 0.08, basketZ - 0.13 + i * 0.065], [bx - 0.15, basketY + 0.13, basketZ - 0.13 + i * 0.065], 0.006);
    barBetween(bikeKit, M.metalDark, [bx + 0.15, basketY - 0.08, basketZ - 0.13 + i * 0.065], [bx + 0.15, basketY + 0.13, basketZ - 0.13 + i * 0.065], 0.006);
  }
  for (let i = 0; i < 4; i++) {
    barBetween(bikeKit, M.metalDark, [bx - 0.15, basketY + 0.13, basketZ - 0.13 + i * 0.086], [bx + 0.15, basketY + 0.13, basketZ - 0.13 + i * 0.086], 0.006);
  }
  // rear rack
  box(bikeKit, M.metalDark, 0.25, 0.03, 0.42, bx, SIDEWALK_TOP + 0.73, rearZ - 0.03, { cast: false });
  // kickstand
  barBetween(bikeKit, M.metalDark, [bx - 0.06, wheelY - 0.06, (rearZ + frontZ) / 2], [bx - 0.22, SIDEWALK_TOP + 0.01, (rearZ + frontZ) / 2 + 0.12], 0.012);
  // reflector and bell
  box(bikeKit, basic(0xd34d42), 0.05, 0.04, 0.02, bx, SIDEWALK_TOP + 0.52, rearZ - 0.24, { cast: false });
  const bikeBell = new THREE.Group();
  bikeBell.position.set(bx + 0.18, SIDEWALK_TOP + 1.09, frontZ - 0.12);
  const bellDome = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8, 0, TAU, 0, Math.PI / 2), M.metalLight);
  bellDome.castShadow = false;
  bikeBell.add(bellDome);
  const bellRim = new THREE.Mesh(new THREE.TorusGeometry(0.039, 0.006, 5, 12), M.metalDark);
  bellRim.rotation.x = Math.PI / 2;
  bellRim.castShadow = false;
  bikeBell.add(bellRim);
  const bellLever = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.012), M.metalDark);
  bellLever.position.set(0.035, -0.01, 0);
  bikeBell.add(bellLever);
  bikeBell.traverse((o) => { o.userData.noMerge = true; });
  bikeKit.add(bikeBell);
  bikeKit.userData.bell = bikeBell;
  contactShadow(bikeKit, bx, (rearZ + frontZ) / 2, 0.7, 1.25, 0.34, SIDEWALK_TOP + 0.007);
  // The bicycle can be nudged around; the soft contact shadow travels with it,
  // while its long directional shadow is left out of the frozen shadow map.
  bikeKit.traverse((o) => { if (o.isMesh) o.castShadow = false; });
}

// ------------------------------------------------------------
// Bins, umbrella stand, standing signs
// ------------------------------------------------------------
const streetKit = kit('32-门口杂物', 3.55, { fromY: -0.55, scaleFrom: 0.92 });
{
  // recycling bins in a neat row
  const bins = [
    { x: 1.42, color: 0x40725a, mat: M.greenPlastic, icon: TEX.binCan, label: 'かん' },
    { x: 1.74, color: 0x3d6b8e, mat: M.bluePlastic, icon: TEX.binPet, label: 'ペット' },
    { x: 2.06, color: 0xa64b48, mat: M.redPlastic, icon: TEX.binPaper, label: '紙' },
  ];
  bins.forEach((b, binIndex) => {
    box(streetKit, b.mat, 0.27, 0.54, 0.32, b.x, SIDEWALK_TOP + 0.28, -0.58, {
      outline: 0.009,
    });
    if (binIndex < 2) {
      box(streetKit, M.metalDark, 0.28, 0.045, 0.33, b.x, SIDEWALK_TOP + 0.56, -0.58, {
        cast: false,
      });
    } else {
      // The paper bin gets a real hinged lid and a few scraps inside.
      box(streetKit, M.metalDark, 0.24, 0.008, 0.28, b.x, SIDEWALK_TOP + 0.554, -0.58, { cast: false });
      const paperBits = new THREE.Group();
      paperBits.position.set(b.x, SIDEWALK_TOP + 0.562, -0.58);
      for (let p = 0; p < 5; p++) {
        const bit = new THREE.Mesh(
          new THREE.BoxGeometry(rand(0.018, 0.04), 0.012, rand(0.018, 0.04)),
          basic(p % 2 ? 0xe9dfc9 : 0xd8c8ad)
        );
        bit.position.set(rand(-0.09, 0.09), rand(-0.01, 0.01), rand(-0.11, 0.11));
        bit.rotation.y = rand(0, TAU);
        bit.userData.noMerge = true;
        paperBits.add(bit);
      }
      paperBits.traverse((o) => { o.userData.noMerge = true; });
      streetKit.add(paperBits);
      const lidPivot = new THREE.Group();
      lidPivot.position.set(b.x, SIDEWALK_TOP + 0.595, -0.745);
      const lidMesh = box(lidPivot, M.metalDark, 0.28, 0.04, 0.33, 0, 0, 0.165, { cast: false });
      lidMesh.userData.noMerge = true;
      lidPivot.traverse((o) => { o.userData.noMerge = true; });
      streetKit.add(lidPivot);
      streetKit.userData.trashLidPivot = lidPivot;
      streetKit.userData.trashPaperBits = paperBits;
    }
    const icon = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.18),
      new THREE.MeshBasicMaterial({ map: b.icon, transparent: true })
    );
    icon.position.set(b.x, SIDEWALK_TOP + 0.34, -0.418);
    streetKit.add(icon);
    box(streetKit, M.metalDark, 0.07, 0.06, 0.02, b.x, SIDEWALK_TOP + 0.5, -0.42, { cast: false });
    contactShadow(streetKit, b.x, -0.58, 0.45, 0.48, 0.28, SIDEWALK_TOP + 0.006);
  });
  // umbrella stand beside the door
  cylinder(streetKit, M.metalDark, 0.2, 0.22, 0.44, -0.7, SIDEWALK_TOP + 0.23, -0.63, { seg: 16, outline: 0.01 });
  cylinder(streetKit, M.metalLight, 0.19, 0.19, 0.02, -0.7, SIDEWALK_TOP + 0.43, -0.63, { seg: 16, cast: false });
  // The five actual umbrellas are built below as identical skinned rigs so
  // every one in the stand shares the same proportions and skeleton.
  // wet floor sign near door
  const warningTex = TEX.caution;
  const warning = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.44),
    new THREE.MeshBasicMaterial({ map: warningTex, transparent: true, side: THREE.DoubleSide })
  );
  warning.position.set(-1.25, SIDEWALK_TOP + 0.4, -0.62);
  warning.rotation.y = 0.25;
  streetKit.add(warning);
}

// The little welcome pot is a separate, touchable object so petals can open
// and a butterfly can visit it on long press.
const flowerPot = new THREE.Group();
flowerPot.position.set(1.05, SIDEWALK_TOP, -0.37);
world.add(flowerPot);
const flowerPotRecord = {
  group: flowerPot,
  petals: [],
  bloom: 0,
  bloomTarget: 0,
  butterfly: null,
  butterflyTime: 0,
  butterflyActive: false,
};
{
  cylinder(flowerPot, M.cardboard, 0.14, 0.1, 0.25, 0, 0.13, 0, { seg: 12, outline: 0.01 });
  const petalMats = [toon(0xf0b5b8), toon(0xffd0d2), toon(0xf7c6df)];
  for (let i = 0; i < 3; i++) {
    const cx = -0.03 + i * 0.035;
    const cz = rand(-0.04, 0.04);
    cylinder(flowerPot, M.trimGreenLight, 0.006, 0.008, 0.3, cx, 0.38, cz, { seg: 5, cast: false, rz: rand(-0.3, 0.3) });
    const head = new THREE.Group();
    head.position.set(cx, 0.53, cz);
    flowerPot.add(head);
    const petals = [];
    for (let p = 0; p < 6; p++) {
      const a = (p / 6) * TAU;
      const petal = sphere(
        head,
        petalMats[i % petalMats.length],
        0.024,
        Math.cos(a) * 0.035,
        0,
        Math.sin(a) * 0.035,
        { seg: 7, cast: false }
      );
      petal.userData.baseScale = 1;
      petals.push(petal);
    }
    const heart = sphere(head, basic(0xffe08a), 0.022, 0, 0.002, 0, { seg: 7, cast: false });
    flowerPotRecord.petals.push({ head, petals, heart });
  }
}

// ------------------------------------------------------------
// Store pylon sign
// ------------------------------------------------------------
const pylonKit = kit('33-街角灯箱', 3.7, { fromY: -0.8, scaleFrom: 0.9 });
{
  const px = 6.08;
  const pz = 0.88;
  box(pylonKit, M.concrete, 0.62, 0.22, 0.62, px, SIDEWALK_TOP + 0.11, pz, { outline: 0.01 });
  box(pylonKit, M.metalDark, 0.16, 2.1, 0.16, px, SIDEWALK_TOP + 1.17, pz, { outline: 0.008 });
  box(pylonKit, M.metalDark, 0.74, 1.45, 0.22, px, SIDEWALK_TOP + 2.42, pz, { outline: 0.01 });
  box(pylonKit, M.warmLight, 0.69, 1.4, 0.03, px, SIDEWALK_TOP + 2.42, pz + 0.117, { cast: false, receive: false });
  texturedPlane(pylonKit, TEX.pylon, 0.69, 1.4, px, SIDEWALK_TOP + 2.42, pz + 0.135);
  texturedPlane(pylonKit, TEX.pylon, 0.69, 1.4, px, SIDEWALK_TOP + 2.42, pz - 0.135, { ry: Math.PI });
  // frame halo
  makeGlowSprite(0xffe2b0, 1.7, px, SIDEWALK_TOP + 2.4, pz, 0.20, pylonKit);
  // tiny downlight
  box(pylonKit, M.metalDark, 0.1, 0.1, 0.22, px, SIDEWALK_TOP + 1.75, pz + 0.1, { cast: false });
  contactShadow(pylonKit, px, pz, 1.15, 1.15, 0.38, SIDEWALK_TOP + 0.007);
}

// ------------------------------------------------------------
// Street lamp (warm pool of light)
// ------------------------------------------------------------
const lampKit = kit('34-街灯', 3.82, { fromY: -0.95, scaleFrom: 0.92 });
{
  const lx = -3.68;
  const lz = 1.52;
  cylinder(lampKit, M.metalDark, 0.095, 0.13, 4.25, lx, SIDEWALK_TOP + 2.12, lz, { seg: 12, outline: 0.012 });
  cylinder(lampKit, M.metalDark, 0.25, 0.3, 0.18, lx, SIDEWALK_TOP + 0.09, lz, { seg: 14, outline: 0.012 });
  // gently curved arm
  barBetween(lampKit, M.metalDark, [lx, SIDEWALK_TOP + 4.1, lz], [lx, SIDEWALK_TOP + 4.52, lz + 0.45], 0.055);
  barBetween(lampKit, M.metalDark, [lx, SIDEWALK_TOP + 4.52, lz + 0.45], [lx, SIDEWALK_TOP + 4.35, lz + 0.95], 0.05);
  box(lampKit, M.metalDark, 0.36, 0.1, 0.34, lx, SIDEWALK_TOP + 4.3, lz + 0.9, { outline: 0.01 });
  const lampShade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.3, 0.22, 14, 1, true),
    toon(0x3b4048, { side: THREE.DoubleSide })
  );
  lampShade.position.set(lx, SIDEWALK_TOP + 4.42, lz + 0.9);
  lampKit.add(lampShade);
  cylinder(lampKit, M.warmLight, 0.2, 0.2, 0.04, lx, SIDEWALK_TOP + 4.22, lz + 0.9, { seg: 18, cast: false, receive: false });
  lampKit.userData.lampGlow = makeGlowSprite(0xffbf7c, 2.8, lx, SIDEWALK_TOP + 4.3, lz + 0.9, 0.38, lampKit);
  // street name plates
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.82, 0.26),
    new THREE.MeshBasicMaterial({ map: TEX.streetPlate, side: THREE.DoubleSide })
  );
  plate.position.set(lx, SIDEWALK_TOP + 3.0, lz + 0.1);
  plate.rotation.y = 0.06;
  lampKit.add(plate);
  // lamp banner
  const bannerTex = canvasTexture(256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#2b5c4b';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f1ead6';
    ctx.fillRect(16, 16, w - 32, h - 32);
    ctx.fillStyle = '#2b5c4b';
    ctx.font = `800 54px ${FONT_JP}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('星見町', w / 2, 90);
    ctx.fillStyle = '#d95743';
    ctx.font = `700 32px ${FONT_JP}`;
    ctx.fillText('商店街', w / 2, 160);
    ctx.fillStyle = '#2b5c4b';
    ctx.beginPath(); ctx.arc(w / 2, 300, 64, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f1ead6';
    ctx.font = `900 90px ${FONT_JP}`;
    ctx.fillText('祭', w / 2, 302);
    ctx.fillStyle = '#2b5c4b';
    ctx.font = `600 20px ${FONT_EN}`;
    ctx.fillText('HOSHIMI CHO', w / 2, 420);
  });
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.85),
    new THREE.MeshBasicMaterial({ map: bannerTex, side: THREE.DoubleSide })
  );
  banner.position.set(lx, SIDEWALK_TOP + 2.25, lz + 0.18);
  lampKit.add(banner);
  barBetween(lampKit, M.metalDark, [lx, SIDEWALK_TOP + 2.62, lz + 0.18], [lx, SIDEWALK_TOP + 2.7, lz + 0.18], 0.01);
  contactShadow(lampKit, lx, lz, 0.8, 0.8, 0.35, SIDEWALK_TOP + 0.007);
}

// ------------------------------------------------------------
// Guardrails, stop sign, parking sign, curve mirror
// ------------------------------------------------------------
TEX.acGrille = canvasTexture(256, 256, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#59636d';
  ctx.beginPath(); ctx.arc(w / 2, h / 2, 120, 0, TAU); ctx.fill();
  ctx.fillStyle = '#242c36';
  ctx.beginPath(); ctx.arc(w / 2, h / 2, 107, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#85919b';
  ctx.lineWidth = 5;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    ctx.lineTo(w / 2 + Math.cos(a) * 100, h / 2 + Math.sin(a) * 100);
    ctx.stroke();
  }
  ctx.fillStyle = '#a4afb8';
  ctx.beginPath(); ctx.arc(w / 2, h / 2, 24, 0, TAU); ctx.fill();
  ctx.fillStyle = '#20262d';
  ctx.beginPath(); ctx.arc(w / 2, h / 2, 12, 0, TAU); ctx.fill();
});

TEX.mirror = canvasTexture(256, 256, (ctx, w, h) => {
  const g = ctx.createRadialGradient(w * 0.38, h * 0.34, 4, w / 2, h / 2, w / 2);
  g.addColorStop(0, '#eaf8ff');
  g.addColorStop(0.35, '#9fc8d8');
  g.addColorStop(0.65, '#527a8e');
  g.addColorStop(1, '#213846');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(rand(20, 100), rand(20, 236));
    ctx.lineTo(rand(150, 236), rand(20, 236));
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,186,105,0.3)';
  ctx.beginPath(); ctx.arc(196, 72, 24, 0, TAU); ctx.fill();
});

function buildGuardrail(parent, x1, z1, x2, z2) {
  const a = new THREE.Vector3(x1, SIDEWALK_TOP, z1);
  const b = new THREE.Vector3(x2, SIDEWALK_TOP, z2);
  const len = a.distanceTo(b);
  const posts = Math.max(2, Math.round(len / 1.15) + 1);
  for (let i = 0; i < posts; i++) {
    const t = i / (posts - 1);
    const x = lerp(x1, x2, t);
    const z = lerp(z1, z2, t);
    cylinder(parent, M.metalLight, 0.035, 0.035, 0.92, x, SIDEWALK_TOP + 0.46, z, { seg: 8, outline: 0.008 });
    cylinder(parent, M.metalDark, 0.06, 0.075, 0.09, x, SIDEWALK_TOP + 0.05, z, { seg: 8, cast: false });
  }
  [0.62, 0.89].forEach((y) => {
    const p1 = new THREE.Vector3(x1, SIDEWALK_TOP + y, z1);
    const p2 = new THREE.Vector3(x2, SIDEWALK_TOP + y, z2);
    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    mid.y -= 0.03;
    const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
    const geo = new THREE.TubeGeometry(curve, 12, 0.026, 6, false);
    const mesh = new THREE.Mesh(geo, M.metalLight);
    mesh.castShadow = true;
    parent.add(mesh);
  });
}

const guardKit = kit('35-街角护栏与路牌', 3.92, { fromY: -0.55, scaleFrom: 0.92 });
{
  buildGuardrail(guardKit, -0.8, 5.44, 3.7, 5.44);
  buildGuardrail(guardKit, 3.7, 5.44, 5.62, 5.44);
  buildGuardrail(guardKit, 5.94, 2.55, 5.94, 5.05);
  // stop sign on the near corner
  cylinder(guardKit, M.metalLight, 0.04, 0.045, 2.4, 3.02, SIDEWALK_TOP + 1.2, 1.88, { seg: 8 });
  const signPivot = new THREE.Group();
  signPivot.position.set(3.02, SIDEWALK_TOP + 2.2, 1.88);
  guardKit.add(signPivot);
  const stopMat = new THREE.MeshBasicMaterial({ map: TEX.stopSign, transparent: true, side: THREE.DoubleSide });
  const stopSign = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.56), stopMat);
  stopSign.position.set(0, 0, 0.02);
  stopSign.rotation.y = 0.16;
  signPivot.add(stopSign);
  makeGlowSprite(0xff6c58, 0.55, 3.02, SIDEWALK_TOP + 2.2, 1.94, 0.08, guardKit);
  // blue street plate under the stop sign
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.165),
    new THREE.MeshBasicMaterial({ map: TEX.streetPlateBlue, side: THREE.DoubleSide })
  );
  plate.position.set(0, -0.6, 0.02);
  plate.rotation.y = 0.16;
  signPivot.add(plate);
  signPivot.traverse((o) => { o.userData.noMerge = true; });
  guardKit.userData.signPivot = signPivot;
  // parking sign at the far edge of the bay, out of the vending machines' sightline
  cylinder(guardKit, M.metalLight, 0.03, 0.035, 2.1, 5.94, SIDEWALK_TOP + 1.05, -0.2, { seg: 8 });
  const parkMat = new THREE.MeshBasicMaterial({ map: TEX.parkingSign, transparent: true, side: THREE.DoubleSide });
  const parkSign = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), parkMat);
  parkSign.position.set(5.94, SIDEWALK_TOP + 2.0, -0.2);
  parkSign.rotation.y = Math.PI / 3;
  guardKit.add(parkSign);
  // wet road object: one lone traffic cone near the parking bay
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.52, 14), toon(0xd96735));
  cone.position.set(5.05, 0.04 + 0.26, -0.3);
  cone.castShadow = true;
  guardKit.add(cone);
  cylinder(guardKit, M.wallCream, 0.155, 0.155, 0.09, 5.05, 0.04 + 0.18, -0.3, { seg: 14, cast: false });
  box(guardKit, M.wallCream, 0.3, 0.06, 0.3, 5.05, 0.04 + 0.03, -0.3, { cast: false });
}

// ------------------------------------------------------------
// Utility poles and overhead wires
// ------------------------------------------------------------
M.wire = new THREE.MeshBasicMaterial({ color: 0x141a23 });
function buildWire(parent, p1, p2, sag, radius = 0.012) {
  const a = new THREE.Vector3(p1[0], p1[1], p1[2]);
  const b = new THREE.Vector3(p2[0], p2[1], p2[2]);
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  mid.y -= sag;
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  const geo = new THREE.TubeGeometry(curve, 26, radius, 4, false);
  const mesh = new THREE.Mesh(geo, M.wire);
  mesh.castShadow = false;
  parent.add(mesh);
  return mesh;
}

const poleKit = kit('36-电线杆与电线', 4.06, { fromY: -1.45, scaleFrom: 0.94, duration: 0.95 });
{
  // near pole
  const p1x = -6.12;
  const p1z = 1.52;
  cylinder(poleKit, M.concreteDark, 0.13, 0.18, 6.15, p1x, 0.16 + 3.075, p1z, { seg: 14, outline: 0.008 });
  cylinder(poleKit, M.concreteDark, 0.2, 0.23, 0.16, p1x, 0.24, p1z, { seg: 14 });
  // crossarms
  [5.35, 4.92].forEach((y) => {
    box(poleKit, M.metalDark, 1.72, 0.11, 0.11, p1x, y, p1z, { outline: 0.006 });
    for (let i = 0; i < 3; i++) {
      cylinder(poleKit, M.wallCream, 0.05, 0.06, 0.13, p1x - 0.62 + i * 0.62, y + 0.11, p1z, { seg: 8, cast: false });
    }
  });
  // transformer
  cylinder(poleKit, M.metalDark, 0.23, 0.23, 0.58, p1x + 0.03, 4.48, p1z - 0.23, { seg: 14, outline: 0.008 });
  cylinder(poleKit, M.metalLight, 0.255, 0.255, 0.06, p1x + 0.03, 4.75, p1z - 0.23, { seg: 14, cast: false });
  box(poleKit, M.metalLight, 0.18, 0.32, 0.18, p1x - 0.27, 4.42, p1z - 0.23, { cast: false });
  // step bolts
  for (let i = 0; i < 8; i++) {
    barBetween(poleKit, M.metalDark, [p1x, 1.25 + i * 0.6, p1z], [p1x + 0.24, 1.3 + i * 0.6, p1z], 0.016);
  }
  // pole notice and street plate
  texturedPlane(poleKit, TEX.poleNotice, 0.34, 0.68, p1x + 0.005, 3.05, p1z + 0.17, { transparent: true });
  texturedPlane(poleKit, TEX.streetPlate, 0.68, 0.21, p1x, 2.48, p1z + 0.17);
  // second far pole
  const p2x = 6.06;
  const p2z = -4.55;
  cylinder(poleKit, M.concreteDark, 0.12, 0.17, 5.95, p2x, 0.16 + 2.975, p2z, { seg: 14 });
  box(poleKit, M.metalDark, 1.5, 0.1, 0.1, p2x, 5.22, p2z, { cast: false });
  for (let i = 0; i < 3; i++) {
    cylinder(poleKit, M.wallCream, 0.045, 0.05, 0.12, p2x - 0.55 + i * 0.55, 5.32, p2z, { seg: 8, cast: false });
  }
  // overhead wires
  buildWire(poleKit, [p1x - 0.62, 5.47, p1z], [p2x - 0.55, 5.31, p2z], 0.78, 0.014);
  buildWire(poleKit, [p1x, 5.48, p1z], [p2x, 5.33, p2z], 0.86, 0.014);
  buildWire(poleKit, [p1x + 0.62, 5.47, p1z], [p2x + 0.55, 5.31, p2z], 0.82, 0.014);
  buildWire(poleKit, [p1x - 0.5, 5.03, p1z], [p2x - 0.35, 4.92, p2z], 1.02, 0.012);
  buildWire(poleKit, [p1x + 0.5, 5.03, p1z], [p2x + 0.35, 4.92, p2z], 0.94, 0.012);
  // service drops to the store roof
  buildWire(poleKit, [p1x + 0.2, 5.0, p1z], [-4.15, 3.78, -1.05], 0.34, 0.012);
  buildWire(poleKit, [p1x + 0.55, 4.8, p1z], [-3.35, 3.74, -0.95], 0.4, 0.01);
  buildWire(poleKit, [p1x + 0.3, 4.6, p1z], [1.2, 3.68, -0.8], 0.65, 0.009);
  // hanging cable loops on the pole
  const loopCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(p1x, 4.2, p1z + 0.04),
    new THREE.Vector3(p1x + 0.28, 3.95, p1z + 0.1),
    new THREE.Vector3(p1x + 0.36, 3.62, p1z + 0.02),
    new THREE.Vector3(p1x + 0.1, 3.46, p1z - 0.04),
  ]);
  const loop = new THREE.Mesh(new THREE.TubeGeometry(loopCurve, 18, 0.01, 4, false), M.wire);
  poleKit.add(loop);
}

// ------------------------------------------------------------
// Rooftop machinery + wall air conditioners
// ------------------------------------------------------------
const roofKit = kit('37-屋顶设备', 4.18, { fromY: -1.1, scaleFrom: 0.92 });
{
  // two rooftop AC condensers
  const acPositions = [[-0.55, -4.62], [0.5, -3.86]];
  acPositions.forEach(([x, z]) => {
    box(roofKit, M.metalLight, 1.08, 0.7, 0.82, x, 4.1, z, { outline: 0.01 });
    box(roofKit, M.metalDark, 0.98, 0.06, 0.72, x, 4.44, z, { cast: false });
    const grille = new THREE.Mesh(
      new THREE.CircleGeometry(0.29, 22),
      new THREE.MeshBasicMaterial({ map: TEX.acGrille })
    );
    grille.position.set(x, 4.475, z);
    grille.rotation.x = -Math.PI / 2;
    roofKit.add(grille);
    box(roofKit, M.metalDark, 0.85, 0.05, 0.06, x, 3.78, z + 0.38, { cast: false });
    barBetween(roofKit, M.metalDark, [x - 0.4, 3.74, z + 0.32], [x - 0.4, 3.74, z + 0.75], 0.03);
  });
  // vent cowl
  cylinder(roofKit, M.metalLight, 0.16, 0.16, 0.7, -4.1, 4.08, -4.9, { seg: 12, outline: 0.006 });
  cylinder(roofKit, M.metalDark, 0.28, 0.1, 0.2, -4.1, 4.5, -4.9, { seg: 12 });
  // slim antenna mast
  cylinder(roofKit, M.metalDark, 0.025, 0.035, 2.4, 0.85, 4.92, -5.3, { seg: 8 });
  for (let i = 0; i < 3; i++) {
    barBetween(roofKit, M.metalDark, [0.85 - 0.3, 5.5 + i * 0.25, -5.3], [0.85 + 0.3, 5.5 + i * 0.25, -5.3], 0.011);
  }
  // roof membrane seams + access hatch
  for (let i = 0; i < 4; i++) {
    box(roofKit, M.wallShadow, 5.8, 0.012, 0.035, STORE_CX, 3.737, -5.2 + i * 1.15, { cast: false, receive: false });
  }
  box(roofKit, M.metalDark, 0.78, 0.08, 0.62, -3.0, 3.77, -4.45, { outline: 0.008 });
  box(roofKit, M.metalLight, 0.68, 0.03, 0.52, -3.0, 3.82, -4.45, { cast: false });
  // roof pipe run
  barBetween(roofKit, M.metalDark, [-3.7, 3.78, -5.5], [0.4, 3.78, -5.5], 0.035);
  [ -2.0, -0.6 ].forEach((x) => {
    barBetween(roofKit, M.metalDark, [x, 3.78, -5.5], [x, 3.78, -4.8], 0.035);
    cylinder(roofKit, M.metalDark, 0.05, 0.05, 0.1, x, 3.74, -4.8, { seg: 8 });
  });
  // compact rooftop water tank
  cylinder(roofKit, M.metalLight, 0.4, 0.4, 0.72, -3.8, 4.18, -2.95, { seg: 16, outline: 0.01 });
  cylinder(roofKit, M.metalDark, 0.42, 0.42, 0.06, -3.8, 4.56, -2.95, { seg: 16, cast: false });
  cylinder(roofKit, M.metalDark, 0.1, 0.1, 0.07, -3.8, 4.61, -2.95, { seg: 10, cast: false });
  [[-0.26, -0.26], [0.26, -0.26], [-0.26, 0.26], [0.26, 0.26]].forEach(([dx, dz]) => {
    cylinder(roofKit, M.metalDark, 0.035, 0.035, 0.32, -3.8 + dx, 3.9, -2.95 + dz, { seg: 6, cast: false });
  });
  barBetween(roofKit, M.metalDark, [-3.8, 3.98, -2.95], [-3.8, 3.98, -4.25], 0.028);
  // wall AC units above the vending machines (staggered so they don't read as a face)
  const wallAc = [
    { z: -3.78, y: 3.05, s: 0.95 },
    { z: -4.72, y: 2.72, s: 0.82 },
  ];
  wallAc.forEach(({ z, y, s }) => {
    box(roofKit, M.metalLight, 0.27, 0.58 * s, 0.82 * s, 1.34, y, z, { outline: 0.009 });
    const gr = new THREE.Mesh(
      new THREE.CircleGeometry(0.2 * s, 20),
      new THREE.MeshBasicMaterial({ map: TEX.acGrille })
    );
    gr.position.set(1.478, y, z);
    gr.rotation.y = Math.PI / 2;
    roofKit.add(gr);
    box(roofKit, M.metalDark, 0.08, 0.07, 0.7 * s, 1.47, y - 0.32 * s, z, { cast: false });
    barBetween(roofKit, M.metalDark, [1.2, y - 0.29 * s, z - 0.3], [1.2, y - 0.29 * s, z + 0.3], 0.022);
    barBetween(roofKit, M.metalDark, [1.2, y - 0.29 * s, z - 0.3], [1.32, y - 0.29 * s, z - 0.3], 0.02);
    barBetween(roofKit, M.metalDark, [1.2, y - 0.29 * s, z + 0.3], [1.32, y - 0.29 * s, z + 0.3], 0.02);
  });
  // ground AC unit at the rear
  box(roofKit, M.metalLight, 0.3, 0.62, 0.82, 1.36, 0.48, -5.55, { outline: 0.009 });
  const gr = new THREE.Mesh(
    new THREE.CircleGeometry(0.2, 20),
    new THREE.MeshBasicMaterial({ map: TEX.acGrille })
  );
  gr.position.set(1.515, 0.48, -5.55);
  gr.rotation.y = Math.PI / 2;
  roofKit.add(gr);
}

// ------------------------------------------------------------
// Rear service side (keeps the model complete from every orbit angle)
// ------------------------------------------------------------
const rearKit = kit('37b-后场服务面', 4.22, { fromY: -0.8, scaleFrom: 0.92 });
{
  const wallZ = -5.958;
  // rear steel service door
  box(rearKit, M.metalDark, 1.02, 2.04, 0.07, -0.4, 1.19, wallZ - 0.01, { outline: 0.01 });
  texturedPlane(rearKit, TEX.staffDoor, 0.9, 1.78, -0.4, 1.19, wallZ - 0.048, { ry: Math.PI });
  box(rearKit, M.metalLight, 1.12, 0.07, 0.12, -0.4, 2.24, wallZ - 0.03, { cast: false });
  box(rearKit, M.metalLight, 0.07, 2.12, 0.12, -0.96, 1.19, wallZ - 0.03, { cast: false });
  box(rearKit, M.metalLight, 0.07, 2.12, 0.12, 0.16, 1.19, wallZ - 0.03, { cast: false });
  box(rearKit, M.concreteDark, 1.15, 0.08, 0.38, -0.4, 0.17, wallZ - 0.16, { cast: false });
  // security lamp above the door
  box(rearKit, M.metalDark, 0.2, 0.1, 0.24, -0.4, 2.42, wallZ - 0.11, { cast: false });
  box(rearKit, M.warmLight, 0.15, 0.03, 0.17, -0.4, 2.36, wallZ - 0.15, { cast: false, receive: false });
  makeGlowSprite(0xffc277, 0.9, -0.4, 2.35, wallZ - 0.15, 0.22, rearKit);
  const rearLamp = new THREE.PointLight(0xffb76e, 0.45, 3.2, 1.9);
  rearLamp.position.set(-0.4, 2.2, wallZ - 0.5);
  rearKit.add(rearLamp);
  // small warm back window
  box(rearKit, M.metalDark, 0.58, 0.45, 0.06, -2.55, 1.75, wallZ - 0.01, { cast: false });
  box(rearKit, basic(0xffce8a), 0.48, 0.34, 0.02, -2.55, 1.75, wallZ - 0.05, { cast: false, receive: false });
  for (let i = 0; i < 3; i++) {
    box(rearKit, M.metalDark, 0.025, 0.35, 0.03, -2.72 + i * 0.16, 1.75, wallZ - 0.065, { cast: false });
  }
  // faded green band + wall joints + conduit
  box(rearKit, M.trimGreen, 5.9, 0.16, 0.025, STORE_CX, 2.55, wallZ - 0.012, { cast: false });
  for (let i = 0; i < 6; i++) {
    box(rearKit, M.wallShadow, 0.018, 2.9, 0.012, -4.35 + i * 1.0, 1.6, wallZ - 0.008, { cast: false, receive: false });
  }
  box(rearKit, M.metalLight, 0.035, 2.7, 0.035, 0.86, 1.5, wallZ - 0.04, { cast: false });
  box(rearKit, M.metalLight, 0.035, 0.035, 0.7, 0.86, 2.75, wallZ - 0.2, { cast: false });
  // rear vent and meter cabinet
  box(rearKit, M.metalDark, 0.52, 0.38, 0.08, 0.35, 2.83, wallZ - 0.04, { cast: false });
  for (let i = 0; i < 4; i++) {
    box(rearKit, M.metalLight, 0.42, 0.022, 0.04, 0.35, 2.71 + i * 0.075, wallZ - 0.085, { cast: false, receive: false });
  }
  box(rearKit, M.metal, 0.32, 0.45, 0.15, 0.5, 0.56, wallZ - 0.12, { outline: 0.006 });
  // rear AC condenser
  box(rearKit, M.metalLight, 0.72, 0.48, 0.34, -3.9, 0.42, -6.18, { outline: 0.008 });
  const rearFan = new THREE.Mesh(
    new THREE.CircleGeometry(0.16, 18),
    new THREE.MeshBasicMaterial({ map: TEX.acGrille })
  );
  rearFan.position.set(-3.9, 0.42, -6.0);
  rearKit.add(rearFan);
  for (let i = 0; i < 4; i++) {
    box(rearKit, M.metalDark, 0.6, 0.028, 0.02, -3.9, 0.28 + i * 0.08, -5.998, { cast: false });
  }
  // rear drain + small step bucket
  cylinder(rearKit, M.metalDark, 0.045, 0.045, 2.0, 1.0, 1.17, -5.9, { seg: 8, cast: false });
  box(rearKit, M.cardboard, 0.36, 0.3, 0.32, -1.9, 0.32, -6.28, { outline: 0.01, ry: 0.2 });
  box(rearKit, M.bluePlastic, 0.28, 0.38, 0.28, -2.45, 0.36, -6.3, { outline: 0.008 });
}

// ------------------------------------------------------------
// Bulletin board + alley entrance
// ------------------------------------------------------------
const noticeKit = kit('38-公告栏', 3.76, { fromY: -0.6, scaleFrom: 0.9 });
// The main community boards are mounted on the shop walls (front-left and
// right side). Keep the old freestanding prop out of the way in the alley,
// but hidden so the entrance stays legible.
noticeKit.visible = false;
kits.splice(kits.indexOf(noticeKit), 1);
{
  const nx = -5.55;
  const nz = -0.22;
  box(noticeKit, M.woodDark, 0.1, 1.95, 0.1, -6.12, SIDEWALK_TOP + 0.975, nz, { outline: 0.008 });
  box(noticeKit, M.woodDark, 0.1, 1.95, 0.1, -4.98, SIDEWALK_TOP + 0.975, nz, { outline: 0.008 });
  box(noticeKit, M.wood, 1.32, 0.08, 0.16, nx, SIDEWALK_TOP + 1.92, nz, { outline: 0.008 });
  box(noticeKit, M.wood, 1.32, 0.08, 0.16, nx, SIDEWALK_TOP + 0.88, nz, { outline: 0.008 });
  box(noticeKit, M.woodDark, 1.22, 1.08, 0.06, nx, SIDEWALK_TOP + 1.4, nz, { outline: 0.008 });
  texturedPlane(noticeKit, TEX.poster, 1.1, 0.825, nx, SIDEWALK_TOP + 1.4, nz + 0.036);
  // little pitched roof
  box(noticeKit, M.woodDark, 1.48, 0.07, 0.44, nx, SIDEWALK_TOP + 1.99, nz, { rx: 0.1 });
  box(noticeKit, M.woodDark, 1.48, 0.06, 0.36, nx, SIDEWALK_TOP + 2.03, nz + 0.08, { rx: 0.45 });
  // pins and small lamp
  for (let i = 0; i < 6; i++) {
    sphere(noticeKit, basic(i % 2 ? 0xd9a85e : 0x9e4f45), 0.018, nx - 0.3 + rand(0, 0.6), SIDEWALK_TOP + 1.3 + rand(0, 0.45), nz + 0.08, { seg: 6, cast: false });
  }
  cylinder(noticeKit, M.wallCream, 0.06, 0.05, 0.22, -4.98, SIDEWALK_TOP + 2.0, nz + 0.12, { seg: 8, cast: false });
  // potted shrub at the foot
  cylinder(noticeKit, M.concrete, 0.17, 0.13, 0.28, -6.4, SIDEWALK_TOP + 0.14, nz + 0.1, { seg: 12, outline: 0.008 });
  for (let i = 0; i < 5; i++) {
    sphere(noticeKit, M.trimGreen, 0.11, -6.4 + rand(-0.12, 0.12), SIDEWALK_TOP + 0.36 + rand(0, 0.14), nz + 0.1 + rand(-0.1, 0.1), { seg: 7 });
  }
}

const alleyKit = kit('39-小巷入口', 3.66, { fromY: -0.85, scaleFrom: 0.92 });
{
  // boundary wall running along the left edge
  box(alleyKit, M.concrete, 0.12, 2.15, 5.4, -6.82, SIDEWALK_TOP + 1.075, -3.55, { cast: false, outline: 0.006 });
  box(alleyKit, M.concreteDark, 0.2, 0.08, 5.5, -6.82, SIDEWALK_TOP + 2.18, -3.55, { cast: false });
  // rear boundary wall
  box(alleyKit, M.concrete, 8.45, 1.28, 0.12, -2.57, SIDEWALK_TOP + 0.64, -6.82, { cast: false, outline: 0.006 });
  // left wall detail: pipe, meter box and a small posted notice
  cylinder(alleyKit, M.metalDark, 0.028, 0.028, 2.6, -6.75, SIDEWALK_TOP + 1.3, -2.2, { seg: 8, cast: false });
  box(alleyKit, M.metal, 0.09, 0.34, 0.28, -6.73, SIDEWALK_TOP + 1.0, -3.6, { cast: false });
  texturedPlane(alleyKit, TEX.poster, 0.42, 0.31, -6.715, SIDEWALK_TOP + 1.28, -1.75, { ry: Math.PI / 2, toneMapped: true });
  box(alleyKit, M.concreteDark, 8.55, 0.08, 0.2, -2.57, SIDEWALK_TOP + 1.3, -6.82, { cast: false });
  for (let i = 0; i < 9; i++) {
    box(alleyKit, M.wallShadow, 0.03, 0.9, 0.01, -6.3 + i * 0.95, SIDEWALK_TOP + 0.62, -6.753, { cast: false });
  }
  // back wall of the alley with a small warm door and window
  box(alleyKit, M.wallCreamDark, 1.92, 2.3, 0.1, -5.76, SIDEWALK_TOP + 1.15, -6.18, { outline: 0.007 });
  const warmWin = basic(0xffca77);
  box(alleyKit, warmWin, 0.38, 0.45, 0.03, -5.95, SIDEWALK_TOP + 1.55, -6.12, { cast: false, receive: false });
  box(alleyKit, M.woodDark, 0.46, 0.53, 0.05, -5.95, SIDEWALK_TOP + 1.55, -6.15, { cast: false });
  box(alleyKit, warmWin, 0.33, 0.4, 0.025, -5.95, SIDEWALK_TOP + 1.55, -6.116, { cast: false, receive: false });
  makeGlowSprite(0xffbf72, 0.9, -5.95, SIDEWALK_TOP + 1.55, -6.05, 0.2, alleyKit);
  // sliding wooden door
  box(alleyKit, M.woodDark, 0.68, 1.65, 0.06, -5.2, SIDEWALK_TOP + 0.83, -6.12, { cast: false });
  for (let i = 0; i < 4; i++) {
    box(alleyKit, M.wood, 0.58, 0.03, 0.07, -5.2, SIDEWALK_TOP + 0.5 + i * 0.34, -6.08, { cast: false });
  }
  // gate posts and lintel
  box(alleyKit, M.woodDark, 0.13, 2.5, 0.13, -6.64, SIDEWALK_TOP + 1.25, -1.04, { outline: 0.008 });
  box(alleyKit, M.woodDark, 0.13, 2.5, 0.13, -4.86, SIDEWALK_TOP + 1.25, -1.04, { outline: 0.008 });
  box(alleyKit, M.wood, 1.95, 0.16, 0.18, -5.75, SIDEWALK_TOP + 2.48, -1.04, { outline: 0.008 });
  // little tiled roof over the gate
  box(alleyKit, M.woodDark, 2.25, 0.08, 0.52, -5.75, SIDEWALK_TOP + 2.62, -1.04, { rx: 0.13, outline: 0.008 });
  box(alleyKit, M.trimGreen, 2.28, 0.05, 0.05, -5.75, SIDEWALK_TOP + 2.57, -0.79, { cast: false });
  // split noren curtains
  for (let i = 0; i < 3; i++) {
    const geo = new THREE.PlaneGeometry(0.49, 0.63);
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) {
      uv.setX(k, uv.getX(k) / 3 + i / 3);
    }
    uv.needsUpdate = true;
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: TEX.noren, side: THREE.DoubleSide }));
    m.position.set(-6.27 + i * 0.51, SIDEWALK_TOP + 2.08, -1.07);
    alleyKit.add(m);
  }
  // paper lantern
  const lantern = new THREE.Group();
  lantern.position.set(-5.72, SIDEWALK_TOP + 2.18, -0.97);
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.15, 0.36, 14),
    new THREE.MeshBasicMaterial({ color: 0xffe1a9 })
  );
  lantern.add(body);
  const bandMat = new THREE.MeshBasicMaterial({ color: 0xc95841 });
  [0.17, 0.06].forEach((y) => {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.025, 14), bandMat);
    band.position.y = y;
    lantern.add(band);
  });
  const lantTex = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#b34336';
    ctx.font = `800 68px ${FONT_JP}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('酒', w / 2, h / 2);
  });
  const glyph = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ map: lantTex, transparent: true, side: THREE.DoubleSide })
  );
  glyph.position.set(0, 0, 0.151);
  lantern.add(glyph);
  barBetween(lantern, M.metalDark, [0, 0.18, 0], [0, 0.42, 0], 0.012);
  alleyKit.add(lantern);
  makeGlowSprite(0xffb66d, 1.3, -5.72, SIDEWALK_TOP + 2.18, -0.95, 0.3, alleyKit);
  softLightPool(alleyKit, 0xff9450, 1.5, 1.7, -5.72, -1.35, 0.22, 0.181);
  // alley clutter
  box(alleyKit, M.cardboard, 0.48, 0.36, 0.4, -6.1, SIDEWALK_TOP + 0.2, -2.72, { outline: 0.012, ry: 0.08 });
  box(alleyKit, M.cardboard, 0.42, 0.31, 0.34, -6.23, SIDEWALK_TOP + 0.19, -3.2, { outline: 0.012, ry: -0.12 });
  cylinder(alleyKit, M.metalDark, 0.12, 0.13, 0.55, -6.42, SIDEWALK_TOP + 0.28, -2.1, { seg: 10 });
  box(alleyKit, M.wood, 0.32, 0.2, 0.25, -5.25, SIDEWALK_TOP + 0.11, -2.45, { outline: 0.01, ry: -0.2 });
  puddle(alleyKit, -5.6, -2.1, 0.55, 0.25, 0.2, 0.5, 0.181);
  // drainpipe up the store's left wall
  cylinder(alleyKit, M.curb, 0.045, 0.045, 3.1, -4.83, SIDEWALK_TOP + 1.56, -3.3, { seg: 8 });
  box(alleyKit, M.metalDark, 0.14, 0.05, 0.1, -4.83, SIDEWALK_TOP + 0.6, -3.3, { cast: false });
  box(alleyKit, M.metalDark, 0.14, 0.05, 0.1, -4.83, SIDEWALK_TOP + 2.2, -3.3, { cast: false });
  // warm alley light
  const alleyLight = new THREE.PointLight(0xffb06a, 0.58, 4.2, 1.8);
  alleyLight.position.set(-5.75, 2.1, -2.0);
  alleyKit.add(alleyLight);
}

// Interior objects never receive the moon's shadow pass, so keeping them out
// of the shadow map saves a few hundred draw calls per frame.
[interiorKit, fridgeKit, shelfAKit, shelfBKit, counterKit, detailKit, hangingKit].forEach((k) => {
  k.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
});

// ------------------------------------------------------------
// Street greenery, flowers and sunny-day props
// ------------------------------------------------------------
const LEAF_MATS = [
  toon(0x2f6d35, { soft: true, flatShading: true }),
  toon(0x437e3c, { soft: true, flatShading: true }),
  toon(0x235a2d, { soft: true, flatShading: true }),
  toon(0x5b9c48, { soft: true, flatShading: true }),
];
const FLOWER_MATS = [
  toon(0xff7f94), toon(0xffcf52), toon(0xffffff), toon(0xff9b47), toon(0xb58ae8),
];

function addFlower(parent, x, y, z, colorIndex = 0, scale = 1) {
  cylinder(parent, toon(0x4b8a43), 0.007 * scale, 0.009 * scale, 0.24 * scale, x, y + 0.12 * scale, z, { seg: 5, cast: false, receive: false });
  const mat = FLOWER_MATS[colorIndex % FLOWER_MATS.length];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    sphere(parent, mat, 0.035 * scale, x + Math.cos(a) * 0.035 * scale, y + 0.24 * scale, z + Math.sin(a) * 0.035 * scale, { seg: 6, cast: false });
  }
  sphere(parent, basic(0xffe08a), 0.027 * scale, x, y + 0.25 * scale, z, { seg: 6, cast: false });
}

const interactiveTrees = [];

function addTree(parent, x, z, scale = 1, planterSize = 0.74) {
  const base = SIDEWALK_TOP;
  const treeRecord = {
    x, z, scale, base,
    canopyY: base + 2.25 * scale,
    leaves: [],
    swing: 0,
    glow: null,
    glowBase: 1.4 * scale,
  };
  interactiveTrees.push(treeRecord);
  box(parent, M.concrete, planterSize, 0.3, planterSize, x, base + 0.15, z, { outline: 0.012 });
  box(parent, toon(0x8b6446), planterSize - 0.08, 0.055, planterSize - 0.08, x, base + 0.32, z, { cast: false });
  box(parent, toon(0x4b3528), planterSize - 0.14, 0.02, planterSize - 0.14, x, base + 0.355, z, { cast: false });
  // trunk and a couple of forked branches
  cylinder(parent, toon(0x8a5c3f), 0.075 * scale, 0.12 * scale, 1.25 * scale, x, base + 0.95 * scale, z, { seg: 8, outline: 0.012 });
  barBetween(parent, toon(0x805437), [x, base + 1.2 * scale, z], [x - 0.42 * scale, base + 2.0 * scale, z + 0.14 * scale], 0.045 * scale);
  barBetween(parent, toon(0x805437), [x, base + 1.42 * scale, z], [x + 0.38 * scale, base + 2.15 * scale, z - 0.1 * scale], 0.04 * scale);
  barBetween(parent, toon(0x805437), [x + 0.05, base + 1.7 * scale, z], [x + 0.08, base + 2.35 * scale, z + 0.18 * scale], 0.035 * scale);
  const clumps = [
    [0, 2.25, 0, 0.62, 0],
    [-0.5, 2.0, 0.18, 0.48, 1],
    [0.5, 2.05, -0.12, 0.5, 2],
    [-0.22, 2.55, -0.15, 0.45, 3],
    [0.28, 2.6, 0.18, 0.42, 1],
    [0.02, 2.0, -0.4, 0.4, 0],
    [-0.63, 2.36, 0.32, 0.34, 2],
    [0.63, 2.34, 0.3, 0.35, 0],
    [0.0, 2.84, 0.02, 0.36, 1],
  ];
  clumps.forEach(([dx, y, dz, r, mi]) => {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r * scale, 1), LEAF_MATS[mi]);
    mesh.position.set(x + dx * scale, base + y * scale, z + dz * scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    addOutline(mesh, 0.018);
    // Keep the crown out of the batching pass so it can sway independently.
    mesh.traverse((o) => {
      if (o.isMesh) o.userData.noMerge = true;
    });
    parent.add(mesh);
    treeRecord.leaves.push({
      mesh,
      baseX: mesh.rotation.x,
      baseZ: mesh.rotation.z,
      phase: Math.random() * TAU,
      speed: rand(0.8, 1.35),
    });
  });
  // a few soft blossoms / berries
  for (let i = 0; i < 7; i++) {
    sphere(parent, i % 3 === 0 ? toon(0xf7e5a2) : toon(0xffb7c5), 0.035 * scale, x + rand(-0.55, 0.55) * scale, base + rand(2.0, 2.65) * scale, z + rand(-0.45, 0.45) * scale, { seg: 6, cast: false });
  }
  // little flowers in the planter
  for (let i = 0; i < 5; i++) {
    addFlower(parent, x + rand(-0.25, 0.25) * planterSize, base + 0.34, z + planterSize * 0.48 + rand(-0.04, 0.04), i, 0.7);
  }
}

function addFlowerBox(parent, x, z, w = 1.0) {
  const y = SIDEWALK_TOP + 0.14;
  box(parent, M.wood, w, 0.25, 0.28, x, y, z, { outline: 0.012 });
  box(parent, toon(0x4b3528), w - 0.1, 0.03, 0.19, x, y + 0.12, z, { cast: false });
  for (let i = 0; i < 7; i++) {
    const px = x - w / 2 + 0.13 + i * ((w - 0.26) / 6);
    sphere(parent, LEAF_MATS[i % 2], 0.1, px, y + 0.18, z + rand(-0.03, 0.03), { seg: 6, cast: false });
    addFlower(parent, px, y + 0.15, z + 0.03, i, 0.8);
  }
}

const greeneryKit = kit('60-街角绿植', 0, { fromY: 0, scaleFrom: 1 });
{
  // main street tree behind the far-side guardrail
  addTree(greeneryKit, 6.3, 3.65, 0.62, 0.54);
  // small rounded shrub at the left-side alley corner
  addTree(greeneryKit, -6.12, 0.1, 0.45, 0.44);
  // flower boxes under the shop windows
  addFlowerBox(greeneryKit, -3.95, -0.5, 1.0);
  addFlowerBox(greeneryKit, -2.1, -0.5, 1.0);
  // flowers at the base of the street lamp
  box(greeneryKit, M.concrete, 0.9, 0.18, 0.55, -3.68, SIDEWALK_TOP + 0.09, 1.85, { outline: 0.01 });
  for (let i = 0; i < 8; i++) {
    addFlower(greeneryKit, -3.68 + rand(-0.34, 0.34), SIDEWALK_TOP + 0.18, 1.85 + rand(-0.16, 0.16), i, 0.8);
  }
  // hanging flower basket on the lamp arm
  const hx = -3.68;
  const hz = 2.25;
  cylinder(greeneryKit, M.metalDark, 0.012, 0.012, 0.55, hx, 3.78, hz, { seg: 5, cast: false });
  cylinder(greeneryKit, M.cardboard, 0.16, 0.12, 0.22, hx, 3.42, hz, { seg: 12, outline: 0.01 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    sphere(greeneryKit, LEAF_MATS[i % 2], 0.11, hx + Math.cos(a) * 0.13, 3.47, hz + Math.sin(a) * 0.13, { seg: 6 });
    addFlower(greeneryKit, hx + Math.cos(a) * 0.16, 3.4, hz + Math.sin(a) * 0.16, i, 0.65);
  }
}

const sunnyDecor = new THREE.Group();
sunnyDecor.name = 'sunny-day-decor';
world.add(sunnyDecor);

// Balloons tied to the bicycle basket.
const balloonHome = new THREE.Vector3(2.55, SIDEWALK_TOP + 0.82, -0.35);
const balloonPivot = new THREE.Group();
balloonPivot.position.copy(balloonHome);
sunnyDecor.add(balloonPivot);
const balloonRecords = [];
const balloonStringGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 5);

function updateBalloonString(record) {
  const start = new THREE.Vector3(0, 0.03, 0);
  const end = new THREE.Vector3(
    record.group.position.x,
    record.group.position.y - 0.2,
    record.group.position.z + 0.01
  );
  const dir = end.clone().sub(start);
  const len = Math.max(0.001, dir.length());
  record.string.position.copy(start).addScaledVector(dir, 0.5);
  record.string.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  record.string.scale.set(1, len, 1);
}

{
  const balloonColors = [0xff7e8b, 0xffd152, 0x67c8ee];
  balloonColors.forEach((color, i) => {
    const bx = -0.3 + i * 0.3;
    const by = 0.92 + (i === 1 ? 0.2 : 0);
    const bg = new THREE.Group();
    bg.position.set(bx, by, 0.01);
    balloonPivot.add(bg);

    const balloon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), toon(color, { soft: true }));
    balloon.scale.set(1, 1.22, 1);
    balloon.castShadow = false;
    bg.add(balloon);
    const knot = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 8), toon(color));
    knot.position.set(0, -0.19, 0);
    knot.rotation.z = Math.PI;
    knot.castShadow = false;
    bg.add(knot);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), basic(0xffffff));
    shine.position.set(-0.05, 0.07, 0.105);
    shine.castShadow = false;
    bg.add(shine);

    const string = new THREE.Mesh(balloonStringGeo, M.metalDark);
    string.castShadow = false;
    string.receiveShadow = false;
    balloonPivot.add(string);

    const record = {
      group: bg,
      base: new THREE.Vector3(bx, by, 0.01),
      string,
      offset: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      bob: 0,
      bobT: 0,
      dragActive: false,
      returning: false,
      hit: null,
      phase: Math.random() * TAU,
      windPhase: Math.random() * TAU,
    };
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), INVISIBLE_HIT_MAT);
    hit.layers.set(HIT_LAYER);
    hit.userData.interaction = { type: 'balloon', record };
    bg.add(hit);
    record.hit = hit;
    balloonRecords.push(record);
    updateBalloonString(record);
  });
}

// Hand-painted sunny posters and cute stickers.
TEX.sunnyPoster = canvasTexture(512, 720, (ctx, w, h) => {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#88d3f4');
  sky.addColorStop(0.48, '#dff3f7');
  sky.addColorStop(1, '#ffe8a8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f6c84f';
  ctx.beginPath(); ctx.arc(90, 110, 52, 0, TAU); ctx.fill();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    ctx.save(); ctx.translate(90, 110); ctx.rotate(a);
    ctx.fillStyle = '#f7d66e';
    ctx.fillRect(-7, -78, 14, 22);
    ctx.restore();
  }
  ctx.fillStyle = '#55945e';
  ctx.beginPath(); ctx.ellipse(w / 2, h - 90, 250, 120, 0, 0, TAU); ctx.fill();
  // sunflowers
  for (let i = 0; i < 5; i++) {
    const fx = 105 + i * 77;
    const fy = 480 + (i % 2) * 50;
    ctx.strokeStyle = '#3c7c46'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx - 10, fy + 125); ctx.stroke();
    ctx.fillStyle = '#f3b834';
    for (let p = 0; p < 10; p++) {
      const a = (p / 10) * TAU;
      ctx.beginPath();
      ctx.ellipse(fx + Math.cos(a) * 28, fy + Math.sin(a) * 28, 15, 8, a, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#6b4528';
    ctx.beginPath(); ctx.arc(fx, fy, 19, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = '#285c46';
  ctx.font = `900 73px ${FONT_JP}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('夏まつり', w / 2, 188);
  ctx.fillStyle = '#fffdf1';
  ctx.font = `700 28px ${FONT_JP}`;
  ctx.fillText('ひまわりと、こども縁日', w / 2, 246);
  ctx.fillStyle = '#e76c54';
  ctx.font = `800 24px ${FONT_JP}`;
  ctx.fillText('星見町内会', w / 2, 650);
});

TEX.sunnyPoster2 = canvasTexture(512, 720, (ctx, w, h) => {
  ctx.fillStyle = '#f7efd8';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2d6d55';
  ctx.fillRect(0, 0, w, 156);
  ctx.fillStyle = '#fff9e8';
  ctx.font = `900 66px ${FONT_JP}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('新商品入荷', w / 2, 82);
  ctx.fillStyle = '#d86b3f';
  ctx.fillRect(44, 198, w - 88, 270);
  ctx.fillStyle = '#fff3cf';
  ctx.beginPath(); ctx.arc(w / 2, 332, 98, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e8a54b';
  ctx.beginPath(); ctx.arc(w / 2, 332, 74, 0, TAU); ctx.fill();
  ctx.fillStyle = '#7b4b2a';
  ctx.font = `800 30px ${FONT_JP}`;
  ctx.fillText('あんバター', w / 2, 455);
  ctx.fillStyle = '#3c7c54';
  ctx.font = `700 23px ${FONT_JP}`;
  ctx.fillText('HOSHIMI MART 24H', w / 2, 560);
  ctx.fillStyle = '#7a6a4f';
  ctx.font = `500 19px ${FONT_JP}`;
  ctx.fillText('期間限定・なくなり次第終了', w / 2, 620);
});

TEX.sunnyPoster3 = canvasTexture(512, 720, (ctx, w, h) => {
  ctx.fillStyle = '#e9f2e8';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#6a8d72';
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, w - 40, h - 40);
  ctx.fillStyle = '#4d6b55';
  ctx.font = `900 48px ${FONT_JP}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ねこを さがしています', w / 2, 92);
  // a simple hand-drawn cat
  ctx.fillStyle = '#d6b98f';
  ctx.beginPath(); ctx.ellipse(w / 2, 305, 125, 105, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(140, 245); ctx.lineTo(162, 155); ctx.lineTo(215, 210); ctx.fill();
  ctx.beginPath(); ctx.moveTo(372, 245); ctx.lineTo(350, 155); ctx.lineTo(297, 210); ctx.fill();
  ctx.fillStyle = '#4c3b2a';
  ctx.beginPath(); ctx.arc(205, 300, 10, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(307, 300, 10, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(256, 325); ctx.lineTo(238, 342); ctx.lineTo(274, 342); ctx.fill();
  ctx.strokeStyle = '#4c3b2a';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(256, 345, 32, 0.1, Math.PI - 0.1); ctx.stroke();
  ctx.fillStyle = '#526b54';
  ctx.font = `700 25px ${FONT_JP}`;
  ctx.fillText('茶トラ・オス・人なつこい', w / 2, 485);
  ctx.fillStyle = '#9a543f';
  ctx.font = `800 27px ${FONT_JP}`;
  ctx.fillText('星見町内会 090-xxxx-xxxx', w / 2, 585);
});

TEX.glassSun = canvasTexture(512, 1024, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, 'rgba(193,231,255,0.18)');
  sky.addColorStop(0.3, 'rgba(215,242,255,0.08)');
  sky.addColorStop(0.62, 'rgba(255,247,220,0.055)');
  sky.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(245,253,255,0.17)';
  ctx.lineWidth = 10;
  [0.18, 0.5, 0.8].forEach((t) => {
    ctx.beginPath();
    ctx.moveTo(w * t - 60, h);
    ctx.lineTo(w * t + 175, 0);
    ctx.stroke();
  });
  ctx.fillStyle = 'rgba(255,248,218,0.13)';
  ctx.beginPath();
  ctx.ellipse(360, 215, 100, 32, -0.35, 0, TAU);
  ctx.fill();
});

TEX.sunnySticker = canvasTexture(256, 256, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#fff9dc';
  ctx.beginPath(); ctx.arc(w / 2, h / 2, 112, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#f1b943'; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.arc(w / 2, h / 2, 103, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#ffcf51';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    ctx.beginPath();
    ctx.ellipse(w / 2 + Math.cos(a) * 73, h / 2 + Math.sin(a) * 73, 20, 10, a, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#ffd76b';
  ctx.beginPath(); ctx.arc(w / 2, h / 2, 55, 0, TAU); ctx.fill();
  ctx.fillStyle = '#72503a';
  ctx.beginPath(); ctx.arc(w / 2 - 19, h / 2 - 4, 6, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(w / 2 + 19, h / 2 - 4, 6, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#72503a'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(w / 2, h / 2 + 14, 23, 0.15, Math.PI - 0.15); ctx.stroke();
  ctx.fillStyle = '#4a8065';
  ctx.font = `800 21px ${FONT_EN}`;
  ctx.textAlign = 'center';
  ctx.fillText('SUNNY DAY', w / 2, 215);
});

// Poster over the side-wall notice board and left lobby board. These stay
// outside the sunny-only group so they can be admired in either weather.
const sunnyBoardPoster = texturedPlane(world, TEX.sunnyPoster, 0.47, 0.62, STORE_X1 + 0.042, 2.36, -2.34, {
  ry: Math.PI / 2,
  transparent: false,
});
const sunnyLeftPoster = texturedPlane(world, TEX.sunnyPoster, 0.46, 0.6, STORE_X0 - 0.045, 1.7, -2.48, {
  ry: -Math.PI / 2,
});
const posterPlanes = [sunnyBoardPoster, sunnyLeftPoster];
const POSTER_TEXTURES = [TEX.sunnyPoster, TEX.sunnyPoster2, TEX.sunnyPoster3];
// small stickers on the glass
texturedPlane(sunnyDecor, TEX.sunnySticker, 0.34, 0.34, -3.58, 1.04, -0.915, { transparent: true });
texturedPlane(sunnyDecor, TEX.sunnySticker, 0.27, 0.27, 0.72, 1.02, -0.915, { transparent: true });
// soft natural reflections on the clean windows
[
  [-3.71, 1.39],
  [-2.3, 1.37],
  [-1.05, 1.07],
].forEach(([x, w]) => {
  texturedPlane(sunnyDecor, TEX.glassSun, w, 2.08, x, 1.51, -0.927, {
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
});

// little flowers in the bicycle basket (kept with the bike, not the sunny layer)
const bikeBasketFlowerGroup = new THREE.Group();
sunnyDecor.add(bikeBasketFlowerGroup);
for (let i = 0; i < 4; i++) {
  cylinder(bikeBasketFlowerGroup, toon(0x4d8a43), 0.006, 0.008, 0.28, 2.55 + rand(-0.1, 0.1), SIDEWALK_TOP + 1.17, -0.3, { seg: 5, cast: false, receive: false });
  sphere(bikeBasketFlowerGroup, FLOWER_MATS[i % FLOWER_MATS.length], 0.055, 2.55 + rand(-0.1, 0.1), SIDEWALK_TOP + 1.31, -0.3, { seg: 6, cast: false });
}

// festival bunting above the alley gate
const festivalFlags = [];
{
  const points = [
    new THREE.Vector3(-6.55, SIDEWALK_TOP + 2.95, -0.94),
    new THREE.Vector3(-5.86, SIDEWALK_TOP + 2.82, -0.94),
    new THREE.Vector3(-5.17, SIDEWALK_TOP + 2.95, -0.94),
  ];
  const curve = new THREE.CatmullRomCurve3(points);
  const stringGeo = new THREE.TubeGeometry(curve, 24, 0.008, 4, false);
  const stringMesh = new THREE.Mesh(stringGeo, M.metalDark);
  sunnyDecor.add(stringMesh);
  const flagColors = [0xff8797, 0xffd15a, 0x75c7ea, 0x91d16c, 0xf0a1cc, 0xffa95d];
  const shape = new THREE.Shape();
  shape.moveTo(-0.1, 0);
  shape.lineTo(0.1, 0);
  shape.lineTo(0, -0.22);
  shape.closePath();
  const flagGeo = new THREE.ShapeGeometry(shape);
  for (let i = 0; i < 6; i++) {
    const t = 0.08 + i * 0.16;
    const p = curve.getPoint(t);
    const flag = new THREE.Mesh(flagGeo, toon(flagColors[i], { side: THREE.DoubleSide }));
    flag.position.copy(p);
    flag.position.y -= 0.02;
    flag.rotation.z = 0.06 * Math.sin(i * 2.1);
    sunnyDecor.add(flag);
    festivalFlags.push({ flag, baseZ: flag.rotation.z, phase: i * 1.3 });
  }
}

// Warm sunny light patches (actual shadows still do most of the work).
const sunPatches = [];
function sunnyPatch(x, z, w, d, opacity = 0.08, y = 0.172) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xffe7b0) },
      uOpacity: { value: opacity },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float d = length((vUv - 0.5) * vec2(1.0, 1.35)) * 2.0;
        float a = (1.0 - smoothstep(0.1, 1.0, d)) * uOpacity;
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.renderOrder = 5;
  sunnyDecor.add(mesh);
  sunPatches.push({
    mesh,
    mat,
    baseX: x,
    baseZ: z,
    baseOpacity: opacity,
    width: w,
    depth: d,
    flash: 0,
    driftX: 0,
    driftZ: 0,
  });
  return mesh;
}
sunnyPatch(0.2, -0.25, 1.25, 0.7, 0.075);
sunnyPatch(-2.8, 0.5, 2.2, 0.75, 0.055);
sunnyPatch(2.65, 4.15, 1.5, 0.9, 0.045, 0.054);

// ------------------------------------------------------------
// Static geometry batching
// ------------------------------------------------------------
// The diorama is built from hundreds of small boxes, cans and strips. Merging
// opaque meshes per kit keeps the hand-built look while cutting draw calls.
// Animated and transparent pieces are deliberately excluded.
function mergeOpaqueGeometry(list) {
  let positionCount = 0;
  list.forEach((g) => { positionCount += g.attributes.position.count; });
  const positions = new Float32Array(positionCount * 3);
  const normals = new Float32Array(positionCount * 3);
  const uvs = new Float32Array(positionCount * 2);
  let pOff = 0, nOff = 0, uOff = 0;
  list.forEach((g) => {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const u = g.attributes.uv;
    positions.set(p.array, pOff);
    pOff += p.array.length;
    if (n) normals.set(n.array, nOff);
    nOff += p.count * 3;
    if (u) uvs.set(u.array, uOff);
    uOff += p.count * 2;
  });
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

function mergeOpaqueMeshesInKit(root) {
  root.updateMatrixWorld(true);
  const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const doomed = [];
  root.traverse((obj) => {
    if (!obj.isMesh || obj.isSkinnedMesh || obj.isInstancedMesh) return;
    if (obj.userData.noMerge) return;
    const mat = obj.material;
    if (!mat || Array.isArray(mat) || mat.transparent || mat.opacity < 0.999) return;
    if (mat.isShaderMaterial) return;
    const key = `${mat.uuid}|${obj.castShadow ? 1 : 0}|${obj.receiveShadow ? 1 : 0}|${obj.renderOrder}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        material: mat,
        castShadow: obj.castShadow,
        receiveShadow: obj.receiveShadow,
        renderOrder: obj.renderOrder,
        geometries: [],
      });
    }
    let geo = obj.geometry.index ? obj.geometry.toNonIndexed() : obj.geometry.clone();
    const m = new THREE.Matrix4().multiplyMatrices(invRoot, obj.matrixWorld);
    geo.applyMatrix4(m);
    buckets.get(key).geometries.push(geo);
    doomed.push(obj);
  });
  doomed.forEach((obj) => { if (obj.parent) obj.parent.remove(obj); });
  buckets.forEach((b) => {
    if (b.geometries.length === 0) return;
    const merged = mergeOpaqueGeometry(b.geometries);
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.castShadow = b.castShadow;
    mesh.receiveShadow = b.receiveShadow;
    mesh.renderOrder = b.renderOrder;
    root.add(mesh);
    b.geometries.forEach((g) => g.dispose());
  });
}

kits.forEach((k) => {
  mergeOpaqueMeshesInKit(k);
});

// The bike-basket balloon string is attached to the bike itself, not to the
// sunny decor layer, so it can never be left floating when the bicycle moves.
sunnyDecor.remove(balloonPivot);
bikeKit.add(balloonPivot);
balloonPivot.position.copy(balloonHome);
balloonPivot.visible = true;
sunnyDecor.remove(bikeBasketFlowerGroup);
bikeKit.add(bikeBasketFlowerGroup);
bikeBasketFlowerGroup.position.set(0, 0, 0);
bikeBasketFlowerGroup.visible = true;

// ------------------------------------------------------------
// Rain, splashes and soft light shafts
// ------------------------------------------------------------
const RAIN_COUNT = 1100;
const rainGeometry = new THREE.BufferGeometry();
{
  const positions = new Float32Array(RAIN_COUNT * 2 * 3);
  const seeds = new Float32Array(RAIN_COUNT * 2);
  const speeds = new Float32Array(RAIN_COUNT * 2);
  const tips = new Float32Array(RAIN_COUNT * 2);
  let drop = 0;
  for (let i = 0; i < RAIN_COUNT; i++) {
    let x = rand(-7.4, 7.4);
    let z = rand(-7.4, 7.4);
    // don't let rain fall through the roof (or under the entrance canopy)
    let guard = 0;
    while (
      guard++ < 40 &&
      ((x > STORE_X0 - 0.3 && x < STORE_X1 + 0.3 && z > STORE_Z0 - 0.3 && z < STORE_Z1 + 0.4) ||
        (x > -1.4 && x < 1.8 && z > -1.3 && z < 0.35))
    ) {
      x = rand(-7.4, 7.4);
      z = rand(-7.4, 7.4);
    }
    const y = rand(0.0, 9.9);
    const seed = Math.random();
    const speed = rand(6.2, 10.8);
    for (let v = 0; v < 2; v++) {
      const o = (drop + v) * 3;
      positions[o] = x;
      positions[o + 1] = y;
      positions[o + 2] = z;
      seeds[drop + v] = seed;
      speeds[drop + v] = speed;
      tips[drop + v] = v;
    }
    drop += 2;
  }
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  rainGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  rainGeometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  rainGeometry.setAttribute('aTip', new THREE.BufferAttribute(tips, 1));
}
const rainMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uOpacity: { value: 0 },
    uTint: { value: new THREE.Color(0xb9d8ff) },
  },
  vertexShader: `
    uniform float uTime;
    attribute float aSeed;
    attribute float aSpeed;
    attribute float aTip;
    varying float vA;
    varying vec2 vUv;
    void main() {
      vec3 p = position;
      float travel = mod(p.y - uTime * aSpeed + aSeed * 11.3, 10.2);
      p.y = travel + 0.03 - aTip * 0.34;
      p.x += (1.0 - travel / 10.2) * 0.48 - aTip * 0.15;
      p.z += (1.0 - travel / 10.2) * 0.08;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      vA = (0.12 + 0.24 * smoothstep(0.0, 2.0, travel)) * (1.0 - aTip * 0.3);
      vUv = uv;
    }
  `,
  fragmentShader: `
    uniform vec3 uTint;
    uniform float uOpacity;
    varying float vA;
    varying vec2 vUv;
    void main() {
      float fade = 1.0;
      gl_FragColor = vec4(uTint, vA * uOpacity * fade);
    }
  `,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  depthTest: true,
});
const rain = new THREE.LineSegments(rainGeometry, rainMaterial);
rain.frustumCulled = false;
rain.renderOrder = 8;
scene.add(rain);

// rain-splash rings
const splashGroup = new THREE.Group();
scene.add(splashGroup);
const splashGeom = new THREE.RingGeometry(0.032, 0.052, 16);
const SPLASHES = [];
{
  for (let i = 0; i < 54; i++) {
    let x = rand(-6.6, 6.6);
    let z = rand(-6.6, 6.6);
    let tries = 0;
    while (tries++ < 30 && x > STORE_X0 - 0.1 && x < STORE_X1 + 0.1 && z > STORE_Z0 && z < STORE_Z1) {
      x = rand(-6.6, 6.6);
      z = rand(-6.6, 6.6);
    }
    const onSidewalk =
      (x < 3.16 && z < 2.0) || (z > 5.35 && z < 6.82) || (x > 5.85 && x < 6.82);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xc6e5ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(splashGeom, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, onSidewalk ? SIDEWALK_TOP + 0.006 : 0.055, z);
    m.renderOrder = 5;
    splashGroup.add(m);
    SPLASHES.push({ mesh: m, mat, phase: Math.random() * 2, period: rand(0.72, 1.45), base: m.position.clone() });
  }
}

// soft light shafts in the rain
TEX.lightShaft = canvasTexture(128, 512, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0.0)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.05)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.2)');
  g.addColorStop(1, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
});
function lightShaft(x, y, z, color, bottomR, height, opacity) {
  const mat = new THREE.MeshBasicMaterial({
    map: TEX.lightShaft,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const geo = new THREE.CylinderGeometry(0.16, bottomR, height, 18, 1, true);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.renderOrder = 6;
  scene.add(mesh);
  return mesh;
}
const lampShaft = lightShaft(-3.68, 2.16, 2.42, 0xffbf7a, 1.55, 4.1, 0);
lampShaft.visible = false;

// very light drifting mist patches
const mistMat = new THREE.MeshBasicMaterial({
  map: RADIAL_TEX,
  color: 0x6b89aa,
  transparent: true,
  opacity: 0.035,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const mistPatches = [];
for (let i = 0; i < 7; i++) {
  const mist = new THREE.Mesh(new THREE.PlaneGeometry(rand(2.2, 4.6), rand(1.0, 2.0)), mistMat);
  mist.rotation.x = -Math.PI / 2;
  mist.position.set(rand(-5, 5), 0.075 + rand(0, 0.03), rand(-5, 5));
  mist.renderOrder = 3;
  mist.visible = false;
  scene.add(mist);
  mistPatches.push(mist);
}

// ------------------------------------------------------------
// Sunny sky: soft anime clouds, sun haze and floating motes
// ------------------------------------------------------------
function makeCloudTexture(variant) {
  return canvasTexture(512, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const puffs = variant === 0
      ? [[122, 156, 57], [178, 125, 78], [246, 116, 88], [316, 132, 72], [378, 152, 52], [228, 164, 70]]
      : variant === 1
        ? [[140, 150, 60], [200, 122, 82], [270, 128, 90], [340, 142, 62], [400, 160, 44], [252, 160, 66]]
        : [[110, 148, 54], [168, 120, 72], [232, 112, 82], [300, 128, 74], [360, 146, 54], [210, 160, 68]];
    // cool shadow side, offset down and right
    ctx.fillStyle = 'rgba(149, 185, 209, 0.62)';
    puffs.forEach(([x, y, r]) => {
      ctx.beginPath(); ctx.arc(x + 4, y + 12, r * 1.01, 0, TAU); ctx.fill();
    });
    // flat-ish cloudy base
    ctx.fillStyle = 'rgba(238, 247, 253, 0.92)';
    ctx.beginPath();
    ctx.ellipse(258, 177, 185, 36, 0, 0, TAU);
    ctx.fill();
    // crisp white puffs (with a soft outer glow)
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.75)';
    ctx.shadowBlur = 9;
    ctx.fillStyle = 'rgba(255,255,255,0.98)';
    puffs.forEach(([x, y, r]) => {
      ctx.beginPath(); ctx.arc(x, y - 3, r, 0, TAU); ctx.fill();
    });
    ctx.restore();
    // lit tops
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    puffs.slice(0, 3).forEach(([x, y, r]) => {
      ctx.beginPath(); ctx.arc(x - r * 0.16, y - r * 0.2, r * 0.55, 0, TAU); ctx.fill();
    });
    // blue-grey underside, clipped to cloud pixels
    ctx.globalCompositeOperation = 'source-atop';
    const shade = ctx.createLinearGradient(0, 145, 0, 220);
    shade.addColorStop(0, 'rgba(174, 207, 226, 0)');
    shade.addColorStop(0.65, 'rgba(164, 199, 220, 0.24)');
    shade.addColorStop(1, 'rgba(139, 178, 203, 0.55)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 130, w, 110);
    ctx.globalCompositeOperation = 'source-over';
  });
}

const cloudGroup = new THREE.Group();
cloudGroup.name = 'sunny-cloud-dome';
scene.add(cloudGroup);

const cloudSkyTex = canvasTexture(2048, 1024, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  function puffCloud(cx, cy, scale, alpha) {
    const puffs = [
      [-88, 4, 34], [-53, -8, 45], [-16, -18, 52], [23, -12, 49],
      [58, 2, 40], [31, 18, 44], [-27, 18, 41], [83, 16, 27],
    ];
    // cool blue-grey underside
    puffs.forEach(([dx, dy, r]) => {
      ctx.fillStyle = `rgba(154, 188, 210, ${alpha * 0.34})`;
      ctx.beginPath();
      ctx.arc(cx + dx * scale, cy + dy * scale + 10 * scale, r * scale * 1.05, 0, TAU);
      ctx.fill();
    });
    // bright puffy body
    puffs.forEach(([dx, dy, r]) => {
      const x = cx + dx * scale;
      const y = cy + dy * scale;
      const rr = r * scale;
      const g = ctx.createRadialGradient(x - rr * 0.2, y - rr * 0.45, rr * 0.1, x, y, rr);
      g.addColorStop(0, `rgba(255,255,255,${Math.min(1, alpha * 1.05)})`);
      g.addColorStop(0.62, `rgba(255,255,255,${alpha * 0.94})`);
      g.addColorStop(0.88, `rgba(247,252,255,${alpha * 0.44})`);
      g.addColorStop(1, 'rgba(240,249,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
    });
    // sunlit shoulders
    [-54, -6, 38].forEach((dx, i) => {
      const x = cx + dx * scale;
      const y = cy - (14 + i * 3) * scale;
      const rr = (32 - i * 4) * scale;
      const g = ctx.createRadialGradient(x, y, 2, x, y, rr);
      g.addColorStop(0, `rgba(255,255,255,${alpha * 0.55})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
    });
  }
  const clouds = [
    [220, 265, 0.38, 0.86], [560, 205, 0.32, 0.8],
    [840, 330, 0.27, 0.72], [1120, 245, 0.4, 0.86],
    [1460, 315, 0.28, 0.74], [1740, 235, 0.34, 0.82],
    [1940, 390, 0.24, 0.65], [390, 460, 0.25, 0.64],
    [710, 520, 0.21, 0.55], [1280, 500, 0.23, 0.56],
    [1580, 470, 0.19, 0.5], [980, 585, 0.2, 0.48],
    [80, 355, 0.22, 0.55], [1840, 620, 0.17, 0.4],
  ];
  clouds.forEach(([x, y, s, a]) => puffCloud(x, y, s, a));
});
const cloudMat = new THREE.MeshBasicMaterial({
  map: cloudSkyTex,
  transparent: true,
  opacity: 0,
  side: THREE.BackSide,
  depthWrite: false,
  depthTest: true,
  fog: false,
  toneMapped: false,
});
const cloudDome = new THREE.Mesh(new THREE.SphereGeometry(61.2, 48, 24), cloudMat);
cloudDome.name = 'cloud-sky-dome';
cloudDome.renderOrder = -90;
cloudGroup.add(cloudDome);

// A handful of guaranteed soft clouds in the initial composition.
const cloudSprites = [];
{
  camera.updateMatrixWorld(true);
  const spriteTextures = [makeCloudTexture(0), makeCloudTexture(1), makeCloudTexture(2)];
  const screenClouds = [
    [-0.58, 0.68, 52, 8.6, 4.3, 0],
    [0.53, 0.72, 52, 7.2, 3.7, 1],
    [-0.08, 0.87, 56, 10.2, 4.8, 2],
    [0.90, 0.50, 50, 6.2, 3.2, 1],
    [-0.92, 0.46, 50, 6.5, 3.3, 2],
  ];
  const tmp = new THREE.Vector3();
  screenClouds.forEach(([nx, ny, dist, sx, sy, ti], i) => {
    tmp.set(nx, ny, 0.35).unproject(camera);
    tmp.sub(camera.position).normalize();
    const pos = camera.position.clone().addScaledVector(tmp, dist);
    const mat = new THREE.SpriteMaterial({
      map: spriteTextures[ti],
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      fog: false,
      toneMapped: false,
    });
    const s = new THREE.Sprite(mat);
    s.position.copy(pos);
    s.scale.set(sx, sy, 1);
    s.renderOrder = -80 + i;
    s.userData.cloudBaseOpacity = 0.72 - i * 0.045;
    cloudGroup.add(s);
    cloudSprites.push(s);
  });
}

// Warm dust motes for a little air / sunlight atmosphere.
const dustTex = canvasTexture(64, 64, (ctx, w, h) => {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,250,226,0.95)');
  g.addColorStop(0.35, 'rgba(255,244,206,0.55)');
  g.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
});
const DUST_COUNT = 95;
const dustData = [];
const dustGeo = new THREE.BufferGeometry();
{
  const arr = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i++) {
    const x = rand(-5.8, 4.4);
    const y = rand(0.5, 4.2);
    const z = rand(-4.6, 2.3);
    arr[i * 3] = x;
    arr[i * 3 + 1] = y;
    arr[i * 3 + 2] = z;
    dustData.push({ x, y, z, phase: Math.random() * TAU, speed: rand(0.04, 0.14) });
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
}
const dustMat = new THREE.PointsMaterial({
  map: dustTex,
  color: 0xfff0c7,
  size: 0.075,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  sizeAttenuation: true,
  fog: false,
});
const sunnyDust = new THREE.Points(dustGeo, dustMat);
sunnyDust.frustumCulled = false;
sunnyDust.renderOrder = 7;
scene.add(sunnyDust);

// Sunlit decals are not allowed to affect the baked shadow map.
sunnyDecor.traverse((o) => {
  if (o.isMesh) o.castShadow = false;
});

// ------------------------------------------------------------
// Weather blending / interaction
// ------------------------------------------------------------
const clock = new THREE.Clock();
let shadowFrozen = false;

// ------------------------------------------------------------
// Weather-dependent lighting records
// ------------------------------------------------------------
const weatherLights = [];
scene.traverse((o) => {
  if (o.isAmbientLight) {
    weatherLights.push({
      type: 'ambient',
      light: o,
      rainIntensity: o.intensity,
      dayIntensity: 0.1,
      rainColor: o.color.clone(),
      dayColor: new THREE.Color(0xeaf5ff),
    });
  } else if (o.isHemisphereLight) {
    weatherLights.push({
      type: 'hemi',
      light: o,
      rainIntensity: o.intensity,
      dayIntensity: 0.16,
      rainColor: o.color.clone(),
      dayColor: new THREE.Color(0xc3e5ff),
      rainGroundColor: o.groundColor.clone(),
      dayGroundColor: new THREE.Color(0xffdfb2),
    });
  } else if (o.isDirectionalLight) {
    if (o.name === 'sunKey') {
      weatherLights.push({
        type: 'directional',
        light: o,
        rainIntensity: o.intensity,
        dayIntensity: 1.65,
        rainColor: o.color.clone(),
        dayColor: new THREE.Color(0xffdca6),
      });
    } else if (o.name === 'rimLight') {
      weatherLights.push({
        type: 'directional',
        light: o,
        rainIntensity: o.intensity,
        dayIntensity: 0.1,
        rainColor: o.color.clone(),
        dayColor: new THREE.Color(0xbddaff),
      });
    }
  } else if (o.isSpotLight) {
    if (o.name !== 'streetLampLight') {
      weatherLights.push({
        type: 'spot',
        light: o,
        rainIntensity: o.intensity,
        dayIntensity: 0.035,
        rainColor: o.color.clone(),
        dayColor: new THREE.Color(0xffe8c0),
      });
    }
  } else if (o.isPointLight) {
    const isDayFill = o.name === 'dayFill';
    weatherLights.push({
      type: 'point',
      light: o,
      rainIntensity: isDayFill ? 0 : o.intensity,
      dayIntensity: isDayFill ? 1.1 : o.intensity * 0.3,
      rainColor: o.color.clone(),
      dayColor: o.color.clone(),
    });
  }
});

// ------------------------------------------------------------
// Rain-only pieces
// ------------------------------------------------------------
const rainOnlyMeshes = [];
const glowSprites = [];
scene.traverse((o) => {
  if (o.userData && o.userData.rainOnly) {
    if (o.isSprite) {
      glowSprites.push(o);
      o.userData.glowBaseOpacity = o.material.opacity;
    } else if (o.isMesh) {
      rainOnlyMeshes.push(o);
    }
  }
  if (o.isMesh && o.material && o.material.map === TEX.caution) {
    o.userData.rainOnly = true;
    rainOnlyMeshes.push(o);
  }
});

// ------------------------------------------------------------
// Weather palettes
// ------------------------------------------------------------
const SKY_NIGHT = {
  top: new THREE.Color(0x03050c),
  horizon: new THREE.Color(0x0c1a2d),
  bottom: new THREE.Color(0x04070d),
};
const SKY_DAY = {
  top: new THREE.Color(0x1a6ec7),
  horizon: new THREE.Color(0x99d2f3),
  bottom: new THREE.Color(0xdfeacb),
};
const FOG_NIGHT = new THREE.Color(0x08101c);
const FOG_DAY = new THREE.Color(0xe7f5ff);
const TMP_COLOR = new THREE.Color();
const SUN_NIGHT_POS = new THREE.Vector3(-8.5, 15.5, 12.0);
const SUN_DAY_POS = new THREE.Vector3(-8.5, 15.5, 12.0);

function smoothMix(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function smoothstep(a, b, x) {
  return smoothMix(a, b, x);
}

function setGroundMaps(sunny) {
  const pairs = [
    [M.asphalt, TEX.asphalt, TEX.asphaltDay],
    [M.sidewalk, TEX.sidewalk, TEX.sidewalkDay],
    [M.stoneAlley, TEX.stoneAlley, TEX.stoneAlleyDay],
  ];
  pairs.forEach(([mat, rainMap, dayMap]) => {
    const target = sunny ? dayMap : rainMap;
    if (mat.map !== target) {
      mat.map = target;
      mat.needsUpdate = true;
    }
  });
}

function applyWeather(mix) {
  const m = clamp(mix, 0, 1);
  const day = m > 0.5;

  // lights
  weatherLights.forEach((r) => {
    r.light.intensity = lerp(r.rainIntensity, r.dayIntensity, m);
    r.light.color.copy(r.rainColor).lerp(r.dayColor, m);
    if (r.type === 'hemi') {
      r.light.groundColor.copy(r.rainGroundColor).lerp(r.dayGroundColor, m);
    }
  });
  // warm sunlight comes from the front-left, replacing the cool moon
  moon.position.copy(SUN_NIGHT_POS).lerp(SUN_DAY_POS, m);
  moon.target.position.set(-1.0, 0, -2.0);
  moon.updateMatrixWorld(true);
  moon.target.updateMatrixWorld(true);

  // sky / fog / background
  const skyU = skyDome.material.uniforms;
  skyU.uTop.value.copy(SKY_NIGHT.top).lerp(SKY_DAY.top, m);
  skyU.uHorizon.value.copy(SKY_NIGHT.horizon).lerp(SKY_DAY.horizon, m);
  skyU.uBottom.value.copy(SKY_NIGHT.bottom).lerp(SKY_DAY.bottom, m);
  scene.background.copy(SKY_NIGHT.bottom).lerp(SKY_DAY.horizon, m);
  scene.fog.color.copy(FOG_NIGHT).lerp(FOG_DAY, m);
  scene.fog.density = lerp(0.0165, 0.0042, m);

  // dry sunlit surfaces vs dark wet night surfaces
  setGroundMaps(day);

  // exposure / bloom / grade
  renderer.toneMappingExposure = lerp(0.86, 0.9, m);
  bloomPass.strength = 0.5 * (1 - m);
  bloomPass.enabled = m < 0.985;
  gradePass.uniforms.uSaturation.value = lerp(1.28, 1.22, m);
  gradePass.uniforms.uContrast.value = lerp(1.04, 1.05, m);
  gradePass.uniforms.uVignette.value = lerp(0.3, 0.12, m);

  // rain fade
  const rainFade = 1 - smoothMix(0.02, 0.72, m);
  rainMaterial.uniforms.uOpacity.value = rainFade;
  rain.visible = rainFade > 0.012;
  splashGroup.visible = m < 0.72;
  lampShaft.visible = m < 0.45;
  lampShaft.material.opacity = rainFade * 0.055;
  mistPatches.forEach((p) => { p.visible = m < 0.35; });
  wetKit.visible = m < 0.45;
  rainOnlyMeshes.forEach((mesh) => { mesh.visible = m < 0.45; });

  // neon halos and light spills
  glowSprites.forEach((s) => {
    const a = s.userData.glowBaseOpacity === undefined
      ? 0.2
      : s.userData.glowBaseOpacity;
    s.material.opacity = a * (1 - smoothMix(0.05, 0.62, m));
    s.visible = s.material.opacity > 0.002;
  });

  // sunny decor + painted cloud dome
  sunnyDecor.visible = m > 0.34;
  balloonPivot.visible = m > 0.34;
  bikeBasketFlowerGroup.visible = m > 0.34;
  cloudGroup.visible = m > 0.015;
  cloudMat.opacity = 0.55 * smoothMix(0.1, 0.9, m);
  cloudSprites.forEach((s) => {
    s.material.opacity = (s.userData.cloudBaseOpacity || 0.7) * smoothMix(0.08, 0.9, m);
    s.visible = s.material.opacity > 0.002;
  });
  sunnyDust.visible = m > 0.08;
  dustMat.opacity = 0.4 * smoothMix(0.08, 0.9, m);

  // body background / vignette
  document.body.classList.toggle('sunny', m > 0.5);

  // subtle sunlit wall warmth
  M.wallCream.color.copy(new THREE.Color(0xd5c6ab)).lerp(new THREE.Color(0xf1e5cd), m);
  M.wallCreamDark.color.copy(new THREE.Color(0xbcab8f)).lerp(new THREE.Color(0xdcccb1), m);
}

// ------------------------------------------------------------
// Weather toggle UI
// ------------------------------------------------------------
const btnSunny = document.getElementById('btnSunny');
const btnRain = document.getElementById('btnRain');

function updateWeatherButtons(mode) {
  if (btnSunny) {
    btnSunny.classList.toggle('is-active', mode === 'sunny');
    btnSunny.setAttribute('aria-pressed', mode === 'sunny' ? 'true' : 'false');
  }
  if (btnRain) {
    btnRain.classList.toggle('is-active', mode === 'rain');
    btnRain.setAttribute('aria-pressed', mode === 'rain' ? 'true' : 'false');
  }
}

function setWeatherMode(mode, instant = false) {
  const next = mode === 'rain' ? 0 : 1;
  weatherTransitionFrom = weatherMix;
  weatherTransitionStart = performance.now();
  weatherTarget = next;
  updateWeatherButtons(next > 0.5 ? 'sunny' : 'rain');
  try {
    window.localStorage.setItem(WEATHER_KEY, mode);
  } catch (e) {
    // file:// and privacy modes may not allow storage
  }
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('weather', mode);
    window.history.replaceState(null, '', url.toString());
  } catch (e) {
    // ignore history restrictions
  }
  if (instant) {
    weatherMix = next;
    applyWeather(weatherMix);
  }
}

if (btnSunny) btnSunny.addEventListener('click', () => setWeatherMode('sunny'));
if (btnRain) btnRain.addEventListener('click', () => setWeatherMode('rain'));
window.addEventListener('keydown', (e) => {
  if (e.key && e.key.toLowerCase() === 'w') {
    setWeatherMode(weatherTarget > 0.5 ? 'rain' : 'sunny');
  }
});

// ------------------------------------------------------------
// Gentle miniature interactions (raycast, no pop-up UI)
// ------------------------------------------------------------
const interactionHitMeshes = [];
const interactionRaycaster = new THREE.Raycaster();
interactionRaycaster.layers.enableAll();
const interactionPointer = new THREE.Vector2();
const interactionPlane = new THREE.Plane();
const interactionPoint = new THREE.Vector3();

// ------------------------------------------------------------
// Audio: real CC0 recordings, embedded as an offline bank and decoded lazily
// ------------------------------------------------------------
const AUDIO_BANK = (typeof window !== 'undefined' && window.AUDIO_DATA) ? window.AUDIO_DATA : {};
const audioCache = new Map();
const audioLoading = new Map();
let audioCtx = null;
let audioMaster = null;
let audioMuted = false;
try {
  audioMuted = window.localStorage.getItem('hoshimi-muted') === '1';
} catch (e) {
  audioMuted = false;
}

function ensureAudio() {
  if (!AUDIO_BANK || !Object.keys(AUDIO_BANK).length) return null;
  if (!audioCtx) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    try {
      audioCtx = new AudioCtor();
      audioMaster = audioCtx.createGain();
      audioMaster.gain.value = audioMuted ? 0 : 0.82;
      audioMaster.connect(audioCtx.destination);
    } catch (e) {
      audioCtx = null;
      return null;
    }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function decodeBase64Audio(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function loadSound(key) {
  if (audioCache.has(key)) return Promise.resolve(audioCache.get(key));
  if (audioLoading.has(key)) return audioLoading.get(key);
  const encoded = AUDIO_BANK[key];
  if (!encoded) return Promise.resolve(null);
  const ctx = ensureAudio();
  if (!ctx) return Promise.resolve(null);
  const promise = new Promise((resolve, reject) => {
    const result = ctx.decodeAudioData(decodeBase64Audio(encoded), resolve, reject);
    if (result && result.then) result.then(resolve, reject);
  })
    .then((decoded) => {
      audioCache.set(key, decoded);
      audioLoading.delete(key);
      return decoded;
    })
    .catch(() => {
      audioLoading.delete(key);
      return null;
    });
  audioLoading.set(key, promise);
  return promise;
}

function playSound(key, opts = {}) {
  if (audioMuted) return null;
  const ctx = ensureAudio();
  if (!ctx) return null;
  const volume = opts.volume === undefined ? 0.35 : opts.volume;
  const rate = opts.rate === undefined ? 1 : opts.rate;
  const delay = opts.delay === undefined ? 0 : opts.delay;
  let stopped = false;
  let source = null;
  let gain = null;
  loadSound(key).then((buffer) => {
    if (!buffer || stopped || !audioCtx) return;
    source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    gain = audioCtx.createGain();
    const t0 = audioCtx.currentTime + delay;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.025);
    gain.gain.setValueAtTime(volume, t0 + Math.max(0.03, buffer.duration / rate - 0.08));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + buffer.duration / rate);
    source.connect(gain);
    gain.connect(audioMaster);
    source.start(t0);
    source.stop(t0 + buffer.duration / rate + 0.05);
  });
  return {
    stop() {
      stopped = true;
      try { if (source) source.stop(); } catch (e) {}
    },
  };
}

function startSoundLoop(key, volume = 0.12, rate = 1) {
  if (audioMuted) return null;
  const ctx = ensureAudio();
  if (!ctx) return null;
  const handle = { stopped: false, source: null, gain: null };
  loadSound(key).then((buffer) => {
    if (!buffer || handle.stopped || !audioCtx) return;
    const source = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = rate;
    gain.gain.value = 0.0001;
    source.connect(gain);
    gain.connect(audioMaster);
    source.start();
    gain.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + 0.6);
    handle.source = source;
    handle.gain = gain;
  });
  handle.stop = () => {
    handle.stopped = true;
    if (handle.gain && audioCtx) {
      try {
        handle.gain.gain.cancelScheduledValues(audioCtx.currentTime);
        handle.gain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
      } catch (e) {}
    }
    const source = handle.source;
    if (source) setTimeout(() => { try { source.stop(); } catch (e) {} }, 420);
    handle.source = null;
  };
  return handle;
}

function playVendingChime() {
  playSound('vending_can', { volume: 0.48 });
  setTimeout(() => playSound('button_click', { volume: 0.22 }), 120);
}

function playBikeBell() {
  playSound('bell', { volume: 0.52, rate: 0.98 });
}

function playUmbrellaOpen() {
  playSound('umbrella_open', { volume: 0.44, rate: 0.96 });
}

function playUmbrellaClose() {
  playSound('umbrella_close', { volume: 0.4, rate: 1.0 });
}

function playDoorSlide(closing = false) {
  playSound('door_slide', { volume: closing ? 0.23 : 0.26, rate: closing ? 0.9 : 0.94 });
}

function playTrashLid() {
  playSound('trash_lid', { volume: 0.42 });
}

function playWaterDrop(scale = 1) {
  playSound('water_drop', { volume: 0.24, rate: 0.9 + Math.random() * 0.25, delay: Math.random() * 0.04 });
}

function playSwitchClick() {
  playSound('switch_click', { volume: 0.28 });
}

function playBirdChirp() {
  playSound('bird', { volume: 0.34, rate: 1.0 });
}

function playShopChime() {
  playSound('shop_chime', { volume: 0.2, rate: 0.92 });
}

// Mute button lives beside the weather controls.
const muteButton = document.getElementById('btnMute');
function syncMuteButton() {
  if (!muteButton) return;
  muteButton.classList.toggle('is-muted', audioMuted);
  muteButton.setAttribute('aria-pressed', audioMuted ? 'true' : 'false');
  muteButton.setAttribute('aria-label', audioMuted ? '取消静音' : '静音');
  muteButton.title = audioMuted ? '取消静音' : '静音';
}
function setAudioMuted(muted) {
  audioMuted = !!muted;
  try { window.localStorage.setItem('hoshimi-muted', audioMuted ? '1' : '0'); } catch (e) {}
  if (audioMaster && audioCtx) {
    audioMaster.gain.cancelScheduledValues(audioCtx.currentTime);
    audioMaster.gain.linearRampToValueAtTime(audioMuted ? 0 : 0.82, audioCtx.currentTime + 0.12);
  }
  syncMuteButton();
}
if (muteButton) {
  muteButton.addEventListener('click', () => setAudioMuted(!audioMuted));
}
syncMuteButton();

function isVisibleInScene(object) {
  let current = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function addHitMesh(geometry, parent, x, y, z, data) {
  const mesh = new THREE.Mesh(geometry, INVISIBLE_HIT_MAT);
  mesh.position.set(x, y, z);
  mesh.layers.set(HIT_LAYER);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = -100;
  mesh.userData.interaction = data;
  parent.add(mesh);
  interactionHitMeshes.push(mesh);
  return mesh;
}

function addHitBox(w, h, d, x, y, z, parent, data) {
  return addHitMesh(new THREE.BoxGeometry(w, h, d), parent, x, y, z, data);
}

function addHitSphere(r, x, y, z, parent, data) {
  return addHitMesh(new THREE.SphereGeometry(r, 12, 8), parent, x, y, z, data);
}

function addHitPlane(w, h, x, y, z, parent, data, ry = 0) {
  const mesh = addHitMesh(new THREE.PlaneGeometry(w, h), parent, x, y, z, data);
  mesh.rotation.y = ry;
  return mesh;
}

const HIT_PRIORITY = {
  bike: 0,
  bikeBell: 3,
  vending: 4,
  vendingButton: 8,
  bottle: 9,
  door: 6,
  umbrellaBody: 8,
  umbrellaStand: 7,
  tree: 5,
  poster: 6,
  balloon: 9,
  balloonCluster: 2,
  trash: 10,
  lamp: 7,
  ac: 7,
  bird: 7,
  sign: 6,
  flower: 9,
  sunPatch: 8,
  puddle: 9,
  eave: 8,
  shopSign: 3,
  aFrame: 7,
  secCamera: 7,
  boxes: 8,
  leaf: 9,
};

function findInteractionHit(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  interactionPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  interactionPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  interactionRaycaster.setFromCamera(interactionPointer, camera);
  const hits = interactionRaycaster.intersectObjects(interactionHitMeshes, false);
  let chosen = null;
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    const data = hit.object.userData.interaction;
    if (!data || !isVisibleInScene(hit.object)) continue;
    const priority = HIT_PRIORITY[data.type] === undefined ? 5 : HIT_PRIORITY[data.type];
    if (!chosen) {
      chosen = { object: hit.object, data, point: hit.point, distance: hit.distance, priority };
      continue;
    }
    // Small props should win over broad keeper boxes (e.g. the bicycle) when
    // their hit distances are close; this keeps tiny objects tap-friendly.
    if (hit.distance < chosen.distance - 0.03 ||
        (hit.distance <= chosen.distance + 0.45 && priority > chosen.priority)) {
      chosen = { object: hit.object, data, point: hit.point, distance: hit.distance, priority };
    }
  }
  return chosen;
}

function pointerOnHorizontalPlane(event, y) {
  const rect = renderer.domElement.getBoundingClientRect();
  interactionPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  interactionPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  interactionRaycaster.setFromCamera(interactionPointer, camera);
  interactionPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, y, 0));
  const point = new THREE.Vector3();
  return interactionRaycaster.ray.intersectPlane(interactionPlane, point) ? point : null;
}

// ------------------------------------------------------------
// Vending machines: lightbox, chime and floating drinks
// ------------------------------------------------------------
const vendingInteract = [];
const VENDING_Z = [-3.72, -2.62];
const BOTTLE_COLORS = [0xe98566, 0x74c69d, 0xf2cc8f, 0x8ecae6];
const vendingFrameTex = canvasTexture(256, 512, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  ctx.shadowColor = 'rgba(255, 245, 218, 0.9)';
  ctx.shadowBlur = 26;
  ctx.strokeStyle = 'rgba(255, 252, 235, 0.92)';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.rect(12, 12, w - 24, h - 24);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 22;
  ctx.beginPath();
  ctx.rect(5, 5, w - 10, h - 10);
  ctx.stroke();
});

function makeDrinkBottle(color, home, machine, index) {
  const group = new THREE.Group();
  group.position.copy(home);
  world.add(group);

  const body = cylinder(group, toon(color, { soft: true }), 0.032, 0.029, 0.15, 0, 0, 0, {
    seg: 8, cast: false, receive: false, outline: 0.005,
  });
  const label = cylinder(group, basic(0xfaf4e3), 0.033, 0.033, 0.022, 0, 0.008, 0, {
    seg: 8, cast: false, receive: false,
  });
  label.renderOrder = 1;
  cylinder(group, toon(color), 0.021, 0.028, 0.032, 0, 0.092, 0, { seg: 8, cast: false, receive: false });
  cylinder(group, toon(color), 0.019, 0.019, 0.014, 0, 0.115, 0, { seg: 8, cast: false, receive: false });

  const glowMat = new THREE.SpriteMaterial({
    map: RADIAL_TEX,
    color: 0xffefc2,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.position.set(0, 0.01, 0);
  glow.scale.set(0.22, 0.22, 1);
  group.add(glow);

  const hit = addHitSphere(0.14, 0, 0, 0, group, null);
  const record = {
    type: 'bottle',
    group,
    home: home.clone(),
    machine,
    index,
    selected: false,
    targetLift: 0,
    lift: 0,
    phase: Math.random() * TAU,
    hit,
    glow,
    glowMat,
    location: 'machine',
    dragLift: 0,
    buttonPress: 0,
  };
  hit.userData.interaction = { type: 'bottle', bottle: record, machine };
  machine.bottles.push(record);
  return record;
}

for (let i = 0; i < VENDING_Z.length; i++) {
  const z = VENDING_Z[i];
  const machine = {
    type: 'vending',
    index: i,
    z,
    bottles: [],
    selected: -1,
    litUntil: 0,
    glow: 0,
    overlay: null,
    light: null,
    halo: null,
    frameGlow: null,
    buttons: [],
  };

  const overlayMat = new THREE.MeshBasicMaterial({
    color: i === 0 ? 0xffd9c8 : 0xcdf3ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const overlay = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8), overlayMat);
  overlay.position.set(2.114, 1.23, z);
  overlay.rotation.y = Math.PI / 2;
  overlay.renderOrder = 2;
  overlay.castShadow = false;
  world.add(overlay);
  machine.overlay = overlay;

  const light = new THREE.PointLight(i === 0 ? 0xffc6ad : 0xa9e8ff, 0, 2.7, 2.0);
  light.position.set(2.48, 1.35, z);
  light.castShadow = false;
  world.add(light);
  machine.light = light;

  const haloMat = new THREE.SpriteMaterial({
    map: RADIAL_TEX,
    color: i === 0 ? 0xffd8c4 : 0xc4f0ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
  const halo = new THREE.Sprite(haloMat);
  halo.position.set(2.33, 1.32, z);
  halo.scale.set(1.05, 1.42, 1);
  halo.renderOrder = 6;
  world.add(halo);
  machine.halo = halo;

  const frameMat = new THREE.MeshBasicMaterial({
    map: vendingFrameTex,
    color: i === 0 ? 0xffd4c0 : 0xc6efff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const frameGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 1.88), frameMat);
  frameGlow.position.set(2.118, 1.23, z);
  frameGlow.rotation.y = Math.PI / 2;
  frameGlow.renderOrder = 4;
  frameGlow.castShadow = false;
  world.add(frameGlow);
  machine.frameGlow = frameGlow;

  addHitBox(0.94, 1.9, 1.02, 1.64, 1.23, z, world, { type: 'vending', machine });
  // A small display tray at the base, so the two 3D drinks look placed there
  // rather than floating on top of the painted product rows.
  box(world, M.metalDark, 0.2, 0.018, 0.46, 2.16, 0.462, z, { cast: false, receive: false });
  box(world, M.metalLight, 0.018, 0.035, 0.46, 2.26, 0.472, z, { cast: false, receive: false });
  const bottleHome = [
    new THREE.Vector3(2.19, 0.555, z - 0.17),
    new THREE.Vector3(2.19, 0.555, z + 0.17),
  ];
  bottleHome.forEach((home, bi) => {
    makeDrinkBottle(BOTTLE_COLORS[(i * 2 + bi) % BOTTLE_COLORS.length], home, machine, bi);
  });

  // Two small physical selection buttons under the display.
  [-0.16, 0.16].forEach((dz, bi) => {
    const button = new THREE.Mesh(
      new THREE.CylinderGeometry(0.031, 0.031, 0.022, 12),
      M.metalLight
    );
    button.rotation.z = Math.PI / 2;
    button.position.set(2.145, 0.78, z + dz);
    button.castShadow = false;
    world.add(button);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.006, 5, 12), M.metalDark);
    ring.position.set(2.135, 0.78, z + dz);
    ring.rotation.y = Math.PI / 2;
    world.add(ring);
    addHitSphere(0.08, 2.15, 0.78, z + dz, world, {
      type: 'vendingButton', machine, index: bi, button,
    });
    machine.buttons.push({ mesh: button, baseX: 2.145, press: 0, index: bi });
  });

  vendingInteract.push(machine);
}

function wakeVending(machine) {
  machine.litUntil = performance.now() + 3400;
  playSound('button_click', { volume: 0.2, rate: 0.92 });
}

function selectBottle(bottle) {
  const machine = bottle.machine;
  if (machine.selected >= 0) {
    const previous = machine.bottles[machine.selected];
    if (previous && previous !== bottle) {
      previous.selected = false;
      previous.targetLift = 0;
      previous.location = 'machine';
      previous.lift = 0;
      previous.group.position.copy(previous.home);
      previous.group.rotation.set(0, 0, 0);
    }
  }
  if (bottle.selected) {
    bottle.selected = false;
    bottle.targetLift = 0;
    machine.selected = -1;
  } else {
    bottle.selected = true;
    bottle.targetLift = 1;
    machine.selected = bottle.index;
    bottle.location = 'machine';
    playSound('vending_can', { volume: 0.46, rate: 1.0 });
  }
}

// ------------------------------------------------------------
// Bicycle: bell and short, bounded dragging
// ------------------------------------------------------------
const bikeState = {
  current: new THREE.Vector2(0, 0),
  target: new THREE.Vector2(0, 0),
  bellShake: 0,
  dragging: false,
  wheelSpin: 0,
  prevX: 0,
  prevZ: 0,
  trailTimer: 0,
};
const bikeWheelGroups = bikeKit.userData.wheelGroups || [];
const bikeTrailEffects = [];
const bikeTrailTex = canvasTexture(64, 128, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.3)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
});
function spawnBikeTrail() {
  const anchor = bikeKit.userData.rearTrailAnchor;
  if (!anchor) return;
  const pos = anchor.getWorldPosition(new THREE.Vector3());
  const mat = new THREE.MeshBasicMaterial({
    map: bikeTrailTex,
    color: 0x4f7f91,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.34), mat);
  decal.rotation.x = -Math.PI / 2;
  decal.rotation.z = Math.random() * 0.5 - 0.25;
  decal.position.set(pos.x, 0.172, pos.z);
  decal.renderOrder = 4;
  world.add(decal);
  bikeTrailEffects.push({ mesh: decal, mat, age: 0, life: 3.2 });
}
const BIKE_BOUNDS = {
  xMin: 0.0,
  xMax: 0.82,
  zMin: -0.2,
  zMax: 0.48,
};
const bikeBell = bikeKit.userData.bell;
const bikeBellBasePos = bikeBell ? bikeBell.position.clone() : new THREE.Vector3();
const bikeBellBaseRot = bikeBell ? bikeBell.rotation.clone() : new THREE.Euler();
const bikeBasketAnchor = new THREE.Object3D();
bikeBasketAnchor.position.set(2.55, SIDEWALK_TOP + 0.895, -0.35);
bikeKit.add(bikeBasketAnchor);
bikeBasketAnchor.add(balloonPivot);
balloonPivot.position.set(0, balloonHome.y - bikeBasketAnchor.position.y, 0);

function returnBottleToMachine(bottle) {
  bottle.selected = false;
  bottle.location = 'machine';
  bottle.targetLift = 0;
  bottle.lift = 0;
  bottle.group.position.copy(bottle.home);
  bottle.group.rotation.set(0, 0, 0);
  bottle.machine.selected = -1;
  playSound('button_click', { volume: 0.2, rate: 1.0 });
}

function settleBottle(bottle, point, event) {
  const basketWorld = bikeBasketAnchor.getWorldPosition(new THREE.Vector3());
  const bdx = point.x - basketWorld.x;
  const bdz = point.z - basketWorld.z;
  let basketTarget = bdx * bdx + bdz * bdz < 0.23 * 0.23;
  if (!basketTarget && event) {
    const projected = basketWorld.clone().project(camera);
    const bx = (projected.x * 0.5 + 0.5) * window.innerWidth;
    const by = (-projected.y * 0.5 + 0.5) * window.innerHeight;
    basketTarget = Math.hypot(event.clientX - bx, event.clientY - by) < 62;
  }
  if (basketTarget) {
    bottle.location = 'basket';
    bottle.group.position.set(basketWorld.x, basketWorld.y + 0.015, basketWorld.z);
    bottle.group.rotation.set(0, 0, 0);
  } else if (point.z < -0.52 && point.x > -4.3 && point.x < 0.95) {
    bottle.location = 'window';
    bottle.group.position.set(
      clamp(point.x, -4.2, 0.85),
      0.52,
      -0.78
    );
    bottle.group.rotation.set(0, 0, 0);
  } else {
    bottle.location = 'ground';
    bottle.group.position.set(
      clamp(point.x, -0.35, 4.4),
      0.235,
      clamp(point.z, -0.1, 2.85)
    );
    bottle.group.rotation.set(0, 0, 0);
  }
  bottle.selected = true;
  bottle.targetLift = 0;
  bottle.lift = 0;
  bottle.machine.selected = bottle.index;
  playSound('vending_can', { volume: 0.32, rate: 1.06 });
}
addHitBox(0.92, 0.9, 1.45, 2.55, 0.63, -1.0, bikeKit, { type: 'bike' });
if (bikeBell) {
  addHitSphere(0.15, bikeBellBasePos.x, bikeBellBasePos.y, bikeBellBasePos.z, bikeKit, { type: 'bikeBell' });
}

function ringBikeBell() {
  bikeState.bellShake = 1;
  playBikeBell();
}

// ------------------------------------------------------------
// Umbrella stand: take out, unfold the ribs, open the cloth, carry, return
// ------------------------------------------------------------
const UMBRELLA_STAND = { x: -0.7, z: -0.63 };
const UMBRELLA_OUT = { x: -1.25, z: 0.02 };
// Standard Japanese long umbrella proportions learned from 60 cm / 8-rib
// long-umbrella references. Every rig in the stand shares this same geometry.
const UMBRELLA_HUB_Y = 1.05;
const UMBRELLA_RIM_RADIUS = 0.5;
const UMBRELLA_RIM_DROP = 0.18;
const UMBRELLA_RIB_COUNT = 8;
const UMBRELLA_RIB_LENGTH = Math.hypot(UMBRELLA_RIM_RADIUS, UMBRELLA_RIM_DROP);
const UMBRELLA_CANOPY_RINGS = 6;
const UMBRELLA_CANOPY_SEGMENTS = 32;
const UMBRELLA_SLOT_COUNT = 5;
const UMBRELLA_UP = new THREE.Vector3(0, 1, 0);

// Muted, low-saturation palette inspired by Japanese vinyl umbrellas: slate
// blue, ink green, warm gray, muted wine and oat. Same material family, only
// the cloth hue changes slightly so the rack still reads as one set.
const UMBRELLA_LEGACY_GREEN = 0x2d4942;
const UMBRELLA_LEGACY_RIM = 0xd9cfb4;

const umbrellaFabricMap = canvasTexture(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#e8e5dd';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(118,116,106,0.10)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 4) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 5) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
    ctx.stroke();
  }
  for (let i = 0; i < 1400; i++) {
    const shade = 120 + Math.floor(Math.random() * 80);
    ctx.fillStyle = `rgba(${shade},${shade},${shade - 6},0.07)`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1.2, 1.2);
  }
}, { repeat: [2, 2] });

function addUmbrellaSheen(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSheen = { value: 0 };
    shader.fragmentShader = 'uniform float uSheen;\n' + shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
      float umbrellaFresnel = pow(1.0 - clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0), 3.0);
      gl_FragColor.rgb += vec3(0.42, 0.50, 0.54) * umbrellaFresnel * uSheen;`
    );
    material.userData.sheenUniform = shader.uniforms.uSheen;
  };
  return material;
}

function makeUmbrellaCanopyMaterial() {
  const material = new THREE.MeshToonMaterial({
    color: 0xffffff,
    gradientMap: TOON_RAMP,
    vertexColors: true,
    side: THREE.DoubleSide,
    skinning: true,
  });
  return addUmbrellaSheen(material);
}

function makeUmbrellaWrapMaterial() {
  const material = new THREE.MeshToonMaterial({
    color: UMBRELLA_LEGACY_GREEN,
    gradientMap: TOON_RAMP,
    side: THREE.DoubleSide,
  });
  return addUmbrellaSheen(material);
}

// Shared geometry/materials: five umbrellas have the exact same canopy
// diameter, rim shape, rib count and appearance.
const umbrellaHandleCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0.14, 0),
  new THREE.Vector3(0, 0.055, 0),
  new THREE.Vector3(0.025, 0.022, 0.075),
  new THREE.Vector3(0.11, 0.045, 0.185),
  new THREE.Vector3(0.18, 0.13, 0.225),
]);
const umbrellaHandleGeometry = new THREE.TubeGeometry(umbrellaHandleCurve, 20, 0.016, 8, false);
const umbrellaRibGeometry = new THREE.CylinderGeometry(0.0032, 0.005, UMBRELLA_RIB_LENGTH, 5);
const umbrellaRibTipGeometry = new THREE.SphereGeometry(0.008, 6, 5);
const umbrellaHubGeometry = new THREE.SphereGeometry(0.03, 9, 7);
const umbrellaTipGeometry = new THREE.ConeGeometry(0.017, 0.1, 8);
const umbrellaRunnerGeometry = new THREE.TorusGeometry(0.026, 0.0055, 6, 12);
const umbrellaStrapGeometry = new THREE.TorusGeometry(0.047, 0.006, 5, 14);
const umbrellaBuckleGeometry = new THREE.BoxGeometry(0.022, 0.03, 0.016);
const umbrellaStrapMaterial = toon(0xcbbf9d, { side: THREE.DoubleSide });
const umbrellaBuckleMaterial = basic(0x6f5c45);
const umbrellaRibMaterial = M.metalDark;
const umbrellaGripGeometry = new THREE.CylinderGeometry(0.019, 0.021, 0.22, 10);
const umbrellaGripCapGeometry = new THREE.SphereGeometry(0.021, 9, 7);
const umbrellaGripMaterial = toon(0x4b382b, { soft: true });

// A neat wrapped-fabric sleeve hides the folded skin while the umbrella is
// closed, so every closed umbrella reads as a slim body with a tied strap.
const umbrellaWrapPositions = [];
const umbrellaWrapUvs = [];
const umbrellaWrapIndices = [];
{
  const rings = 6;
  const segments = 16;
  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings;
    const y = lerp(0.46, UMBRELLA_HUB_Y - 0.02, t);
    for (let s = 0; s < segments; s++) {
      const angle = (s / segments) * TAU;
      const fold = 1 + 0.11 * Math.cos(8 * angle);
      const radius = lerp(0.018, 0.052, t) * fold;
      umbrellaWrapPositions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      umbrellaWrapUvs.push(s / segments, t);
    }
  }
  for (let ring = 0; ring < rings; ring++) {
    const aStart = ring * segments;
    const bStart = (ring + 1) * segments;
    for (let s = 0; s < segments; s++) {
      const next = (s + 1) % segments;
      umbrellaWrapIndices.push(aStart + s, bStart + s, aStart + next);
      umbrellaWrapIndices.push(bStart + s, bStart + next, aStart + next);
    }
  }
  // Close both ends so the tapered sleeve reads as wrapped cloth rather than
  // an open tube when seen from above.
  const bottomCenter = umbrellaWrapPositions.length / 3;
  umbrellaWrapPositions.push(0, 0.46, 0);
  umbrellaWrapUvs.push(0.5, 0);
  const topCenter = umbrellaWrapPositions.length / 3;
  umbrellaWrapPositions.push(0, UMBRELLA_HUB_Y - 0.02, 0);
  umbrellaWrapUvs.push(0.5, 1);
  const topStart = rings * segments;
  for (let s = 0; s < segments; s++) {
    const next = (s + 1) % segments;
    umbrellaWrapIndices.push(bottomCenter, s, next);
    umbrellaWrapIndices.push(topCenter, topStart + next, topStart + s);
  }
}
const umbrellaWrapGeometry = new THREE.BufferGeometry();
umbrellaWrapGeometry.setAttribute('position', new THREE.Float32BufferAttribute(umbrellaWrapPositions, 3));
umbrellaWrapGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(umbrellaWrapUvs, 2));
umbrellaWrapGeometry.setIndex(umbrellaWrapIndices);
umbrellaWrapGeometry.computeVertexNormals();

const umbrellaCanopyPositions = [];
const umbrellaCanopyColors = [];
const umbrellaCanopyUvs = [];
const umbrellaCanopySkinIndices = [];
const umbrellaCanopySkinWeights = [];
const umbrellaCanopyIndices = [];
{
  const core = new THREE.Color(UMBRELLA_LEGACY_GREEN);
  const cloth = new THREE.Color(UMBRELLA_LEGACY_GREEN);
  const rim = new THREE.Color(UMBRELLA_LEGACY_RIM);
  umbrellaCanopyPositions.push(0, UMBRELLA_HUB_Y, 0);
  umbrellaCanopyColors.push(core.r, core.g, core.b);
  umbrellaCanopyUvs.push(0.5, 0.5);
  umbrellaCanopySkinIndices.push(UMBRELLA_RIB_COUNT, 0, 0, 0);
  umbrellaCanopySkinWeights.push(1, 0, 0, 0);
  for (let ring = 1; ring <= UMBRELLA_CANOPY_RINGS; ring++) {
    const t = ring / UMBRELLA_CANOPY_RINGS;
    const radius = UMBRELLA_RIM_RADIUS * t;
    const y = UMBRELLA_HUB_Y - UMBRELLA_RIM_DROP * Math.pow(t, 1.7);
    for (let s = 0; s < UMBRELLA_CANOPY_SEGMENTS; s++) {
      const angle = (s / UMBRELLA_CANOPY_SEGMENTS) * TAU;
      const sector = angle / (TAU / UMBRELLA_RIB_COUNT);
      const base = Math.floor(sector + 1e-6) % UMBRELLA_RIB_COUNT;
      const frac = sector - Math.floor(sector);
      const next = (base + 1) % UMBRELLA_RIB_COUNT;
      const w0 = frac < 1e-5 ? 1 : 1 - frac;
      const w1 = frac < 1e-5 ? 0 : frac;
      umbrellaCanopyPositions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      const color = ring === UMBRELLA_CANOPY_RINGS ? rim : cloth;
      umbrellaCanopyColors.push(color.r, color.g, color.b);
      umbrellaCanopyUvs.push(s / UMBRELLA_CANOPY_SEGMENTS, t);
      umbrellaCanopySkinIndices.push(base, next, 0, 0);
      umbrellaCanopySkinWeights.push(w0, w1, 0, 0);
    }
  }
  const firstRing = 1;
  for (let s = 0; s < UMBRELLA_CANOPY_SEGMENTS; s++) {
    const next = (s + 1) % UMBRELLA_CANOPY_SEGMENTS;
    umbrellaCanopyIndices.push(0, firstRing + s, firstRing + next);
  }
  for (let ring = 1; ring < UMBRELLA_CANOPY_RINGS; ring++) {
    const aStart = 1 + (ring - 1) * UMBRELLA_CANOPY_SEGMENTS;
    const bStart = 1 + ring * UMBRELLA_CANOPY_SEGMENTS;
    for (let s = 0; s < UMBRELLA_CANOPY_SEGMENTS; s++) {
      const next = (s + 1) % UMBRELLA_CANOPY_SEGMENTS;
      umbrellaCanopyIndices.push(aStart + s, bStart + s, aStart + next);
      umbrellaCanopyIndices.push(bStart + s, bStart + next, aStart + next);
    }
  }
}
const umbrellaCanopyGeometry = new THREE.BufferGeometry();
umbrellaCanopyGeometry.setAttribute('position', new THREE.Float32BufferAttribute(umbrellaCanopyPositions, 3));
umbrellaCanopyGeometry.setAttribute('color', new THREE.Float32BufferAttribute(umbrellaCanopyColors, 3));
umbrellaCanopyGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(umbrellaCanopyUvs, 2));
umbrellaCanopyGeometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(umbrellaCanopySkinIndices, 4));
umbrellaCanopyGeometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(umbrellaCanopySkinWeights, 4));
umbrellaCanopyGeometry.setIndex(umbrellaCanopyIndices);
umbrellaCanopyGeometry.computeVertexNormals();
const umbrellaSeamPositions = [];
const umbrellaSeamSkinIndices = [];
const umbrellaSeamSkinWeights = [];
const umbrellaSeamIndices = [];
for (let i = 0; i < UMBRELLA_RIB_COUNT; i++) {
  const angle = (i / UMBRELLA_RIB_COUNT) * TAU;
  const tangentX = -Math.sin(angle) * 0.006;
  const tangentZ = Math.cos(angle) * 0.006;
  const startVertex = umbrellaSeamPositions.length / 3;
  for (let ring = 0; ring <= UMBRELLA_CANOPY_RINGS; ring++) {
    const t = Math.max(0.035, ring / UMBRELLA_CANOPY_RINGS);
    const radius = UMBRELLA_RIM_RADIUS * t;
    const y = UMBRELLA_HUB_Y - UMBRELLA_RIM_DROP * Math.pow(t, 1.7) + 0.004;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    umbrellaSeamPositions.push(x - tangentX, y, z - tangentZ, x + tangentX, y, z + tangentZ);
    umbrellaSeamSkinIndices.push(i, 0, 0, 0, i, 0, 0, 0);
    umbrellaSeamSkinWeights.push(1, 0, 0, 0, 1, 0, 0, 0);
  }
  for (let ring = 0; ring < UMBRELLA_CANOPY_RINGS; ring++) {
    const a = startVertex + ring * 2;
    const b = a + 2;
    umbrellaSeamIndices.push(a, b, a + 1, b, b + 1, a + 1);
  }
}
const umbrellaSeamGeometry = new THREE.BufferGeometry();
umbrellaSeamGeometry.setAttribute('position', new THREE.Float32BufferAttribute(umbrellaSeamPositions, 3));
umbrellaSeamGeometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(umbrellaSeamSkinIndices, 4));
umbrellaSeamGeometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(umbrellaSeamSkinWeights, 4));
umbrellaSeamGeometry.setIndex(umbrellaSeamIndices);
umbrellaSeamGeometry.computeVertexNormals();
const umbrellaSeamMaterial = new THREE.MeshToonMaterial({
  color: 0x263d38,
  gradientMap: TOON_RAMP,
  side: THREE.DoubleSide,
  skinning: true,
});

function createUmbrellaState(slot) {
  return {
    inStand: true,
    taking: false,
    returning: false,
    returnMoveStarted: false,
    takeT: 0,
    returnT: 0,
    takeStartedAt: 0,
    returnStartedAt: 0,
    returnStartX: slot.x,
    returnStartZ: slot.z,
    standX: slot.x,
    standZ: slot.z,
    standTiltX: slot.tiltX,
    standTiltZ: slot.tiltZ,
    standRotY: slot.rotY,
    open: 0,
    targetOpen: 0,
    openFrom: 0,
    openStartedAt: 0,
    autoOpenTriggered: false,
    dragging: false,
    dragTargetX: slot.x,
    dragTargetZ: slot.z,
    velocityX: 0,
    velocityZ: 0,
    tiltX: 0,
    tiltZ: 0,
    autoOpenRain: false,
  };
}

function setUmbrellaBonePoseForRig(rig, value) {
  const e = clamp(value, 0, 1);
  const dir = new THREE.Vector3();
  rig.ribBones.forEach(({ bone, openDir, closedDir }) => {
    dir.lerpVectors(closedDir, openDir, e).normalize();
    bone.quaternion.setFromUnitVectors(UMBRELLA_UP, dir);
  });
  rig.runner.position.y = lerp(0.62, 0.93, easeInOutCubic(e));
  rig.wrap.visible = e < 0.12;
  rig.strap.visible = e < 0.18;
  rig.canopyMesh.visible = e > 0.08;
  rig.seamMesh.visible = e > 0.08;
  rig.ribVisuals.forEach((mesh) => { mesh.visible = e > 0.08; });
}

const umbrellaSlots = [];
for (let i = 0; i < UMBRELLA_SLOT_COUNT; i++) {
  const angle = (i / UMBRELLA_SLOT_COUNT) * TAU + 0.2;
  umbrellaSlots.push({
    x: UMBRELLA_STAND.x + Math.cos(angle) * 0.105,
    z: UMBRELLA_STAND.z + Math.sin(angle) * 0.105,
    tiltX: 0,
    tiltZ: 0,
    rotY: angle,
  });
}

function createUmbrellaRig(index, slot) {
  const group = new THREE.Group();
  group.position.set(slot.x, SIDEWALK_TOP, slot.z);
  group.rotation.set(slot.tiltX, slot.rotY, slot.tiltZ);
  world.add(group);
  const canopyMaterial = makeUmbrellaCanopyMaterial(index);
  const wrapMaterial = makeUmbrellaWrapMaterial(index);

  cylinder(group, M.metalDark, 0.012, 0.012, 0.99, 0, 0.585, 0, {
    seg: 8, cast: false, receive: false,
  });
  const handle = new THREE.Mesh(umbrellaHandleGeometry, umbrellaGripMaterial);
  handle.castShadow = false;
  group.add(handle);
  const grip = new THREE.Mesh(umbrellaGripGeometry, umbrellaGripMaterial);
  grip.position.y = 0.27;
  grip.castShadow = false;
  group.add(grip);
  const gripBottom = new THREE.Mesh(umbrellaGripCapGeometry, umbrellaGripMaterial);
  gripBottom.position.y = 0.16;
  gripBottom.castShadow = false;
  group.add(gripBottom);
  const gripTop = new THREE.Mesh(umbrellaGripCapGeometry, umbrellaGripMaterial);
  gripTop.position.y = 0.38;
  gripTop.castShadow = false;
  group.add(gripTop);
  const hubCap = new THREE.Mesh(umbrellaHubGeometry, M.metalDark);
  hubCap.scale.set(1, 0.65, 1);
  hubCap.position.y = UMBRELLA_HUB_Y;
  hubCap.castShadow = false;
  group.add(hubCap);
  const tipCap = new THREE.Mesh(umbrellaTipGeometry, M.metalLight);
  tipCap.position.y = UMBRELLA_HUB_Y + 0.085;
  tipCap.castShadow = false;
  group.add(tipCap);
  const runner = new THREE.Mesh(umbrellaRunnerGeometry, M.metalLight);
  runner.rotation.x = Math.PI / 2;
  runner.position.y = 0.72;
  runner.castShadow = false;
  group.add(runner);
  const wrap = new THREE.Mesh(umbrellaWrapGeometry, wrapMaterial);
  wrap.castShadow = false;
  group.add(wrap);

  const rootBone = new THREE.Bone();
  rootBone.name = 'umbrella-root-' + index;
  rootBone.position.set(0, UMBRELLA_HUB_Y, 0);
  group.add(rootBone);
  const ribBones = [];
  const ribVisuals = [];
  for (let i = 0; i < UMBRELLA_RIB_COUNT; i++) {
    const angle = (i / UMBRELLA_RIB_COUNT) * TAU;
    const openDir = new THREE.Vector3(
      Math.cos(angle) * UMBRELLA_RIM_RADIUS,
      -UMBRELLA_RIM_DROP,
      Math.sin(angle) * UMBRELLA_RIM_RADIUS
    ).normalize();
    const closedDir = new THREE.Vector3(
      Math.cos(angle) * 0.018,
      -0.4,
      Math.sin(angle) * 0.018
    ).normalize();
    const bone = new THREE.Bone();
    bone.name = 'umbrella-rib-' + index + '-' + i;
    bone.position.set(0, UMBRELLA_HUB_Y, 0);
    bone.quaternion.setFromUnitVectors(UMBRELLA_UP, openDir);
    group.add(bone);
    const ribMesh = new THREE.Mesh(umbrellaRibGeometry, umbrellaRibMaterial);
    ribMesh.position.y = UMBRELLA_RIB_LENGTH * 0.5;
    ribMesh.castShadow = false;
    bone.add(ribMesh);
    const tipMesh = new THREE.Mesh(umbrellaRibTipGeometry, M.metalLight);
    tipMesh.position.y = UMBRELLA_RIB_LENGTH;
    tipMesh.castShadow = false;
    bone.add(tipMesh);
    ribVisuals.push(ribMesh, tipMesh);
    ribBones.push({ bone, openDir, closedDir });
  }

  const canopyMesh = new THREE.SkinnedMesh(umbrellaCanopyGeometry, canopyMaterial);
  canopyMesh.castShadow = false;
  canopyMesh.receiveShadow = false;
  canopyMesh.frustumCulled = false;
  group.add(canopyMesh);
  const seamMesh = new THREE.SkinnedMesh(umbrellaSeamGeometry, umbrellaSeamMaterial);
  seamMesh.castShadow = false;
  seamMesh.frustumCulled = false;
  group.add(seamMesh);
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton([...ribBones.map((r) => r.bone), rootBone]);
  canopyMesh.bind(skeleton);
  seamMesh.bind(skeleton);

  const strap = new THREE.Group();
  const band = new THREE.Mesh(umbrellaStrapGeometry, umbrellaStrapMaterial);
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.82;
  band.castShadow = false;
  strap.add(band);
  const buckle = new THREE.Mesh(umbrellaBuckleGeometry, umbrellaBuckleMaterial);
  buckle.position.set(0.058, 0.82, 0);
  buckle.castShadow = false;
  strap.add(buckle);
  group.add(strap);

  const state = createUmbrellaState(slot);
  const rig = {
    index,
    group,
    state,
    ribBones,
    ribVisuals,
    canopyMesh,
    canopyMaterial,
    seamMesh,
    skeleton,
    runner,
    tipCap,
    wrap,
    wrapMaterial,
    strap,
    bodyHit: null,
  };
  setUmbrellaBonePoseForRig(rig, 0);
  rig.bodyHit = addHitBox(1.04, 1.3, 1.04, 0, 0.62, 0, group, { type: 'umbrellaBody', rig });
  return rig;
}

const umbrellaRigs = [];
for (let i = 0; i < UMBRELLA_SLOT_COUNT; i++) {
  umbrellaRigs.push(createUmbrellaRig(i, umbrellaSlots[i]));
}

let activeUmbrellaRig = null;
let umbrellaGroup = null;
let umbrellaState = null;
let umbrellaCanopyMesh = null;
let umbrellaTipCap = null;
let umbrellaRibBones = [];
let umbrellaRunner = null;
let umbrellaBodyHit = null;

function activateUmbrellaRig(rig) {
  activeUmbrellaRig = rig;
  umbrellaGroup = rig.group;
  umbrellaState = rig.state;
  umbrellaCanopyMesh = rig.canopyMesh;
  umbrellaTipCap = rig.tipCap;
  umbrellaRibBones = rig.ribBones;
  umbrellaRunner = rig.runner;
  umbrellaBodyHit = rig.bodyHit;
}
activateUmbrellaRig(umbrellaRigs[0]);

function setUmbrellaBonePose(value) {
  if (!activeUmbrellaRig) return;
  setUmbrellaBonePoseForRig(activeUmbrellaRig, value);
}

addHitBox(0.45, 1.15, 0.45, UMBRELLA_STAND.x, 0.82, UMBRELLA_STAND.z, world, { type: 'umbrellaStand' });

// Metal top ring, five rubber-lined collars and radial arms hold every shaft
// upright at exactly the same height.
const umbrellaStandMetal = toon(0x9a9d96, { soft: true });
const umbrellaStandDark = toon(0x4d504b, { soft: true });
const umbrellaStandRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.205, 0.006, 6, 36),
  umbrellaStandMetal
);
umbrellaStandRing.rotation.x = Math.PI / 2;
umbrellaStandRing.position.set(UMBRELLA_STAND.x, 0.585, UMBRELLA_STAND.z);
umbrellaStandRing.castShadow = false;
world.add(umbrellaStandRing);
for (let i = 0; i < UMBRELLA_SLOT_COUNT; i++) {
  const angle = (i / UMBRELLA_SLOT_COUNT) * TAU + 0.2;
  const sx = UMBRELLA_STAND.x + Math.cos(angle) * 0.105;
  const sz = UMBRELLA_STAND.z + Math.sin(angle) * 0.105;
  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.027, 0.0045, 5, 12),
    umbrellaStandDark
  );
  collar.rotation.x = Math.PI / 2;
  collar.position.set(sx, 0.56, sz);
  collar.castShadow = false;
  world.add(collar);
  const arm = barBetween(
    world,
    umbrellaStandMetal,
    [sx, 0.58, sz],
    [UMBRELLA_STAND.x + Math.cos(angle) * 0.205, 0.58, UMBRELLA_STAND.z + Math.sin(angle) * 0.205],
    0.0045
  );
  arm.castShadow = false;
}

// Soft open-canopy shadow with faint rib spokes. The scene uses a frozen
// shadow map, so this keeps the carried umbrella grounded without rebuilding
// the whole shadow atlas each frame.
const umbrellaShadowMap = canvasTexture(256, 256, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  const cx = w * 0.5;
  const cy = h * 0.5;
  const gradient = ctx.createRadialGradient(cx, cy, 8, cx, cy, w * 0.47);
  gradient.addColorStop(0, 'rgba(0,0,0,0.34)');
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.20)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.47, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * w * 0.42, cy + Math.sin(a) * w * 0.42);
    ctx.stroke();
  }
});
const umbrellaShadowMaterial = new THREE.MeshBasicMaterial({
  map: umbrellaShadowMap,
  color: 0x1c2825,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const umbrellaShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.28, 1.28), umbrellaShadowMaterial);
umbrellaShadow.rotation.x = -Math.PI / 2;
umbrellaShadow.position.set(UMBRELLA_STAND.x, 0.174, UMBRELLA_STAND.z);
umbrellaShadow.renderOrder = 5;
umbrellaShadow.visible = false;
world.add(umbrellaShadow);

function takeUmbrellaOut() {
  if (!umbrellaState.inStand) return;
  umbrellaState.inStand = false;
  umbrellaState.taking = true;
  umbrellaState.takeT = 0;
  umbrellaState.takeStartedAt = performance.now();
  umbrellaState.autoOpenRain = weatherMix < 0.5;
  umbrellaState.autoOpenTriggered = false;
  umbrellaState.targetOpen = 0;
  umbrellaState.open = 0;
  umbrellaState.openFrom = 0;
  umbrellaState.openStartedAt = performance.now();
  playUmbrellaOpen();
}

let pendingUmbrellaRig = null;

function takeUmbrellaByRig(rig) {
  if (!rig) return;
  if (activeUmbrellaRig !== rig) {
    if (!umbrellaState.inStand) {
      // Returning one umbrella before taking the next keeps only one airborne
      // at a time while still allowing any umbrella in the rack to be chosen.
      pendingUmbrellaRig = rig;
      returnUmbrellaToStand();
      return;
    }
    activateUmbrellaRig(rig);
  }
  if (umbrellaState.inStand) takeUmbrellaOut();
}

function returnUmbrellaToStand() {
  if (umbrellaState.inStand || umbrellaState.returning) return;
  umbrellaState.returning = true;
  umbrellaState.returnMoveStarted = false;
  umbrellaState.returnT = 0;
  umbrellaState.returnStartedAt = performance.now();
  umbrellaState.returnStartX = umbrellaGroup.position.x;
  umbrellaState.returnStartZ = umbrellaGroup.position.z;
  setUmbrellaOpenTarget(0, true);
  umbrellaState.dragging = false;
  umbrellaState.tiltX = 0;
  umbrellaState.tiltZ = 0;
  umbrellaGroup.rotation.set(0, 0, 0);
  playUmbrellaClose();
}

function setUmbrellaOpenTarget(value, silent = false) {
  const next = value > 0.5 ? 1 : 0;
  if (umbrellaState.targetOpen === next) return;
  umbrellaState.openFrom = umbrellaState.open;
  umbrellaState.openStartedAt = performance.now();
  umbrellaState.targetOpen = next;
  if (!silent) {
    if (next > 0.5) playUmbrellaOpen();
    else playUmbrellaClose();
  }
}

function toggleUmbrellaOpen() {
  if (umbrellaState.inStand) return;
  setUmbrellaOpenTarget(umbrellaState.targetOpen > 0.5 ? 0 : 1, false);
}

function nearUmbrellaStandScreen(x, y) {
  const projected = new THREE.Vector3(
    UMBRELLA_STAND.x,
    0.82,
    UMBRELLA_STAND.z
  ).project(camera);
  const sx = (projected.x * 0.5 + 0.5) * window.innerWidth;
  const sy = (-projected.y * 0.5 + 0.5) * window.innerHeight;
  return Math.hypot(x - sx, y - sy) < 30;
}

// ------------------------------------------------------------
// Sliding door: click to open, click again to close. No proximity trigger.
// ------------------------------------------------------------
const doorState = {
  open: 0,
  target: 0,
};
const doorHit = addHitPlane(1.4, 2.05, 0.23, 1.5, -0.855, world, { type: 'door' });
doorHit.layers.set(HIT_LAYER);
const doorRevealLight = new THREE.PointLight(0xffe3b7, 0, 3.4, 2.0);
doorRevealLight.position.set(0.23, 1.55, -0.3);
doorRevealLight.castShadow = false;
world.add(doorRevealLight);

function toggleDoor() {
  const opening = doorState.target < 0.5;
  doorState.target = opening ? 1 : 0;
  playDoorSlide(!opening);
}

// ------------------------------------------------------------
// Posters: pause and enlarge ever so slightly
// ------------------------------------------------------------
const posterInteract = [];
posterPlanes.forEach((poster, posterIndex) => {
  const record = {
    type: 'poster',
    mesh: poster,
    fit: 1,
    targetFit: 1,
    baseScale: poster.scale.clone(),
    textureIndex: posterIndex % POSTER_TEXTURES.length,
  };
  poster.material.map = POSTER_TEXTURES[record.textureIndex];
  poster.material.needsUpdate = true;
  poster.userData.interaction = record;
  interactionHitMeshes.push(poster);
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.78), INVISIBLE_HIT_MAT);
  pad.position.copy(poster.position);
  pad.quaternion.copy(poster.quaternion);
  pad.translateZ(0.012);
  pad.layers.set(HIT_LAYER);
  pad.castShadow = false;
  pad.receiveShadow = false;
  pad.userData.interaction = record;
  world.add(pad);
  interactionHitMeshes.push(pad);
  posterInteract.push(record);
});

function togglePoster(record) {
  record.textureIndex = (record.textureIndex + 1) % POSTER_TEXTURES.length;
  record.mesh.material.map = POSTER_TEXTURES[record.textureIndex];
  record.mesh.material.needsUpdate = true;
  record.targetFit = record.targetFit > 1.01 ? 1 : 1.065;
}

// ------------------------------------------------------------
// Trees: leaf swish and a soft warm halo
// ------------------------------------------------------------
const treeInteract = [];
const treeBeamTex = canvasTexture(64, 256, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,250,221,0)');
  g.addColorStop(0.35, 'rgba(255,248,211,0.45)');
  g.addColorStop(1, 'rgba(255,244,198,0)');
  ctx.fillStyle = g;
  ctx.fillRect(w * 0.28, 0, w * 0.44, h);
});
interactiveTrees.forEach((tree) => {
  const glowMat = new THREE.SpriteMaterial({
    map: RADIAL_TEX,
    color: 0xfff6d8,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.position.set(tree.x, tree.canopyY, tree.z);
  glow.scale.set(tree.glowBase * 1.8, tree.glowBase * 1.8, 1);
  glow.renderOrder = 14;
  world.add(glow);

  // Tiny warm glints nestled in the crown, like sun caught between the leaves.
  const glints = [];
  [
    [-0.32, 0.16, 0.24],
    [0.28, 0.05, 0.26],
    [-0.08, -0.16, -0.3],
    [0.38, -0.18, 0.1],
    [-0.3, 0.28, -0.12],
  ].forEach(([dx, dy, dz], i) => {
    const glintMat = new THREE.SpriteMaterial({
      map: RADIAL_TEX,
      color: 0xfff3c7,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    const glint = new THREE.Sprite(glintMat);
    glint.position.set(
      tree.x + dx * tree.scale,
      tree.canopyY + dy * tree.scale,
      tree.z + dz * tree.scale
    );
    glint.scale.setScalar((0.18 + (i % 3) * 0.035) * tree.scale * 2.0);
    glint.renderOrder = 15;
    world.add(glint);
    glints.push(glint);
  });

  const patchMat = new THREE.MeshBasicMaterial({
    map: RADIAL_TEX,
    color: 0xffe6a8,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(tree.glowBase * 1.5, tree.glowBase * 1.2), patchMat);
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(tree.x, 0.174, tree.z);
  patch.renderOrder = 4;
  world.add(patch);

  // Sunny Tyndall shafts through the leaves.
  const beams = [];
  for (let b = 0; b < 3; b++) {
    const beamMat = new THREE.MeshBasicMaterial({
      map: treeBeamTex,
      color: 0xfff7d5,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(0.28 * tree.scale, 1.9 * tree.scale), beamMat);
    beam.position.set(tree.x + (b - 1) * 0.24 * tree.scale, tree.base + 0.9 * tree.scale, tree.z + (b - 1) * 0.08);
    beam.rotation.y = b * 1.7 + tree.x;
    beam.rotation.z = (b - 1) * 0.16;
    beam.renderOrder = 8;
    world.add(beam);
    beams.push({ mesh: beam, mat: beamMat });
  }
  // A few rain streaks fall out of the crown in the wet state.
  const dropCount = 12;
  const dropPositions = new Float32Array(dropCount * 2 * 3);
  const dropSeeds = [];
  for (let d = 0; d < dropCount; d++) {
    const a = Math.random() * TAU;
    const r = Math.random() * 0.5 * tree.scale;
    dropSeeds.push({ x: tree.x + Math.cos(a) * r, z: tree.z + Math.sin(a) * r, y: tree.base + Math.random() * 1.8 });
  }
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPositions, 3));
  const dropMat = new THREE.LineBasicMaterial({ color: 0xb9ddff, transparent: true, opacity: 0, depthWrite: false });
  const rainDrops = new THREE.LineSegments(dropGeo, dropMat);
  rainDrops.frustumCulled = false;
  world.add(rainDrops);

  addHitSphere(0.7 * tree.scale, tree.x, tree.canopyY, tree.z, world, { type: 'tree', tree });
  treeInteract.push({ tree, glow, glowMat, glints, patch, patchMat, beams, rainDrops, dropSeeds });
});

// ------------------------------------------------------------
// Balloons: short float on tap, soft long-press drag
// ------------------------------------------------------------
const balloonClusterState = { sway: 0, time: 0 };
const balloonClusterHit = addHitSphere(0.27, 0, 0.56, 0, balloonPivot, { type: 'balloonCluster' });
balloonClusterHit.renderOrder = -101;
balloonRecords.forEach((record) => {
  interactionHitMeshes.push(record.hit);
});

function wobbleBalloonCluster() {
  balloonClusterState.sway = 1;
  balloonClusterState.time = 0;
  balloonRecords.forEach((record, i) => {
    record.bob = Math.max(record.bob, 0.48 + i * 0.04);
    record.bobT = Math.min(record.bobT, 0.1 + i * 0.03);
  });
}

// ------------------------------------------------------------
// Trash bin, street lamp, AC, bird, sign, flower and weather spots
// ------------------------------------------------------------
const trashState = { open: 0, target: 0 };
const trashLidPivot = streetKit.userData.trashLidPivot;
addHitBox(0.34, 0.72, 0.42, 2.06, 0.4, -0.58, world, { type: 'trash' });
function toggleTrash() {
  trashState.target = trashState.target > 0.5 ? 0 : 1;
  playTrashLid();
}

const lampState = { on: true };
const lampGlow = lampKit.userData.lampGlow;
const lampOnlyMeshes = [];
scene.traverse((o) => {
  if (o.userData && o.userData.lampOnly) {
    lampOnlyMeshes.push({
      mesh: o,
      baseOpacity: o.material && o.material.uniforms && o.material.uniforms.uOpacity
        ? o.material.uniforms.uOpacity.value
        : 0,
    });
  }
});
addHitBox(0.7, 0.85, 0.72, -3.68, 4.3, 2.42, world, { type: 'lamp' });
addHitBox(0.4, 2.4, 0.4, -3.68, 2.2, 1.52, world, { type: 'lamp' });
function toggleLamp() {
  lampState.on = !lampState.on;
  playSwitchClick();
}

const acState = { on: false, angle: 0, audio: null };
const acFan = new THREE.Group();
acFan.position.set(1.492, 3.05, -3.78);
world.add(acFan);
for (let i = 0; i < 3; i++) {
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.145, 0.045), M.metalDark);
  blade.position.y = 0.075;
  blade.rotation.x = (i / 3) * TAU;
  blade.castShadow = false;
  acFan.add(blade);
}
const acHub = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), M.metalLight);
acHub.castShadow = false;
acFan.add(acHub);
addHitBox(0.32, 0.7, 0.92, 1.4, 3.05, -3.78, world, { type: 'ac' });
function toggleAC() {
  acState.on = !acState.on;
  playSwitchClick();
}

const BIRD_Y = 4.98;
const birdState = { flap: 0 };
const birdGroup = new THREE.Group();
birdGroup.position.set(-5.45, BIRD_Y, 1.52);
world.add(birdGroup);
const birdBody = new THREE.Mesh(new THREE.SphereGeometry(0.09, 9, 7), toon(0x6d6257));
birdBody.scale.set(1.3, 0.9, 0.9);
birdBody.castShadow = false;
birdGroup.add(birdBody);
const birdHead = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), toon(0x7b6d5f));
birdHead.position.set(0.085, 0.08, 0);
birdHead.castShadow = false;
birdGroup.add(birdHead);
const birdBeak = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 6), basic(0xe0a346));
birdBeak.position.set(0.145, 0.075, 0);
birdBeak.rotation.z = -Math.PI / 2;
birdGroup.add(birdBeak);
const birdWings = [];
[-1, 1].forEach((side) => {
  const pivot = new THREE.Group();
  pivot.position.set(-0.01, 0.02, side * 0.065);
  const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), toon(0x8f8171, { side: THREE.DoubleSide }));
  wing.position.z = side * 0.075;
  wing.rotation.y = side * 0.35;
  wing.castShadow = false;
  pivot.add(wing);
  birdGroup.add(pivot);
  birdWings.push(pivot);
});
addHitSphere(0.3, -5.45, BIRD_Y, 1.52, world, { type: 'bird' });
function pokeBird() {
  birdState.flap = 2.4;
  playBirdChirp();
}

const signPivot = guardKit.userData.signPivot;
const signState = { angle: 0, velocity: 0 };
addHitBox(0.72, 0.78, 0.32, 3.02, SIDEWALK_TOP + 2.2, 1.9, world, { type: 'sign' });
function wobbleSign() {
  signState.velocity += 1.15;
}

const flowerPotHit = addHitBox(0.48, 0.56, 0.48, 1.05, 0.45, -0.37, world, { type: 'flower' });
flowerPotRecord.bloomTarget = 0;
flowerPotRecord.bloomHoldUntil = 0;
flowerPotRecord.butterflyActive = false;
flowerPotRecord.butterflyTime = 0;
const butterfly = new THREE.Group();
butterfly.visible = false;
butterfly.scale.setScalar(1.45);
butterfly.position.set(1.05, 0.65, -0.37);
world.add(butterfly);
const butterflyWings = [];
[-1, 1].forEach((side) => {
  const wingPivot = new THREE.Group();
  const wing = new THREE.Mesh(
    new THREE.PlaneGeometry(0.14, 0.1),
    new THREE.MeshBasicMaterial({ color: side < 0 ? 0xf4b34f : 0xffd985, transparent: true, opacity: 0.92, side: THREE.DoubleSide })
  );
  wing.position.x = side * 0.07;
  wingPivot.add(wing);
  butterfly.add(wingPivot);
  butterflyWings.push({ pivot: wingPivot, side });
});
const butterflyBody = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.012, 0.13, 5), toon(0x4a3a30));
butterflyBody.rotation.x = Math.PI / 2;
butterfly.add(butterflyBody);
flowerPotRecord.butterfly = butterfly;
flowerPotRecord.butterflyWings = butterflyWings;

function spreadFlower() {
  flowerPotRecord.bloomTarget = 1;
  flowerPotRecord.bloomHoldUntil = performance.now() + 2400;
}
function releaseButterfly() {
  if (weatherMix < 0.5 || flowerPotRecord.butterflyActive) return;
  flowerPotRecord.butterflyActive = true;
  flowerPotRecord.butterflyTime = 0;
  butterfly.visible = true;
}

sunPatches.forEach((record) => {
  addHitBox(record.width * 0.92, 0.08, record.depth * 0.92, record.baseX, 0.185, record.baseZ, sunnyDecor, {
    type: 'sunPatch', record,
  });
});
function pokeSunPatch(record) {
  record.flash = 1;
  record.driftX += 0.22;
  record.driftZ += 0.14;
}

const rippleEffects = [];
function spawnRipple(x, z, sx, sz, y = 0.18, strength = 1) {
  const life = 2.2 + Math.random() * 0.8;
  const mat = new THREE.MeshBasicMaterial({
    color: 0xbfeaff,
    transparent: true,
    opacity: 0.32 * strength,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1.0, 28), mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, y + 0.006, z);
  ring.scale.setScalar(0.13);
  ring.renderOrder = 7;
  world.add(ring);
  rippleEffects.push({
    mesh: ring,
    mat,
    age: 0,
    life,
    start: 0.13,
    end: Math.max(0.3, Math.max(sx, sz) * 1.5) * strength,
  });
}

const puddleHitMeshes = [];
puddleRecords.forEach((record) => {
  const hit = addHitBox(record.sx * 1.8, 0.04, record.sz * 1.8, record.x, record.y + 0.012, record.z, world, {
    type: 'puddle', record,
  });
  record.hit = hit;
  puddleHitMeshes.push(hit);
});
function pokePuddle(record) {
  if (weatherMix > 0.5) return;
  spawnRipple(record.x, record.z, record.sx, record.sz, record.y, 1);
  spawnRipple(record.x, record.z, record.sx * 0.8, record.sz * 0.8, record.y, 0.75);
  playWaterDrop();
}

// Eave drain: a real little spout plus a short local burst of water.
const eaveState = { boostUntil: 0, splashTimer: 0 };
const eaveSpout = new THREE.Group();
eaveSpout.position.set(-4.55, 2.0, -0.72);
world.add(eaveSpout);
const eavePipe = cylinder(eaveSpout, M.metalDark, 0.045, 0.055, 0.72, 0, 0.36, 0, { seg: 8, cast: false });
const eaveLip = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.06, 8), M.metalDark);
eaveLip.position.y = -0.36;
eaveLip.castShadow = false;
eaveSpout.add(eaveLip);
const eaveHit = addHitBox(0.34, 0.86, 0.34, -4.55, 2.0, -0.72, world, { type: 'eave' });
const eaveDropCount = 34;
const eavePositions = new Float32Array(eaveDropCount * 2 * 3);
const eaveSeeds = [];
for (let i = 0; i < eaveDropCount; i++) {
  eaveSeeds.push({
    x: -4.55 + rand(-0.06, 0.06),
    y: rand(0.3, 1.7),
    z: -0.72 + rand(-0.05, 0.05),
    speed: rand(2.5, 4.2),
  });
}
const eaveGeo = new THREE.BufferGeometry();
eaveGeo.setAttribute('position', new THREE.BufferAttribute(eavePositions, 3));
const eaveStream = new THREE.LineSegments(
  eaveGeo,
  new THREE.LineBasicMaterial({ color: 0xc5e9ff, transparent: true, opacity: 0.72, depthWrite: false })
);
eaveStream.frustumCulled = false;
eaveStream.visible = false;
world.add(eaveStream);
function pokeEave() {
  if (weatherMix > 0.5) return;
  eaveState.boostUntil = performance.now() + 4200;
  eaveState.splashTimer = 0;
  playWaterDrop();
}

// Store sign easter egg: three quick taps start a slow breathing glow.
const shopSignState = { clicks: [], effect: 0, effectStart: 0, duration: 3.2 };
addHitBox(5.35, 0.78, 0.3, STORE_CX, 3.1, -0.7, world, { type: 'shopSign' });
const neonFlashMat = new THREE.SpriteMaterial({
  map: RADIAL_TEX,
  color: 0xb9fff2,
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  depthTest: true,
  fog: false,
});
const neonFlash = new THREE.Sprite(neonFlashMat);
neonFlash.position.set(0.2, 2.9, -0.55);
neonFlash.scale.set(3.6, 1.5, 1);
neonFlash.renderOrder = 12;
world.add(neonFlash);
function pokeShopSign() {
  const now = performance.now();
  shopSignState.clicks = shopSignState.clicks.filter((t) => now - t < 1000);
  shopSignState.clicks.push(now);
  if (shopSignState.clicks.length >= 3) {
    shopSignState.clicks = [];
    shopSignState.effect = 1;
    shopSignState.effectStart = now;
    playShopChime();
  }
}

// ------------------------------------------------------------
// Pointer gestures
// ------------------------------------------------------------
let activeGesture = null;

function startBalloonDrag(gesture) {
  if (!gesture || gesture.kind !== 'balloon' || gesture.dragging) return;
  gesture.dragging = true;
  gesture.record.dragActive = true;
  gesture.record.returning = false;
  const worldPos = new THREE.Vector3();
  gesture.record.group.getWorldPosition(worldPos);
  gesture.planeY = worldPos.y;
  gesture.startPoint = pointerOnHorizontalPlane(gesture.lastEvent, gesture.planeY);
  if (!gesture.startPoint) {
    gesture.startPoint = worldPos.clone();
  }
  const localStart = balloonPivot.worldToLocal(gesture.startPoint.clone());
  gesture.grabOffset = new THREE.Vector3(
    localStart.x - gesture.record.base.x,
    0,
    localStart.z - gesture.record.base.z
  );
}

function finishGesture() {
  if (!activeGesture) return;
  const gesture = activeGesture;
  activeGesture = null;
  if (gesture.holdTimer) clearTimeout(gesture.holdTimer);
  if (gesture.kind === 'balloon') {
    const record = gesture.record;
    record.dragActive = false;
    if (gesture.dragging) {
      record.returning = true;
    } else if (!gesture.moved) {
      record.bob = 1;
      record.bobT = 0;
      wobbleBalloonCluster();
    }
  }
  if (gesture.kind === 'bike') {
    bikeState.dragging = false;
    if (!gesture.moved && gesture.hit.data.type === 'bikeBell') ringBikeBell();
  }
  if (gesture.kind === 'umbrella') {
    umbrellaState.dragging = false;
    if (!gesture.moved) {
      if (nearUmbrellaStandScreen(gesture.startX, gesture.startY)) {
        returnUmbrellaToStand();
      } else {
        toggleUmbrellaOpen();
      }
    } else {
      const dist = Math.hypot(
        umbrellaGroup.position.x - UMBRELLA_STAND.x,
        umbrellaGroup.position.z - UMBRELLA_STAND.z
      );
      if (dist < 0.62) returnUmbrellaToStand();
    }
  }
  if (gesture.kind === 'bottle') {
    const bottle = gesture.bottle;
    if (gesture.dragging) {
      settleBottle(bottle, bottle.group.position, gesture.lastEvent);
    } else {
      returnBottleToMachine(bottle);
    }
  }
  if (gesture.kind === 'flower' && !gesture.moved) {
    spreadFlower();
  }
  if (gesture.kind === 'tap' && !gesture.moved) {
    const data = gesture.hit.data;
    if (data.type === 'vending') {
      wakeVending(data.machine);
    } else if (data.type === 'vendingButton') {
      data.machine.buttons[data.index].press = 1;
      wakeVending(data.machine);
    } else if (data.type === 'bottle') {
      wakeVending(data.machine);
      selectBottle(data.bottle);
    } else if (data.type === 'door') {
      toggleDoor();
    } else if (data.type === 'umbrellaStand') {
      if (umbrellaState.inStand) takeUmbrellaOut();
      else returnUmbrellaToStand();
    } else if (data.type === 'umbrellaBody') {
      const rig = data.rig;
      if (!umbrellaState.inStand && nearUmbrellaStandScreen(gesture.startX, gesture.startY)) {
        // Clicking the rack always puts the carried umbrella back, even when
        // the ray first touches the body of a still-racked umbrella.
        returnUmbrellaToStand();
      } else if (rig && rig.state.inStand) {
        takeUmbrellaByRig(rig);
      } else {
        toggleUmbrellaOpen();
      }
    } else if (data.type === 'balloonCluster') {
      wobbleBalloonCluster();
    } else if (data.type === 'tree') {
      data.tree.swing = 1.25;
    } else if (data.type === 'poster') {
      togglePoster(data.record || data);
    } else if (data.type === 'trash') {
      toggleTrash();
    } else if (data.type === 'lamp') {
      toggleLamp();
    } else if (data.type === 'ac') {
      toggleAC();
    } else if (data.type === 'bird') {
      pokeBird();
    } else if (data.type === 'sign') {
      wobbleSign();
    } else if (data.type === 'sunPatch') {
      pokeSunPatch(data.record);
    } else if (data.type === 'puddle') {
      pokePuddle(data.record);
    } else if (data.type === 'eave') {
      pokeEave();
    } else if (data.type === 'shopSign') {
      pokeShopSign();
    } else if (data.type === 'aFrame') {
      cycleAFrameSign();
    } else if (data.type === 'secCamera') {
      turnSecurityCamera();
    } else if (data.type === 'boxes') {
      wobbleCardboardBoxes();
    } else if (data.type === 'leaf') {
      liftLeaf(data.record);
    }
  }
  controls.enabled = true;
  try {
    if (renderer.domElement.hasPointerCapture(gesture.pointerId)) {
      renderer.domElement.releasePointerCapture(gesture.pointerId);
    }
  } catch (e) {
    // capture is best-effort
  }
  renderer.domElement.style.cursor = '';
}

function cancelGesture() {
  if (!activeGesture) return;
  const gesture = activeGesture;
  if (gesture.holdTimer) clearTimeout(gesture.holdTimer);
  if (gesture.kind === 'balloon') {
    gesture.record.dragActive = false;
    gesture.record.returning = true;
  } else if (gesture.kind === 'umbrella') {
    umbrellaState.dragging = false;
  } else if (gesture.kind === 'bottle' && gesture.dragging) {
    settleBottle(gesture.bottle, gesture.bottle.group.position, gesture.lastEvent);
  }
  activeGesture = null;
  controls.enabled = true;
  try {
    if (renderer.domElement.hasPointerCapture(gesture.pointerId)) {
      renderer.domElement.releasePointerCapture(gesture.pointerId);
    }
  } catch (e) {
    // ignore
  }
  renderer.domElement.style.cursor = '';
}

function onPointerDown(event) {
  if (event.target !== renderer.domElement) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  const hit = findInteractionHit(event);
  if (!hit) return;

  ensureAudio();
  event.stopPropagation();
  event.preventDefault();

  const x = event.clientX;
  const y = event.clientY;
  const pointerId = event.pointerId;

  // The rack is a reliable return target: a click in the stand area always
  // puts the carried umbrella back before any other umbrella hit is handled.
  if (umbrellaState && !umbrellaState.inStand &&
      nearUmbrellaStandScreen(event.clientX, event.clientY)) {
    returnUmbrellaToStand();
    controls.enabled = true;
    return;
  }

  try {
    renderer.domElement.setPointerCapture(pointerId);
  } catch (e) {
    // ignore
  }

  if (hit.data.type === 'umbrellaBody' && hit.data.rig && !hit.data.rig.state.inStand) {
    if (activeUmbrellaRig !== hit.data.rig) activateUmbrellaRig(hit.data.rig);
    activeGesture = {
      kind: 'umbrella',
      pointerId,
      hit,
      rig: hit.data.rig,
      startX: x,
      startY: y,
      moved: false,
      lastEvent: event,
      dragging: false,
      startPoint: pointerOnHorizontalPlane(event, SIDEWALK_TOP + 0.02),
      startOffsetX: umbrellaGroup.position.x,
      startOffsetZ: umbrellaGroup.position.z,
    };
    controls.enabled = false;
    renderer.domElement.style.cursor = 'grabbing';
  } else if (hit.data.type === 'bottle' &&
             (hit.data.bottle.selected || hit.data.bottle.location !== 'machine')) {
    activeGesture = {
      kind: 'bottle',
      pointerId,
      hit,
      bottle: hit.data.bottle,
      startX: x,
      startY: y,
      moved: false,
      lastEvent: event,
      dragging: false,
      lastPoint: null,
    };
    controls.enabled = false;
    renderer.domElement.style.cursor = 'grabbing';
  } else if (hit.data.type === 'bike' || hit.data.type === 'bikeBell') {
    const point = pointerOnHorizontalPlane(event, SIDEWALK_TOP + 0.02);
    activeGesture = {
      kind: 'bike',
      pointerId,
      hit,
      startX: x,
      startY: y,
      moved: false,
      startPoint: point,
      startOffset: bikeState.current.clone(),
    };
    bikeState.dragging = false;
    controls.enabled = false;
    renderer.domElement.style.cursor = 'grabbing';
  } else if (hit.data.type === 'flower') {
    const gesture = {
      kind: 'flower',
      pointerId,
      hit,
      startX: x,
      startY: y,
      moved: false,
      long: false,
      holdTimer: null,
    };
    gesture.holdTimer = setTimeout(() => {
      if (activeGesture === gesture && !gesture.moved) {
        gesture.long = true;
        releaseButterfly();
      }
    }, 520);
    activeGesture = gesture;
  } else if (hit.data.type === 'balloon') {
    const gesture = {
      kind: 'balloon',
      pointerId,
      hit,
      startX: x,
      startY: y,
      moved: false,
      lastEvent: event,
      dragging: false,
      record: hit.data.record,
      holdTimer: null,
      planeY: 0,
      startPoint: null,
    };
    gesture.holdTimer = setTimeout(() => {
      if (activeGesture === gesture && !gesture.moved) startBalloonDrag(gesture);
    }, 230);
    activeGesture = gesture;
    controls.enabled = false;
    renderer.domElement.style.cursor = 'grabbing';
  } else {
    activeGesture = {
      kind: 'tap',
      pointerId,
      hit,
      startX: x,
      startY: y,
      moved: false,
    };
    renderer.domElement.style.cursor = 'pointer';
  }
}

function onPointerMove(event) {
  if (!activeGesture) {
    if (event.pointerType === 'mouse' && event.target === renderer.domElement) {
      const hit = findInteractionHit(event);
      renderer.domElement.style.cursor = hit ? 'pointer' : '';
    }
    return;
  }
  const gesture = activeGesture;
  if (event.pointerId !== gesture.pointerId) return;

  gesture.lastEvent = event;
  const dx = event.clientX - gesture.startX;
  const dy = event.clientY - gesture.startY;
  if (!gesture.moved && dx * dx + dy * dy > 36) {
    gesture.moved = true;
    if (gesture.kind === 'balloon' && !gesture.dragging) {
      if (gesture.holdTimer) clearTimeout(gesture.holdTimer);
      startBalloonDrag(gesture);
    }
  }

  if (gesture.kind === 'bike') {
    if (!gesture.moved) return;
    if (!bikeState.dragging) {
      bikeState.dragging = true;
      if (!gesture.startPoint) gesture.startPoint = pointerOnHorizontalPlane(event, SIDEWALK_TOP + 0.02);
      if (!gesture.startOffset) gesture.startOffset = bikeState.current.clone();
    }
    const point = pointerOnHorizontalPlane(event, SIDEWALK_TOP + 0.02);
    if (!point || !gesture.startPoint) return;
    const nx = gesture.startOffset.x + point.x - gesture.startPoint.x;
    const nz = gesture.startOffset.y + point.z - gesture.startPoint.z;
    bikeState.target.x = clamp(nx, BIKE_BOUNDS.xMin, BIKE_BOUNDS.xMax);
    bikeState.target.y = clamp(nz, BIKE_BOUNDS.zMin, BIKE_BOUNDS.zMax);
    event.preventDefault();
  } else if (gesture.kind === 'umbrella') {
    if (!gesture.moved) return;
    if (!umbrellaState.dragging) {
      umbrellaState.dragging = true;
      gesture.dragging = true;
    }
    const point = pointerOnHorizontalPlane(event, SIDEWALK_TOP + 0.05);
    if (!point || !gesture.startPoint) return;
    umbrellaState.dragTargetX = clamp(
      gesture.startOffsetX + point.x - gesture.startPoint.x,
      -4.2, 4.4
    );
    umbrellaState.dragTargetZ = clamp(
      gesture.startOffsetZ + point.z - gesture.startPoint.z,
      -0.2, 2.2
    );
    event.preventDefault();
  } else if (gesture.kind === 'bottle') {
    if (!gesture.moved) return;
    if (!gesture.dragging) {
      gesture.dragging = true;
      gesture.bottle.location = 'dragging';
      gesture.bottle.selected = true;
      gesture.bottle.targetLift = 0;
    }
    const point = pointerOnHorizontalPlane(event, 0.58);
    if (!point) return;
    gesture.bottle.group.position.set(
      clamp(point.x, -4.5, 4.5),
      0.58,
      clamp(point.z, -0.3, 3.0)
    );
    gesture.bottle.group.rotation.set(0, 0, 0);
    event.preventDefault();
  } else if (gesture.kind === 'balloon' && gesture.dragging) {
    const point = pointerOnHorizontalPlane(event, gesture.planeY);
    if (!point) return;
    const local = balloonPivot.worldToLocal(point.clone());
    const record = gesture.record;
    record.offset.x = clamp(local.x - record.base.x - gesture.grabOffset.x, -0.6, 0.6);
    record.offset.z = clamp(local.z - record.base.z - gesture.grabOffset.z, -0.46, 0.46);
    record.offset.y = 0;
    record.velocity.set(0, 0, 0);
    event.preventDefault();
  }
}

function onPointerUp(event) {
  if (!activeGesture || event.pointerId !== activeGesture.pointerId) return;
  finishGesture();
}

function onPointerCancel(event) {
  if (!activeGesture || event.pointerId !== activeGesture.pointerId) return;
  cancelGesture();
}

window.addEventListener('pointerdown', onPointerDown, true);
window.addEventListener('pointermove', onPointerMove, { passive: false });
window.addEventListener('pointerup', onPointerUp);
window.addEventListener('pointercancel', onPointerCancel);
window.addEventListener('blur', () => {
  if (activeGesture) cancelGesture();
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

// ------------------------------------------------------------
// Gentle per-frame interaction update
// ------------------------------------------------------------
function updateInteractions(dt, t) {
  // vending lights, physical buttons and floating / carried drinks
  const basketWorld = bikeBasketAnchor.getWorldPosition(new THREE.Vector3());
  vendingInteract.forEach((machine) => {
    const targetGlow = performance.now() < machine.litUntil ? 1 : 0;
    machine.glow += (targetGlow - machine.glow) * Math.min(1, dt * 3.4);
    machine.overlay.material.opacity = machine.glow * 0.2;
    machine.halo.material.opacity = machine.glow * 0.12;
    machine.frameGlow.material.opacity = machine.glow * 0.4;
    machine.light.intensity = machine.glow * (weatherMix > 0.5 ? 0.55 : 0.95);
    machine.buttons.forEach((button) => {
      button.press *= Math.exp(-dt * 12);
      button.mesh.position.x = button.baseX - 0.018 * Math.min(1, button.press);
    });
    machine.bottles.forEach((bottle) => {
      bottle.glowMat.opacity = 0;
      if (bottle.location === 'machine') {
        bottle.lift += (bottle.targetLift - bottle.lift) * Math.min(1, dt * 2.6);
        const lift = bottle.lift;
        bottle.group.position.set(
          bottle.home.x + 0.08 * lift,
          bottle.home.y + 0.12 * lift + Math.sin(t * 2.1 + bottle.phase) * 0.006 * lift,
          bottle.home.z
        );
        bottle.group.rotation.z = Math.sin(t * 1.7 + bottle.phase) * 0.055 * lift;
        bottle.glowMat.opacity = lift * 0.42;
        bottle.glow.scale.setScalar(0.26 + 0.03 * Math.sin(t * 2.4 + bottle.phase));
      } else if (bottle.location === 'basket') {
        bottle.lift = 1;
        bottle.group.position.set(basketWorld.x, basketWorld.y + 0.015, basketWorld.z);
        bottle.group.rotation.set(0, 0, 0);
      }
    });
  });

  // bicycle translation + bell tremble
  const ease = Math.min(1, dt * 6.0);
  bikeState.current.x += (bikeState.target.x - bikeState.current.x) * ease;
  bikeState.current.y += (bikeState.target.y - bikeState.current.y) * ease;
  bikeKit.position.x = bikeState.current.x;
  bikeKit.position.z = bikeState.current.y;
  const bikeDX = bikeKit.position.x - bikeState.prevX;
  const bikeDZ = bikeKit.position.z - bikeState.prevZ;
  const bikeDist = Math.hypot(bikeDX, bikeDZ);
  if (bikeDist > 0.0001) {
    bikeState.wheelSpin -= (bikeDZ >= 0 ? 1 : -1) * (bikeDist / 0.31);
    bikeWheelGroups.forEach((wheel) => { wheel.rotation.x = bikeState.wheelSpin; });
    if (bikeState.dragging && weatherMix < 0.5 && bikeDist > 0.002) {
      bikeState.trailTimer -= dt;
      if (bikeState.trailTimer <= 0) {
        bikeState.trailTimer = 0.12;
        spawnBikeTrail();
      }
    }
  }
  bikeState.prevX = bikeKit.position.x;
  bikeState.prevZ = bikeKit.position.z;

  bikeState.bellShake *= Math.exp(-dt * 3.2);
  if (bikeBell && bikeState.bellShake > 0.002) {
    bikeBell.rotation.z = bikeBellBaseRot.z + Math.sin(t * 42.0) * 0.16 * bikeState.bellShake;
    bikeBell.rotation.x = bikeBellBaseRot.x + Math.cos(t * 35.0) * 0.055 * bikeState.bellShake;
    bikeBell.position.x = bikeBellBasePos.x + Math.sin(t * 52.0) * 0.004 * bikeState.bellShake;
  } else if (bikeBell) {
    bikeBell.rotation.z = bikeBellBaseRot.z;
    bikeBell.rotation.x = bikeBellBaseRot.x;
    bikeBell.position.x = bikeBellBasePos.x;
  }

  // umbrella: take out / return / drag / layered rib-to-cloth opening
  if (umbrellaState.taking) {
    umbrellaState.takeT = clamp((performance.now() - umbrellaState.takeStartedAt) / 950, 0, 1);
    const k = easeInOutCubic(umbrellaState.takeT);
    umbrellaGroup.position.x = lerp(umbrellaState.standX, UMBRELLA_OUT.x, k);
    umbrellaGroup.position.z = lerp(umbrellaState.standZ, UMBRELLA_OUT.z, k);
    umbrellaGroup.position.y = SIDEWALK_TOP + Math.sin(k * Math.PI) * 0.14;
    umbrellaGroup.rotation.x = lerp(umbrellaState.standTiltX, 0, k);
    umbrellaGroup.rotation.z = lerp(umbrellaState.standTiltZ, 0, k);
    umbrellaGroup.rotation.y = lerp(umbrellaState.standRotY, 0, k);
    if (umbrellaState.takeT > 0.55 && umbrellaState.autoOpenRain && !umbrellaState.autoOpenTriggered) {
      umbrellaState.autoOpenTriggered = true;
      setUmbrellaOpenTarget(1, true);
    }
    if (umbrellaState.takeT >= 1) {
      umbrellaState.taking = false;
      umbrellaGroup.position.set(UMBRELLA_OUT.x, SIDEWALK_TOP, UMBRELLA_OUT.z);
      umbrellaGroup.rotation.set(0, 0, 0);
      umbrellaState.dragTargetX = UMBRELLA_OUT.x;
      umbrellaState.dragTargetZ = UMBRELLA_OUT.z;
    }
  } else if (umbrellaState.returning) {
    umbrellaState.targetOpen = 0;
    if (!umbrellaState.returnMoveStarted) {
      // First fold the cloth and gather the ribs while still on the ground.
      umbrellaGroup.position.y = SIDEWALK_TOP;
      if (umbrellaState.open < 0.08) {
        umbrellaState.returnMoveStarted = true;
        umbrellaState.returnStartedAt = performance.now();
        umbrellaState.returnStartX = umbrellaGroup.position.x;
        umbrellaState.returnStartZ = umbrellaGroup.position.z;
      }
    } else {
      umbrellaState.returnT = clamp((performance.now() - umbrellaState.returnStartedAt) / 800, 0, 1);
      const k = easeInOutCubic(umbrellaState.returnT);
      umbrellaGroup.position.x = lerp(umbrellaState.returnStartX, umbrellaState.standX, k);
      umbrellaGroup.position.z = lerp(umbrellaState.returnStartZ, umbrellaState.standZ, k);
      umbrellaGroup.position.y = SIDEWALK_TOP + Math.sin(k * Math.PI) * 0.07;
      if (umbrellaState.returnT >= 1) {
        umbrellaState.returning = false;
        umbrellaState.returnMoveStarted = false;
        umbrellaState.inStand = true;
        umbrellaState.open = 0;
        umbrellaState.targetOpen = 0;
        umbrellaState.dragging = false;
        umbrellaGroup.position.set(umbrellaState.standX, SIDEWALK_TOP, umbrellaState.standZ);
        umbrellaGroup.rotation.set(
          umbrellaState.standTiltX,
          umbrellaState.standRotY,
          umbrellaState.standTiltZ
        );
        if (pendingUmbrellaRig) {
          const nextRig = pendingUmbrellaRig;
          pendingUmbrellaRig = null;
          activateUmbrellaRig(nextRig);
          takeUmbrellaOut();
        }
      }
    }
  } else if (!umbrellaState.inStand) {
    const prevX = umbrellaGroup.position.x;
    const prevZ = umbrellaGroup.position.z;
    const follow = Math.min(1, dt * 5.0);
    umbrellaGroup.position.x += (umbrellaState.dragTargetX - umbrellaGroup.position.x) * follow;
    umbrellaGroup.position.z += (umbrellaState.dragTargetZ - umbrellaGroup.position.z) * follow;
    umbrellaGroup.position.y = SIDEWALK_TOP;
    const vx = (umbrellaGroup.position.x - prevX) / Math.max(0.001, dt);
    const vz = (umbrellaGroup.position.z - prevZ) / Math.max(0.001, dt);
    umbrellaState.velocityX += (vx - umbrellaState.velocityX) * Math.min(1, dt * 8);
    umbrellaState.velocityZ += (vz - umbrellaState.velocityZ) * Math.min(1, dt * 8);
    if (!umbrellaState.dragging) {
      umbrellaState.dragTargetX = clamp(umbrellaState.dragTargetX, -4.2, 4.4);
      umbrellaState.dragTargetZ = clamp(umbrellaState.dragTargetZ, -0.25, 2.2);
    }
    const targetTiltZ = clamp(-umbrellaState.velocityX * 0.14, -0.2, 0.2);
    const targetTiltX = clamp(umbrellaState.velocityZ * 0.14, -0.2, 0.2);
    umbrellaState.tiltZ += (targetTiltZ - umbrellaState.tiltZ) * Math.min(1, dt * 4.0);
    umbrellaState.tiltX += (targetTiltX - umbrellaState.tiltX) * Math.min(1, dt * 4.0);
    umbrellaGroup.rotation.z = umbrellaState.tiltZ;
    umbrellaGroup.rotation.x = umbrellaState.tiltX;
    // Lift by the small amount the handle needs while leaning, so no part of
    // the umbrella ever dips through the pavement.
    umbrellaGroup.position.y = SIDEWALK_TOP +
      0.16 * (Math.abs(umbrellaState.tiltX) + Math.abs(umbrellaState.tiltZ));
  } else {
    umbrellaGroup.position.set(umbrellaState.standX, SIDEWALK_TOP, umbrellaState.standZ);
    umbrellaGroup.rotation.x += (umbrellaState.standTiltX - umbrellaGroup.rotation.x) * Math.min(1, dt * 5);
    umbrellaGroup.rotation.z += (umbrellaState.standTiltZ - umbrellaGroup.rotation.z) * Math.min(1, dt * 5);
    umbrellaGroup.rotation.y += (umbrellaState.standRotY - umbrellaGroup.rotation.y) * Math.min(1, dt * 5);
  }

  const openProgress = clamp((performance.now() - umbrellaState.openStartedAt) / 1600, 0, 1);
  umbrellaState.open = lerp(
    umbrellaState.openFrom,
    umbrellaState.targetOpen,
    easeInOutCubic(openProgress)
  );
  if (openProgress >= 1) umbrellaState.open = umbrellaState.targetOpen;
  const u = clamp(umbrellaState.open, 0, 1);
  setUmbrellaBonePose(u);
  umbrellaCanopyMesh.visible = true;
  umbrellaTipCap.visible = true;

  const umbrellaWet = 1 - weatherMix;
  const umbrellaSheen = 0.008 + umbrellaWet * 0.072;
  umbrellaRigs.forEach((rig) => {
    const canopyUniform = rig.canopyMaterial && rig.canopyMaterial.userData.sheenUniform;
    if (canopyUniform) canopyUniform.value = umbrellaSheen;
    const wrapUniform = rig.wrapMaterial && rig.wrapMaterial.userData.sheenUniform;
    if (wrapUniform) wrapUniform.value = umbrellaSheen * 0.7;
  });

  if (!umbrellaState.inStand && umbrellaState.open > 0.04) {
    umbrellaShadow.visible = true;
    umbrellaShadow.position.set(umbrellaGroup.position.x, 0.174, umbrellaGroup.position.z);
    const shadowScale = 0.7 + umbrellaState.open * 0.52;
    umbrellaShadow.scale.set(shadowScale, shadowScale, 1);
    umbrellaShadowMaterial.opacity = (0.05 + weatherMix * 0.17) *
      clamp(umbrellaState.open * 1.35, 0, 1);
  } else {
    umbrellaShadow.visible = false;
  }

  // door: click opens, click again closes. Camera movement never triggers it.
  doorState.open += (doorState.target - doorState.open) * Math.min(1, dt * 2.2);
  const doorOpen = clamp(doorState.open, 0, 1);
  DOOR.left.position.x = -0.62 * doorOpen;
  DOOR.right.position.x = 0.62 * doorOpen;
  doorRevealLight.intensity = doorOpen * (weatherMix * 0.55 + (1 - weatherMix) * 0.18);

  // tree crowns and soft halos
  treeInteract.forEach(({ tree, glow, glowMat, glints, patch, patchMat, beams, rainDrops, dropSeeds }) => {
    tree.swing *= Math.exp(-dt * 1.15);
    const swing = tree.swing;
    const sunnyAmount = weatherMix;
    const wetAmount = 1 - weatherMix;
    tree.leaves.forEach((leaf) => {
      leaf.mesh.rotation.z = leaf.baseZ + Math.sin(t * 1.05 + leaf.phase) * 0.006 +
        Math.sin(t * 4.1 + leaf.phase * 1.7) * 0.035 * swing;
      leaf.mesh.rotation.x = leaf.baseX + Math.cos(t * 0.9 + leaf.phase) * 0.004 +
        Math.cos(t * 3.7 + leaf.phase) * 0.026 * swing;
    });
    glowMat.opacity = 0.34 * swing * sunnyAmount;
    glow.scale.setScalar(tree.glowBase * 1.8 * (1 + 0.035 * Math.sin(t * 2.0 + tree.x)));
    glints.forEach((glint, i) => {
      glint.material.opacity = swing * sunnyAmount * (0.26 + 0.1 * Math.sin(t * 2.2 + i * 1.7));
      glint.position.y = tree.canopyY + (i - 2) * 0.055 * tree.scale +
        Math.sin(t * 1.4 + i) * 0.025 * tree.scale * swing;
    });
    beams.forEach((beam, i) => {
      beam.mat.opacity = swing * sunnyAmount * (0.22 + i * 0.035);
    });
    rainDrops.material.opacity = swing * wetAmount * 0.75;
    if (swing * wetAmount > 0.02) {
      const pos = rainDrops.geometry.attributes.position;
      dropSeeds.forEach((seed, i) => {
        seed.y -= dt * (2.2 + (i % 3) * 0.4);
        if (seed.y < tree.base + 0.08) seed.y = tree.canopyY + 0.1 + Math.random() * 0.6;
        const k = i * 6;
        pos.array[k] = seed.x;
        pos.array[k + 1] = seed.y;
        pos.array[k + 2] = seed.z;
        pos.array[k + 3] = seed.x + 0.015;
        pos.array[k + 4] = seed.y - 0.18;
        pos.array[k + 5] = seed.z;
      });
      pos.needsUpdate = true;
    }
    patchMat.opacity = 0.2 * swing * sunnyAmount;
    patch.scale.setScalar(1 + 0.04 * Math.sin(t * 1.8 + tree.z));
  });

  // poster breath
  posterInteract.forEach((poster) => {
    poster.fit += (poster.targetFit - poster.fit) * Math.min(1, dt * 4.0);
    poster.mesh.scale.copy(poster.baseScale).multiplyScalar(poster.fit);
  });

  // balloons: wind float, drag spring-back and gentle balloon-to-balloon bounce
  balloonClusterState.time += dt;
  balloonClusterState.sway *= Math.exp(-dt * 1.9);
  if (balloonClusterState.sway < 0.002) {
    balloonClusterState.sway = 0;
    balloonPivot.rotation.x = 0;
    balloonPivot.rotation.z = 0;
  } else {
    balloonPivot.rotation.z = Math.sin(balloonClusterState.time * 5.2) * 0.055 * balloonClusterState.sway;
    balloonPivot.rotation.x = Math.cos(balloonClusterState.time * 4.2 + 0.7) * 0.032 * balloonClusterState.sway;
  }
  balloonRecords.forEach((record) => {
    if (!record.dragActive) {
      const k = 3.6;
      const damping = 2.2;
      record.velocity.x += (-record.offset.x * k - record.velocity.x * damping) * dt;
      record.velocity.z += (-record.offset.z * k - record.velocity.z * damping) * dt;
      record.offset.x += record.velocity.x * dt;
      record.offset.z += record.velocity.z * dt;
      if (Math.abs(record.offset.x) < 0.0005 && Math.abs(record.velocity.x) < 0.0005) {
        record.offset.x = 0;
        record.velocity.x = 0;
      }
      if (Math.abs(record.offset.z) < 0.0005 && Math.abs(record.velocity.z) < 0.0005) {
        record.offset.z = 0;
        record.velocity.z = 0;
      }
    }
    record.bobT += dt;
    record.bob *= Math.exp(-dt * 0.7);
    const bobY = Math.sin(record.bobT * 3.2) * 0.05 * record.bob +
      Math.sin(t * 0.58 + record.windPhase) * 0.025;
    const windX = Math.sin(t * 0.24 + record.windPhase) * 0.02;
    const windZ = Math.cos(t * 0.19 + record.windPhase * 1.3) * 0.018;
    record.group.position.set(
      record.base.x + record.offset.x + windX,
      record.base.y + bobY,
      record.base.z + record.offset.z + windZ
    );
    record.group.rotation.z = Math.sin(t * 1.1 + record.phase) * 0.035 + record.offset.x * 0.18;
  });
  for (let i = 0; i < balloonRecords.length; i++) {
    for (let j = i + 1; j < balloonRecords.length; j++) {
      const a = balloonRecords[i];
      const b = balloonRecords[j];
      const dx = a.group.position.x - b.group.position.x;
      const dz = a.group.position.z - b.group.position.z;
      const dist = Math.hypot(dx, dz);
      const minDist = 0.27;
      if (dist > 0.0001 && dist < minDist) {
        const push = (minDist - dist) * 0.5;
        const nx = dx / dist;
        const nz = dz / dist;
        a.offset.x = clamp(a.offset.x + nx * push, -0.6, 0.6);
        a.offset.z = clamp(a.offset.z + nz * push, -0.46, 0.46);
        b.offset.x = clamp(b.offset.x - nx * push, -0.6, 0.6);
        b.offset.z = clamp(b.offset.z - nz * push, -0.46, 0.46);
        a.velocity.x += nx * 0.06;
        a.velocity.z += nz * 0.06;
        b.velocity.x -= nx * 0.06;
        b.velocity.z -= nz * 0.06;
      }
    }
  }
  balloonRecords.forEach((record) => {
    record.group.position.x = record.base.x + record.offset.x +
      Math.sin(t * 0.24 + record.windPhase) * 0.02;
    record.group.position.z = record.base.z + record.offset.z +
      Math.cos(t * 0.19 + record.windPhase * 1.3) * 0.018;
    updateBalloonString(record);
  });

  // trash lid
  trashState.open += (trashState.target - trashState.open) * Math.min(1, dt * 5.0);
  if (trashLidPivot) trashLidPivot.rotation.x = -1.12 * clamp(trashState.open, 0, 1);

  // street lamp: weak in daylight, warm and reflective at night
  const lampWeather = weatherMix > 0.5 ? 0.08 : 1.0;
  const lampLevel = lampState.on ? lampWeather : 0;
  streetLight.intensity = 2.1 * lampLevel;
  if (lampGlow) {
    lampGlow.visible = lampState.on;
    lampGlow.material.opacity = lampState.on ? (weatherMix > 0.5 ? 0.055 : 0.38) : 0;
  }
  lampOnlyMeshes.forEach(({ mesh, baseOpacity }) => {
    const uniforms = mesh.material && mesh.material.uniforms;
    if (uniforms && uniforms.uOpacity) uniforms.uOpacity.value = baseOpacity * lampLevel;
    mesh.visible = lampState.on && weatherMix < 0.5;
  });

  // AC fan and lazy ambient loop
  if (acState.on) acState.angle += dt * 2.1;
  acFan.rotation.x = acState.angle;
  if (acState.on && !audioMuted && !acState.audio) {
    acState.audio = startSoundLoop('ac_hum', 0.11, 0.9);
  } else if ((!acState.on || audioMuted) && acState.audio) {
    acState.audio.stop();
    acState.audio = null;
  }

  // perched bird
  if (birdState.flap > 0) {
    birdState.flap = Math.max(0, birdState.flap - dt);
    const active = clamp(birdState.flap / 2.4, 0, 1);
    birdWings.forEach((pivot, i) => {
      pivot.rotation.z = (i === 0 ? 1 : -1) * (0.18 + Math.sin(t * 24.0) * 0.72) * active;
    });
    birdGroup.position.y = BIRD_Y + Math.sin(t * 16.0) * 0.008 * active;
  } else {
    birdWings.forEach((pivot) => { pivot.rotation.z *= 0.9; });
    birdGroup.position.y = BIRD_Y;
  }

  // stop sign sways in the wind
  signState.velocity += (-signState.angle * 14.0 - signState.velocity * 3.0) * dt;
  signState.angle = clamp(signState.angle + signState.velocity * dt, -0.24, 0.24);
  if (signPivot) signPivot.rotation.z = signState.angle;

  // flower petals and the sunny butterfly
  if (flowerPotRecord.bloomHoldUntil && performance.now() > flowerPotRecord.bloomHoldUntil) {
    flowerPotRecord.bloomTarget = 0;
    flowerPotRecord.bloomHoldUntil = 0;
  }
  flowerPotRecord.bloom += (flowerPotRecord.bloomTarget - flowerPotRecord.bloom) * Math.min(1, dt * 3.2);
  flowerPotRecord.petals.forEach(({ head, petals, heart }, fi) => {
    petals.forEach((petal, pi) => {
      const s = 1 + flowerPotRecord.bloom * (0.2 + 0.035 * Math.sin(t * 2.2 + pi));
      petal.scale.setScalar(s);
    });
    head.rotation.z = Math.sin(t * 1.2 + fi) * 0.018 + flowerPotRecord.bloom * 0.08;
    heart.scale.setScalar(1 + flowerPotRecord.bloom * 0.18);
  });
  if (flowerPotRecord.butterflyActive) {
    flowerPotRecord.butterflyTime += dt;
    const p = flowerPotRecord.butterflyTime / 8.0;
    if (weatherMix < 0.5 || p >= 1) {
      flowerPotRecord.butterflyActive = false;
      butterfly.visible = false;
    } else {
      butterfly.visible = true;
      const orbit = Math.min(1, p / 0.18) * (1 - smoothstep(0.82, 1.0, p));
      const angle = flowerPotRecord.butterflyTime * 1.5;
      const radius = 0.36 + 0.1 * Math.sin(flowerPotRecord.butterflyTime * 0.7);
      const ground = flowerPotRecord.butterflyTime * 0.12;
      butterfly.position.set(
        1.05 + Math.cos(angle) * radius,
        0.62 + Math.sin(angle * 0.8) * 0.14 + ground * 0.08,
        -0.37 + Math.sin(angle) * radius
      );
      butterfly.position.y = lerp(0.62, 0.62 + Math.sin(Math.PI * Math.min(1, p)) * 0.32, orbit);
      const land = smoothstep(0.84, 1.0, p);
      if (land > 0) {
        butterfly.position.lerp(new THREE.Vector3(1.05, 0.63, -0.37), land);
      }
      flowerPotRecord.butterflyWings.forEach(({ pivot, side }, i) => {
        pivot.rotation.z = side * (0.25 + Math.sin(t * 22.0 + i) * 0.75 * (0.4 + orbit));
      });
    }
  }

  // cloud-shifted sun patches
  sunPatches.forEach((patch, pi) => {
    patch.flash *= Math.exp(-dt * 2.2);
    patch.driftX *= Math.exp(-dt * 0.08);
    patch.driftZ *= Math.exp(-dt * 0.08);
    const cloudX = Math.sin(t * 0.07 + pi) * 0.045;
    const cloudZ = Math.cos(t * 0.052 + pi * 1.7) * 0.035;
    patch.mesh.position.x = patch.baseX + cloudX + patch.driftX;
    patch.mesh.position.z = patch.baseZ + cloudZ + patch.driftZ;
    patch.mat.uniforms.uOpacity.value = patch.baseOpacity * (1 + patch.flash * 0.9);
  });

  // puddles and their stacked ripples
  const rainy = weatherMix < 0.5;
  const eaveActive = rainy && performance.now() < eaveState.boostUntil;
  const baseRainOpacity = 1 - smoothMix(0.02, 0.72, weatherMix);
  if (rainy) {
    rainMaterial.uniforms.uOpacity.value = Math.min(1, baseRainOpacity * (1 + (eaveActive ? 0.28 : 0)));
  }
  puddleHitMeshes.forEach((hit) => { hit.visible = rainy; });
  eaveHit.visible = rainy;
  eaveStream.visible = eaveActive;
  if (eaveStream.visible) {
    eaveState.splashTimer -= dt;
    if (eaveState.splashTimer <= 0) {
      eaveState.splashTimer = 0.28;
      spawnRipple(-4.55, -0.65, 0.34, 0.2, 0.17, 0.65);
    }
    const pos = eaveStream.geometry.attributes.position;
    eaveSeeds.forEach((seed, i) => {
      seed.y -= dt * seed.speed;
      if (seed.y < 0.19) seed.y = 1.72 + Math.random() * 0.25;
      const k = i * 6;
      pos.array[k] = seed.x;
      pos.array[k + 1] = seed.y;
      pos.array[k + 2] = seed.z;
      pos.array[k + 3] = seed.x + 0.012;
      pos.array[k + 4] = seed.y - 0.23;
      pos.array[k + 5] = seed.z;
    });
    pos.needsUpdate = true;
  }
  for (let i = rippleEffects.length - 1; i >= 0; i--) {
    const r = rippleEffects[i];
    r.age += dt;
    const p = clamp(r.age / r.life, 0, 1);
    const s = lerp(r.start, r.end, easeOutCubic(p));
    r.mesh.scale.setScalar(s);
    r.mat.opacity = 0.32 * (1 - p) * (1 - p);
    r.mesh.visible = rainy;
    if (p >= 1) {
      world.remove(r.mesh);
      r.mesh.geometry.dispose();
      r.mat.dispose();
      rippleEffects.splice(i, 1);
    }
  }

  for (let i = bikeTrailEffects.length - 1; i >= 0; i--) {
    const tdecal = bikeTrailEffects[i];
    tdecal.age += dt;
    const p = clamp(tdecal.age / tdecal.life, 0, 1);
    tdecal.mat.opacity = 0.32 * (1 - p) * (1 - p);
    tdecal.mesh.visible = rainy;
    if (p >= 1) {
      world.remove(tdecal.mesh);
      tdecal.mesh.geometry.dispose();
      tdecal.mat.dispose();
      bikeTrailEffects.splice(i, 1);
    }
  }

  // store-sign easter egg: two and a half slow breathing rounds, then rest
  if (shopSignState.effect > 0) {
    const progress = (performance.now() - shopSignState.effectStart) /
      (shopSignState.duration * 1000);
    if (progress >= 1) {
      shopSignState.effect = 0;
      neonFlashMat.opacity = 0;
      neonFlash.visible = false;
    } else {
      neonFlash.visible = true;
      const envelope = smoothstep(0, 0.16, progress) * (1 - smoothstep(0.84, 1, progress));
      const breathe = 0.5 + 0.5 * Math.sin(progress * TAU * 2.5 - Math.PI / 2);
      const pulse = envelope * (0.18 + 0.82 * breathe);
      const rainyGlow = weatherMix < 0.5;
      neonFlashMat.color.setHex(rainyGlow ? 0xbdf5ff : 0xffe6bd);
      neonFlashMat.opacity = pulse * (rainyGlow ? 0.34 : 0.11);
      neonFlash.scale.set(
        rainyGlow ? 4.1 + pulse * 0.7 : 3.8 + pulse * 0.25,
        rainyGlow ? 1.65 + pulse * 0.35 : 1.35 + pulse * 0.12,
        1
      );
    }
  }

  updateDetailInteractions(dt, t);
}

// ============================================================
// Street detail pass: architecture, props, weather micro-details
// ============================================================
const detailCommon = new THREE.Group();
detailCommon.name = 'street-detail-common';
world.add(detailCommon);
const detailCommonDecals = new THREE.Group();
world.add(detailCommonDecals);
const detailSunny = new THREE.Group();
detailSunny.name = 'street-detail-sunny';
world.add(detailSunny);
const detailSunnyStatic = new THREE.Group();
detailSunny.add(detailSunnyStatic);
const detailRain = new THREE.Group();
detailRain.name = 'street-detail-rain';
detailRain.visible = false;
world.add(detailRain);

function detailDecal(parent, map, w, h, x, y, z, ry = 0, opacity = 0.7, color = 0xffffff, rx = 0) {
  const material = new THREE.MeshBasicMaterial({
    map,
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, 0);
  mesh.renderOrder = 3;
  parent.add(mesh);
  return mesh;
}

function detailBox(parent, material, w, h, d, x, y, z) {
  return box(parent, material, w, h, d, x, y, z, { cast: false, receive: true });
}

const detailStainMap = canvasTexture(128, 256, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * w;
    const len = 20 + Math.random() * 150;
    const grad = ctx.createLinearGradient(0, 0, 0, len);
    grad.addColorStop(0, 'rgba(40,44,42,0.12)');
    grad.addColorStop(1, 'rgba(40,44,42,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, h * 0.22 + Math.random() * 40, 1 + Math.random() * 3, len);
  }
  const blotch = ctx.createRadialGradient(w * 0.5, h * 0.5, 4, w * 0.5, h * 0.5, w * 0.45);
  blotch.addColorStop(0, 'rgba(35,38,35,0.12)');
  blotch.addColorStop(1, 'rgba(35,38,35,0)');
  ctx.fillStyle = blotch;
  ctx.fillRect(0, 0, w, h);
});

const detailMatGrimeMap = canvasTexture(128, 64, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(40,42,36,${Math.random() * 0.13})`;
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 6, 0, TAU);
    ctx.fill();
  }
});

const detailStickerMap = canvasTexture(128, 128, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(245,242,230,0.94)';
  roundRect(ctx, 10, 16, w - 20, h - 32, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(80,100,90,0.8)';
  ctx.lineWidth = 3;
  roundRect(ctx, 10, 16, w - 20, h - 32, 8);
  ctx.stroke();
  ctx.fillStyle = '#3f6e62';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SALE', w / 2, 58);
  ctx.fillStyle = '#c78b42';
  ctx.font = '18px sans-serif';
  ctx.fillText('100円', w / 2, 88);
});

const detailFlyerMap = canvasTexture(128, 192, (ctx, w, h) => {
  ctx.fillStyle = '#e8e1cf';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(90,80,65,0.45)';
  ctx.lineWidth = 4;
  ctx.strokeRect(7, 7, w - 14, h - 14);
  ctx.fillStyle = 'rgba(75,65,52,0.78)';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('星見町', w / 2, 36);
  ctx.fillText('お知らせ', w / 2, 57);
  ctx.fillStyle = 'rgba(75,65,52,0.34)';
  for (let i = 0; i < 7; i++) {
    ctx.fillRect(20, 78 + i * 14, w - 40 - (i % 3) * 12, 4);
  }
});

const detailLabelMap = canvasTexture(256, 64, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  const cols = ['#d8c7a4', '#b9d2c3', '#e0b8ad', '#b7c7d8'];
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = cols[i];
    roundRect(ctx, 4 + i * 62, 8, 54, h - 16, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(55,60,54,0.62)';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('¥' + (100 + i * 10), 31 + i * 62, 39);
  }
});

const detailScratchMap = canvasTexture(128, 128, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < 16; i++) {
    ctx.strokeStyle = `rgba(220,215,200,${0.08 + Math.random() * 0.18})`;
    ctx.lineWidth = 0.8 + Math.random();
    ctx.beginPath();
    const x = Math.random() * w;
    const y = Math.random() * h;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 40, y + Math.random() * 18);
    ctx.stroke();
  }
});

const detailAddressMap = canvasTexture(256, 96, (ctx, w, h) => {
  ctx.fillStyle = '#e8e5db';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#63716b';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, w - 8, h - 8);
  ctx.fillStyle = '#485752';
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('星見町 二丁目 11-7', w / 2, 40);
  ctx.font = '16px sans-serif';
  ctx.fillText('HOSHIMI MART', w / 2, 68);
});

const detailAframeMaps = [0, 1, 2].map((i) => canvasTexture(256, 384, (ctx, w, h) => {
  ctx.fillStyle = i === 0 ? '#f4eedc' : i === 1 ? '#e9dfc8' : '#dfe7dc';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#746a55';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.fillStyle = '#51665b';
  ctx.textAlign = 'center';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(['本日のおすすめ', 'NEW ARRIVAL', '季節のお菓子'][i], w / 2, 72);
  ctx.fillStyle = '#9b5b47';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(['おにぎり 100円', 'あたたかいコーヒー', 'さくらもち'][i], w / 2, 126);
  ctx.strokeStyle = 'rgba(90,85,70,0.45)';
  ctx.lineWidth = 3;
  for (let k = 0; k < 5; k++) {
    ctx.beginPath();
    ctx.moveTo(38, 170 + k * 32);
    ctx.lineTo(w - 38, 170 + k * 32);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(80,90,80,0.6)';
  ctx.font = '15px sans-serif';
  ctx.fillText('星見マート', w / 2, h - 32);
}));

const detailFogMap = canvasTexture(128, 128, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w / 2, h / 2, 3, w / 2, h / 2, w * 0.55);
  g.addColorStop(0, 'rgba(232,243,245,0.26)');
  g.addColorStop(0.55, 'rgba(232,243,245,0.12)');
  g.addColorStop(1, 'rgba(232,243,245,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
});

const detailWaterFlowMap = canvasTexture(128, 256, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < 18; i++) {
    ctx.strokeStyle = `rgba(170,220,235,${0.06 + Math.random() * 0.12})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(Math.random() * w, 0);
    ctx.bezierCurveTo(
      Math.random() * w, h * 0.3,
      Math.random() * w, h * 0.7,
      Math.random() * w, h
    );
    ctx.stroke();
  }
}, { repeat: [2, 3] });

// Micro bump / grain maps for the larger surfaces.
const detailBumpMap = canvasTexture(64, 64, (ctx, w, h) => {
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 100 + Math.floor(Math.random() * 80);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}, { repeat: [8, 8] });
detailBumpMap.encoding = THREE.LinearEncoding;
M.asphalt.bumpMap = detailBumpMap;
M.asphalt.bumpScale = 0.025;
M.sidewalk.bumpMap = detailBumpMap;
M.sidewalk.bumpScale = 0.018;
M.wallCream.bumpMap = detailBumpMap;
M.wallCream.bumpScale = 0.012;
M.tire.bumpMap = detailBumpMap;
M.tire.bumpScale = 0.02;
[M.asphalt, M.sidewalk, M.wallCream, M.tire].forEach((m) => { m.needsUpdate = true; });

// --- Facade seams, grime, gutters and conduits -----------------------------
[-3.0, -2.0, -1.1, 2.1, 2.85].forEach((y) => {
  detailBox(detailCommon, M.wallShadow, 0.012, 0.014, 4.45, 1.194, y, -3.54);
});
[-1.3, -2.15, -3.3, -4.55, -5.45].forEach((z) => {
  detailBox(detailCommon, M.wallShadow, 0.012, 2.8, 0.014, 1.194, 1.82, z);
});
// Eave gutter and downspout at the right edge of the shopfront.
detailBox(detailCommon, M.metalDark, 5.35, 0.055, 0.085, STORE_CX, 2.935, -0.89);
cylinder(detailCommon, M.metalDark, 0.018, 0.023, 2.72, 1.12, 1.56, -0.88, { seg: 7, cast: false });
detailBox(detailCommon, M.metalDark, 0.06, 0.04, 0.09, 1.12, 2.82, -0.88);
detailBox(detailCommon, M.metalDark, 0.06, 0.04, 0.09, 1.12, 1.32, -0.88);
// rear of the illuminated sign: visible support bars and cable bracket
barBetween(detailCommon, M.metalDark, [-2.1, 2.68, -0.95], [-2.1, 3.28, -0.95], 0.022);
barBetween(detailCommon, M.metalDark, [2.25, 2.68, -0.95], [2.25, 3.28, -0.95], 0.022);
barBetween(detailCommon, M.metalDark, [-2.1, 3.22, -0.95], [2.25, 3.22, -0.95], 0.018);
// Exterior conduit and clamps on the right side wall.
cylinder(detailCommon, M.metalDark, 0.018, 0.022, 3.12, 1.196, 1.78, -2.38, { seg: 7, cast: false });
[0.55, 1.2, 1.95, 2.7].forEach((y) => {
  detailBox(detailCommon, M.metalLight, 0.035, 0.025, 0.075, 1.185, y, -2.38);
});
// Horizontal transom bars across the front glazing.
[-3.8, -2.45, -1.1, 0.4].forEach((x) => {
  detailBox(detailCommon, M.trimGreen, 1.28, 0.025, 0.035, x, 2.2, -0.925);
});
// Window sticker paper and small decals.
[[-3.8, 1.82], [-2.55, 1.66], [-1.15, 1.86], [0.72, 1.72]].forEach(([x, y], i) => {
  detailDecal(detailCommonDecals, detailStickerMap, 0.22, 0.22, x, y, -0.923, 0, 0.58 - i * 0.05);
});
detailDecal(detailCommonDecals, detailStainMap, 0.5, 1.35, 1.193, 1.18, -1.5, Math.PI / 2, 0.34);
detailDecal(detailCommonDecals, detailStainMap, 0.42, 1.2, -4.762, 1.0, -1.35, -Math.PI / 2, 0.3);
// Entrance mat grime and tiny debris.
detailDecal(detailCommonDecals, detailMatGrimeMap, 1.38, 0.6, 0.2, 0.173, -0.48, 0, 0.7, 0xffffff, -Math.PI / 2);
[[-0.45, 0.12], [0.7, 0.18], [1.05, -0.1], [-0.12, 0.42], [1.25, 0.32]].forEach(([x, z], i) => {
  sphere(detailCommon, toon(i % 2 ? 0x8d8a81 : 0xa39b8d), 0.014 + (i % 3) * 0.004, x, 0.181, z, { seg: 5, cast: false });
});
[[0.9, 0.05], [1.12, 0.22], [-0.3, 0.35]].forEach(([x, z]) => {
  cylinder(detailCommon, toon(0xd7c7a2), 0.008, 0.008, 0.045, x, 0.184, z, { seg: 5, cast: false, rz: Math.PI / 2 });
});
const detailLeafShape = new THREE.Shape();
detailLeafShape.moveTo(0, -0.055);
detailLeafShape.quadraticCurveTo(0.045, 0, 0, 0.075);
detailLeafShape.quadraticCurveTo(-0.045, 0, 0, -0.055);
const detailLeafGeometry = new THREE.ShapeGeometry(detailLeafShape);
[[-1.3, 0.03, 0xd1a34d], [1.0, 0.47, 0xa7743e], [2.85, 2.13, 0x8f743c], [-1.9, 2.12, 0x746c45]].forEach(([x, z, c], i) => {
  const leaf = new THREE.Mesh(detailLeafGeometry, toon(c, { side: THREE.DoubleSide }));
  leaf.rotation.x = -Math.PI / 2;
  leaf.rotation.z = i * 1.2;
  leaf.position.set(x, 0.181, z);
  leaf.scale.setScalar(0.65 + i * 0.08);
  detailCommon.add(leaf);
});
// A few paint chips on the guardrail.
[-0.4, 1.7, 3.0, 4.6, 5.2].forEach((x, i) => {
  detailBox(detailCommon, toon(0xd8d7cf), 0.065, 0.02, 0.025, x, 0.78 + (i % 3) * 0.05, 5.44);
});

// --- Vending machine labels, scratches and coin panel ----------------------
[-3.72, -2.62].forEach((z) => {
  detailDecal(detailCommonDecals, detailLabelMap, 0.72, 0.18, 2.112, 1.58, z, Math.PI / 2, 0.9);
  detailDecal(detailCommonDecals, detailStickerMap, 0.2, 0.2, 2.112, 1.86, z - 0.27, Math.PI / 2, 0.72);
  detailDecal(detailCommonDecals, detailScratchMap, 0.7, 0.32, 2.112, 0.72, z, Math.PI / 2, 0.6);
  detailBox(detailCommon, M.metalDark, 0.018, 0.24, 0.14, 2.114, 1.1, z + 0.35);
  detailBox(detailCommon, M.metalLight, 0.018, 0.08, 0.05, 2.115, 0.98, z + 0.35);
  [[-0.38, 1.9], [0.38, 1.9], [-0.38, 0.38], [0.38, 0.38]].forEach(([dz, y]) => {
    cylinder(detailCommon, M.metalLight, 0.008, 0.008, 0.018, 2.116, y, z + dz, { seg: 5, cast: false, rz: Math.PI / 2 });
  });
  detailBox(detailCommon, M.metalDark, 0.018, 0.2, 0.44, 2.113, 0.39, z);
});

// --- AC unit screws, grille bars and drain pipe ----------------------------
[[3.05, -3.78, 0.95], [2.72, -4.72, 0.82]].forEach(([y, z, s]) => {
  for (let i = 0; i < 4; i++) {
    const sy = y + (i % 2 ? 0.2 : -0.2) * s;
    const sz = z + (i < 2 ? -0.3 : 0.3) * s;
    cylinder(detailCommon, M.metalLight, 0.008, 0.008, 0.018, 1.48, sy, sz, { seg: 5, cast: false, rz: Math.PI / 2 });
  }
  [-0.18, 0.18].forEach((dy) => {
    detailBox(detailCommon, M.metalDark, 0.014, 0.014, 0.52 * s, 1.482, y + dy * s, z);
  });
});
const acPipeCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(1.36, 2.8, -4.0),
  new THREE.Vector3(1.33, 2.2, -4.1),
  new THREE.Vector3(1.3, 1.0, -4.1),
  new THREE.Vector3(1.2, 0.4, -4.1),
]);
detailCommon.add(new THREE.Mesh(new THREE.TubeGeometry(acPipeCurve, 18, 0.018, 5, false), M.metalDark));

// --- Trash bin grime labels ------------------------------------------------
[1.42, 1.74, 2.06].forEach((x) => {
  detailDecal(detailCommonDecals, detailStainMap, 0.23, 0.28, x, 0.27, -0.415, 0, 0.45);
  detailDecal(detailCommonDecals, detailLabelMap, 0.2, 0.06, x, 0.47, -0.414, 0, 0.65);
});

// --- Pole flyers, zip ties and cable clamps --------------------------------
const poleDetailX = -6.12;
const poleDetailZ = 1.52;
detailDecal(detailCommonDecals, detailFlyerMap, 0.28, 0.42, poleDetailX, 2.22, poleDetailZ + 0.176, 0, 0.75);
detailDecal(detailCommonDecals, detailFlyerMap, 0.22, 0.33, poleDetailX + 0.12, 2.72, poleDetailZ + 0.17, 0.08, 0.55);
[3.5, 4.1, 4.65].forEach((y, i) => {
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.006, 5, 14), M.metalDark);
  tie.rotation.x = Math.PI / 2;
  tie.position.set(poleDetailX, y, poleDetailZ);
  detailCommon.add(tie);
  if (i === 1) {
    detailBox(detailCommon, M.metalLight, 0.11, 0.025, 0.11, poleDetailX + 0.15, y - 0.15, poleDetailZ);
  }
});

// --- Road sign address plate and screws -----------------------------------
const signPlateDetail = new THREE.Mesh(
  new THREE.PlaneGeometry(0.42, 0.16),
  new THREE.MeshBasicMaterial({ map: detailAddressMap, transparent: true })
);
signPlateDetail.position.set(0, -0.36, 0.035);
signPivot.add(signPlateDetail);
[[-0.23, 0.23], [0.23, 0.23], [-0.23, -0.23], [0.23, -0.23]].forEach(([x, y]) => {
  const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 6), M.metalLight);
  screw.rotation.x = Math.PI / 2;
  screw.position.set(x, y, 0.045);
  signPivot.add(screw);
});

// --- Neon sign halo, distinct from the sharp bloom ------------------------
const detailSignHaloMat = new THREE.SpriteMaterial({
  map: RADIAL_TEX,
  color: 0xffe5b8,
  transparent: true,
  opacity: 0.04,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  depthTest: true,
  fog: false,
});
const detailSignHalo = new THREE.Sprite(detailSignHaloMat);
detailSignHalo.position.set(0.2, 3.05, -0.58);
detailSignHalo.scale.set(6.2, 1.9, 1);
detailSignHalo.renderOrder = 11;
world.add(detailSignHalo);

// ============================================================
// Secondary props: bike hardware, cardboard/crate, camera, leaves, sign
// ============================================================
// Bicycle: chain, crank/pedals, brake cables, tread ribs and seat top.
{
  const bx = 2.55;
  const wheelR = 0.31;
  const rearZ = -1.5;
  const frontZ = -0.53;
  const bb = [bx, SIDEWALK_TOP + 0.29, (rearZ + frontZ) / 2];
  const rearAxle = [bx, SIDEWALK_TOP + wheelR, rearZ];
  const chain = new THREE.CatmullRomCurve3([
    new THREE.Vector3(bx + 0.035, bb[1] + 0.02, bb[2]),
    new THREE.Vector3(bx + 0.035, bb[1] + 0.045, rearZ + 0.18),
    new THREE.Vector3(bx + 0.035, bb[1] + 0.02, rearZ),
    new THREE.Vector3(bx + 0.035, bb[1] - 0.02, rearZ),
    new THREE.Vector3(bx + 0.035, bb[1] - 0.025, rearZ + 0.2),
    new THREE.Vector3(bx + 0.035, bb[1] - 0.02, bb[2]),
  ]);
  const chainMesh = new THREE.Mesh(new THREE.TubeGeometry(chain, 20, 0.008, 4, true), M.metalDark);
  chainMesh.castShadow = false;
  bikeKit.add(chainMesh);
  cylinder(bikeKit, M.metalDark, 0.06, 0.06, 0.09, bx, bb[1], bb[2], { seg: 10, cast: false, rz: Math.PI / 2 });
  barBetween(bikeKit, M.metalDark, [bx - 0.04, bb[1], bb[2]], [bx - 0.12, bb[1] - 0.13, bb[2] - 0.1], 0.012);
  barBetween(bikeKit, M.metalDark, [bx + 0.04, bb[1], bb[2]], [bx + 0.12, bb[1] + 0.1, bb[2] + 0.11], 0.012);
  box(bikeKit, M.metalDark, 0.16, 0.025, 0.05, bx - 0.14, bb[1] - 0.14, bb[2] - 0.1, { cast: false });
  box(bikeKit, M.metalDark, 0.16, 0.025, 0.05, bx + 0.14, bb[1] + 0.1, bb[2] + 0.11, { cast: false });
  // Brake calipers on both wheel rims.
  [rearZ, frontZ].forEach((z) => {
    box(bikeKit, M.metalLight, 0.1, 0.06, 0.035, bx - 0.02, SIDEWALK_TOP + wheelR + 0.16, z, { cast: false });
    barBetween(bikeKit, M.metalDark, [bx + 0.04, SIDEWALK_TOP + 0.88, z], [bx + 0.04, SIDEWALK_TOP + wheelR + 0.13, z], 0.007);
  });
  // Small weld beads at frame joints.
  [[bx, SIDEWALK_TOP + 0.88, rearZ + 0.27], [bx, SIDEWALK_TOP + 0.82, frontZ - 0.08], [bx, SIDEWALK_TOP + 0.29, bb[2]]].forEach(([x, y, z]) => {
    sphere(bikeKit, M.metalDark, 0.018, x, y, z, { seg: 6, cast: false });
  });
  // Leather-like seat top.
  const seatTexture = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#383430';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 24; i++) {
      ctx.strokeStyle = `rgba(165,150,130,${0.08 + Math.random() * 0.1})`;
      ctx.beginPath();
      ctx.moveTo(0, i * 6);
      ctx.lineTo(w, i * 6 + 2);
      ctx.stroke();
    }
  });
  const seatTop = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.3), toon(0xffffff, { map: seatTexture, soft: true }));
  seatTop.rotation.x = -Math.PI / 2;
  seatTop.position.set(bx, SIDEWALK_TOP + 1.043, rearZ + 0.29);
  seatTop.castShadow = false;
  bikeKit.add(seatTop);
  // Merged tread ribs on each wheel (one extra mesh per wheel, still spins).
  bikeWheelGroups.forEach((wheel) => {
    const treadGeos = [];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU;
      const geo = new THREE.BoxGeometry(0.02, 0.022, 0.055).toNonIndexed();
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(a, 0, 0));
      m.compose(
        new THREE.Vector3(0, Math.cos(a) * (wheelR + 0.006), Math.sin(a) * (wheelR + 0.006)),
        q,
        new THREE.Vector3(1, 1, 1)
      );
      geo.applyMatrix4(m);
      treadGeos.push(geo);
    }
    const treadMesh = new THREE.Mesh(mergeOpaqueGeometry(treadGeos), M.tire);
    treadMesh.castShadow = false;
    wheel.add(treadMesh);
  });
}

// Cardboard boxes and a plastic crate in the quiet corner by the left wall.
const boxPropGroup = new THREE.Group();
boxPropGroup.position.set(-5.55, SIDEWALK_TOP, -1.25);
world.add(boxPropGroup);
{
  const cardboard = toon(0xa98762, { soft: true });
  const tape = toon(0xd7c6a1);
  const crateMat = toon(0x647b7a, { soft: true });
  const lower = box(boxPropGroup, cardboard, 0.46, 0.32, 0.42, 0, 0.17, 0, { outline: 0.006 });
  box(boxPropGroup, tape, 0.47, 0.018, 0.065, 0, 0.34, 0, { cast: false });
  box(boxPropGroup, tape, 0.06, 0.32, 0.43, 0, 0.17, 0, { cast: false });
  const upper = box(boxPropGroup, cardboard, 0.34, 0.26, 0.31, 0.04, 0.47, -0.02, { outline: 0.005 });
  box(boxPropGroup, tape, 0.02, 0.26, 0.32, 0.04, 0.47, -0.02, { cast: false });
  box(boxPropGroup, M.wallCream, 0.16, 0.1, 0.01, -0.09, 0.2, 0.212, { cast: false });
  // Open plastic storage crate.
  box(boxPropGroup, crateMat, 0.38, 0.3, 0.34, 0.47, 0.15, 0.12, { outline: 0.005 });
  for (let i = 0; i < 4; i++) {
    box(boxPropGroup, M.metalLight, 0.34, 0.012, 0.04, 0.47, 0.015 + i * 0.075, 0.12, { cast: false });
  }
  contactShadow(boxPropGroup, 0.1, 0, 0.8, 0.6, 0.28, 0.006);
  addHitBox(0.68, 0.55, 0.6, 0, 0.3, 0, boxPropGroup, { type: 'boxes' });
}
const boxesState = { wobble: 0, time: 0 };
function wobbleCardboardBoxes() {
  boxesState.wobble = 1;
  boxesState.time = 0;
}

// Security camera under the eave, with a small status LED and wall bracket.
const securityCameraGroup = new THREE.Group();
securityCameraGroup.position.set(-2.25, 2.74, -0.79);
world.add(securityCameraGroup);
const securityCameraPivot = new THREE.Group();
securityCameraGroup.add(securityCameraPivot);
{
  box(securityCameraGroup, M.metalDark, 0.05, 0.05, 0.28, 0, 0.02, -0.16, { cast: false });
  box(securityCameraGroup, M.metalDark, 0.24, 0.16, 0.13, 0, -0.08, 0.04, { outline: 0.004 });
  const lens = cylinder(securityCameraPivot, M.metalDark, 0.052, 0.058, 0.08, 0, -0.08, 0.115, { seg: 12, cast: false, rx: Math.PI / 2 });
  const lensGlass = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), basic(0x17262a));
  lensGlass.position.set(0, -0.08, 0.158);
  securityCameraPivot.add(lensGlass);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), basic(0xff715c));
  led.position.set(0.09, -0.02, 0.1);
  securityCameraPivot.add(led);
  addHitSphere(0.2, 0, -0.04, 0.05, securityCameraGroup, { type: 'secCamera' });
}
const securityCameraState = { target: 0, angle: 0 };
function turnSecurityCamera() {
  securityCameraState.target += 0.34 * (securityCameraState.target > 0.6 ? -1 : 1);
  securityCameraState.target = clamp(securityCameraState.target, -0.68, 0.68);
  playSound('button_click', { volume: 0.12, rate: 0.72 });
}
// Entry sensor / little lamp under the eave.
box(detailCommon, M.metalDark, 0.16, 0.1, 0.07, 0.78, 2.64, -0.82, { cast: false });
const entryLed = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), basic(0xffdc9c));
entryLed.position.set(0.74, 2.65, -0.78);
world.add(entryLed);

// A-frame pavement sign near the left windows. It is sunny-only.
const aFrameGroup = new THREE.Group();
aFrameGroup.position.set(-3.0, SIDEWALK_TOP, -0.3);
aFrameGroup.rotation.y = 0.12;
detailSunny.add(aFrameGroup);
const aFramePosterMat = new THREE.MeshBasicMaterial({ map: detailAframeMaps[0] });
let aFrameIndex = 0;
{
  const wood = toon(0x8e6c4a, { soft: true });
  const boardFront = box(aFrameGroup, wood, 0.5, 0.62, 0.035, 0, 0.44, 0.12, { outline: 0.004 });
  const boardBack = box(aFrameGroup, wood, 0.5, 0.62, 0.035, 0, 0.44, -0.12, { outline: 0.004 });
  boardFront.rotation.x = -0.18;
  boardBack.rotation.x = 0.18;
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.5), aFramePosterMat);
  poster.position.set(0, 0.48, 0.195);
  poster.rotation.x = -0.18;
  aFrameGroup.add(poster);
  box(aFrameGroup, M.metalDark, 0.52, 0.025, 0.04, 0, 0.12, 0.17, { cast: false });
  box(aFrameGroup, M.metalDark, 0.52, 0.025, 0.04, 0, 0.12, -0.17, { cast: false });
  contactShadow(aFrameGroup, 0, 0, 0.7, 0.45, 0.22, 0.006);
  addHitBox(0.54, 0.65, 0.36, 0, 0.38, 0, aFrameGroup, { type: 'aFrame' });
}
function cycleAFrameSign() {
  aFrameIndex = (aFrameIndex + 1) % detailAframeMaps.length;
  aFramePosterMat.map = detailAframeMaps[aFrameIndex];
  aFramePosterMat.needsUpdate = true;
}

// Clickable fallen leaves by the doorway.
const fallenLeafRecords = [];
const fallenLeafColors = [0xb98542, 0xa56b3b, 0xc7a358, 0x7f6c3d, 0x9d5038];
for (let i = 0; i < 5; i++) {
  const leafGroup = new THREE.Group();
  const leaf = new THREE.Mesh(detailLeafGeometry, toon(fallenLeafColors[i], { side: THREE.DoubleSide }));
  leaf.rotation.x = -Math.PI / 2;
  leaf.rotation.z = i * 1.35;
  leaf.scale.setScalar(0.7 + (i % 3) * 0.1);
  leafGroup.add(leaf);
  const baseX = 0.38 + i * 0.38;
  const baseZ = 0.2 + (i % 2) * 0.22;
  leafGroup.position.set(baseX, 0.181, baseZ);
  world.add(leafGroup);
  const record = { group: leafGroup, leaf, baseY: 0.181, lift: 0, spin: i * 1.3, active: false };
  const hit = addHitSphere(0.055, 0, 0, 0, leafGroup, { type: 'leaf', record });
  hit.renderOrder = -101;
  fallenLeafRecords.push(record);
}
function liftLeaf(record) {
  if (!record || record.active) return;
  record.active = true;
  record.lift = 0;
}

// Sunny wind-blown dry leaves.
const windLeafRecords = [];
const windLeafGroup = new THREE.Group();
detailSunny.add(windLeafGroup);
for (let i = 0; i < 4; i++) {
  const g = new THREE.Group();
  const leaf = new THREE.Mesh(detailLeafGeometry, toon(0xb58a4a, { side: THREE.DoubleSide }));
  leaf.rotation.x = -Math.PI / 2;
  leaf.rotation.z = i * 0.9;
  leaf.scale.setScalar(0.6 + i * 0.06);
  g.add(leaf);
  g.position.set(-4 + i * 1.8, 0.19, 1.2 + (i % 2) * 0.6);
  windLeafGroup.add(g);
  windLeafRecords.push({ group: g, phase: i * 1.7, speed: 0.18 + i * 0.02, baseZ: g.position.z });
}

// Sunny weeds / daisies between the flower boxes and along the wall base.
{
  const stemMat = toon(0x4e7c45, { soft: true });
  const petalMat = new THREE.MeshBasicMaterial({ color: 0xf0e6c6, side: THREE.DoubleSide });
  const bladeMat = toon(0x5d8a4e, { side: THREE.DoubleSide });
  const centers = [[-4.12, -0.5], [-3.78, -0.48], [-2.27, -0.5], [-1.93, -0.52]];
  centers.forEach(([x, z], i) => {
    const g = new THREE.Group();
    g.position.set(x, 0.45, z);
    detailSunnyStatic.add(g);
    const stemH = 0.075 + (i % 3) * 0.025;
    cylinder(g, stemMat, 0.005, 0.007, stemH, 0, stemH * 0.5, 0, { seg: 5, cast: false });
    const flower = new THREE.Mesh(new THREE.CircleGeometry(0.026, 8), petalMat);
    flower.rotation.x = -Math.PI / 2;
    flower.position.y = stemH + 0.006;
    g.add(flower);
    for (let p = 0; p < 6; p++) {
      const a = (p / 6) * TAU;
      const petal = new THREE.Mesh(new THREE.CircleGeometry(0.013, 6), petalMat);
      petal.rotation.x = -Math.PI / 2;
      petal.position.set(Math.cos(a) * 0.022, flower.position.y, Math.sin(a) * 0.022);
      g.add(petal);
    }
    for (let b = 0; b < 3; b++) {
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.1), bladeMat);
      blade.position.set((b - 1) * 0.018, 0.05, 0);
      blade.rotation.z = (b - 1) * 0.35;
      g.add(blade);
    }
  });
  // low clover patches and grass tufts along the wall
  const cloverMat = toon(0x5b8a4d, { side: THREE.DoubleSide });
  [[-4.3, -0.65], [-2.0, -0.7], [0.2, -0.7], [0.85, -0.4]].forEach(([x, z]) => {
    for (let p = 0; p < 7; p++) {
      const clover = new THREE.Mesh(new THREE.CircleGeometry(0.018, 5), cloverMat);
      clover.rotation.x = -Math.PI / 2;
      clover.position.set(x + Math.cos(p * 2.1) * 0.06, SIDEWALK_TOP + 0.012, z + Math.sin(p * 1.7) * 0.05);
      detailSunnyStatic.add(clover);
    }
  });
  [[-4.45, -0.72], [-3.1, -0.76], [-1.45, -0.76], [0.55, -0.74], [1.2, -0.55]].forEach(([x, z], i) => {
    for (let b = 0; b < 4; b++) {
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.015, 0.075 + (b % 2) * 0.025), bladeMat);
      blade.position.set(x + (b - 1.5) * 0.016, SIDEWALK_TOP + 0.045, z + (b % 2) * 0.018);
      blade.rotation.z = (b - 1.5) * 0.28;
      blade.rotation.y = i * 0.7;
      detailSunnyStatic.add(blade);
    }
  });
  mergeOpaqueMeshesInKit(detailSunnyStatic);
}

// Rain-only wall water trails, gutter water and window condensation.
const gutterWaterMaterial = new THREE.MeshBasicMaterial({
  map: detailWaterFlowMap,
  color: 0x82b9c7,
  transparent: true,
  opacity: 0.14,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const gutterWater = new THREE.Mesh(new THREE.PlaneGeometry(9.35, 0.18), gutterWaterMaterial);
gutterWater.rotation.x = -Math.PI / 2;
gutterWater.position.set(-1.65, 0.053, 2.19);
detailRain.add(gutterWater);
const gutterWaterSide = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 8.4), gutterWaterMaterial);
gutterWaterSide.rotation.x = -Math.PI / 2;
gutterWaterSide.position.set(3.28, 0.053, -2.2);
detailRain.add(gutterWaterSide);
detailDecal(detailRain, detailStainMap, 0.42, 1.7, 1.193, 1.05, -2.0, Math.PI / 2, 0.46, 0x8fb2b8);
detailDecal(detailRain, detailStainMap, 0.32, 1.1, -4.762, 0.85, -2.2, -Math.PI / 2, 0.4, 0x8fb2b8);
detailDecal(detailRain, detailStainMap, 0.34, 0.8, 0.02, 0.58, -0.936, 0, 0.34, 0x8fb2b8);
[-3.8, -2.45, -1.1, 0.45].forEach((x) => {
  detailDecal(detailRain, detailFogMap, 1.05, 1.25, x, 1.55, -0.923, 0, 0.28);
  detailDecal(detailRain, detailStainMap, 0.12, 1.8, x - 0.68, 1.35, -0.918, 0, 0.24, 0x7da1aa);
});
[1.42, 1.74, 2.06].forEach((x) => {
  detailDecal(detailRain, detailStainMap, 0.24, 0.24, x, 0.2, -0.414, 0, 0.35, 0x6d929a);
});

mergeOpaqueMeshesInKit(detailCommon);

// ============================================================
// Detail interaction state updates
// ============================================================
function updateDetailInteractions(dt, t) {
  detailSunny.visible = weatherMix > 0.34;
  detailRain.visible = weatherMix < 0.34;
  aFrameGroup.visible = detailSunny.visible;

  cloudSprites.forEach((sprite, i) => {
    if (sprite.userData.detailBaseX === undefined) {
      sprite.userData.detailBaseX = sprite.position.x;
      sprite.userData.detailBaseY = sprite.position.y;
    }
    sprite.position.x = sprite.userData.detailBaseX + Math.sin(t * 0.028 + i * 1.4) * 0.55;
    sprite.position.y = sprite.userData.detailBaseY + Math.sin(t * 0.021 + i * 2.1) * 0.18;
  });
  festivalFlags.forEach(({ flag, baseZ, phase }) => {
    flag.rotation.z = baseZ + Math.sin(t * 1.15 + phase) * 0.045;
  });

  const signHalo = 0.028 + weatherMix * 0.018 + (1 - weatherMix) * 0.075;
  detailSignHaloMat.opacity = signHalo;

  securityCameraState.angle +=
    (securityCameraState.target - securityCameraState.angle) * Math.min(1, dt * 2.1);
  securityCameraPivot.rotation.y = securityCameraState.angle;
  securityCameraPivot.rotation.x = 0.08 + Math.sin(securityCameraState.angle * 1.4) * 0.035;

  boxesState.wobble *= Math.exp(-dt * 2.4);
  boxesState.time += dt;
  if (boxesState.wobble > 0.002) {
    boxPropGroup.rotation.z = Math.sin(boxesState.time * 8.0) * 0.045 * boxesState.wobble;
    boxPropGroup.rotation.x = Math.cos(boxesState.time * 6.4) * 0.02 * boxesState.wobble;
  } else {
    boxPropGroup.rotation.z *= 0.85;
    boxPropGroup.rotation.x *= 0.85;
  }

  fallenLeafRecords.forEach((record) => {
    if (!record.active) return;
    record.lift += dt;
    if (record.lift < 0.65) {
      const p = record.lift / 0.65;
      record.group.position.y = record.baseY + Math.sin(p * Math.PI) * 0.18;
      record.group.rotation.z = record.spin + p * 1.1;
    } else if (record.lift < 1.45) {
      const p = (record.lift - 0.65) / 0.8;
      record.group.position.y = record.baseY + 0.18 * (1 - p) + 0.002;
      record.group.rotation.z = record.spin + 1.1 + p * 0.5;
    } else {
      record.group.position.y = record.baseY;
      record.group.rotation.z = record.spin;
      record.active = false;
      record.lift = 0;
    }
  });

  windLeafRecords.forEach((record) => {
    record.group.position.x += record.speed * dt;
    record.group.position.z = record.baseZ + Math.sin(t * 0.8 + record.phase) * 0.12;
    record.group.position.y = 0.19 + Math.sin(t * 1.3 + record.phase) * 0.035;
    record.group.rotation.z += dt * 0.8;
    if (record.group.position.x > 4.8) record.group.position.x = -5.2;
  });

  gutterWaterMaterial.map.offset.x += dt * 0.018;
  gutterWaterMaterial.map.offset.y -= dt * 0.045;
  gutterWaterMaterial.opacity = 0.10 + (1 - weatherMix) * 0.06;

  // Subtle condensation breathes in the window when it rains.
  detailRain.children.forEach((child) => {
    if (child.material && child.material.map === detailFogMap) {
      child.material.opacity = 0.22 + Math.sin(t * 0.35) * 0.025;
    }
  });
}

const interactionDebug = {
  hitMeshes: interactionHitMeshes,
  vending: vendingInteract,
  bike: bikeState,
  bikeTrailEffects,
  bikeBasketAnchor,
  bikeBasketFlowerGroup,
  bikeWheelGroups,
  door: doorState,
  get umbrella() { return umbrellaState; },
  trees: treeInteract,
  posters: posterInteract,
  balloons: balloonRecords,
  ringBikeBell,
  wakeVending,
  selectBottle,
  toggleDoor,
  togglePoster,
  takeUmbrellaOut,
  returnUmbrellaToStand,
  toggleUmbrellaOpen,
  takeUmbrellaByRig,
  get umbrellaGroup() { return umbrellaGroup; },
  get umbrellaRibBones() { return umbrellaRibBones; },
  get umbrellaCanopyMesh() { return umbrellaCanopyMesh; },
  umbrellaRigs,
  umbrellaSlots,
  getActiveUmbrella: () => activeUmbrellaRig,
  setUmbrellaPoseForRig: (rig, value) => setUmbrellaBonePoseForRig(rig, value),
  umbrellaShadow,
  umbrellaShadowMaterial,
  securityCamera: securityCameraState,
  boxes: boxesState,
  fallenLeaves: fallenLeafRecords,
  aFrameIndex: () => aFrameIndex,
  neonFlash,
  neonFlashMaterial: neonFlashMat,
  balloonClusterState,
  settleBottle,
  spreadFlower,
  releaseButterfly,
  toggleTrash,
  toggleLamp,
  toggleAC,
  pokeBird,
  wobbleSign,
  pokeSunPatch,
  pokePuddle,
  pokeEave,
  pokeShopSign,
  trash: trashState,
  lamp: lampState,
  ac: acState,
  bird: birdState,
  sign: signState,
  flower: flowerPotRecord,
  sunPatches,
  puddles: puddleRecords,
  ripples: rippleEffects,
  eave: eaveState,
  shopSign: shopSignState,
  setAudioMuted,
  audioMuted: () => audioMuted,
  audioState: () => ({
    state: audioCtx ? audioCtx.state : null,
    muted: audioMuted,
    decoded: Array.from(audioCache.keys()),
  }),
  debugHitAt: (x, y) => {
    const hit = findInteractionHit({ clientX: x, clientY: y });
    return hit ? { type: hit.data.type, distance: hit.distance } : null;
  },
};


// ------------------------------------------------------------
// Warm airborne details
// ------------------------------------------------------------
function updateAtmosphere(t, dt, m) {
  // gentle balloon sway
  if (sunnyDecor.visible) {
    balloonPivot.rotation.z = Math.sin(t * 0.75) * 0.05;
    balloonPivot.rotation.x = Math.sin(t * 0.52 + 1.2) * 0.035;
    cloudDome.rotation.y += dt * 0.0025;
  }
  if (sunnyDust.visible) {
    const pos = dustGeo.attributes.position;
    for (let i = 0; i < DUST_COUNT; i++) {
      const d = dustData[i];
      pos.array[i * 3] = d.x + Math.sin(t * 0.18 + d.phase) * 0.06;
      pos.array[i * 3 + 1] = d.y + Math.sin(t * 0.27 + d.phase * 1.7) * 0.09;
      pos.array[i * 3 + 2] = d.z + Math.cos(t * 0.16 + d.phase) * 0.05;
    }
    pos.needsUpdate = true;
  }
}

// ------------------------------------------------------------
// Render loop
// ------------------------------------------------------------
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (weatherMix !== weatherTarget) {
    const p = clamp((performance.now() - weatherTransitionStart) / 1400, 0, 1);
    weatherMix = lerp(weatherTransitionFrom, weatherTarget, easeInOutCubic(p));
    if (p >= 1) weatherMix = weatherTarget;
    applyWeather(weatherMix);
  }

  rainMaterial.uniforms.uTime.value = t;

  // rain splash rings (only meaningful in the wet state)
  if (splashGroup.visible) {
    for (let i = 0; i < SPLASHES.length; i++) {
      const s = SPLASHES[i];
      const p = ((t + s.phase) % s.period) / s.period;
      s.mesh.scale.setScalar(0.32 + p * 2.1);
      s.mat.opacity = (1 - p) * 0.34 * rainMaterial.uniforms.uOpacity.value;
    }
  }

  // subtle night shimmer
  if (weatherMix < 0.985) {
    bloomPass.strength = (0.5 + Math.sin(t * 1.3) * 0.015) * (1 - weatherMix);
  }

  updateAtmosphere(t, dt, weatherMix);
  updateInteractions(dt, t);

  if (!shadowFrozen) {
    shadowFrozen = true;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
  }

  controls.autoRotate = false;
  controls.update();
  composer.render();
}

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.setSize(w, h);
});

// Keep the complete square plinth in frame on portrait screens too.
window.addEventListener('resize', () => {
  fitModelToViewport(false);
});

// The combined weather page is always fully assembled and stable.
kits.forEach((g) => {
  g.visible = true;
  g.position.y = 0;
  g.scale.setScalar(1);
});
updateWeatherButtons(initialWeather);
applyWeather(weatherMix);
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
window.__diorama = {
  scene, camera, controls, renderer, composer, kits, wetKit, TEX, REFLECT_TEX,
  weatherLights, sunnyDecor, cloudGroup, interactions: interactionDebug,
  setWeatherMode,
  getWeatherMode: () => (weatherTarget > 0.5 ? 'sunny' : 'rain'),
  getWeatherMix: () => weatherMix,
};
animate();
