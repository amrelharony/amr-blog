// mascot-assistant.js — Three.js 3D Mascot assistant: always-visible floating companion
// with advanced vertex-shader animations (face tracking, hand gestures, breathing,
// eye blink, talking), holographic effects, mood-reactive lighting, orbital particles,
// chat reactions, and deep site integration.
// Requires: ai3d-core.js (window._AI3D), chatbot-llm.js (window._AskAmrAPI)
(function() {
  'use strict';
  var A = window._AI3D;
  var API = window._AskAmrAPI;
  if (!A || !API) return;

  // ══════════════════════════════════════════════════════
  // SECTION 1: CSS INJECTION
  // ══════════════════════════════════════════════════════
  var css = document.createElement('style');
  css.id = 'mascot-assistant-css';
  css.textContent = `
/* ── Floating 3D Mascot (always visible) ── */
.mascot-float {
  position: fixed; top: 16px; right: 16px; z-index: 99;
  width: 160px; height: 280px;
  cursor: pointer; transition: bottom .3s ease, opacity .6s ease;
  -webkit-tap-highlight-color: transparent;
  pointer-events: auto;
  animation: mascotFloat 4s ease-in-out infinite;
  opacity: 0;
}
@keyframes mascotFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
.mascot-float:hover { animation-play-state: paused; transform: scale(1.08); }
.mascot-float canvas {
  width: 100% !important; height: 100% !important; display: block;
  border-radius: 16px;
  filter: drop-shadow(0 8px 24px rgba(0,225,255,.18)) drop-shadow(0 20px 40px rgba(0,0,0,.25));
}
.mascot-float-label {
  position: absolute; bottom: -4px; left: 50%; transform: translateX(-50%);
  font-family: 'JetBrains Mono', monospace; font-size: 7px;
  letter-spacing: 1.5px; text-transform: uppercase;
  color: rgba(0,225,255,.45); text-shadow: 0 0 8px rgba(0,225,255,.2);
  white-space: nowrap; pointer-events: none;
  opacity: 0; transition: opacity .3s;
}
.mascot-float:hover .mascot-float-label { opacity: 1; }
.mascot-float.hidden { display: none !important; }
/* ── Chat Panel (above mascot) ── */
.mascot-panel {
  position: fixed; top: 300px; right: 16px; z-index: 100;
  width: 340px; height: 440px; max-height: 60vh;
  display: none; flex-direction: column;
  border-radius: 16px; overflow: hidden;
  background: rgba(6,9,16,.92);
  backdrop-filter: blur(24px) saturate(180%); -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(0,225,255,.1);
  box-shadow: 0 12px 48px rgba(0,0,0,.55), 0 0 0 1px rgba(0,225,255,.04), inset 0 1px 0 rgba(255,255,255,.04);
  transform-origin: top right;
}
.mascot-panel::before {
  content: ''; display: block; height: 2px; flex-shrink: 0;
  background: linear-gradient(90deg, #00e1ff, #6366f1);
}
.mascot-panel.open { display: flex; }
.mascot-header {
  display: flex; flex-direction: column; gap: 3px;
  padding: 10px 14px 8px; min-height: 38px;
  background: rgba(6,9,16,.6); backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(0,225,255,.06);
}
.mascot-header-top { display: flex; align-items: center; justify-content: space-between; }
.mascot-header-title {
  font-family: 'JetBrains Mono', monospace; font-size: 12px;
  letter-spacing: 2px; text-transform: uppercase;
  color: rgba(0,225,255,.85); text-shadow: 0 0 12px rgba(0,225,255,.3);
}
.mascot-header-sub {
  font-family: 'Inter', system-ui, sans-serif; font-size: 8px;
  color: #4a5568; line-height: 1.4;
}
.mascot-header-meta {
  display: flex; align-items: center; gap: 10px;
  font-family: 'JetBrains Mono', monospace; font-size: 8px;
  letter-spacing: 0.5px; color: #4a5568;
}
.mascot-status-dot {
  display: inline-block; width: 6px; height: 6px; border-radius: 50%;
  margin-right: 3px; vertical-align: middle;
}
.mascot-status-dot.online { background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,.5); animation: mascotStatusPulse 2s ease-in-out infinite; }
.mascot-status-dot.fallback { background: #eab308; box-shadow: 0 0 6px rgba(234,179,8,.4); }
.mascot-status-dot.offline { background: #ef4444; box-shadow: 0 0 6px rgba(239,68,68,.4); }
@keyframes mascotStatusPulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
.mascot-header-actions { display: flex; gap: 6px; align-items: center; }
.mascot-header-btn {
  font-family: 'JetBrains Mono', monospace; font-size: 9px;
  color: #8b949e; cursor: pointer; padding: 4px 8px;
  border-radius: 6px; border: 1px solid rgba(0,225,255,.12);
  background: rgba(0,0,0,.4); backdrop-filter: blur(8px);
  transition: all .2s; line-height: 1;
}
.mascot-header-btn:hover { color: #00e1ff; border-color: rgba(0,225,255,.3); background: rgba(0,225,255,.08); }
.mascot-close-btn:hover { color: #ef4444; border-color: rgba(239,68,68,.3); background: rgba(239,68,68,.08); }
/* ── Rate Limit Display ── */
.mascot-rate-limit {
  display: flex; align-items: center; gap: 6px; padding: 4px 16px 6px;
  font-family: 'JetBrains Mono', monospace; font-size: 8px;
  color: #4a5568; letter-spacing: 0.3px;
  border-bottom: 1px solid rgba(0,225,255,.04);
}
.mascot-rate-limit.warning { color: #eab308; }
.mascot-rate-limit.exceeded { color: #ef4444; }
/* ── Voice Input ── */
.mascot-voice-btn {
  width: 30px; height: 30px; border-radius: 8px;
  background: transparent; border: 1px solid rgba(0,225,255,.12);
  color: #8b949e; font-size: 12px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all .2s;
}
.mascot-voice-btn:hover { color: #00e1ff; border-color: rgba(0,225,255,.3); background: rgba(0,225,255,.05); }
.mascot-voice-btn.recording {
  color: #ef4444; border-color: rgba(239,68,68,.4);
  animation: mascotVoicePulse 1s ease-in-out infinite;
}
@keyframes mascotVoicePulse { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,.3); } 50% { box-shadow: 0 0 0 6px rgba(239,68,68,0); } }
/* ── Markdown Rendering ── */
.mascot-msg-bot code {
  font-family: 'JetBrains Mono', monospace; font-size: 10px;
  background: rgba(0,225,255,.06); border: 1px solid rgba(0,225,255,.08);
  border-radius: 4px; padding: 1px 5px; color: #00e1ff;
}
.mascot-msg-bot pre {
  margin: 6px 0; border-radius: 8px; overflow-x: auto;
  background: rgba(0,0,0,.3); border: 1px solid rgba(0,225,255,.06);
  padding: 10px 12px; font-size: 10px; line-height: 1.5;
}
.mascot-msg-bot pre code {
  background: none; border: none; padding: 0; color: #c9d1d9;
}
.mascot-msg-bot ul, .mascot-msg-bot ol { margin: 4px 0; padding-left: 18px; }
.mascot-msg-bot li { margin: 2px 0; }
.mascot-msg-bot a { color: #00e1ff; text-decoration: underline; text-underline-offset: 2px; }
.mascot-msg-bot a:hover { color: #6366f1; }
.mascot-msg-bot em { color: inherit; opacity: .85; }
/* ── Enhanced Message Animations ── */
.mascot-msg-user { animation: mascotMsgUserIn .25s ease-out; }
@keyframes mascotMsgUserIn { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }
.mascot-msg-bot { animation: mascotMsgBotIn .3s ease-out; }
@keyframes mascotMsgBotIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
/* ── Send Button Micro-interactions ── */
.mascot-send:active { transform: scale(0.9); }
.mascot-send.pulse { animation: mascotSendPulse .3s ease; }
@keyframes mascotSendPulse { 0% { transform: scale(1); } 50% { transform: scale(1.15); } 100% { transform: scale(1); } }
/* ── Input Focus Glow ── */
.mascot-input:focus { border-color: rgba(0,225,255,.35); box-shadow: 0 0 0 2px rgba(0,225,255,.08), 0 0 12px rgba(0,225,255,.06); }
/* ── Typing indicator upgrade ── */
.mascot-typing-label {
  font-family: 'JetBrains Mono', monospace; font-size: 8px;
  color: #4a5568; margin-left: 6px; letter-spacing: 0.5px;
}
/* ── Status message ── */
.mascot-status-msg {
  display: flex; align-items: center; gap: 6px;
  font-family: 'JetBrains Mono', monospace; font-size: 8px;
  color: #4a5568; letter-spacing: 0.5px; padding: 4px 0;
}
.mascot-status-msg .mascot-typing { transform: scale(0.8); transform-origin: left center; }
/* ── Word-by-word fade-in ── */
.mascot-word {
  display: inline; opacity: 0; animation: mascotWordIn 0.2s ease forwards;
}
@keyframes mascotWordIn { from { opacity: 0; filter: blur(2px); } to { opacity: 1; filter: blur(0); } }
.mascot-badge.server { background: rgba(99,102,241,.1); color: #818cf8; border: 1px solid rgba(99,102,241,.15); }
.mascot-mood-flash { animation: mascotMoodFlash .4s ease-out; }
@keyframes mascotMoodFlash {
  0% { box-shadow: 0 0 20px rgba(0,225,255,.3); }
  100% { box-shadow: none; }
}
.mascot-chat {
  flex: 1; overflow-y: auto; padding: 10px 12px;
  display: flex; flex-direction: column; gap: 8px;
  scrollbar-width: thin; scrollbar-color: rgba(0,225,255,.1) transparent;
}
.mascot-chat::-webkit-scrollbar { width: 4px; }
.mascot-chat::-webkit-scrollbar-thumb { background: rgba(0,225,255,.12); border-radius: 2px; }
.mascot-msg {
  padding: 10px 14px; border-radius: 10px; font-size: 11px; line-height: 1.6;
  animation: mascotMsgIn .3s ease;
}
@keyframes mascotMsgIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
.mascot-msg-user {
  background: rgba(0,225,255,.06); backdrop-filter: blur(8px);
  border-left: 3px solid rgba(0,225,255,.4); color: #c9d1d9;
  align-self: flex-end; max-width: 82%;
  box-shadow: 0 2px 8px rgba(0,0,0,.15);
}
.mascot-msg-bot {
  background: rgba(255,255,255,.03); backdrop-filter: blur(8px);
  border-left: 3px solid rgba(0,225,255,.12); color: #9ba4ae;
  align-self: flex-start; max-width: 88%;
  box-shadow: 0 2px 8px rgba(0,0,0,.1);
}
.mascot-msg-bot strong { color: #e2e8f0; }
.mascot-msg-bot .highlight { color: #00e1ff; text-shadow: 0 0 8px rgba(0,225,255,.2); }
.mascot-typing { display: inline-flex; gap: 3px; padding: 4px 0; }
.mascot-typing span {
  width: 4px; height: 4px; border-radius: 50%; background: #00e1ff;
  box-shadow: 0 0 6px rgba(0,225,255,.4); animation: mascotTypeDot 1.2s ease-in-out infinite;
}
.mascot-typing span:nth-child(2) { animation-delay: .2s; }
.mascot-typing span:nth-child(3) { animation-delay: .4s; }
@keyframes mascotTypeDot { 0%,100% { opacity: .2; } 50% { opacity: 1; } }
.mascot-cursor {
  display: inline-block; width: 2px; height: 13px; background: #00e1ff;
  box-shadow: 0 0 8px rgba(0,225,255,.5); animation: mascotCursorBlink .8s step-end infinite;
  vertical-align: text-bottom; margin-left: 2px;
}
@keyframes mascotCursorBlink { 50% { opacity: 0; } }
.mascot-confidence {
  display: inline-block; font-family: 'JetBrains Mono', monospace; font-size: 7px;
  letter-spacing: 1px; text-transform: uppercase; padding: 2px 6px;
  border-radius: 4px; margin-bottom: 4px; backdrop-filter: blur(4px);
}
.mascot-confidence.high { background: rgba(34,197,94,.1); color: #22c55e; border: 1px solid rgba(34,197,94,.15); }
.mascot-confidence.good { background: rgba(0,225,255,.06); color: #00e1ff; border: 1px solid rgba(0,225,255,.1); }
.mascot-badge {
  display: inline-block; font-family: 'JetBrains Mono', monospace; font-size: 7px;
  letter-spacing: 1px; text-transform: uppercase; padding: 2px 8px;
  border-radius: 4px; margin-bottom: 4px; margin-right: 4px; backdrop-filter: blur(4px);
}
.mascot-badge.ai { background: rgba(34,197,94,.1); color: #22c55e; border: 1px solid rgba(34,197,94,.15); }
.mascot-badge.kb { background: rgba(139,148,158,.06); color: #8b949e; border: 1px solid rgba(139,148,158,.1); }
.mascot-topics { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.mascot-topic {
  font-family: 'JetBrains Mono', monospace; font-size: 8px; padding: 3px 10px;
  border-radius: 100px; border: 1px solid rgba(0,225,255,.12);
  background: rgba(0,225,255,.03); backdrop-filter: blur(6px);
  color: #00e1ff; cursor: pointer; transition: all .2s;
  -webkit-tap-highlight-color: transparent;
}
.mascot-topic:hover { background: rgba(0,225,255,.1); border-color: rgba(0,225,255,.3); }
.mascot-input-wrap {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 12px; border-top: 1px solid rgba(0,225,255,.06);
  background: rgba(6,9,16,.5);
}
.mascot-input {
  flex: 1; background: rgba(255,255,255,.04); border: 1px solid rgba(0,225,255,.1);
  border-radius: 8px; padding: 8px 12px;
  font-family: 'JetBrains Mono', monospace; font-size: 11px;
  color: #c9d1d9; outline: none; transition: border-color .2s, box-shadow .2s;
}
.mascot-input::placeholder { color: rgba(139,148,158,.4); }
.mascot-input:focus { border-color: rgba(0,225,255,.3); box-shadow: 0 0 0 2px rgba(0,225,255,.06); }
.mascot-send {
  width: 30px; height: 30px; border-radius: 8px;
  background: linear-gradient(135deg, rgba(0,225,255,.12), rgba(0,225,255,.06));
  border: 1px solid rgba(0,225,255,.2);
  color: #00e1ff; font-size: 12px; cursor: pointer;
  display: flex; align-items: center; justify-content: center; transition: all .2s;
}
.mascot-send:hover { background: linear-gradient(135deg, rgba(0,225,255,.2), rgba(0,225,255,.12)); border-color: rgba(0,225,255,.35); box-shadow: 0 0 12px rgba(0,225,255,.15); }
/* ── Light Mode ── */
.light-mode .mascot-panel { background: rgba(255,255,255,.95); border-color: rgba(0,0,0,.08); box-shadow: 0 12px 48px rgba(0,0,0,.12), 0 0 0 1px rgba(0,0,0,.04); }
.light-mode .mascot-header { background: rgba(248,250,252,.9); border-bottom-color: rgba(0,0,0,.08); }
.light-mode .mascot-header-title { color: rgba(0,102,255,.6); text-shadow: none; }
.light-mode .mascot-header-sub { color: #94a3b8; }
.light-mode .mascot-header-meta { color: #94a3b8; }
.light-mode .mascot-header-btn { color: #6b7280; border-color: rgba(0,0,0,.08); background: rgba(0,0,0,.03); }
.light-mode .mascot-header-btn:hover { color: #0066ff; border-color: rgba(0,102,255,.2); background: rgba(0,102,255,.06); }
.light-mode .mascot-rate-limit { color: #94a3b8; border-bottom-color: rgba(0,0,0,.06); }
.light-mode .mascot-voice-btn { color: #94a3b8; border-color: rgba(0,0,0,.1); }
.light-mode .mascot-voice-btn:hover { color: #0066ff; border-color: rgba(0,102,255,.2); }
.light-mode .mascot-msg-bot code { background: rgba(0,102,255,.06); border-color: rgba(0,102,255,.1); color: #0066ff; }
.light-mode .mascot-msg-bot pre { background: rgba(0,0,0,.03); border-color: rgba(0,0,0,.08); }
.light-mode .mascot-msg-bot pre code { color: #334155; }
.light-mode .mascot-msg-bot a { color: #0066ff; }
.light-mode .mascot-badge.server { background: rgba(99,102,241,.08); color: #6366f1; border-color: rgba(99,102,241,.15); }
.light-mode .mascot-close-btn:hover { color: #ef4444; border-color: rgba(239,68,68,.2); background: rgba(239,68,68,.06); }
.light-mode .mascot-float canvas { filter: drop-shadow(0 4px 16px rgba(0,102,255,.08)); }
.light-mode .mascot-float-label { color: rgba(0,102,255,.4); text-shadow: none; }
.light-mode .mascot-msg-user { background: rgba(0,102,255,.08); border-left-color: rgba(0,102,255,.4); color: #1e293b; box-shadow: 0 1px 4px rgba(0,102,255,.08); }
.light-mode .mascot-msg-bot { background: rgba(241,245,249,.9); border-left-color: rgba(0,0,0,.12); color: #334155; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.light-mode .mascot-msg-bot strong { color: #0f172a; }
.light-mode .mascot-msg-bot .highlight { color: #0066ff; text-shadow: none; }
.light-mode .mascot-typing span { background: #0066ff; box-shadow: 0 0 4px rgba(0,102,255,.3); }
.light-mode .mascot-cursor { background: #0066ff; box-shadow: 0 0 6px rgba(0,102,255,.4); }
.light-mode .mascot-topic { border-color: rgba(0,102,255,.18); background: rgba(0,102,255,.06); color: #0066ff; text-shadow: none; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
.light-mode .mascot-topic:hover { background: rgba(0,102,255,.12); border-color: rgba(0,102,255,.3); }
.light-mode .mascot-input-wrap { border-top-color: rgba(0,0,0,.08); background: rgba(248,250,252,.8); }
.light-mode .mascot-input { background: #fff; border-color: rgba(0,0,0,.12); color: #1e293b; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
.light-mode .mascot-input::placeholder { color: rgba(100,116,139,.5); }
.light-mode .mascot-input:focus { border-color: rgba(0,102,255,.4); box-shadow: 0 0 0 2px rgba(0,102,255,.08); }
.light-mode .mascot-send { background: linear-gradient(135deg, rgba(0,102,255,.12), rgba(0,102,255,.06)); border-color: rgba(0,102,255,.2); color: #0066ff; }
.light-mode .mascot-send:hover { background: linear-gradient(135deg, rgba(0,102,255,.2), rgba(0,102,255,.12)); border-color: rgba(0,102,255,.35); }
.light-mode .mascot-confidence.good { background: rgba(0,102,255,.06); color: #0066ff; border-color: rgba(0,102,255,.12); }
.light-mode .mascot-badge.ai { background: rgba(34,197,94,.08); }
/* ── Mobile ── */
@media(max-width:600px) {
  .mascot-float { width: 100px; height: 180px; top: 16px; right: 8px; }
  .mascot-panel {
    position: fixed; top: 0; bottom: 0; right: 0; left: 0;
    width: 100vw; height: 100vh; height: 100dvh;
    max-width: 100vw; max-height: 100vh; max-height: 100dvh;
    border-radius: 0; margin: 0; transform: none; transform-origin: bottom center;
    background: rgba(6,9,16,.98);
  }
  .light-mode .mascot-panel {
    background: rgba(255,255,255,.98);
  }
}
/* ── Article view ── */
.mascot-float.article-enter {
  animation: mascotArticleEnter .6s cubic-bezier(.16,1,.3,1) forwards;
}
@keyframes mascotArticleEnter {
  from { opacity: 0; transform: translateY(30px) scale(0.7); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
/* ── Zen / Print ── */
body.zen-mode .mascot-float, body.zen-mode .mascot-panel { display: none !important; }
@media print { .mascot-float, .mascot-panel { display: none !important; } }
/* ── Reduced Motion ── */
@media(prefers-reduced-motion:reduce) {
  .mascot-msg { animation: none; }
  .mascot-panel { transition: none; }
  .mascot-mood-flash { animation: none; }
  .mascot-float { transition: none; }
}
`;
  document.head.appendChild(css);

  // ══════════════════════════════════════════════════════
  // SECTION 2: THREE.JS SCENE MANAGER
  // ══════════════════════════════════════════════════════
  var scene, camera, renderer, controls, clock;
  var mascotRoot, mascotMesh, mascotMaterial;
  var baseY = 0, baseScale = 1;
  var alive = false, paused = false, sceneReady = false;
  var disposables = [];
  var accentLight, rimLight;
  var extLoaded = false, extPromise = null;

  // ── Skeletal Animation + Morph Targets (Phase 2) ──
  var mixer = null;
  var animActions = {};       // { clipName: THREE.AnimationAction }
  var currentAction = null;
  var morphTargets = {};      // { shapekeyName: index }
  var targetMorphs = {};      // target morph influence values (0-1)
  var MOOD_EXPRESSIONS = {
    serene:     { smile: 0.3 },
    playful:    { smile: 0.8, eyebrow_raise: 0.3 },
    intense:    { eyebrow_furrow: 0.5 },
    curious:    { eyebrow_raise: 0.5, smile: 0.2 },
    determined: { eyebrow_furrow: 0.3, squint: 0.2 },
    neutral:    {},
    warm:       { smile: 0.4 }
  };

  // Mood colors & speed maps
  var MOOD_COLORS = {
    warm: 0xfbbf24, focused: 0x6366f1, surprised: 0xa855f7, calm: 0x2dd4bf,
    melancholy: 0x60a5fa, serene: 0x94a3b8, intense: 0xef4444, neutral: 0x8a95a8,
    playful: 0xf472b6, determined: 0xf59e0b, curious: 0x34d399
  };
  var MOOD_SPEEDS = {
    warm: 1.0, focused: 0.9, surprised: 1.2, calm: 0.7, melancholy: 0.6,
    serene: 0.5, intense: 1.5, neutral: 1.0, playful: 1.3, determined: 1.1, curious: 1.1
  };
  var currentMoodColor, targetMoodColor, moodAnimSpeed = 1.0, targetAnimSpeed = 1.0;
  var moodTransitionT = 1;

  // Ultra Particle state
  var particleSpeedMul = 1.0, targetParticleSpeed = 1.0;
  var UP = {
    geo: null, points: null, mat: null,
    CLOUD_COUNT: 0,
    SPARKLE_COUNT: 0,
    AURA_COUNT: 0,
    RING_COUNT: 0,
    totalCount: 0,
    layers: {},
    phases: [],
    cloudIntensity: 1.0, targetCloudIntensity: 1.0,
    sparkleQueue: [],
    ringRadius: 0.5, targetRingRadius: 0.5,
    ringRotation: 0,
    auraBreathSync: 0,
    cloudColorA: null, cloudColorB: null,
    targetCloudColorA: null, targetCloudColorB: null,
    _entranceRadiusScale: 1.0, _entranceOpacity: 1.0,
    entranceComplete: false
  };
  var gsapTimelines = { entrance: null, moodTransition: null, reactions: {} };

  // Weather particles
  var weatherParticles, weatherMat, weatherGeo, weatherType = null;
  var WEATHER_COUNT = 8;

  // Reaction queue
  var activeReaction = null, reactionQueue = [], reactionStart = 0;
  var reactionBaseRot = { x: 0, y: 0, z: 0 };

  // Raycaster for click detection
  var raycaster, mouse2D;
  var clickXpAwarded = false;

  // ── Advanced Animation Uniforms ──
  var animUniforms = {
    uTime:           { value: 0 },
    uTalkAmount:     { value: 0 },
    uBlinkAmount:    { value: 0 },
    uMoodSpeed:      { value: 1.0 },
    uScanLine:       { value: 0 },
    uFresnelColor:   { value: null },
    uFresnelPower:   { value: 4.0 },
    uEmissionPulse:  { value: 0 }
  };

  // Mouse tracking for head follow
  var mouseNDC = { x: 0, y: 0 };
  var headCurrentX = 0, headCurrentY = 0;

  // Talking state
  var isTalking = false, talkIntensity = 0;

  // Blink state
  var nextBlinkTime = 2 + Math.random() * 4;
  var blinkPhase = -1;

  function _loadScript(src) {
    return new Promise(function(resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function loadThreeExtensions() {
    if (extLoaded) return Promise.resolve();
    if (extPromise) return extPromise;
    extPromise = A.loadThreeJS().then(function() {
      return _loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js');
    }).then(function() { extLoaded = true; }).catch(function(e) {
      extPromise = null; throw e;
    });
    return extPromise;
  }

  // ── Custom Vertex Shader Injection ──
  var VERT_HEADER = [
    'uniform float uTalkAmount;',
    'uniform float uBlinkAmount;',
    'varying float vRegionHead;',
    'varying float vRegionFace;',
    'varying float vScanUV;',
    'varying vec3 vWorldNormal;',
    'varying vec3 vWorldPosition;',
    ''
  ].join('\n');

  var VERT_TRANSFORM = [
    '{',
    '  vec3 pos = transformed;',
    '  vec3 nrm = objectNormal;',
    '  float ny = pos.y;',
    '',
    '  float headMask   = smoothstep(0.30, 0.45, ny);',
    '  float faceMask   = smoothstep(0.45, 0.55, ny) * (1.0 - smoothstep(0.85, 0.95, ny));',
    '  float eyeMask    = smoothstep(0.55, 0.62, ny) * (1.0 - smoothstep(0.70, 0.78, ny))',
    '                   * smoothstep(-0.25, -0.12, pos.x) * smoothstep(0.12, 0.25, -pos.x)',
    '                   * step(0.0, pos.z);',
    '  float jawMask    = smoothstep(0.38, 0.46, ny) * (1.0 - smoothstep(0.50, 0.56, ny))',
    '                   * step(0.0, pos.z);',
    '',
    '  pos.y -= eyeMask * uBlinkAmount * 0.02;',
    '  pos.z *= 1.0 - eyeMask * uBlinkAmount * 0.4;',
    '',
    '  pos.y -= jawMask * uTalkAmount * 0.015;',
    '  pos.z += jawMask * uTalkAmount * 0.006;',
    '',
    '  vRegionHead = headMask;',
    '  vRegionFace = faceMask;',
    '  vScanUV = (ny + 1.0) * 0.5;',
    '',
    '  transformed = pos;',
    '  objectNormal = nrm;',
    '',
    '  vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    '  vWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);',
    '}'
  ].join('\n');

  var FRAG_HEADER = [
    'uniform float uScanLine;',
    'uniform vec3 uFresnelColor;',
    'uniform float uFresnelPower;',
    'uniform float uEmissionPulse;',
    'varying float vRegionHead;',
    'varying float vRegionFace;',
    'varying float vScanUV;',
    'varying vec3 vWorldNormal;',
    'varying vec3 vWorldPosition;',
    ''
  ].join('\n');

  var FRAG_INJECT = [
    '{',
    '  float scanDist = abs(vScanUV - uScanLine);',
    '  float scanGlow = smoothstep(0.04, 0.0, scanDist) * 0.12;',
    '  gl_FragColor.rgb += vec3(0.0, 0.88, 1.0) * scanGlow;',
    '',
    '  vec3 viewDir = normalize(cameraPosition - vWorldPosition);',
    '  float fresnel = pow(1.0 - max(dot(normalize(vWorldNormal), viewDir), 0.0), uFresnelPower);',
    '  gl_FragColor.rgb += uFresnelColor * fresnel * 0.15;',
    '',
    '  gl_FragColor.rgb += uFresnelColor * uEmissionPulse * 0.1;',
    '}'
  ].join('\n');

  // Inject vertex animations into any MeshStandardMaterial from the GLB
  function injectShaderAnimations(mat) {
    mat.customProgramCacheKey = function() { return 'mascot-v3'; };
    mat.onBeforeCompile = function(shader) {
      shader.uniforms.uTalkAmount = animUniforms.uTalkAmount;
      shader.uniforms.uBlinkAmount = animUniforms.uBlinkAmount;

      // Vertex shader: blink, jaw, breathing, float on all devices
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>', '#include <common>\n' + VERT_HEADER);
      shader.vertexShader = shader.vertexShader.replace(
        '#include <morphtarget_vertex>', '#include <morphtarget_vertex>\n' + VERT_TRANSFORM);

      // Fragment shader: holographic effects on all devices
      shader.uniforms.uScanLine = animUniforms.uScanLine;
      shader.uniforms.uFresnelColor = animUniforms.uFresnelColor;
      shader.uniforms.uFresnelPower = animUniforms.uFresnelPower;
      shader.uniforms.uEmissionPulse = animUniforms.uEmissionPulse;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>', '#include <common>\n' + FRAG_HEADER);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>', FRAG_INJECT + '\n#include <dithering_fragment>');
    };
    mat.needsUpdate = true;
    mascotMaterial = mat;
  }

  function initScene(container) {
    var W = container.clientWidth || 160;
    var H = container.clientHeight || 200;
    var T = window.THREE;

    animUniforms.uFresnelColor = { value: new T.Color(0x00e1ff) };

    scene = new T.Scene();
    camera = new T.PerspectiveCamera(62, W / H, 0.1, 50);
    camera.position.set(0, 0.7, 2.5);
    camera.lookAt(0, 0.6, 0);

    renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'default'
    });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.6;
    if (renderer.outputColorSpace !== undefined) {
      renderer.outputColorSpace = T.SRGBColorSpace || 'srgb';
    } else {
      renderer.outputEncoding = T.sRGBEncoding;
    }
    container.appendChild(renderer.domElement);

    renderer.domElement.addEventListener('webglcontextlost', function(e) {
      e.preventDefault(); alive = false;
      if (floatEl) floatEl.style.display = 'none';
    });
    renderer.domElement.addEventListener('webglcontextrestored', function() {
      if (renderer && scene && camera && !alive) {
        alive = true;
        if (floatEl) floatEl.style.display = '';
        animate();
      }
    });

    clock = new T.Clock();

    // Lighting — optimized for small floating view
    var hemi = new T.HemisphereLight(0xffffff, 0x887766, 1.0);
    scene.add(hemi); disposables.push(hemi);

    // Key light — strong frontal
    var key = new T.DirectionalLight(0xffffff, A.isMobile ? 1.4 : 1.2);
    key.position.set(1, 2, 4);
    scene.add(key); disposables.push(key);

    if (A.isMobile) {
      // Mobile: single accent light, skip fill/rim to reduce draw calls
      accentLight = new T.PointLight(0x00e1ff, 0.3, 10);
      accentLight.position.set(-1, 1, 2);
      scene.add(accentLight); disposables.push(accentLight);
    } else {
      // Desktop: full lighting
      var fill2 = new T.DirectionalLight(0xffeedd, 0.5);
      fill2.position.set(-2, 1, 2);
      scene.add(fill2); disposables.push(fill2);

      accentLight = new T.PointLight(0x00e1ff, 0.4, 10);
      accentLight.position.set(-1, 1, 2);
      scene.add(accentLight); disposables.push(accentLight);

      rimLight = new T.PointLight(0x6366f1, 0.25, 8);
      rimLight.position.set(0, 0.5, -2);
      scene.add(rimLight); disposables.push(rimLight);

      var fillLight = new T.PointLight(0xffffff, 0.3, 6);
      fillLight.position.set(0, -0.3, 2);
      scene.add(fillLight); disposables.push(fillLight);
    }

    currentMoodColor = new T.Color(0x00e1ff);
    targetMoodColor = new T.Color(0x00e1ff);

    // No orbit controls for floating mascot — it auto-rotates slowly via uniform
    // But keep raycaster for click
    raycaster = new T.Raycaster();
    mouse2D = new T.Vector2();

    // Track mouse/touch across entire page for head follow
    if (A.isMobile) {
      document.addEventListener('touchmove', onGlobalTouchMove, { passive: true });
      document.addEventListener('touchstart', onGlobalTouchMove, { passive: true });
    } else {
      document.addEventListener('mousemove', onGlobalMouseMove);
    }

    // Ultra particles + weather
    initUltraParticles();
    initWeatherParticles();

    window.addEventListener('resize', onResize);

    alive = true;
    paused = false;
    animate();
    sceneReady = true;
  }

  function onGlobalMouseMove(e) {
    if (!floatEl) return;
    var rect = floatEl.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    mouseNDC.x = Math.max(-1, Math.min(1, (e.clientX - cx) / 250));
    mouseNDC.y = Math.max(-1, Math.min(1, -(e.clientY - cy) / 250));
    // Gesture tracking for circle/zigzag detection
    trackGesture(e.clientX, e.clientY);
    // Proximity audio — harmonic field around mascot
    var dist = Math.sqrt(mouseNDC.x * mouseNDC.x + mouseNDC.y * mouseNDC.y);
    var prox = Math.max(0, 1 - dist);
    updateProximityAudio(prox);
  }

  function onGlobalTouchMove(e) {
    if (!floatEl || !e.touches.length) return;
    var t = e.touches[0];
    var rect = floatEl.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    mouseNDC.x = Math.max(-1, Math.min(1, (t.clientX - cx) / 200));
    mouseNDC.y = Math.max(-1, Math.min(1, -(t.clientY - cy) / 200));
    // Proximity audio — harmonic field around mascot (mobile)
    var dist = Math.sqrt(mouseNDC.x * mouseNDC.x + mouseNDC.y * mouseNDC.y);
    var prox = Math.max(0, 1 - dist);
    updateProximityAudio(prox);
    trackGesture(t.clientX, t.clientY);
  }

  function onResize() {
    if (!renderer || !floatEl) return;
    var W = floatEl.clientWidth || 160;
    var H = floatEl.clientHeight || 200;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
  }

  // ── GLB Loading with XHR progress ──
  function loadGLB(url, onProgress) {
    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';
      xhr.onprogress = function(e) {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
      };
      xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          var loader = new THREE.GLTFLoader();
          loader.parse(xhr.response, '', resolve, reject);
        } else reject(new Error('HTTP ' + xhr.status));
      };
      xhr.onerror = function() { reject(new Error('Network error')); };
      xhr.send();
    });
  }

  function onModelLoaded(gltf) {
    var T = window.THREE;
    mascotRoot = gltf.scene;
    mascotRoot.renderOrder = 0;
    scene.add(mascotRoot);

    // Retint skin-colored pixels to match profile photo skin tone
    function retintSkin(texture) {
      if (!texture || !texture.image) return;
      var img = texture.image;
      var c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      var ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      var id = ctx.getImageData(0, 0, c.width, c.height);
      var d = id.data;
      // Target skin tone sampled from profile photo (avg of forehead/cheek/nose)
      // Forehead #dfa47f, Cheek #cf9672, Nose #d29a7c → avg ~#d59d7a
      var tR = 213, tG = 157, tB = 122;
      for (var i = 0; i < d.length; i += 4) {
        var r = d[i], g = d[i+1], b = d[i+2];
        // Detect skin pixels: warm tones where R > G > B, not too dark, not grey
        if (r < 60 || r < g) continue;
        var diff = r - b;
        if (diff < 20) continue; // not warm enough
        if (r - g < 5) continue; // too grey/green
        var brightness = (r + g + b) / 3;
        if (brightness < 50 || brightness > 230) continue; // skip very dark/light
        var saturation = diff / r;
        if (saturation < 0.15) continue; // too grey
        // Blend toward target while preserving shading (relative luminance)
        var lum = brightness / 140; // normalise around mid-skin brightness
        var t = 0.6;
        d[i]   = Math.min(255, Math.max(0, Math.round(r + (tR * lum - r) * t)));
        d[i+1] = Math.min(255, Math.max(0, Math.round(g + (tG * lum - g) * t)));
        d[i+2] = Math.min(255, Math.max(0, Math.round(b + (tB * lum - b) * t)));
      }
      ctx.putImageData(id, 0, 0);
      texture.image = c;
      texture.needsUpdate = true;
    }

    // Inject vertex shader animations into all mesh materials
    mascotRoot.traverse(function(child) {
      if (child.isMesh) {
        mascotMesh = child;
        disposables.push(child.geometry);
        var mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(function(m) {
          // Fix GLB metalness: fully metallic with no envMap = invisible
          m.metalness = 0;
          m.roughness = 1;
          retintSkin(m.map);
          injectShaderAnimations(m);
          disposables.push(m);
          for (var key in m) {
            if (m[key] && m[key].isTexture) disposables.push(m[key]);
          }
        });
      }
    });

    // Auto-center and scale
    var box = new T.Box3().setFromObject(mascotRoot);
    var center = box.getCenter(new T.Vector3());
    var size = box.getSize(new T.Vector3());
    var maxDim = Math.max(size.x, size.y, size.z);
    var scale = 1.4 / maxDim;
    mascotRoot.scale.setScalar(scale);
    mascotRoot.position.sub(center.multiplyScalar(scale));
    mascotRoot.position.y -= (box.min.y * scale);

    baseY = mascotRoot.position.y;
    baseScale = scale;

    // Set particle cloud anchor at feet level (bottom of bounding box in world space)
    var worldBox = new T.Box3().setFromObject(mascotRoot);
    particleFeetY = worldBox.min.y;

    // Extract morph targets from mesh
    if (mascotMesh && mascotMesh.morphTargetDictionary) {
      morphTargets = mascotMesh.morphTargetDictionary;
      for (var name in morphTargets) targetMorphs[name] = 0;
    }

    // Setup skeletal animation mixer
    if (gltf.animations && gltf.animations.length > 0) {
      mixer = new T.AnimationMixer(mascotRoot);
      gltf.animations.forEach(function(clip) {
        var action = mixer.clipAction(clip);
        animActions[clip.name] = action;
        // Set loop modes — looping clips
        var looping = { 'Idle': 1, 'Listening': 1, 'Talking': 1, 'Thinking': 1 };
        if (looping[clip.name]) {
          action.setLoop(T.LoopRepeat);
        } else {
          action.setLoop(T.LoopOnce);
          action.clampWhenFinished = true;
        }
      });
      // Auto-play Enter intro then crossfade to Idle
      if (animActions['Enter']) {
        animActions['Enter'].play();
        currentAction = animActions['Enter'];
      } else if (animActions['Idle']) {
        animActions['Idle'].play();
        currentAction = animActions['Idle'];
      }
      // Listen for animation finished to return to Idle
      mixer.addEventListener('finished', function(e) {
        if (animActions['Idle'] && e.action !== animActions['Idle']) {
          playAnimation('Idle', 0.4);
        }
        // Dequeue next reaction if waiting
        if (reactionQueue.length && !activeReaction) {
          var t = clock ? clock.getElapsedTime() : 0;
          startNextReaction(t);
        }
      });
    }

    modelLoaded = true;
    A.Haptic.success();

    // Create GSAP choreography timelines
    createEntranceTimeline();
    createReactionTimelines();
    if (A.isMobile) initMobileExclusiveFeatures();

    if (window.VDna && !clickXpAwarded) {
      window.VDna.addXp(5);
      clickXpAwarded = true;
    }
  }

  // ── Render Loop ──
  function animate() {
    if (!alive) return;
    requestAnimationFrame(animate);
    if (paused || window._suspended) return;

    var dt = Math.min(clock.getDelta(), 0.1); // cap dt to prevent jumps
    var t = clock.getElapsedTime();
    var sp = moodAnimSpeed;

    animUniforms.uTime.value = t;
    animUniforms.uMoodSpeed.value = sp;

    // Update skeletal animation mixer
    if (mixer) mixer.update(dt);

    // Smooth-lerp morph target influences
    if (mascotMesh && mascotMesh.morphTargetInfluences) {
      for (var mName in morphTargets) {
        var idx = morphTargets[mName];
        var target = targetMorphs[mName] || 0;
        var cur = mascotMesh.morphTargetInfluences[idx];
        mascotMesh.morphTargetInfluences[idx] += (target - cur) * dt * 5;
      }
    }

    if (mascotRoot && !A.RM) {
      // Mouse tracking — gentle look toward cursor on X/Y, never Z
      var headTargetX = -mouseNDC.y * 0.06;
      var headTargetY = mouseNDC.x * 0.15;
      headCurrentX += (headTargetX - headCurrentX) * dt * 3;
      headCurrentY += (headTargetY - headCurrentY) * dt * 3;

      // Eye blink
      nextBlinkTime -= dt;
      if (nextBlinkTime <= 0 && blinkPhase < 0) {
        blinkPhase = 0;
        nextBlinkTime = 2.5 + Math.random() * 5;
        if (Math.random() < 0.2) nextBlinkTime = 0.3;
      }
      if (blinkPhase >= 0) {
        blinkPhase += dt * 8;
        if (blinkPhase < 1) {
          animUniforms.uBlinkAmount.value = Math.sin(blinkPhase * Math.PI);
        } else {
          animUniforms.uBlinkAmount.value = 0;
          blinkPhase = -1;
        }
      }

      // Talking
      if (isTalking) {
        talkIntensity += (1 - talkIntensity) * dt * 8;
        var talkVal = (Math.sin(t * 18) * 0.4 + Math.sin(t * 13.7) * 0.3 + Math.sin(t * 27.3) * 0.3);
        animUniforms.uTalkAmount.value = Math.max(0, talkVal) * talkIntensity;
      } else {
        talkIntensity *= (1 - dt * 6);
        animUniforms.uTalkAmount.value *= (1 - dt * 6);
        if (talkIntensity < 0.01) talkIntensity = 0;
      }

      // Mouse tracking applied to whole model rotation (no vertex deformation)
      mascotRoot.rotation.x = headCurrentX;
      mascotRoot.rotation.y = headCurrentY;
      mascotRoot.rotation.z = 0;

      // Procedural animation (springs, fidgets, squash/stretch)
      updateProceduralAnimation(t, dt);

      // Spatial audio modulation driven by physics springs
      if (typeof MascotAmbience !== 'undefined' && MascotAmbience) updateMascotAudio(t, dt);
      if (typeof EnvironmentalAudio !== 'undefined' && EnvironmentalAudio) EnvironmentalAudio.update();

      // Emotional micro-expressions and personality quirks
      updateMicroExpressions(t, dt);
      updatePersonalityQuirks(t, dt);

      // Force upright: clamp X, zero Z — always after all systems
      mascotRoot.rotation.x = Math.max(-0.06, Math.min(0.06, mascotRoot.rotation.x));
      mascotRoot.rotation.z = 0;

      // Scan line
      animUniforms.uScanLine.value = (t * 0.15 * sp) % 1.0;

      // Emission pulse decay
      if (animUniforms.uEmissionPulse.value > 0) {
        animUniforms.uEmissionPulse.value *= (1 - dt * 3);
        if (animUniforms.uEmissionPulse.value < 0.01) animUniforms.uEmissionPulse.value = 0;
      }
    }

    // Reaction animations
    if (activeReaction && mascotRoot && !A.RM) {
      var elapsed = t - reactionStart;
      if (!runReaction(activeReaction, mascotRoot, elapsed, t)) {
        resetReactionPose();
        activeReaction = null;
        if (reactionQueue.length) startNextReaction(t);
      }
    } else if (!activeReaction && reactionQueue.length) {
      startNextReaction(t);
    }

    // Mood color lerp
    if (moodTransitionT < 1) {
      moodTransitionT = Math.min(1, moodTransitionT + dt * 1.25);
      currentMoodColor.lerp(targetMoodColor, dt * 3);
      accentLight.color.copy(currentMoodColor);
      if (animUniforms.uFresnelColor.value) {
        animUniforms.uFresnelColor.value.copy(currentMoodColor);
      }
      moodAnimSpeed += (targetAnimSpeed - moodAnimSpeed) * dt * 3;
    }

    particleSpeedMul += (targetParticleSpeed - particleSpeedMul) * dt * 4;
    updateUltraParticles(t, dt);
    updateMoodIdleBehavior(t, dt);
    updateWeatherParticles(t, dt);
    updateMiniGame(t, dt);

    renderer.render(scene, camera);
  }

  // ══════════════════════════════════════════════════════
  // SECTION 3: ANIMATION SYSTEM
  // ══════════════════════════════════════════════════════

  function easeInOut(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function playAnimation(name, fadeDuration) {
    if (!mixer || !animActions[name]) return;
    fadeDuration = fadeDuration || 0.3;
    var next = animActions[name];
    if (next === currentAction && next.isRunning()) return;
    next.reset();
    if (currentAction) {
      currentAction.crossFadeTo(next, fadeDuration, true);
    }
    next.play();
    currentAction = next;
  }

  function setMoodExpression(mood) {
    // Reset all morph targets to 0
    for (var name in targetMorphs) targetMorphs[name] = 0;
    // Apply mood-specific expressions
    var expr = MOOD_EXPRESSIONS[mood];
    if (expr) {
      for (var sk in expr) {
        if (sk in targetMorphs) targetMorphs[sk] = expr[sk];
      }
    }
  }

  function runReaction(name, obj, elapsed, t) {
    switch (name) {
      case 'thinking':
        if (elapsed < 0.1) { playAnimation('Thinking', 0.3); animUniforms.uEmissionPulse.value = 0.3; }
        return elapsed < 4.2; // 100 frames @24fps

      case 'listening':
        if (elapsed < 0.1) playAnimation('Listening', 0.3);
        return elapsed < 3.75; // 90 frames @24fps

      case 'talking':
        if (elapsed < 0.1) playAnimation('Talking', 0.2);
        return elapsed < 2.5; // 60 frames @24fps

      case 'nod':
        if (elapsed < 0.1) playAnimation('Happy', 0.2);
        return elapsed < 2.0; // 48 frames @24fps

      case 'excited':
        if (elapsed < 0.1) { playAnimation('Happy', 0.2); animUniforms.uEmissionPulse.value = 0.5; }
        return elapsed < 2.0;

      case 'headShake':
        if (elapsed < 0.1) playAnimation('Confused', 0.2);
        return elapsed < 1.5; // 36 frames @24fps

      case 'wave':
        if (elapsed < 0.1) playAnimation('Wave', 0.2);
        return elapsed < 2.5; // 60 frames @24fps

      case 'spin':
        if (elapsed > 0.7) return false;
        obj.rotation.y = reactionBaseRot.y + easeInOut(elapsed / 0.7) * Math.PI * 2;
        animUniforms.uEmissionPulse.value = 0.3;
        return true;

      case 'wiggle':
        if (elapsed > 0.5) return false;
        // Wiggle on Y axis (side-to-side turn) to stay upright
        obj.rotation.y = reactionBaseRot.y + Math.sin(elapsed * 16 * Math.PI) * 0.04 * (1 - elapsed * 2);
        return true;

      default: return false;
    }
  }

  function queueReaction(name) {
    if (A.RM) return;
    reactionQueue.push(name);
    if (name !== 'wiggle') triggerSquashStretch('react');
    triggerReactionTimeline(name);
    playReactionSound(name);
    if (!activeReaction && clock) startNextReaction(clock.getElapsedTime());
  }

  function startNextReaction(t) {
    activeReaction = reactionQueue.shift();
    reactionStart = t;
    if (mascotRoot) {
      reactionBaseRot.x = mascotRoot.rotation.x;
      reactionBaseRot.y = mascotRoot.rotation.y;
      reactionBaseRot.z = mascotRoot.rotation.z;
    }
  }

  function resetReactionPose() {
    if (!mascotRoot) return;
    // Only zero Z — X is driven by mouse tracking
    mascotRoot.rotation.z = 0;
  }

  // ══════════════════════════════════════════════════════
  // SECTION 3B: ULTRA PARTICLE SYSTEM (GSAP + Three.js)
  // ══════════════════════════════════════════════════════
  var particleFeetY = 0;

  function initUltraParticles() {
    var T = window.THREE;
    if (!T) return;

    UP.totalCount = UP.CLOUD_COUNT + UP.SPARKLE_COUNT + UP.AURA_COUNT + UP.RING_COUNT;
    UP.layers = {
      cloud:   { start: 0, count: UP.CLOUD_COUNT },
      sparkle: { start: UP.CLOUD_COUNT, count: UP.SPARKLE_COUNT },
      aura:    { start: UP.CLOUD_COUNT + UP.SPARKLE_COUNT, count: UP.AURA_COUNT },
      ring:    { start: UP.CLOUD_COUNT + UP.SPARKLE_COUNT + UP.AURA_COUNT, count: UP.RING_COUNT }
    };

    var n = UP.totalCount;
    var positions = new Float32Array(n * 3);
    var sizes = new Float32Array(n);
    var opacities = new Float32Array(n);
    var colors = new Float32Array(n * 3);

    UP.cloudColorA = new T.Color(0x00e1ff);
    UP.cloudColorB = new T.Color(0x006688);
    UP.targetCloudColorA = new T.Color(0x00e1ff);
    UP.targetCloudColorB = new T.Color(0x006688);

    // Initialize phase data per layer
    var i;
    // Layer 1: Cloud
    for (i = 0; i < UP.CLOUD_COUNT; i++) {
      var isWisp = Math.random() < 0.1;
      UP.phases.push({
        layer: 'cloud',
        radius: 0.15 + Math.random() * 0.45,
        speed: 0.5 + Math.random() * 1.0,
        phase: Math.random() * Math.PI * 2,
        yBase: Math.random() * 0.15,
        yDrift: 0.02 + Math.random() * 0.05,
        zSpread: (Math.random() - 0.5) * 0.4,
        flickerSpeed: 2.0 + Math.random() * 3,
        flickerPhase: Math.random() * Math.PI * 2,
        spiralTightness: 0.3 + Math.random() * 0.4,
        colorLerp: Math.random(),
        isWisp: isWisp,
        wispY: 0,
        riseSpeed: isWisp ? (0.05 + Math.random() * 0.1) : 0,
        baseSize: 1.5 + Math.random() * 1.5
      });
      sizes[i] = 1.5 + Math.random() * 1.5;
      opacities[i] = 0.65;
      colors[i * 3] = 0; colors[i * 3 + 1] = 0.88; colors[i * 3 + 2] = 1;
    }
    // Layer 2: Sparkle (desktop only)
    for (i = 0; i < UP.SPARKLE_COUNT; i++) {
      var idx = UP.layers.sparkle.start + i;
      UP.phases.push({
        layer: 'sparkle',
        alive: false, life: 0, maxLife: 1.0,
        vx: 0, vy: 0, vz: 0,
        originX: 0, originY: 0, originZ: 0,
        brightness: 0.8 + Math.random() * 0.2,
        baseSize: 0.8 + Math.random() * 1.0
      });
      UP.sparkleQueue.push(idx);
      sizes[idx] = 0;
      opacities[idx] = 0;
      colors[idx * 3] = 1; colors[idx * 3 + 1] = 1; colors[idx * 3 + 2] = 1;
    }
    // Layer 3: Aura (desktop only)
    for (i = 0; i < UP.AURA_COUNT; i++) {
      var idx2 = UP.layers.aura.start + i;
      UP.phases.push({
        layer: 'aura',
        orbitRadius: 0.25 + Math.random() * 0.2,
        orbitSpeed: 0.3 + Math.random() * 0.5,
        orbitPhase: Math.random() * Math.PI * 2,
        yOffset: -0.1 + Math.random() * 0.6,
        pulseSpeed: 1.5 + Math.random() * 2,
        pulsePhase: Math.random() * Math.PI * 2,
        baseOpacity: 0.2 + Math.random() * 0.15,
        baseSize: 1.0 + Math.random() * 1.0
      });
      sizes[idx2] = 1.2;
      opacities[idx2] = 0.2;
      colors[idx2 * 3] = 0; colors[idx2 * 3 + 1] = 0.88; colors[idx2 * 3 + 2] = 1;
    }
    // Layer 4: Ring (desktop only)
    for (i = 0; i < UP.RING_COUNT; i++) {
      var idx3 = UP.layers.ring.start + i;
      UP.phases.push({
        layer: 'ring',
        angle: (i / UP.RING_COUNT) * Math.PI * 2,
        radiusOffset: (Math.random() - 0.5) * 0.06,
        heightJitter: 0.005 + Math.random() * 0.01,
        twinkleSpeed: 2 + Math.random() * 3,
        twinklePhase: Math.random() * Math.PI * 2,
        baseSize: 0.8 + Math.random() * 0.8
      });
      sizes[idx3] = 1.0;
      opacities[idx3] = 0.3;
      colors[idx3 * 3] = 0; colors[idx3 * 3 + 1] = 0.88; colors[idx3 * 3 + 2] = 1;
    }

    UP.geo = new T.BufferGeometry();
    UP.geo.setAttribute('position', new T.BufferAttribute(positions, 3));
    UP.geo.setAttribute('aSize', new T.BufferAttribute(sizes, 1));
    UP.geo.setAttribute('aOpacity', new T.BufferAttribute(opacities, 1));
    UP.geo.setAttribute('aColor', new T.BufferAttribute(colors, 3));

    UP.mat = new T.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
      },
      vertexShader: [
        'attribute float aSize;',
        'attribute float aOpacity;',
        'attribute vec3 aColor;',
        'varying float vOpacity;',
        'varying vec3 vColor;',
        'uniform float uPixelRatio;',
        'void main() {',
        '  vOpacity = aOpacity;',
        '  vColor = aColor;',
        '  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);',
        '  gl_PointSize = aSize * uPixelRatio * (30.0 / -mvPos.z);',
        '  gl_Position = projectionMatrix * mvPos;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying float vOpacity;',
        'varying vec3 vColor;',
        'void main() {',
        '  float d = distance(gl_PointCoord, vec2(0.5));',
        '  if (d > 0.5) discard;',
        '  float alpha = smoothstep(0.5, 0.08, d) * vOpacity;',
        '  gl_FragColor = vec4(vColor, alpha);',
        '}'
      ].join('\n'),
      transparent: true,
      blending: T.AdditiveBlending,
      depthWrite: false
    });

    UP.points = new T.Points(UP.geo, UP.mat);
    UP.points.renderOrder = 10;
    scene.add(UP.points);
    disposables.push(UP.geo, UP.mat);
    disposables.push({ dispose: function() { if (UP.points) scene.remove(UP.points); } });
  }

  // ── Cloud Layer Update ──
  function updateCloudLayer(t, dt, pos, sizes, opacities, colors) {
    var sp = particleSpeedMul;
    var offX = mascotRoot ? mascotRoot.position.x : 0;
    var feetY = particleFeetY + (mascotRoot ? (mascotRoot.position.y - baseY) : 0);
    var entrR = UP._entranceRadiusScale;
    var entrO = UP._entranceOpacity;
    var intensity = UP.cloudIntensity;

    var cA = UP.cloudColorA, cB = UP.cloudColorB;

    for (var i = 0; i < UP.CLOUD_COUNT; i++) {
      var p = UP.phases[i];
      var angle = p.phase + t * p.speed * sp;
      var r = p.radius * (0.7 + 0.3 * Math.sin(t * 0.5 * p.spiralTightness + p.phase)) * entrR;

      pos[i * 3]     = Math.cos(angle) * r + offX;
      pos[i * 3 + 2] = Math.sin(angle * 0.7) * r * 0.4 + p.zSpread;

      if (p.isWisp) {
        p.wispY += p.riseSpeed * dt;
        var wispFade = Math.max(0, 1 - p.wispY * 3);
        if (wispFade <= 0) p.wispY = 0;
        pos[i * 3 + 1] = feetY + p.yBase + p.wispY;
        opacities[i] = wispFade * 0.5 * intensity * entrO;
      } else {
        pos[i * 3 + 1] = feetY + p.yBase + Math.sin(t * p.flickerSpeed + p.flickerPhase) * p.yDrift;
        opacities[i] = 0.65 * intensity * entrO;
      }

      sizes[i] = p.baseSize * (0.8 + 0.2 * Math.sin(t * p.flickerSpeed * 0.5 + p.flickerPhase));

      // Color gradient: inner bright, outer dim
      var cl = p.colorLerp;
      colors[i * 3]     = cA.r + (cB.r - cA.r) * cl;
      colors[i * 3 + 1] = cA.g + (cB.g - cA.g) * cl;
      colors[i * 3 + 2] = cA.b + (cB.b - cA.b) * cl;
    }
  }

  // ── Sparkle Layer Update ──
  function updateSparkleLayer(t, dt, pos, sizes, opacities, colors) {
    var s = UP.layers.sparkle;
    for (var i = 0; i < s.count; i++) {
      var idx = s.start + i;
      var p = UP.phases[idx];
      if (!p.alive) { opacities[idx] = 0; sizes[idx] = 0; continue; }

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.alive = false;
        UP.sparkleQueue.push(idx);
        opacities[idx] = 0; sizes[idx] = 0;
        continue;
      }

      var lifeRatio = p.life / p.maxLife;
      p.vy -= 0.3 * dt;
      pos[idx * 3]     += p.vx * dt;
      pos[idx * 3 + 1] += p.vy * dt;
      pos[idx * 3 + 2] += p.vz * dt;

      opacities[idx] = (1 - lifeRatio * lifeRatio) * p.brightness;
      sizes[idx] = p.baseSize * (1 - lifeRatio * 0.7);

      // Sparkle color = bright white with mood tint
      var mc = UP.cloudColorA;
      colors[idx * 3]     = 0.7 + mc.r * 0.3;
      colors[idx * 3 + 1] = 0.7 + mc.g * 0.3;
      colors[idx * 3 + 2] = 0.7 + mc.b * 0.3;
    }
  }

  // ── Aura Layer Update ──
  function updateAuraLayer(t, dt, pos, sizes, opacities, colors) {
    var a = UP.layers.aura;
    var midY = mascotRoot ? mascotRoot.position.y + 0.3 : 0.3;
    var offX = mascotRoot ? mascotRoot.position.x : 0;
    var breathMod = 1 + UP.auraBreathSync * 2;
    var mc = UP.cloudColorA;

    for (var i = 0; i < a.count; i++) {
      var idx = a.start + i;
      var p = UP.phases[idx];
      var effR = p.orbitRadius * breathMod;
      var ang = p.orbitPhase + t * p.orbitSpeed;

      pos[idx * 3]     = Math.cos(ang) * effR + offX;
      pos[idx * 3 + 1] = midY + p.yOffset + Math.sin(t * 0.7 + p.orbitPhase) * 0.04;
      pos[idx * 3 + 2] = Math.sin(ang) * effR * 0.6;

      opacities[idx] = p.baseOpacity * (0.6 + 0.4 * Math.sin(t * p.pulseSpeed + p.pulsePhase));
      sizes[idx] = p.baseSize * (0.9 + 0.1 * Math.sin(t * p.pulseSpeed * 0.5));

      colors[idx * 3]     = mc.r * 0.6;
      colors[idx * 3 + 1] = mc.g * 0.6;
      colors[idx * 3 + 2] = mc.b * 0.6;
    }
  }

  // ── Ring Layer Update ──
  function updateRingLayer(t, dt, pos, sizes, opacities, colors) {
    var rl = UP.layers.ring;
    var feetY = particleFeetY + (mascotRoot ? (mascotRoot.position.y - baseY) : 0);
    var offX = mascotRoot ? mascotRoot.position.x : 0;
    UP.ringRotation += dt * 0.8;
    UP.ringRadius += (UP.targetRingRadius - UP.ringRadius) * dt * 3;
    var mc = UP.cloudColorA;

    for (var i = 0; i < rl.count; i++) {
      var idx = rl.start + i;
      var p = UP.phases[idx];
      var ang = p.angle + UP.ringRotation;
      var r = UP.ringRadius + p.radiusOffset;

      pos[idx * 3]     = Math.cos(ang) * r + offX;
      pos[idx * 3 + 1] = feetY + p.heightJitter * Math.sin(t * 3 + p.twinklePhase);
      pos[idx * 3 + 2] = Math.sin(ang) * r;

      opacities[idx] = 0.3 + 0.4 * Math.sin(t * p.twinkleSpeed + p.twinklePhase);
      sizes[idx] = p.baseSize;

      colors[idx * 3]     = mc.r * 0.8;
      colors[idx * 3 + 1] = mc.g * 0.8;
      colors[idx * 3 + 2] = mc.b * 0.8;
    }
  }

  // ── Master Update ──
  function updateUltraParticles(t, dt) {
    if (!UP.geo || !UP.points || A.RM) return;
    var attrs = UP.geo.attributes;
    if (!attrs || !attrs.position) return;

    UP.cloudIntensity += (UP.targetCloudIntensity - UP.cloudIntensity) * dt * 3;

    // Smooth color transitions
    UP.cloudColorA.lerp(UP.targetCloudColorA, dt * 2);
    UP.cloudColorB.lerp(UP.targetCloudColorB, dt * 2);

    var pos = attrs.position.array;
    var sizes = attrs.aSize.array;
    var opacities = attrs.aOpacity.array;
    var colors = attrs.aColor.array;

    updateCloudLayer(t, dt, pos, sizes, opacities, colors);
    updateSparkleLayer(t, dt, pos, sizes, opacities, colors);
    updateAuraLayer(t, dt, pos, sizes, opacities, colors);
    updateRingLayer(t, dt, pos, sizes, opacities, colors);

    attrs.position.needsUpdate = true;
    attrs.aSize.needsUpdate = true;
    attrs.aOpacity.needsUpdate = true;
    attrs.aColor.needsUpdate = true;
  }

  // ── Sparkle Emission ──
  function emitSparkles(count) {
    return; // disabled — no particle bursts
    var pos = UP.geo ? UP.geo.attributes.position.array : null;
    if (!pos) return;
    for (var i = 0; i < count && UP.sparkleQueue.length > 0; i++) {
      var idx = UP.sparkleQueue.pop();
      var p = UP.phases[idx];
      p.alive = true;
      p.life = 0;
      p.maxLife = 0.8 + Math.random() * 1.2;
      var ox = mascotRoot.position.x + (Math.random() - 0.5) * 0.3;
      var oy = mascotRoot.position.y + 0.3 + (Math.random() - 0.5) * 0.3;
      var oz = (Math.random() - 0.5) * 0.3;
      pos[idx * 3] = ox; pos[idx * 3 + 1] = oy; pos[idx * 3 + 2] = oz;
      p.vx = (Math.random() - 0.5) * 0.4;
      p.vy = 0.3 + Math.random() * 0.5;
      p.vz = (Math.random() - 0.5) * 0.4;
    }
  }

  // ── GSAP Entrance Timeline ──
  function createEntranceTimeline() {
    if (A.RM || !window.gsap || !mascotRoot) {
      UP.entranceComplete = true;
      UP._entranceOpacity = 1.0;
      UP._entranceRadiusScale = 1.0;
      return;
    }

    UP._entranceRadiusScale = 3.0;
    UP._entranceOpacity = 0;
    mascotRoot.scale.set(0.01, 0.01, 0.01);

    var tl = window.gsap.timeline({
      onComplete: function() { UP.entranceComplete = true; }
    });

    // Model scale-up
    tl.to(mascotRoot.scale, {
      x: baseScale, y: baseScale, z: baseScale,
      duration: 0.6, ease: 'elastic.out(1,0.5)'
    }, 0);

    // Cloud spiral-in
    tl.to(UP, { _entranceRadiusScale: 1.0, duration: 0.8, ease: 'power3.out' }, 0.2);
    tl.to(UP, { _entranceOpacity: 1.0, duration: 0.6, ease: 'power2.out' }, 0.2);

    // Light fade-in
    if (accentLight) {
      var origInt = accentLight.intensity;
      accentLight.intensity = 0;
      tl.to(accentLight, { intensity: origInt, duration: 0.5 }, 0.3);
    }

    // Sound
    tl.call(function() { playSound('open'); }, null, 0.4);

    // Emission pulse
    tl.to(animUniforms.uEmissionPulse, { value: 0.6, duration: 0.3 }, 0.5);
    tl.to(animUniforms.uEmissionPulse, { value: 0, duration: 0.8 }, 0.8);

    // Ring expand
    UP.ringRadius = 0;
    tl.to(UP, { ringRadius: 0.5, duration: 0.5, ease: 'back.out(1.7)' }, 0.6);

    gsapTimelines.entrance = tl;
  }

  // ── GSAP Reaction Timelines ──
  function createReactionTimelines() {
    if (A.RM || !window.gsap) return;

    var g = window.gsap;

    gsapTimelines.reactions.excited = g.timeline({ paused: true })
      .call(function() { emitSparkles(12); })
      .to(UP, { targetCloudIntensity: 1.8, duration: 0.3 }, 0)
      .to(UP, { targetCloudIntensity: 1.0, duration: 0.8 }, 0.5)
      .to(UP, { targetRingRadius: 0.8, duration: 0.3, ease: 'back.out(1.4)' }, 0)
      .to(UP, { targetRingRadius: 0.5, duration: 0.6 }, 0.5)
      .to(accentLight || {}, { intensity: 0.8, duration: 0.2 }, 0)
      .to(accentLight || {}, { intensity: 0.4, duration: 0.5 }, 0.3);

    gsapTimelines.reactions.spin = g.timeline({ paused: true })
      .call(function() { emitSparkles(15); })
      .to(UP, { targetCloudIntensity: 2.0, duration: 0.2 }, 0)
      .to(UP, { targetCloudIntensity: 1.0, duration: 0.5 }, 0.3)
      .to(UP, { targetRingRadius: 1.0, duration: 0.3, ease: 'power2.out' }, 0)
      .to(UP, { targetRingRadius: 0.5, duration: 0.4 }, 0.4);

    gsapTimelines.reactions.thinking = g.timeline({ paused: true })
      .call(function() { emitSparkles(3); })
      .to(UP, { targetCloudIntensity: 0.5, duration: 0.6 }, 0)
      .to(UP, { targetRingRadius: 0.3, duration: 0.5 }, 0);

    gsapTimelines.reactions.wave = g.timeline({ paused: true })
      .call(function() { emitSparkles(6); })
      .to(UP, { targetCloudIntensity: 1.3, duration: 0.3 }, 0)
      .to(UP, { targetCloudIntensity: 1.0, duration: 0.5 }, 0.5);

    gsapTimelines.reactions.nod = g.timeline({ paused: true })
      .call(function() { emitSparkles(4); })
      .to(accentLight || {}, { intensity: 0.6, duration: 0.2 }, 0)
      .to(accentLight || {}, { intensity: 0.4, duration: 0.4 }, 0.3);

    gsapTimelines.reactions.talking = g.timeline({ paused: true })
      .to(UP, { targetCloudIntensity: 1.5, duration: 0.4 }, 0);

    gsapTimelines.reactions.headShake = g.timeline({ paused: true })
      .to(UP, { targetCloudIntensity: 0.8, duration: 0.3 }, 0)
      .to(UP, { targetRingRadius: 0.35, duration: 0.4 }, 0);
  }

  function triggerReactionTimeline(name) {
    if (!window.gsap || A.RM) return;
    var tl = gsapTimelines.reactions[name];
    if (tl) tl.restart();
  }

  // ── GSAP Mood Transition ──
  function triggerMoodTransition(mood) {
    if (!window.gsap || A.RM || !MOOD_COLORS[mood]) return;
    var T = window.THREE;

    // Cloud particles always stay cyan/blue — never green
    // Mood only affects intensity/radius/sparkles, not cloud color
    UP.targetCloudColorA.setHex(0x00e1ff);
    UP.targetCloudColorB.setHex(0x006688);

    var arousal = VALENCE_AROUSAL_MAP[mood] ? VALENCE_AROUSAL_MAP[mood][1] : 0.5;
    window.gsap.to(UP, { targetRingRadius: 0.3 + arousal * 0.5, duration: 1.0, ease: 'power2.out' });

    emitSparkles(5);
  }

  // ── State-Aware Idle Behavior ──
  var moodIdleState = { currentMood: 'neutral', lookAroundActive: false };

  function updateMoodIdleBehavior(t, dt) {
    if (A.RM || !sceneReady) return;
    var mood = emotionState.lastSentimentMood || 'neutral';
    if (mood !== moodIdleState.currentMood) {
      moodIdleState.currentMood = mood;
      // Adjust fidget interval and cloud intensity by mood
      switch (mood) {
        case 'playful':
          proceduralAnim.fidget.interval = 5 + Math.random() * 5;
          UP.targetCloudIntensity = 1.2;
          break;
        case 'calm': case 'serene':
          proceduralAnim.fidget.interval = 15 + Math.random() * 10;
          UP.targetCloudIntensity = 0.6;
          break;
        case 'intense': case 'determined':
          proceduralAnim.fidget.interval = 8 + Math.random() * 6;
          UP.targetCloudIntensity = 1.4;
          break;
        default:
          proceduralAnim.fidget.interval = 8 + Math.random() * 12;
          UP.targetCloudIntensity = 1.0;
      }
    }

    // Playful continuous subtle bounce
    if (mood === 'playful' && !isTalking && !activeReaction && !isOpen) {
      proceduralAnim.springs.bobY.target = Math.sin(t * 3) * 0.004;
    }

    // Curious occasional look-around
    if (mood === 'curious' && !moodIdleState.lookAroundActive && !isTalking && !activeReaction && !isOpen) {
      if (Math.random() < 0.001) {
        moodIdleState.lookAroundActive = true;
        if (window.gsap) {
          var target = (Math.random() - 0.5) * 0.6;
          window.gsap.to(mouseNDC, { x: target, duration: 1.5, ease: 'power2.inOut',
            onComplete: function() {
              window.gsap.to(mouseNDC, { x: 0, duration: 1.0, ease: 'power2.inOut',
                onComplete: function() { moodIdleState.lookAroundActive = false; }
              });
            }
          });
        } else {
          moodIdleState.lookAroundActive = false;
        }
      }
    }
  }

  // ── Weather Particles ──
  var weatherPhases = [];

  function initWeatherParticles() {
    var T = window.THREE;
    weatherGeo = new T.BufferGeometry();
    var pos = new Float32Array(WEATHER_COUNT * 3);
    for (var i = 0; i < WEATHER_COUNT; i++) {
      weatherPhases.push({
        x: (Math.random() - 0.5) * 2,
        y: Math.random() * 2,
        z: (Math.random() - 0.5) * 1,
        speed: 0.2 + Math.random() * 0.5,
        phase: Math.random() * 10
      });
    }
    weatherGeo.setAttribute('position', new T.BufferAttribute(pos, 3));
    weatherMat = new T.PointsMaterial({
      color: 0xfbbf24, size: 0.025, transparent: true, opacity: 0.0,
      blending: T.AdditiveBlending, depthWrite: false
    });
    weatherParticles = new T.Points(weatherGeo, weatherMat);
    weatherParticles.renderOrder = 11;
    scene.add(weatherParticles);
    disposables.push(weatherGeo, weatherMat);
    disposables.push({ dispose: function() { if (weatherParticles) scene.remove(weatherParticles); } });
    refreshWeather();
    var weatherIv = setInterval(refreshWeather, 60000);
    disposables.push({ dispose: function() { clearInterval(weatherIv); } });
  }

  function refreshWeather() {
    try {
      var raw = localStorage.getItem('cairoWeather');
      if (!raw) { weatherType = null; return; }
      var w = JSON.parse(raw);
      var code = w.data.code;
      if (code <= 1) weatherType = 'clear';
      else if (code <= 3) weatherType = 'overcast';
      else if (code >= 51 && code <= 67) weatherType = 'rain';
      else if (code >= 71 && code <= 77) weatherType = 'snow';
      else if (code >= 95) weatherType = 'thunder';
      else weatherType = 'overcast';
    } catch (e) { weatherType = null; }

    if (!weatherMat) return;
    switch (weatherType) {
      case 'clear':   weatherMat.color.set(0xfbbf24); weatherMat.opacity = 0.35; break;
      case 'rain':    weatherMat.color.set(0x60a5fa); weatherMat.opacity = 0.4; break;
      case 'snow':    weatherMat.color.set(0xe2e8f0); weatherMat.opacity = 0.5; break;
      case 'thunder': weatherMat.color.set(0xa855f7); weatherMat.opacity = 0.4; break;
      case 'overcast':weatherMat.color.set(0x94a3b8); weatherMat.opacity = 0.2; break;
      default: weatherMat.opacity = 0.0; break;
    }
  }

  function updateWeatherParticles(t, dt) {
    if (!weatherParticles || !weatherType || A.RM) return;
    var pos = weatherGeo.attributes.position.array;
    // Follow mascot's procedural movement
    var offX = mascotRoot ? mascotRoot.position.x : 0;
    var offY = mascotRoot ? mascotRoot.position.y - baseY : 0;
    for (var i = 0; i < WEATHER_COUNT; i++) {
      var wp = weatherPhases[i];
      switch (weatherType) {
        case 'clear':
          pos[i * 3] = wp.x + Math.sin(t * 0.3 + wp.phase) * 0.2 + offX;
          pos[i * 3 + 1] = ((t * wp.speed * 0.3 + wp.phase) % 2) - 0.5 + offY;
          pos[i * 3 + 2] = wp.z;
          break;
        case 'rain':
          pos[i * 3] = wp.x + Math.sin(wp.phase) * 0.1 + offX;
          pos[i * 3 + 1] = 1.5 - ((t * wp.speed * 1.5 + wp.phase * 3) % 3) + offY;
          pos[i * 3 + 2] = wp.z;
          break;
        case 'snow':
          pos[i * 3] = wp.x + Math.sin(t * 0.5 + wp.phase) * 0.3 + offX;
          pos[i * 3 + 1] = 1.5 - ((t * wp.speed * 0.2 + wp.phase * 3) % 3) + offY;
          pos[i * 3 + 2] = wp.z + Math.cos(t * 0.3 + wp.phase) * 0.15;
          break;
        case 'thunder':
          pos[i * 3] = wp.x + offX;
          pos[i * 3 + 1] = 1.5 - ((t * wp.speed * 1.8 + wp.phase * 3) % 3) + offY;
          pos[i * 3 + 2] = wp.z;
          break;
        default:
          pos[i * 3] = wp.x + Math.sin(t * 0.2 + wp.phase) * 0.1 + offX;
          pos[i * 3 + 1] = wp.y + Math.sin(t * 0.15 + wp.phase) * 0.2 + offY;
          pos[i * 3 + 2] = wp.z;
      }
    }
    weatherGeo.attributes.position.needsUpdate = true;
    if (weatherType === 'thunder' && accentLight && Math.random() < 0.002) {
      var orig = accentLight.intensity;
      accentLight.intensity = 2.5;
      setTimeout(function() { if (accentLight) accentLight.intensity = orig; }, 100);
    }
  }

  // ── Click on mascot ──
  // Debounce timestamp so a double-click can't toggle the chat open→closed
  // (which looks like "nothing happened").
  var _lastChatClickTs = 0;
  function onMascotClick(e) {
    // Skip if this was a drag release (don't open chat right after dragging the mascot)
    if (interaction.drag.hasMoved) { interaction.drag.hasMoved = false; return; }

    // Open the chat — independent of whether the 3D model finished loading.
    // (The 16MB GLB can still be downloading, may fail, or be skipped in
    //  reduced-motion mode; the chat must work regardless.)
    // Collapse rapid double-clicks into one so the 2nd click doesn't re-toggle it closed.
    var now = Date.now();
    if (now - _lastChatClickTs > 400) {
      if (window._toggleMascotChat) {
        window._toggleMascotChat();                      // bespoke React chat panel
      } else {
        if (isOpen) closePanel(); else openPanel();      // built-in fallback panel
      }
    }
    _lastChatClickTs = now;

    // Track interaction sequences (multi-click Easter eggs)
    handleMascotInteraction();

    // 3D-only flourishes — only when the scene/model are actually ready
    if (mascotRoot && raycaster && renderer) {
      var reactions = ['spin', 'wiggle', 'excited'];
      queueReaction(reactions[Math.floor(Math.random() * reactions.length)]);
      triggerSquashStretch('bounce');
      if (blinkPhase < 0) { blinkPhase = 0; nextBlinkTime = 1 + Math.random() * 3; }
    }
    A.Haptic.pulse();
    playSound('click');
    if (window.VDna && !clickXpAwarded) {
      window.VDna.addXp(1);
      clickXpAwarded = true;
    }
  }

  // ══════════════════════════════════════════════════════
  // SECTION 4: SITE INTEGRATION
  // ══════════════════════════════════════════════════════

  function onMoodChange(e) {
    if (!sceneReady) return;
    var mood = e.detail && e.detail.mood;
    if (!mood || !MOOD_COLORS[mood]) return;
    // Skip aura override if custom aura is set
    if (!interaction.appearance.auraColor) {
      targetMoodColor = new window.THREE.Color(MOOD_COLORS[mood]);
    }
    targetAnimSpeed = MOOD_SPEEDS[mood] || 1.0;
    moodTransitionT = 0;
    setMoodExpression(mood);
    triggerMoodTransition(mood);
    // Track in mood history
    emotionState.moodHistory.push({ mood: mood, timestamp: Date.now(), source: 'external' });
    if (emotionState.moodHistory.length > 50) emotionState.moodHistory.shift();
    try { sessionStorage.setItem('mascotMoodHistory', JSON.stringify(emotionState.moodHistory)); } catch (ex) {}

    // Transition ambient drone to match new mood
    MascotAmbience.transition(mood);

    if (floatEl) {
      floatEl.classList.remove('mascot-mood-flash');
      void floatEl.offsetWidth;
      floatEl.classList.add('mascot-mood-flash');
    }

    animUniforms.uEmissionPulse.value = 0.8;
    playSound('mood');
  }
  document.addEventListener('moodchange', onMoodChange);

  function onXPChanged() {
    if (!sceneReady) return;
    queueReaction('excited');
    animUniforms.uEmissionPulse.value = 1.0;
    UP.targetCloudIntensity = 2.0;
    setTimeout(function() { UP.targetCloudIntensity = 1.0; }, 400);
    emitSparkles(6);
  }
  window.addEventListener('AmrOS:XPChanged', onXPChanged);

  // ── Spatial audio: compute stereo pan from mascot's screen position ──
  function getMascotPan() {
    // During drag, use precise element position
    if (interaction.drag.active && window._spatialAudio && window._spatialAudio.panFromElement) {
      return window._spatialAudio.panFromElement(floatEl);
    }
    // Otherwise use corner-based positioning
    var corner = interaction.drag.currentCorner;
    if (corner === 'topLeft' || corner === 'bottomLeft') return -0.8;
    return 0.8;
  }

  function playSound(type) {
    if (!window._spatialAudio || !window._spatialAudio.isEnabled()) return;
    var s = window._sono;
    if (!s) return;
    var pan = getMascotPan();
    try {
      switch (type) {
        case 'click':
          if (s.chime) { s.chime(880, 0.4, 0.03, pan); }
          else if (s.note) { s.note(880, 'sine', 0.04, 0.03, pan); }
          break;
        case 'open':
          if (s.chime) {
            s.chime(523, 0.5, 0.025, pan);
            setTimeout(function() { s.chime(659, 0.5, 0.025, getMascotPan()); }, 80);
            setTimeout(function() { s.chime(784, 0.6, 0.03, getMascotPan()); }, 160);
          } else if (s.sweep) { s.sweep(400, 800, 0.15, 'sine', 0.03); }
          break;
        case 'close':
          if (s.chime) {
            s.chime(784, 0.4, 0.025, pan);
            setTimeout(function() { s.chime(659, 0.4, 0.02, getMascotPan()); }, 70);
            setTimeout(function() { s.chime(523, 0.5, 0.02, getMascotPan()); }, 140);
          } else if (s.sweep) { s.sweep(800, 400, 0.1, 'sine', 0.03); }
          break;
        case 'send':
          if (s.chime) {
            s.chime(659, 0.3, 0.025, pan);
            setTimeout(function() { s.chime(784, 0.35, 0.03, getMascotPan()); }, 60);
          } else if (s.note) { s.note(1200, 'sine', 0.05, 0.03, pan); }
          break;
        case 'answer':
          if (s.chime) {
            s.chime(1047, 0.45, 0.025, pan);
            setTimeout(function() { s.chime(784, 0.55, 0.025, getMascotPan()); }, 80);
          } else if (s.note) { s.note(880, 'triangle', 0.08, 0.03, pan); }
          break;
        case 'mood':
          if (s.chimeSweep) {
            s.chimeSweep(523, 784, 0.3, 0.02, pan);
            setTimeout(function() { if (s.chime) s.chime(988, 0.35, 0.02, getMascotPan()); }, 250);
          } else if (s.sweep) { s.sweep(600, 900, 0.2, 'sine', 0.02); }
          break;
        case 'error':
          if (s.chime) {
            s.chime(330, 0.5, 0.025, pan);
            setTimeout(function() { s.chime(311, 0.5, 0.025, getMascotPan()); }, 100);
          } else if (s.note) { s.note(300, 'sawtooth', 0.1, 0.03, pan); }
          break;
      }
    } catch (e) { /* optional */ }
  }

  // ── MASCOT SPATIAL AUDIO INTEGRATION ──────────────────────────────
  // Mood-driven ambient drone system
  var MascotAmbience = {
    activeDrone: null,
    proximityDrone: null,
    proximityDrone2: null,
    mood: null,
    baseVol: 0, baseFreq: 0, baseFilter: 0,
    lastBreathPhase: false,
    sessionHarmonic: null,
    scrollDepthMod: 1,
    MOOD_DRONES: {
      happy:    { freq: 220, type: 'sine',     vol: 0.006, filter: 500 },
      curious:  { freq: 185, type: 'triangle', vol: 0.005, filter: 550 },
      thinking: { freq: 165, type: 'sine',     vol: 0.005, filter: 400 },
      excited:  { freq: 262, type: 'triangle', vol: 0.006, filter: 700 },
      confused: { freq: 147, type: 'sine',     vol: 0.004, filter: 350 },
      sleepy:   { freq: 110, type: 'sine',     vol: 0.004, filter: 250 },
      proud:    { freq: 196, type: 'triangle', vol: 0.005, filter: 600 },
      shy:      { freq: 147, type: 'sine',     vol: 0.003, filter: 300 },
      sad:      { freq: 131, type: 'sine',     vol: 0.004, filter: 280 },
      playful:  { freq: 247, type: 'triangle', vol: 0.006, filter: 650 },
      neutral:  null
    },
    transition: function(newMood) {
      if (!window._spatialAudio || !window._spatialAudio.isEnabled()) return;
      var s = window._sono;
      if (!s || !s.droneFiltered) return;
      if (this.mood === newMood) return;
      this.mood = newMood;
      // Fade out old drones (including proximity to avoid harmonic mismatch)
      if (this.activeDrone) { try { this.activeDrone.stop(1.5); } catch (e) {} this.activeDrone = null; }
      if (this.sessionHarmonic) { try { this.sessionHarmonic.stop(1.5); } catch (e) {} this.sessionHarmonic = null; }
      if (this.proximityDrone) { try { this.proximityDrone.stop(0.5); } catch (e) {} this.proximityDrone = null; }
      if (this.proximityDrone2) { try { this.proximityDrone2.stop(0.5); } catch (e) {} this.proximityDrone2 = null; }
      var def = this.MOOD_DRONES[newMood];
      if (!def) return;
      var pan = getMascotPan();
      this.baseFreq = def.freq;
      this.baseVol = def.vol;
      this.baseFilter = def.filter;
      var newDrone = s.droneFiltered(def.freq, def.type, def.vol, def.filter, pan);
      if (newDrone) this.activeDrone = newDrone;
    }
  };

  // Physics-driven audio modulation — called every frame
  function updateMascotAudio(t, dt) {
    if (!window._spatialAudio || !window._spatialAudio.isEnabled()) return;
    if (!MascotAmbience.activeDrone) return;
    if (!proceduralAnim || !proceduralAnim.springs) return;
    var springs = proceduralAnim.springs;
    var drone = MascotAmbience.activeDrone;

    // Breath modulates drone volume (inhale = louder, exhale = quieter)
    var breathMod = 1 + springs.breathScale.value * 8;
    var envVol = EnvironmentalAudio ? EnvironmentalAudio.volMod : 1;
    drone.setVol(MascotAmbience.baseVol * breathMod * MascotAmbience.scrollDepthMod * envVol);

    // Body lean modulates filter frequency (leaning = brighter)
    var leanMod = 1 + Math.abs(springs.bodyLean.value) * 60;
    var envFilter = EnvironmentalAudio ? EnvironmentalAudio.filterMod : 1;
    drone.setFilter(MascotAmbience.baseFilter * leanMod * envFilter);

    // Bob Y modulates drone pitch by tiny amount (vibrato)
    var bobMod = 1 + springs.bobY.value * 3;
    drone.setFreq(MascotAmbience.baseFreq * bobMod);

    // Head tilt velocity → stereo pan micro-shift (clamped to [-1, 1])
    var tiltVel = springs.headTilt.velocity;
    var basePan = getMascotPan();
    if (Math.abs(tiltVel) > 0.01) {
      var panShift = Math.max(-0.3, Math.min(0.3, tiltVel * 5));
      drone.setPan(Math.max(-1, Math.min(1, basePan + panShift)));
    }
    // Keep session harmonic panned with mascot
    if (MascotAmbience.sessionHarmonic) {
      MascotAmbience.sessionHarmonic.setPan(basePan);
    }

    // Idle breathing sound — ultra-quiet sine on breath phase transitions
    if (!activeReaction && !isTalking) {
      var breathVal = springs.breathScale.value;
      var breathPhase = breathVal > 0;
      if (breathPhase && !MascotAmbience.lastBreathPhase) {
        var s = window._sono;
        if (s && s.note) s.note(160 + Math.random() * 20, 'sine', 0.8, 0.003, getMascotPan());
      }
      MascotAmbience.lastBreathPhase = breathPhase;
    }

    // Mobile gyroscope modulation
    if (A.isMobile && gyroAudio && gyroAudio.active) {
      var gyroPan = Math.max(-1, Math.min(1, gyroAudio.gamma / 45));
      drone.setPan(gyroPan);
      var pitchShift = Math.max(0.8, Math.min(1.2, 1 + (gyroAudio.beta - 45) * 0.002));
      drone.setFreq(MascotAmbience.baseFreq * pitchShift);
    }
  }

  // Reaction-specific spatial audio signatures
  function playReactionSound(name) {
    if (!window._spatialAudio || !window._spatialAudio.isEnabled()) return;
    var s = window._sono;
    if (!s) return;
    var p = getMascotPan(); // fresh pan for immediate sounds
    try {
      switch (name) {
        case 'spin':
          if (s.chimeSweep) {
            s.chimeSweep(330, 880, 0.5, 0.02, p);
            setTimeout(function() { s.chimeSweep(440, 1100, 0.4, 0.015, -getMascotPan()); }, 200);
            setTimeout(function() { s.chimeSweep(550, 660, 0.3, 0.012, getMascotPan()); }, 400);
          }
          break;
        case 'wiggle':
          if (s.note) {
            for (var i = 0; i < 5; i++) {
              (function(idx) {
                setTimeout(function() {
                  var wp = getMascotPan();
                  s.note(600 + idx * 80, 'triangle', 0.06, 0.015, idx % 2 === 0 ? wp : wp * 0.3);
                }, idx * 50);
              })(i);
            }
          }
          break;
        case 'wave':
          if (s.note) {
            [392, 494, 587, 784].forEach(function(f, i) {
              setTimeout(function() { s.note(f, 'sine', 0.15, 0.02, getMascotPan() * (1 - i * 0.2)); }, i * 100);
            });
          }
          break;
        case 'nod':
          if (s.note) {
            s.note(220, 'sine', 0.12, 0.02, p);
            setTimeout(function() { s.note(260, 'sine', 0.12, 0.018, getMascotPan()); }, 150);
          }
          break;
        case 'excited':
          if (s.chime) {
            s.chime(784, 0.3, 0.025, p);
            setTimeout(function() { s.chime(988, 0.3, 0.02, getMascotPan() * 0.5); }, 100);
            setTimeout(function() { s.chime(1175, 0.4, 0.015, 0); }, 200);
          }
          break;
        case 'headShake':
          if (s.chimeSweep) {
            s.chimeSweep(500, 350, 0.25, 0.018, p);
            setTimeout(function() { s.chimeSweep(450, 320, 0.2, 0.015, getMascotPan()); }, 180);
          }
          break;
        case 'thinking':
          if (s.note) {
            s.note(330, 'sine', 0.4, 0.01, p);
            setTimeout(function() { s.note(349, 'sine', 0.4, 0.01, getMascotPan()); }, 300);
          }
          break;
        case 'listening':
          if (s.note) {
            s.note(220, 'sine', 0.5, 0.012, p);
            s.note(330, 'sine', 0.5, 0.008, p);
          }
          break;
        case 'talking':
          if (s.note) {
            for (var j = 0; j < 3; j++) {
              (function(idx) {
                setTimeout(function() {
                  s.note(400 + Math.random() * 200, 'sine', 0.04, 0.008, getMascotPan());
                }, idx * 40);
              })(j);
            }
          }
          break;
      }
    } catch (e) { /* optional */ }
  }

  // Proximity audio — mouse distance creates harmonic field around mascot
  var proximityAudio = {
    lastSparkleTime: 0,
    intensity: 0
  };

  function updateProximityAudio(prox) {
    if (!window._spatialAudio || !window._spatialAudio.isEnabled()) return;
    var s = window._sono;
    if (!s || !s.droneFiltered) return;
    var pan = getMascotPan();
    var baseFreq = MascotAmbience.baseFreq || 220;

    // Fade in first overtone drone (5th harmonic) when close
    if (prox > 0.3 && !MascotAmbience.proximityDrone) {
      var pd = s.droneFiltered(baseFreq * 3, 'sine', prox * 0.004, 800, pan);
      if (pd) MascotAmbience.proximityDrone = pd;
    } else if (prox > 0.3 && MascotAmbience.proximityDrone) {
      MascotAmbience.proximityDrone.setVol(prox * 0.004);
      MascotAmbience.proximityDrone.setPan(pan);
    } else if (prox < 0.2 && MascotAmbience.proximityDrone) {
      MascotAmbience.proximityDrone.stop(0.8);
      MascotAmbience.proximityDrone = null;
    }

    // Second harmonic layer at very close range
    if (prox > 0.7 && !MascotAmbience.proximityDrone2) {
      var pd2 = s.droneFiltered(baseFreq * 5, 'sine', prox * 0.002, 1200, pan);
      if (pd2) MascotAmbience.proximityDrone2 = pd2;
    } else if (prox > 0.7 && MascotAmbience.proximityDrone2) {
      MascotAmbience.proximityDrone2.setVol(prox * 0.002);
      MascotAmbience.proximityDrone2.setPan(pan);
    } else if (prox < 0.6 && MascotAmbience.proximityDrone2) {
      MascotAmbience.proximityDrone2.stop(0.5);
      MascotAmbience.proximityDrone2 = null;
    }

    // Sparkle chime at very close proximity (cooldown-gated)
    if (prox > 0.9 && s.chime) {
      var now = Date.now();
      if (now - proximityAudio.lastSparkleTime > 2000) {
        s.chime(1568, 0.3, 0.01, pan);
        proximityAudio.lastSparkleTime = now;
      }
    }

    proximityAudio.intensity = prox;
  }

  // Environmental awareness — time-of-day + session adaptation
  var EnvironmentalAudio = {
    lastUpdate: 0,
    updateInterval: 30000,
    sessionStartTime: Date.now(),
    volMod: 1.0,    // multiplier applied by frame loop
    filterMod: 1.0, // multiplier applied by frame loop
    update: function() {
      var now = Date.now();
      if (now - this.lastUpdate < this.updateInterval) return;
      this.lastUpdate = now;
      if (!MascotAmbience.activeDrone) return;
      if (!window._spatialAudio || !window._spatialAudio.isEnabled()) return;

      var hour = new Date().getHours();
      var s = window._sono;

      // Time-of-day ambient adaptation (stored as modifiers, applied by frame loop)
      if (hour >= 22 || hour < 6) {
        // Night: quieter, darker filter
        this.volMod = 0.6;
        this.filterMod = 0.7;
      } else if (hour >= 6 && hour < 10) {
        // Morning: brighter filter
        this.volMod = 1.0;
        this.filterMod = 1.3;
      } else {
        this.volMod = 1.0;
        this.filterMod = 1.0;
      }

      // Session length: after 5 min, add subtle harmonic layer
      var sessionMin = (now - this.sessionStartTime) / 60000;
      if (sessionMin > 5 && !MascotAmbience.sessionHarmonic && s && s.droneFiltered) {
        var sh = s.droneFiltered(
          MascotAmbience.baseFreq * 1.5, 'sine', MascotAmbience.baseVol * 0.3,
          MascotAmbience.baseFilter * 0.6, getMascotPan()
        );
        if (sh) MascotAmbience.sessionHarmonic = sh;
      }

      // Scroll depth: deeper = richer
      var scrollH = document.documentElement.scrollHeight - window.innerHeight;
      var scrollPct = scrollH > 0 ? (window.scrollY || 0) / scrollH : 0;
      MascotAmbience.scrollDepthMod = 1 + scrollPct * 0.3;
    }
  };

  // Scroll sonification — subtle directional sweeps
  var scrollSono = { lastY: window.scrollY || 0, lastSonoTime: Date.now(), cooldown: 200, initialized: false };

  function onScrollSonify() {
    if (!window._spatialAudio || !window._spatialAudio.isEnabled()) return;
    var s = window._sono;
    if (!s || !s.sweep) return;
    var newY = window.scrollY || window.pageYOffset || 0;
    // Skip first event to sync baseline position
    if (!scrollSono.initialized) { scrollSono.initialized = true; scrollSono.lastY = newY; return; }
    var now = Date.now();
    if (now - scrollSono.lastSonoTime < scrollSono.cooldown) { scrollSono.lastY = newY; return; }
    var delta = newY - scrollSono.lastY;
    if (Math.abs(delta) > 50) {
      var speed = Math.min(1, Math.abs(delta) / 500);
      if (delta > 0) {
        s.sweep(200, 400, 0.08, 'sine', speed * 0.008);
      } else {
        s.sweep(400, 200, 0.08, 'sine', speed * 0.008);
      }
      scrollSono.lastSonoTime = now;
      scrollSono.lastY = newY;
    } else {
      scrollSono.lastY = newY;
    }
  }

  // Mobile gyroscope audio state
  var gyroAudio = { gamma: 0, beta: 0, smooth: 0.15, active: false };

  if (A.isMobile) {
    var onGyroAudioHandler = function(e) {
      if (e.gamma != null) gyroAudio.gamma += (e.gamma - gyroAudio.gamma) * gyroAudio.smooth;
      if (e.beta != null) gyroAudio.beta += (e.beta - gyroAudio.beta) * gyroAudio.smooth;
      gyroAudio.active = true;
      // Enhanced gyroscope head tracking — blend device tilt into mouseNDC
      var gx = Math.max(-1, Math.min(1, gyroAudio.gamma / 30));
      var gy = Math.max(-1, Math.min(1, (gyroAudio.beta - 45) / 30));
      mouseNDC.x += (gx - mouseNDC.x) * 0.08;
      mouseNDC.y += (-gy - mouseNDC.y) * 0.08;
    };
    window.addEventListener('deviceorientation', onGyroAudioHandler, { passive: true });
  }

  // ── Mobile-Exclusive Advanced Interactions ──
  function initMobileExclusiveFeatures() {
    if (!floatEl) return;

    // ── 1. Shake Detection ──
    var shakeState = { lastX: 0, lastY: 0, lastZ: 0, lastShake: 0, initialized: false };
    var shakeComments = ['Whoa! Easy there!', 'You\'re shaking things up!', 'That was intense!', 'Hey, careful!'];
    function onDeviceMotion(e) {
      var acc = e.accelerationIncludingGravity;
      if (!acc) return;
      if (!shakeState.initialized) {
        shakeState.lastX = acc.x || 0;
        shakeState.lastY = acc.y || 0;
        shakeState.lastZ = acc.z || 0;
        shakeState.initialized = true;
        return;
      }
      var dx = Math.abs((acc.x || 0) - shakeState.lastX);
      var dy = Math.abs((acc.y || 0) - shakeState.lastY);
      var dz = Math.abs((acc.z || 0) - shakeState.lastZ);
      shakeState.lastX = acc.x || 0;
      shakeState.lastY = acc.y || 0;
      shakeState.lastZ = acc.z || 0;
      var delta = dx + dy + dz;
      var now = Date.now();
      if (delta > 15 && (now - shakeState.lastShake) > 2000) {
        shakeState.lastShake = now;
        queueReaction('excited');
        triggerSquashStretch('jump');
        if (A.Haptic) A.Haptic.pulse();
      }
    }
    if (typeof DeviceMotionEvent !== 'undefined') {
      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        document.body.addEventListener('touchstart', function _rp() {
          DeviceMotionEvent.requestPermission().then(function(r) {
            if (r === 'granted') window.addEventListener('devicemotion', onDeviceMotion, { passive: true });
          }).catch(function() {});
          document.body.removeEventListener('touchstart', _rp);
        }, { once: true });
      } else {
        window.addEventListener('devicemotion', onDeviceMotion, { passive: true });
      }
    }

    // ── 2. Swipe Gestures on Mascot ──
    var swipeState = { startX: 0, startY: 0, startTime: 0 };
    floatEl.addEventListener('touchstart', function(e) {
      if (!e.touches.length) return;
      swipeState.startX = e.touches[0].clientX;
      swipeState.startY = e.touches[0].clientY;
      swipeState.startTime = Date.now();
    }, { passive: true });

    floatEl.addEventListener('touchend', function(e) {
      var elapsed = Date.now() - swipeState.startTime;
      if (elapsed > 400 || !e.changedTouches.length) return;
      var dx = e.changedTouches[0].clientX - swipeState.startX;
      var dy = e.changedTouches[0].clientY - swipeState.startY;
      var absDx = Math.abs(dx);
      var absDy = Math.abs(dy);
      if (Math.max(absDx, absDy) < 40) return; // too short, not a swipe

      if (absDx > absDy) {
        // Horizontal swipe
        if (dx > 0) {
          queueReaction('wiggle');
          showAutoComment('Wheee!');
        } else {
          queueReaction('headShake');
          showAutoComment('Nah...');
        }
      } else {
        // Vertical swipe
        if (dy < 0) {
          queueReaction('excited');
          triggerSquashStretch('jump');
          showAutoComment('Hey there!');
        } else {
          queueReaction('nod');
          triggerSquashStretch('land');
          showAutoComment('Got it!');
        }
      }
      if (A.Haptic) A.Haptic.tap();
      playSound('click');
    }, { passive: true });

    // ── 3. Long Press ──
    var longPressTimer = null;
    floatEl.addEventListener('touchstart', function(e) {
      if (e.touches.length !== 1) { clearTimeout(longPressTimer); return; }
      longPressTimer = setTimeout(function() {
        queueReaction('nod');
        triggerMicroExpression('smirk');
        triggerSquashStretch('bounce');
        if (A.Haptic) A.Haptic.pulse();
      }, 600);
    }, { passive: true });
    floatEl.addEventListener('touchmove', function() { clearTimeout(longPressTimer); }, { passive: true });
    floatEl.addEventListener('touchend', function() { clearTimeout(longPressTimer); }, { passive: true });

    // ── 4. Pinch to Scale Bounce ──
    var pinchState = { startDist: 0, triggered: false };
    function touchDist(touches) {
      var dx = touches[0].clientX - touches[1].clientX;
      var dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    floatEl.addEventListener('touchstart', function(e) {
      if (e.touches.length === 2) {
        pinchState.startDist = touchDist(e.touches);
        pinchState.triggered = false;
      }
    }, { passive: true });
    floatEl.addEventListener('touchmove', function(e) {
      if (e.touches.length !== 2 || pinchState.triggered) return;
      var ratio = touchDist(e.touches) / pinchState.startDist;
      if (ratio > 1.4) {
        pinchState.triggered = true;
        triggerSquashStretch('jump');
        showAutoComment('Growing!');
        if (A.Haptic) A.Haptic.pulse();
      } else if (ratio < 0.6) {
        pinchState.triggered = true;
        triggerSquashStretch('land');
        showAutoComment('Squished!');
        if (A.Haptic) A.Haptic.pulse();
      }
    }, { passive: true });
    floatEl.addEventListener('touchend', function(e) {
      if (e.touches.length < 2) pinchState.triggered = false;
    }, { passive: true });
  }

  window.addEventListener('AmrOS:Suspended', function() { if (clock) clock.stop(); });
  window.addEventListener('AmrOS:Revived', function() { if (clock) clock.start(); });

  // ══════════════════════════════════════════════════════
  // SECTION 5: CHAT UI
  // ══════════════════════════════════════════════════════
  var isOpen = false, modelLoaded = false, modelError = false;
  var panel, floatEl, chatArea, inputEl;
  var isStreaming = false;

  function createDOM() {
    // Floating 3D mascot container (always visible)
    floatEl = document.createElement('div');
    floatEl.className = 'mascot-float';
    floatEl.setAttribute('aria-label', 'Mascot assistant — click to chat');
    floatEl.setAttribute('title', 'Click to chat with ElharonyClaw AI assistant');
    floatEl.innerHTML = '<span class="mascot-float-label">ASK ELHARONYCLAW</span>';
    floatEl.addEventListener('click', onMascotClick);
    document.body.appendChild(floatEl);

    // Chat panel (hidden until click)
    panel = document.createElement('div');
    panel.className = 'mascot-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Mascot Chat');
    panel.innerHTML =
      '<div class="mascot-header">' +
        '<div class="mascot-header-top">' +
          '<span class="mascot-header-title">\u2726 Ask ElharonyClaw</span>' +
          '<div class="mascot-header-actions">' +
            '<button class="mascot-header-btn mascot-newchat-btn" aria-label="New chat" title="New Chat">+</button>' +
            '<button class="mascot-header-btn mascot-close-btn" aria-label="Close chat">\u00d7</button>' +
          '</div>' +
        '</div>' +
        '<div class="mascot-header-sub">AI-powered assistant</div>' +
        '<div class="mascot-header-meta">' +
          '<span><span class="mascot-status-dot online"></span> <span class="mascot-status-text">AI Online</span></span>' +
          '<span class="mascot-model-label">GLM-5.1</span>' +
        '</div>' +
      '</div>' +
      '<div class="mascot-rate-limit" style="display:none"><span class="mascot-rate-text"></span></div>' +
      '<div class="mascot-chat"></div>' +
      '<div class="mascot-input-wrap">' +
        '<input class="mascot-input" type="text" placeholder="Ask me anything..." autocomplete="off" maxlength="500">' +
        '<button class="mascot-voice-btn" aria-label="Voice input" title="Voice Input" style="display:none">\ud83c\udf99</button>' +
        '<button class="mascot-send" aria-label="Send">\u27a4</button>' +
      '</div>';
    document.body.appendChild(panel);

    chatArea = panel.querySelector('.mascot-chat');
    inputEl = panel.querySelector('.mascot-input');

    panel.querySelector('.mascot-close-btn').addEventListener('click', function(e) {
      e.stopPropagation();
      closePanel();
    });
    inputEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitQuestion(); }
    });
    panel.querySelector('.mascot-send').addEventListener('click', function() {
      var sendBtn = panel.querySelector('.mascot-send');
      sendBtn.classList.add('pulse');
      setTimeout(function() { sendBtn.classList.remove('pulse'); }, 300);
      submitQuestion();
    });

    // New Chat button
    panel.querySelector('.mascot-newchat-btn').addEventListener('click', function(e) {
      e.stopPropagation();
      if (isStreaming) return;
      if (API.clearHistory) API.clearHistory();
      chatArea.innerHTML = '';
      showWelcome();
      updateStatusUI();
      A.Haptic.tap();
      playSound('click');
    });

    // Voice input (Web Speech API)
    var voiceBtn = panel.querySelector('.mascot-voice-btn');
    var _recognition = null;
    var _voiceSilenceTimer = null;
    if (window.webkitSpeechRecognition || window.SpeechRecognition) {
      voiceBtn.style.display = '';
      var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      _recognition = new SpeechRecognition();
      _recognition.continuous = false;
      _recognition.interimResults = true;
      _recognition.lang = 'en-US';

      _recognition.onresult = function(event) {
        var interim = '';
        var final = '';
        for (var i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) final += event.results[i][0].transcript;
          else interim += event.results[i][0].transcript;
        }
        inputEl.value = final || interim;
        // Auto-submit after 2s silence on final result
        if (final) {
          clearTimeout(_voiceSilenceTimer);
          _voiceSilenceTimer = setTimeout(function() {
            voiceBtn.classList.remove('recording');
            submitQuestion();
          }, 2000);
        }
      };

      _recognition.onend = function() {
        voiceBtn.classList.remove('recording');
      };

      _recognition.onerror = function() {
        voiceBtn.classList.remove('recording');
      };

      voiceBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (voiceBtn.classList.contains('recording')) {
          _recognition.stop();
          voiceBtn.classList.remove('recording');
          clearTimeout(_voiceSilenceTimer);
        } else {
          voiceBtn.classList.add('recording');
          _recognition.start();
          A.Haptic.tap();
        }
      });
    }

    function _mascotEscHandler(e) {
      if (e.key === 'Escape' && isOpen) closePanel();
    }
    function _mascotOutsideClickHandler(e) {
      if (isOpen && !panel.contains(e.target) && !floatEl.contains(e.target)) closePanel();
    }
    document.addEventListener('keydown', _mascotEscHandler);
    document.addEventListener('click', _mascotOutsideClickHandler);
    disposables.push({ dispose: function() {
      document.removeEventListener('keydown', _mascotEscHandler);
      document.removeEventListener('click', _mascotOutsideClickHandler);
    }});
  }

  var isAnimating = false;

  function openPanel() {
    if (isOpen || isAnimating) return;
    isOpen = true;
    isAnimating = true;
    suppressAutoBehavior(10);
    hideAutoBubble();
    A.Haptic.doubleTap();
    playSound('open');
    panel.classList.add('open');

    if (!A.RM && window.gsap) {
      window.gsap.fromTo(panel, { scale: 0.85, opacity: 0, y: 20 },
        { scale: 1, opacity: 1, y: 0, duration: 0.4, ease: 'back.out(1.7)',
          onComplete: function() { isAnimating = false; } });
      setTimeout(function() { isAnimating = false; }, 1000);
    } else {
      isAnimating = false;
    }

    if (!chatArea.children.length) showWelcome();
    updateStatusUI();
    setTimeout(function() { inputEl.focus(); }, 100);
  }

  function closePanel() {
    if (!isOpen || isAnimating) return;
    isOpen = false;
    isAnimating = true;
    A.Haptic.tap();
    playSound('close');

    if (!A.RM && window.gsap) {
      window.gsap.to(panel, {
        scale: 0.85, opacity: 0, y: 20, duration: 0.25, ease: 'power2.in',
        onComplete: function() { panel.classList.remove('open'); isAnimating = false; }
      });
      setTimeout(function() { isAnimating = false; }, 1000);
    } else {
      panel.classList.remove('open');
      isAnimating = false;
    }
  }

  // ── Status & Rate Limit UI ──
  function updateStatusUI() {
    var dot = panel.querySelector('.mascot-status-dot');
    var statusText = panel.querySelector('.mascot-status-text');
    var modelLabel = panel.querySelector('.mascot-model-label');
    var rateLimitEl = panel.querySelector('.mascot-rate-limit');
    var rateTextEl = panel.querySelector('.mascot-rate-text');

    if (API.serverAvailable) {
      dot.className = 'mascot-status-dot online';
      statusText.textContent = 'AI Online';
      modelLabel.textContent = 'GLM-5.1';
    } else if (API.llmReady) {
      dot.className = 'mascot-status-dot fallback';
      statusText.textContent = 'Local AI';
      modelLabel.textContent = 'Qwen 3.5';
    } else {
      dot.className = 'mascot-status-dot offline';
      statusText.textContent = 'KB Mode';
      modelLabel.textContent = 'Knowledge Base';
    }

    // Rate limits
    var limits = API.rateLimits;
    if (limits && limits.dailyMax > 0) {
      rateLimitEl.style.display = '';
      var pctDaily = limits.daily / limits.dailyMax;
      var pctWeekly = limits.weekly / limits.weeklyMax;
      rateTextEl.textContent = limits.daily + '/' + limits.dailyMax + ' today \u00b7 ' + limits.weekly + '/' + limits.weeklyMax + ' this week';
      rateLimitEl.className = 'mascot-rate-limit';
      if (pctDaily >= 1 || pctWeekly >= 1) {
        rateLimitEl.classList.add('exceeded');
      } else if (pctDaily > 0.8 || pctWeekly > 0.8) {
        rateLimitEl.classList.add('warning');
      }
    }
  }

  // ── Welcome ──
  function showWelcome() {
    var mode;
    if (API.serverAvailable) mode = '\u2726 <strong>Ask ElharonyClaw</strong> \u00b7 AI Assistant';
    else if (API.llmReady) mode = '\u2726 <strong>Ask ElharonyClaw</strong> \u00b7 Local AI';
    else if (API.llmLoading) mode = '\u23f3 AI loading...';
    else mode = '\ud83d\udcda Knowledge Base';
    var html = mode + '<br>Ask me anything about Amr\'s <strong>career, certifications, book, mentoring</strong>, and more.';
    html += buildTopicChips(API.TOPICS.slice(0, 10));
    appendBotMsg(html);
    queueReaction('wave');
  }

  function buildTopicChips(topics) {
    var h = '<div class="mascot-topics">';
    topics.forEach(function(t) {
      h += '<span class="mascot-topic" data-topic="' + escAttr(t) + '">' + esc(t) + '</span>';
    });
    return h + '</div>';
  }

  function buildFollowUpChips(result) {
    var cats = (result.matches || []).map(function(m) { return m.entry.cat; });
    var fups = API.getFollowUps(cats);
    if (!fups.length) return '';
    var h = '<div class="mascot-topics" style="margin-top:6px">';
    fups.forEach(function(t) {
      h += '<span class="mascot-topic" data-topic="' + escAttr(t) + '">' + esc(t) + '</span>';
    });
    return h + '</div>';
  }

  function submitQuestion(topicText) {
    var q = typeof topicText === 'string' ? topicText : (inputEl.value || '').trim();
    if (!q || isStreaming) return;

    // Easter egg check
    if (checkChatEasterEgg(q)) {
      inputEl.value = '';
      appendUserMsg(q);
      return;
    }

    inputEl.value = '';
    appendUserMsg(q);
    isStreaming = true;
    suppressAutoBehavior(15);
    A.Haptic.tap();
    playSound('send');

    // Sentiment-driven mood update from user message
    updateMoodFromSentiment(analyzeSentiment(q));

    queueReaction('thinking');
    targetParticleSpeed = 1.5;
    isTalking = false;
    playAnimation('Thinking', 0.3);

    var _lastWordCount = 0;
    var botEl = appendBotMsg(statusMsg('Thinking'));

    // Brief delay then update to "Connecting..."
    var _connectTimer = setTimeout(function() {
      if (botEl && botEl.parentNode && !isTalking) {
        botEl.innerHTML = statusMsg('Connecting');
      }
    }, 800);

    API.streamChat(q,
      function onChunk(partial, tokenCount) {
        if (!botEl || !botEl.parentNode) return;
        clearTimeout(_connectTimer);
        targetParticleSpeed = 2.5;
        if (!isTalking) {
          playAnimation('Talking', 0.2);
        }
        isTalking = true;
        // Word-by-word fade-in rendering
        var rendered = renderTextWordByWord(partial, _lastWordCount);
        _lastWordCount = countWords(partial);
        botEl.innerHTML = rendered + '<span class="mascot-cursor"></span>';
        scrollChat();
      },
      function onDone(fullText, result, stats) {
        clearTimeout(_connectTimer);
        isStreaming = false;
        isTalking = false;
        _lastWordCount = 0;
        targetParticleSpeed = 1.0;
        updateStatusUI();

        // Sentiment-driven mood from bot response (reduced influence)
        var botSent = analyzeSentiment(fullText);
        botSent.valence = 0.5 + (botSent.valence - 0.5) * 0.3;
        updateMoodFromSentiment(botSent);

        var source = stats && stats.source;
        var badge = '';
        if (source === 'server') {
          badge = '<span class="mascot-badge server">GLM-5.1 \u00b7 ' + (stats.tokPerSec || 0) + ' tok/s</span> ';
        } else if (source === 'local') {
          badge = '<span class="mascot-badge ai">Local AI \u00b7 ' + (stats.tokPerSec || 0) + ' tok/s</span> ';
        } else {
          badge = '<span class="mascot-badge kb">KB</span> ';
        }

        if (source === 'kb') {
          botEl.innerHTML = badge + fullText;
        } else {
          botEl.innerHTML = badge + renderText(fullText);
        }
        botEl.innerHTML += buildFollowUpChips(result);
        wireTopicClicks(botEl);
        scrollChat();
        playSound('answer');
        queueReaction(source === 'kb' ? 'excited' : 'nod');
        if (window.VDna) window.VDna.addXp(2);
      },
      function onError(err) {
        clearTimeout(_connectTimer);
        isStreaming = false;
        isTalking = false;
        _lastWordCount = 0;
        targetParticleSpeed = 1.0;
        updateStatusUI();

        if (err && err.message === 'rate_limited') {
          botEl.innerHTML = '<span class="mascot-badge" style="background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.15)">LIMIT</span> You\'ve reached your message limit. It resets automatically — try again later!';
          queueReaction('headShake');
        } else {
          var result = API.matchQuery(q);
          renderKBResult(botEl, result);
          queueReaction('headShake');
        }
        A.Haptic.warning();
        playSound('error');
      }
    );
  }

  function statusMsg(label) {
    return '<div class="mascot-status-msg">' +
      '<span class="mascot-typing"><span></span><span></span><span></span></span>' +
      '<span>' + label + '...</span>' +
    '</div>';
  }

  function countWords(text) {
    if (!text) return 0;
    return text.split(/\s+/).filter(function(w) { return w.length > 0; }).length;
  }

  function renderTextWordByWord(text, prevWordCount) {
    if (!text) return '';
    var rendered = renderText(text);
    // Wrap each text node word in a span with staggered delay
    // Only animate words that are new (index >= prevWordCount)
    var wordIndex = 0;
    var result = rendered.replace(/(>|^)([^<]+)(<|$)/g, function(match, before, content, after) {
      var words = content.split(/(\s+)/);
      var out = '';
      for (var i = 0; i < words.length; i++) {
        if (words[i].match(/^\s+$/)) {
          out += words[i];
        } else if (words[i].length > 0) {
          if (wordIndex >= prevWordCount) {
            var delay = Math.min((wordIndex - prevWordCount) * 30, 300);
            out += '<span class="mascot-word" style="animation-delay:' + delay + 'ms">' + words[i] + '</span>';
          } else {
            out += '<span class="mascot-word" style="animation-delay:0ms">' + words[i] + '</span>';
          }
          wordIndex++;
        }
      }
      return before + out + after;
    });
    return result;
  }

  function renderKBResult(el, result) {
    var html = '<span class="mascot-badge kb">KB</span> ';
    if (result.confidence === 'high')
      html += '<span class="mascot-confidence high">\u25cf high confidence</span> ';
    else if (result.confidence === 'good')
      html += '<span class="mascot-confidence good">\u25cf good match</span> ';

    if (!result.matches || !result.matches.length) {
      html += 'I don\'t have a specific answer for that yet. Try one of the topics below!';
    } else {
      html += result.matches.map(function(m) { return m.entry.answer; }).join('<br><br>');
    }
    html += buildFollowUpChips(result);
    el.innerHTML = html;
    wireTopicClicks(el);
    scrollChat();
  }

  function appendUserMsg(text) {
    var div = document.createElement('div');
    div.className = 'mascot-msg mascot-msg-user';
    div.textContent = text;
    chatArea.appendChild(div);
    scrollChat();
    return div;
  }

  function appendBotMsg(html) {
    var div = document.createElement('div');
    div.className = 'mascot-msg mascot-msg-bot';
    div.innerHTML = html;
    chatArea.appendChild(div);
    wireTopicClicks(div);
    scrollChat();
    return div;
  }

  function wireTopicClicks(container) {
    container.querySelectorAll('.mascot-topic[data-topic]').forEach(function(chip) {
      chip.addEventListener('click', function() {
        var topic = chip.getAttribute('data-topic');
        if (topic) submitQuestion(topic);
      });
    });
  }

  function scrollChat() {
    requestAnimationFrame(function() { chatArea.scrollTop = chatArea.scrollHeight; });
  }

  function renderText(text) {
    if (!text) return '';
    var escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Code blocks: ```lang\ncode\n``` → <pre><code>
    escaped = escaped.replace(/```(\w*)\n?([\s\S]*?)```/g, function(_, lang, code) {
      return '<pre><code' + (lang ? ' class="language-' + lang + '"' : '') + '>' + code.trim() + '</code></pre>';
    });

    // Inline code: `code` → <code>
    escaped = escaped.replace(/`([^`\n]+?)`/g, '<code>$1</code>');

    // Bold: **text** → <strong>
    escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic: *text* → <em>
    escaped = escaped.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>');

    // Links: [text](url) → <a>
    escaped = escaped.replace(/\[([^\]]+?)\]\(([^)]+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Unordered lists: lines starting with - or *
    escaped = escaped.replace(/(?:^|\n)((?:[-*] .+\n?)+)/g, function(_, block) {
      var items = block.trim().split('\n').map(function(line) {
        return '<li>' + line.replace(/^[-*] /, '') + '</li>';
      }).join('');
      return '<ul>' + items + '</ul>';
    });

    // Ordered lists: lines starting with 1. 2. etc
    escaped = escaped.replace(/(?:^|\n)((?:\d+\. .+\n?)+)/g, function(_, block) {
      var items = block.trim().split('\n').map(function(line) {
        return '<li>' + line.replace(/^\d+\. /, '') + '</li>';
      }).join('');
      return '<ol>' + items + '</ol>';
    });

    // Line breaks (but not inside pre blocks)
    escaped = escaped.replace(/(<pre><code[\s\S]*?<\/code><\/pre>)|(\n)/g, function(match, preBlock, newline) {
      if (preBlock) return preBlock;
      return '<br>';
    });

    return escaped;
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function escAttr(s) { return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

  // ══════════════════════════════════════════════════════
  // SECTION 7: AUTONOMOUS AI BEHAVIOR
  // ══════════════════════════════════════════════════════

  var autoBehavior = {
    enabled: false,
    lastTriggerTime: 0,
    globalCooldown: 45,
    scrollY: 0,
    scrollDelta: 0,
    sessionStartTime: Date.now(),
    lastInteractionTime: Date.now(),
    triggeredSet: {},
    suppressUntil: 0,
    visitCount: 0
  };

  var autoTriggerTimers = {};
  var autoBubbleEl = null;
  var autoBubbleTimer = null;

  var AUTO_TRIGGERS = {
    greeting:       { cooldown: 9999, oneShot: true },
    idleFidget:     { cooldown: 60, oneShot: false },
    idleComment:    { cooldown: 180, oneShot: false },
    scrollMilestone:{ cooldown: 30, oneShot: false },
    timeOfDay:      { cooldown: 600, oneShot: true },
    longSession:    { cooldown: 9999, oneShot: true },
    returnVisitor:  { cooldown: 9999, oneShot: true },
    bottomOfPage:   { cooldown: 120, oneShot: false }
  };

  // Add CSS for auto-bubble
  var autoCss = document.createElement('style');
  autoCss.textContent = `
