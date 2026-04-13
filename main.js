import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const container = document.getElementById('app');
const desktopPanel = document.getElementById('panel');
const betaSlider = document.getElementById('betaSlider');
const betaValue = document.getElementById('betaValue');
const lorentzToggle = document.getElementById('lorentzToggle');
const aberrationToggle = document.getElementById('aberrationToggle');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070b);
scene.fog = new THREE.Fog(0x05070b, 45, 140);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
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

createEnterVRButton(renderer);

const player = new THREE.Group();
player.position.set(0, 2.0, 16);
scene.add(player);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 500);
camera.position.set(0, 0, 0);
player.add(camera);

const hemiLight = new THREE.HemisphereLight(0xbfd8ff, 0x1b1d24, 1.4);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(8, 12, 6);
scene.add(dirLight);

function makeFloorGridTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0f131b';
  ctx.fillRect(0, 0, size, size);

  const minor = size / 20;
  const major = size / 5;

  for (let i = 0; i <= 20; i++) {
    const x = Math.round(i * minor);
    const isMajor = i % 4 === 0;
    ctx.strokeStyle = isMajor ? 'rgba(88, 132, 190, 0.95)' : 'rgba(38, 62, 96, 0.9)';
    ctx.lineWidth = isMajor ? 4 : 2;

    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, x);
    ctx.lineTo(size, x);
    ctx.stroke();
  }

  const center = size * 0.5;
  ctx.strokeStyle = 'rgba(170, 215, 255, 0.95)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(center, 0);
  ctx.lineTo(center, size);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, center);
  ctx.lineTo(size, center);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 8);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const floorTexture = makeFloorGridTexture();
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(160, 160, 1, 1),
  new THREE.MeshBasicMaterial({
    map: floorTexture,
    transparent: false,
    toneMapped: false,
    side: THREE.DoubleSide
  })
);
floor.rotation.x = -Math.PI * 0.5;
floor.position.y = -4;
scene.add(floor);

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
  uAberrationEnabled: { value: aberrationToggle.checked ? 1 : 0 }
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

    vec3 color = checkerColor * (ambient + 0.85 * diff1 + 0.35 * diff2) + 0.22 * fresnel;
    gl_FragColor = vec4(color, uOpacity);
  }
