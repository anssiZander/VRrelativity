import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const container = document.getElementById('app');
const cameraFeed = document.getElementById('cameraFeed');
const desktopPanel = document.getElementById('panel');
const overlayRoot = document.getElementById('overlayRoot');
const buttonDock = document.getElementById('buttonDock');
const betaSlider = document.getElementById('betaSlider');
const betaValue = document.getElementById('betaValue');
const lorentzToggle = document.getElementById('lorentzToggle');
const aberrationToggle = document.getElementById('aberrationToggle');
const sceneToggleButton = document.getElementById('sceneToggle');
const sceneEyeButton = document.getElementById('sceneEyeButton');
const panelMinimizeButton = document.getElementById('panelMinimizeButton');

const sceneBackgroundColor = 0x05070b;
const defaultSceneBackground = new THREE.Color(sceneBackgroundColor);
const defaultSceneFog = new THREE.Fog(sceneBackgroundColor, 45, 140);

const scene = new THREE.Scene();
scene.background = defaultSceneBackground;
scene.fog = defaultSceneFog;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);
container.appendChild(renderer.domElement);

function createEnterVRButton(renderer) {
  const button = document.createElement('button');
  button.textContent = 'Checking VR…';
  button.style.position = 'fixed';
  button.style.right = '12px';
  button.style.bottom = '12px';
  button.style.zIndex = '20';
  button.style.padding = '12px 16px';
  button.style.border = '0';
  button.style.borderRadius = '999px';
  button.style.background = 'rgba(20, 122, 255, 0.92)';
  button.style.color = 'white';
  button.style.fontSize = '15px';
  button.style.fontWeight = '700';
  button.style.cursor = 'pointer';
  button.style.boxShadow = '0 10px 28px rgba(0,0,0,0.30)';

  if (!('xr' in navigator)) {
    button.textContent = 'WebXR not available';
    button.disabled = true;
    button.style.opacity = '0.6';
    document.body.appendChild(button);
    return;
  }

  let currentSession = null;

  async function onSessionStarted(session) {
    currentSession = session;
    renderer.xr.setReferenceSpaceType('local-floor');
    await renderer.xr.setSession(session);
    button.textContent = 'Exit VR';
    session.addEventListener('end', onSessionEnded);
  }

  function onSessionEnded() {
    if (currentSession) {
      currentSession.removeEventListener('end', onSessionEnded);
      currentSession = null;
    }
    button.textContent = 'Enter VR';
  }

  navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
    if (!supported) {
      button.textContent = 'VR not supported here';
      button.disabled = true;
      button.style.opacity = '0.6';
      return;
    }

    button.textContent = 'Enter VR';
    button.addEventListener('click', async () => {
      try {
        if (currentSession === null) {
          const session = await navigator.xr.requestSession('immersive-vr', {
            optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
          });
          await onSessionStarted(session);
        } else {
          await currentSession.end();
        }
      } catch (err) {
        console.error(err);
        alert('Could not start VR. Make sure you opened this page over HTTPS in the Quest Browser.');
      }
    });
  }).catch((err) => {
    console.error(err);
    button.textContent = 'VR check failed';
    button.disabled = true;
    button.style.opacity = '0.6';
  });

  document.body.appendChild(button);
}

function createActionButton(label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'floating-button';
  button.textContent = label;
  buttonDock.appendChild(button);
  return button;
}

const mrButton = createActionButton('Checking MR...');
const vrButton = createActionButton('Checking VR...');
const phoneARButton = createActionButton('Enable Phone AR');

const initialFacingYaw = Math.PI * 0.5;

const player = new THREE.Group();
player.position.set(0, 1.8, 0);
player.rotation.y = initialFacingYaw;
scene.add(player);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 2500);
camera.position.set(0, 0, 0);
camera.rotation.order = 'YXZ';
player.add(camera);

const hemiLight = new THREE.HemisphereLight(0xbfd8ff, 0x1b1d24, 1.4);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(8, 12, 6);
scene.add(dirLight);


const axes = new THREE.AxesHelper(4);
axes.position.set(0, -3.98, 0);
scene.add(axes);