.mascot-auto-bubble {
  position: fixed; top: 300px; right: 24px; z-index: 98;
  max-width: 200px; padding: 10px 14px;
  font-family: 'JetBrains Mono', monospace; font-size: 9px;
  line-height: 1.5; color: #c9d1d9;
  background: rgba(6,9,16,.92); backdrop-filter: blur(16px);
  border: 1px solid rgba(0,225,255,.12);
  border-radius: 12px 12px 4px 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,.4), 0 0 0 1px rgba(0,225,255,.04);
  opacity: 0; transform: translateY(8px) scale(0.95);
  transition: opacity .35s ease, transform .35s cubic-bezier(.16,1,.3,1);
  pointer-events: auto; cursor: pointer;
}
.mascot-auto-bubble.show { opacity: 1; transform: translateY(0) scale(1); }
.light-mode .mascot-auto-bubble {
  background: rgba(255,255,255,.95); color: #334155;
  border-color: rgba(0,0,0,.08); box-shadow: 0 8px 32px rgba(0,0,0,.1);
}
.mascot-drag-active { cursor: grabbing !important; transition: none !important; }
.mascot-trail-dot {
  position: fixed; width: 6px; height: 6px; border-radius: 50%;
  pointer-events: none; z-index: 97;
  animation: mascotTrailFade 0.5s ease-out forwards;
}
@keyframes mascotTrailFade { to { opacity: 0; transform: scale(0.3); } }
.mascot-minigame-target {
  position: fixed; width: 20px; height: 20px; border-radius: 50%;
  border: 2px solid #00e1ff; background: rgba(0,225,255,.15);
  cursor: pointer; z-index: 101; pointer-events: auto;
  animation: mascotTargetPulse 0.8s ease-in-out infinite;
}
@keyframes mascotTargetPulse { 50% { transform: scale(1.3); border-color: #fbbf24; } }
`;
  document.head.appendChild(autoCss);

  function initAutoBehavior() {
    try {
      var vc = parseInt(localStorage.getItem('mascotVisitCount') || '0', 10);
      autoBehavior.visitCount = vc + 1;
      localStorage.setItem('mascotVisitCount', String(autoBehavior.visitCount));
    } catch (e) {}

    if (A.RM) return;
    autoBehavior.enabled = true;

    var scrollRaf = false;
    window.addEventListener('scroll', function() {
      if (scrollRaf) return;
      scrollRaf = true;
      requestAnimationFrame(function() {
        scrollRaf = false;
        var newY = window.scrollY || window.pageYOffset || 0;
        autoBehavior.scrollDelta += Math.abs(newY - autoBehavior.scrollY);
        autoBehavior.scrollY = newY;
        // Spatial scroll sonification
        onScrollSonify();
      });
    }, { passive: true });

    var interactionHandler = function() { autoBehavior.lastInteractionTime = Date.now(); };
    document.addEventListener('mousemove', interactionHandler, { passive: true });
    document.addEventListener('keydown', interactionHandler, { passive: true });
    document.addEventListener('click', interactionHandler, { passive: true });
    document.addEventListener('touchstart', interactionHandler, { passive: true });

    var autoIv = setInterval(checkAutoTriggers, 5000);
    disposables.push({ dispose: function() {
      clearInterval(autoIv);
      document.removeEventListener('mousemove', interactionHandler);
      document.removeEventListener('keydown', interactionHandler);
      document.removeEventListener('click', interactionHandler);
      document.removeEventListener('touchstart', interactionHandler);
    }});
  }

  function checkAutoTriggers() {
    return; // auto-bubble disabled
    if (!alive || paused || !autoBehavior.enabled || !sceneReady) return;
    if (Date.now() < autoBehavior.suppressUntil) return;

    var now = clock ? clock.getElapsedTime() : 0;
    if (now - autoBehavior.lastTriggerTime < autoBehavior.globalCooldown) return;

    var idleTime = (Date.now() - autoBehavior.lastInteractionTime) / 1000;
    var sessionAge = (Date.now() - autoBehavior.sessionStartTime) / 1000;
    var hour = new Date().getHours();

    var triggers = [
      { id: 'greeting', cond: sessionAge < 10 && !isOpen },
      { id: 'returnVisitor', cond: autoBehavior.visitCount >= 3 && sessionAge < 15 && !isOpen },
      { id: 'idleFidget', cond: idleTime > 60 && !isOpen && !isTalking && !activeReaction },
      { id: 'idleComment', cond: idleTime > 180 && !isOpen },
      { id: 'scrollMilestone', cond: autoBehavior.scrollDelta > 3000 },
      { id: 'timeOfDay', cond: (hour >= 22 || hour < 6) && !isOpen },
      { id: 'longSession', cond: sessionAge > 600 && !isOpen },
      { id: 'bottomOfPage', cond: (autoBehavior.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 100) && !isOpen }
    ];

    for (var i = 0; i < triggers.length; i++) {
      var tr = triggers[i];
      var cfg = AUTO_TRIGGERS[tr.id];
      if (!tr.cond) continue;
      if (cfg.oneShot && autoBehavior.triggeredSet[tr.id]) continue;
      if (autoTriggerTimers[tr.id] && (now - autoTriggerTimers[tr.id]) < cfg.cooldown) continue;

      fireAutoTrigger(tr.id, now);
      break; // one per cycle
    }
  }

  function fireAutoTrigger(id, now) {
    autoBehavior.lastTriggerTime = now;
    autoTriggerTimers[id] = now;
    if (AUTO_TRIGGERS[id].oneShot) autoBehavior.triggeredSet[id] = true;

    switch (id) {
      case 'greeting':
        queueReaction('wave');
        setTimeout(function() { showAutoComment(getTimeGreeting()); }, 3000);
        break;
      case 'returnVisitor':
        queueReaction('wave');
        showAutoComment('Welcome back! \u{1F44B}');
        break;
      case 'idleFidget':
        if (typeof triggerRandomFidget === 'function') triggerRandomFidget();
        else queueReaction('wiggle');
        break;
      case 'idleComment':
        queueReaction('wave');
        showAutoComment(randomIdleComment());
        break;
      case 'scrollMilestone':
        queueReaction('nod');
        autoBehavior.scrollDelta = 0;
        break;
      case 'timeOfDay':
        showAutoComment('Burning the midnight oil? I\'m here if you need anything.');
        break;
      case 'longSession':
        queueReaction('excited');
        showAutoComment('You\'ve been exploring a while! Need help finding something?');
        break;
      case 'bottomOfPage':
        queueReaction('excited');
        break;
    }
  }

  function suppressAutoBehavior(seconds) {
    autoBehavior.suppressUntil = Date.now() + seconds * 1000;
  }

  function showAutoComment(text) {
    return; // disabled — no speech bubbles
    if (!autoBubbleEl) {
      autoBubbleEl = document.createElement('div');
      autoBubbleEl.className = 'mascot-auto-bubble';
      autoBubbleEl.addEventListener('click', function() {
        hideAutoBubble();
        var chatBubble = document.getElementById('amr-chat-bubble');
        if (chatBubble) chatBubble.click();
        else openPanel();
      });
      document.body.appendChild(autoBubbleEl);
    }
    clearTimeout(autoBubbleTimer);
    autoBubbleEl.textContent = text;
    autoBubbleEl.classList.remove('show');
    void autoBubbleEl.offsetWidth;
    autoBubbleEl.classList.add('show');
    autoBubbleTimer = setTimeout(hideAutoBubble, 5000);
  }

  function hideAutoBubble() {
    if (autoBubbleEl) autoBubbleEl.classList.remove('show');
  }

  function getTimeGreeting() {
    var h = new Date().getHours();
    if (h >= 6 && h < 12) return 'Good morning! Ask me anything about Amr\'s work.';
    if (h >= 12 && h < 17) return 'Good afternoon! I\'m here to help.';
    if (h >= 17 && h < 22) return 'Good evening! Feel free to ask me anything.';
    return 'Up late? I don\'t sleep \u2014 ask me anything!';
  }

  function randomIdleComment() {
    var comments = [
      'Psst... I can help with questions about Amr\'s work!',
      'Just floating here if you need me.',
      'Curious about something? Click me!',
      'I know a lot about fintech and banking...',
      'Try asking about certifications or mentoring!',
      'Fun fact: I respond to gestures too!',
      'Did you know you can drag me around?',
      'Bored? Type "dance" in my chat!'
    ];
    return comments[Math.floor(Math.random() * comments.length)];
  }

  // ══════════════════════════════════════════════════════
  // SECTION 8: EMOTIONAL INTELLIGENCE
  // ══════════════════════════════════════════════════════

  var emotionState = {
    moodHistory: [],
    currentValence: 0.5,
    currentArousal: 0.5,
    personalityBias: { curious: 0.15, playful: 0.1, warm: 0.08 },
    sentimentSmooth: 0.5,
    sentimentAlpha: 0.3,
    microExpressionActive: null,
    lastQuirkTime: 0,
    quirkCooldown: 30,
    lastSentimentMood: 'neutral'
  };

  var VALENCE_AROUSAL_MAP = {
    warm:       [0.7, 0.4],
    focused:    [0.5, 0.6],
    surprised:  [0.5, 0.9],
    calm:       [0.6, 0.2],
    melancholy: [0.3, 0.3],
    serene:     [0.6, 0.15],
    intense:    [0.4, 0.85],
    neutral:    [0.5, 0.5],
    playful:    [0.8, 0.7],
    determined: [0.55, 0.75],
    curious:    [0.65, 0.6]
  };

  var MICRO_EXPRESSIONS = {
    eyebrowFlash: { targets: { eyebrow_raise: 0.7 }, duration: 0.6, ramp: 0.15 },
    smirk:        { targets: { smile: 0.5, squint: 0.2 }, duration: 1.2, ramp: 0.3 },
    squintThink:  { targets: { squint: 0.4, eyebrow_furrow: 0.3 }, duration: 1.5, ramp: 0.3 },
    wideEyes:     { targets: { eyebrow_raise: 0.9, surprise: 0.6 }, duration: 0.8, ramp: 0.15 },
    pout:         { targets: { sad: 0.4, eyebrow_furrow: 0.2 }, duration: 1.0, ramp: 0.25 }
  };

  var PERSONALITY_QUIRKS = [
    { id: 'curioLook', weight: 3, action: function() { triggerMicroExpression('eyebrowFlash'); } },
    { id: 'slySmile', weight: 2, action: function() { triggerMicroExpression('smirk'); } },
    { id: 'ponderSquint', weight: 2, action: function() { triggerMicroExpression('squintThink'); } },
    { id: 'quickWiggle', weight: 1, action: function() { queueReaction('wiggle'); } },
    { id: 'deepBreath', weight: 2, action: function() {
      if (proceduralAnim) proceduralAnim.springs.breathScale.target = 0.03;
      setTimeout(function() { if (proceduralAnim) proceduralAnim.springs.breathScale.target = 0; }, 2000);
    }}
  ];
  var quirkTotalWeight = 0;
  PERSONALITY_QUIRKS.forEach(function(q) { quirkTotalWeight += q.weight; });

  var POSITIVE_WORDS = ['thanks','great','awesome','love','cool','nice','helpful','amazing','excellent','perfect','good','appreciate','wonderful','fantastic','brilliant'];
  var NEGATIVE_WORDS = ['bad','wrong','hate','terrible','confused','broken','error','annoying','frustrated','disappointed','awful','problem','fail','stuck','issue'];

  function initEmotionalIntelligence() {
    try {
      var saved = sessionStorage.getItem('mascotMoodHistory');
      if (saved) {
        emotionState.moodHistory = JSON.parse(saved);
        var last = emotionState.moodHistory[emotionState.moodHistory.length - 1];
        if (last && VALENCE_AROUSAL_MAP[last.mood]) {
          emotionState.currentValence = VALENCE_AROUSAL_MAP[last.mood][0];
          emotionState.currentArousal = VALENCE_AROUSAL_MAP[last.mood][1];
        }
      }
    } catch (e) {}
  }

  function analyzeSentiment(text) {
    if (!text) return { valence: 0.5, arousal: 0.5 };
    var lower = text.toLowerCase();
    var words = lower.split(/\W+/);
    var v = 0.5, ar = 0.5;
    for (var i = 0; i < words.length; i++) {
      if (POSITIVE_WORDS.indexOf(words[i]) !== -1) v = Math.min(1, v + 0.08);
      if (NEGATIVE_WORDS.indexOf(words[i]) !== -1) v = Math.max(0, v - 0.08);
    }
    if (lower.indexOf('?') !== -1) ar = Math.min(1, ar + 0.05);
    if (lower.indexOf('!') !== -1) ar = Math.min(1, ar + 0.1);
    var qWords = ['how','what','why','where','when','who'];
    for (var j = 0; j < qWords.length; j++) {
      if (words.indexOf(qWords[j]) !== -1) { ar = Math.min(1, ar + 0.03); break; }
    }
    return { valence: v, arousal: ar };
  }

  function updateMoodFromSentiment(sentiment) {
    var alpha = emotionState.sentimentAlpha;
    emotionState.sentimentSmooth = alpha * sentiment.valence + (1 - alpha) * emotionState.sentimentSmooth;
    emotionState.currentValence += (emotionState.sentimentSmooth - emotionState.currentValence) * 0.4;
    emotionState.currentArousal += (sentiment.arousal - emotionState.currentArousal) * 0.3;

    var bestMood = 'neutral', bestDist = Infinity;
    for (var mood in VALENCE_AROUSAL_MAP) {
      var m = VALENCE_AROUSAL_MAP[mood];
      var dv = emotionState.currentValence - m[0];
      var da = emotionState.currentArousal - m[1];
      var dist = Math.sqrt(dv * dv + da * da);
      dist -= (emotionState.personalityBias[mood] || 0);
      if (dist < bestDist) { bestDist = dist; bestMood = mood; }
    }

    if (bestMood !== emotionState.lastSentimentMood) {
      emotionState.lastSentimentMood = bestMood;
      document.dispatchEvent(new CustomEvent('moodchange', { detail: { mood: bestMood } }));
    }

    emotionState.moodHistory.push({ mood: bestMood, timestamp: Date.now(), source: 'sentiment' });
    if (emotionState.moodHistory.length > 50) emotionState.moodHistory.shift();
    try { sessionStorage.setItem('mascotMoodHistory', JSON.stringify(emotionState.moodHistory)); } catch (e) {}
  }

  function triggerMicroExpression(name) {
    if (A.RM || !clock) return;
    if (A.isMobile && (navigator.deviceMemory || 8) < 4) return;
    if (emotionState.microExpressionActive) return;
    var def = MICRO_EXPRESSIONS[name];
    if (!def) return;
    emotionState.microExpressionActive = {
      name: name,
      startTime: clock.getElapsedTime(),
      targets: def.targets,
      duration: def.duration,
      ramp: def.ramp
    };
  }

  function updateMicroExpressions(t, dt) {
    var me = emotionState.microExpressionActive;
    if (!me || !mascotMesh || !mascotMesh.morphTargetInfluences) return;
    var elapsed = t - me.startTime;
    if (elapsed >= me.duration) {
      emotionState.microExpressionActive = null;
      setMoodExpression(emotionState.lastSentimentMood);
      return;
    }
    var intensity;
    if (elapsed < me.ramp) {
      intensity = elapsed / me.ramp;
    } else if (elapsed > me.duration - me.ramp) {
      intensity = (me.duration - elapsed) / me.ramp;
    } else {
      intensity = 1;
    }
    intensity = Math.max(0, Math.min(1, intensity));
    for (var name in me.targets) {
      if (name in morphTargets) {
        var idx = morphTargets[name];
        var base = (targetMorphs[name] || 0);
        mascotMesh.morphTargetInfluences[idx] = base + (me.targets[name] - base) * intensity;
      }
    }
  }

  function updatePersonalityQuirks(t, dt) {
    if (t - emotionState.lastQuirkTime < emotionState.quirkCooldown) return;
    if (isOpen || isTalking || activeReaction) return;
    if (Math.random() > 0.02) return;

    var r = Math.random() * quirkTotalWeight;
    var cumulative = 0;
    for (var i = 0; i < PERSONALITY_QUIRKS.length; i++) {
      cumulative += PERSONALITY_QUIRKS[i].weight;
      if (r <= cumulative) {
        PERSONALITY_QUIRKS[i].action();
        emotionState.lastQuirkTime = t;
        break;
      }
    }
  }

  function getMoodTrend() {
    var hist = emotionState.moodHistory;
    if (hist.length < 3) return 'stable';
    var recent = hist.slice(-10);
    var totalDelta = 0;
    for (var i = 1; i < recent.length; i++) {
      var prev = VALENCE_AROUSAL_MAP[recent[i - 1].mood];
      var cur = VALENCE_AROUSAL_MAP[recent[i].mood];
      if (prev && cur) totalDelta += cur[0] - prev[0];
    }
    var avg = totalDelta / (recent.length - 1);
    if (avg > 0.05) return 'improving';
    if (avg < -0.05) return 'declining';
    return 'stable';
  }

  // ══════════════════════════════════════════════════════
  // SECTION 9: PHYSICS & PROCEDURAL ANIMATION
  // ══════════════════════════════════════════════════════

  var proceduralAnim = {
    springs: {
      headTilt:    { value: 0, velocity: 0, target: 0, stiffness: 120, damping: 14 },
      bodyLean:    { value: 0, velocity: 0, target: 0, stiffness: 80,  damping: 12 },
      breathScale: { value: 0, velocity: 0, target: 0, stiffness: 40,  damping: 8 },
      bobY:        { value: 0, velocity: 0, target: 0, stiffness: 100, damping: 13 }
    },
    fidget: {
      timer: 0,
      interval: 8 + Math.random() * 12,
      active: null,
      elapsed: 0
    },
    squashStretch: {
      scaleY: 1.0, scaleXZ: 1.0,
      targetY: 1.0, targetXZ: 1.0,
      velY: 0, velXZ: 0,
      stiffness: 200, damping: 14
    }
  };

  var FIDGET_TYPES = [
    { name: 'weightShift', duration: 2.0,
      apply: function(pa, t01) {
        var curve = Math.sin(t01 * Math.PI);
        pa.springs.bodyLean.target = curve * 0.006 * (Math.random() > 0.5 ? 1 : -1);
      },
      reset: function(pa) { pa.springs.bodyLean.target = 0; }
    },
    { name: 'headCock', duration: 1.5,
      apply: function(pa, t01) {
        var curve = Math.sin(t01 * Math.PI);
        pa.springs.headTilt.target = curve * 0.03;
      },
      reset: function(pa) { pa.springs.headTilt.target = 0; }
    },
    { name: 'breathDeep', duration: 3.0,
      _puffed: false,
      apply: function(pa, t01) {
        var curve = Math.sin(t01 * Math.PI);
        pa.springs.breathScale.target = curve * 0.025;
        if (t01 > 0.45 && t01 < 0.55 && !this._puffed) {
          this._puffed = true;
          emitSparkles(2);
        }
      },
      reset: function(pa) { pa.springs.breathScale.target = 0; this._puffed = false; }
    },
    { name: 'smallBob', duration: 1.2,
      apply: function(pa, t01) {
        var curve = Math.sin(t01 * Math.PI * 2) * (1 - t01);
        pa.springs.bobY.target = curve * 0.012;
      },
      reset: function(pa) { pa.springs.bobY.target = 0; }
    },
    { name: 'doubleBlink', duration: 0.8,
      apply: function() {
        if (blinkPhase < 0) { blinkPhase = 0; nextBlinkTime = 0.15; }
      },
      reset: function() {}
    }
  ];

  function springStep(spring, dt) {
    var force = (spring.target - spring.value) * spring.stiffness - spring.velocity * spring.damping;
    spring.velocity += force * dt;
    spring.value += spring.velocity * dt;
    return spring.value;
  }

  function updateProceduralAnimation(t, dt) {
    if (A.RM || !mascotRoot) return;

    // Step springs
    springStep(proceduralAnim.springs.headTilt, dt);
    springStep(proceduralAnim.springs.bodyLean, dt);
    springStep(proceduralAnim.springs.breathScale, dt);
    UP.auraBreathSync = proceduralAnim.springs.breathScale.value;
    springStep(proceduralAnim.springs.bobY, dt);

    // Fidget state machine
    var f = proceduralAnim.fidget;
    if (!f.active) {
      f.timer += dt;
      if (f.timer >= f.interval && !activeReaction && !isTalking && !isOpen) {
        var pick = FIDGET_TYPES[Math.floor(Math.random() * FIDGET_TYPES.length)];
        f.active = pick;
        f.elapsed = 0;
        f.timer = 0;
        f.interval = 8 + Math.random() * 12;
      }
    } else {
      f.elapsed += dt;
      var t01 = Math.min(1, f.elapsed / f.active.duration);
      if (t01 >= 1) {
        f.active.reset(proceduralAnim);
        f.active = null;
      } else {
        f.active.apply(proceduralAnim, t01);
      }
    }

    // Squash/stretch spring
    var ss = proceduralAnim.squashStretch;
    var fy = (ss.targetY - ss.scaleY) * ss.stiffness - ss.velY * ss.damping;
    ss.velY += fy * dt;
    ss.scaleY += ss.velY * dt;
    var fxz = (ss.targetXZ - ss.scaleXZ) * ss.stiffness - ss.velXZ * ss.damping;
    ss.velXZ += fxz * dt;
    ss.scaleXZ += ss.velXZ * dt;

    // headTilt spring disabled — mascot must stay upright (no Z rotation)
    mascotRoot.position.x += proceduralAnim.springs.bodyLean.value;
    mascotRoot.position.y = baseY + proceduralAnim.springs.bobY.value + proceduralAnim.springs.breathScale.value;

    mascotRoot.scale.y = baseScale * proceduralAnim.squashStretch.scaleY;
    mascotRoot.scale.x = mascotRoot.scale.z = baseScale * proceduralAnim.squashStretch.scaleXZ;
  }

  function triggerSquashStretch(type) {
    if (A.RM) return;
    var ss = proceduralAnim.squashStretch;
    switch (type) {
      case 'land':   ss.targetY = 0.88; ss.targetXZ = 1.07; break;
      case 'jump':   ss.targetY = 1.10; ss.targetXZ = 0.93; break;
      case 'bounce': ss.targetY = 0.94; ss.targetXZ = 1.03; break;
      case 'react':  ss.targetY = 1.04; ss.targetXZ = 0.98; break;
    }
    setTimeout(function() { ss.targetY = 1.0; ss.targetXZ = 1.0; }, 150);
  }

  function triggerAnticipation(callback) {
    if (A.RM) { if (callback) callback(); return; }
    proceduralAnim.springs.bobY.target = -0.01;
    setTimeout(function() {
      if (callback) callback();
      proceduralAnim.springs.bobY.target = 0.02;
      setTimeout(function() { proceduralAnim.springs.bobY.target = 0; }, 300);
    }, 150);
  }

  function triggerRandomFidget() {
    var f = proceduralAnim.fidget;
    if (f.active) return;
    var pick = FIDGET_TYPES[Math.floor(Math.random() * FIDGET_TYPES.length)];
    f.active = pick;
    f.elapsed = 0;
  }

  // ══════════════════════════════════════════════════════
  // SECTION 10: ADVANCED INTERACTION SYSTEM
  // ══════════════════════════════════════════════════════

  var interaction = {
    drag: {
      active: false, startX: 0, startY: 0,
      offsetX: 0, offsetY: 0,
      startTime: 0, hasMoved: false,
      moveThreshold: 8, currentCorner: 'topRight'
    },
    gesture: {
      points: [], maxPoints: 30,
      lastGestureTime: 0, gestureCooldown: 3,
      detectTimer: null
    },
    sequences: {
      patCount: 0, patTimer: null
    },
    miniGame: {
      active: false, type: null, state: {}, score: 0,
      targetEl: null, endTimer: null
    },
    appearance: {
      hatId: null, auraColor: null, trailEnabled: false
    }
  };

  var SNAP_POSITIONS = {
    bottomLeft:  { bottom: '16px', left: '16px', top: 'auto', right: 'auto' },
    bottomRight: { bottom: '16px', right: '16px', top: 'auto', left: 'auto' },
    topLeft:     { top: '16px', left: '16px', bottom: 'auto', right: 'auto' },
    topRight:    { top: '16px', right: '16px', bottom: 'auto', left: 'auto' }
  };

  var KONAMI_SEQUENCE = [38,38,40,40,37,39,37,39,66,65];
  var konamiBuffer = [];

  function initDragDrop() {
    if (!floatEl || A.isMobile) return;
    floatEl.addEventListener('pointerdown', function(e) {
      if (e.button !== 0) return;
      var rect = floatEl.getBoundingClientRect();
      interaction.drag.startX = e.clientX;
      interaction.drag.startY = e.clientY;
      interaction.drag.offsetX = rect.left - e.clientX;
      interaction.drag.offsetY = rect.top - e.clientY;
      interaction.drag.startTime = Date.now();
      interaction.drag.hasMoved = false;

      var onMove = function(ev) {
        var dx = ev.clientX - interaction.drag.startX;
        var dy = ev.clientY - interaction.drag.startY;
        if (!interaction.drag.hasMoved && (Math.abs(dx) + Math.abs(dy)) > interaction.drag.moveThreshold) {
          interaction.drag.hasMoved = true;
          interaction.drag.active = true;
          floatEl.classList.add('mascot-drag-active');
          floatEl.style.transition = 'none';
        }
        if (interaction.drag.hasMoved) {
          ev.preventDefault();
          var nx = ev.clientX + interaction.drag.offsetX;
          var ny = ev.clientY + interaction.drag.offsetY;
          nx = Math.max(0, Math.min(window.innerWidth - floatEl.offsetWidth, nx));
          ny = Math.max(0, Math.min(window.innerHeight - floatEl.offsetHeight, ny));
          floatEl.style.left = nx + 'px';
          floatEl.style.top = ny + 'px';
          floatEl.style.bottom = 'auto';
          floatEl.style.right = 'auto';
          proceduralAnim.springs.headTilt.target = Math.max(-0.04, Math.min(0.04, dx * 0.0003));
          if (interaction.appearance.trailEnabled) spawnTrailDot(nx + floatEl.offsetWidth / 2, ny + floatEl.offsetHeight / 2);
        }
      };

      var onUp = function() {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        proceduralAnim.springs.headTilt.target = 0;
        floatEl.classList.remove('mascot-drag-active');

        if (interaction.drag.hasMoved) {
          var r = floatEl.getBoundingClientRect();
          var cx = r.left + r.width / 2;
          var cy = r.top + r.height / 2;
          var ww = window.innerWidth, wh = window.innerHeight;
          var corner = (cy < wh / 2 ? 'top' : 'bottom') + (cx < ww / 2 ? 'Left' : 'Right');
          interaction.drag.currentCorner = corner;

          var pos = SNAP_POSITIONS[corner];
          floatEl.style.transition = 'all .3s cubic-bezier(.34,1.56,.64,1)';
          for (var prop in pos) floatEl.style[prop] = pos[prop];
          triggerSquashStretch('land');
          updatePanelPosition(corner);

          setTimeout(function() {
            interaction.drag.active = false;
            interaction.drag.hasMoved = false;
          }, 50);
        } else {
          interaction.drag.active = false;
        }
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  }

  function updatePanelPosition(corner) {
    if (!panel) return;
    panel.style.left = panel.style.right = panel.style.top = panel.style.bottom = 'auto';
    panel.style.transformOrigin = corner.replace(/([A-Z])/g, ' $1').toLowerCase();

    switch (corner) {
      case 'bottomLeft':
        panel.style.bottom = '300px'; panel.style.left = '16px'; break;
      case 'bottomRight':
        panel.style.bottom = '300px'; panel.style.right = '16px'; break;
      case 'topLeft':
        panel.style.top = '300px'; panel.style.left = '16px'; break;
      case 'topRight':
        panel.style.top = '300px'; panel.style.right = '16px'; break;
    }

    if (autoBubbleEl) {
      autoBubbleEl.style.left = autoBubbleEl.style.right = autoBubbleEl.style.top = autoBubbleEl.style.bottom = 'auto';
      if (corner.indexOf('Left') !== -1) autoBubbleEl.style.left = '24px';
      else autoBubbleEl.style.right = '24px';
      if (corner.indexOf('bottom') !== -1) autoBubbleEl.style.bottom = '300px';
      else autoBubbleEl.style.top = '300px';
    }
  }

  function spawnTrailDot(x, y) {
    var dot = document.createElement('div');
    dot.className = 'mascot-trail-dot';
    dot.style.left = x + 'px';
    dot.style.top = y + 'px';
    dot.style.background = currentMoodColor ? '#' + currentMoodColor.getHexString() : '#00e1ff';
    dot.style.opacity = '0.4';
    document.body.appendChild(dot);
    setTimeout(function() { if (dot.parentNode) dot.parentNode.removeChild(dot); }, 600);
  }

  // ── Gesture Recognition ──
  function trackGesture(x, y) {
    if (!floatEl) return;
    var rect = floatEl.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
    if (dist > 120) return;

    var g = interaction.gesture;
    g.points.push({ x: x, y: y, time: Date.now() });
    if (g.points.length > g.maxPoints) g.points.shift();

    clearTimeout(g.detectTimer);
    g.detectTimer = setTimeout(detectGesture, 200);
  }

  function detectGesture() {
    var g = interaction.gesture;
    if (g.points.length < 12) { g.points = []; return; }
    var now = clock ? clock.getElapsedTime() : 0;
    if (now - g.lastGestureTime < g.gestureCooldown) { g.points = []; return; }

    // Circle detection
    var sumX = 0, sumY = 0;
    for (var i = 0; i < g.points.length; i++) { sumX += g.points[i].x; sumY += g.points[i].y; }
    var cxG = sumX / g.points.length, cyG = sumY / g.points.length;
    var totalAngle = 0;
    for (var j = 1; j < g.points.length; j++) {
      var a1 = Math.atan2(g.points[j - 1].y - cyG, g.points[j - 1].x - cxG);
      var a2 = Math.atan2(g.points[j].y - cyG, g.points[j].x - cxG);
      var da = a2 - a1;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      totalAngle += da;
    }

    if (Math.abs(totalAngle) > 5) {
      queueReaction('spin');
      showAutoComment('You\'re making me dizzy!');
      g.lastGestureTime = now;
      g.points = [];
      return;
    }

    // Zigzag detection
    var reversals = 0;
    var lastDir = 0;
    for (var k = 1; k < g.points.length; k++) {
      var dx = g.points[k].x - g.points[k - 1].x;
      var dir = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
      if (dir !== 0 && dir !== lastDir && lastDir !== 0) reversals++;
      if (dir !== 0) lastDir = dir;
    }
    if (reversals >= 4) {
      queueReaction('wiggle');
      showAutoComment('Wheee!');
      g.lastGestureTime = now;
    }
    g.points = [];
  }

  // ── Interaction Sequences ──
  function handleMascotInteraction() {
    var seq = interaction.sequences;
    seq.patCount++;
    clearTimeout(seq.patTimer);
    seq.patTimer = setTimeout(function() { seq.patCount = 0; }, 1500);

    if (seq.patCount === 3) {
      triggerMicroExpression('smirk');
      queueReaction('nod');
    } else if (seq.patCount === 5) {
      triggerMicroExpression('wideEyes');
      queueReaction('excited');
    } else if (seq.patCount >= 7) {
      queueReaction('spin');
      if (window.VDna) window.VDna.addXp(5);
      seq.patCount = 0;
    }
  }

  // ── Easter Eggs ──
  function initEasterEggs() {
    document.addEventListener('keydown', function(e) {
      konamiBuffer.push(e.keyCode);
      if (konamiBuffer.length > KONAMI_SEQUENCE.length) konamiBuffer.shift();
      if (konamiBuffer.length === KONAMI_SEQUENCE.length) {
        var match = true;
        for (var i = 0; i < KONAMI_SEQUENCE.length; i++) {
          if (konamiBuffer[i] !== KONAMI_SEQUENCE[i]) { match = false; break; }
        }
        if (match) {
          konamiAction();
          konamiBuffer = [];
        }
      }
    });
  }

  function konamiAction() {
    queueReaction('spin');
    animUniforms.uEmissionPulse.value = 1.5;
    showAutoComment('Konami code activated!');
    if (window.VDna) window.VDna.addXp(10);

    var rainbowColors = [0xff0000, 0xff8800, 0xffff00, 0x00ff00, 0x0088ff, 0x8800ff];
    var ci = 0;
    var konamiIv = setInterval(function() {
      if (ci >= rainbowColors.length) { clearInterval(konamiIv); return; }
      targetMoodColor = new window.THREE.Color(rainbowColors[ci]);
      moodTransitionT = 0;
      ci++;
    }, 200);

    UP.targetCloudIntensity = 2.0;
    setTimeout(function() { UP.targetCloudIntensity = 1.0; }, 1500);
    emitSparkles(10);
  }

  function checkChatEasterEgg(q) {
    var lower = q.toLowerCase().trim();
    if (lower === 'dance') {
      showAutoComment('Watch my moves!');
      var clips = ['Enter', 'Happy', 'Confused', 'Wave', 'Talking', 'Thinking', 'Idle'];
      var delay = 0;
      clips.forEach(function(clip) {
        setTimeout(function() { playAnimation(clip, 0.3); }, delay);
        delay += 2000;
      });
      return true;
    }
    return false;
  }

  // ── Mini-Game ──
  function startMiniGame(type) {
    if (interaction.miniGame.active || A.RM) return;
    if (!UP.points || !camera || !renderer) return;

    interaction.miniGame.active = true;
    interaction.miniGame.type = type;
    interaction.miniGame.score = 0;
    interaction.miniGame.state.targetIdx = Math.floor(Math.random() * UP.CLOUD_COUNT);

    var target = document.createElement('div');
    target.className = 'mascot-minigame-target';
    target.addEventListener('click', function() {
      interaction.miniGame.score++;
      interaction.miniGame.state.targetIdx = Math.floor(Math.random() * UP.CLOUD_COUNT);
      triggerSquashStretch('bounce');
      playSound('click');
      animUniforms.uEmissionPulse.value = 0.5;
    });
    document.body.appendChild(target);
    interaction.miniGame.targetEl = target;

    showAutoComment('Catch the particles! 30 seconds...');
    interaction.miniGame.endTimer = setTimeout(endMiniGame, 30000);
  }

  function updateMiniGame(t, dt) {
    if (!interaction.miniGame.active || !interaction.miniGame.targetEl) return;
    if (!UP.geo || !UP.geo.attributes || !UP.geo.attributes.position) return;

    var idx = interaction.miniGame.state.targetIdx;
    var pos = UP.geo.attributes.position.array;
    var vec = new window.THREE.Vector3(pos[idx * 3], pos[idx * 3 + 1], pos[idx * 3 + 2]);
    vec.project(camera);

    var el = interaction.miniGame.targetEl;
    var hw = renderer.domElement.clientWidth / 2;
    var hh = renderer.domElement.clientHeight / 2;
    var rect = floatEl.getBoundingClientRect();
    var sx = rect.left + (vec.x * hw + hw);
    var sy = rect.top + (-vec.y * hh + hh);
    el.style.left = (sx - 10) + 'px';
    el.style.top = (sy - 10) + 'px';
  }

  function endMiniGame() {
    clearTimeout(interaction.miniGame.endTimer);
    if (interaction.miniGame.targetEl && interaction.miniGame.targetEl.parentNode) {
      interaction.miniGame.targetEl.parentNode.removeChild(interaction.miniGame.targetEl);
    }
    var score = interaction.miniGame.score;
    interaction.miniGame.active = false;
    interaction.miniGame.targetEl = null;
    showAutoComment('Caught ' + score + ' particles!');
    queueReaction('excited');
    if (window.VDna && score > 0) window.VDna.addXp(score);
  }

  // ── Appearance Customization ──
  function initAppearance() {
    try {
      var saved = localStorage.getItem('mascot_appearance');
      if (saved) {
        var data = JSON.parse(saved);
        if (data.hatId) setHat(data.hatId);
        if (data.auraColor) setAuraColor(data.auraColor);
        if (data.trailEnabled) interaction.appearance.trailEnabled = true;
      }
    } catch (e) {}
  }

  function setHat(hatId) {
    if (!mascotRoot || !window.THREE) return;
    var T = window.THREE;
    // Remove existing hat
    var existing = mascotRoot.getObjectByName('mascotHat');
    if (existing) mascotRoot.remove(existing);

    interaction.appearance.hatId = hatId;
    if (!hatId || hatId === 'none') { saveAppearance(); return; }

    var hatMesh;
    var box = new T.Box3().setFromObject(mascotRoot);
    var topY = (box.max.y - mascotRoot.position.y) / baseScale;

    switch (hatId) {
      case 'topHat':
        hatMesh = new T.Mesh(
          new T.CylinderGeometry(0.06, 0.08, 0.12, 8),
          new T.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.3 })
        );
        hatMesh.position.y = topY + 0.06;
        break;
      case 'partyHat':
        hatMesh = new T.Mesh(
          new T.ConeGeometry(0.07, 0.15, 8),
          new T.MeshStandardMaterial({ color: 0xff6b9d, roughness: 0.5 })
        );
        hatMesh.position.y = topY + 0.08;
        break;
      case 'crown':
        hatMesh = new T.Mesh(
          new T.TorusGeometry(0.06, 0.015, 4, 6),
          new T.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.8, roughness: 0.2 })
        );
        hatMesh.position.y = topY + 0.02;
        hatMesh.rotation.x = Math.PI / 2;
        break;
      default: return;
    }
    hatMesh.name = 'mascotHat';
    mascotRoot.add(hatMesh);
    saveAppearance();
  }

  function setAuraColor(hex) {
    interaction.appearance.auraColor = hex;
    if (hex && window.THREE) {
      var c = new window.THREE.Color(hex);
      targetMoodColor = c;
      moodTransitionT = 0;
      if (animUniforms.uFresnelColor.value) animUniforms.uFresnelColor.value.copy(c);
    }
    saveAppearance();
  }

  function saveAppearance() {
    try {
      localStorage.setItem('mascot_appearance', JSON.stringify({
        hatId: interaction.appearance.hatId,
        auraColor: interaction.appearance.auraColor,
        trailEnabled: interaction.appearance.trailEnabled
      }));
    } catch (e) {}
  }

  // ══════════════════════════════════════════════════════
  // SECTION 11: INIT
  // ══════════════════════════════════════════════════════

  // Expose customization commands via terminal and chat
  window.TermCmds = window.TermCmds || {};
  window.TermCmds.mascot = function() { setTimeout(openPanel, 300); return '\ud83e\udd16 Opening mascot assistant...'; };
  window.TermCmds['mascot-hat'] = function(args) {
    var id = (args || '').trim().toLowerCase();
    if (!id || id === 'none') { setHat(null); return 'Hat removed.'; }
    if (['tophat','partyhat','crown'].indexOf(id.replace(/\s/g,'')) !== -1) {
      setHat(id.replace(/\s/g,'').replace('tophat','topHat').replace('partyhat','partyHat'));
      return 'Hat set to ' + id + '!';
    }
    return 'Available hats: topHat, partyHat, crown, none';
  };
  window.TermCmds['mascot-aura'] = function(args) {
    var hex = (args || '').trim();
    if (!hex || hex === 'none') { setAuraColor(null); return 'Aura color reset.'; }
    if (/^#?[0-9a-fA-F]{6}$/.test(hex)) {
      setAuraColor(hex.charAt(0) === '#' ? hex : '#' + hex);
      return 'Aura set to ' + hex + '!';
    }
    return 'Usage: mascot-aura #ff6b9d (or "none" to reset)';
  };
  window.TermCmds['mascot-game'] = function() { startMiniGame('catchParticle'); return 'Starting particle catch game!'; };

  window._openMascot = openPanel;

  window.addEventListener('beforeunload', function() {
    alive = false;
    // Stop all spatial audio drones
    if (typeof MascotAmbience !== 'undefined' && MascotAmbience) {
      if (MascotAmbience.activeDrone) { try { MascotAmbience.activeDrone.stop(0); } catch (e) {} MascotAmbience.activeDrone = null; }
      if (MascotAmbience.proximityDrone) { try { MascotAmbience.proximityDrone.stop(0); } catch (e) {} MascotAmbience.proximityDrone = null; }
      if (MascotAmbience.proximityDrone2) { try { MascotAmbience.proximityDrone2.stop(0); } catch (e) {} MascotAmbience.proximityDrone2 = null; }
      if (MascotAmbience.sessionHarmonic) { try { MascotAmbience.sessionHarmonic.stop(0); } catch (e) {} MascotAmbience.sessionHarmonic = null; }
    }
    document.removeEventListener('moodchange', onMoodChange);
    window.removeEventListener('AmrOS:XPChanged', onXPChanged);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('mousemove', onGlobalMouseMove);
    document.removeEventListener('touchmove', onGlobalTouchMove);
    document.removeEventListener('touchstart', onGlobalTouchMove);
    if (controls) controls.dispose();
    disposables.forEach(function(d) { if (d && d.dispose) d.dispose(); });
    if (renderer) renderer.dispose();
  });

  // Boot: create DOM, then load 3D immediately
  createDOM();

  // Animate mascot in sync with peripherals (trophy bar etc.) using GSAP
  function revealMascot() {
    if (!floatEl) return;
    if (window.gsap) {
      window.gsap.fromTo(floatEl,
        { opacity: 0, scale: 0.6, y: -30 },
        { opacity: 1, scale: 1, y: 0, duration: 0.7, ease: 'back.out(1.7)', delay: 0.15 }
      );
    } else {
      floatEl.style.opacity = '1';
    }
  }

  // Wait for peripherals (trophy bar, top buttons) to show, then reveal together
  // Force the float visible — covers GSAP stalling (backgrounded tab) or the .mascot-float
  // CSS opacity:0 never being cleared. Checks COMPUTED opacity (the 0 comes from the class).
  function ensureVisible(delay) {
    setTimeout(function() {
      if (floatEl && parseFloat(getComputedStyle(floatEl).opacity || '1') < 0.05) floatEl.style.opacity = '1';
    }, delay);
  }
  if (window._peripheralsShown) {
    revealMascot();
    ensureVisible(1800);
  } else {
    window.addEventListener('AmrOS:PeripheralsReady', revealMascot, { once: true });
    setTimeout(function() { if (floatEl && parseFloat(getComputedStyle(floatEl).opacity || '1') < 0.05) revealMascot(); }, 8000);
    ensureVisible(9000);
  }

  // Load Three.js + model on all viewports (mobile included, like the main site).
  // Only reduced-motion falls back to the emoji launcher. GLB is cached immutably (1yr).
  if (!A.RM) {
    loadThreeExtensions().then(function() {
      initScene(floatEl);
      // Bump ?v= whenever /mascot.glb changes — it's cached immutably for 1 year (see vercel.json)
      return loadGLB('/mascot.glb', function(pct) {
        // Loading progress available if needed
      });
    }).then(function(gltf) {
      onModelLoaded(gltf);
      queueReaction('wave');
      // Initialize advanced systems
      initEmotionalIntelligence();
      initAutoBehavior();
      initDragDrop();
      initEasterEggs();
      initAppearance();
    }).catch(function(err) {
      console.warn('[Mascot] Load failed:', err);
      // Fallback: show emoji placeholder
      floatEl.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:48px;opacity:.6;">\ud83e\udd16</div><span class="mascot-float-label">ASK ELHARONYCLAW</span>';
    });
  } else {
    // Reduced motion: emoji-only
    floatEl.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:48px;opacity:.6;">\ud83e\udd16</div><span class="mascot-float-label">ASK ELHARONYCLAW</span>';
  }

  console.log('%c\ud83e\udd16 Mascot Assistant Loaded (Ultra Advanced: Physics + Emotions + Autonomy + Interactions)', 'background:#00e1ff;color:#000;padding:2px 5px;border-radius:3px;');
})();
