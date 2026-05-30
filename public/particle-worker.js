'use strict';

let W = 0, H = 0, CD = 140, MR = 200;
let mouse = { x: -9999, y: -9999 };
let gy = { x: 0, y: 0 };
let pts = [];

let _canvas = null, _ctx = null;
let _color = { r: 0, g: 225, b: 255 };

function createParticle() {
  return {
    x: Math.random() * W, y: Math.random() * H,
    vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
    r: Math.random() * 1.2 + 0.4, ph: Math.random() * 6.28, cr: 0
  };
}

function updateParticle(p) {
  p.ph += 0.015;
  p.cr = p.r + Math.sin(p.ph) * 0.25;
  p.x += p.vx + gy.x * 0.04;
  p.y += p.vy + gy.y * 0.04;
  if (p.x < -10) p.x = W + 10;
  if (p.x > W + 10) p.x = -10;
  if (p.y < -10) p.y = H + 10;
  if (p.y > H + 10) p.y = -10;
  const dx = mouse.x - p.x, dy = mouse.y - p.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < MR && d > 0) {
    const f = (MR - d) / MR;
    p.x -= (dx / d) * f * 2.5;
    p.y -= (dy / d) * f * 2.5;
  }
}

function computeFrame() {
  const n = pts.length;
  const posData = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    updateParticle(pts[i]);
    posData[i * 3] = pts[i].x;
    posData[i * 3 + 1] = pts[i].y;
    posData[i * 3 + 2] = pts[i].cr;
  }

  const connBuf = [];
  const cdSq = CD * CD;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
      const dd = dx * dx + dy * dy;
      if (dd < cdSq) {
        connBuf.push(i, j, 1 - Math.sqrt(dd) / CD);
      }
    }
  }
  const connections = new Float32Array(connBuf);

  if (_ctx) {
    drawFrame(posData, connections);
  } else {
    self.postMessage({ positions: posData, connections: connections },
      [posData.buffer, connections.buffer]);
  }
}

function drawFrame(pos, conn) {
  _ctx.clearRect(0, 0, W, H);
  const { r, g, b } = _color;
  const n = pos.length / 3;
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], cr = pos[i * 3 + 2];
    _ctx.beginPath(); _ctx.arc(x, y, cr, 0, 6.28);
    _ctx.fillStyle = `rgba(${r},${g},${b},.4)`; _ctx.fill();
    _ctx.beginPath(); _ctx.arc(x, y, cr * 3, 0, 6.28);
    _ctx.fillStyle = `rgba(${r},${g},${b},.04)`; _ctx.fill();
  }
  _ctx.lineWidth = 0.5;
  for (let i = 0; i < conn.length; i += 3) {
    const ai = conn[i], bi = conn[i + 1], al = conn[i + 2] * 0.12;
    _ctx.beginPath();
    _ctx.strokeStyle = `rgba(${r},${g},${b},${al})`;
    _ctx.moveTo(pos[ai * 3], pos[ai * 3 + 1]);
    _ctx.lineTo(pos[bi * 3], pos[bi * 3 + 1]);
    _ctx.stroke();
  }
}

function _renderLoop() {
  computeFrame();
  setTimeout(_renderLoop, 16);
}

self.onmessage = function(e) {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      W = msg.W; H = msg.H;
      CD = msg.CD || 140; MR = msg.MR || 200;
      pts = [];
      var count = Math.min(Math.max(0, msg.count || 0), 5000);
      for (let i = 0; i < count; i++) pts.push(createParticle());
      if (msg.canvas) {
        _canvas = msg.canvas;
        _canvas.width = W;
        _canvas.height = H;
        _ctx = _canvas.getContext('2d');
        if (msg.color) _color = msg.color;
        _renderLoop();
      }
      break;
    case 'resize':
      W = msg.W; H = msg.H;
      if (_canvas) { _canvas.width = W; _canvas.height = H; }
      break;
    case 'input':
      if (msg.mouse) mouse = msg.mouse;
      if (msg.gy) gy = msg.gy;
      break;
    case 'color':
      if (msg.color) _color = msg.color;
      break;
    case 'tick':
      if (!_ctx) computeFrame();
      break;
  }
};
