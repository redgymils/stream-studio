// Normalize channel list so it works with either `CHANNELS` (object format) or `CH` (array format)
const STREAM_LIST = (typeof CHANNELS !== "undefined")
  ? CHANNELS.map((c) => ({ name: c.name, desc: c.desc, url: c.url, kid: c.kid, key: c.key }))
  : (typeof CH !== "undefined")
    ? CH.map((c, i) => {
        const parts = (c[2] || "").split(":");
        return { name: c[0], desc: "Camera Feed 0" + (i + 1), url: c[1], kid: parts[0] || "", key: parts[1] || "" };
      })
    : [];

const vid = document.getElementById("v");
const stage = document.getElementById("stage");
const load = document.getElementById("load");
const hint = document.getElementById("hint");
const playBtn = document.getElementById("play-btn");
const playIcon = document.getElementById("play-icon");
const muteBtn = document.getElementById("mute-btn");
const volIcon = document.getElementById("vol-icon");
const volSlider = document.getElementById("vol-slider");
const fsBtn = document.getElementById("fs-btn");
const gridBtn = document.getElementById("grid-btn");
const pipBtn = document.getElementById("pip-btn");
const liveBtn = document.getElementById("live-btn");
const gridContainer = document.getElementById("grid-container");
const vidContainer = document.getElementById("vid-container");
const activeTitle = document.getElementById("active-channel-title");

// Resolution Controls
const resoBtn = document.getElementById("reso-btn");
const resoMenu = document.getElementById("reso-menu");
const resoLabel = document.getElementById("reso-label");
let preferredResolution = "auto";

// macOS Traffic Light Buttons
const tlClose = document.getElementById("tl-close");
const tlGrid = document.getElementById("tl-grid");
const tlFs = document.getElementById("tl-fs");

let player = null;
let cur = -1;
let watchdog = null;
let isGridMode = false;
let gridPlayers = [];
let scale = 1, rotation = 0, startDist = 0, isTouching = false;


// Suspend players when tab is minimized
document.addEventListener("visibilitychange", function () {
  if (document.pictureInPictureElement) return;

  if (document.hidden) {
    if (isGridMode) {
      gridPlayers.forEach((p) => { if (p.getMediaElement()) p.getMediaElement().pause(); });
    } else if (!vid.paused) {
      vid.pause();
    }
  } else {
    if (isGridMode) {
      gridPlayers.forEach((p) => {
        const el = p.getMediaElement();
        if (el) el.play().catch(() => {});
      });
    } else {
      if (player) {
        const r = player.seekRange();
        if (r && r.end) vid.currentTime = r.end - 1;
      }
      if (vid.paused) vid.play().catch(() => {});
    }
  }
});

// Picture-in-Picture
if (pipBtn) {
  pipBtn.onclick = async function () {
    if (isGridMode) {
      alert("Picture-in-Picture is only available in single-camera view.");
      return;
    }
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (vid.requestPictureInPicture) {
        await vid.requestPictureInPicture();
      }
    } catch (err) {
      console.warn("PiP not supported or blocked.");
    }
  };
}

// Jump to Live
liveBtn.onclick = function () {
  if (player && !isGridMode) {
    const r = player.seekRange();
    if (r && r.end) vid.currentTime = r.end - 1;
    if (vid.paused) vid.play().catch(() => {});
    liveBtn.classList.remove("behind-live");
    liveBtn.textContent = "LIVE";
  }
};

// Pinch-to-Zoom & Double-Tap Reset
stage.addEventListener("touchstart", function (e) {
  if (e.touches.length === 2 && !isGridMode) {
    isTouching = true;
    startDist = Math.hypot(
      e.touches[0].pageX - e.touches[1].pageX,
      e.touches[0].pageY - e.touches[1].pageY
    );
  }
}, { passive: true });

stage.addEventListener("touchmove", function (e) {
  if (!isTouching || e.touches.length !== 2 || isGridMode) return;
  e.preventDefault();
  const currentDist = Math.hypot(
    e.touches[0].pageX - e.touches[1].pageX,
    e.touches[0].pageY - e.touches[1].pageY
  );
  scale = Math.min(Math.max(scale * (currentDist / startDist), 1), 5);
  vid.style.transform = `scale(${scale}) rotate(${rotation}deg)`;
  startDist = currentDist;
}, { passive: false });

