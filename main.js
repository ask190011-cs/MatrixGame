const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d", { alpha: false });
const focusBar = document.querySelector("#focus-bar");
const dashBar = document.querySelector("#dash-bar");
const playerHealthBar = document.querySelector("#player-health-bar");
const playerHealthText = document.querySelector("#player-health-text");
const enemyHealthHud = document.querySelector("#enemy-health");
const enemyHealthBar = document.querySelector("#enemy-health-bar");
const targetHealthLabel = document.querySelector("#target-health-label");
const modeReadout = document.querySelector("#move-mode");
const speedReadout = document.querySelector("#speed-readout");
const weaponName = document.querySelector("#weapon-name");
const weaponState = document.querySelector("#weapon-state");
const counterPrompt = document.querySelector("#counter-prompt");
const counterAction = document.querySelector("#counter-action");
const startPanel = document.querySelector("#start-panel");
const startButton = document.querySelector("#start-button");

const TAU = Math.PI * 2;
const keys = new Set();
const justPressed = new Set();
const pointer = { locked: false, yaw: 0, pitch: -0.26 };
const camera = {
  position: vec(0, 4, 0),
  target: vec(0, 0, 0),
  forward: vec(0, 0, 1),
  right: vec(1, 0, 0),
  up: vec(0, 1, 0),
  fov: 66,
  focal: 1,
};

const player = {
  position: vec(0, 0, 8),
  velocity: vec(0, 0, 0),
  health: 100,
  maxHealth: 100,
  radius: 0.44,
  onGround: true,
  wallNormal: null,
  wallRunTime: 0,
  wallRunning: false,
  dashCooldown: 0,
  dashFlash: 0,
  focus: 1,
  bulletTime: false,
  firstPerson: false,
  sniperEquipped: false,
  grappleEquipped: false,
  grappling: false,
  grappleAnchor: null,
  scoped: false,
  slideTime: 0,
  slideCooldown: 0,
  slideDirection: vec(0, 0, 1),
  flipAngle: 0,
  flipVelocity: 0,
  kickTime: 0,
  kickCooldown: 0,
  kickHit: false,
  blocking: false,
  caughtBulletTime: 0,
  cameraJerkTime: 0,
  cameraJerkDuration: 0.58,
  cameraJerkYaw: 0,
  cameraJerkPitch: 0,
  motorcycle: false,
  motorcycleSpeed: 0,
  motorcycleWallRide: false,
  motorcycleLean: 0,
  poleSwinging: false,
  poleSwingAnchor: null,
  poleSwingLength: 0,
  poleSwingTime: 0,
  vaulting: false,
  vaultTime: 0,
  vaultDuration: 0.44,
  vaultStart: null,
  vaultEnd: null,
  vaultDirection: vec(0, 0, 1),
  yaw: 0,
};

const world = {
  time: 0,
  lastFrame: performance.now(),
  objects: [],
  buildings: [],
  stars: [],
  ghosts: [],
  ghostTimer: 0,
  projectiles: [],
  shockwaves: [],
  lampposts: [],
  remotePlayer: null,
  multiplayer: { connected: false, isHost: false, spawnPosition: vec(0, 0, 8) },
  enemy: {
    position: vec(0, 0, -9),
    spawnPosition: vec(0, 0, -9),
    health: 100,
    maxHealth: 100,
    velocity: vec(0, 0, 0),
    yaw: Math.PI,
    state: "chase",
    stateTime: 0,
    attackHit: false,
    spinAngle: 0,
    disorientedTime: 0,
    shootCooldown: 2.4,
    shotPoseTime: 0,
    attackTarget: "body",
  },
};

const palette = {
  black: rgb(28, 33, 37),
  road: rgb(67, 72, 75),
  asphalt: rgb(128, 136, 134),
  line: rgb(242, 205, 72),
  green: rgb(77, 255, 154),
  cyan: rgb(109, 219, 255),
  amber: rgb(255, 194, 99),
  coat: rgb(8, 8, 8),
  skin: rgb(192, 176, 161),
};

initWorld();
resize();
requestAnimationFrame(frame);

window.__gameDebug = {
  getState: () => ({
    position: { ...player.position },
    velocity: { ...player.velocity },
    firstPerson: player.firstPerson,
    cameraRight: { ...camera.right },
  }),
};

window.__matrixGame = { canvas, player, world, camera, pointer, palette, damagePlayer };

startButton.addEventListener("click", () => {
  startPanel.classList.add("hidden");
  canvas.requestPointerLock?.();
  canvas.focus();
});

canvas.addEventListener("click", () => {
  if (!document.pointerLockElement) canvas.requestPointerLock?.();
});

document.addEventListener("pointerlockchange", () => {
  pointer.locked = document.pointerLockElement === canvas;
});

