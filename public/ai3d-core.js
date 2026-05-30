// ai3d-core.js — Shared namespace, constants, Haptic, 3D overlay, script loaders
// Loaded first by all ai3d feature modules.
(function() {
  'use strict';

  var A = window._AI3D = {
    RM: window.matchMedia('(prefers-reduced-motion:reduce)').matches,
    isMobile: window.matchMedia('(pointer:coarse)').matches
  };

  function _h() { return window._haptic || {}; }
  A.Haptic = {
    tap()        { const h = _h(); if (h.tap) h.tap(); },
    doubleTap()  { const h = _h(); if (h.tap) h.tap(); },
    hold()       { const h = _h(); if (h.expand) h.expand(); },
    success()    { const h = _h(); if (h.success) h.success(); },
    warning()    { const h = _h(); if (h.warning) h.warning(); },
    arEnter()    { const h = _h(); if (h.enter) h.enter(); },
    trade()      { const h = _h(); if (h.collect) h.collect(); },
    rotate()     { const h = _h(); if (h.rotate) h.rotate(); },
    zoom()       { const h = _h(); if (h.rotate) h.rotate(); },
    pulse()      { const h = _h(); if (h.heartbeat) h.heartbeat(); },
    sequence(p)  { const h = _h(); if (h.raw) h.raw(p); },
  };

  // ── Overlay CSS ──
  var css = document.createElement('style');
  css.id = 'ai3d-core-css';
  css.textContent = `
#viewer3dOverlay {
  position: fixed; inset: 0; z-index: 9999; background: transparent;
  display: flex; align-items: center; justify-content: center; flex-direction: column;
  opacity: 0; visibility: hidden; transition: opacity .4s, visibility .4s;
  pointer-events: none; backdrop-filter: blur(6px);
}
#viewer3dOverlay.show { opacity: 1; visibility: visible; pointer-events: auto; }
.viewer3d-container {
  width: 96%; max-width: 500px; height: 400px; border-radius: 16px;
  overflow: hidden; border: 1px solid rgba(0,225,255,.08); background: rgba(6,9,16,.75);
  backdrop-filter: blur(24px) saturate(180%); -webkit-backdrop-filter: blur(24px) saturate(180%);
  box-shadow: 0 8px 40px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.03);
  position: relative; transform: scale(.9); transition: transform .5s cubic-bezier(.16,1,.3,1);
}
#viewer3dOverlay.show .viewer3d-container { transform: scale(1); }
model-viewer { width: 100%; height: 100%; --poster-color: transparent; }
.viewer3d-hud {
  position: absolute; top: 0; left: 0; right: 0; display: flex;
  justify-content: space-between; align-items: center; pointer-events: none; z-index: 20;
  padding: 8px 12px; background: rgba(6,9,16,.6); backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(0,225,255,.06);
}
.viewer3d-title {
  font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 1.5px;
  text-transform: uppercase; color: rgba(0,225,255,.6); text-shadow: 0 0 10px rgba(0,225,255,.25);
}
.viewer3d-close {
  font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #8b949e; cursor: pointer;
  pointer-events: auto; padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(0,225,255,.12);
  background: rgba(0,0,0,.4); backdrop-filter: blur(8px); transition: all .2s;
}
.viewer3d-close:hover { color: #00e1ff; border-color: rgba(0,225,255,.3); background: rgba(0,225,255,.08); }
.viewer3d-hint {
  position: absolute; bottom: 10px; left: 0; right: 0; text-align: center;
  font-family: 'JetBrains Mono', monospace; font-size: 8px; color: rgba(111,123,143,.6);
  letter-spacing: 1px; pointer-events: none; z-index: 10;
}
.viewer3d-loading {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  flex-direction: column; gap: 8px; background: rgba(6,9,16,.9); z-index: 20; transition: opacity .5s;
}
.viewer3d-loading.hidden { opacity: 0; pointer-events: none; }
.viewer3d-loading-text {
  font-family: 'JetBrains Mono', monospace; font-size: 9px; letter-spacing: 1.5px; color: rgba(139,148,158,.5);
}
.viewer3d-close-btn {
  font-size: 14px; line-height: 1; color: #8b949e; cursor: pointer;
  pointer-events: auto; padding: 2px 8px; border-radius: 6px; border: 1px solid rgba(0,225,255,.12);
  background: rgba(0,0,0,.4); backdrop-filter: blur(8px); transition: all .2s;
}
.viewer3d-close-btn:hover { color: #ef4444; border-color: rgba(239,68,68,.3); background: rgba(239,68,68,.08); }
.viewer3d-loading-spinner { font-size: 28px; animation: v3dSpin 2s ease-in-out infinite; }
@keyframes v3dSpin { 0% { transform: rotateY(0); } 100% { transform: rotateY(360deg); } }
@media(max-width:600px) { .viewer3d-container { height: 450px; max-height: 80vh; } }
@media print { #viewer3dOverlay { display: none !important; } }
`;
  document.head.appendChild(css);

  // ── 3D Overlay Core ──
  var threeLoaded = false, threeLoadPromise = null;
  var modelViewerLoaded = false, modelViewerLoadPromise = null;

  function create3DOverlay() {
    if (document.getElementById('viewer3dOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'viewer3dOverlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) close3D(); });
    overlay.innerHTML = `
      <div class="viewer3d-container" id="v3dContainer">
        <div class="viewer3d-loading" id="v3dLoading">
          <div class="viewer3d-loading-spinner">\ud83d\udce6</div>
          <div class="viewer3d-loading-text">Loading...</div>
        </div>
        <div class="viewer3d-hud" id="v3dHud">
          <span class="viewer3d-title" id="v3dTitle">3D Viewer</span>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  function open3D(title, builder, engineType) {
    engineType = engineType || 'three';
    create3DOverlay();
    if (window._v3dCleanup) { window._v3dCleanup(); window._v3dCleanup = null; }

    const overlay = document.getElementById('viewer3dOverlay');
    const loading = document.getElementById('v3dLoading');
    const titleEl = document.getElementById('v3dTitle');
    const container = document.getElementById('v3dContainer');

    if (container) Array.from(container.children).forEach(child => {
        if (!['v3dLoading', 'v3dHud'].includes(child.id)) child.remove();
    });

    if (titleEl) titleEl.textContent = title;
    if (loading) loading.classList.remove('hidden');
    overlay.classList.add('show');
    A.Haptic.doubleTap();
    window.autoDismiss3D('viewer3dOverlay', close3D);

    const loader = engineType === 'model-viewer' ? loadModelViewerJS() : loadThreeJS();

    loader.then(() => {
      if (loading) loading.classList.add('hidden');
      A.Haptic.success();
      builder(container);
    }).catch(err => {
      console.error(`${engineType} load failed:`, err);
      A.Haptic.warning();
      if (loading) loading.querySelector('.viewer3d-loading-text').textContent = 'Failed to load';
    });
  }

  function close3D() {
    A.Haptic.tap();
    const overlay = document.getElementById('viewer3dOverlay');
    if (overlay) overlay.classList.remove('show');
    window.cancelAutoDismiss('viewer3dOverlay');
    const container = document.getElementById('v3dContainer');
    if (container) {
        if (container.querySelector('canvas')) container.querySelector('canvas').remove();
        if (container.querySelector('model-viewer')) container.querySelector('model-viewer').remove();
    }
    if (window._v3dCleanup) { window._v3dCleanup(); window._v3dCleanup = null; }
  }
  window._close3D = close3D;

  function loadThreeJS() {
    if (threeLoaded && window.THREE) return Promise.resolve();
    if (threeLoadPromise) return threeLoadPromise;
    threeLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      script.onload = () => { threeLoaded = true; resolve(); };
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return threeLoadPromise;
  }

  function loadModelViewerJS() {
    if (modelViewerLoaded || customElements.get('model-viewer')) return Promise.resolve();
    if (modelViewerLoadPromise) return modelViewerLoadPromise;
    modelViewerLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js';
      script.onload = () => { modelViewerLoaded = true; resolve(); };
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return modelViewerLoadPromise;
  }

  A.escHtml = function(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

  A.create3DOverlay = create3DOverlay;
  A.open3D = open3D;
  A.close3D = close3D;
  A.loadThreeJS = loadThreeJS;
  A.loadModelViewerJS = loadModelViewerJS;

  create3DOverlay();
  console.log('%c\ud83e\udde9 AI3D Core Loaded', 'background:#6366f1;color:#fff;padding:2px 5px;border-radius:3px;');
})();