stage.addEventListener("touchend", function (e) {
  if (e.touches.length < 2) isTouching = false;
});

let lastTap = 0;
vid.addEventListener("touchend", function (e) {
  if (isGridMode) return;
  const now = Date.now();
  if (now - lastTap < 300 && now - lastTap > 0) {
    scale = 1; rotation = 0;
    vid.style.transform = "scale(1) rotate(0deg)";
    e.preventDefault();
  }
  lastTap = now;
});

function setLoad(on, name, msg) {
  if (on) {
    load.querySelector(".s").textContent = msg || ("Connecting to " + name + "...");
    load.classList.add("show");
  } else {
    load.classList.remove("show");
  }
}

function markRow(i) {
  const rows = document.querySelectorAll(".r");
  rows.forEach((row, k) => {
    const isSelected = k === i;
    row.classList.toggle("on", isSelected);
    const badge = row.querySelector(".ch-badge");
    if (badge) badge.textContent = isSelected ? "ON AIR" : "HD";
  });
}

function stopWatch() {
  if (watchdog) { clearInterval(watchdog); watchdog = null; }
}

function updateResolutionMenu() {
  if (!player) return;
  resoMenu.innerHTML = "";
  const tracks = player.getVariantTracks();
  const heights = [...new Set(tracks.map((t) => t.height).filter(Boolean))].sort((a, b) => b - a);

  const autoBtn = document.createElement("button");
  autoBtn.className = "reso-item" + (preferredResolution === "auto" ? " active" : "");
  autoBtn.textContent = "Auto";
  autoBtn.onclick = function () {
    preferredResolution = "auto";
    player.configure({ abr: { enabled: true } });
    resoLabel.textContent = "AUTO";
    document.querySelectorAll(".reso-item").forEach((b) => b.classList.remove("active"));
    autoBtn.classList.add("active");
    resoMenu.classList.add("hidden");
  };
  resoMenu.appendChild(autoBtn);

  heights.forEach((h) => {
    const btn = document.createElement("button");
    btn.className = "reso-item" + (preferredResolution === h ? " active" : "");
    btn.textContent = h + "p";
    btn.onclick = function () {
      preferredResolution = h;
      player.configure({ abr: { enabled: false } });
      const track = player.getVariantTracks().find((t) => t.height === h);
      if (track) player.selectVariantTrack(track, true);
      resoLabel.textContent = h + "p";
      document.querySelectorAll(".reso-item").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      resoMenu.classList.add("hidden");
    };
    resoMenu.appendChild(btn);
  });

  if (preferredResolution !== "auto") {
    player.configure({ abr: { enabled: false } });
    let savedTrack = player.getVariantTracks().find((t) => t.height === preferredResolution);
    if (!savedTrack && heights.length) {
      const closestHeight = heights.find((ht) => ht <= preferredResolution) || heights[heights.length - 1];
      savedTrack = player.getVariantTracks().find((t) => t.height === closestHeight);
    }
    if (savedTrack) {
      player.selectVariantTrack(savedTrack, true);
      resoLabel.textContent = savedTrack.height + "p";
      document.querySelectorAll(".reso-item").forEach((b) => {
        b.classList.toggle("active", b.textContent === savedTrack.height + "p");
      });
    }
  } else {
    resoLabel.textContent = "AUTO";
  }
}

resoBtn.onclick = function (e) {
  e.stopPropagation();
  resoMenu.classList.toggle("hidden");
};

document.addEventListener("click", function (e) {
  if (resoMenu && !e.target.closest(".reso-wrapper")) {
    resoMenu.classList.add("hidden");
  }
});

