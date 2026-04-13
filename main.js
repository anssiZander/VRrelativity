import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const container = document.getElementById('app');
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

const grid = new THREE.GridHelper(160, 80, 0x446688, 0x223344);
grid.position.y = -4;
scene.add(grid);

const axes = new THREE.AxesHelper(4);
axes.position.set(0, -3.99, 0);
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

const observerCube = new THREE.Mesh(
  new THREE.BoxGeometry(3, 3, 3),
  new THREE.MeshStandardMaterial({ color: 0x3d9cff, roughness: 0.35, metalness: 0.05 })
);
observerCube.position.set(0, 0, 0);
scene.add(observerCube);

const observerWire = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(3.04, 3.04, 3.04)),
  new THREE.LineBasicMaterial({ color: 0xd8ecff })
);
observerCube.add(observerWire);

const observerMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.14, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xffffff })
);
observerMarker.position.set(0, 0, 0);
scene.add(observerMarker);

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

    // Motion is defined in world space. To apply Lorentz contraction correctly
    // to a rotated mesh, pull the world motion direction back into the mesh's
    // local space first, then contract along that local axis, and only then
    // rotate/translate the vertex with modelMatrix.
    vec3 worldDir = normalize(uWorldMotionDir);
    mat3 model3 = mat3(modelMatrix);
    vec3 localMotionDir = normalize(transpose(model3) * worldDir);

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

    // Aberration/retarded-position shift is applied last in world space.
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
    gl_FragColor = vec4(color, 1.0);
  }
`;

function makeRelativisticMaterial(colorHex) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uObserverPos: sharedUniforms.uObserverPos,
      uWorldMotionDir: sharedUniforms.uWorldMotionDir,
      uBeta: sharedUniforms.uBeta,
      uSpeed: sharedUniforms.uSpeed,
      uLorentzEnabled: sharedUniforms.uLorentzEnabled,
      uAberrationEnabled: sharedUniforms.uAberrationEnabled,
      uColor: { value: new THREE.Color(colorHex) }
    },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide
  });
}

function createMovingMesh(kind, colorHex) {
  let geometry;
  if (kind === 'sphere') {
    geometry = new THREE.SphereGeometry(1.25, 30, 20);
  } else if (kind === 'box') {
    geometry = new THREE.BoxGeometry(2.1, 2.1, 2.1, 3, 3, 3);
  } else {
    geometry = new THREE.CapsuleGeometry(0.8, 1.8, 10, 18);
  }

  const mesh = new THREE.Mesh(geometry, makeRelativisticMaterial(colorHex));
  mesh.frustumCulled = false;
  return mesh;
}

const movers = [];
const palette = [0xff8f6b, 0xf2c94c, 0x8be28b, 0x9b8cff, 0x60d5ff, 0xff6ad5];
const types = ['box', 'sphere', 'capsule', 'sphere', 'box', 'capsule', 'sphere', 'box'];

for (let i = 0; i < 8; i++) {
  const mesh = createMovingMesh(types[i % types.length], palette[i % palette.length]);
  mesh.position.set(-40 - i * 9.5, -1.5 + (i % 4) * 2.2, -8 + (i % 5) * 4.0);
  scene.add(mesh);
  movers.push({
    mesh,
    spinY: (Math.random() - 0.5) * 0.6,
    spinZ: (Math.random() - 0.5) * 0.45,
    laneY: mesh.position.y,
    laneZ: mesh.position.z,
    offset: Math.random() * Math.PI * 2
  });
}

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

betaSlider.addEventListener('input', () => {
  const v = parseFloat(betaSlider.value);
  sharedUniforms.uBeta.value = v;
  betaValue.textContent = v.toFixed(2);
});

lorentzToggle.addEventListener('change', () => {
  sharedUniforms.uLorentzEnabled.value = lorentzToggle.checked ? 1 : 0;
});

aberrationToggle.addEventListener('change', () => {
  sharedUniforms.uAberrationEnabled.value = aberrationToggle.checked ? 1 : 0;
});

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
  return {
    x: gamepad.axes[gamepad.axes.length - 2] || 0,
    y: gamepad.axes[gamepad.axes.length - 1] || 0
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
      rightY = applyDeadzone(stick.y);
    }
  }

  if (Math.abs(rightX) > 0) player.rotation.y -= rightX * 1.8 * dt;

  const cameraWorldQuat = new THREE.Quaternion();
  camera.getWorldQuaternion(cameraWorldQuat);

  const headForward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraWorldQuat).normalize();
  const headRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraWorldQuat).normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const move = new THREE.Vector3();
  move.addScaledVector(headRight, leftX);
  move.addScaledVector(headForward, -leftY);
  move.addScaledVector(worldUp, -rightY);

  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(4.8 * dt);
    player.position.add(move);
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.xr.addEventListener('sessionstart', () => {
  if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
});

const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  moveDesktop(dt);
  moveVR(dt);

  for (const item of movers) {
    const m = item.mesh;
    m.position.x += motionSpeed * dt;
    if (m.position.x > 42) {
      m.position.x = -46 - Math.random() * 12;
      item.laneY = -1.5 + Math.floor(Math.random() * 5) * 1.7;
      item.laneZ = -10 + Math.floor(Math.random() * 6) * 4.0;
      m.position.y = item.laneY;
      m.position.z = item.laneZ;
    }

    m.position.y = item.laneY + 0.35 * Math.sin(elapsed * 0.9 + item.offset);
    m.rotation.y += item.spinY * dt;
    m.rotation.z += item.spinZ * dt;
  }

  renderer.render(scene, camera);
});
