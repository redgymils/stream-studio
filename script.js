var vid = document.getElementById('v');
var stage = document.getElementById('stage');
var load = document.getElementById('load');
var hint = document.getElementById('hint');
var playBtn = document.getElementById('play-btn');
var playIcon = document.getElementById('play-icon');
var muteBtn = document.getElementById('mute-btn');
var volIcon = document.getElementById('vol-icon');
var fsBtn = document.getElementById('fs-btn');
var gridBtn = document.getElementById('grid-btn');
var gridContainer = document.getElementById('grid-container');
var vidContainer = document.getElementById('vid-container');
var activeTitle = document.getElementById('active-channel-title');

// macOS Traffic Light Buttons
var tlClose = document.getElementById('tl-close');
var tlGrid = document.getElementById('tl-grid');
var tlFs = document.getElementById('tl-fs');

var player = null, cur = -1, watchdog = null;
var isGridMode = false;
var gridPlayers = [];
var scale = 1, rotation = 0, startDist = 0, isTouching = false;

stage.addEventListener('touchstart', function(e) {
  if (e.touches.length === 2 && !isGridMode) {
    isTouching = true;
    startDist = Math.hypot(
      e.touches[0].pageX - e.touches[1].pageX,
      e.touches[0].pageY - e.touches[1].pageY
    );
  }
});

stage.addEventListener('touchmove', function(e) {
  if (!isTouching || e.touches.length !== 2 || isGridMode) return;
  e.preventDefault();
  var currentDist = Math.hypot(
    e.touches[0].pageX - e.touches[1].pageX,
    e.touches[0].pageY - e.touches[1].pageY
  );
  var scaleFactor = currentDist / startDist;
  scale = Math.min(Math.max(scale * scaleFactor, 1), 5);
  vid.style.transform = 'scale(' + scale + ') rotate(' + rotation + 'deg)';
  startDist = currentDist;
});

stage.addEventListener('touchend', function(e) {
  if (e.touches.length < 2) isTouching = false;
});

var lastTap = 0;
vid.addEventListener('touchend', function(e) {
  if (isGridMode) return;
  var currentTime = new Date().getTime();
  if (currentTime - lastTap < 300 && currentTime - lastTap > 0) {
    scale = 1; rotation = 0;
    vid.style.transform = 'scale(1) rotate(0deg)';
    e.preventDefault();
  }
  lastTap = currentTime;
});

function uuid(k) {
  return k.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}

function setLoad(on, name, msg) {
  if (on) {
    load.querySelector('.s').textContent = msg || ('Connecting to ' + name + '...');
    load.classList.add('show');
  } else {
    load.classList.remove('show');
  }
}

function markRow(i) {
  var rows = document.querySelectorAll('.r');
  for (var k = 0; k < rows.length; k++) {
    var isSelected = (k === i);
    rows[k].classList.toggle('on', isSelected);
    var badge = rows[k].querySelector('.ch-badge');
    if (badge) badge.textContent = isSelected ? 'ON AIR' : 'HD';
  }
}

function stopWatch() {
  if (watchdog) { clearInterval(watchdog); watchdog = null; }
}

async function play(i) {
  if (isGridMode) return;
  var ch = CH[i];
  if (!ch) return;
  cur = i;
  markRow(i);
  if (activeTitle) activeTitle.textContent = ch[0] + ' — Live';
  setLoad(true, ch[0]);
  stopWatch();
  hint.style.display = 'none';

  if (typeof shaka === 'undefined') {
    setLoad(true, ch[0], 'Loading please wait...');
    return;
  }

  try {
    shaka.polyfill.installAll();
    if (player) { try { await player.destroy(); } catch(e){} player = null; }

    var parts = ch[2].split(':');
    var kid = parts[0], key = parts[1];
    var clearKeys = {};
    clearKeys[kid] = key;
    clearKeys[uuid(kid)] = key;

    player = new shaka.Player();
    await player.attach(vid);
    player.configure({
      drm: { preferredKeySystems: ['org.w3.clearkey'], clearKeys: clearKeys },
      streaming: {
        bufferingGoal: 15, rebufferingGoal: 2, bufferBehind: 25,
        retryParameters: { maxAttempts: 8, baseDelay: 400, timeout: 20000 }
      },
      manifest: { retryParameters: { maxAttempts: 5, baseDelay: 400 } }
    });

    player.addEventListener('error', function(e) {
      var code = e.detail && e.detail.code;
      if (code === 7000) return;
      setLoad(true, ch[0], 'Error ' + code + ' — try again.');
    });

    await player.load(ch[1]);
    setLoad(false);
    try {
      await vid.play();
      updatePlayIcon();
    } catch(e) {
      vid.muted = true;
      try {
        await vid.play();
        updatePlayIcon();
      } catch(e2) {}
      hint.style.display = 'flex';
    }

    watchdog = setInterval(function() {
      try {
        if (!player || vid.paused) return;
        var r = player.seekRange();
        if (r.end - vid.currentTime > 12) vid.currentTime = r.end - 1;
      } catch(e) {}
    }, 8000);
  } catch(e) {
    setLoad(true, ch[0], 'Bigo: ' + (e && e.message ? e.message : e));
  }
}