async function play(i) {
  if (isGridMode) return;
  const ch = STREAM_LIST[i];
  if (!ch) return;
  cur = i;
  markRow(i);

  if (activeTitle) activeTitle.textContent = ch.name + " — Live";
  setLoad(true, ch.name);
  stopWatch();
  hint.style.display = "none";

  if (typeof shaka === "undefined") {
    setLoad(true, ch.name, "Loading player...");
    return;
  }

  try {
    shaka.polyfill.installAll();
    if (!shaka.Player.isBrowserSupported()) {
      setLoad(true, ch.name, "This browser does not support this stream format.");
      return;
    }

    if (player) { try { await player.destroy(); } catch (e) {} player = null; }

    player = new shaka.Player();
    await player.attach(vid);

    const playerConfig = {
      abr: {
        enabled: true,
        defaultBandwidthEstimate: 500_000,
        bandwidthUpgradeTarget: 0.75,
        switchInterval: 6
      },
      streaming: {
        lowLatencyMode: false,
        rebufferingGoal: 1.5,
        bufferingGoal: 25,
        bufferBehind: 15,
        retryParameters: { maxAttempts: 5, baseDelay: 500, backoffFactor: 1.5 }
      },
      manifest: {
        dash: { ignoreMinBufferTime: true },
        retryParameters: { maxAttempts: 5, baseDelay: 400 }
      }
    };

    if (ch.kid && ch.key) {
      playerConfig.drm = { clearKeys: { [ch.kid]: ch.key } };
    }

    player.configure(playerConfig);

    player.addEventListener("error", function (e) {
      const code = e.detail && e.detail.code;
      if (code === 7000) return;
      setLoad(true, ch.name, "Error " + code + " — try again.");
    });

    await player.load(ch.url);
    updateResolutionMenu();
    setLoad(false);

    try {
      await vid.play();
      updatePlayIcon();
      updateVolIcon();
    } catch (e) {
      vid.muted = true;
      try { await vid.play(); updatePlayIcon(); updateVolIcon(); } catch (e2) {}
      hint.style.display = "flex";
    }

    watchdog = setInterval(function () {
      try {
        if (!player || vid.paused || isGridMode) return;
        const r = player.seekRange();
        if (r.end - vid.currentTime > 12) vid.currentTime = r.end - 1;
        if (r.end - vid.currentTime > 4) {
          liveBtn.classList.add("behind-live");
          liveBtn.textContent = "SYNC TO LIVE";
        } else {
          liveBtn.classList.remove("behind-live");
          liveBtn.textContent = "LIVE";
        }
      } catch (e) {}
    }, 2000);
  } catch (e) {
    setLoad(true, ch.name, "Error: " + (e && e.message ? e.message : e));
  }
}

async function startGridMode() {
  isGridMode = true;
  gridBtn.classList.add("active-mode");
  if (activeTitle) activeTitle.textContent = "PBB Studio — 4-Camera Multi-View";
  stopWatch();

  if (player) { try { await player.destroy(); } catch (e) {} player = null; }

  vidContainer.style.display = "none";
  gridContainer.style.display = "grid";
  hint.style.display = "none";
  liveBtn.style.display = "none";

  setLoad(true, "All Channels", "Loading 4-Camera Studio...");

  if (typeof shaka !== "undefined") {
    shaka.polyfill.installAll();
    if (!shaka.Player.isBrowserSupported()) {
      setLoad(true, "Error", "This browser does not support this stream format.");
      return;
    }
  }

  await Promise.all(gridPlayers.map((gp) => gp.destroy().catch(() => {})));
  gridPlayers = [];

  await Promise.all(STREAM_LIST.map(async function (ch, k) {
    const gvid = document.getElementById("gv" + k);
    if (!gvid) return;

    const gp = new shaka.Player();
    gridPlayers.push(gp);
    await gp.attach(gvid);

    const gpConfig = {
      abr: { defaultBandwidthEstimate: 400_000 },
      streaming: { bufferingGoal: 12, rebufferingGoal: 1.5, bufferBehind: 5 },
      restrictions: { maxHeight: 480 }
    };
    if (ch.kid && ch.key) {
      gpConfig.drm = { clearKeys: { [ch.kid]: ch.key } };
    }

    gp.configure(gpConfig);

    try {
      await gp.load(ch.url);
      gvid.muted = true;
      await gvid.play();
    } catch (e) {}
  }));

  setLoad(false);
  markRow(-1);
}

async function stopGridMode(targetIndex) {
  isGridMode = false;
  gridBtn.classList.remove("active-mode");
  liveBtn.style.display = "flex";

  await Promise.all(gridPlayers.map((gp) => gp.destroy().catch(() => {})));
  gridPlayers = [];

  gridContainer.style.display = "none";
  vidContainer.style.display = "flex";
  const nextIdx = (typeof targetIndex === "number") ? targetIndex : (cur === -1 ? 0 : cur);
  play(nextIdx);
}

