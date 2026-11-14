(function() {
  'use strict';

  var vid = document.getElementById('v');
  var stage = document.getElementById('stage');
var load = document.getElementById('load');
var hint = document.getElementById('hint');
var playBtn = document.getElementById('play-btn');
var playIcon = document.getElementById('play-icon');
var muteBtn = document.getElementById('mute-btn');
var volIcon = document.getElementById('vol-icon');
var volSlider = document.getElementById('vol-slider');
var fsBtn = document.getElementById('fs-btn');
var gridBtn = document.getElementById('grid-btn');
var pipBtn = document.getElementById('pip-btn');
var liveBtn = document.getElementById('live-btn');
var gridContainer = document.getElementById('grid-container');
var vidContainer = document.getElementById('vid-container');
var activeTitle = document.getElementById('active-channel-title');
var bgMusic = document.getElementById('bg-music');

// Resolution Variables
var resoBtn = document.getElementById('reso-btn');
var resoMenu = document.getElementById('reso-menu');
var resoLabel = document.getElementById('reso-label');

// macOS Traffic Light Buttons
var tlClose = document.getElementById('tl-close');
var tlGrid = document.getElementById('tl-grid');
var tlFs = document.getElementById('tl-fs');

var player = null, cur = -1, watchdog = null;
var isSplashActive = true;
var isGridMode = false;
var gridPlayers = [];
var scale = 1, rotation = 0, startDist = 0, isTouching = false;
var bgFadeTimer = null;

// Suspend players to save battery and network when tab is minimized
document.addEventListener("visibilitychange", function() {
  if (document.pictureInPictureElement) return; 

  if (document.hidden) {
    if (isGridMode) {
      gridPlayers.forEach(p => { if (p.getMediaElement()) p.getMediaElement().pause(); });
    } else if (!vid.paused) {
      vid.pause();
    }
  } else {
    if (isGridMode) {
      gridPlayers.forEach(p => {
        var el = p.getMediaElement();
        if (el) el.play().catch(e => {
          if (e.name === 'NotAllowedError') console.warn('Grid auto-resume blocked by browser.');
        });
      });
    } else {
      if (player) {
        var r = player.seekRange();
        if (r && r.end) vid.currentTime = r.end - 1;
      }
      if (vid.paused) {
        vid.play().catch(e => {
          if (e.name === 'NotAllowedError') {
            // Browser blocked auto-resume, prompt user to tap
            vid.muted = true;
            hint.innerHTML = 'Tap to resume stream';
            hint.style.display = 'flex';
          }
        });
      }
    }
  }
});

// Picture-in-Picture Logic
if (pipBtn) {
  pipBtn.onclick = async function() {
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
      console.warn("PiP not supported or blocked by browser.");
    }
  };
}

// Jump to Live Logic
liveBtn.onclick = function() {
  if (player && !isGridMode) {
    var r = player.seekRange();
    if (r && r.end) vid.currentTime = r.end - 1;
    if (vid.paused) vid.play().catch(e => {});
    
    liveBtn.classList.remove('behind-live');
    liveBtn.textContent = 'LIVE';
  }
};

// Pinch-to-Zoom & Double-Tap Reset
stage.addEventListener('touchstart', function(e) {
  if (e.touches.length === 2 && !isGridMode) {
    isTouching = true;
    startDist = Math.hypot(
      e.touches[0].pageX - e.touches[1].pageX,
      e.touches[0].pageY - e.touches[1].pageY
    );
  }
}, { passive: true });

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
}, { passive: false });

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

