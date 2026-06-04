import * as THREE from "three";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const stages = [...document.querySelectorAll(".three-stage")];
const exrUrl = "./004_Grau/piz_compressed.exr";
const grauInitialYaw = -Math.PI / 4;
const grauTargetSize = 88;

if (!stages.length) throw new Error("Missing Three.js stage element.");

window.__threeEnvmapState = [];

stages.forEach((stage, index) => createViewer(stage, index));

function createViewer(stage, index) {
  const isGrau = stage.id === "three-stage-005";
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
    canvasActive: false,
    canvasCandidate: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    metalVelocity: 0,
    roughnessVelocity: 0,
    rotationXVelocity: 0,
    rotationYVelocity: 0,
  };
  const state = {
    envLoaded: false,
    exrUrl,
    modelLoaded: false,
    modelUrl: stage.dataset.model || null,
    type: stage.dataset.model ? "gltf" : "torus",
    metalness: stage.dataset.model ? 0 : 0,
    roughness: stage.dataset.model ? 0.18 : 0.04,
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
      if (isGrau) objectRoot.rotation.y = grauInitialYaw;
      centerObject(objectRoot, isGrau ? grauTargetSize : 46, isGrau);
      if (exrCubeRenderTarget) applyEnvironmentToObject(objectRoot, exrCubeRenderTarget.texture);
      applyMaterialState(objectRoot, state);
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
    if (raycaster.intersectObject(objectRoot, true).length > 0) return true;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = Math.abs(event.clientX - centerX) / rect.width;
    const dy = Math.abs(event.clientY - centerY) / rect.height;
    return state.type === "gltf" && dx < 0.34 && dy < 0.38;
  }

  function onModelPointerDown(event) {
    const hitsObject = pointerHitsObject(event);

    if (!hitsObject && isGrau) {
      modelDrag.canvasCandidate = true;
      modelDrag.pointerId = event.pointerId;
      modelDrag.startX = event.clientX;
      modelDrag.startY = event.clientY;
      modelDrag.lastX = event.clientX;
      modelDrag.lastY = event.clientY;
      return;
    }

    if (!hitsObject) return;

    event.preventDefault();
    event.stopPropagation();
    modelDrag.active = true;
    modelDrag.canvasActive = false;
    modelDrag.canvasCandidate = false;
    modelDrag.pointerId = event.pointerId;
    modelDrag.startX = event.clientX;
    modelDrag.startY = event.clientY;
    modelDrag.lastX = event.clientX;
    modelDrag.lastY = event.clientY;
    modelDrag.metalVelocity = 0;
    modelDrag.roughnessVelocity = 0;
    modelDrag.rotationXVelocity = 0;
    modelDrag.rotationYVelocity = 0;
    try {
      stage.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic test events do not always register as active pointers.
    }
  }

  function onModelPointerMove(event) {
    if (isGrau && modelDrag.canvasCandidate && modelDrag.pointerId === event.pointerId) {
      const totalX = event.clientX - modelDrag.startX;
      const totalY = event.clientY - modelDrag.startY;

      if (!modelDrag.canvasActive && Math.hypot(totalX, totalY) > 9) {
        if (Math.abs(totalX) > Math.abs(totalY) * 1.15) {
          modelDrag.canvasActive = true;
          event.preventDefault();
          event.stopPropagation();
        } else {
          modelDrag.canvasCandidate = false;
          return;
        }
      }

      if (modelDrag.canvasActive) {
        event.preventDefault();
        event.stopPropagation();
        const dx = event.clientX - modelDrag.lastX;
        modelDrag.lastX = event.clientX;
        modelDrag.lastY = event.clientY;
        modelDrag.rotationYVelocity = dx * 0.008;
        objectRoot.rotation.y += modelDrag.rotationYVelocity;
      }
      return;
    }

    if (!modelDrag.active || modelDrag.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    const dx = event.clientX - modelDrag.lastX;
    const dy = event.clientY - modelDrag.lastY;
    modelDrag.lastX = event.clientX;
    modelDrag.lastY = event.clientY;
    modelDrag.metalVelocity = dx * 0.0025;
    modelDrag.roughnessVelocity = -dy * 0.0025;
    if (!isGrau) {
      modelDrag.rotationYVelocity = dx * 0.006;
      modelDrag.rotationXVelocity = dy * 0.006;
      objectRoot.rotation.y += modelDrag.rotationYVelocity;
      objectRoot.rotation.x += modelDrag.rotationXVelocity;
    }
    updateMaterialState(modelDrag.metalVelocity, modelDrag.roughnessVelocity);
  }

  function onModelPointerUp(event) {
    if (isGrau && modelDrag.canvasCandidate && modelDrag.pointerId === event.pointerId) {
      modelDrag.canvasActive = false;
      modelDrag.canvasCandidate = false;
      modelDrag.pointerId = null;
      return;
    }

    if (!modelDrag.active || modelDrag.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    try {
      stage.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore release failures for synthetic or already-cancelled pointers.
    }
    modelDrag.active = false;
    modelDrag.canvasActive = false;
    modelDrag.canvasCandidate = false;
    modelDrag.pointerId = null;
  }

  function render() {
    if (!modelDrag.active) {
      if (!isGrau) objectRoot.rotation.y += 0.003;
      objectRoot.rotation.y += modelDrag.rotationYVelocity;
      objectRoot.rotation.x += modelDrag.rotationXVelocity;
      modelDrag.rotationYVelocity *= 0.9;
      modelDrag.rotationXVelocity *= 0.9;
      if (Math.abs(modelDrag.metalVelocity) > 0.0001 || Math.abs(modelDrag.roughnessVelocity) > 0.0001) {
        updateMaterialState(modelDrag.metalVelocity, modelDrag.roughnessVelocity);
        modelDrag.metalVelocity *= 0.9;
        modelDrag.roughnessVelocity *= 0.9;
      }
    }

    renderer.render(scene, camera);
  }

  function updateMaterialState(metalDelta, roughnessDelta) {
    state.metalness = THREE.MathUtils.clamp(state.metalness + metalDelta, 0, 1);
    state.roughness = THREE.MathUtils.clamp(state.roughness - roughnessDelta, 0.02, 0.75);
    applyMaterialState(objectRoot, state);
  }

  resize();
  renderer.setAnimationLoop(render);
  window.addEventListener("resize", resize);
  stage.addEventListener("pointerdown", onModelPointerDown, { capture: true });
  stage.addEventListener("pointermove", onModelPointerMove, { capture: true });
  stage.addEventListener("pointerup", onModelPointerUp, { capture: true });
  stage.addEventListener("pointercancel", onModelPointerUp, { capture: true });
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
      normalizeOpaqueMaterial(node.material);
    }
  });
}