async function startGridMode() {
  isGridMode = true;
  gridBtn.classList.add('active-mode');
  if (activeTitle) activeTitle.textContent = 'PBB Studio — 4-Camera Multi-View';
  stopWatch();
  if (player) { try { await player.destroy(); } catch(e){} player = null; }

  vidContainer.style.display = 'none';
  gridContainer.style.display = 'grid';
  hint.style.display = 'none';
  setLoad(true, "All Channels", "Loading please wait...");

  for (let gp of gridPlayers) {
    try { await gp.destroy(); } catch(e){}
  }
  gridPlayers = [];

  for (let k = 0; k < CH.length; k++) {
    let gvid = document.getElementById('gv' + k);
    let ch = CH[k];
    let parts = ch[2].split(':');
    let kid = parts[0], key = parts[1];
    let clearKeys = {};
    clearKeys[kid] = key;
    clearKeys[uuid(kid)] = key;

    let gp = new shaka.Player();
    gridPlayers.push(gp);
    await gp.attach(gvid);
    gp.configure({
      drm: { preferredKeySystems: ['org.w3.clearkey'], clearKeys: clearKeys },
      streaming: { bufferingGoal: 10, rebufferingGoal: 2, bufferBehind: 15 }
    });
    try {
      await gp.load(ch[1]);
      gvid.muted = true;
      await gvid.play();
    } catch(e) {}
  }
  setLoad(false);
  markRow(-1);
}

async function stopGridMode(targetIndex) {
  isGridMode = false;
  gridBtn.classList.remove('active-mode');
  for (let gp of gridPlayers) {
    try { await gp.destroy(); } catch(e){}
  }
  gridPlayers = [];
  gridContainer.style.display = 'none';
  vidContainer.style.display = 'flex';
  var nextIdx = (typeof targetIndex === 'number') ? targetIndex : (cur === -1 ? 0 : cur);
  play(nextIdx);
}

gridBtn.onclick = function() {
  if (!isGridMode) startGridMode();
  else stopGridMode();
};

// Tap any camera inside the 4-Grid to maximize that specific stream
document.querySelectorAll('.grid-item').forEach(function(item) {
  item.addEventListener('click', function() {
    var idx = parseInt(item.getAttribute('data-idx'), 10);
    if (!isNaN(idx)) stopGridMode(idx);
  });
});

function updatePlayIcon() {
  if (vid.paused) {
    playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
  } else {
    playIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
  }
}

playBtn.onclick = function() {
  if (isGridMode) {
    let gvids = document.querySelectorAll('.grid-item video');
    gvids.forEach(v => { if (v.paused) v.play(); else v.pause(); });
  } else {
    if (vid.paused) vid.play(); else vid.pause();
    updatePlayIcon();
  }
};

muteBtn.onclick = function() {
  if (isGridMode) return;
  vid.muted = !vid.muted;
  if (vid.muted) {
    volIcon.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
  } else {
    volIcon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
  }
  hint.style.display = 'none';
};

var isFsActive = false;

function syncLandscapeState() {
  var isNativeFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  var isPseudoFs = stage.classList.contains('pseudo-fs');
  isFsActive = isNativeFs || isPseudoFs;

  if (!isFsActive) {
    stage.classList.remove('force-landscape');
    return;
  }

  // If the screen is still taller than it is wide (Portrait), rotate the stage 90deg into Landscape
  if (window.innerHeight > window.innerWidth) {
    stage.classList.add('force-landscape');
  } else {
    // If the user physically turned the phone sideways or OS locked to landscape, use natural 0deg
    stage.classList.remove('force-landscape');
  }
}

function toggleFullScreen() {
  var isNativeFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  var isPseudoFs = stage.classList.contains('pseudo-fs');

  if (!isNativeFs && !isPseudoFs) {
    var req = stage.requestFullscreen || stage.webkitRequestFullscreen || stage.msRequestFullscreen;
    if (req) {
      req.call(stage).then(function() {
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock('landscape').catch(function() {
            syncLandscapeState();
          });
        }
        setTimeout(syncLandscapeState, 150);
      }).catch(function() {
        stage.classList.add('pseudo-fs');
        syncLandscapeState();
      });
    } else {
      stage.classList.add('pseudo-fs');
      syncLandscapeState();
    }
  } else {
    if (isNativeFs) {
      var exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
      if (exit) exit.call(document).catch(function(){});
    }
    stage.classList.remove('pseudo-fs');
    stage.classList.remove('force-landscape');
    if (screen.orientation && screen.orientation.unlock) {
      screen.orientation.unlock();
    }
  }
}

