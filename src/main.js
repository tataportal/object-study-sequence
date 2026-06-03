const assetVersion = "intro-screen-1";

const sequences = [
  { dir: "001_face_jpg", count: 120, mode: "loop", interaction: "drag" },
  { dir: "003_concept6_jpg", count: 72, mode: "bounce", interaction: "pinch" },
  { dir: "002_habit_jpg", count: 120, mode: "bounce", interaction: "drag" },
  null,
];

const experience = document.querySelector("#experience");
const intro = document.querySelector(".intro");
const artworks = [...document.querySelectorAll(".artwork")].map((node, index) => ({
  node,
  card: node.querySelector(".art-card"),
  image: node.querySelector(".sequence-frame"),
  glow: node.querySelector(".sequence-glow"),
  sequence: index in sequences ? sequences[index] : sequences[0],
  frame: 0,
  velocity: 0,
}));
const slides = [intro, ...artworks.map((artwork) => artwork.node)];

let activeIndex = 0;
let pointer = null;
const activePointers = new Map();
let verticalLock = false;
let verticalDrag = 0;

function getActiveArtwork() {
  return artworks[activeIndex - 1] || null;
}

function clampSlideIndex(index) {
  return Math.max(0, Math.min(slides.length - 1, index));
}

function framePath(sequence, frame) {
  return `./${sequence.dir}/${String(frame + 1).padStart(4, "0")}.jpg?v=${assetVersion}`;
}

function normalizeFrame(artwork) {
  if (!artwork.sequence) return;

  const { count, mode } = artwork.sequence;
  const max = count - 1;

  if (mode !== "bounce") {
    artwork.frame = ((artwork.frame % count) + count) % count;
    return;
  }

  if (max <= 0) {
    artwork.frame = 0;
    artwork.velocity = 0;
    return;
  }

  while (artwork.frame > max || artwork.frame < 0) {
    if (artwork.frame > max) {
      artwork.frame = max - (artwork.frame - max);
      artwork.velocity *= -0.82;
    }

    if (artwork.frame < 0) {
      artwork.frame = -artwork.frame;
      artwork.velocity *= -0.82;
    }
  }
}

function renderArtwork(artwork) {
  if (!artwork.sequence || !artwork.image || !artwork.glow) return;

  normalizeFrame(artwork);
  const index = Math.max(0, Math.min(artwork.sequence.count - 1, Math.round(artwork.frame)));
  const src = framePath(artwork.sequence, index);
  artwork.image.src = src;
  artwork.glow.src = src;
}

function applyPost(artwork) {
  if (!artwork.sequence) return;

  const speed = Math.min(Math.abs(artwork.velocity) / 18, 1);
  const shift = Math.max(-5, Math.min(5, artwork.velocity * 0.18));
  artwork.card.style.setProperty("--bloom", String(0.1 + speed * 0.18));
  artwork.card.style.setProperty("--motion-blur", `${speed * 1.2}px`);
  artwork.card.style.setProperty("--motion-shift", `${shift}px`);
}

function applyFrameInput(artwork, frameDelta, velocity) {
  if (!artwork.sequence) return;

  if (artwork.sequence.mode !== "bounce") {
    artwork.frame += frameDelta;
    artwork.velocity = velocity;
    return;
  }

  const max = artwork.sequence.count - 1;
  const nextFrame = artwork.frame + frameDelta;

  if (nextFrame < 0) {
    artwork.frame = 0;
    artwork.velocity = velocity < 0 ? 0 : velocity;
    return;
  }

  if (nextFrame > max) {
    artwork.frame = max;
    artwork.velocity = velocity > 0 ? velocity : 0;
    return;
  }

  artwork.frame = nextFrame;
  artwork.velocity = velocity;
}

function dragArtworkFrame(artwork, dx) {
  applyFrameInput(artwork, dx * 0.22, dx * 0.18);
}

