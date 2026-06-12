(() => {
  const game = window.__matrixGame;
  const hostButton = document.querySelector("#host-match");
  const joinButton = document.querySelector("#join-match");
  const codeInput = document.querySelector("#match-code");
  const status = document.querySelector("#match-status");
  const startPanel = document.querySelector("#start-panel");
  const roomStatus = document.querySelector("#room-status");
  const roomLabel = document.querySelector("#room-label");
  const copyButton = document.querySelector("#copy-room");
  const prefix = "matrix-city-";
  let peer = null;
  let connection = null;
  let roomCode = "";
  let sendTimer = 0;

  const cleanCode = (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  const makeCode = () => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let value = "";
    for (let i = 0; i < 5; i += 1) value += alphabet[Math.floor(Math.random() * alphabet.length)];
    return value;
  };

  function setStatus(message, error = false) {
    status.textContent = message;
    status.style.color = error ? "#ff958a" : "";
  }

  function setRoomLabel(message, canCopy = false) {
    roomStatus.hidden = false;
    roomLabel.textContent = message;
    copyButton.hidden = !canCopy;
  }

  function playerSnapshot() {
    const { player } = game;
    return {
      position: { ...player.position },
      velocity: { ...player.velocity },
      yaw: player.yaw,
      health: player.health,
      blocking: player.blocking,
      kicking: player.kickTime > 0,
      kickProgress: player.kickTime > 0 ? 1 - player.kickTime / 0.48 : 0,
      grabbed: player.pvpGrabbed,
      vaulting: player.vaulting,
      motorcycle: player.motorcycle,
      sniperEquipped: player.sniperEquipped,
      grappleEquipped: player.grappleEquipped,
    };
  }

  function send(message) {
    if (connection?.open) connection.send(message);
  }

  function applyRemoteState(remote) {
    if (remote.kicking && remote.kickProgress >= 0.18 && remote.kickProgress <= 0.92) {
      game.world.multiplayer.remoteKickCatchUntil = performance.now() + 220;
    }
    if (!game.world.remotePlayer) game.world.remotePlayer = remote;
    else Object.assign(game.world.remotePlayer, remote);
  }

  function receive(message) {
    if (message.type === "state") {
      applyRemoteState(message.player);
    } else if (message.type === "shot") {
      const origin = { ...message.origin };
      game.world.projectiles.push({
        position: origin,
        previous: origin,
        direction: { ...message.direction },
        speed: 78,
        life: 2.4,
        waveTimer: 0,
        owner: "remote-player",
      });
    } else if (message.type === "kick-attempt") {
      game.handleIncomingKick(message);
    } else if (message.type === "kick-caught") {
      game.player.kickTime = 0;
      game.player.kickHit = true;
      game.player.pvpGrabbed = true;
      game.player.pvpGrabbedTime = 2.6;
      game.player.velocity = { x: 0, y: 0, z: 0 };
    } else if (message.type === "kick-throw") {
      game.player.pvpGrabbed = false;
      game.player.pvpGrabbedTime = 0;
      game.damagePlayer(18);
      game.player.velocity.x = message.direction.x * 12;
      game.player.velocity.z = message.direction.z * 12;
      game.player.velocity.y = 5.8;
    }
  }

  function beginMatch(conn) {
    connection = conn;
    connection.on("data", receive);
    connection.on("close", disconnect);
    connection.on("error", () => disconnect("Connection lost"));
    connection.on("open", () => {
      game.world.multiplayer.connected = true;
      game.world.multiplayer.spawnPosition = game.world.multiplayer.isHost
        ? { x: 0, y: 0, z: 8 }
        : { x: 0, y: 0, z: -8 };
      game.player.position = { ...game.world.multiplayer.spawnPosition };
      game.player.velocity = { x: 0, y: 0, z: 0 };
      game.player.health = game.player.maxHealth;
      game.world.projectiles = game.world.projectiles.filter((projectile) => projectile.owner !== "enemy");
      startPanel.classList.add("hidden");
      setRoomLabel(`Room ${roomCode} - 2 players`, true);
      history.replaceState(null, "", `${location.pathname}?room=${roomCode}`);
      sendLoop(performance.now());
    });
  }

  function sendLoop(now) {
    if (!connection?.open) return;
    if (now - sendTimer >= 50) {
      sendTimer = now;
      send({
        type: "state",
        player: playerSnapshot(),
      });
    }
    requestAnimationFrame(sendLoop);
  }

  function disconnect(message = "Other player left") {
    game.world.multiplayer.connected = false;
    game.world.remotePlayer = null;
    game.world.multiplayer.caughtOpponent = false;
    game.player.pvpGrabbed = false;
    connection = null;
    setRoomLabel(message, game.world.multiplayer.isHost);
  }

  function peerError(error) {
    const message = error?.type === "unavailable-id" ? "That room code is already in use. Try hosting again." : "Could not reach the match service.";
    setStatus(message, true);
  }

  function hostMatch() {
    if (!window.Peer) return setStatus("Online match service did not load.", true);
    peer?.destroy();
    roomCode = makeCode();
    game.world.multiplayer.isHost = true;
    setStatus(`Room ${roomCode} created. Share the code or link.`);
    setRoomLabel(`Room ${roomCode} - waiting`, true);
    peer = new Peer(`${prefix}${roomCode}`);
    peer.on("connection", (conn) => {
      if (connection?.open) return conn.close();
      beginMatch(conn);
    });
    peer.on("error", peerError);
  }

  function joinMatch() {
    if (!window.Peer) return setStatus("Online match service did not load.", true);
    roomCode = cleanCode(codeInput.value);
    if (roomCode.length !== 5) return setStatus("Enter the five-character room code.", true);
    peer?.destroy();
    game.world.multiplayer.isHost = false;
    setStatus(`Joining room ${roomCode}...`);
    peer = new Peer();
    peer.on("open", () => beginMatch(peer.connect(`${prefix}${roomCode}`, { reliable: false })));
    peer.on("error", peerError);
  }

  codeInput.addEventListener("input", () => {
    codeInput.value = cleanCode(codeInput.value);
  });
  codeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") joinMatch();
  });
  hostButton.addEventListener("click", hostMatch);
  joinButton.addEventListener("click", joinMatch);
  copyButton.addEventListener("click", async () => {
    const link = `${location.origin}${location.pathname}?room=${roomCode}`;
    await navigator.clipboard.writeText(link);
    copyButton.textContent = "Copied";
    setTimeout(() => { copyButton.textContent = "Copy code"; }, 1200);
  });
  window.addEventListener("matrix-shot", (event) => send({ type: "shot", ...event.detail }));
  window.addEventListener("matrix-kick-attempt", (event) => send({ type: "kick-attempt", ...event.detail }));
  window.addEventListener("matrix-kick-caught", () => send({ type: "kick-caught" }));
  window.addEventListener("matrix-kick-throw", (event) => send({ type: "kick-throw", ...event.detail }));

  const linkedRoom = cleanCode(new URLSearchParams(location.search).get("room") || "");
  if (linkedRoom) {
    codeInput.value = linkedRoom;
    setStatus(`Room ${linkedRoom} is ready to join.`);
  }
})();