gridBtn.onclick = function (e) {
  e.stopPropagation();
  if (!isGridMode) startGridMode();
  else stopGridMode();
};



document.querySelectorAll(".grid-item").forEach((item) => {
  item.addEventListener("click", () => {
    const idx = parseInt(item.getAttribute("data-idx"), 10);
    if (!isNaN(idx)) stopGridMode(idx);
  });
});

function updatePlayIcon() {
  playIcon.innerHTML = vid.paused
    ? '<path d="M8 5v14l11-7z"/>'
    : '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
}

playBtn.onclick = function () {
  if (isGridMode) {
    document.querySelectorAll(".grid-item video").forEach((v) => {
      if (v.paused) v.play().catch(() => {}); else v.pause();
    });
  } else {
    if (vid.paused) vid.play().catch(() => {}); else vid.pause();
    updatePlayIcon();
  }
};

function updateVolIcon() {
  if (vid.muted || vid.volume === 0) {
    volIcon.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
    volSlider.value = 0;
  } else {
    volIcon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
    volSlider.value = vid.volume;
  }
}

muteBtn.onclick = function () {
  if (isGridMode) return;
  vid.muted = !vid.muted;
  if (!vid.muted && vid.volume === 0) vid.volume = 1;
  updateVolIcon();
  hint.style.display = "none";
};

volSlider.addEventListener("input", function (e) {
  if (isGridMode) return;
  vid.volume = parseFloat(e.target.value);
  vid.muted = vid.volume === 0;
  updateVolIcon();
});

// Fullscreen & Orientation
function syncLandscapeState() {
  const isNativeFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  const isPseudoFs = stage.classList.contains("pseudo-fs");
  if (!isNativeFs && !isPseudoFs) {
    stage.classList.remove("force-landscape");
    return;
  }
  stage.classList.toggle("force-landscape", window.innerHeight > window.innerWidth);
}

function toggleFullScreen() {
  const isNativeFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  const isPseudoFs = stage.classList.contains("pseudo-fs");

  if (!isNativeFs && !isPseudoFs) {
    const req = stage.requestFullscreen || stage.webkitRequestFullscreen || stage.msRequestFullscreen;
    if (req) {
      req.call(stage).then(() => {
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock("landscape").catch(syncLandscapeState);
        }
        setTimeout(syncLandscapeState, 150);
      }).catch(() => {
        stage.classList.add("pseudo-fs");
        syncLandscapeState();
      });
    } else {
      stage.classList.add("pseudo-fs");
      syncLandscapeState();
    }
  } else {
    if (isNativeFs) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
      if (exit) exit.call(document).catch(() => {});
    }
    stage.classList.remove("pseudo-fs", "force-landscape");
    if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
  }
}

window.addEventListener("resize", syncLandscapeState);
window.addEventListener("orientationchange", () => setTimeout(syncLandscapeState, 200));
document.addEventListener("fullscreenchange", syncLandscapeState);
document.addEventListener("webkitfullscreenchange", syncLandscapeState);

fsBtn.onclick = toggleFullScreen;
if (tlFs) tlFs.onclick = toggleFullScreen;
if (tlGrid) tlGrid.onclick = () => gridBtn.click();
if (tlClose) tlClose.onclick = () => stopGridMode(0);

hint.onclick = function () {
  vid.muted = false;
  updateVolIcon();
  hint.style.display = "none";
};

vid.addEventListener("click", function () {
  if (vid.muted) {
    vid.muted = false;
    updateVolIcon();
    hint.style.display = "none";
  }
});

// Populate Channel Sidebar
const box = document.getElementById("channels");
STREAM_LIST.forEach((c, i) => {
  const row = document.createElement("div");
  row.className = "r";
  row.innerHTML = `
    <div class="ch-left">
      <div class="ch-icon">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
      </div>
      <div class="ch-info">
        <div class="n">${c.name}</div>
        <div class="ch-sub">${c.desc || ("Camera Feed 0" + (i + 1))}</div>
      </div>
    </div>
    <div class="ch-badge">HD</div>
  `;
  row.onclick = () => {
    if (isGridMode) stopGridMode(i);
    else play(i);
  };
  box.appendChild(row);
});

// Start in single-camera mode for faster initial load (click Multi-View for 4-cam grid)
play(0);