window.addEventListener('resize', syncLandscapeState);
window.addEventListener('orientationchange', function() {
  setTimeout(syncLandscapeState, 200);
});
document.addEventListener('fullscreenchange', syncLandscapeState);
document.addEventListener('webkitfullscreenchange', syncLandscapeState);

fsBtn.onclick = toggleFullScreen;
if (tlFs) tlFs.onclick = toggleFullScreen;
if (tlGrid) tlGrid.onclick = function() { gridBtn.click(); };
if (tlClose) tlClose.onclick = function() { stopGridMode(0); };

// --- Ambient Background Music & Unmute Logic ---
var bgMusic = document.getElementById('bg-music');

// Attempt to play music on load (may be blocked by browser autoplay policies)
window.addEventListener('load', function() {
  if (bgMusic && vid.muted) {
    bgMusic.volume = 0.6; // Sets a pleasant background volume level
    var playPromise = bgMusic.play();
    if (playPromise !== undefined) {
      playPromise.catch(function(error) {
        // If autoplay is blocked, wait for the user's first tap anywhere on the screen
        window.addEventListener('click', function startAudioOnInteraction() {
          if (vid.muted) bgMusic.play();
          window.removeEventListener('click', startAudioOnInteraction);
        }, { once: true });
        
        window.addEventListener('touchstart', function startAudioOnInteractionTouch() {
          if (vid.muted) bgMusic.play();
          window.removeEventListener('touchstart', startAudioOnInteractionTouch);
        }, { once: true });
      });
    }
  }
});

// Stop music when "Tap to unmute" is clicked
hint.onclick = function() { 
  vid.muted = false; 
  hint.style.display = 'none'; 
  if (bgMusic) {
    bgMusic.pause();
    bgMusic.currentTime = 0; // Resets music so it starts fresh next time if needed
  }
};

// Stop music if the user taps directly on the muted video
vid.addEventListener('click', function() { 
  if (vid.muted) { 
    vid.muted = false; 
    hint.style.display = 'none'; 
    if (bgMusic) {
      bgMusic.pause();
      bgMusic.currentTime = 0;
    }
  } 
});

// Build the macOS Glass Channel Cards
var box = document.getElementById('channels');
CH.forEach(function(c, i) {
  var row = document.createElement('div');
  row.className = 'r';
  row.innerHTML =
    '<div class="ch-left">' +
      '<div class="ch-icon">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>' +
      '</div>' +
      '<div class="ch-info">' +
        '<div class="n">' + c[0] + '</div>' +
        '<div class="ch-sub">Camera Feed 0' + (i + 1) + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="ch-badge">HD</div>';

  row.onclick = function() {
    if (isGridMode) stopGridMode(i);
    else play(i);
  };
  box.appendChild(row);
});

// Start Stream 1 automatically
play(0);

// Auto-Hide HUD Controls Logic
var controlsEl = document.getElementById('controls');
var hideTimer = null;

function showControls() {
  controlsEl.classList.remove('hidden');
  resetHideTimer();
}

function resetHideTimer() {
  if (hideTimer) clearTimeout(hideTimer);
  // Auto-hide after 3.5 seconds of inactivity
  hideTimer = setTimeout(function() {
    if (!load.classList.contains('show') && (!vid.paused || isGridMode)) {
      controlsEl.classList.add('hidden');
    }
  }, 3500);
}

// Single-tap toggle handler (prevents touch/click race conditions)
stage.addEventListener('click', function(e) {
  if (e.target.closest('#controls') || e.target.closest('#side')) return;
  
  if (controlsEl.classList.contains('hidden')) {
    showControls();
  } else {
    controlsEl.classList.add('hidden');
    if (hideTimer) clearTimeout(hideTimer);
  }
});

// Reset timer on mouse movement or control interaction
stage.addEventListener('mousemove', function() {
  if (!controlsEl.classList.contains('hidden')) resetHideTimer();
});
controlsEl.addEventListener('click', resetHideTimer);

// Start the initial timer
resetHideTimer();

