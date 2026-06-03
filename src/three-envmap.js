import * as THREE from "three";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const stages = [...document.querySelectorAll(".three-stage")];
const exrUrl = "./004_Grau/piz_compressed.exr";

if (!stages.length) throw new Error("Missing Three.js stage element.");

window.__threeEnvmapState = [];

stages.forEach((stage, index) => createViewer(stage, index));

function createViewer(stage, index) {
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

  const planeMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  planeMesh.position.y = -50;
  planeMesh.rotation.x = -Math.PI * 0.5;
  scene.add(planeMesh);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const modelDrag = {
    active: false,
    pointerId: null,
    lastX: 0,
    lastY: 0,
    velocityX: 0,
    velocityY: 0,
  };
  const state = {
    envLoaded: false,
    exrUrl,
    modelLoaded: false,
    modelUrl: stage.dataset.model || null,
    type: stage.dataset.model ? "gltf" : "torus",
  };
  window.__threeEnvmapState[index] = state;

  let objectRoot = stage.dataset.model ? new THREE.Group() : createTorus();
  let exrCubeRenderTarget = null;
  scene.add(objectRoot);

  new EXRLoader().load(exrUrl, (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    exrCubeRenderTarget = pmremGenerator.fromEquirectangular(texture);
    scene.environment = exrCubeRenderTarget.texture;
    state.envLoaded = true;
    applyEnvironmentToObject(objectRoot, exrCubeRenderTarget.texture);
    texture.dispose();
    pmremGenerator.dispose();
  }, undefined, (error) => {
    state.envError = error.message;
  });

  if (stage.dataset.model) {
    new GLTFLoader().load(stage.dataset.model, (gltf) => {
      scene.remove(objectRoot);
      objectRoot = gltf.scene;
      prepareModel(objectRoot);
      centerObject(objectRoot, 72);
      if (exrCubeRenderTarget) applyEnvironmentToObject(objectRoot, exrCubeRenderTarget.texture);
      scene.add(objectRoot);
      state.modelLoaded = true;
    }, undefined, (error) => {
      state.modelError = error.message;
    });
  } else {
    state.modelLoaded = true;
  }

  function resize() {
    const width = stage.clientWidth || window.innerWidth;
    const height = stage.clientHeight || window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  function pointerHitsObject(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera(pointerNdc, camera);
    return raycaster.intersectObject(objectRoot, true).length > 0;
  }

  function onModelPointerDown(event) {
    if (!pointerHitsObject(event)) return;

    event.preventDefault();
    event.stopPropagation();
    renderer.domElement.setPointerCapture(event.pointerId);
    modelDrag.active = true;
    modelDrag.pointerId = event.pointerId;
    modelDrag.lastX = event.clientX;
    modelDrag.lastY = event.clientY;
    modelDrag.velocityX = 0;
    modelDrag.velocityY = 0;
  }

  function onModelPointerMove(event) {
    if (!modelDrag.active || modelDrag.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    const dx = event.clientX - modelDrag.lastX;
    const dy = event.clientY - modelDrag.lastY;
    modelDrag.lastX = event.clientX;
    modelDrag.lastY = event.clientY;
    modelDrag.velocityY = dx * 0.008;
    modelDrag.velocityX = dy * 0.008;
    objectRoot.rotation.y += modelDrag.velocityY;
    objectRoot.rotation.x += modelDrag.velocityX;
  }

  function onModelPointerUp(event) {
    if (!modelDrag.active || modelDrag.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    renderer.domElement.releasePointerCapture(event.pointerId);
    modelDrag.active = false;
    modelDrag.pointerId = null;
  }

  function render() {
    if (!modelDrag.active) {
      objectRoot.rotation.y += 0.003 + modelDrag.velocityY;
      objectRoot.rotation.x += modelDrag.velocityX;
      modelDrag.velocityY *= 0.94;
      modelDrag.velocityX *= 0.94;
    }

    renderer.render(scene, camera);
  }

  resize();
  renderer.setAnimationLoop(render);
  window.addEventListener("resize", resize);
  renderer.domElement.addEventListener("pointerdown", onModelPointerDown);
  renderer.domElement.addEventListener("pointermove", onModelPointerMove);
  renderer.domElement.addEventListener("pointerup", onModelPointerUp);
  renderer.domElement.addEventListener("pointercancel", onModelPointerUp);
}

function createTorus() {
  const geometry = new THREE.TorusKnotGeometry(18, 8, 420, 56);
  geometry.computeVertexNormals();
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.04,
      envMapIntensity: 1.15,
    }),
  );
}

function prepareModel(root) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    node.geometry.computeVertexNormals();
    if (node.material) {
      node.material.envMapIntensity = 1.25;
      node.material.roughness = Math.max(node.material.roughness ?? 0.18, 0.08);
      node.material.needsUpdate = true;
    }
  });
}

function centerObject(root, targetSize) {
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxAxis = Math.max(size.x, size.y, size.z);

  root.position.sub(center);
  if (maxAxis > 0) root.scale.setScalar(targetSize / maxAxis);
}

function applyEnvironmentToObject(root, envMap) {
  root.traverse((node) => {
    if (!node.isMesh || !node.material) return;
    node.material.envMap = envMap;
    node.material.needsUpdate = true;
  });
}