function centerObject(root, targetSize, alignBottom = false) {
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxAxis = Math.max(size.x, size.y, size.z);

  if (maxAxis > 0) root.scale.setScalar(targetSize / maxAxis);

  const scaledBox = new THREE.Box3().setFromObject(root);
  const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
  root.position.sub(scaledCenter);

  if (alignBottom) {
    const viewportHeight = 2 * Math.tan(THREE.MathUtils.degToRad(40 / 2)) * 120;
    const bottomAlignedBox = new THREE.Box3().setFromObject(root);
    const targetBottom = -viewportHeight / 2 + 4;
    root.position.y += targetBottom - bottomAlignedBox.min.y;
  }
}

function applyEnvironmentToObject(root, envMap) {
  root.traverse((node) => {
    if (!node.isMesh || !node.material) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => {
      material.envMap = envMap;
      normalizeOpaqueMaterial(material);
    });
  });
}

function applyMaterialState(root, state) {
  root.traverse((node) => {
    if (!node.isMesh || !node.material) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => {
      material.metalness = state.metalness;
      material.roughness = state.roughness;
      normalizeOpaqueMaterial(material);
    });
  });
}

function normalizeOpaqueMaterial(material) {
  material.side = THREE.DoubleSide;
  material.transparent = false;
  material.opacity = 1;
  material.alphaMap = null;
  material.alphaTest = 0;
  material.depthWrite = true;
  material.depthTest = true;
  material.blending = THREE.NormalBlending;
  material.needsUpdate = true;
}