document.addEventListener("mousemove", (event) => {
  if (!pointer.locked) return;
  const sensitivity = player.scoped ? 0.00065 : 0.002;
  pointer.yaw += event.movementX * sensitivity;
  pointer.pitch -= event.movementY * sensitivity * 0.9;

  if (!player.onGround && !player.scoped) {
    player.flipVelocity -= event.movementY * 0.035;
    player.flipVelocity = clamp(player.flipVelocity, -11, 11);
  }

  if (player.firstPerson || player.scoped) {
    pointer.pitch = clamp(pointer.pitch, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
  } else if (!player.onGround) {
    pointer.pitch = clamp(pointer.pitch, -Math.PI, Math.PI);
  } else {
    pointer.pitch = clamp(pointer.pitch, -0.78, 0.22);
  }
});

canvas.addEventListener("contextmenu", (event) => event.preventDefault());

window.addEventListener("mousedown", (event) => {
  if (event.button === 0 && player.grappleEquipped) {
    beginGrapple();
    event.preventDefault();
  } else if (event.button === 0 && player.sniperEquipped) {
    fireSniper();
    event.preventDefault();
  }
  if (event.button === 2 && player.sniperEquipped) {
    player.scoped = true;
    document.body.classList.add("scoped");
    event.preventDefault();
  }
});

window.addEventListener("mouseup", (event) => {
  if (event.button === 0) {
    player.grappling = false;
    player.grappleAnchor = null;
  }
  if (event.button === 2) {
    player.scoped = false;
    document.body.classList.remove("scoped");
  }
});

window.addEventListener("keydown", (event) => {
  const code = event.code.toLowerCase();
  if (!keys.has(code)) {
    justPressed.add(code);
    if (code === "keyv") {
      player.firstPerson = !player.firstPerson;
      pointer.pitch = player.firstPerson ? 0 : -0.26;
      document.body.classList.toggle("first-person", player.firstPerson);
    }
    if (code === "digit1") {
      player.sniperEquipped = !player.sniperEquipped;
      player.grappleEquipped = false;
      player.grappling = false;
      player.grappleAnchor = null;
      document.body.classList.toggle("sniper-equipped", player.sniperEquipped);
      document.body.classList.remove("grapple-equipped");
      if (!player.sniperEquipped) {
        player.scoped = false;
        document.body.classList.remove("scoped");
      }
    }
    if (code === "digit2") {
      player.grappleEquipped = !player.grappleEquipped;
      player.sniperEquipped = false;
      player.scoped = false;
      document.body.classList.toggle("grapple-equipped", player.grappleEquipped);
      document.body.classList.remove("sniper-equipped", "scoped");
      if (!player.grappleEquipped) {
        player.grappling = false;
        player.grappleAnchor = null;
      }
    }
    if (code === "keyf" && !player.motorcycle && player.kickCooldown <= 0 && !player.blocking) {
      player.kickTime = 0.48;
      player.kickCooldown = 0.72;
      player.kickHit = false;
    }
    if (code === "digit3") {
      player.motorcycle = !player.motorcycle;
      player.motorcycleSpeed = player.motorcycle ? Math.max(4, Math.hypot(player.velocity.x, player.velocity.z)) : 0;
      player.motorcycleWallRide = false;
      player.yaw = pointer.yaw;
      player.sniperEquipped = false;
      player.grappleEquipped = false;
      player.grappling = false;
      player.grappleAnchor = null;
      player.scoped = false;
      document.body.classList.toggle("motorcycle-mounted", player.motorcycle);
      document.body.classList.remove("sniper-equipped", "grapple-equipped", "scoped");
    }
  }
  keys.add(code);
  if (["space", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(code)) {
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code.toLowerCase());
});

window.addEventListener("resize", resize);

function initWorld() {
  for (let i = 0; i < 40; i += 1) {
    world.stars.push({
      x: rand(-130, 130),
      y: rand(24, 96),
      z: rand(-130, 130),
      size: rand(0.7, 1.8),
      alpha: rand(0.24, 0.76),
    });
  }

  addBox({
    x: 0,
    y: -0.18,
    z: 0,
    w: 240,
    h: 0.36,
    d: 240,
    color: palette.asphalt,
    rough: 0.92,
  });

  addRoad(0, -34, 160, 10);
  addRoad(0, 0, 160, 10);
  addRoad(0, 34, 160, 10);
  addRoad(-34, 0, 10, 160);
  addRoad(34, 0, 10, 160);
  addCityGroundDetails();

  const buildingColors = [
    rgb(164, 174, 176),
    rgb(119, 137, 145),
    rgb(184, 170, 151),
    rgb(139, 158, 151),
    rgb(152, 148, 162),
  ];
  const centers = [-54, -18, 18, 54];
  let index = 0;
  for (const x of centers) {
    for (const z of centers) {
      const width = 8 + ((index * 7) % 9);
      const depth = 8 + ((index * 5) % 10);
      const height = 12 + ((index * 11) % 34);
      addBuilding(x, z, width, depth, height, buildingColors[index % buildingColors.length], index);
      index += 1;
    }
  }

  addBuilding(-12, -18, 9, 18, 20, rgb(32, 39, 41), 50, true);
  addBuilding(14, -20, 12, 10, 26, rgb(37, 37, 41), 51, true);
  addBuilding(-52, 10, 11, 22, 30, rgb(28, 38, 34), 52, true);
  addBuilding(52, -9, 12, 24, 34, rgb(41, 35, 32), 53, true);

  addNeonGate(0, -14);
  addStreetLights();
  addLowObstacles();
  addParkourDistrict();
}

function addRoad(x, z, width, depth) {
  addBox({
    x,
    y: 0.025,
    z,
    w: width,
    h: 0.05,
    d: depth,
    color: palette.road,
    rough: 0.85,
  });

  if (width > depth) {
    addBox({ x, y: 0.075, z: z - depth / 2 + 0.55, w: width, h: 0.025, d: 0.12, color: rgb(224, 224, 205) });
    addBox({ x, y: 0.075, z: z + depth / 2 - 0.55, w: width, h: 0.025, d: 0.12, color: rgb(224, 224, 205) });
    for (let stripe = -70; stripe <= 70; stripe += 14) {
      addBox({ x: stripe, y: 0.08, z, w: 6, h: 0.04, d: 0.16, color: palette.line, glow: 0.18 });
    }
  } else {
    addBox({ x: x - width / 2 + 0.55, y: 0.075, z, w: 0.12, h: 0.025, d: depth, color: rgb(224, 224, 205) });
    addBox({ x: x + width / 2 - 0.55, y: 0.075, z, w: 0.12, h: 0.025, d: depth, color: rgb(224, 224, 205) });
    for (let stripe = -70; stripe <= 70; stripe += 14) {
      addBox({ x, y: 0.08, z: stripe, w: 0.16, h: 0.04, d: 6, color: palette.line, glow: 0.18 });
    }
  }
}

function addCityGroundDetails() {
  const sidewalk = rgb(168, 171, 166);
  const curb = rgb(205, 204, 194);
  const seam = rgb(125, 130, 127);
  const marking = rgb(232, 230, 211);
  const utility = rgb(72, 79, 78);
  const blockCenters = [-54, -18, 18, 54];

  for (const x of blockCenters) {
    for (const z of blockCenters) {
      addBox({ x, y: 0.055, z, w: 25.5, h: 0.07, d: 25.5, color: sidewalk, rough: 0.9 });

      for (let offset = -10; offset <= 10; offset += 5) {
        addBox({ x: x + offset, y: 0.096, z, w: 0.035, h: 0.012, d: 25.2, color: seam });
        addBox({ x, y: 0.097, z: z + offset, w: 25.2, h: 0.012, d: 0.035, color: seam });
      }

      addBox({ x, y: 0.105, z: z - 12.55, w: 25.8, h: 0.09, d: 0.22, color: curb });
      addBox({ x, y: 0.105, z: z + 12.55, w: 25.8, h: 0.09, d: 0.22, color: curb });
      addBox({ x: x - 12.55, y: 0.105, z, w: 0.22, h: 0.09, d: 25.8, color: curb });
      addBox({ x: x + 12.55, y: 0.105, z, w: 0.22, h: 0.09, d: 25.8, color: curb });
    }
  }

  for (const x of [-34, 34]) {
    for (const z of [-34, 0, 34]) addCrosswalk(x, z, marking);
  }

  for (const z of [-34, 0, 34]) {
    for (const x of [-63, -49, -21, -7, 7, 21, 49, 63]) {
      addBox({ x, y: 0.092, z: z - 3.55, w: 0.1, h: 0.025, d: 1.5, color: marking });
      addBox({ x, y: 0.092, z: z + 3.55, w: 0.1, h: 0.025, d: 1.5, color: marking });
    }
  }

  for (const x of [-34, 34]) {
    for (const z of [-62, -45, -18, 18, 45, 62]) {
      addBox({ x: x - 3.55, y: 0.092, z, w: 1.5, h: 0.025, d: 0.1, color: marking });
      addBox({ x: x + 3.55, y: 0.092, z, w: 1.5, h: 0.025, d: 0.1, color: marking });
    }
  }

  for (const [x, z] of [[-12, 2], [14, -2], [-38, 18], [30, -20], [38, 48], [-30, -48]]) {
    addBox({ x, y: 0.105, z, w: 1.1, h: 0.04, d: 1.1, color: utility, rough: 0.45 });
    addBox({ x, y: 0.128, z, w: 0.75, h: 0.012, d: 0.08, color: rgb(111, 121, 118) });
    addBox({ x, y: 0.129, z, w: 0.08, h: 0.012, d: 0.75, color: rgb(111, 121, 118) });
  }
}

function addCrosswalk(x, z, color) {
  for (let stripe = -3.6; stripe <= 3.6; stripe += 1.2) {
    addBox({ x: x + stripe, y: 0.105, z: z - 6.1, w: 0.62, h: 0.025, d: 2.1, color });
    addBox({ x: x + stripe, y: 0.105, z: z + 6.1, w: 0.62, h: 0.025, d: 2.1, color });
    addBox({ x: x - 6.1, y: 0.106, z: z + stripe, w: 2.1, h: 0.025, d: 0.62, color });
    addBox({ x: x + 6.1, y: 0.106, z: z + stripe, w: 2.1, h: 0.025, d: 0.62, color });
  }
}

function addBuilding(x, z, width, depth, height, color, index, runnable = false) {
  const podiumHeight = Math.min(4.2, height * 0.22);
  const hasSetback = height > 20;
  const upperStart = hasSetback ? height * 0.64 : height;
  const upperHeight = height - upperStart;
  const facade = applyShade(color, 0.92);
  const trim = applyShade(color, 0.68);

  addBox({ x, y: podiumHeight / 2, z, w: width + 1.2, h: podiumHeight, d: depth + 1.2, color: trim, rough: 0.72 });
  addBox({ x, y: podiumHeight + (upperStart - podiumHeight) / 2, z, w: width, h: upperStart - podiumHeight, d: depth, color: facade, rough: 0.5 });

  if (hasSetback) {
    const insetX = 1.1 + (index % 2) * 0.45;
    const insetZ = 0.8 + ((index + 1) % 2) * 0.5;
    addBox({
      x: x + (index % 2 ? 0.35 : -0.35),
      y: upperStart + upperHeight / 2,
      z,
      w: Math.max(5, width - insetX * 2),
      h: upperHeight,
      d: Math.max(5, depth - insetZ * 2),
      color,
      rough: 0.46,
    });
    addBox({ x, y: upperStart + 0.16, z, w: width + 0.15, h: 0.32, d: depth + 0.15, color: trim });
  }

  addBox({ x, y: height + 0.15, z, w: Math.max(5, width - (hasSetback ? 1.8 : 0) + 0.2), h: 0.3, d: Math.max(5, depth - (hasSetback ? 1.8 : 0) + 0.2), color: rgb(62, 70, 71) });

  const collider = {
    x,
    z,
    width,
    depth,
    height,
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
    runnable,
  };
  world.buildings.push(collider);

  addWindows(collider, index);
  addBuildingDetails(collider, index, color);

  if (runnable) {
    addBox({
      x,
      y: 4.4,
      z: collider.maxZ + 0.07,
      w: width + 0.2,
      h: 3.1,
      d: 0.12,
      color: rgb(22, 95, 55),
      glow: 0.7,
    });
  }

  if (index % 3 === 0) {
    addBox({
      x,
      y: Math.min(height - 2, 12),
      z: collider.maxZ + 0.18,
      w: Math.min(width + 1, 11),
      h: 1.2,
      d: 0.2,
      color: index % 2 ? palette.green : palette.amber,
      glow: 0.55,
    });
  }
}

function addBuildingDetails(building, index, color) {
  const concrete = applyShade(color, 0.72);
  const metal = rgb(67, 78, 80);
  const glass = rgb(52, 91, 112);

  addBox({
    x: building.x,
    y: 1.45,
    z: building.maxZ + 0.68,
    w: Math.min(3.8, building.width * 0.46),
    h: 2.7,
    d: 0.22,
    color: glass,
    rough: 0.18,
  });
  addBox({
    x: building.x,
    y: 2.9,
    z: building.maxZ + 1.12,
    w: Math.min(5.4, building.width * 0.62),
    h: 0.22,
    d: 1.1,
    color: metal,
  });

  for (const side of [-1, 1]) {
    addBox({
      x: building.x + side * (building.width / 2 + 0.09),
      y: building.height * 0.47,
      z: building.z,
      w: 0.18,
      h: building.height * 0.9,
      d: building.depth + 0.14,
      color: concrete,
    });
  }

  const bandCount = Math.max(2, Math.floor(building.height / 9));
  for (let band = 1; band <= bandCount; band += 1) {
    const y = (building.height * band) / (bandCount + 1);
    addBox({ x: building.x, y, z: building.maxZ + 0.08, w: building.width + 0.2, h: 0.14, d: 0.13, color: concrete });
    addBox({ x: building.maxX + 0.08, y, z: building.z, w: 0.13, h: 0.14, d: building.depth + 0.2, color: concrete });
  }

  const roofWidth = Math.max(2.2, building.width * 0.32);
  const roofDepth = Math.max(2, building.depth * 0.28);
  addBox({
    x: building.x + (index % 2 ? -1 : 1) * building.width * 0.16,
    y: building.height + 1,
    z: building.z,
    w: roofWidth,
    h: 1.7,
    d: roofDepth,
    color: metal,
  });

  if (index % 3 === 1) {
    addBox({ x: building.x, y: building.height + 2.8, z: building.z, w: 0.22, h: 3.6, d: 0.22, color: rgb(80, 86, 84) });
    addBox({ x: building.x, y: building.height + 4.65, z: building.z, w: 1.7, h: 0.12, d: 0.12, color: rgb(80, 86, 84) });
  }
}

function addWindows(building, seed) {
  const frontRows = Math.max(2, Math.floor(building.height / 3));
  const frontCols = Math.max(2, Math.floor(building.width / 2.2));
  const sideCols = Math.max(2, Math.floor(building.depth / 2.4));
  for (let row = 0; row < frontRows; row += 1) {
    const y = 2 + row * 2.6;
    if (y > building.height - 1.4) continue;
    for (let col = 0; col < frontCols; col += 1) {
      if ((row * 5 + col * 3 + seed) % 4 === 0) continue;
      const x = lerp(building.minX + 1.1, building.maxX - 1.1, frontCols === 1 ? 0.5 : col / (frontCols - 1));
      const lit = (row + col + seed) % 5 !== 0;
      addBox({
        x,
        y,
        z: building.maxZ + 0.04,
        w: 0.7,
        h: 0.45,
        d: 0.06,
        color: lit ? rgb(73, 126, 151) : rgb(48, 77, 89),
        glow: 0,
      });
    }
    for (let col = 0; col < sideCols; col += 1) {
      if ((row * 2 + col * 7 + seed) % 5 === 0) continue;
      const z = lerp(building.minZ + 1.1, building.maxZ - 1.1, sideCols === 1 ? 0.5 : col / (sideCols - 1));
      const lit = (row + col + seed) % 4 !== 0;
      addBox({
        x: building.maxX + 0.04,
        y,
        z,
        w: 0.06,
        h: 0.45,
        d: 0.7,
        color: lit ? rgb(88, 143, 165) : rgb(45, 71, 82),
        glow: 0,
      });
    }
  }
}

function addNeonGate(x, z) {
  addBox({ x: x - 4, y: 3, z, w: 0.3, h: 6, d: 0.3, color: palette.green, glow: 0.85 });
  addBox({ x: x + 4, y: 3, z, w: 0.3, h: 6, d: 0.3, color: palette.green, glow: 0.85 });
  addBox({ x, y: 6, z, w: 8, h: 0.3, d: 0.3, color: palette.green, glow: 0.85 });
}

function addStreetLights() {
  for (let i = 0; i < 18; i += 1) {
    const x = -68 + i * 8;
    for (const z of [-6, 6, 28, 40]) {
      addBox({ x, y: 1.55, z, w: 0.14, h: 3.1, d: 0.14, color: rgb(15, 20, 21), rough: 0.35 });
      addBox({ x, y: 3.28, z, w: 0.46, h: 0.28, d: 0.46, color: rgb(157, 255, 202), glow: 0.65 });
      world.lampposts.push({ x, y: 3.02, z });
    }
  }
}

function addLowObstacles() {
  const items = [
    [-10, 7, 5, 0.8, 1.4],
    [10, 8, 6, 0.8, 1.4],
    [-22, -7, 5, 0.8, 1.2],
    [24, 21, 7, 0.8, 1.4],
  ];
  for (const [x, z, w, h, d] of items) {
    addBox({ x, y: h / 2, z, w, h, d, color: rgb(45, 54, 55), rough: 0.5 });
    world.buildings.push({
      x,
      z,
      width: w,
      depth: d,
      height: h,
      minX: x - w / 2,
      maxX: x + w / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
      runnable: true,
      parkour: true,
    });
  }
}

function addParkourDistrict() {
  const concrete = rgb(111, 120, 119);
  const darkConcrete = rgb(72, 82, 82);
  const steel = rgb(61, 76, 76);
  const landing = rgb(68, 125, 103);

  const structures = [
    [-22, 15, 7, 1.1, 2.2, concrete],
    [-15, 15, 5, 2.2, 3.5, darkConcrete],
    [-9, 15, 5, 3.5, 3.5, concrete],
    [-3, 15, 5, 5.1, 3.5, landing],
    [4, 15, 6, 6.8, 4, darkConcrete],
    [12, 15, 7, 8.6, 4.5, concrete],
    [21, 15, 8, 10.6, 5, landing],
    [-22, -15, 8, 2.5, 3.5, concrete],
    [-13, -15, 7, 4.5, 3.5, landing],
    [-4, -15, 8, 6.4, 4, darkConcrete],
    [6, -15, 9, 8.3, 4, concrete],
    [17, -15, 9, 10.4, 4.5, landing],
    [-24, 4, 3.2, 3.2, 8, steel],
    [24, -4, 3.2, 4.8, 8, steel],
    [-15, 4, 4.5, 1.4, 2.2, concrete],
    [-8, 4, 4.5, 2.7, 2.2, darkConcrete],
    [8, -4, 4.5, 2.7, 2.2, darkConcrete],
    [15, -4, 4.5, 1.4, 2.2, concrete],
  ];

  for (const [x, z, width, height, depth, color] of structures) {
    addParkourBlock(x, z, width, height, depth, color);
  }

  for (const z of [-23, 23]) {
    for (let x = -20; x <= 20; x += 10) {
      addParkourBlock(x, z, 5.5, 0.85 + Math.abs(x) * 0.035, 1.1, concrete);
    }
  }

  for (const [x, z, height] of [[-18, 9, 5], [0, 9, 7], [18, 9, 9], [-18, -9, 7], [0, -9, 9], [18, -9, 6]]) {
    addBox({ x, y: height, z, w: 8, h: 0.22, d: 3, color: steel });
    addBox({ x: x - 3.5, y: height / 2, z, w: 0.18, h: height, d: 0.18, color: steel });
    addBox({ x: x + 3.5, y: height / 2, z, w: 0.18, h: height, d: 0.18, color: steel });
    addParkourBlock(x, z, 8, height, 3, rgb(91, 102, 101), true);
  }

  for (const [x, z, length, horizontal] of [[-11, 1, 9, true], [11, -1, 9, true], [0, 21, 12, false], [0, -21, 12, false]]) {
    addBox({ x, y: 2.7, z, w: horizontal ? length : 0.18, h: 0.18, d: horizontal ? 0.18 : length, color: steel });
  }
}

function addParkourBlock(x, z, width, height, depth, color, platformOnly = false) {
  if (!platformOnly) addBox({ x, y: height / 2, z, w: width, h: height, d: depth, color, rough: 0.72 });
  world.buildings.push({
    x,
    z,
    width,
    depth,
    height,
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
    runnable: true,
    parkour: true,
  });
}

function addBox(box) {
  world.objects.push({
    yaw: 0,
    alpha: 1,
    glow: 0,
    rough: 0.65,
    ...box,
  });
}

function frame(now) {
  const realDt = Math.min((now - world.lastFrame) / 1000, 0.033);
  world.lastFrame = now;
  world.time += realDt;

  update(realDt);
  render();
  justPressed.clear();
  requestAnimationFrame(frame);
}

function update(realDt) {
  player.blocking = !player.motorcycle && keys.has("keyq") && player.kickTime <= 0;
  player.bulletTime = keys.has("shiftleft") || keys.has("shiftright");
  player.focus = 1;

  document.body.classList.toggle("bullet-time", player.bulletTime);
  document.body.classList.toggle("blocking", player.blocking);
  document.body.classList.toggle("kicking", player.kickTime > 0);
  const simDt = realDt * (player.bulletTime ? 0.42 : 1);
  player.caughtBulletTime = Math.max(0, player.caughtBulletTime - realDt);
  tryCatchEnemyBullet();
  tryEnemyLegCatch();
  updateMovement(simDt, realDt);
  if (!world.multiplayer.connected) updateEnemy(simDt, realDt);
  updateProjectiles(simDt);
  updateCamera(realDt);
  updateGhosts(realDt);
  updateHud();
  updateCounterPrompt();
}

function updateCounterPrompt() {
  if (world.multiplayer.connected) {
    counterPrompt.classList.remove("active", "bullet-catch");
    counterPrompt.setAttribute("aria-hidden", "true");
    return;
  }
  const enemy = world.enemy;
  const bullet = getCatchableEnemyBullet();
  const legAvailable =
    player.bulletTime &&
    !player.motorcycle &&
    enemy.state === "windup" &&
    enemy.stateTime >= 0.36 &&
    enemy.stateTime <= 0.64 &&
    horizontalDistance(player.position, enemy.position) <= 2.65;
  const bulletAvailable = player.bulletTime && !player.motorcycle && bullet !== null;
  const available = bulletAvailable || legAvailable;
  counterAction.textContent = bulletAvailable ? "CATCH" : "GRAB";
  counterPrompt.classList.toggle("bullet-catch", bulletAvailable);
  counterPrompt.classList.toggle("active", available);
  counterPrompt.setAttribute("aria-hidden", String(!available));
}

function getCatchableEnemyBullet() {
  let nearest = null;
  let nearestDistance = 2.35;
  const handTarget = add(player.position, vec(0, 1.25, 0));
  for (const projectile of world.projectiles) {
    if (projectile.owner !== "enemy" || projectile.life <= 0) continue;
    const distance = Math.sqrt(lengthSq(sub(projectile.position, handTarget)));
    if (distance < nearestDistance) {
      nearest = projectile;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function tryCatchEnemyBullet() {
  if (!justPressed.has("keyq") || !player.bulletTime || player.motorcycle) return;
  const projectile = getCatchableEnemyBullet();
  if (!projectile) return;
  projectile.life = 0;
  player.caughtBulletTime = 0.38;
  spawnShockwave(add(player.position, vec(0, 1.25, 0)), mul(projectile.direction, -1), 0.34);
}

function tryEnemyLegCatch() {
  if (world.multiplayer.connected) return;
  const enemy = world.enemy;
  if (
    !justPressed.has("keyq") ||
    !player.bulletTime ||
    player.motorcycle ||
    enemy.state !== "windup" ||
    enemy.stateTime < 0.36 ||
    enemy.stateTime > 0.64 ||
    horizontalDistance(player.position, enemy.position) > 2.65
  ) return;

  enemy.state = "grabbed";
  enemy.stateTime = 0;
  enemy.spinAngle = Math.atan2(enemy.position.x - player.position.x, enemy.position.z - player.position.z);
  enemy.velocity = vec(0, 0, 0);
  player.velocity.x *= 0.25;
  player.velocity.z *= 0.25;
}

function updateEnemy(simDt, realDt) {
  const enemy = world.enemy;
  enemy.stateTime += simDt;
  enemy.shotPoseTime = Math.max(0, enemy.shotPoseTime - realDt);
  enemy.shootCooldown -= realDt;

  if (enemy.state === "defeated") {
    enemy.position.y = Math.max(-1.6, enemy.position.y - 1.8 * simDt);
    if (enemy.stateTime > 3.2) {
      enemy.health = enemy.maxHealth;
      enemy.position = { ...enemy.spawnPosition };
      enemy.velocity = vec(0, 0, 0);
      enemy.state = "chase";
      enemy.stateTime = 0;
      enemy.shootCooldown = 2.4;
    }
    return;
  }

  if (enemy.state === "grabbed") {
    if (!keys.has("keyq")) {
      throwEnemy();
      return;
    }
    enemy.spinAngle += 4.8 * simDt;
    const radius = 1.85;
    enemy.position.x = player.position.x + Math.sin(enemy.spinAngle) * radius;
    enemy.position.z = player.position.z + Math.cos(enemy.spinAngle) * radius;
    enemy.position.y = player.position.y + 0.48 + Math.sin(enemy.spinAngle * 2) * 0.18;
    enemy.yaw = enemy.spinAngle + Math.PI / 2;
    return;
  }

  if (enemy.state === "thrown") {
    enemy.position = add(enemy.position, mul(enemy.velocity, simDt));
    enemy.velocity.y -= 18 * simDt;
    enemy.velocity.x *= Math.exp(-0.55 * simDt);
    enemy.velocity.z *= Math.exp(-0.55 * simDt);
    enemy.yaw += 7.5 * simDt;
    if (enemy.position.y <= 0) {
      enemy.position.y = 0;
      enemy.velocity = vec(0, 0, 0);
      enemy.state = "disoriented";
      enemy.stateTime = 0;
      enemy.disorientedTime = 3.4;
    }
    return;
  }

  if (enemy.state === "disoriented") {
    enemy.disorientedTime -= realDt;
    enemy.yaw += Math.sin(world.time * 8) * 1.4 * realDt;
    if (enemy.disorientedTime <= 0) {
      enemy.state = "chase";
      enemy.stateTime = 0;
    }
    return;
  }

  if (enemy.shootCooldown <= 0 && enemy.state !== "windup" && horizontalDistance(player.position, enemy.position) > 4.5) {
    fireEnemySniper();
    enemy.shootCooldown = 3.2 + Math.random() * 1.8;
    enemy.shotPoseTime = 0.48;
  }

  const toPlayer = sub(player.position, enemy.position);
  const distance = Math.hypot(toPlayer.x, toPlayer.z);
  const direction = distance > 0.001 ? vec(toPlayer.x / distance, 0, toPlayer.z / distance) : vec(0, 0, 1);
  enemy.yaw = Math.atan2(direction.x, direction.z);

  if (enemy.state === "chase") {
    if (distance > 2.05) {
      const speed = player.motorcycle ? 5.2 : 3.7;
      enemy.position.x += direction.x * speed * simDt;
      enemy.position.z += direction.z * speed * simDt;
    } else {
      enemy.state = "windup";
      enemy.stateTime = 0;
      enemy.attackHit = false;
      enemy.attackTarget = Math.random() < 0.55 ? "head" : "body";
    }
    return;
  }

  if (enemy.state === "windup") {
    if (enemy.stateTime >= 0.49 && !enemy.attackHit && distance < 2.75) {
      enemy.attackHit = true;
      if (!player.blocking) {
        player.velocity.x += direction.x * 8.5;
        player.velocity.z += direction.z * 8.5;
        player.velocity.y = Math.max(player.velocity.y, 3.6);
        if (enemy.attackTarget === "head") applyHeadKickCameraJerk();
        damagePlayer(enemy.attackTarget === "head" ? 22 : 14);
      }
    }
    if (enemy.stateTime > 0.82) {
      enemy.state = "recover";
      enemy.stateTime = 0;
    }
    return;
  }

  if (enemy.state === "recover" && enemy.stateTime > 0.68) {
    enemy.state = "chase";
    enemy.stateTime = 0;
  }
}

function applyHeadKickCameraJerk() {
  const horizontalDirection = Math.random() < 0.5 ? -1 : 1;
  player.cameraJerkTime = player.cameraJerkDuration;
  player.cameraJerkYaw = horizontalDirection * rand(0.42, 0.72);
  player.cameraJerkPitch = rand(-0.38, 0.34);
}

function fireEnemySniper() {
  const enemy = world.enemy;
  const origin = add(enemy.position, vec(Math.sin(enemy.yaw) * 0.65, 1.42, Math.cos(enemy.yaw) * 0.65));
  const target = add(player.position, vec(0, 1.15, 0));
  const direction = normalize(sub(target, origin));
  world.projectiles.push({
    position: origin,
    previous: origin,
    direction,
    speed: 38,
    life: 3.2,
    waveTimer: 0,
    owner: "enemy",
  });
  spawnShockwave(origin, direction, 0.24);
}

function throwEnemy() {
  const enemy = world.enemy;
  const radial = normalize(vec(enemy.position.x - player.position.x, 0, enemy.position.z - player.position.z));
  const tangent = vec(radial.z, 0, -radial.x);
  enemy.velocity = add(add(mul(radial, 9), mul(tangent, 12)), vec(0, 7.2, 0));
  enemy.state = "thrown";
  enemy.stateTime = 0;
  damageEnemy(18);
}

function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function fireSniper() {
  const direction = normalize(sub(camera.target, camera.position));
  const origin = add(camera.position, add(mul(direction, player.scoped ? 0.55 : 1.15), mul(camera.right, player.scoped ? 0 : 0.28)));
  world.projectiles.push({
    position: origin,
    previous: origin,
    direction,
    speed: 78,
    life: 2.4,
    waveTimer: 0,
    owner: "player",
  });
  spawnShockwave(origin, direction, 0.2);
  window.dispatchEvent(new CustomEvent("matrix-shot", { detail: { origin, direction } }));
}

function updateProjectiles(simDt) {
  for (const projectile of world.projectiles) {
    projectile.previous = projectile.position;
    projectile.position = add(projectile.position, mul(projectile.direction, projectile.speed * simDt));
    projectile.life -= simDt;
    projectile.waveTimer -= simDt;

    if (projectile.waveTimer <= 0) {
      spawnShockwave(projectile.position, projectile.direction, 0.1);
      projectile.waveTimer = 0.045;
    }

    if ((projectile.owner === "enemy" || projectile.owner === "remote-player") && projectileHitsPlayer(projectile.position)) {
      projectile.life = 0;
      const impactDirection = normalize(vec(projectile.direction.x, 0, projectile.direction.z));
      player.velocity.x += impactDirection.x * 7.5;
      player.velocity.z += impactDirection.z * 7.5;
      player.velocity.y = Math.max(player.velocity.y, 2.8);
      spawnShockwave(projectile.position, projectile.direction, 0.6);
      damagePlayer(projectile.owner === "remote-player" ? (player.blocking ? 12 : 38) : 26);
    } else if (!world.multiplayer.connected && projectile.owner === "player" && projectileHitsEnemy(projectile.position)) {
      projectile.life = 0;
      damageEnemy(38);
      spawnShockwave(projectile.position, projectile.direction, 0.62);
    } else if (projectile.position.y <= 0 || projectileHitsBuilding(projectile.position)) {
      projectile.life = 0;
      spawnShockwave(projectile.position, projectile.direction, 0.65);
    }
  }

  for (const wave of world.shockwaves) {
    wave.life -= simDt;
    wave.radius += (8 + wave.force * 6) * simDt;
  }

  world.projectiles = world.projectiles.filter((projectile) => projectile.life > 0);
  world.shockwaves = world.shockwaves.filter((wave) => wave.life > 0);
}

function projectileHitsPlayer(position) {
  const target = add(player.position, vec(0, 1.05, 0));
  return Math.sqrt(lengthSq(sub(position, target))) < 0.72;
}

function projectileHitsEnemy(position) {
  const enemy = world.enemy;
  const target = add(enemy.position, vec(0, 1.05, 0));
  return enemy.health > 0 && Math.sqrt(lengthSq(sub(position, target))) < 0.78;
}

function damagePlayer(amount) {
  player.health = Math.max(0, player.health - amount);
  if (player.health <= 0) {
    player.health = player.maxHealth;
    player.position = { ...world.multiplayer.spawnPosition };
    player.velocity = vec(0, 0, 0);
    player.motorcycle = false;
    player.grappling = false;
    document.body.classList.remove("motorcycle-mounted");
  }
}

function damageEnemy(amount) {
  const enemy = world.enemy;
  if (enemy.state === "defeated") return;
  enemy.health = Math.max(0, enemy.health - amount);
  if (enemy.health <= 0) {
    enemy.state = "defeated";
    enemy.stateTime = 0;
    enemy.velocity = vec(0, 0, 0);
  }
}

function projectileHitsBuilding(position) {
  return world.buildings.some(
    (building) =>
      position.y >= 0 &&
      position.y <= building.height &&
      position.x >= building.minX &&
      position.x <= building.maxX &&
      position.z >= building.minZ &&
      position.z <= building.maxZ,
  );
}

function spawnShockwave(position, direction, force) {
  world.shockwaves.push({
    position: { ...position },
    direction: { ...direction },
    radius: 0.18 + force * 0.35,
    life: 0.42 + force * 0.2,
    maxLife: 0.42 + force * 0.2,
    force,
  });
  if (world.shockwaves.length > 90) world.shockwaves.shift();
}

function updateMovement(simDt, realDt) {
  player.wallNormal = null;
  player.wallRunning = false;
  player.dashCooldown = Math.max(0, player.dashCooldown - realDt);
  player.slideCooldown = Math.max(0, player.slideCooldown - realDt);
  player.slideTime = Math.max(0, player.slideTime - realDt);
  player.kickTime = Math.max(0, player.kickTime - realDt);
  player.kickCooldown = Math.max(0, player.kickCooldown - realDt);
  player.dashFlash = Math.max(0, player.dashFlash - realDt * 3.5);

  if (player.motorcycle) {
    updateMotorcycleMovement(simDt, realDt);
    return;
  }

  const kickAmount = getKickAmount();
  const kickTarget = world.multiplayer.connected ? world.remotePlayer : world.enemy;
  if (!player.kickHit && kickTarget && kickAmount > 0.78 && horizontalDistance(player.position, kickTarget.position) < 2.35) {
    const facing = vec(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    const toEnemy = normalize(vec(kickTarget.position.x - player.position.x, 0, kickTarget.position.z - player.position.z));
    if (dot(facing, toEnemy) > 0.25) {
      player.kickHit = true;
      if (world.multiplayer.connected) {
        window.dispatchEvent(new CustomEvent("matrix-opponent-damage", { detail: { amount: 20, direction: facing } }));
      } else {
        damageEnemy(20);
        world.enemy.velocity = add(world.enemy.velocity, add(mul(facing, 7), vec(0, 2.4, 0)));
      }
    }
  }

  const fwd = vec(Math.sin(pointer.yaw), 0, Math.cos(pointer.yaw));
  const side = vec(fwd.z, 0, -fwd.x);
  let desired = vec(0, 0, 0);
  if (keys.has("keyw")) desired = add(desired, fwd);
  if (keys.has("keys")) desired = sub(desired, fwd);
  if (keys.has("keyd")) desired = add(desired, side);
  if (keys.has("keya")) desired = sub(desired, side);
  if (lengthSq(desired) > 0) desired = normalize(desired);

  if (player.vaulting) {
    updateVault(simDt);
    return;
  }

  if (keys.has("keye") && !player.poleSwinging) {
    const vaultDirection = lengthSq(desired) > 0 ? desired : fwd;
    if (!beginVault(vaultDirection)) beginPoleSwing();
  }
  if (player.poleSwinging) {
    if (!keys.has("keye")) {
      releasePoleSwing();
    } else {
      updatePoleSwing(simDt, desired, fwd);
      return;
    }
  }

  if (
    (justPressed.has("controlleft") || justPressed.has("controlright")) &&
    player.slideCooldown <= 0 &&
    player.onGround
  ) {
    const currentDirection = normalize(vec(player.velocity.x, 0, player.velocity.z));
    player.slideDirection = lengthSq(desired) > 0 ? desired : lengthSq(currentDirection) > 0 ? currentDirection : fwd;
    player.slideTime = 0.52;
    player.slideCooldown = 0.82;
    player.velocity.x = player.slideDirection.x * 15;
    player.velocity.z = player.slideDirection.z * 15;
    spawnGhost(true);
  }

  const accel = (player.onGround ? 44 : 23) * (player.bulletTime ? 1.45 : 1);
  const maxSpeed = player.blocking ? 3.2 : player.slideTime > 0 ? 15 : player.bulletTime ? 10.5 : 8.2;
  player.velocity.x += desired.x * accel * simDt;
  player.velocity.z += desired.z * accel * simDt;

  const horizontal = Math.hypot(player.velocity.x, player.velocity.z);
  if (horizontal > maxSpeed) {
    player.velocity.x *= maxSpeed / horizontal;
    player.velocity.z *= maxSpeed / horizontal;
  }

  const drag = player.onGround ? Math.exp(-9.5 * simDt) : Math.exp(-1.4 * simDt);
  if (lengthSq(desired) === 0 || player.onGround) {
    player.velocity.x *= drag;
    player.velocity.z *= drag;
  }

  if (justPressed.has("space") && player.onGround) {
    player.velocity.y = 8.8;
    player.onGround = false;
  }

  if ((justPressed.has("shiftleft") || justPressed.has("shiftright")) && player.dashCooldown <= 0) {
    const dash = lengthSq(desired) > 0 ? desired : fwd;
    player.velocity.x += dash.x * (player.bulletTime ? 16 : 12);
    player.velocity.z += dash.z * (player.bulletTime ? 16 : 12);
    player.velocity.y = Math.max(player.velocity.y, player.onGround ? 1.5 : 0.8);
    player.dashCooldown = 1;
    player.dashFlash = 1;
    spawnGhost(true);
  }

  if (player.grappling && player.grappleAnchor) {
    const shoulder = add(player.position, vec(0, 1.25, 0));
    const cable = sub(player.grappleAnchor, shoulder);
    const cableLength = Math.sqrt(lengthSq(cable));
    if (cableLength > 1.2) {
      const pull = normalize(cable);
      const pullStrength = clamp(22 + cableLength * 0.55, 22, 48);
      player.velocity.x += pull.x * pullStrength * simDt;
      player.velocity.y += pull.y * pullStrength * simDt;
      player.velocity.z += pull.z * pullStrength * simDt;
      player.velocity.y += 5.5 * simDt;
      player.onGround = false;
    } else {
      player.grappling = false;
      player.grappleAnchor = null;
    }
  }

  player.velocity.y -= 22 * simDt;
  player.position.x += player.velocity.x * simDt;
  resolveBuildingCollisions("x");
  player.position.z += player.velocity.z * simDt;
  resolveBuildingCollisions("z");

  if (
    player.wallNormal &&
    !player.onGround &&
    lengthSq(desired) > 0 &&
    player.wallRunTime < 1.35 &&
    player.position.y > 0.5
  ) {
    let tangent = vec(-player.wallNormal.z, 0, player.wallNormal.x);
    if (dot(tangent, desired) < 0) tangent = mul(tangent, -1);
    player.wallRunning = true;
    player.wallRunTime += simDt;
    player.velocity.y = Math.max(player.velocity.y, -0.35);
    player.velocity.x = lerp(player.velocity.x, tangent.x * 8.6, 7 * simDt);
    player.velocity.z = lerp(player.velocity.z, tangent.z * 8.6, 7 * simDt);

    if (justPressed.has("space")) {
      player.velocity = add(add(mul(player.wallNormal, 9), mul(tangent, 5.2)), vec(0, 8.4, 0));
      player.wallRunTime = 1.35;
      spawnGhost(true);
    }
  }

  const previousY = player.position.y;
  player.position.y += player.velocity.y * simDt;
  const supportHeight = getPlayerSupportHeight(previousY);
  if (player.position.y <= supportHeight && player.velocity.y <= 0) {
    player.position.y = supportHeight;
    player.velocity.y = 0;
    player.onGround = true;
    player.wallRunTime = 0;
    player.flipVelocity *= Math.exp(-14 * realDt);
    player.flipAngle *= Math.exp(-12 * realDt);
    if (!player.firstPerson && !player.scoped) pointer.pitch = clamp(pointer.pitch, -0.78, 0.22);
  } else {
    player.onGround = false;
    player.flipVelocity *= Math.exp(-0.72 * realDt);
    player.flipVelocity = clamp(player.flipVelocity, -11, 11);
    player.flipAngle += player.flipVelocity * realDt;
  }

  const boundary = Math.hypot(player.position.x, player.position.z);
  if (boundary > 105) {
    player.position.x *= 0.985;
    player.position.z *= 0.985;
    player.velocity.x *= -0.2;
    player.velocity.z *= -0.2;
  }

  world.ghostTimer -= realDt;
  if ((player.bulletTime || player.dashFlash > 0) && world.ghostTimer <= 0) {
    spawnGhost(false);
    world.ghostTimer = player.bulletTime ? 0.065 : 0.09;
  }

  const horizontalSpeed = Math.hypot(player.velocity.x, player.velocity.z);
  if (horizontalSpeed > 0.2) player.yaw = Math.atan2(player.velocity.x, player.velocity.z);
}

function beginVault(direction) {
  if (player.vaulting || player.poleSwinging || player.motorcycle) return false;
  const flatDirection = normalize(vec(direction.x, 0, direction.z));
  let best = null;
  let bestHit = Infinity;

  for (const surface of world.buildings) {
    const rise = surface.height - player.position.y;
    if (rise < 0.28 || rise > 2.15) continue;
    const hit = rayAabb2D(player.position, flatDirection, surface);
    if (!hit || hit.entry < 0.08 || hit.entry > 1.55 || hit.entry >= bestHit) continue;

    const landingDistance = Math.max(hit.entry + 0.35, hit.exit - 0.35);
    const landing = add(player.position, mul(flatDirection, landingDistance));
    const landingInside =
      landing.x > surface.minX + 0.05 &&
      landing.x < surface.maxX - 0.05 &&
      landing.z > surface.minZ + 0.05 &&
      landing.z < surface.maxZ - 0.05;
    if (!landingInside) continue;

    best = { surface, landing };
    bestHit = hit.entry;
  }

  if (!best) return false;
  player.vaulting = true;
  player.vaultTime = 0;
  player.vaultStart = { ...player.position };
  player.vaultEnd = vec(best.landing.x, best.surface.height, best.landing.z);
  player.vaultDirection = flatDirection;
  player.velocity = vec(0, 0, 0);
  player.onGround = false;
  player.yaw = Math.atan2(flatDirection.x, flatDirection.z);
  return true;
}

function updateVault(simDt) {
  player.vaultTime += simDt;
  const progress = clamp(player.vaultTime / player.vaultDuration, 0, 1);
  const smooth = progress * progress * (3 - 2 * progress);
  const arch = Math.sin(progress * Math.PI) * 0.72;
  player.position = mix(player.vaultStart, player.vaultEnd, smooth);
  player.position.y += arch;
  player.velocity = mul(player.vaultDirection, 6.8);
  player.flipAngle = Math.sin(progress * Math.PI) * 0.34;

  if (progress >= 1) {
    player.position = { ...player.vaultEnd };
    player.velocity = mul(player.vaultDirection, 7.2);
    player.vaulting = false;
    player.vaultStart = null;
    player.vaultEnd = null;
    player.vaultTime = 0;
    player.flipAngle = 0;
    player.onGround = true;
  }
}

function rayAabb2D(origin, direction, bounds) {
  let entry = -Infinity;
  let exit = Infinity;
  for (const axis of ["x", "z"]) {
    const component = direction[axis];
    const minimum = bounds[`min${axis.toUpperCase()}`];
    const maximum = bounds[`max${axis.toUpperCase()}`];
    if (Math.abs(component) < 0.00001) {
      if (origin[axis] < minimum || origin[axis] > maximum) return null;
      continue;
    }
    let near = (minimum - origin[axis]) / component;
    let far = (maximum - origin[axis]) / component;
    if (near > far) [near, far] = [far, near];
    entry = Math.max(entry, near);
    exit = Math.min(exit, far);
    if (entry > exit) return null;
  }
  return exit > 0 ? { entry: Math.max(0, entry), exit } : null;
}

function beginPoleSwing() {
  let nearest = null;
  let nearestDistance = 4.25;
  const chest = add(player.position, vec(0, 1.2, 0));
  for (const pole of world.lampposts) {
    const distance = Math.sqrt(lengthSq(sub(pole, chest)));
    if (distance < nearestDistance) {
      nearest = pole;
      nearestDistance = distance;
    }
  }
  if (!nearest) return;

  player.poleSwinging = true;
  player.poleSwingAnchor = { ...nearest };
  player.poleSwingLength = clamp(nearestDistance, 1.8, 4.2);
  player.poleSwingTime = 0;
  const startedGrounded = player.onGround;
  player.onGround = false;
  player.position.y += startedGrounded ? 0.12 : 0;
  player.velocity.y = Math.max(player.velocity.y, 2.6);
}

function updatePoleSwing(simDt, desired, fallbackDirection) {
  player.poleSwingTime += simDt;
  const anchor = player.poleSwingAnchor;
  const chest = add(player.position, vec(0, 1.2, 0));
  let rope = sub(chest, anchor);
  let ropeLength = Math.sqrt(lengthSq(rope)) || player.poleSwingLength;
  const radial = normalize(rope);
  const steering = lengthSq(desired) > 0 ? desired : fallbackDirection;
  const tangentSteering = sub(steering, mul(radial, dot(steering, radial)));

  player.velocity.x += tangentSteering.x * 19 * simDt;
  player.velocity.z += tangentSteering.z * 19 * simDt;
  player.velocity.y -= 17 * simDt;

  const radialSpeed = dot(player.velocity, radial);
  player.velocity = sub(player.velocity, mul(radial, radialSpeed));
  player.velocity = mul(player.velocity, Math.exp(-0.13 * simDt));
  player.position = add(player.position, mul(player.velocity, simDt));

  const correctedChest = add(player.position, vec(0, 1.2, 0));
  rope = sub(correctedChest, anchor);
  ropeLength = Math.sqrt(lengthSq(rope)) || 1;
  const correction = mul(normalize(rope), player.poleSwingLength - ropeLength);
  player.position = add(player.position, correction);
  player.yaw = Math.atan2(player.velocity.x, player.velocity.z);
  player.flipAngle = Math.sin(player.poleSwingTime * 5.5) * 0.18;
}

function releasePoleSwing() {
  if (!player.poleSwinging) return;
  const speed = Math.hypot(player.velocity.x, player.velocity.y, player.velocity.z);
  const boost = clamp(1.08 + speed * 0.018, 1.08, 1.28);
  player.velocity = mul(player.velocity, boost);
  player.velocity.y += 2.8;
  player.poleSwinging = false;
  player.poleSwingAnchor = null;
  player.poleSwingTime = 0;
}

function getPlayerSupportHeight(previousY) {
  let height = 0;
  for (const surface of world.buildings) {
    const inside =
      player.position.x > surface.minX + 0.08 &&
      player.position.x < surface.maxX - 0.08 &&
      player.position.z > surface.minZ + 0.08 &&
      player.position.z < surface.maxZ - 0.08;
    if (inside && previousY >= surface.height - 0.2) height = Math.max(height, surface.height);
  }
  return height;
}

function updateMotorcycleMovement(simDt, realDt) {
  const throttle = (keys.has("keyw") ? 1 : 0) - (keys.has("keys") ? 1 : 0);
  const steering = (keys.has("keyd") ? 1 : 0) - (keys.has("keya") ? 1 : 0);
  const speedRatio = clamp(Math.abs(player.motorcycleSpeed) / 24, 0, 1);

  player.motorcycleSpeed += throttle * (throttle >= 0 ? 24 : 30) * simDt;
  if (throttle === 0) player.motorcycleSpeed *= Math.exp(-1.7 * simDt);
  player.motorcycleSpeed = clamp(player.motorcycleSpeed, -8, 25);
  player.yaw += steering * (1.9 - speedRatio * 0.85) * Math.sign(player.motorcycleSpeed || 1) * simDt;
  player.motorcycleLean = lerp(player.motorcycleLean, -steering * speedRatio * 0.52, 1 - Math.exp(-7 * realDt));

  const bikeForward = vec(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  player.velocity.x = bikeForward.x * player.motorcycleSpeed;
  player.velocity.z = bikeForward.z * player.motorcycleSpeed;
  player.wallNormal = null;

  player.position.x += player.velocity.x * simDt;
  resolveBuildingCollisions("x");
  player.position.z += player.velocity.z * simDt;
  resolveBuildingCollisions("z");

  player.motorcycleWallRide = Boolean(player.wallNormal && throttle > 0 && player.motorcycleSpeed > 5);
  if (player.motorcycleWallRide) {
    player.velocity.y = Math.max(7, player.motorcycleSpeed * 0.72);
    player.motorcycleSpeed = Math.max(player.motorcycleSpeed, 12);
    player.onGround = false;
  } else {
    player.velocity.y -= 18 * simDt;
  }

  if (justPressed.has("space") && !player.motorcycleWallRide) {
    player.velocity.y = Math.max(player.velocity.y, 8.5);
    player.onGround = false;
  }

  player.position.y += player.velocity.y * simDt;
  const supportHeight = getMotorcycleSupportHeight();
  if (player.position.y <= supportHeight && player.velocity.y <= 0) {
    player.position.y = supportHeight;
    player.velocity.y = 0;
    player.onGround = true;
  } else if (!player.motorcycleWallRide) {
    player.onGround = false;
  }

  if (player.motorcycleWallRide) {
    player.flipAngle = lerp(player.flipAngle, -Math.PI / 2, 1 - Math.exp(-10 * realDt));
  } else {
    player.flipAngle = lerp(player.flipAngle, 0, 1 - Math.exp(-7 * realDt));
  }

  const boundary = Math.hypot(player.position.x, player.position.z);
  if (boundary > 105) {
    player.position.x *= 0.985;
    player.position.z *= 0.985;
    player.motorcycleSpeed *= -0.25;
  }
}

function getMotorcycleSupportHeight() {
  let height = 0;
  for (const building of world.buildings) {
    const inside =
      player.position.x > building.minX + 0.2 &&
      player.position.x < building.maxX - 0.2 &&
      player.position.z > building.minZ + 0.2 &&
      player.position.z < building.maxZ - 0.2;
    if (inside && player.position.y >= building.height - 1.1) height = Math.max(height, building.height + 0.02);
  }
  return height;
}

function beginGrapple() {
  const aim = normalize(sub(camera.target, camera.position));
  let nearestHit = null;
  let nearestDistance = 85;

  for (const building of world.buildings) {
    const distance = rayBoxDistance(camera.position, aim, {
      minX: building.minX,
      maxX: building.maxX,
      minY: 0,
      maxY: building.height,
      minZ: building.minZ,
      maxZ: building.maxZ,
    });
    if (distance !== null && distance < nearestDistance) {
      nearestDistance = distance;
      nearestHit = add(camera.position, mul(aim, distance));
    }
  }

  player.grappleAnchor = nearestHit;
  player.grappling = nearestHit !== null;
}

function rayBoxDistance(origin, direction, bounds) {
  let near = 0;
  let far = Infinity;

  for (const axis of ["X", "Y", "Z"]) {
    const originValue = origin[axis.toLowerCase()];
    const directionValue = direction[axis.toLowerCase()];
    const minimum = bounds[`min${axis}`];
    const maximum = bounds[`max${axis}`];

    if (Math.abs(directionValue) < 0.000001) {
      if (originValue < minimum || originValue > maximum) return null;
      continue;
    }

    let entry = (minimum - originValue) / directionValue;
    let exit = (maximum - originValue) / directionValue;
    if (entry > exit) [entry, exit] = [exit, entry];
    near = Math.max(near, entry);
    far = Math.min(far, exit);
    if (near > far) return null;
  }

  if (far < 0) return null;
  return near > 0.02 ? near : far > 0.02 ? far : null;
}

function resolveBuildingCollisions(axis) {
  for (const building of world.buildings) {
    if (player.position.y > building.height + 0.15) continue;
    const nearX = player.position.x > building.minX - player.radius && player.position.x < building.maxX + player.radius;
    const nearZ = player.position.z > building.minZ - player.radius && player.position.z < building.maxZ + player.radius;
    if (!nearX || !nearZ) continue;

    const distLeft = Math.abs(player.position.x - building.minX);
    const distRight = Math.abs(building.maxX - player.position.x);
    const distBack = Math.abs(player.position.z - building.minZ);
    const distFront = Math.abs(building.maxZ - player.position.z);

    if (axis === "x") {
      if (distLeft < distRight) {
        player.position.x = building.minX - player.radius;
        player.wallNormal = vec(-1, 0, 0);
      } else {
        player.position.x = building.maxX + player.radius;
        player.wallNormal = vec(1, 0, 0);
      }
      player.velocity.x = Math.min(Math.abs(player.velocity.x), 0.5) * player.wallNormal.x;
    } else {
      if (distBack < distFront) {
        player.position.z = building.minZ - player.radius;
        player.wallNormal = vec(0, 0, -1);
      } else {
        player.position.z = building.maxZ + player.radius;
        player.wallNormal = vec(0, 0, 1);
      }
      player.velocity.z = Math.min(Math.abs(player.velocity.z), 0.5) * player.wallNormal.z;
    }
  }
}

function updateCamera(dt) {
  player.cameraJerkTime = Math.max(0, player.cameraJerkTime - dt);
  const jerkProgress = 1 - player.cameraJerkTime / player.cameraJerkDuration;
  const jerkEnvelope = player.cameraJerkTime > 0 ? Math.pow(1 - jerkProgress, 2) : 0;
  const jerkWobble = player.cameraJerkTime > 0 ? Math.sin(jerkProgress * Math.PI * 7) * 0.12 * jerkEnvelope : 0;
  const viewYaw = pointer.yaw + player.cameraJerkYaw * jerkEnvelope + jerkWobble;
  const viewPitch = pointer.pitch + player.cameraJerkPitch * jerkEnvelope - jerkWobble * 0.45;

  if (player.firstPerson || player.scoped) {
    const horizontal = Math.cos(viewPitch);
    const lookDirection = normalize(
      vec(
        Math.sin(viewYaw) * horizontal,
        Math.sin(viewPitch),
        Math.cos(viewYaw) * horizontal,
      ),
    );
    const desired = add(player.position, vec(0, 1.62, 0));
    camera.position = mix(camera.position, desired, 1 - Math.exp(-18 * dt));
    camera.target = add(camera.position, mul(lookDirection, 12));
  } else if (player.motorcycle) {
    const distance = player.motorcycleWallRide ? 11.5 : 9.4;
    const orbitDistance = Math.cos(viewPitch) * distance;
    const orbitHeight = -Math.sin(viewPitch) * distance;
    const desired = vec(
      player.position.x - Math.sin(viewYaw) * orbitDistance,
      player.position.y + 3.2 + orbitHeight,
      player.position.z - Math.cos(viewYaw) * orbitDistance,
    );
    camera.position = mix(camera.position, desired, 1 - Math.exp(-7 * dt));
    camera.target = add(player.position, vec(0, 1.25, 0));
  } else {
    const airStretch = player.onGround ? 0 : Math.min(4.5, Math.abs(player.flipVelocity) * 0.55);
    const distance = (player.bulletTime ? 8.3 : 7.2) + airStretch;
    const height = player.wallRunning ? 3.3 : 2.6;
    const flipPush = player.onGround ? 0 : Math.sin(player.flipAngle) * 3.6;
    const orbitDistance = Math.cos(viewPitch) * distance;
    const orbitHeight = -Math.sin(viewPitch) * distance;
    const desired = vec(
      player.position.x - Math.sin(viewYaw) * orbitDistance + Math.sin(viewYaw) * flipPush,
      player.position.y + height + orbitHeight + Math.cos(player.flipAngle) * 0.55,
      player.position.z - Math.cos(viewYaw) * orbitDistance + Math.cos(viewYaw) * flipPush,
    );
    camera.position = mix(camera.position, desired, 1 - Math.exp(-9 * dt));
    camera.target = add(
      player.position,
      add(vec(0, 1.35, 0), mul(vec(Math.sin(viewYaw), 0, Math.cos(viewYaw)), 1.6)),
    );
  }

  camera.forward = normalize(sub(camera.target, camera.position));
  camera.right = normalize(cross(vec(0, 1, 0), camera.forward));
  camera.up = normalize(cross(camera.forward, camera.right));
  const targetFov = player.scoped ? 24 : player.firstPerson ? (player.bulletTime ? 84 : 74) : player.bulletTime ? 78 : 66;
  camera.fov = lerp(camera.fov, targetFov, 1 - Math.exp(-5 * dt));
  camera.focal = canvas.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
}

function render() {
  drawSky();
  drawGroundGrid();
  drawStars();

  const faces = [];
  for (const object of world.objects) collectBoxFaces(object, faces);
  if (!world.multiplayer.connected) collectEnemyFaces(world.enemy, faces);
  for (const ghost of world.ghosts) {
    collectPlayerFaces(ghost.position, ghost.yaw, ghost.alpha, faces, true);
  }
  if (world.remotePlayer) collectPlayerFaces(world.remotePlayer.position, world.remotePlayer.yaw, 0.86, faces, true);
  if (player.motorcycle && !player.firstPerson) {
    collectMotorcycleFaces(player.position, player.yaw, faces);
  } else if (!player.firstPerson && !player.scoped) {
    collectPlayerFaces(player.position, player.yaw, 1, faces, false);
  } else if (player.kickTime > 0 || player.blocking || player.poleSwinging || player.vaulting) {
    collectFirstPersonCombatFaces(faces);
  }
  if (player.caughtBulletTime > 0) collectCaughtBulletFaces(faces);

  faces.sort((a, b) => b.depth - a.depth);
  for (const face of faces) drawFace(face);
  drawPoleSwingLine();
  drawGrappleCable();
  drawProjectiles();
  drawSpeedLines();
}

function drawPoleSwingLine() {
  if (!player.poleSwinging || !player.poleSwingAnchor) return;
  const hands = player.firstPerson
    ? { x: canvas.width * 0.5, y: canvas.height * 0.36 }
    : project(add(player.position, vec(0, 1.58, 0)));
  const anchor = project(player.poleSwingAnchor);
  if (!hands || !anchor) return;
  ctx.save();
  const gradient = ctx.createLinearGradient(hands.x, hands.y, anchor.x, anchor.y);
  gradient.addColorStop(0, "rgba(36, 44, 42, 0.96)");
  gradient.addColorStop(1, "rgba(111, 255, 181, 0.9)");
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(hands.x, hands.y);
  ctx.lineTo(anchor.x, anchor.y);
  ctx.stroke();
  ctx.fillStyle = "rgba(111, 255, 181, 0.92)";
  ctx.beginPath();
  ctx.arc(anchor.x, anchor.y, 4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function collectEnemyFaces(enemy, faces) {
  const kick = getEnemyKickAmount(enemy);
  const headKick = enemy.state === "windup" && enemy.attackTarget === "head";
  const grabbed = enemy.state === "grabbed";
  const thrown = enemy.state === "thrown";
  const disoriented = enemy.state === "disoriented";
  const running = enemy.state === "chase";
  const stride = running ? Math.sin(world.time * 8.4) : 0;
  const bodyPitch = grabbed ? Math.PI / 2 : thrown ? enemy.stateTime * 7.5 : running ? -0.13 : kick * -0.2;
  const bodyRoll = grabbed ? 0.35 : disoriented ? Math.sin(world.time * 7) * 0.3 : stride * 0.035;
  const coat = rgb(91, 25, 30);
  const armor = rgb(38, 43, 45);
  const fabric = rgb(51, 55, 56);
  const boot = rgb(20, 24, 25);
  const skin = rgb(151, 119, 101);
  const accentColor = disoriented ? rgb(242, 205, 72) : rgb(238, 74, 67);

  const part = (offset, size, color, pitch = 0, roll = 0, glow = 0) =>
    collectActorPart(enemy.position, enemy.yaw, bodyPitch, bodyRoll, offset, size, color, pitch, roll, 1, glow, faces);

  part(vec(0, 0.91, 0), vec(0.52, 0.34, 0.42), armor);
  part(vec(0, 1.28, 0), vec(0.7, 0.68, 0.46), coat, -0.03);
  part(vec(0, 1.34, 0.25), vec(0.49, 0.48, 0.08), armor);
  part(vec(0, 1.59, 0), vec(0.2, 0.16, 0.18), skin);
  part(vec(0, 1.83, 0), vec(0.43, 0.42, 0.41), skin);
  part(vec(0, 1.95, -0.03), vec(0.44, 0.18, 0.42), rgb(32, 27, 25));
  part(vec(0, 1.79, 0.22), vec(0.34, 0.1, 0.05), armor);
  part(vec(0, 1.43, 0.29), vec(0.28, 0.07, 0.05), accentColor, 0, 0, disoriented ? 0.55 : 0.2);
  for (const side of [-1, 1]) part(vec(side * 0.39, 1.45, 0), vec(0.24, 0.24, 0.38), armor, 0, side * 0.12);

  const caughtLeg = grabbed ? 1.45 : kick * (headKick ? 1.92 : 1.55);
  const kickLift = kick * (headKick ? 0.7 : 0.2);
  for (const side of [-1, 1]) {
    const striking = side === 1;
    const hipPitch = striking ? caughtLeg : stride * side * 0.62;
    const kneePitch = striking ? -kick * 0.28 : Math.max(0, -stride * side) * 0.72;
    part(vec(side * 0.2, 0.65 + (striking ? kickLift : 0), striking ? kick * 0.42 : 0), vec(0.27, 0.55, 0.3), fabric, hipPitch);
    part(vec(side * 0.2, 0.25 + (striking ? kickLift : 0), striking ? kick * 0.82 : 0), vec(0.23, 0.52, 0.25), armor, hipPitch + kneePitch);
    part(vec(side * 0.2, 0.05 + (striking ? kickLift : 0), striking ? 0.35 + kick * 0.98 : 0.12), vec(0.28, 0.18, 0.48), boot, hipPitch + kneePitch + 0.18);
  }

  const aiming = enemy.shotPoseTime > 0;
  for (const side of [-1, 1]) {
    const shoulderPitch = aiming ? 1.05 : -stride * side * 0.52;
    const elbowPitch = aiming ? -0.72 : -0.18 - Math.abs(stride) * 0.18;
    part(vec(side * 0.45, 1.35, aiming ? 0.13 : 0), vec(0.2, 0.43, 0.22), coat, shoulderPitch, side * 0.12);
    part(vec(side * 0.45, 1.03, aiming ? 0.38 : 0), vec(0.17, 0.4, 0.19), armor, shoulderPitch + elbowPitch, side * 0.08);
    part(vec(side * 0.45, 0.82, aiming ? 0.55 : 0.03), vec(0.19, 0.18, 0.2), skin, shoulderPitch + elbowPitch);
  }

  const rifleRaise = enemy.shotPoseTime > 0 ? 0.08 : -0.1;
  part(vec(0.28, 1.18 + rifleRaise, 0.46), vec(0.2, 0.2, 1.28), rgb(28, 35, 34), Math.PI / 2 - 0.12);
  part(vec(0.28, 1.2 + rifleRaise, 1.18), vec(0.08, 0.08, 0.7), rgb(62, 73, 70), Math.PI / 2 - 0.12);
  part(vec(0.28, 1.39 + rifleRaise, 0.49), vec(0.11, 0.11, 0.52), rgb(18, 24, 23), Math.PI / 2 - 0.12);
  part(vec(0.28, 1.08 + rifleRaise, -0.2), vec(0.34, 0.3, 0.46), rgb(47, 34, 31), Math.PI / 2 - 0.12);

  if (disoriented) {
    for (const side of [-1, 1]) {
      part(vec(side * 0.28, 2.18, 0), vec(0.08, 0.08, 0.08), palette.amber, 0, 0, 0.85);
    }
  }
}

function collectActorPart(position, yaw, bodyPitch, bodyRoll, offset, size, color, pitch, roll, alpha, glow, faces) {
  const center = transformPlayerOffset(position, offset, yaw, bodyPitch);
  collectBoxFaces({
    x: center.x,
    y: center.y,
    z: center.z,
    w: size.x,
    h: size.y,
    d: size.z,
    yaw,
    pitch: bodyPitch + pitch,
    roll: bodyRoll + roll,
    color,
    alpha,
    glow,
  }, faces);
}

function collectCaughtBulletFaces(faces) {
  const progress = player.caughtBulletTime / 0.38;
  const center = player.firstPerson
    ? add(camera.position, add(mul(camera.forward, 0.72), add(mul(camera.right, 0.28), mul(camera.up, -0.12))))
    : add(player.position, vec(Math.sin(player.yaw) * 0.48, 1.28, Math.cos(player.yaw) * 0.48));
  collectBoxFaces(
    {
      x: center.x,
      y: center.y,
      z: center.z,
      w: 0.11,
      h: 0.11,
      d: 0.34,
      yaw: player.firstPerson ? pointer.yaw : player.yaw,
      pitch: player.firstPerson ? pointer.pitch : 0,
      color: rgb(255, 218, 115),
      glow: 0.7 * progress,
    },
    faces,
  );
}

function getEnemyKickAmount(enemy) {
  if (enemy.state !== "windup") return 0;
  if (enemy.stateTime < 0.28) return enemy.stateTime / 0.28 * 0.35;
  if (enemy.stateTime < 0.5) return lerp(0.35, 1, (enemy.stateTime - 0.28) / 0.22);
  return clamp(1 - (enemy.stateTime - 0.5) / 0.3, 0, 1);
}

function collectMotorcycleFaces(position, yaw, faces) {
  const pitch = player.flipAngle;
  const roll = player.motorcycleLean;
  const addPart = (offset, size, color, partPitch = 0, partRoll = 0, glow = 0) => {
    const center = transformVehicleOffset(position, offset, yaw, pitch);
    collectBoxFaces(
      {
        x: center.x,
        y: center.y,
        z: center.z,
        w: size.x,
        h: size.y,
        d: size.z,
        yaw,
        pitch: pitch + partPitch,
        roll: roll + partRoll,
        color,
        glow,
      },
      faces,
    );
  };

  const rubber = rgb(24, 29, 29);
  const metal = rgb(69, 82, 80);
  const fairing = rgb(20, 35, 31);
  addPart(vec(0, 0.48, -0.92), vec(0.34, 0.92, 0.92), rubber);
  addPart(vec(0, 0.48, 0.92), vec(0.34, 0.92, 0.92), rubber);
  addPart(vec(0, 0.54, 0), vec(0.48, 0.25, 1.55), metal);
  addPart(vec(0, 0.82, 0.12), vec(0.72, 0.5, 0.82), fairing);
  addPart(vec(0, 1.06, -0.32), vec(0.65, 0.18, 0.78), rgb(34, 42, 40));
  addPart(vec(-0.27, 0.76, 0.66), vec(0.1, 0.95, 0.1), metal, -0.28);
  addPart(vec(0.27, 0.76, 0.66), vec(0.1, 0.95, 0.1), metal, -0.28);
  addPart(vec(0, 1.18, 0.68), vec(1.05, 0.1, 0.12), metal);
  addPart(vec(0, 1.0, 0.86), vec(0.42, 0.28, 0.16), rgb(217, 255, 226), 0, 0, 0.7);
  addPart(vec(0, 0.62, -0.55), vec(0.82, 0.16, 0.18), rgb(52, 65, 61));

  const riderPosition = transformVehicleOffset(position, vec(0, 0.48, -0.18), yaw, pitch);
  collectPlayerFaces(riderPosition, yaw, 1, faces, false);
}

function transformVehicleOffset(position, offset, yaw, pitch) {
  return add(position, rotateY(rotateX(offset, pitch), yaw));
}

function drawGrappleCable() {
  if (!player.grappling || !player.grappleAnchor) return;
  const start = player.firstPerson
    ? { x: canvas.width * 0.88, y: canvas.height * 0.79 }
    : project(add(player.position, vec(0, 1.3, 0)));
  const end = project(player.grappleAnchor);
  if (!start || !end) return;
  ctx.save();
  const cableGradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
  cableGradient.addColorStop(0, "rgba(55, 77, 69, 0.98)");
  cableGradient.addColorStop(0.75, "rgba(31, 51, 45, 0.98)");
  cableGradient.addColorStop(1, "rgba(92, 255, 164, 0.98)");
  ctx.strokeStyle = cableGradient;
  ctx.lineWidth = player.firstPerson ? 5 : 4;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.strokeStyle = "rgba(113, 255, 181, 0.82)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const hookSize = clamp(11 / Math.max(0.35, end.depth * 0.055), 5, 18);
  ctx.translate(end.x, end.y);
  ctx.rotate(Math.atan2(end.y - start.y, end.x - start.x));
  ctx.fillStyle = "rgba(29, 43, 38, 0.98)";
  ctx.strokeStyle = "rgba(111, 255, 181, 0.95)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-hookSize, -hookSize * 0.72);
  ctx.lineTo(-hookSize * 0.55, 0);
  ctx.lineTo(-hookSize, hookSize * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawProjectiles() {
  ctx.save();
  ctx.globalCompositeOperation = "screen";

  for (const wave of world.shockwaves) drawShockwave(wave);

  for (const projectile of world.projectiles) {
    const head = project(projectile.position);
    const tailPoint = sub(projectile.position, mul(projectile.direction, player.bulletTime ? 4.2 : 2.2));
    const tail = project(tailPoint);
    if (!head || !tail) continue;

    const enemyRound = projectile.owner === "enemy";
    const gradient = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
    gradient.addColorStop(0, enemyRound ? "rgba(255,78,44,0)" : "rgba(100,220,255,0)");
    gradient.addColorStop(0.62, enemyRound ? "rgba(255,108,58,0.76)" : "rgba(151,238,255,0.72)");
    gradient.addColorStop(1, enemyRound ? "rgba(255,240,174,1)" : "rgba(255,255,229,1)");
    ctx.strokeStyle = gradient;
    ctx.lineWidth = player.bulletTime ? 5 : 3;
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();

    ctx.fillStyle = enemyRound ? "rgba(255,229,164,0.98)" : "rgba(255,255,226,0.96)";
    ctx.shadowColor = enemyRound ? "rgba(255,76,38,0.96)" : "rgba(112,229,255,0.95)";
    ctx.shadowBlur = player.bulletTime ? 18 : 11;
    ctx.beginPath();
    ctx.arc(head.x, head.y, player.bulletTime ? 4.5 : 3, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function drawShockwave(wave) {
  const center = project(wave.position);
  if (!center) return;
  const edgeWorld = add(wave.position, mul(camera.right, wave.radius));
  const edge = project(edgeWorld);
  if (!edge) return;
  const radius = Math.max(2, Math.hypot(edge.x - center.x, edge.y - center.y));
  const alpha = Math.max(0, wave.life / wave.maxLife);

  ctx.save();
  ctx.translate(center.x, center.y);
  const facing = Math.abs(dot(wave.direction, camera.forward));
  ctx.scale(1, 0.28 + facing * 0.72);
  ctx.strokeStyle = `rgba(180, 242, 255, ${alpha * (0.34 + wave.force * 0.35)})`;
  ctx.lineWidth = 1.2 + wave.force * 2.2;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawSky() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#4e98d1");
  gradient.addColorStop(0.52, "#91c9e9");
  gradient.addColorStop(1, "#d8e8e7");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const sunX = canvas.width * 0.78;
  const sunY = canvas.height * 0.16;
  const sunGlow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, canvas.height * 0.16);
  sunGlow.addColorStop(0, "rgba(255,250,211,0.95)");
  sunGlow.addColorStop(0.18, "rgba(255,240,177,0.38)");
  sunGlow.addColorStop(1, "rgba(255,240,177,0)");
  ctx.fillStyle = sunGlow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (player.bulletTime) {
    ctx.fillStyle = "rgba(57, 255, 152, 0.045)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function drawGroundGrid() {
  const groundColor = player.bulletTime ? "rgba(52,144,93,0.16)" : "rgba(54,69,69,0.07)";
  ctx.lineWidth = 1;
  ctx.strokeStyle = groundColor;
  for (let i = -120; i <= 120; i += 8) {
    drawWorldLine(vec(i, 0.02, -120), vec(i, 0.02, 120));
    drawWorldLine(vec(-120, 0.02, i), vec(120, 0.02, i));
  }
}

function drawStars() {
  // Kept empty for daytime; the data remains available for a future day/night cycle.
}

function drawWorldLine(a, b) {
  const pa = project(a);
  const pb = project(b);
  if (!pa || !pb) return;
  ctx.beginPath();
  ctx.moveTo(pa.x, pa.y);
  ctx.lineTo(pb.x, pb.y);
  ctx.stroke();
}

function collectPlayerFaces(position, yaw, alpha, faces, ghost) {
  const lean = player.wallRunning && !ghost ? (player.wallNormal.x * -0.22 || player.wallNormal.z * 0.22) : 0;
  const flip = ghost ? 0 : player.flipAngle;
  const slideOffset = !ghost && player.slideTime > 0 ? -0.42 : 0;
  const kick = ghost ? 0 : getKickAmount();
  const block = !ghost && player.blocking ? 1 : 0;
  const swinging = !ghost && player.poleSwinging;
  const vaulting = !ghost && player.vaulting;
  const vaultProgress = vaulting ? clamp(player.vaultTime / player.vaultDuration, 0, 1) : 0;
  const vaultPose = Math.sin(vaultProgress * Math.PI);
  const speed = Math.hypot(player.velocity.x, player.velocity.z);
  const moving = !ghost && player.onGround && speed > 0.45 && !block && kick <= 0;
  const stride = moving ? Math.sin(world.time * (7.5 + Math.min(speed, 10) * 0.55)) : 0;
  const bodyPitch = flip - kick * 0.14 + (moving ? -0.07 : 0) + vaultPose * 0.28;
  const bodyRoll = lean + stride * 0.025;
  const coat = ghost ? palette.green : rgb(14, 17, 17);
  const coatMid = ghost ? palette.green : rgb(28, 34, 32);
  const trousers = ghost ? palette.green : rgb(23, 27, 28);
  const boot = ghost ? palette.green : rgb(9, 12, 12);
  const skin = ghost ? palette.green : palette.skin;
  const glow = ghost ? 0.44 : 0;
  const part = (offset, size, color, pitch = 0, roll = 0, partGlow = glow) =>
    collectActorPart(position, yaw, bodyPitch, bodyRoll, offset, size, color, pitch, roll, alpha, partGlow, faces);

  part(vec(0, 0.9 + slideOffset, 0), vec(0.5, 0.32, 0.4), trousers);
  part(vec(0, 1.27 + slideOffset, 0), vec(0.64, 0.68, 0.43), coat, -0.04);
  part(vec(0, 1.32 + slideOffset, 0.24), vec(0.38, 0.5, 0.06), coatMid);
  part(vec(0, 1.56 + slideOffset, 0), vec(0.18, 0.15, 0.17), skin);
  part(vec(0, 1.79 + slideOffset, 0), vec(0.4, 0.4, 0.39), skin);
  part(vec(0, 1.91 + slideOffset, -0.02), vec(0.41, 0.16, 0.39), coat);
  part(vec(0, 1.76 + slideOffset, 0.21), vec(0.31, 0.08, 0.05), coat);
  part(vec(0, 1.08 + slideOffset, -0.25), vec(0.08, 0.88, 0.05), palette.green, 0, 0, ghost ? 0.55 : 0.32);
  for (const side of [-1, 1]) part(vec(side * 0.36, 1.42 + slideOffset, 0), vec(0.2, 0.21, 0.34), coatMid, 0, side * 0.1);

  for (const side of [-1, 1]) {
    const kickingLeg = side === 1;
    const hipPitch = vaulting ? 0.82 : kickingLeg && kick > 0 ? kick * 1.5 : stride * side * 0.64;
    const kneePitch = vaulting ? -1.05 : kickingLeg && kick > 0 ? -0.34 * (1 - kick) : Math.max(0, -stride * side) * 0.72;
    const lift = vaulting ? vaultPose * 0.24 : kickingLeg ? kick * 0.25 : 0;
    const forward = vaulting ? -0.08 + vaultPose * 0.12 : kickingLeg ? kick * 0.5 : 0;
    part(vec(side * 0.19, 0.65 + slideOffset + lift, forward), vec(0.25, 0.52, 0.28), trousers, hipPitch);
    part(vec(side * 0.19, 0.25 + slideOffset + lift, forward + kick * 0.38), vec(0.21, 0.5, 0.23), trousers, hipPitch + kneePitch);
    part(vec(side * 0.19, 0.05 + slideOffset + lift, 0.13 + forward + kick * 0.55), vec(0.27, 0.17, 0.46), boot, hipPitch + kneePitch + 0.15);
  }

  for (const side of [-1, 1]) {
    const shoulderPitch = swinging ? 2.65 : vaulting ? 1.35 : block ? 1.05 : -stride * side * 0.5 + kick * 0.2;
    const elbowPitch = swinging ? -0.38 : vaulting ? -0.72 : block ? -0.78 : -0.14 - Math.abs(stride) * 0.16;
    const armForward = swinging ? 0.28 : vaulting ? 0.45 : block ? 0.2 : kick * 0.08;
    const armRoll = swinging ? side * 0.22 : vaulting ? side * 0.18 : block ? side * 0.5 : side * 0.12;
    const armLift = swinging ? 0.16 : vaulting ? 0.08 : block * 0.08;
    part(vec(side * 0.43, 1.34 + slideOffset + armLift, armForward), vec(0.19, 0.42, 0.21), coat, shoulderPitch, armRoll);
    part(vec(side * 0.3, 1.16 + slideOffset + armLift, armForward + (swinging ? 0.28 : block * 0.25)), vec(0.16, 0.38, 0.18), coatMid, shoulderPitch + elbowPitch, armRoll * 0.7);
    part(vec(side * 0.18, 1.18 + slideOffset + armLift, armForward + (swinging ? 0.52 : block * 0.43)), vec(0.18, 0.17, 0.19), skin, shoulderPitch + elbowPitch, armRoll * 0.5);
  }
}

function collectPlayerLimb(position, offset, size, yaw, flip, limbPitch, limbRoll, alpha, ghost, faces) {
  const center = transformPlayerOffset(position, offset, yaw, flip);
  collectBoxFaces(
    {
      x: center.x,
      y: center.y,
      z: center.z,
      w: size.x,
      h: size.y,
      d: size.z,
      yaw,
      pitch: flip + limbPitch,
      roll: limbRoll,
      color: ghost ? palette.green : palette.coat,
      glow: ghost ? 0.42 : 0,
      alpha,
    },
    faces,
  );
}

function getKickAmount() {
  if (player.kickTime <= 0) return 0;
  const progress = 1 - player.kickTime / 0.48;
  return Math.sin(progress * Math.PI);
}

function collectFirstPersonCombatFaces(faces) {
  const kick = getKickAmount();
  const origin = add(camera.position, mul(camera.forward, 0.72));
  const addViewPart = (rightAmount, upAmount, forwardAmount, size, color, pitch, roll) => {
    const center = add(camera.position, add(mul(camera.right, rightAmount), add(mul(camera.up, upAmount), mul(camera.forward, forwardAmount))));
    collectBoxFaces({
      x: center.x,
      y: center.y,
      z: center.z,
      w: size.x,
      h: size.y,
      d: size.z,
      yaw: pointer.yaw,
      pitch: pointer.pitch + pitch,
      roll,
      color,
    }, faces);
  };

  if (player.blocking) {
    for (const side of [-1, 1]) {
      addViewPart(side * 0.32, -0.23, 0.72, vec(0.22, 0.43, 0.24), rgb(22, 27, 26), 0.84, side * 0.54);
      addViewPart(side * 0.2, 0.02, 0.94, vec(0.18, 0.4, 0.2), rgb(35, 42, 40), 1.2, side * 0.34);
      addViewPart(side * 0.12, 0.18, 1.08, vec(0.2, 0.18, 0.2), palette.skin, 1.12, side * 0.22);
    }
  }

  if (player.poleSwinging) {
    for (const side of [-1, 1]) {
      addViewPart(side * 0.2, -0.04, 0.72, vec(0.21, 0.44, 0.23), rgb(22, 27, 26), 1.22, side * 0.2);
      addViewPart(side * 0.1, 0.18, 0.98, vec(0.17, 0.4, 0.19), rgb(35, 42, 40), 1.45, side * 0.1);
      addViewPart(side * 0.05, 0.36, 1.12, vec(0.19, 0.17, 0.19), palette.skin, 1.45, 0);
    }
  }

  if (player.vaulting) {
    const progress = clamp(player.vaultTime / player.vaultDuration, 0, 1);
    const plant = Math.sin(progress * Math.PI);
    for (const side of [-1, 1]) {
      addViewPart(side * 0.3, -0.28 + plant * 0.12, 0.7, vec(0.21, 0.43, 0.23), rgb(22, 27, 26), 0.88, side * 0.42);
      addViewPart(side * 0.2, -0.05 + plant * 0.1, 0.96, vec(0.17, 0.39, 0.19), rgb(35, 42, 40), 1.28, side * 0.24);
      addViewPart(side * 0.14, 0.08 + plant * 0.05, 1.13, vec(0.19, 0.17, 0.19), palette.skin, 1.34, side * 0.12);
    }
  }

  if (kick > 0) {
    const chamber = Math.sin(Math.min(1, kick * 1.25) * Math.PI * 0.5);
    addViewPart(0.17, -0.72 + chamber * 0.22, 0.62 + kick * 0.42, vec(0.29, 0.5, 0.32), rgb(24, 28, 29), 0.72 + kick * 0.48, 0.04);
    addViewPart(0.16, -0.58 + kick * 0.2, 0.9 + kick * 0.72, vec(0.25, 0.5, 0.28), rgb(20, 24, 25), 1.0 + kick * 0.42, 0.03);
    addViewPart(0.16, -0.45 + kick * 0.16, 1.18 + kick * 0.85, vec(0.31, 0.2, 0.5), rgb(8, 11, 11), 1.2 + kick * 0.38, 0.02);
  }
}

function transformPlayerOffset(position, offset, yaw, pitch) {
  const pivoted = sub(offset, vec(0, 1, 0));
  const rotated = rotateY(rotateX(pivoted, pitch), yaw);
  return add(position, add(vec(0, 1, 0), rotated));
}

function collectBoxFaces(box, faces) {
  const vertices = boxVertices(box);
  const rotateNormal = (normal) => {
    let rotated = box.pitch ? rotateX(normal, box.pitch) : normal;
    rotated = rotateY(rotated, box.yaw || 0);
    if (box.roll) rotated = rotateZ(rotated, box.roll);
    return rotated;
  };
  const faceDefs = [
    { points: [4, 5, 6, 7], normal: rotateNormal(vec(0, 0, 1)) },
    { points: [1, 0, 3, 2], normal: rotateNormal(vec(0, 0, -1)) },
    { points: [0, 4, 7, 3], normal: rotateNormal(vec(-1, 0, 0)) },
    { points: [5, 1, 2, 6], normal: rotateNormal(vec(1, 0, 0)) },
    { points: [3, 7, 6, 2], normal: rotateNormal(vec(0, 1, 0)) },
    { points: [0, 1, 5, 4], normal: rotateNormal(vec(0, -1, 0)) },
  ];

  for (const face of faceDefs) {
    const worldPoints = face.points.map((index) => vertices[index]);
    const center = average(worldPoints);
    const toCamera = normalize(sub(camera.position, center));
    if (dot(face.normal, toCamera) <= -0.04) continue;

    const cameraPoints = worldPoints.map(worldToCamera);
    const clippedPoints = clipPolygonToNearPlane(cameraPoints, 0.025);
    if (clippedPoints.length < 3) continue;
    const projected = clippedPoints.map(projectCameraPoint);
    const depth = clippedPoints.reduce((sum, point) => sum + point.z, 0) / clippedPoints.length;
    const light = shadeFor(face.normal, box.glow || 0);
    faces.push({
      points: projected,
      depth,
      color: applyShade(box.color, light),
      alpha: box.alpha ?? 1,
      glow: box.glow || 0,
    });
  }
}

function worldToCamera(point) {
  const rel = sub(point, camera.position);
  return vec(dot(rel, camera.right), dot(rel, camera.up), dot(rel, camera.forward));
}

function projectCameraPoint(point) {
  return {
    x: canvas.width / 2 + (point.x * camera.focal) / point.z,
    y: canvas.height / 2 - (point.y * camera.focal) / point.z,
    depth: point.z,
  };
}

function clipPolygonToNearPlane(points, near) {
  const clipped = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[(index + points.length - 1) % points.length];
    const currentInside = current.z >= near;
    const previousInside = previous.z >= near;

    if (currentInside !== previousInside) {
      const amount = (near - previous.z) / (current.z - previous.z);
      clipped.push(vec(lerp(previous.x, current.x, amount), lerp(previous.y, current.y, amount), near));
    }
    if (currentInside) clipped.push(current);
  }
  return clipped;
}

function boxVertices(box) {
  const hx = box.w / 2;
  const hy = box.h / 2;
  const hz = box.d / 2;
  const local = [
    vec(-hx, -hy, -hz),
    vec(hx, -hy, -hz),
    vec(hx, hy, -hz),
    vec(-hx, hy, -hz),
    vec(-hx, -hy, hz),
    vec(hx, -hy, hz),
    vec(hx, hy, hz),
    vec(-hx, hy, hz),
  ];
  const yaw = box.yaw || 0;
  const pitch = box.pitch || 0;
  const roll = box.roll || 0;
  return local.map((point) => {
    let rotated = pitch ? rotateX(point, pitch) : point;
    rotated = rotateY(rotated, yaw);
    if (roll) rotated = rotateZ(rotated, roll);
    return add(rotated, vec(box.x, box.y, box.z));
  });
}

function drawFace(face) {
  ctx.save();
  ctx.globalAlpha = face.alpha;
  ctx.beginPath();
  ctx.moveTo(face.points[0].x, face.points[0].y);
  for (let i = 1; i < face.points.length; i += 1) ctx.lineTo(face.points[i].x, face.points[i].y);
  ctx.closePath();
  ctx.fillStyle = css(face.color);
  ctx.fill();
  if (face.glow > 0) {
    ctx.globalAlpha = Math.min(face.alpha, face.glow * 0.32);
    ctx.strokeStyle = css(face.color);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else {
    ctx.globalAlpha = face.alpha * 0.18;
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
  ctx.restore();
}

function drawSpeedLines() {
  const speed = Math.hypot(player.velocity.x, player.velocity.z);
  if (!player.bulletTime && speed < 9) return;
  const count = player.bulletTime ? 22 : 10;
  ctx.save();
  ctx.strokeStyle = player.bulletTime ? "rgba(109,255,174,0.2)" : "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * TAU + world.time * 0.7;
    const inner = 80 + (i % 4) * 18;
    const outer = inner + 42 + speed * 3;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    ctx.stroke();
  }
  ctx.restore();
}

function spawnGhost(strong) {
  world.ghosts.push({
    position: { ...player.position },
    yaw: player.yaw,
    alpha: strong ? 0.38 : 0.2,
    life: strong ? 0.42 : 0.28,
    maxLife: strong ? 0.42 : 0.28,
  });
  if (world.ghosts.length > 24) world.ghosts.shift();
}

function updateGhosts(dt) {
  for (const ghost of world.ghosts) {
    ghost.life -= dt;
    ghost.alpha = 0.34 * Math.max(0, ghost.life / ghost.maxLife);
  }
  world.ghosts = world.ghosts.filter((ghost) => ghost.life > 0);
}

function updateHud() {
  focusBar.style.transform = `scaleX(${player.focus.toFixed(3)})`;
  dashBar.style.transform = `scaleX(${Math.max(0, 1 - player.dashCooldown).toFixed(3)})`;
  playerHealthBar.style.transform = `scaleX(${(player.health / player.maxHealth).toFixed(3)})`;
  playerHealthText.textContent = String(Math.ceil(player.health));
  const healthTarget = world.multiplayer.connected ? world.remotePlayer : world.enemy;
  targetHealthLabel.textContent = world.multiplayer.connected ? "Opponent" : "Enemy";
  enemyHealthBar.style.transform = `scaleX(${healthTarget ? (healthTarget.health / 100).toFixed(3) : 0})`;
  const enemyScreen = healthTarget ? project(add(healthTarget.position, vec(0, 2.45, 0))) : null;
  if (enemyScreen) {
    const displayScale = Math.min(window.devicePixelRatio || 1, 2);
    enemyHealthHud.style.display = "block";
    enemyHealthHud.style.left = `${enemyScreen.x / displayScale}px`;
    enemyHealthHud.style.top = `${enemyScreen.y / displayScale}px`;
  } else {
    enemyHealthHud.style.display = "none";
  }
  if (player.vaulting) {
    modeReadout.textContent = "Vaulting";
  } else if (player.wallRunning) {
    modeReadout.textContent = "Wall Run";
  } else if (player.poleSwinging) {
    modeReadout.textContent = "Pole Swing - Release E";
  } else if (!world.multiplayer.connected && world.enemy.state === "grabbed") {
    modeReadout.textContent = "Leg Catch - Release Q";
  } else if (player.motorcycleWallRide) {
    modeReadout.textContent = "Bike Wall Ride";
  } else if (player.motorcycle) {
    modeReadout.textContent = "Motorcycle";
  } else if (player.blocking) {
    modeReadout.textContent = "Blocking";
  } else if (player.kickTime > 0) {
    modeReadout.textContent = "Kick";
  } else if (player.bulletTime) {
    modeReadout.textContent = "Bullet Time";
  } else if (!player.onGround) {
    modeReadout.textContent = "Airborne";
  } else {
    modeReadout.textContent = "Grounded";
  }
  speedReadout.textContent = `${Math.hypot(player.velocity.x, player.velocity.z).toFixed(1)} m/s`;
  weaponName.textContent = player.motorcycle
    ? "Motorcycle"
    : player.sniperEquipped
      ? "Sniper Rifle"
      : player.grappleEquipped
        ? "Grapple Hook"
        : "Unarmed";
  weaponState.textContent = player.motorcycle
    ? `${Math.abs(player.motorcycleSpeed).toFixed(0)} m/s | 3 dismiss`
    : player.sniperEquipped
    ? player.scoped
      ? "Scoped"
      : "RMB to scope"
    : player.grappleEquipped
      ? player.grappling
        ? "Attached"
        : "LMB to grapple"
      : "1 rifle / 2 grapple";
}

function project(point) {
  const rel = sub(point, camera.position);
  const x = dot(rel, camera.right);
  const y = dot(rel, camera.up);
  const z = dot(rel, camera.forward);
  if (z < 0.08) return null;
  return {
    x: canvas.width / 2 + (x * camera.focal) / z,
    y: canvas.height / 2 - (y * camera.focal) / z,
    depth: z,
  };
}

function shadeFor(normal, glow) {
  const light = normalize(vec(-0.48, 0.82, 0.32));
  const direct = Math.max(0, dot(normal, light));
  return clamp(0.52 + direct * 0.58 + glow * 0.75, 0.34, 1.38);
}

function resize() {
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * scale);
  canvas.height = Math.floor(window.innerHeight * scale);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  canvas.width = Math.floor(window.innerWidth * scale);
  canvas.height = Math.floor(window.innerHeight * scale);
  camera.focal = canvas.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
}

function vec(x, y, z) {
  return { x, y, z };
}

function add(a, b) {
  return vec(a.x + b.x, a.y + b.y, a.z + b.z);
}

function sub(a, b) {
  return vec(a.x - b.x, a.y - b.y, a.z - b.z);
}

function mul(a, scalar) {
  return vec(a.x * scalar, a.y * scalar, a.z * scalar);
}

function mix(a, b, t) {
  return vec(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
  return vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

function lengthSq(a) {
  return a.x * a.x + a.y * a.y + a.z * a.z;
}

function normalize(a) {
  const len = Math.sqrt(lengthSq(a)) || 1;
  return vec(a.x / len, a.y / len, a.z / len);
}

function average(points) {
  const sum = points.reduce((acc, point) => add(acc, point), vec(0, 0, 0));
  return mul(sum, 1 / points.length);
}

function rotateY(point, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return vec(point.x * c + point.z * s, point.y, -point.x * s + point.z * c);
}

function rotateX(point, pitch) {
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  return vec(point.x, point.y * c - point.z * s, point.y * s + point.z * c);
}

function rotateZ(point, roll) {
  const c = Math.cos(roll);
  const s = Math.sin(roll);
  return vec(point.x * c - point.y * s, point.x * s + point.y * c, point.z);
}

function rgb(r, g, b) {
  return { r, g, b };
}

function applyShade(color, shade) {
  return rgb(clamp(color.r * shade, 0, 255), clamp(color.g * shade, 0, 255), clamp(color.b * shade, 0, 255));
}

function css(color) {
  return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}