function updateResolutionMenu() {
  if (!player) return;
  resoMenu.innerHTML = '';
  var tracks = player.getVariantTracks();
  var heights = [...new Set(tracks.map(t => t.height).filter(Boolean))].sort((a, b) => b - a);

  var autoBtn = document.createElement('button');
  autoBtn.className = 'reso-item active';
  autoBtn.textContent = 'Auto';
  autoBtn.onclick = function() {
    player.configure({ abr: { enabled: true } });
    resoLabel.textContent = 'AUTO';
    document.querySelectorAll('.reso-item').forEach(b => b.classList.remove('active'));
    autoBtn.classList.add('active');
    resoMenu.classList.add('hidden');
  };
  resoMenu.appendChild(autoBtn);

  heights.forEach(function(h) {
    var btn = document.createElement('button');
    btn.className = 'reso-item';
    btn.textContent = h + 'p';
    btn.onclick = function() {
      player.configure({ abr: { enabled: false } }); 
      var track = player.getVariantTracks().find(t => t.height === h);
      if (track) player.selectVariantTrack(track, true); 
      
      resoLabel.textContent = h + 'p';
      document.querySelectorAll('.reso-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      resoMenu.classList.add('hidden');
    };
    resoMenu.appendChild(btn);
  });
}

resoBtn.onclick = function(e) {
  e.stopPropagation(); 
  resoMenu.classList.toggle('hidden');
};

document.addEventListener('click', function(e) {
  if (resoMenu && !e.target.closest('.reso-wrapper')) {
    resoMenu.classList.add('hidden');
  }
});

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

    player = new shaka.Player();
    await player.attach(vid);

    var playerConfig = {
      streaming: { bufferingGoal: 15, rebufferingGoal: 2, bufferBehind: 25, retryParameters: { maxAttempts: 8, baseDelay: 400, timeout: 20000 } },
      manifest: { retryParameters: { maxAttempts: 5, baseDelay: 400 } }
    };

    if (ch[2]) {
      if (ch[2].startsWith('http')) {
        // Secure Industry Standard: Widevine / PlayReady License Server
        playerConfig.drm = {
          servers: {
            'com.widevine.alpha': ch[2],
            'com.microsoft.playready': ch[2]
          },
          advanced: {
            'com.widevine.alpha': { videoRobustness: 'SW_SECURE_CRYPTO', audioRobustness: 'SW_SECURE_CRYPTO' }
          }
        };
      } else if (ch[2].includes(':')) {
        // Insecure Fallback: Plain text ClearKey
        var parts = ch[2].split(':');
        playerConfig.drm = { clearKeys: { [parts[0]]: parts[1] } };
      }
    }

    player.configure(playerConfig);

    player.addEventListener('error', function(e) {
      var code = e.detail && e.detail.code;
      if (code === 7000) return;
      setLoad(true, ch[0], 'Error ' + code + ' — try again.');
    });

    await player.load(ch[1]);
    
    // Reveal Enter button precisely when stream is ready
    if (isSplashActive) {
      var loadingUI = document.getElementById('splash-loading-ui');
      var enterBtn = document.getElementById('splash-enter-btn');
      if (loadingUI && enterBtn) {
        loadingUI.style.opacity = '0';
        loadingUI.style.transform = 'translateY(-15px)';
        loadingUI.style.pointerEvents = 'none';
        setTimeout(function() {
          loadingUI.style.display = 'none';
          enterBtn.classList.add('show');
        }, 400); 
      }
    }
    
    updateResolutionMenu();
    resoLabel.textContent = 'AUTO';
    setLoad(false);
    
    try {
      await vid.play();
      updatePlayIcon();
      updateVolIcon();
    } catch(e) {
      vid.muted = true;
      try { 
        await vid.play(); 
        updatePlayIcon(); 
        updateVolIcon(); 
      } catch(e2) {
        if (e2.name !== 'NotAllowedError' && e2.name !== 'AbortError') {
          console.error('Playback failed even when muted:', e2);
        }
      }
      hint.style.display = 'flex';
    }

    // Dynamic Live Edge Monitor
    watchdog = setInterval(function() {
      try {
        if (!player || vid.paused || isGridMode) return;
        var r = player.seekRange();
        
        if (r.end - vid.currentTime > 12) vid.currentTime = r.end - 1;
        
        if (r.end - vid.currentTime > 4) {
          liveBtn.classList.add('behind-live');
          liveBtn.textContent = 'SYNC TO LIVE';
        } else {
          liveBtn.classList.remove('behind-live');
          liveBtn.textContent = 'LIVE';
        }
      } catch(e) {}
    }, 2000);
  } catch(e) {
    setLoad(true, ch[0], 'Error: ' + (e && e.message ? e.message : e));
  }
}