// --- Premium Splash Screen, Reveal & Audio Logic ---
window.addEventListener('load', function() {
  var splash = document.getElementById('splash-screen');
  var loadingUI = document.getElementById('splash-loading-ui');
  var enterBtn = document.getElementById('splash-enter-btn');
  var appWindow = document.getElementById('wrap');
  var bgMusic = document.getElementById('bg-music');

  // 1. Wait for the 2.6s loading progress bar to finish
  setTimeout(function() {
    if (loadingUI && enterBtn) {
      // Fade out loading UI smoothly
      loadingUI.style.opacity = '0';
      loadingUI.style.transform = 'translateY(-15px)';
      loadingUI.style.pointerEvents = 'none';
      
      // Swap to the Enter button
      setTimeout(function() {
        loadingUI.style.display = 'none';
        enterBtn.classList.add('show');
      }, 400); 
    }
  }, 2600);

  // 2. Handle "Enter Studio" click
  if (enterBtn) {
    enterBtn.addEventListener('click', function() {
      // Play background music (now guaranteed to work because of the user click)
      if (bgMusic && vid.muted) {
        bgMusic.volume = 0.2;
        bgMusic.play().catch(function(e) { console.log('Audio error:', e); });
      }

      // Dissolve splash screen
      splash.classList.add('hidden');
      
      // Trigger the main UI scale-up animation
      if (appWindow) {
        setTimeout(function() {
          appWindow.classList.add('app-loaded');
        }, 100);
      }

      // Remove splash completely
      setTimeout(function() {
        splash.remove();
      }, 900);
    });
  }
});

// 3. Stop music when "Tap to unmute" is clicked or video is tapped
hint.onclick = function() { 
  vid.muted = false; 
  hint.style.display = 'none'; 
  stopBgMusic();
};

vid.addEventListener('click', function() { 
  if (vid.muted) { 
    vid.muted = false; 
    hint.style.display = 'none'; 
    stopBgMusic();
  } 
});

function stopBgMusic() {
  var bgMusic = document.getElementById('bg-music');
  if (bgMusic) {
    // Fade out audio slightly before pausing for a premium feel
    var fade = setInterval(function() {
      if (bgMusic.volume > 0.1) {
        bgMusic.volume -= 0.1;
      } else {
        clearInterval(fade);
        bgMusic.pause();
        bgMusic.currentTime = 0;
      }
    }, 50);
  }
}

// --- Catch-All Music Stopper ---

// 1. Stops music if the video gets unmuted via the floating HUD mute button
vid.addEventListener('volumechange', function() {
  if (!vid.muted) stopBgMusic();
});

// 2. Stops music if the user clicks any of the "Camera Feeds" channel tabs
var sidePanel = document.getElementById('side');
if (sidePanel) {
  sidePanel.addEventListener('click', stopBgMusic);
}

// 3. Stops music if the user interacts with the floating QuickTime HUD controls
var hudControls = document.getElementById('controls');
if (hudControls) {
  hudControls.addEventListener('click', stopBgMusic);
}

// --- Secure Watermark Injection ---
(function injectWatermark() {
  var wm = document.createElement('div');
  wm.id = 'author-watermark';
  wm.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>ENCODED BY <span>KARLDANEMAIPO</span>';
  document.body.appendChild(wm);
})();

// --- Anti-Sniffing & Inspector Protection ---
// 1. Disable Right-Click (Context Menu)
document.addEventListener('contextmenu', function(e) {
  e.preventDefault();
});

// 2. Disable Keyboard Shortcuts for Developer Tools
document.addEventListener('keydown', function(e) {
  // Prevent F12
  if (e.key === 'F12' || e.keyCode === 123) {
    e.preventDefault();
  }
  // Prevent Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C (Windows/Linux)
  if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c' || e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) {
    e.preventDefault();
  }
  // Prevent Ctrl+U (View Source)
  if (e.ctrlKey && (e.key === 'U' || e.key === 'u' || e.keyCode === 85)) {
    e.preventDefault();
  }
  // Prevent Cmd+Option+I / Cmd+Option+J / Cmd+Option+U (macOS)
  if (e.metaKey && e.altKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'U' || e.key === 'u' || e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 85)) {
    e.preventDefault();
  }
});

// --- Premium Global Synchronized Counter ---
(function initGlobalCounter() {
  var visitSpan = document.getElementById('visit-num');
  if (!visitSpan) return;
  
  // Base number of established visits
  var baseVisits = 1892;
  
  // Launch date set to today to start counting exactly from 1256 right now
  var launchDate = new Date("2026-11-09T07:00:00Z").getTime();
  
  function updateGlobalCount() {
    var now = new Date().getTime(); // Gets universal global time
    var secondsPassed = (now - launchDate) / 1000;
    
    // Prevents negative numbers if testing right at the launch boundary
    if (secondsPassed < 0) secondsPassed = 0;
    
    // Formula: Adds 1 new visit every 30 minutes (1800 seconds)
    var calculatedVisits = Math.floor(baseVisits + (secondsPassed / 1800));
    
    // Displays the number beautifully (e.g., 1,256)
    visitSpan.textContent = calculatedVisits.toLocaleString();
  }
  
  updateGlobalCount(); 
  
  // Checks the math every 60 seconds to see if a 30-minute mark has been crossed
  setInterval(updateGlobalCount, 60000);
})();