`;

function makeRelativisticMaterial(colorHex) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uObserverPos: sharedUniforms.uObserverPos,
      uWorldMotionDir: sharedUniforms.uWorldMotionDir,
      uLocalMotionDir: { value: new THREE.Vector3(1, 0, 0) },
      uBeta: sharedUniforms.uBeta,
      uSpeed: sharedUniforms.uSpeed,
      uLorentzEnabled: sharedUniforms.uLorentzEnabled,
      uAberrationEnabled: sharedUniforms.uAberrationEnabled,
      uColor: { value: new THREE.Color(colorHex) },
      uOpacity: { value: 0.6 }
    },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false
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
    geometry = new THREE.CapsuleGeometry(0.8, 1.8, 10, 18);
  }

  const mesh = new THREE.Mesh(geometry, material || makeRelativisticMaterial(colorHex));
  mesh.frustumCulled = false;
  return mesh;
}

const observerBall = new THREE.Mesh(
  new THREE.SphereGeometry(2.5, 32, 24),
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
const palette = [0xff8f6b, 0xf2c94c, 0x8be28b, 0x9b8cff, 0x60d5ff, 0xff6ad5, 0xa3ff8f, 0xff9f82];
const types = ['box', 'sphere', 'capsule', 'sphere', 'box', 'capsule', 'sphere', 'box', 'sphere', 'capsule', 'box', 'sphere'];
const impactOffsets = [-13, -10, -6, -3, 0, 3, 6, 10, 13, 17, -17, 8];
const minFlybyRadius = 4.2;

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
  mesh.position.set(startX, laneY, laneZ);
  scene.add(mesh);
  movers.push({
    mesh,
    spinY: (Math.random() - 0.5) * 0.8,
    spinZ: (Math.random() - 0.5) * 0.55,
    laneY,
    laneZ,
    offset: Math.random() * Math.PI * 2
  });
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

  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);

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
  const activeColor = new THREE.Color(0x147aff);

  const group = new THREE.Group();
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color: baseColor.clone(), transparent: true, opacity: 0.96 })
  );
  group.add(bg);

  const border = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-width / 2, -height / 2, 0.002),
      new THREE.Vector3(width / 2, -height / 2, 0.002),
      new THREE.Vector3(width / 2, height / 2, 0.002),
      new THREE.Vector3(-width / 2, height / 2, 0.002)
    ]),
    new THREE.LineBasicMaterial({ color: 0x8bbcff, transparent: true, opacity: 0.5 })
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
    activeColor,
    setHover(hovered) {
      bg.material.color.copy(hovered ? hoverColor : baseColor);
    }
  };

  return { group, hitTarget: bg, text };
}

function createVRToggleRow(label, initialValue) {
  const row = new THREE.Group();
  const width = 2.95;
  const height = 0.34;

  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color: 0x101722, transparent: true, opacity: 0.98 })
  );
  row.add(bg);

  const checkbox = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: initialValue ? 0x147aff : 0x1b2431 })
  );
  checkbox.position.set(-width / 2 + 0.26, 0, 0.01);
  row.add(checkbox);

  const checkLabel = createTextPlane({ width: 0.18, height: 0.18, text: initialValue ? '✓' : '', font: 'bold 120px Arial', align: 'center' });
  checkLabel.position.set(checkbox.position.x, checkbox.position.y - 0.003, 0.02);
  row.add(checkLabel);

  const labelMesh = createTextPlane({ width: 2.3, height: 0.22, text: label, font: 'bold 84px Arial', align: 'left' });
  labelMesh.position.set(-0.98, 0, 0.02);
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

  return { row, hitTarget: bg };
}

function createVRSliderRow(initialValue) {
  const row = new THREE.Group();

  const title = createTextPlane({ width: 1.2, height: 0.18, text: 'β = v/c', font: 'bold 84px Arial', align: 'left' });
  title.position.set(-1.3, 0.28, 0.02);
  row.add(title);

  const valueLabel = createTextPlane({ width: 0.8, height: 0.18, text: initialValue.toFixed(2), font: 'bold 84px Arial', align: 'right' });
  valueLabel.position.set(1.15, 0.28, 0.02);
  row.add(valueLabel);

  const { group: minusGroup, hitTarget: minusTarget } = createVRButton('−', 0.28, 0.28);
  minusGroup.position.set(-1.35, -0.03, 0.02);
  row.add(minusGroup);

  const { group: plusGroup, hitTarget: plusTarget } = createVRButton('+', 0.28, 0.28);
  plusGroup.position.set(1.35, -0.03, 0.02);
  row.add(plusGroup);

  const trackWidth = 2.32;
  const trackHeight = 0.14;
  const track = new THREE.Mesh(
    new THREE.PlaneGeometry(trackWidth, trackHeight),
    new THREE.MeshBasicMaterial({ color: 0x1b2431, transparent: true, opacity: 0.98 })
  );
  track.position.set(0, -0.03, 0.01);
  row.add(track);

  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(trackWidth, trackHeight * 0.78),
    new THREE.MeshBasicMaterial({ color: 0x147aff, transparent: true, opacity: 0.92 })
  );
  fill.position.set(0, -0.03, 0.015);
  row.add(fill);

  const knob = new THREE.Mesh(
    new THREE.CircleGeometry(0.085, 24),
    new THREE.MeshBasicMaterial({ color: 0xe9f5ff })
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
    new THREE.LineBasicMaterial({ color: 0x92c7ff, transparent: true, opacity: 0.65 })
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
    valueLabel,
    setValue: track.userData.setValue
  };
}

const vrUI = {
  panel: new THREE.Group(),
  interactables: [],
  hoverObjects: new Set(),
  sliderRow: null,
  lorentzRow: null,
  aberrationRow: null
};
vrUI.panel.visible = false;
scene.add(vrUI.panel);

const panelBg = new THREE.Mesh(
  new THREE.PlaneGeometry(3.45, 2.55),
  new THREE.MeshBasicMaterial({ color: 0x0a1018, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
);
vrUI.panel.add(panelBg);

const panelOutline = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-1.725, -1.275, 0.01),
    new THREE.Vector3(1.725, -1.275, 0.01),
    new THREE.Vector3(1.725, 1.275, 0.01),
    new THREE.Vector3(-1.725, 1.275, 0.01)
  ]),
  new THREE.LineBasicMaterial({ color: 0x8bc2ff, transparent: true, opacity: 0.35 })
);
vrUI.panel.add(panelOutline);

const panelTitle = createTextPlane({ width: 2.95, height: 0.28, text: 'Relativistic observer VR demo', font: 'bold 86px Arial', align: 'left' });
panelTitle.position.set(-1.45, 1.02, 0.03);
vrUI.panel.add(panelTitle);

vrUI.sliderRow = createVRSliderRow(parseFloat(betaSlider.value));
vrUI.sliderRow.row.position.set(0, 0.52, 0.03);
vrUI.panel.add(vrUI.sliderRow.row);
vrUI.interactables.push(vrUI.sliderRow.sliderTarget, vrUI.sliderRow.minusTarget, vrUI.sliderRow.plusTarget);

vrUI.lorentzRow = createVRToggleRow('Lorentz transform', lorentzToggle.checked);
vrUI.lorentzRow.row.position.set(0, 0.06, 0.03);
vrUI.panel.add(vrUI.lorentzRow.row);
vrUI.lorentzRow.hitTarget.userData.kind = 'lorentz-toggle';
vrUI.interactables.push(vrUI.lorentzRow.hitTarget);

vrUI.aberrationRow = createVRToggleRow('Aberration', aberrationToggle.checked);
vrUI.aberrationRow.row.position.set(0, -0.34, 0.03);
vrUI.panel.add(vrUI.aberrationRow.row);
vrUI.aberrationRow.hitTarget.userData.kind = 'aberration-toggle';
vrUI.interactables.push(vrUI.aberrationRow.hitTarget);

const vrHelp1 = createTextPlane({ width: 3.0, height: 0.18, text: 'Turn your hand/controller palm up to open the menu', font: '70px Arial', color: '#c9d9eb', align: 'left' });
vrHelp1.position.set(-1.45, -0.78, 0.03);
vrUI.panel.add(vrHelp1);

const vrHelp2 = createTextPlane({ width: 3.0, height: 0.18, text: 'Left stick: move, right stick: turn + vertical fly', font: '70px Arial', color: '#c9d9eb', align: 'left' });
vrHelp2.position.set(-1.45, -1.02, 0.03);
vrUI.panel.add(vrHelp2);

vrUI.panel.position.set(6.2, 1.45, 0);
vrUI.panel.lookAt(new THREE.Vector3(0, 1.1, 0));

const keys = new Set();
let pointerLocked = false;
let yaw = 0;
let pitch = 0;

renderer.domElement.addEventListener('click', () => {
  if (!renderer.xr.isPresenting) renderer.domElement.requestPointerLock();
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

document.addEventListener('keydown', (e) => keys.add(e.code));
document.addEventListener('keyup', (e) => keys.delete(e.code));

function setBeta(nextValue) {
  const v = THREE.MathUtils.clamp(nextValue, 0, 0.95);
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

betaSlider.addEventListener('input', () => {
  setBeta(parseFloat(betaSlider.value));
});

lorentzToggle.addEventListener('change', () => {
  setLorentzEnabled(lorentzToggle.checked);
});

aberrationToggle.addEventListener('change', () => {
  setAberrationEnabled(aberrationToggle.checked);
});

setBeta(parseFloat(betaSlider.value));
setLorentzEnabled(lorentzToggle.checked);
setAberrationEnabled(aberrationToggle.checked);

function moveDesktop(dt) {
  if (renderer.xr.isPresenting) return;

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
  }
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
  }
}

const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();
const tempOrigin = new THREE.Vector3();
const tempDirection = new THREE.Vector3();
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
  });

  controller.addEventListener('selectstart', () => {
    controller.userData.selecting = true;
    if (controller.userData.hovered) {
      activateVRUI(controller.userData.hovered, controller.userData.intersection);
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
  for (const obj of vrUI.interactables) {
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
    case 'slider':
      if (intersection && intersection.uv) {
        const next = THREE.MathUtils.clamp(intersection.uv.x * 0.95, 0, 0.95);
        setBeta(next);
      }
      break;
    default:
      break;
  }
}

function getPalmUpPose(source, xrFrame, referenceSpace) {
  const worldUp = new THREE.Vector3(0, 1, 0);

  if (source.hand) {
    const wristJoint = source.hand.get('wrist');
    const indexJoint = source.hand.get('index-finger-metacarpal');
    const pinkyJoint = source.hand.get('pinky-finger-metacarpal');

    if (wristJoint && indexJoint && pinkyJoint) {
      const wristPose = xrFrame.getJointPose(wristJoint, referenceSpace);
      const indexPose = xrFrame.getJointPose(indexJoint, referenceSpace);
      const pinkyPose = xrFrame.getJointPose(pinkyJoint, referenceSpace);
      if (wristPose && indexPose && pinkyPose) {
        const pW = new THREE.Vector3().fromArray(wristPose.transform.position);
        const pI = new THREE.Vector3().fromArray(indexPose.transform.position);
        const pP = new THREE.Vector3().fromArray(pinkyPose.transform.position);
        const v1 = pI.clone().sub(pW);
        const v2 = pP.clone().sub(pW);
        const up1 = v1.cross(v2).normalize();
        const up2 = v2.cross(v1).normalize();
        const dot = Math.max(up1.dot(worldUp), up2.dot(worldUp));
        if (dot > 0.6) {
          return {
            position: pW,
            orientation: new THREE.Quaternion().fromArray(wristPose.transform.orientation)
          };
        }
      }
    }
  }

  if (source.gripSpace) {
    const gripPose = xrFrame.getPose(source.gripSpace, referenceSpace);
    if (gripPose) {
      const orientation = new THREE.Quaternion().fromArray(gripPose.transform.orientation);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(orientation).normalize();
      if (up.dot(worldUp) > 0.75) {
        return {
          position: new THREE.Vector3().fromArray(gripPose.transform.position),
          orientation
        };
      }
    }
  }

  return null;
}

function updateVRMenuPose(xrFrame) {
  const session = renderer.xr.getSession();
  if (!session || !xrFrame) {
    vrUI.panel.visible = false;
    return;
  }

  const refSpace = renderer.xr.getReferenceSpace();
  let palmPose = null;

  for (const source of session.inputSources) {
    const pose = getPalmUpPose(source, xrFrame, refSpace);
    if (pose) {
      palmPose = pose;
      break;
    }
  }

  if (!palmPose) {
    vrUI.panel.visible = false;
    return;
  }

  vrUI.panel.position.copy(palmPose.position).add(new THREE.Vector3(0, 0.12, -0.24).applyQuaternion(palmPose.orientation));
  vrUI.panel.lookAt(camera.getWorldPosition(new THREE.Vector3()));
  const euler = new THREE.Euler().setFromQuaternion(vrUI.panel.quaternion, 'YXZ');
  euler.x = 0;
  euler.z = 0;
  vrUI.panel.quaternion.setFromEuler(euler);
  vrUI.panel.visible = true;
}

function updateVRUIInteraction() {
  if (!renderer.xr.isPresenting || !vrUI.panel.visible) {
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

    const hits = raycaster.intersectObjects(vrUI.interactables, false);
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
});

renderer.xr.addEventListener('sessionstart', () => {
  if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
  desktopPanel.classList.add('hidden');
  vrUI.panel.visible = false;
});

renderer.xr.addEventListener('sessionend', () => {
  desktopPanel.classList.remove('hidden');
  vrUI.panel.visible = false;
  setVRHoverStates(new Set());
});

const clock = new THREE.Clock();

renderer.setAnimationLoop((time, xrFrame) => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  moveDesktop(dt);
  moveVR(dt);
  updateVRMenuPose(xrFrame);
  updateVRUIInteraction();

  const inverseQuat = new THREE.Quaternion();
  const localMotionDir = new THREE.Vector3();

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

    m.position.y = item.laneY + 0.35 * Math.sin(elapsed * 0.9 + item.offset);
    m.rotation.y += item.spinY * dt;
    m.rotation.z += item.spinZ * dt;

    inverseQuat.copy(m.quaternion).invert();
    localMotionDir.copy(sharedUniforms.uWorldMotionDir.value).applyQuaternion(inverseQuat).normalize();
    if (m.material.uniforms) {
      m.material.uniforms.uLocalMotionDir.value.copy(localMotionDir);
    }
  }

  renderer.render(scene, camera);
});
