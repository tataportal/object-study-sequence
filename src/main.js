const frameCount = 120;
const framePaths = Array.from({ length: frameCount }, (_, index) => {
  const frame = String(index + 1).padStart(4, "0");
  return `./001_face_jpg/${frame}.jpg`;
});

const experience = document.querySelector("#experience");
const artworks = [...document.querySelectorAll(".artwork")].map((node) => ({
  node,
  card: node.querySelector(".art-card"),
  image: node.querySelector(".sequence-frame"),
  glow: node.querySelector(".sequence-glow"),
  frame: 0,
  velocity: 0,
}));

let activeIndex = 0;
let pointer = null;
let verticalLock = false;

function wrapFrame(value) {
  return ((Math.round(value) % frameCount) + frameCount) % frameCount;
}

function renderArtwork(artwork) {
  const src = framePaths[wrapFrame(artwork.frame)];
  artwork.image.src = src;
  artwork.glow.src = src;
}

function applyPost(artwork) {
  const speed = Math.min(Math.abs(artwork.velocity) / 18, 1);
  const shift = Math.max(-5, Math.min(5, artwork.velocity * 0.18));
  artwork.card.style.setProperty("--bloom", String(0.1 + speed * 0.18));
  artwork.card.style.setProperty("--motion-blur", `${speed * 1.2}px`);
  artwork.card.style.setProperty("--motion-shift", `${shift}px`);
}

function setActiveArtwork(nextIndex) {
  activeIndex = ((nextIndex % artworks.length) + artworks.length) % artworks.length;
  artworks.forEach((artwork, index) => {
    artwork.node.classList.toggle("is-active", index === activeIndex);
  });
}

function preloadFrames() {
  framePaths.forEach((src) => {
    const image = new Image();
    image.src = src;
  });
}

function onPointerDown(event) {
  const artwork = artworks[activeIndex];

  experience.setPointerCapture(event.pointerId);
  pointer = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    mode: null,
    horizontalAllowed: artwork.card.contains(event.target),
  };
  verticalLock = false;
  artwork.velocity = 0;
}

function onPointerMove(event) {
  if (!pointer || pointer.id !== event.pointerId) return;

  const artwork = artworks[activeIndex];
  const dx = event.clientX - pointer.lastX;
  const dy = event.clientY - pointer.lastY;
  const totalX = event.clientX - pointer.x;
  const totalY = event.clientY - pointer.y;
  pointer.lastX = event.clientX;
  pointer.lastY = event.clientY;

  if (!pointer.mode && Math.hypot(totalX, totalY) > 8) {
    pointer.mode = Math.abs(totalX) > Math.abs(totalY) ? "horizontal" : "vertical";
  }

  if (pointer.mode === "horizontal" && pointer.horizontalAllowed) {
    artwork.frame += dx * 0.22;
    artwork.velocity = dx * 0.18;
    renderArtwork(artwork);
    applyPost(artwork);
  }

  if (pointer.mode === "vertical") {
    verticalLock = true;
  }
}

function onPointerUp(event) {
  if (!pointer || pointer.id !== event.pointerId) return;

  const totalX = event.clientX - pointer.x;
  const totalY = event.clientY - pointer.y;

  if (verticalLock && Math.abs(totalY) > 54 && Math.abs(totalY) > Math.abs(totalX) * 1.15) {
    setActiveArtwork(totalY > 0 ? activeIndex + 1 : activeIndex - 1);
  }

  pointer = null;
  verticalLock = false;
}

function animate() {
  const artwork = artworks[activeIndex];
  if (!pointer && Math.abs(artwork.velocity) > 0.01) {
    artwork.frame += artwork.velocity;
    artwork.velocity *= 0.93;
    renderArtwork(artwork);
    applyPost(artwork);
  } else if (!pointer) {
    artwork.velocity = 0;
    applyPost(artwork);
  }

  requestAnimationFrame(animate);
}

artworks.forEach((artwork) => {
  renderArtwork(artwork);
});

experience.addEventListener("pointerdown", onPointerDown);
experience.addEventListener("pointermove", onPointerMove);
experience.addEventListener("pointerup", onPointerUp);
experience.addEventListener("pointercancel", onPointerUp);

preloadFrames();
setActiveArtwork(0);
animate();
