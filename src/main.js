const assetVersion = "intro-screen-1";

const sequences = [
  { dir: "001_face_jpg", count: 120, mode: "loop", interaction: "drag" },
  { dir: "003_concept6_jpg", count: 72, mode: "bounce", interaction: "pinch" },
  { dir: "002_habit_jpg", count: 120, mode: "bounce", interaction: "drag" },
  null,
  null,
  { dir: "006_van_jpg", count: 120, mode: "bounce", interaction: "drag" },
];

const experience = document.querySelector("#experience");
const intro = document.querySelector(".intro");
const indexToggle = document.querySelector(".index-toggle");
const indexPanel = document.querySelector(".index-panel");
const indexViewToggle = document.querySelector(".index-view-toggle");
const indexClose = document.querySelector(".index-close");
const indexItems = [...document.querySelectorAll(".index-item")];
const fallCanvas = document.querySelector(".fall-canvas");
const artworks = [...document.querySelectorAll(".artwork")].map((node, index) => ({
  node,
  card: node.querySelector(".art-card"),
  image: node.querySelector(".sequence-frame"),
  glow: node.querySelector(".sequence-glow"),
  sequence: sequences[index] ?? null,
  frame: 0,
  velocity: 0,
}));
const slides = [intro, ...artworks.map((artwork) => artwork.node)];

let activeIndex = 0;
let pointer = null;
const activePointers = new Map();
let verticalLock = false;
let verticalDrag = 0;
let indexOpen = false;
let fallScene = null;
let fallHoldTimer = null;

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
  artwork.card.style.setProperty("--motion-blur", "0px");
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

function createFallScene(canvas) {
  const ctx = canvas.getContext("2d", { alpha: false });
  const pieces = [];
  const palette = [
    [242, 239, 226],
    [238, 238, 232],
    [218, 41, 28],
    [12, 74, 166],
    [244, 199, 36],
    [18, 18, 18],
  ];
  const state = {
    canvas,
    ctx,
    width: 0,
    height: 0,
    dpr: 1,
    emitting: false,
    pressX: 0,
    pressY: 0,
    emitCarry: 0,
  };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.width = Math.max(1, rect.width);
    state.height = Math.max(1, rect.height);
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }

  function addPiece(x, y, force = 1, fromTop = false) {
    const maxPieces = Math.min(420, Math.max(260, Math.floor((state.width * state.height) / 1500)));
    if (pieces.length >= maxPieces) return;

    const radius = 7 + Math.random() * 11;
    const color = palette[Math.floor(Math.random() * palette.length)];
    const blockWidth = radius * (0.9 + Math.random() * 2.4);
    const blockHeight = radius * (0.75 + Math.random() * 2);
    const spawnX = fromTop
      ? Math.random() > 0.35
        ? Math.random() * state.width
        : x + (Math.random() - 0.5) * state.width * 0.36
      : x + (Math.random() - 0.5) * 44;
    pieces.push({
      x: Math.max(radius, Math.min(state.width - radius, spawnX)),
      y: fromTop ? -radius * 2 : y - radius,
      vx: (Math.random() - 0.5) * 4.6 * force,
      vy: (0.4 + Math.random() * 2.2) * force,
      radius,
      width: blockWidth,
      height: blockHeight,
      color,
    });
  }

  function emit(delta) {
    if (!state.emitting) return;

    state.emitCarry += delta * 0.045;
    const count = Math.min(8, Math.floor(state.emitCarry));
    if (count <= 0) return;
    state.emitCarry -= count;

    for (let i = 0; i < count; i += 1) {
      addPiece(state.pressX || state.width / 2, state.pressY || state.height * 0.28, 1.1, true);
    }
  }

  function collidePieces() {
    for (let i = 0; i < pieces.length; i += 1) {
      for (let j = i + 1; j < pieces.length; j += 1) {
        const a = pieces[i];
        const b = pieces[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const overlapX = (a.width + b.width) / 2 - Math.abs(dx);
        const overlapY = (a.height + b.height) / 2 - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;

        if (overlapX < overlapY) {
          const direction = dx < 0 ? -1 : 1;
          a.x -= (overlapX / 2) * direction;
          b.x += (overlapX / 2) * direction;
          const bounce = (b.vx - a.vx) * 0.18;
          a.vx += bounce;
          b.vx -= bounce;
        } else {
          const direction = dy < 0 ? -1 : 1;
          a.y -= (overlapY / 2) * direction;
          b.y += (overlapY / 2) * direction;
          const bounce = (b.vy - a.vy) * 0.18;
          a.vy += bounce;
          b.vy -= bounce;
        }
      }
    }
  }

  function resolveBounds(piece) {
    const halfWidth = piece.width / 2;
    const halfHeight = piece.height / 2;
    const floor = state.height - 2;

    if (piece.x < halfWidth) {
      piece.x = halfWidth;
      piece.vx *= -0.48;
    } else if (piece.x > state.width - halfWidth) {
      piece.x = state.width - halfWidth;
      piece.vx *= -0.48;
    }

    if (piece.y > floor - halfHeight) {
      piece.y = floor - halfHeight;
      piece.vy *= -0.34;
      piece.vx *= 0.82;
    }
  }

  function step(delta) {
    const gravity = 0.00145 * delta;

    emit(delta);

    pieces.forEach((piece) => {
      piece.vy += gravity;
      piece.vx *= 0.998;
      piece.x += piece.vx * delta * 0.06;
      piece.y += piece.vy * delta * 0.06;
      resolveBounds(piece);
    });

    for (let i = 0; i < 4; i += 1) {
      collidePieces();
      pieces.forEach(resolveBounds);
    }
  }

  function drawPiece(piece) {
    ctx.save();
    ctx.translate(piece.x, piece.y);

    const [red, green, blue] = piece.color;
    ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
    ctx.strokeStyle = "#050505";
    ctx.lineWidth = Math.max(2, Math.min(5, piece.radius * 0.24));
    ctx.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
    ctx.strokeRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
    ctx.restore();
  }

  function draw() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, state.width, state.height);
    pieces.forEach(drawPiece);
  }

  function update(delta) {
    step(Math.min(delta, 32));
    draw();
  }

  resize();
  draw();

  return {
    state,
    start(x, y) {
      state.emitting = true;
      state.pressX = x;
      state.pressY = y;
      state.emitCarry = 2;
      for (let i = 0; i < 8; i += 1) addPiece(x, y, 1.1, true);
    },
    move(x, y) {
      state.pressX = x;
      state.pressY = y;
    },
    stop() {
      state.emitting = false;
      state.emitCarry = 0;
    },
    update,
    resize,
  };
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