function pinchArtworkFrame(artwork, distanceDelta) {
  applyFrameInput(artwork, distanceDelta * 0.3, distanceDelta * 0.24);
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function activeCardPointers(artwork) {
  return [...activePointers.values()].filter((point) => artwork.card.contains(point.target));
}

function startPinchIfReady(artwork) {
  if (!artwork.sequence) return false;
  if (artwork.sequence.interaction !== "pinch") return false;

  const cardPointers = activeCardPointers(artwork);
  if (cardPointers.length < 2) return false;

  const [first, second] = cardPointers;
  pointer = {
    id: first.id,
    x: first.x,
    y: first.y,
    lastX: first.x,
    lastY: first.y,
    mode: "pinch",
    horizontalAllowed: true,
    pinchIds: [first.id, second.id],
    lastDistance: distanceBetween(first, second),
  };
  verticalLock = false;
  artwork.velocity = 0;
  return true;
}

function jumpToClockFrame(artwork, clientX, clientY) {
  if (!artwork.sequence) return;

  const rect = artwork.card.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = clientX - centerX;
  const dy = clientY - centerY;

  if (Math.hypot(dx, dy) < Math.min(rect.width, rect.height) * 0.12) return;

  const rawAngle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
  const angle = (Math.PI * 2 - rawAngle) % (Math.PI * 2);
  const hourSlot = Math.round((angle / (Math.PI * 2)) * 12) % 12;
  artwork.frame = (hourSlot / 12) * artwork.sequence.count;
  artwork.velocity = 0;
  renderArtwork(artwork);
  applyPost(artwork);
}

function setActiveArtwork(nextIndex) {
  activeIndex = clampSlideIndex(nextIndex);
  verticalDrag = 0;
  intro.classList.toggle("is-active", activeIndex === 0);
  intro.classList.remove("is-adjacent", "is-dragging");
  intro.style.removeProperty("--feed-y");
  intro.style.removeProperty("--feed-scale");
  intro.style.removeProperty("--feed-opacity");
  artworks.forEach((artwork, index) => {
    artwork.node.classList.toggle("is-active", index + 1 === activeIndex);
    artwork.node.classList.remove("is-adjacent", "is-dragging");
    artwork.node.style.removeProperty("--feed-y");
    artwork.node.style.removeProperty("--feed-scale");
    artwork.node.style.removeProperty("--feed-opacity");
  });
}

function resetVerticalPreview() {
  slides.forEach((slide, index) => {
    if (index === activeIndex) return;
    slide.classList.remove("is-adjacent", "is-dragging");
    slide.style.removeProperty("--feed-y");
    slide.style.removeProperty("--feed-scale");
    slide.style.removeProperty("--feed-opacity");
  });
  const active = slides[activeIndex];
  active.classList.remove("is-dragging");
  active.style.removeProperty("--feed-y");
  active.style.removeProperty("--feed-scale");
  active.style.removeProperty("--feed-opacity");
}

function previewVerticalDrag(totalY) {
  const viewport = Math.max(window.innerHeight, 1);
  const progress = Math.max(-1, Math.min(1, totalY / viewport));
  const direction = totalY < 0 ? 1 : -1;
  const nextIndex = clampSlideIndex(activeIndex + direction);
  const active = slides[activeIndex];
  const next = slides[nextIndex];
  const absProgress = Math.abs(progress);

  if (nextIndex === activeIndex) {
    const resistance = progress * 18;
    active.classList.add("is-dragging");
    active.style.setProperty("--feed-y", `${resistance}%`);
    active.style.setProperty("--feed-scale", String(1 - absProgress * 0.018));
    active.style.setProperty("--feed-opacity", "1");
    return;
  }

  slides.forEach((slide, index) => {
    if (index !== activeIndex && index !== nextIndex) {
      slide.classList.remove("is-adjacent", "is-dragging");
      slide.style.setProperty("--feed-opacity", "0");
      slide.style.setProperty("--feed-y", `${direction * 100}%`);
    }
  });

  active.classList.add("is-dragging");
  active.style.setProperty("--feed-y", `${progress * 82}%`);
  active.style.setProperty("--feed-scale", String(1 - absProgress * 0.035));
  active.style.setProperty("--feed-opacity", String(1 - absProgress * 0.38));

  next.classList.add("is-adjacent", "is-dragging");
  next.style.setProperty("--feed-y", `${direction * 82 + progress * 82}%`);
  next.style.setProperty("--feed-scale", String(0.985 + absProgress * 0.015));
  next.style.setProperty("--feed-opacity", String(0.18 + absProgress * 0.82));
}

function preloadFrames() {
  sequences.forEach((sequence) => {
    if (!sequence) return;

    Array.from({ length: sequence.count }, (_, index) => {
      const image = new Image();
      image.src = framePath(sequence, index);
      return image;
    });
  });
}

function onPointerDown(event) {
  const artwork = getActiveArtwork();

  activePointers.set(event.pointerId, {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    target: event.target,
  });

  if (artwork && startPinchIfReady(artwork)) return;
  if (pointer) return;

  pointer = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    mode: null,
    horizontalAllowed: artwork ? artwork.card.contains(event.target) : false,
  };
  verticalLock = false;
  if (artwork) artwork.velocity = 0;
}