// Refactored Parallel Multi-Grid Loading
async function startGridMode() {
  isGridMode = true;
  gridBtn.classList.add('active-mode');
  if (activeTitle) activeTitle.textContent = 'PBB Studio — 4-Camera Multi-View';
  stopWatch();
  
  if (player) { try { await player.destroy(); } catch(e){} player = null; }

  vidContainer.style.display = 'none';
  gridContainer.style.display = 'grid';
  hint.style.display = 'none';
  liveBtn.style.display = 'none';
  setLoad(true, "All Channels", "Loading 4-Camera Studio...");

  // Destroy any existing grid players in parallel
  await Promise.all(gridPlayers.map(gp => gp.destroy().catch(e => console.warn('Grid player cleanup:', e))));
  gridPlayers = [];

  // Initialize and load all 4 camera feeds simultaneously
  await Promise.all(CH.map(async function(ch, k) {
    var gvid = document.getElementById('gv' + k);
    if (!gvid) return;

    var gp = new shaka.Player();
    gridPlayers.push(gp);
    await gp.attach(gvid);

    var gpConfig = {
      // Aggressively lower memory retention and forward-buffering for multi-view
      streaming: { bufferingGoal: 6, rebufferingGoal: 2, bufferBehind: 1 },
      restrictions: { maxHeight: 480 }
    };
    
    if (ch[2]) {
      if (ch[2].startsWith('http')) {
        gpConfig.drm = {
          servers: {
            'com.widevine.alpha': ch[2],
            'com.microsoft.playready': ch[2]
          }
        };
      } else if (ch[2].includes(':')) {
        var parts = ch[2].split(':');
        gpConfig.drm = { clearKeys: { [parts[0]]: parts[1] } };
      }
    }

    gp.configure(gpConfig);

    try {
      await gp.load(ch[1]);
      gvid.muted = true;
      await gvid.play();
    } catch(e) {
      if (e && e.name !== 'AbortError') {
        console.error('Grid player failed to load/play:', ch[0], e);
      }
    }
  }));

  // Reveal Enter button precisely when the grid is ready
  if (isSplashActive) {
    var loadingUI = document.getElementById('splash-loading-ui');
    var enterBtn = document.getElementById('splash-enter-btn');
    if (loadingUI && enterBtn) {
      loadingUI.style.opacity = '0';
      loadingUI.style.transform = 'translateY(-15px)';
      loadingUI.style.pointerEvents = 'none';
      setTimeout(function() {
        loadingUI.style.display = 'none';
        enterBtn.classList.add('show');
      }, 400); 
    }
  }

  setLoad(false);
  markRow(-1);
}