// Auto-Hiding HUD Controls
const controlsEl = document.getElementById("controls");
let hideTimer = null;

function showControls() {
  controlsEl.classList.remove("hidden");
  resetHideTimer();
}

function resetHideTimer() {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (!load.classList.contains("show") && (!vid.paused || isGridMode) && resoMenu.classList.contains("hidden")) {
      controlsEl.classList.add("hidden");
    }
  }, 3500);
}

stage.addEventListener("click", (e) => {
  if (e.target.closest("#controls") || e.target.closest("#side")) return;
  if (controlsEl.classList.contains("hidden")) {
    showControls();
  } else {
    controlsEl.classList.add("hidden");
    if (hideTimer) clearTimeout(hideTimer);
    resoMenu.classList.add("hidden");
  }
});

stage.addEventListener("mousemove", () => {
  if (!controlsEl.classList.contains("hidden")) resetHideTimer();
});
controlsEl.addEventListener("click", resetHideTimer);
resetHideTimer();

// Splash Screen & Support Modal Initialization
window.addEventListener("load", function () {
  const splash = document.getElementById("splash-screen");
  const loadingUI = document.getElementById("splash-loading-ui");
  const enterBtn = document.getElementById("splash-enter-btn");
  const appWindow = document.getElementById("wrap");

  setTimeout(() => {
    if (loadingUI && enterBtn) {
      loadingUI.style.opacity = "0";
      loadingUI.style.transform = "translateY(-15px)";
      loadingUI.style.pointerEvents = "none";
      setTimeout(() => {
        loadingUI.style.display = "none";
        enterBtn.classList.add("show");
      }, 400);
    }
  }, 2600);

  if (enterBtn) {
    enterBtn.addEventListener("click", () => {
      splash.classList.add("hidden");
      if (appWindow) setTimeout(() => appWindow.classList.add("app-loaded"), 100);
      setTimeout(() => splash.remove(), 900);
    });
  }

  // Support Modal
  const donateBtn = document.getElementById("donate-btn");
  const supportModal = document.getElementById("support-modal");
  const closeSupport = document.getElementById("close-support");

  if (donateBtn && supportModal && closeSupport) {
    donateBtn.onclick = () => supportModal.classList.remove("hidden");
    closeSupport.onclick = () => supportModal.classList.add("hidden");
    supportModal.addEventListener("click", (e) => {
      if (e.target === supportModal) supportModal.classList.add("hidden");
    });
  }
});

// Copy Button Logic
document.querySelectorAll(".copy-btn").forEach((btn) => {
  btn.addEventListener("click", function () {
    const targetId = this.getAttribute("data-target");
    const textToCopy = document.getElementById(targetId).innerText;
    navigator.clipboard.writeText(textToCopy).then(() => {
      const originalHTML = this.innerHTML;
      this.classList.add("copied");
      this.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      setTimeout(() => {
        this.classList.remove("copied");
        this.innerHTML = originalHTML;
      }, 2000);
    });
  });
});

// === LIVE VIEWER COUNTER (FIREBASE REALTIME DATABASE) ===
(function initLiveCounter() {
  if (typeof firebase === "undefined") return;

  const firebaseConfig = {
    apiKey: "AIzaSyBKOVwTWF5Dw1CH3cjpKlwzEFbolyzLEzI",
    authDomain: "pbb-live-counter.firebaseapp.com",
    databaseURL: "https://pbb-live-counter-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "pbb-live-counter",
    storageBucket: "pbb-live-counter.firebasestorage.app",
    messagingSenderId: "610176350304",
    appId: "1:610176350304:web:b4e3bb3536066d9037eb05"
  };

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  const db = firebase.database();
  const viewerCountEl = document.getElementById("viewer-count");
  const sessionId = "v_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  const myViewerRef = db.ref("viewers/" + sessionId);
  const allViewersRef = db.ref("viewers");
  const connectedRef = db.ref(".info/connected");

  // Register viewer and auto-remove when they close the tab or lose internet
  connectedRef.on("value", (snap) => {
    if (snap.val() === true) {
      myViewerRef.onDisconnect().remove();
      myViewerRef.set(true);
    }
  });

  // Update the badge in real time
  allViewersRef.on("value", (snap) => {
    if (viewerCountEl) {
      viewerCountEl.textContent = snap.numChildren() || 1;
    }
  });
})();