function onPointerMove(event) {
  const tracked = activePointers.get(event.pointerId);
  if (tracked) {
    tracked.x = event.clientX;
    tracked.y = event.clientY;
  }

  if (!pointer) return;

  const artwork = getActiveArtwork();

  if (artwork && pointer.mode === "pinch") {
    const [firstId, secondId] = pointer.pinchIds;
    const first = activePointers.get(firstId);
    const second = activePointers.get(secondId);
    if (!first || !second) return;

    const distance = distanceBetween(first, second);
    const distanceDelta = distance - pointer.lastDistance;
    pointer.lastDistance = distance;

    pinchArtworkFrame(artwork, distanceDelta);
    renderArtwork(artwork);
    applyPost(artwork);
    return;
  }

  if (pointer.id !== event.pointerId) return;

  const dx = event.clientX - pointer.lastX;
  const dy = event.clientY - pointer.lastY;
  const totalX = event.clientX - pointer.x;
  const totalY = event.clientY - pointer.y;
  pointer.lastX = event.clientX;
  pointer.lastY = event.clientY;

  if (!pointer.mode && Math.hypot(totalX, totalY) > 8) {
    pointer.mode = Math.abs(totalX) > Math.abs(totalY) ? "horizontal" : "vertical";
  }

  if (
    artwork &&
    artwork.sequence &&
    pointer.mode === "horizontal" &&
    pointer.horizontalAllowed &&
    artwork.sequence.interaction !== "pinch"
  ) {
    dragArtworkFrame(artwork, dx);
    renderArtwork(artwork);
    applyPost(artwork);
  }

  if (pointer.mode === "vertical") {
    verticalLock = true;
    verticalDrag = totalY;
    previewVerticalDrag(totalY);
  }
}

function onPointerUp(event) {
  activePointers.delete(event.pointerId);

  if (!pointer) return;

  if (pointer.mode === "pinch") {
    pointer = null;
    verticalLock = false;
    verticalDrag = 0;
    resetVerticalPreview();
    return;
  }

  if (pointer.id !== event.pointerId) return;

  const totalX = event.clientX - pointer.x;
  const totalY = event.clientY - pointer.y;

  if (verticalLock && Math.abs(totalY) > 54 && Math.abs(totalY) > Math.abs(totalX) * 1.15) {
    setActiveArtwork(totalY < 0 ? activeIndex + 1 : activeIndex - 1);
  } else if (
    getActiveArtwork() &&
    getActiveArtwork().sequence &&
    pointer.horizontalAllowed &&
    getActiveArtwork().sequence.interaction !== "pinch" &&
    Math.hypot(totalX, totalY) < 10 &&
    pointer.mode !== "horizontal" &&
    pointer.mode !== "vertical"
  ) {
    jumpToClockFrame(getActiveArtwork(), event.clientX, event.clientY);
  }

  pointer = null;
  verticalLock = false;
  verticalDrag = 0;
  resetVerticalPreview();
}

function animate() {
  const artwork = getActiveArtwork();
  if (!artwork || !artwork.sequence) {
    requestAnimationFrame(animate);
    return;
  }
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
