import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";

const stage = document.querySelector("#three-stage") || document.querySelector("#stage");
const exrUrl = "./004_Grau/piz_compressed.exr";

if (!stage) throw new Error("Missing Three.js stage element.");

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.add(new THREE.HemisphereLight(0xffffff, 0x080808, 0.65));

const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
keyLight.position.set(2, 3, 5);
scene.add(keyLight);

const camera = new THREE.PerspectiveCamera(40, stage.clientWidth / stage.clientHeight, 1, 1000);
camera.position.set(0, 0, 120);

const torusGeometry = new THREE.TorusKnotGeometry(18, 8, 420, 56);
torusGeometry.computeVertexNormals();

const torusMesh = new THREE.Mesh(
  torusGeometry,
  new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.04,
    envMapIntensity: 1.15,
  }),
);
scene.add(torusMesh);

const planeMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshBasicMaterial({ visible: false }),
);
planeMesh.position.y = -50;
planeMesh.rotation.x = -Math.PI * 0.5;
scene.add(planeMesh);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 50;
controls.maxDistance = 300;

const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

let exrCubeRenderTarget = null;
window.__threeEnvmapState = { envLoaded: false, exrUrl };

new EXRLoader().load(exrUrl, (texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  exrCubeRenderTarget = pmremGenerator.fromEquirectangular(texture);
  scene.environment = exrCubeRenderTarget.texture;
  window.__threeEnvmapState.envLoaded = true;
  texture.dispose();
  pmremGenerator.dispose();
}, undefined, (error) => {
  window.__threeEnvmapState.envError = error.message;
});

function resize() {
  const width = stage.clientWidth || window.innerWidth;
  const height = stage.clientHeight || window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function render() {
  if (exrCubeRenderTarget && torusMesh.material.envMap !== exrCubeRenderTarget.texture) {
    torusMesh.material.envMap = exrCubeRenderTarget.texture;
    torusMesh.material.needsUpdate = true;
    planeMesh.material.map = exrCubeRenderTarget.texture;
    planeMesh.material.needsUpdate = true;
  }

  torusMesh.rotation.y += 0.005;
  controls.update();
  renderer.render(scene, camera);
}

resize();
renderer.setAnimationLoop(render);
window.addEventListener("resize", resize);