function setIndexOpen(nextOpen) {
  indexOpen = nextOpen;
  indexPanel?.classList.toggle("is-open", indexOpen);
  indexPanel?.setAttribute("aria-hidden", String(!indexOpen));
  indexToggle?.setAttribute("aria-expanded", String(indexOpen));
}

function toggleIndexView() {
  if (!indexPanel || !indexViewToggle) return;

  const nextView = indexPanel.dataset.view === "grid" ? "list" : "grid";
  indexPanel.dataset.view = nextView;
  indexViewToggle.textContent = nextView === "grid" ? "Lista" : "Cuadricula";
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

  const isFallArtwork = artwork?.node.classList.contains("fall-slide");
  const isFallTarget = isFallArtwork && artwork.node.contains(event.target);

  pointer = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    mode: null,
    horizontalAllowed: artwork?.card ? artwork.card.contains(event.target) : isFallTarget,
    fallAllowed: isFallTarget,
  };
  verticalLock = false;
  if (artwork) artwork.velocity = 0;

  if (isFallTarget) {
    fallScene?.start(event.clientX, event.clientY);
    fallHoldTimer = window.setTimeout(() => {
      fallHoldTimer = null;
    }, 180);
  }
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
    if (pointer.mode === "vertical" && fallHoldTimer) {
      window.clearTimeout(fallHoldTimer);
      fallHoldTimer = null;
      fallScene?.stop();
    }
  }

  if (artwork?.node.classList.contains("fall-slide") && pointer.fallAllowed && pointer.mode === "horizontal") {
    if (!fallScene.state.emitting) fallScene.start(event.clientX, event.clientY);
    fallScene.move(event.clientX, event.clientY);
    event.preventDefault();
    return;
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

  if (fallHoldTimer) {
    window.clearTimeout(fallHoldTimer);
    fallHoldTimer = null;
  }

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
    getActiveArtwork()?.node.classList.contains("fall-slide") &&
    pointer.fallAllowed &&
    Math.hypot(totalX, totalY) < 10
  ) {
    fallScene.start(event.clientX, event.clientY);
    window.setTimeout(() => fallScene.stop(), 180);
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
  fallScene?.stop();
  verticalLock = false;
  verticalDrag = 0;
  resetVerticalPreview();
}

let lastAnimationTime = performance.now();

function animate() {
  const now = performance.now();
  const delta = now - lastAnimationTime;
  lastAnimationTime = now;
  fallScene?.update(delta);

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
indexToggle?.addEventListener("click", () => setIndexOpen(!indexOpen));
indexClose?.addEventListener("click", () => setIndexOpen(false));
indexViewToggle?.addEventListener("click", toggleIndexView);
indexItems.forEach((item) => {
  item.addEventListener("click", () => {
    setActiveArtwork(Number(item.dataset.slide));
    setIndexOpen(false);
  });
});

if (fallCanvas) {
  fallScene = createFallScene(fallCanvas);
  window.addEventListener("resize", fallScene.resize);
}

preloadFrames();
setActiveArtwork(0);
animate();