async function stopGridMode(targetIndex) {
  isGridMode = false;
  gridBtn.classList.remove('active-mode');
  liveBtn.style.display = 'flex';
  
  await Promise.all(gridPlayers.map(gp => gp.destroy().catch(e => console.warn('Grid player cleanup:', e))));
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
    var gvids = document.querySelectorAll('.grid-item video');
    gvids.forEach(v => { if (v.paused) v.play().catch(()=>{}); else v.pause(); });
  } else {
    if (vid.paused) vid.play().catch(()=>{}); else vid.pause();
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

muteBtn.onclick = function() {
  if (isGridMode) return;
  vid.muted = !vid.muted;
  if (!vid.muted && vid.volume === 0) vid.volume = 1;
  updateVolIcon();
  hint.style.display = 'none';
};

volSlider.addEventListener('input', function(e) {
  if (isGridMode) return;
  vid.volume = parseFloat(e.target.value);
  vid.muted = (vid.volume === 0);
  updateVolIcon();
});

// Fullscreen & Orientation Logic
var isFsActive = false;

function syncLandscapeState() {
  var isNativeFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  var isPseudoFs = stage.classList.contains('pseudo-fs');
  isFsActive = isNativeFs || isPseudoFs;

  if (!isFsActive) {
    stage.classList.remove('force-landscape');
    return;
  }
  if (window.innerHeight > window.innerWidth) {
    stage.classList.add('force-landscape');
  } else {
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
          screen.orientation.lock('landscape').catch(function() { syncLandscapeState(); });
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
    if (screen.orientation && screen.orientation.unlock) { screen.orientation.unlock(); }
  }
}

window.addEventListener('resize', syncLandscapeState);
window.addEventListener('orientationchange', function() { setTimeout(syncLandscapeState, 200); });
document.addEventListener('fullscreenchange', syncLandscapeState);
document.addEventListener('webkitfullscreenchange', syncLandscapeState);

fsBtn.onclick = toggleFullScreen;
if (tlFs) tlFs.onclick = toggleFullScreen;
if (tlGrid) tlGrid.onclick = function() { gridBtn.click(); };
if (tlClose) tlClose.onclick = function() { stopGridMode(0); };

// Safe Background Music Fade-Out (Clamped & Debounced)
function stopBgMusic() {
  if (!bgMusic || bgMusic.paused || bgFadeTimer) return;
  bgFadeTimer = setInterval(function() {
    if (bgMusic.volume > 0.05) {
      bgMusic.volume = Math.max(0, +(bgMusic.volume - 0.05).toFixed(2));
    } else {
      clearInterval(bgFadeTimer);
      bgFadeTimer = null;
      bgMusic.volume = 0;
      bgMusic.pause();
      bgMusic.currentTime = 0;
    }
  }, 50);
}

hint.onclick = function() { 
  vid.muted = false; 
  updateVolIcon();
  hint.style.display = 'none'; 
  stopBgMusic();
};

vid.addEventListener('click', function() { 
  if (vid.muted) { 
    vid.muted = false; 
    updateVolIcon();
    hint.style.display = 'none'; 
    stopBgMusic();
  } 
});

vid.addEventListener('volumechange', function() {
  if (!vid.muted) stopBgMusic();
});

var sidePanel = document.getElementById('side');
if (sidePanel) sidePanel.addEventListener('click', stopBgMusic);

var hudControls = document.getElementById('controls');
if (hudControls) hudControls.addEventListener('click', stopBgMusic);

// Populate Channel Sidebar
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

startGridMode();

// Auto-Hiding HUD Controls
var controlsEl = document.getElementById('controls');
var hideTimer = null;

function showControls() {
  controlsEl.classList.remove('hidden');
  resetHideTimer();
}

function resetHideTimer() {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(function() {
    if (!load.classList.contains('show') && (!vid.paused || isGridMode) && resoMenu.classList.contains('hidden')) {
      controlsEl.classList.add('hidden');
    }
  }, 3500);
}

stage.addEventListener('click', function(e) {
  if (e.target.closest('#controls') || e.target.closest('#side')) return;
  if (controlsEl.classList.contains('hidden')) {
    showControls();
  } else {
    controlsEl.classList.add('hidden');
    if (hideTimer) clearTimeout(hideTimer);
    resoMenu.classList.add('hidden');
  }
});

stage.addEventListener('mousemove', function() {
  if (!controlsEl.classList.contains('hidden')) resetHideTimer();
});
controlsEl.addEventListener('click', resetHideTimer);
resetHideTimer();

// Unified Splash Screen & Support Modal Initialization
window.addEventListener('load', function() {
  var splash = document.getElementById('splash-screen');
  var enterBtn = document.getElementById('splash-enter-btn');
  var appWindow = document.getElementById('wrap');

  if (enterBtn) {
    enterBtn.addEventListener('click', function() {
      isSplashActive = false; // Mark splash as finished
      
      if (bgMusic && vid.muted) {
        bgMusic.volume = 0.25;
        bgMusic.play().catch(function() {});
      }
      splash.classList.add('hidden');
      if (appWindow) {
        setTimeout(function() { appWindow.classList.add('app-loaded'); }, 100);
      }
      setTimeout(function() { splash.remove(); }, 900);
    });
  }

  // Support Modal Logic
  var donateBtn = document.getElementById('donate-btn');
  var supportModal = document.getElementById('support-modal');
  var closeSupport = document.getElementById('close-support');

  if (donateBtn && supportModal && closeSupport) {
    donateBtn.onclick = function() {
      supportModal.classList.remove('hidden');
    };
    closeSupport.onclick = function() {
      supportModal.classList.add('hidden');
    };
          supportModal.addEventListener('click', function(e) {
        if (e.target === supportModal) {
          supportModal.classList.add('hidden');
        }
      });
      
      // Copy to Clipboard Logic
      var copyBtns = document.querySelectorAll('.copy-btn');
      copyBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
          var textToCopy = btn.getAttribute('data-copy');
          navigator.clipboard.writeText(textToCopy).then(function() {
            var originalHtml = btn.innerHTML;
            // Morph into a checkmark icon
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            btn.classList.add('copied');
            
            // Revert back after 1.5 seconds
            setTimeout(function() {
              btn.innerHTML = originalHtml;
              btn.classList.remove('copied');
            }, 1500);
          }).catch(function(err) {
            console.error('Failed to copy text: ', err);
          });
        });
      });
    }
  });

})();