const stars = new THREE.Points(
  new THREE.BufferGeometry(),
  new THREE.PointsMaterial({ size: 0.3, color: 0xbfd7ff, sizeAttenuation: true })
);
{
  const pts = [];
  for (let i = 0; i < 900; i++) {
    const r = 80 + Math.random() * 120;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pts.push(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
  }
  stars.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
}
scene.add(stars);

const motionSpeed = 8.0;
const sharedUniforms = {
  uObserverPos: { value: new THREE.Vector3(0, 0, 0) },
  uWorldMotionDir: { value: new THREE.Vector3(1, 0, 0) },
  uBeta: { value: parseFloat(betaSlider.value) },
  uSpeed: { value: motionSpeed },
  uLorentzEnabled: { value: lorentzToggle.checked ? 1 : 0 },
  uAberrationEnabled: { value: aberrationToggle.checked ? 1 : 0 },
  uCheckerEnabled: { value: 1 }
};

const sceneLabels = ['Object scene', 'Cube grid scene', 'Eye-relative scene'];
let sceneMode = 0;
let panelTitle = null;
const playerVelocity = new THREE.Vector3();
const uiState = {
  menuMinimized: false
};

const vertexShader = `
  uniform vec3 uObserverPos;
  uniform vec3 uWorldMotionDir;
  uniform vec3 uLocalMotionDir;
  uniform float uBeta;
  uniform float uSpeed;
  uniform int uLorentzEnabled;
  uniform int uAberrationEnabled;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  void main() {
    vec3 localPos = position;
    vec3 localNormal = normal;
    vUv = uv;

    vec3 worldDir = normalize(uWorldMotionDir);
    vec3 localMotionDir = normalize(uLocalMotionDir);
    mat3 model3 = mat3(modelMatrix);

    if (uLorentzEnabled == 1 && uBeta > 0.0001) {
      float contraction = sqrt(max(1.0 - uBeta * uBeta, 0.0001));

      vec3 posParallel = localMotionDir * dot(localPos, localMotionDir);
      vec3 posPerp = localPos - posParallel;
      localPos = posPerp + contraction * posParallel;

      vec3 normalParallel = localMotionDir * dot(localNormal, localMotionDir);
      vec3 normalPerp = localNormal - normalParallel;
      localNormal = normalize(normalPerp + normalParallel / contraction);
    }

    vec4 worldPos4 = modelMatrix * vec4(localPos, 1.0);
    vec3 worldPos = worldPos4.xyz;

    if (uAberrationEnabled == 1 && uBeta > 0.0001) {
      vec3 rel = worldPos - uObserverPos;
      float x0 = dot(rel, worldDir);
      float r2 = max(dot(rel, rel), 0.0001);
      float rPerp2 = max(r2 - x0 * x0, 0.0);

      float v = uSpeed;
      float c = uSpeed / max(uBeta, 0.0001);
      float A = v * v - c * c;
      float disc = c * c * r2 - v * v * rPerp2;
      float sqrtTerm = sqrt(max(disc, 0.0));
      float tr = (-x0 * v + sqrtTerm) / A;

      worldPos += worldDir * v * tr;
    }

    vWorldPos = worldPos;
    vWorldNormal = normalize(model3 * localNormal);

    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
  }
`;

const fragmentShader = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform int uCheckerEnabled;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  void main() {
    vec3 n = normalize(vWorldNormal);
    vec3 lightDir1 = normalize(vec3(0.8, 1.2, 0.6));
    vec3 lightDir2 = normalize(vec3(-0.4, 0.3, -1.0));

    float diff1 = max(dot(n, lightDir1), 0.0);
    float diff2 = max(dot(n, lightDir2), 0.0);
    float ambient = 0.26;
    float fresnel = pow(1.0 - max(dot(n, normalize(cameraPosition - vWorldPos)), 0.0), 2.0);

    float checker = mod(floor(vUv.x * 8.0) + floor(vUv.y * 8.0), 2.0);
    vec3 baseA = min(uColor * 1.08, vec3(1.0));
    vec3 baseB = uColor * 0.55;
    vec3 checkerColor = mix(baseA, baseB, checker);
    vec3 displayColor = uCheckerEnabled == 1 ? checkerColor : baseA;

    vec3 color = displayColor * (ambient + 0.85 * diff1 + 0.35 * diff2) + 0.22 * fresnel;
    gl_FragColor = vec4(color, uOpacity);
  }
`;

function makeRelativisticMaterial(colorHex) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uObserverPos: sharedUniforms.uObserverPos,
      uWorldMotionDir: sharedUniforms.uWorldMotionDir,
      uLocalMotionDir: { value: new THREE.Vector3(1, 0, 0) },
      uBeta: sharedUniforms.uBeta,
      uSpeed: sharedUniforms.uSpeed,
      uLorentzEnabled: sharedUniforms.uLorentzEnabled,
      uAberrationEnabled: sharedUniforms.uAberrationEnabled,
      uCheckerEnabled: sharedUniforms.uCheckerEnabled,
      uColor: { value: new THREE.Color(colorHex) },
      uOpacity: { value: 0.6 }
    },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false
  });
  relativisticMaterials.add(material);
  return material;
}

function makeProjectileMaterial(colorHex) {
  const projectileObserverPos = { value: new THREE.Vector3() };
  return new THREE.ShaderMaterial({
    uniforms: {
      uObserverPos: projectileObserverPos,
      uWorldMotionDir: { value: new THREE.Vector3(1, 0, 0) },
      uLocalMotionDir: { value: new THREE.Vector3(0, 0, -1) },
      uBeta: sharedUniforms.uBeta,
      uSpeed: sharedUniforms.uSpeed,
      uLorentzEnabled: sharedUniforms.uLorentzEnabled,
      uAberrationEnabled: sharedUniforms.uAberrationEnabled,
      uCheckerEnabled: { value: 0 }, // No checker pattern for projectiles
      uColor: { value: new THREE.Color(colorHex) },
      uOpacity: { value: 1 }
    },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    userData: { projectileObserverPos }
  });
}

function createMovingMesh(kind, colorHex) {
  let geometry;
  let material = null;

  if (kind === 'sphere') {
    geometry = new THREE.SphereGeometry(1.25, 30, 20);
  } else if (kind === 'box') {
    geometry = new THREE.BoxGeometry(2.1, 2.1, 2.1, 3, 3, 3);
  } else {
    geometry = new THREE.BoxGeometry(5.6, 1.2, 1.2, 5, 1, 1);
  }

  const mesh = new THREE.Mesh(geometry, material || makeRelativisticMaterial(colorHex));
  mesh.frustumCulled = false;
  
  // Set random initial rotation for static object orientations
  mesh.rotation.set(
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2
  );
  
  return mesh;
}

const observerBall = new THREE.Mesh(
  new THREE.SphereGeometry(.1, 32, 24),
  new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
    roughness: 0.75,
    metalness: 0.0,
    depthWrite: false
  })
);
observerBall.position.set(0, 0, 0);
scene.add(observerBall);

const movers = [];
const gridCubes = [];
const relativisticMaterials = new Set();
const palette = [0xff8f6b, 0xf2c94c, 0x8be28b, 0x9b8cff, 0x60d5ff, 0xff6ad5, 0xa3ff8f, 0xff9f82];
const types = ['box', 'sphere', 'capsule', 'sphere', 'box', 'capsule', 'sphere', 'box', 'sphere', 'capsule', 'box', 'sphere'];
const impactOffsets = [-13, -10, -6, -3, 0, 3, 6, 10, 13, 17, -17, 8];
const minFlybyRadius = 4.2;

function createGridCube(colorHex) {
  const geometry = new THREE.BoxGeometry(1.1, 1.1, 1.1);
  const mesh = new THREE.Mesh(geometry, makeRelativisticMaterial(colorHex));
  mesh.frustumCulled = false;
  return mesh;
}

const bullets = [];
const bulletSpeedFactor = 0.999;

function createBullet(origin, direction) {
  const geometry = new THREE.SphereGeometry(0.1, 10, 8);
  const velocityDir = direction.clone().normalize();
  const mesh = new THREE.Mesh(geometry, makeProjectileMaterial(0xffdd88));
  mesh.position.copy(origin);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), velocityDir);
  mesh.frustumCulled = false;
  if (mesh.material.uniforms) {
    mesh.material.uniforms.uWorldMotionDir.value.copy(velocityDir);
  }
  scene.add(mesh);

  const beta = sharedUniforms.uBeta.value;
  const c = beta > 0.01 ? sharedUniforms.uSpeed.value / beta : sharedUniforms.uSpeed.value;
  const speed = bulletSpeedFactor * c;
  bullets.push({
    mesh,
    velocity: velocityDir.multiplyScalar(speed),
    lifetime: 10.0
  });
}

function shootBullet(controller) {
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  tempOrigin.setFromMatrixPosition(controller.matrixWorld);
  tempDirection.set(0, 0, -1).applyMatrix4(tempMatrix).normalize();
  // Spawn bullet exactly at controller position for now
  createBullet(tempOrigin, tempDirection);
}

function makeSafeFlybyLane(y, z) {
  const currentRadius = Math.hypot(y, z);
  if (currentRadius >= minFlybyRadius) return { y, z };
  const angle = Math.atan2(y, z);
  return {
    y: Math.sin(angle) * minFlybyRadius,
    z: Math.cos(angle) * minFlybyRadius
  };
}

for (let i = 0; i < 12; i++) {
  const color = palette[i % palette.length];
  const mesh = createMovingMesh(types[i % types.length], color);
  const startX = -44 - i * 8.2;
  let laneY = -2.0 + Math.round(Math.random() * 5) * 1.6;
  let laneZ = impactOffsets[i % impactOffsets.length] + (Math.random() * 2 - 1);
  ({ y: laneY, z: laneZ } = makeSafeFlybyLane(laneY, laneZ));
  const initialPos = new THREE.Vector3(startX, laneY, laneZ);
  mesh.position.copy(initialPos);
  scene.add(mesh);
  movers.push({
    mesh,
    initialPos,
    spinY: (Math.random() - 0.5) * 0.8,
    spinZ: (Math.random() - 0.5) * 0.55,
    laneY,
    laneZ,
    offset: Math.random() * Math.PI * 2
  });
}

const gridSize = 32;
const gridSpacing = 3.3;
const gridOffset = (gridSize - 1) * 0.5 * gridSpacing;
const gridPlaneStartX = -48;
for (let iy = 0; iy < gridSize; iy++) {
  for (let iz = 0; iz < gridSize; iz++) {
    const mesh = createGridCube(0x60d5ff);
    const startX = gridPlaneStartX;
    const startY = 1.0 - gridOffset + iy * gridSpacing;
    const startZ = -gridOffset + iz * gridSpacing;
    const initialPos = new THREE.Vector3(startX, startY, startZ);
    mesh.position.copy(initialPos);
    mesh.visible = false;
    scene.add(mesh);
    gridCubes.push({
      mesh,
      initialPos,
      spinY: 0,
      spinZ: 0
    });
  }
}

function createRoundedPanelTexture({
  width = 1024,
  height = 512,
  background = '#101722',
  border = 'rgba(255,255,255,0.12)',
  radius = 36,
  lineWidth = 8,
  text = '',
  textColor = '#ecf4ff',
  font = 'bold 96px Arial',
  align = 'center',
  paddingX = 60,
  paddingY = 0,
  glow = false
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const w = width;
  const h = height;
  const x = lineWidth / 2;
  const y = lineWidth / 2;
  const rw = w - lineWidth;
  const rh = h - lineWidth;

  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + rw - radius, y);
  ctx.quadraticCurveTo(x + rw, y, x + rw, y + radius);
  ctx.lineTo(x + rw, y + rh - radius);
  ctx.quadraticCurveTo(x + rw, y + rh, x + rw - radius, y + rh);
  ctx.lineTo(x + radius, y + rh);
  ctx.quadraticCurveTo(x, y + rh, x, y + rh - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();

  ctx.fillStyle = background;
  ctx.fill();
  if (lineWidth > 0) {
    ctx.strokeStyle = border;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  if (text) {
    ctx.font = font;
    ctx.fillStyle = textColor;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    if (glow) {
      ctx.shadowColor = 'rgba(154, 214, 255, 0.6)';
      ctx.shadowBlur = 18;
    }
    const tx = align === 'left' ? paddingX : align === 'right' ? w - paddingX : w / 2;
    const ty = h / 2 + paddingY;
    ctx.fillText(text, tx, ty);
    ctx.shadowBlur = 0;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return { canvas, ctx, texture };
}

function createTextPlane({ width, height, text, font = 'bold 92px Arial', color = '#edf5ff', align = 'left' }) {
  const { canvas, ctx, texture } = createRoundedPanelTexture({
    width: 1024,
    height: 256,
    background: 'rgba(0,0,0,0)',
    border: 'rgba(0,0,0,0)',
    radius: 0,
    lineWidth: 0,
    text,
    textColor: color,
    font,
    align,
    paddingX: 32
  });

  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.userData.width = width;
  mesh.userData.height = height;
  mesh.userData.material = material;

  mesh.userData.setText = (nextText) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    const tx = align === 'left' ? 32 : align === 'right' ? canvas.width - 32 : canvas.width / 2;
    ctx.fillText(nextText, tx, canvas.height / 2);
    texture.needsUpdate = true;
  };

  return mesh;
}

function createVRButton(label, width, height) {
  const baseColor = new THREE.Color(0x172334);
  const hoverColor = new THREE.Color(0x24486c);

  const group = new THREE.Group();
  group.userData.width = width;
  group.userData.height = height;
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color: baseColor.clone(), transparent: true, opacity: 0.96, depthTest: false })
  );
  group.add(bg);

  const border = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-width / 2, -height / 2, 0.002),
      new THREE.Vector3(width / 2, -height / 2, 0.002),
    new THREE.Vector3(width / 2, height / 2, 0.002),
    new THREE.Vector3(-width / 2, height / 2, 0.002)
  ]),
    new THREE.LineBasicMaterial({ color: 0x8bbcff, transparent: true, opacity: 0.5, depthTest: false })
  );
  group.add(border);

  const text = createTextPlane({ width: width * 0.88, height: height * 0.58, text: label, align: 'center' });
  text.position.z = 0.01;
  group.add(text);

  bg.userData = {
    kind: 'button',
    group,
    text,
    baseColor,
    hoverColor,
    setHover(hovered) {
      bg.material.color.copy(hovered ? hoverColor : baseColor);
    }
  };

  return {
    group,
    hitTarget: bg,
    text,
    bgMaterial: bg.material,
    borderMaterial: border.material,
    setLabel(nextLabel) {
      text.userData.setText(nextLabel);
    }
  };
}

function createVRToggleRow(label, initialValue) {
  const row = new THREE.Group();
  const width = 2.95;
  const height = 0.34;

  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color: 0x101722, transparent: true, opacity: 0.98, depthTest: false })
  );
  row.add(bg);

  const checkbox = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: initialValue ? 0x147aff : 0x1b2431, depthTest: false })
  );
  checkbox.position.set(-width / 2 + 0.26, 0, 0.01);
  row.add(checkbox);

  const checkLabel = createTextPlane({ width: 0.18, height: 0.18, text: initialValue ? '✓' : '', font: 'bold 120px Arial', align: 'center' });
  checkLabel.position.set(checkbox.position.x, checkbox.position.y - 0.003, 0.02);
  row.add(checkLabel);

  const labelMesh = createTextPlane({ width: 2.15, height: 0.22, text: label, font: 'bold 84px Arial', align: 'left' });
  labelMesh.position.set(-0.05, 0, 0.02);
  row.add(labelMesh);

  bg.userData = {
    kind: 'toggle',
    checkbox,
    checkLabel,
    value: initialValue,
    setHover(hovered) {
      bg.material.color.set(hovered ? 0x182536 : 0x101722);
    },
    setValue(v) {
      bg.userData.value = v;
      checkbox.material.color.set(v ? 0x147aff : 0x1b2431);
      checkLabel.userData.setText(v ? '✓' : '');
    }
  };

  return { row, hitTarget: bg, bgMaterial: bg.material };
}

function createVRSliderRow(initialValue) {
  const row = new THREE.Group();

  const title = createTextPlane({ width: 1.2, height: 0.18, text: 'beta = v/c', font: 'bold 84px Arial', align: 'left' });
  title.position.set(-1.05, 0.28, 0.02);
  row.add(title);

  const valueLabel = createTextPlane({ width: 0.8, height: 0.18, text: initialValue.toFixed(2), font: 'bold 84px Arial', align: 'right' });
  valueLabel.position.set(1.05, 0.28, 0.02);
  row.add(valueLabel);

  const minusButton = createVRButton('-', 0.28, 0.28);
  const { group: minusGroup, hitTarget: minusTarget } = minusButton;
  minusGroup.position.set(-1.35, -0.03, 0.02);
  row.add(minusGroup);

  const plusButton = createVRButton('+', 0.28, 0.28);
  const { group: plusGroup, hitTarget: plusTarget } = plusButton;
  plusGroup.position.set(1.35, -0.03, 0.02);
  row.add(plusGroup);

  const trackWidth = 2.32;
  const trackHeight = 0.14;
  const track = new THREE.Mesh(
    new THREE.PlaneGeometry(trackWidth, trackHeight),
    new THREE.MeshBasicMaterial({ color: 0x1b2431, transparent: true, opacity: 0.98, depthTest: false })
  );
  track.position.set(0, -0.03, 0.01);
  row.add(track);

  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(trackWidth, trackHeight * 0.78),
    new THREE.MeshBasicMaterial({ color: 0x147aff, transparent: true, opacity: 0.92, depthTest: false })
  );
  fill.position.set(0, -0.03, 0.015);
  row.add(fill);

  const knob = new THREE.Mesh(
    new THREE.CircleGeometry(0.085, 24),
    new THREE.MeshBasicMaterial({ color: 0xe9f5ff, depthTest: false })
  );
  knob.position.set(0, -0.03, 0.02);
  row.add(knob);

  const border = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-trackWidth / 2, -trackHeight / 2, 0.022),
      new THREE.Vector3(trackWidth / 2, -trackHeight / 2, 0.022),
    new THREE.Vector3(trackWidth / 2, trackHeight / 2, 0.022),
    new THREE.Vector3(-trackWidth / 2, trackHeight / 2, 0.022)
  ]),
    new THREE.LineBasicMaterial({ color: 0x92c7ff, transparent: true, opacity: 0.65, depthTest: false })
  );
  border.position.copy(track.position);
  row.add(border);

  track.userData = {
    kind: 'slider',
    valueLabel,
    fill,
    knob,
    trackWidth,
    setHover(hovered) {
      track.material.color.set(hovered ? 0x243247 : 0x1b2431);
    },
    setValue(v) {
      const t = THREE.MathUtils.clamp(v / 0.95, 0, 1);
      const minFill = 0.025;
      fill.scale.x = Math.max(t, minFill);
      fill.position.x = (-trackWidth / 2) + (trackWidth * fill.scale.x) / 2;
      fill.position.y = track.position.y;
      knob.position.x = THREE.MathUtils.lerp(-trackWidth / 2, trackWidth / 2, t);
      knob.position.y = track.position.y;
      valueLabel.userData.setText(v.toFixed(2));
    }
  };

  minusTarget.userData.kind = 'beta-minus';
  plusTarget.userData.kind = 'beta-plus';

  return {
    row,
    sliderTarget: track,
    minusTarget,
    plusTarget,
    minusButton,
    plusButton,
    valueLabel,
    setValue: track.userData.setValue,
    trackMaterial: track.material,
    fillMaterial: fill.material,
    borderMaterial: border.material
  };
}

const xrPanelSizes = {
  expanded: { width: 3.55, height: 3.56 },
  collapsed: { width: 1.10, height: 0.42 }
};

const vrUI = {
  panel: new THREE.Group(),
  content: new THREE.Group(),
  interactables: [],
  persistentInteractables: [],
  sliderRow: null,
  lorentzRow: null,
  aberrationRow: null,
  sceneGridButton: null,
  sceneEyeButton: null,
  minimizeButton: null,
  surfaceMaterials: [],
  accentMaterials: [],
  borderMaterials: []
};
vrUI.panel.visible = false;
scene.add(vrUI.panel);

const panelBg = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ color: 0x0a1018, transparent: true, opacity: 0.52, side: THREE.DoubleSide, depthTest: false })
);
vrUI.panel.add(panelBg);

const panelOutline = new THREE.LineLoop(
  new THREE.BufferGeometry(),
  new THREE.LineBasicMaterial({ color: 0x8bc2ff, transparent: true, opacity: 0.24, depthTest: false })
);
vrUI.panel.add(panelOutline);
vrUI.borderMaterials.push(panelOutline.material);

panelTitle = createTextPlane({ width: 2.45, height: 0.22, text: 'Relativistic observer XR demo', font: 'bold 60px Arial', align: 'left' });
vrUI.panel.add(panelTitle);

vrUI.minimizeButton = createVRButton('Hide', 0.92, 0.24);
vrUI.minimizeButton.hitTarget.userData.kind = 'menu-toggle';
vrUI.panel.add(vrUI.minimizeButton.group);
vrUI.persistentInteractables.push(vrUI.minimizeButton.hitTarget);
vrUI.surfaceMaterials.push(vrUI.minimizeButton.bgMaterial);
vrUI.borderMaterials.push(vrUI.minimizeButton.borderMaterial);

vrUI.panel.add(vrUI.content);

vrUI.sliderRow = createVRSliderRow(parseFloat(betaSlider.value));
vrUI.sliderRow.row.position.set(0, 0.78, 0.03);
vrUI.content.add(vrUI.sliderRow.row);
vrUI.interactables.push(vrUI.sliderRow.sliderTarget, vrUI.sliderRow.minusTarget, vrUI.sliderRow.plusTarget);
vrUI.surfaceMaterials.push(vrUI.sliderRow.trackMaterial, vrUI.sliderRow.minusButton.bgMaterial, vrUI.sliderRow.plusButton.bgMaterial);
vrUI.accentMaterials.push(vrUI.sliderRow.fillMaterial);
vrUI.borderMaterials.push(vrUI.sliderRow.borderMaterial, vrUI.sliderRow.minusButton.borderMaterial, vrUI.sliderRow.plusButton.borderMaterial);

vrUI.lorentzRow = createVRToggleRow('Lorentz transform', lorentzToggle.checked);
vrUI.lorentzRow.row.position.set(0, 0.36, 0.03);
vrUI.content.add(vrUI.lorentzRow.row);
vrUI.lorentzRow.hitTarget.userData.kind = 'lorentz-toggle';
vrUI.interactables.push(vrUI.lorentzRow.hitTarget);
vrUI.surfaceMaterials.push(vrUI.lorentzRow.bgMaterial);

vrUI.aberrationRow = createVRToggleRow('Aberration', aberrationToggle.checked);
vrUI.aberrationRow.row.position.set(0, -0.06, 0.03);
vrUI.content.add(vrUI.aberrationRow.row);
vrUI.aberrationRow.hitTarget.userData.kind = 'aberration-toggle';
vrUI.interactables.push(vrUI.aberrationRow.hitTarget);
vrUI.surfaceMaterials.push(vrUI.aberrationRow.bgMaterial);

const vrSceneButtonGrid = createVRButton('Cube grid scene', 2.7, 0.36);
vrSceneButtonGrid.group.position.set(0, -0.58, 0.03);
vrUI.content.add(vrSceneButtonGrid.group);
vrSceneButtonGrid.hitTarget.userData.kind = 'scene-grid';
vrUI.interactables.push(vrSceneButtonGrid.hitTarget);
vrUI.surfaceMaterials.push(vrSceneButtonGrid.bgMaterial);
vrUI.borderMaterials.push(vrSceneButtonGrid.borderMaterial);
vrUI.sceneGridButton = vrSceneButtonGrid;

const vrSceneButtonEye = createVRButton('Eye-relative scene', 2.7, 0.36);
vrSceneButtonEye.group.position.set(0, -1.02, 0.03);
vrUI.content.add(vrSceneButtonEye.group);
vrSceneButtonEye.hitTarget.userData.kind = 'scene-eye';
vrUI.interactables.push(vrSceneButtonEye.hitTarget);
vrUI.surfaceMaterials.push(vrSceneButtonEye.bgMaterial);
vrUI.borderMaterials.push(vrSceneButtonEye.borderMaterial);
vrUI.sceneEyeButton = vrSceneButtonEye;

const vrHelp1 = createTextPlane({ width: 3.15, height: 0.14, text: 'XR: use Hide to collapse the menu when you want a clear view', font: '60px Arial', color: '#c9d9eb', align: 'left' });
vrHelp1.position.set(-0.02, -1.40, 0.03);
vrUI.content.add(vrHelp1);

const vrHelp2 = createTextPlane({ width: 3.15, height: 0.14, text: 'Left stick: move, right stick: turn + vertical fly', font: '60px Arial', color: '#c9d9eb', align: 'left' });
vrHelp2.position.set(-0.02, -1.60, 0.03);
vrUI.content.add(vrHelp2);

function updateXRPanelFrame(width, height) {
  panelBg.scale.set(width, height, 1);
  if (panelOutline.geometry) {
    panelOutline.geometry.dispose();
  }
  panelOutline.geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-width / 2, -height / 2, 0.01),
    new THREE.Vector3(width / 2, -height / 2, 0.01),
    new THREE.Vector3(width / 2, height / 2, 0.01),
    new THREE.Vector3(-width / 2, height / 2, 0.01)
  ]);
}

function getXRExpandedButtonAnchor() {
  const { width, height } = xrPanelSizes.expanded;
  const headerInset = 0.18;
  const buttonWidth = vrUI.minimizeButton.group.userData.width || 0.92;
  return {
    x: width / 2 - headerInset - buttonWidth / 2,
    y: height / 2 - 0.18
  };
}

function applyXRPanelLayout() {
  const { width, height } = getXRPanelSize();
  const anchor = getXRExpandedButtonAnchor();
  const headerInset = 0.18;
  const titleWidth = panelTitle.userData.width || 2.4;
  const top = height / 2;
  const left = -width / 2;
  const frameOffsetX = uiState.menuMinimized ? 0 : -anchor.x;
  const frameOffsetY = uiState.menuMinimized ? 0 : -anchor.y;

  updateXRPanelFrame(width, height);
  panelBg.position.set(frameOffsetX, frameOffsetY, 0);
  panelOutline.position.set(frameOffsetX, frameOffsetY, 0.01);
  panelTitle.visible = !uiState.menuMinimized;
  panelTitle.scale.set(1, 1, 1);
  panelTitle.position.set(left + headerInset + titleWidth / 2 + frameOffsetX, top - 0.18 + frameOffsetY, 0.03);
  vrUI.minimizeButton.group.position.set(0, 0, 0.04);
  vrUI.content.position.set(frameOffsetX, frameOffsetY, 0);
  vrUI.content.visible = !uiState.menuMinimized;
}

function getXRMenuInteractables() {
  return uiState.menuMinimized
    ? vrUI.persistentInteractables
    : [...vrUI.persistentInteractables, ...vrUI.interactables];
}

function updateXRPanelTitle() {
  if (!panelTitle) return;
  panelTitle.userData.setText(uiState.menuMinimized ? 'XR controls' : `XR controls: ${sceneLabels[sceneMode]}`);
}

function applyMenuMinimizedState() {
  desktopPanel.classList.toggle('panel-collapsed', uiState.menuMinimized);
  if (panelMinimizeButton) {
    panelMinimizeButton.textContent = uiState.menuMinimized ? 'Expand' : 'Minimize';
    panelMinimizeButton.setAttribute('aria-expanded', String(!uiState.menuMinimized));
  }
  if (vrUI.minimizeButton) {
    vrUI.minimizeButton.setLabel(uiState.menuMinimized ? 'Show' : 'Hide');
  }
  updateXRPanelTitle();
  applyXRPanelLayout();
}

function setMenuMinimized(minimized) {
  uiState.menuMinimized = Boolean(minimized);
  applyMenuMinimizedState();
}

applyMenuMinimizedState();
setSceneMode(sceneMode);

const isHandheldDevice =
  Boolean(navigator.userAgentData?.mobile) ||
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  window.matchMedia('(pointer: coarse)').matches;

const xrSupport = {
  ar: false,
  vr: false
};

const xrState = {
  busy: false,
  sessionMode: null,
  overlayEnabled: false
};

const flatARState = {
  active: false,
  stream: null,
  listening: false,
  hasOrientation: false,
  alpha: 0,
  beta: 0,
  gamma: 0,
  screenOrientation: 0
};

const deviceLookEuler = new THREE.Euler();
const deviceLookAdjustment = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const screenOrientationAxis = new THREE.Vector3(0, 0, 1);
const screenOrientationQuaternion = new THREE.Quaternion();

function getActiveXRSession() {
  return renderer.xr.getSession();
}

function isImmersiveARPresenting() {
  return renderer.xr.isPresenting && xrState.sessionMode === 'immersive-ar';
}

function isPassthroughModeActive() {
  return flatARState.active || isImmersiveARPresenting();
}

function shouldShowDesktopOverlay() {
  if (!renderer.xr.isPresenting) return true;
  return isImmersiveARPresenting() && xrState.overlayEnabled && isHandheldDevice;
}

function shouldShowWorldSpacePanel() {
  if (!renderer.xr.isPresenting) return false;
  return !(isImmersiveARPresenting() && xrState.overlayEnabled && isHandheldDevice);
}

function getXRPanelSize() {
  return uiState.menuMinimized ? xrPanelSizes.collapsed : xrPanelSizes.expanded;
}

function getXRMenuPreset() {
  if (xrState.sessionMode === 'immersive-ar') {
    return {
      forward: 3.0,
      right: -0.82,
      up: 0.34,
      panelOpacity: 0.58,
      surfaceOpacity: 0.8,
      accentOpacity: 0.9,
      borderOpacity: 0.3
    };
  }

  return {
    forward: 4.15,
    right: 0,
    up: -0.08,
    panelOpacity: 0.24,
    surfaceOpacity: 0.5,
    accentOpacity: 0.68,
    borderOpacity: 0.16
  };
}

function updateRelativisticMaterialOpacity() {
  const targetOpacity = isPassthroughModeActive() ? 1.0 : 0.6;
  const opaque = targetOpacity >= 0.999;

  for (const material of relativisticMaterials) {
    if (material.uniforms?.uOpacity) {
      material.uniforms.uOpacity.value = targetOpacity;
    }
    if (material.transparent !== !opaque || material.depthWrite !== opaque) {
      material.transparent = !opaque;
      material.depthWrite = opaque;
      material.needsUpdate = true;
    }
  }
}

function applyXRMenuAppearance() {
  const preset = getXRMenuPreset();
  panelBg.material.opacity = preset.panelOpacity;
  for (const material of vrUI.surfaceMaterials) {
    material.opacity = preset.surfaceOpacity;
  }
  for (const material of vrUI.accentMaterials) {
    material.opacity = preset.accentOpacity;
  }
  for (const material of vrUI.borderMaterials) {
    material.opacity = preset.borderOpacity;
  }
}

function updateBackdropVisibility() {
  const passthroughActive = isPassthroughModeActive();
  scene.background = passthroughActive ? null : defaultSceneBackground;
  scene.fog = passthroughActive ? null : defaultSceneFog;
  stars.visible = !passthroughActive;
  axes.visible = !passthroughActive;
  cameraFeed.style.display = flatARState.active ? 'block' : 'none';
  updateRelativisticMaterialOpacity();
  desktopPanel.classList.toggle('hidden', !shouldShowDesktopOverlay());
  if (!shouldShowWorldSpacePanel()) {
    vrUI.panel.visible = false;
    setVRHoverStates(new Set());
  }

  const anyButtonVisible = [mrButton, vrButton, phoneARButton].some((button) => !button.hidden);
  const allowOverlayButtons =
    !renderer.xr.isPresenting ||
    (isImmersiveARPresenting() && xrState.overlayEnabled && isHandheldDevice);
  buttonDock.hidden = !anyButtonVisible || !allowOverlayButtons;
}

function updateActionButtons() {
  const canUseFlatAR = isHandheldDevice && Boolean(navigator.mediaDevices?.getUserMedia);
  mrButton.hidden = !xrSupport.ar;
  vrButton.hidden = !xrSupport.vr;
  phoneARButton.hidden = !canUseFlatAR;

  mrButton.textContent = isImmersiveARPresenting() ? 'Exit MR' : 'Enter MR';
  vrButton.textContent = renderer.xr.isPresenting && xrState.sessionMode === 'immersive-vr' ? 'Exit VR' : 'Enter VR';
  phoneARButton.textContent = flatARState.active ? 'Disable Phone AR' : 'Enable Phone AR';

  mrButton.disabled = xrState.busy;
  vrButton.disabled = xrState.busy;
  phoneARButton.disabled = xrState.busy || renderer.xr.isPresenting;

  updateBackdropVisibility();
}

function setActionButtonsBusy(busy) {
  xrState.busy = busy;
  updateActionButtons();
}

async function endCurrentXRSession() {
  const session = getActiveXRSession();
  if (session) {
    await session.end();
  }
}

function getScreenOrientationAngleRad() {
  if (window.screen.orientation && typeof window.screen.orientation.angle === 'number') {
    return THREE.MathUtils.degToRad(window.screen.orientation.angle);
  }
  if (typeof window.orientation === 'number') {
    return THREE.MathUtils.degToRad(window.orientation);
  }
  return 0;
}

function updateFlatARScreenOrientation() {
  flatARState.screenOrientation = getScreenOrientationAngleRad();
}

function handleFlatAROrientation(event) {
  if (
    typeof event.alpha !== 'number' ||
    typeof event.beta !== 'number' ||
    typeof event.gamma !== 'number'
  ) {
    return;
  }

  flatARState.alpha = THREE.MathUtils.degToRad(event.alpha);
  flatARState.beta = THREE.MathUtils.degToRad(event.beta);
  flatARState.gamma = THREE.MathUtils.degToRad(event.gamma);
  flatARState.hasOrientation = true;
}

function attachFlatAROrientation() {
  if (flatARState.listening) return;
  flatARState.listening = true;
  flatARState.hasOrientation = false;
  updateFlatARScreenOrientation();
  window.addEventListener('deviceorientation', handleFlatAROrientation, true);
  window.addEventListener('orientationchange', updateFlatARScreenOrientation);
  if (window.screen.orientation && typeof window.screen.orientation.addEventListener === 'function') {
    window.screen.orientation.addEventListener('change', updateFlatARScreenOrientation);
  }
}

function detachFlatAROrientation() {
  if (!flatARState.listening) return;
  flatARState.listening = false;
  flatARState.hasOrientation = false;
  window.removeEventListener('deviceorientation', handleFlatAROrientation, true);
  window.removeEventListener('orientationchange', updateFlatARScreenOrientation);
  if (window.screen.orientation && typeof window.screen.orientation.removeEventListener === 'function') {
    window.screen.orientation.removeEventListener('change', updateFlatARScreenOrientation);
  }
}

async function requestMotionPermissionIfNeeded() {
  if (typeof window.DeviceOrientationEvent === 'undefined') return false;
  if (typeof window.DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const permission = await window.DeviceOrientationEvent.requestPermission();
      return permission === 'granted';
    } catch (err) {
      console.warn('Device orientation permission request failed.', err);
      return false;
    }
  }
  return true;
}

async function stopFlatAR() {
  if (!flatARState.active && !flatARState.stream) return;

  detachFlatAROrientation();

  if (flatARState.stream) {
    for (const track of flatARState.stream.getTracks()) {
      track.stop();
    }
  }

  flatARState.stream = null;
  flatARState.active = false;
  cameraFeed.pause();
  cameraFeed.srcObject = null;
  updateActionButtons();
}

async function startFlatAR() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera APIs are not available in this browser.');
  }

  if (flatARState.active) return;

  await endCurrentXRSession();

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    }
  });

  flatARState.stream = stream;
  flatARState.active = true;
  cameraFeed.srcObject = stream;

  try {
    await cameraFeed.play();
  } catch (err) {
    console.warn('Camera preview playback failed.', err);
  }

  if (await requestMotionPermissionIfNeeded()) {
    attachFlatAROrientation();
  } else {
    flatARState.hasOrientation = false;
  }

  updateActionButtons();
}

async function toggleFlatAR() {
  if (xrState.busy) return;

  setActionButtonsBusy(true);
  try {
    if (flatARState.active) {
      await stopFlatAR();
    } else {
      await startFlatAR();
    }
  } catch (err) {
    console.error(err);
    alert('Could not start phone AR. Open the page over HTTPS (or localhost), allow camera access, and try again.');
  } finally {
    setActionButtonsBusy(false);
  }
}

async function startImmersiveSession(mode) {
  if (!navigator.xr) {
    throw new Error('WebXR is not available in this browser.');
  }

  if (flatARState.active) {
    await stopFlatAR();
  }

  const activeSession = getActiveXRSession();
  if (activeSession && xrState.sessionMode !== mode) {
    await activeSession.end();
  }

  const wantsOverlay = mode === 'immersive-ar';
  const requiresOverlay = wantsOverlay && isHandheldDevice;
  const requiredFeatures = mode === 'immersive-ar'
    ? ['local', ...(requiresOverlay ? ['dom-overlay'] : [])]
    : [];
  const optionalFeatures = mode === 'immersive-ar'
    ? ['local-floor', 'bounded-floor', 'hand-tracking', ...(requiresOverlay ? [] : ['dom-overlay'])]
    : ['local-floor', 'bounded-floor', 'hand-tracking'];
  const sessionInit = {
    optionalFeatures
  };

  if (requiredFeatures.length > 0) {
    sessionInit.requiredFeatures = requiredFeatures;
  }
  if (wantsOverlay) {
    sessionInit.domOverlay = { root: overlayRoot };
  }

  const session = await navigator.xr.requestSession(mode, sessionInit);
  renderer.xr.setReferenceSpaceType(mode === 'immersive-ar' ? 'local' : 'local-floor');
  xrState.sessionMode = mode;
  xrState.overlayEnabled = Boolean(session.domOverlayState);
  await renderer.xr.setSession(session);
  updateActionButtons();
}

async function toggleImmersiveSession(mode) {
  if (xrState.busy) return;

  setActionButtonsBusy(true);
  try {
    const activeSession = getActiveXRSession();
    if (activeSession && xrState.sessionMode === mode) {
      await activeSession.end();
    } else {
      await startImmersiveSession(mode);
    }
  } catch (err) {
    console.error(err);

    if (mode === 'immersive-ar' && isHandheldDevice && navigator.mediaDevices?.getUserMedia) {
      try {
        await startFlatAR();
        return;
      } catch (fallbackErr) {
        console.error(fallbackErr);
      }
    }

    if (mode === 'immersive-ar') {
      alert('Could not start MR. Use HTTPS in a browser that supports immersive-ar. On phones, Enable Phone AR can be used as a fallback.');
    } else {
      alert('Could not start VR. Make sure you opened this page over HTTPS in a WebXR-capable browser.');
    }
  } finally {
    setActionButtonsBusy(false);
  }
}

async function initializeExperienceButtons() {
  mrButton.addEventListener('click', () => {
    void toggleImmersiveSession('immersive-ar');
  });
  vrButton.addEventListener('click', () => {
    void toggleImmersiveSession('immersive-vr');
  });
  phoneARButton.addEventListener('click', () => {
    void toggleFlatAR();
  });

  if (navigator.xr) {
    try {
      xrSupport.ar = await navigator.xr.isSessionSupported('immersive-ar');
    } catch (err) {
      console.warn('Could not determine immersive-ar support.', err);
    }
    try {
      xrSupport.vr = await navigator.xr.isSessionSupported('immersive-vr');
    } catch (err) {
      console.warn('Could not determine immersive-vr support.', err);
    }
  }

  updateActionButtons();
}

window.addEventListener('pagehide', () => {
  void stopFlatAR();
});

void initializeExperienceButtons();
updateActionButtons();

const keys = new Set();
let pointerLocked = false;
let yaw = initialFacingYaw;
let pitch = 0;
const touchLook = {
  active: false,
  pointerId: null,
  lastX: 0,
  lastY: 0
};

renderer.domElement.addEventListener('click', () => {
  if (renderer.xr.isPresenting || flatARState.active || isHandheldDevice) return;
  renderer.domElement.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
});

document.addEventListener('mousemove', (event) => {
  if (!pointerLocked || renderer.xr.isPresenting) return;
  yaw -= event.movementX * 0.0022;
  pitch -= event.movementY * 0.0022;
  pitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, pitch));
});

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (!flatARState.active || flatARState.hasOrientation || event.pointerType === 'mouse') return;
  touchLook.active = true;
  touchLook.pointerId = event.pointerId;
  touchLook.lastX = event.clientX;
  touchLook.lastY = event.clientY;
  if (typeof renderer.domElement.setPointerCapture === 'function') {
    renderer.domElement.setPointerCapture(event.pointerId);
  }
});

renderer.domElement.addEventListener('pointermove', (event) => {
  if (!touchLook.active || event.pointerId !== touchLook.pointerId) return;
  const dx = event.clientX - touchLook.lastX;
  const dy = event.clientY - touchLook.lastY;
  touchLook.lastX = event.clientX;
  touchLook.lastY = event.clientY;
  yaw -= dx * 0.005;
  pitch -= dy * 0.005;
  pitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, pitch));
});

function endTouchLook(event) {
  if (event.pointerId !== touchLook.pointerId) return;
  touchLook.active = false;
  touchLook.pointerId = null;
  if (typeof renderer.domElement.releasePointerCapture === 'function') {
    renderer.domElement.releasePointerCapture(event.pointerId);
  }
}

renderer.domElement.addEventListener('pointerup', endTouchLook);
renderer.domElement.addEventListener('pointercancel', endTouchLook);

document.addEventListener('keydown', (e) => keys.add(e.code));
document.addEventListener('keyup', (e) => keys.delete(e.code));

function setBeta(nextValue) {
  const v = THREE.MathUtils.clamp(nextValue, 0, 0.99);
  sharedUniforms.uBeta.value = v;
  betaSlider.value = v.toFixed(2);
  betaValue.textContent = v.toFixed(2);
  vrUI.sliderRow.setValue(v);
}

function setLorentzEnabled(enabled) {
  sharedUniforms.uLorentzEnabled.value = enabled ? 1 : 0;
  lorentzToggle.checked = enabled;
  vrUI.lorentzRow.hitTarget.userData.setValue(enabled);
}

function setAberrationEnabled(enabled) {
  sharedUniforms.uAberrationEnabled.value = enabled ? 1 : 0;
  aberrationToggle.checked = enabled;
  vrUI.aberrationRow.hitTarget.userData.setValue(enabled);
}

function updateSceneVisibility() {
  for (const item of movers) {
    item.mesh.visible = sceneMode !== 1;
  }
  for (const item of gridCubes) {
    item.mesh.visible = sceneMode === 1;
  }
}

function setSceneMode(mode) {
  sceneMode = mode;
  if (sceneToggleButton) {
    sceneToggleButton.textContent = sceneMode === 1 ? 'Back to moving-object scene' : 'Switch to cube grid scene';
  }
  if (sceneEyeButton) {
    sceneEyeButton.textContent = sceneMode === 2 ? 'Back to moving-object scene' : 'Switch to eye-relative scene';
  }
  updateXRPanelTitle();
  if (vrUI.sceneGridButton) {
    vrUI.sceneGridButton.setLabel(sceneMode === 1 ? 'Back to objects' : 'Cube grid scene');
  }
  if (vrUI.sceneEyeButton) {
    vrUI.sceneEyeButton.setLabel(sceneMode === 2 ? 'Back to objects' : 'Eye-relative scene');
  }
  sharedUniforms.uCheckerEnabled.value = sceneMode === 1 ? 0 : 1;
  updateSceneVisibility();
}

function setGridScene() {
  setSceneMode(1);
}

function setEyeRelativeScene() {
  setSceneMode(2);
}

function toggleGridScene() {
  if (sceneMode === 1) {
    setSceneMode(0);
  } else {
    setSceneMode(1);
  }
}

function toggleEyeScene() {
  if (sceneMode === 2) {
    setSceneMode(0);
  } else {
    setSceneMode(2);
  }
}

function updateRelativisticUniforms() {
  camera.getWorldPosition(tempVec3);
  sharedUniforms.uObserverPos.value.copy(sceneMode === 2 ? tempVec3 : new THREE.Vector3(0, 0, 0));
  sharedUniforms.uWorldMotionDir.value.set(1, 0, 0);

  // Update projectile observer positions to always use camera position
  scene.traverse((object) => {
    if (object.material && object.material.userData && object.material.userData.projectileObserverPos) {
      object.material.uniforms.uObserverPos.value.copy(tempVec3);
    }
  });
}

function resetSceneObjects() {
  for (const item of movers) {
    item.mesh.position.copy(item.initialPos);
    item.laneY = item.initialPos.y;
    item.laneZ = item.initialPos.z;
  }
  for (const item of gridCubes) {
    item.mesh.position.copy(item.initialPos);
  }
}

betaSlider.addEventListener('input', () => {
  setBeta(parseFloat(betaSlider.value));
});

lorentzToggle.addEventListener('change', () => {
  setLorentzEnabled(lorentzToggle.checked);
});

aberrationToggle.addEventListener('change', () => {
  setAberrationEnabled(aberrationToggle.checked);
});

if (panelMinimizeButton) {
  panelMinimizeButton.addEventListener('click', () => {
    setMenuMinimized(!uiState.menuMinimized);
  });
}

if (sceneToggleButton) {
  sceneToggleButton.addEventListener('click', toggleGridScene);
}
if (sceneEyeButton) {
  sceneEyeButton.addEventListener('click', toggleEyeScene);
}

setBeta(parseFloat(betaSlider.value));
setLorentzEnabled(lorentzToggle.checked);
setAberrationEnabled(aberrationToggle.checked);
setSceneMode(sceneMode);

function moveDesktop(dt) {
  if (renderer.xr.isPresenting || flatARState.active) return;

  player.rotation.y = yaw;
  camera.rotation.x = pitch;

  const boost = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 3.0 : 1.0;
  const speed = 8.5 * boost;

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
  forward.normalize();

  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const move = new THREE.Vector3();

  if (keys.has('KeyW')) move.add(forward);
  if (keys.has('KeyS')) move.sub(forward);
  if (keys.has('KeyD')) move.add(right);
  if (keys.has('KeyA')) move.sub(right);
  if (keys.has('KeyE')) move.y += 1;
  if (keys.has('KeyQ')) move.y -= 1;

  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(speed * dt);
    player.position.add(move);
    if (dt > 1e-6) {
      playerVelocity.copy(move).divideScalar(dt);
    } else {
      playerVelocity.set(0, 0, 0);
    }
  } else {
    playerVelocity.set(0, 0, 0);
  }
}

function updateFlatARPose() {
  if (!flatARState.active) return;

  player.rotation.set(0, 0, 0);

  if (flatARState.hasOrientation) {
    deviceLookEuler.set(flatARState.beta, flatARState.alpha, -flatARState.gamma, 'YXZ');
    camera.quaternion.setFromEuler(deviceLookEuler);
    camera.quaternion.multiply(deviceLookAdjustment);
    screenOrientationQuaternion.setFromAxisAngle(screenOrientationAxis, -flatARState.screenOrientation);
    camera.quaternion.multiply(screenOrientationQuaternion);
  } else {
    camera.rotation.set(pitch, yaw, 0);
  }

  playerVelocity.set(0, 0, 0);
}

function getStickAxes(gamepad) {
  if (!gamepad || !gamepad.axes || gamepad.axes.length < 2) return { x: 0, y: 0 };
  // Quest thumbsticks typically occupy axes [2,3], but some browsers expose
  // only the active pair. Prefer [2,3] when present so x/y stay consistent.
  const baseIndex = gamepad.axes.length >= 4 ? 2 : gamepad.axes.length - 2;
  return {
    x: gamepad.axes[baseIndex] || 0,
    y: gamepad.axes[baseIndex + 1] || 0
  };
}

function applyDeadzone(v, dz = 0.15) {
  return Math.abs(v) < dz ? 0 : v;
}

function moveVR(dt) {
  if (!renderer.xr.isPresenting) return;
  const session = renderer.xr.getSession();
  if (!session) return;

  let leftX = 0, leftY = 0, rightX = 0, rightY = 0;

  for (const source of session.inputSources) {
    const gp = source.gamepad;
    if (!gp) continue;
    const stick = getStickAxes(gp);
    if (source.handedness === 'left') {
      leftX = applyDeadzone(stick.x);
      leftY = applyDeadzone(stick.y);
    } else if (source.handedness === 'right') {
      rightX = applyDeadzone(stick.x);
      rightY = stick.y || 0;
    }
  }

  if (Math.abs(rightX) > 0.15) player.rotation.y -= rightX * 1.8 * dt;

  // Use a stronger threshold for vertical flying so it does not trigger during
  // ordinary left/right turning motions. Require a clear up/down intent.
  let verticalIntent = 0;
  if (Math.abs(rightY) > 0.6 && Math.abs(rightY) > Math.abs(rightX) + 0.18) {
    verticalIntent = Math.sign(rightY) * ((Math.abs(rightY) - 0.6) / 0.4);
  }

  const cameraWorldQuat = new THREE.Quaternion();
  camera.getWorldQuaternion(cameraWorldQuat);

  const headForward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraWorldQuat).normalize();
  const headRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraWorldQuat).normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const move = new THREE.Vector3();
  move.addScaledVector(headRight, leftX);
  move.addScaledVector(headForward, -leftY);
  move.addScaledVector(worldUp, -verticalIntent);

  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(4.8 * dt);
    player.position.add(move);
    if (dt > 1e-6) {
      playerVelocity.copy(move).divideScalar(dt);
    } else {
      playerVelocity.set(0, 0, 0);
    }
  } else {
    playerVelocity.set(0, 0, 0);
  }
}

const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();
const tempOrigin = new THREE.Vector3();
const tempDirection = new THREE.Vector3();
const tempVec3 = new THREE.Vector3();
const tempVec4 = new THREE.Vector3();
const tempVec5 = new THREE.Vector3();
const tempQuat = new THREE.Quaternion();
const controllerGripVisualLength = 8;
const rayStartOffset = 0.06;

function buildController(index, color) {
  const controller = renderer.xr.getController(index);
  controller.userData.hovered = null;
  controller.userData.intersection = null;
  controller.userData.selecting = false;
  controller.userData.connected = false;
  controller.userData.targetRayMode = null;

  const lineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, -rayStartOffset),
    new THREE.Vector3(0, 0, -1)
  ]);
  const line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  line.name = 'ray';
  line.visible = false;
  line.scale.z = controllerGripVisualLength;
  controller.add(line);

  const handMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 16, 12),
    new THREE.MeshStandardMaterial({ color, emissive: 0x224a78, transparent: true, opacity: 0.9 })
  );
  handMesh.name = 'handMesh';
  handMesh.visible = true;
  controller.add(handMesh);
  controller.userData.handMesh = handMesh;

  player.add(controller);

  controller.addEventListener('connected', (event) => {
    controller.userData.connected = true;
    controller.userData.targetRayMode = event.data?.targetRayMode || null;
  });

  controller.addEventListener('disconnected', () => {
    controller.userData.connected = false;
    controller.userData.targetRayMode = null;
    controller.userData.hovered = null;
    controller.userData.intersection = null;
    controller.userData.selecting = false;
    const ray = controller.getObjectByName('ray');
    if (ray) ray.visible = false;
    if (controller.userData.handMesh) controller.userData.handMesh.visible = false;
  });

  controller.addEventListener('selectstart', () => {
    controller.userData.selecting = true;
    if (controller.userData.hovered) {
      activateVRUI(controller.userData.hovered, controller.userData.intersection);
    } else {
      shootBullet(controller);
    }
  });

  controller.addEventListener('selectend', () => {
    controller.userData.selecting = false;
  });

  return controller;
}

const controllers = [
  buildController(0, 0x8bc2ff),
  buildController(1, 0xff9edc)
];

function setVRHoverStates(activeObjects) {
  for (const obj of [...vrUI.persistentInteractables, ...vrUI.interactables]) {
    if (typeof obj.userData.setHover === 'function') {
      obj.userData.setHover(activeObjects.has(obj));
    }
  }
}

function activateVRUI(target, intersection) {
  if (!target) return;

  switch (target.userData.kind) {
    case 'beta-minus':
      setBeta(sharedUniforms.uBeta.value - 0.01);
      break;
    case 'beta-plus':
      setBeta(sharedUniforms.uBeta.value + 0.01);
      break;
    case 'lorentz-toggle':
      setLorentzEnabled(!lorentzToggle.checked);
      break;
    case 'aberration-toggle':
      setAberrationEnabled(!aberrationToggle.checked);
      break;
    case 'menu-toggle':
      setMenuMinimized(!uiState.menuMinimized);
      break;
    case 'slider':
      if (intersection && intersection.uv) {
        const next = THREE.MathUtils.clamp(intersection.uv.x * 0.95, 0, 0.95);
        setBeta(next);
      }
      break;
    case 'scene-toggle':
      toggleGridScene();
      break;
    case 'scene-grid':
      toggleGridScene();
      break;
    case 'scene-eye':
      toggleEyeScene();
      break;
    default:
      break;
  }
}

function updateVRMenuPose(xrFrame) {
  if (!shouldShowWorldSpacePanel()) {
    vrUI.panel.visible = false;
    return;
  }

  const preset = getXRMenuPreset();
  applyXRMenuAppearance();

  camera.getWorldPosition(tempVec3);
  camera.getWorldQuaternion(tempQuat);
  tempDirection.set(0, 0, -1).applyQuaternion(tempQuat).normalize();
  tempVec4.set(1, 0, 0).applyQuaternion(tempQuat).normalize();
  tempVec5.set(0, 1, 0).applyQuaternion(tempQuat).normalize();
  const fixedPoint = getXRExpandedButtonAnchor();
  const viewportHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5) * preset.forward;
  const viewportWidth = viewportHeight * camera.aspect;
  const anchorMargin = 0.18;
  const anchorWidth = xrPanelSizes.collapsed.width;
  const anchorHeight = xrPanelSizes.collapsed.height;
  const maxAnchorRight = Math.max(0.12, viewportWidth * 0.5 - anchorWidth * 0.5 - anchorMargin);
  const maxAnchorUp = Math.max(0.12, viewportHeight * 0.5 - anchorHeight * 0.5 - anchorMargin);
  const anchorRight = THREE.MathUtils.clamp(preset.right + fixedPoint.x, -maxAnchorRight, maxAnchorRight);
  const anchorUp = THREE.MathUtils.clamp(preset.up + fixedPoint.y, -maxAnchorUp, maxAnchorUp);

  vrUI.panel.position.copy(tempVec3);
  vrUI.panel.position.addScaledVector(tempDirection, preset.forward);
  vrUI.panel.position.addScaledVector(tempVec4, anchorRight);
  vrUI.panel.position.addScaledVector(tempVec5, anchorUp);
  vrUI.panel.quaternion.copy(tempQuat);

  const euler = new THREE.Euler().setFromQuaternion(vrUI.panel.quaternion, 'YXZ');
  euler.z = 0;
  vrUI.panel.quaternion.setFromEuler(euler);
  vrUI.panel.visible = true;
}

function updateVRUIInteraction() {
  if (!shouldShowWorldSpacePanel() || !vrUI.panel.visible) {
    setVRHoverStates(new Set());
    for (const controller of controllers) {
      controller.userData.hovered = null;
      controller.userData.intersection = null;
      const ray = controller.getObjectByName('ray');
      if (ray) {
        ray.visible = false;
        ray.scale.z = controllerGripVisualLength;
      }
    }
    return;
  }

  const activeObjects = new Set();
  const activeInteractables = getXRMenuInteractables();

  for (const controller of controllers) {
    const ray = controller.getObjectByName('ray');

    const canPoint = controller.userData.connected && controller.userData.targetRayMode === 'tracked-pointer';
    if (!canPoint) {
      controller.userData.hovered = null;
      controller.userData.intersection = null;
      if (ray) {
        ray.visible = false;
        ray.scale.z = controllerGripVisualLength;
      }
      continue;
    }

    tempMatrix.identity().extractRotation(controller.matrixWorld);
    tempOrigin.setFromMatrixPosition(controller.matrixWorld);
    tempDirection.set(0, 0, -1).applyMatrix4(tempMatrix).normalize();
    raycaster.set(tempOrigin, tempDirection);

    const hits = raycaster.intersectObjects(activeInteractables, false);
    const hit = hits[0] || null;
    controller.userData.hovered = hit ? hit.object : null;
    controller.userData.intersection = hit;

    if (hit) {
      activeObjects.add(hit.object);
      if (controller.userData.selecting && hit.object.userData.kind === 'slider') {
        activateVRUI(hit.object, hit);
      }
    }

    if (ray) {
      ray.visible = true;
      ray.scale.z = hit ? Math.max(0.15, hit.distance) : controllerGripVisualLength;
    }
  }

  setVRHoverStates(activeObjects);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateFlatARScreenOrientation();
});

renderer.xr.addEventListener('sessionstart', () => {
  const session = getActiveXRSession();
  xrState.sessionMode = session?.mode || null;
  xrState.overlayEnabled = Boolean(session?.domOverlayState);
  if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
  updateActionButtons();
});

renderer.xr.addEventListener('sessionend', () => {
  xrState.sessionMode = null;
  xrState.overlayEnabled = false;
  vrUI.panel.visible = false;
  setVRHoverStates(new Set());
  updateActionButtons();
});

const clock = new THREE.Clock();

renderer.setAnimationLoop((time, xrFrame) => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  moveDesktop(dt);
  moveVR(dt);
  updateFlatARPose();
  updateRelativisticUniforms();
  updateVRMenuPose(xrFrame);
  updateVRUIInteraction();

  const inverseQuat = new THREE.Quaternion();
  const localMotionDir = new THREE.Vector3();

  if (sceneMode === 1) {
    for (const item of gridCubes) {
      const m = item.mesh;
      m.position.x += motionSpeed * dt;
      if (m.position.x > 42) {
        m.position.copy(item.initialPos);
      }
      // no rotation for grid cubes in cube grid scene

      inverseQuat.copy(m.quaternion).invert();
      localMotionDir.copy(sharedUniforms.uWorldMotionDir.value).applyQuaternion(inverseQuat).normalize();
      if (m.material.uniforms) {
        m.material.uniforms.uLocalMotionDir.value.copy(localMotionDir);
      }
    }
  } else {
    for (const item of movers) {
      const m = item.mesh;
      m.position.x += motionSpeed * dt;
      if (m.position.x > 42) {
        m.position.x = -48 - Math.random() * 12;
        item.laneY = -2.0 + Math.round(Math.random() * 5) * 1.6;
        item.laneZ = impactOffsets[Math.floor(Math.random() * impactOffsets.length)] + (Math.random() * 2 - 1);
        ({ y: item.laneY, z: item.laneZ } = makeSafeFlybyLane(item.laneY, item.laneZ));
        m.position.y = item.laneY;
        m.position.z = item.laneZ;
      }
      // Removed continuous rotation for static object orientations
      // m.rotation.y += item.spinY * dt;
      // m.rotation.z += item.spinZ * dt;

      inverseQuat.copy(m.quaternion).invert();
      localMotionDir.copy(sharedUniforms.uWorldMotionDir.value).applyQuaternion(inverseQuat).normalize();
      if (m.material.uniforms) {
        m.material.uniforms.uLocalMotionDir.value.copy(localMotionDir);
      }
    }
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    bullet.mesh.position.addScaledVector(bullet.velocity, dt);
    bullet.lifetime -= dt;
    inverseQuat.copy(bullet.mesh.quaternion).invert();
    const bulletWorldDir = bullet.mesh.material.uniforms?.uWorldMotionDir?.value || sharedUniforms.uWorldMotionDir.value;
    localMotionDir.copy(bulletWorldDir).applyQuaternion(inverseQuat).normalize();
    if (bullet.mesh.material.uniforms) {
      bullet.mesh.material.uniforms.uLocalMotionDir.value.copy(localMotionDir);
    }
    if (bullet.lifetime <= 0 || bullet.mesh.position.length() > 220) {
      scene.remove(bullet.mesh);
      bullets.splice(i, 1);
    }
  }

  renderer.render(scene, camera);
});
