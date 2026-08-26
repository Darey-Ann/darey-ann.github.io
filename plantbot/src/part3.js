
/* ============================================================
   Scene
   ============================================================ */
const canvas = document.getElementById("c");
const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance" });
if (!gl) { document.getElementById("fallback").classList.add("on"); }

if (gl) (function main(){

const floatOK = !!gl.getExtension("EXT_color_buffer_float");
gl.getExtension("OES_texture_float_linear");
const HDR = floatOK ? gl.RGBA16F : gl.RGBA8;

const prog = makeProgram(gl, VS, FS);
const U = uniforms(gl, prog, ["uProj","uView","uModel","uNrmMat","uAlbedo","uEmissive","uEmiStr",
  "uRough","uSpec","uAlpha","uTrans","uFlag","uCamPos","uSunDir","uSunColor","uSkyCol","uGndCol","uAmb",
  "uPL0","uPL1","uPL2","uPC0","uPC1","uPC2","uPR"]);
const blurProg = makeProgram(gl, QUAD_VS, BLUR_FS);
const Ub = uniforms(gl, blurProg, ["uTex","uDir"]);
const compProg = makeProgram(gl, QUAD_VS, COMP_FS);
const Uc = uniforms(gl, compProg, ["uScene","uBloom","uBloomStr","uExposure","uGrain","uTime"]);

/* fullscreen triangle */
const quadVAO = gl.createVertexArray();
gl.bindVertexArray(quadVAO);
const qb = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, qb);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);

/* ---------- palette ---------- */
const MOOD = { happy: hex2rgb("#54E066"), low: hex2rgb("#FFB13C") };
const SUN  = [1.08, 0.86, 0.60]; /* [1.08, 0.86, 0.60] [1.30, 1.03, 0.72];*/

/* ---------- geometry ---------- */
const LEAF_BIG   = { length:0.176, width:0.055, bend:0.034, dish:0.30, twist:0.16, thickness:0.0115, nu:40, nv:18 };
const LEAF_SMALL = { length:0.126, width:0.045, bend:0.026, dish:0.26, twist:-0.12, thickness:0.0095, nu:34, nv:16 };

const leafBig   = buildLeaf(LEAF_BIG);
const leafSmall = buildLeaf(LEAF_SMALL);

const G = {
  bigTop:    uploadMesh(gl, leafBig.top),
  bigBot:    uploadMesh(gl, leafBig.bottom),
  bigRim:    uploadMesh(gl, leafBig.rim),
  smTop:     uploadMesh(gl, leafSmall.top),
  smBot:     uploadMesh(gl, leafSmall.bottom),
  smRim:     uploadMesh(gl, leafSmall.rim),
  panelBig:  uploadMesh(gl, buildPanelOnLeaf(LEAF_BIG,   0.20, 0.78, 0.62, -0.0072)),
  panelSm:   uploadMesh(gl, buildPanelOnLeaf(LEAF_SMALL, 0.24, 0.76, 0.58, -0.0060)),
  base:      uploadMesh(gl, lathe([[0.0,0.0455],[0.014,0.0450],[0.028,0.0432],[0.042,0.0388],
                                   [0.055,0.0310],[0.066,0.0208],[0.0745,0.0098],[0.0790,0.0032],[0.0800,0.0]], 56)),
  seam:      uploadMesh(gl, lathe([[0.0690,0.0180],[0.0705,0.0158]], 56)),
  stem:      uploadMesh(gl, tube(u => {
                 const y = lerp(0.036, 0.132, u);
                 return [Math.sin(u*1.5)*0.004, y, Math.cos(u*2.0)*0.002 - 0.002];
               }, u => lerp(0.0098, 0.0072, u), 26, 16)),
  petioleA:  uploadMesh(gl, tube(u => [
                 lerp(0.002, 0.030, u) + Math.sin(u*Math.PI)*0.008,
                 lerp(0.126, 0.166, u),
                 lerp(-0.002, 0.008, u)
               ], u => lerp(0.0068, 0.0052, u), 20, 14)),
  petioleB:  uploadMesh(gl, tube(u => [
                 lerp(0.000, -0.028, u) - Math.sin(u*Math.PI)*0.006,
                 lerp(0.122, 0.144, u),
                 lerp(-0.002, -0.006, u)
               ], u => lerp(0.0062, 0.0046, u), 20, 14)),
  ldrStalk:  uploadMesh(gl, tube(u => [0, u*0.010, 0], () => 0.0016, 6, 10)),
  ldrHead:   uploadMesh(gl, sphereMesh(0.0038, 12, 16)),
  indicator: uploadMesh(gl, sphereMesh(0.0042, 10, 14)),
  desk:      uploadMesh(gl, boxMesh(2.60, 0.045, 1.15)),
  apron:     uploadMesh(gl, boxMesh(2.44, 0.075, 0.90)),
  legL:      uploadMesh(gl, boxMesh(0.055, 0.72, 0.055)),
  wallL:     uploadMesh(gl, boxMesh(1.30, 3.00, 0.09)),
  wallR:     uploadMesh(gl, boxMesh(1.55, 3.00, 0.09)),
  wallT:     uploadMesh(gl, boxMesh(1.55, 0.92, 0.09)),
  wallB:     uploadMesh(gl, boxMesh(1.55, 0.86, 0.09)),
  sky:       uploadMesh(gl, boxMesh(1.90, 1.60, 0.02)),
  frameV:    uploadMesh(gl, boxMesh(0.022, 1.24, 0.055)),
  frameH:    uploadMesh(gl, boxMesh(1.60, 0.022, 0.055)),
  sill:      uploadMesh(gl, boxMesh(1.66, 0.030, 0.13)),
  mug:       uploadMesh(gl, lathe([[0.0,0.010],[0.033,0.010],[0.035,0.020],[0.037,0.088],[0.043,0.086],
                                   [0.041,0.055],[0.040,0.006],[0.036,0.0],[0.0,0.0]], 40)),
  handle:    uploadMesh(gl, torusArc(0.028, 0.006, Math.PI*1.25, -Math.PI*0.62, 22, 12)),
  book1:     uploadMesh(gl, boxMesh(0.178, 0.023, 0.126)),
  book2:     uploadMesh(gl, boxMesh(0.164, 0.019, 0.118)),
  shadow:    uploadMesh(gl, planeMesh(1, 1))
};

/* ---------- draw helper ---------- */
const I3 = new Float32Array([1,0,0, 0,1,0, 0,0,1]);
function draw(geo, model, mat) {
  gl.uniformMatrix4fv(U.uModel, false, model);
  gl.uniformMatrix3fv(U.uNrmMat, false, M4.normalMat(model));
  gl.uniform3fv(U.uAlbedo, mat.albedo || [0.8,0.8,0.8]);
  gl.uniform3fv(U.uEmissive, mat.emissive || [0,0,0]);
  gl.uniform1f(U.uEmiStr, mat.emiStr || 0);
  gl.uniform1f(U.uRough, mat.rough === undefined ? 0.7 : mat.rough);
  gl.uniform1f(U.uSpec, mat.spec === undefined ? 0.14 : mat.spec);
  gl.uniform1f(U.uAlpha, mat.alpha === undefined ? 1 : mat.alpha);
  gl.uniform1f(U.uTrans, mat.trans || 0);
  gl.uniform1i(U.uFlag, mat.flag || 0);
  if (mat.doubleSided) gl.disable(gl.CULL_FACE);
  gl.bindVertexArray(geo.vao);
  gl.drawElements(gl.TRIANGLES, geo.count, gl.UNSIGNED_INT, 0);
  if (mat.doubleSided) gl.enable(gl.CULL_FACE);
}

/* ---------- materials ---------- */
const SHELL   = { albedo:[0.885,0.895,0.880], rough:0.42, spec:0.30 };
const SHELL_U = { albedo:[0.80,0.83,0.80],   rough:0.55, spec:0.12 };
const BODY    = { albedo:[0.905,0.910,0.895], rough:0.46, spec:0.24 };
const STEMMAT = { albedo:[0.86,0.88,0.86],   rough:0.44, spec:0.22 };
const DARK    = { albedo:[0.10,0.11,0.12],   rough:0.35, spec:0.30 };
const DESKMAT = { albedo:[0.215,0.140,0.086], rough:0.62, spec:0.12, flag:3 };
const WALLMAT = { albedo:[0.395,0.402,0.392], rough:0.94, spec:0.02, flag:4 };
const FRAME   = { albedo:[0.175,0.180,0.178], rough:0.58, spec:0.12 };
const CERAMIC = { albedo:[0.760,0.755,0.735], rough:0.30, spec:0.34 };
const BOOKA   = { albedo:[0.105,0.150,0.142], rough:0.86, spec:0.03 };
const BOOKB   = { albedo:[0.200,0.118,0.090], rough:0.88, spec:0.03 };
const SKYMAT  = { flag:2 };

/* ---------- static transforms ---------- */
const T = {
  desk:  M4.trs(0, -0.0225, 0.10, 0,0,0, 1),
  apron: M4.trs(0, -0.085, -0.03, 0,0,0, 1),
  legL:  M4.trs(-1.14, -0.41, -0.16, 0,0,0, 1),
  legR:  M4.trs( 1.14, -0.41, -0.16, 0,0,0, 1),
  wallL: M4.trs(-1.44, 0.72, -0.70, 0,0,0, 1),
  wallR: M4.trs( 1.56, 0.72, -0.70, 0,0,0, 1),
  wallT: M4.trs( 0.01, 1.72, -0.70, 0,0,0, 1),
  wallB: M4.trs( 0.01, -0.30, -0.70, 0,0,0, 1),
  sky:   M4.trs( 0.01, 0.86, -0.86, 0,0,0, 1),
  fV:    M4.trs( 0.01, 0.79, -0.70, 0,0,0, 1),
  fH:    M4.trs( 0.01, 0.79, -0.70, 0,0,0, 1),
  sill:  M4.trs( 0.01, 0.145, -0.655, 0,0,0, 1),
  mug:   M4.trs( 0.245, 0.0, 0.115, 0, 1.15, 0, 1),
  hand:  M4.trs( 0.276, 0.052, 0.132, 0, 1.15, 0, 1),
  book1: M4.trs(-0.285, 0.013, 0.015, 0, 0.34, 0, 1),
  book2: M4.trs(-0.282, 0.034, 0.010, 0, 0.23, 0, 1),
  shBase: M4.trs(0, 0.0016, 0.02, 0,0,0, 0.42, 1, 0.42),
  shMug:  M4.trs(0.245, 0.0014, 0.115, 0,0,0, 0.20, 1, 0.20),
  shBook: M4.trs(-0.284, 0.0012, 0.014, 0,0,0, 0.36, 1, 0.34),
  shLeafA:M4.trs(0.075, 0.0018, 0.045, 0,0,0, 0.50, 1, 0.44),
  ldr1:  M4.trs(0,0,0,0,0,0,1)
};

/* ---------- camera / orbit ---------- */
const cam = {
  target: [0, 0.145, 0.01],
  theta: 0.36, phi: 1.11, radius: 1.02,
  tTheta: 0.36, tPhi: 1.11, tRadius: 1.02,
  pan: [0,0,0], tPan: [0,0,0]
};
let dragging = false, panning = false, lastX = 0, lastY = 0, pinch = 0;

function pointerDown(e) {
  dragging = true;
  panning = (e.button === 2) || e.shiftKey;
  lastX = e.clientX; lastY = e.clientY;
  canvas.classList.add("dragging");
  canvas.setPointerCapture(e.pointerId);
}
function pointerMove(e) {
  if (!dragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  if (panning) {
    const s = cam.radius * 0.0016;
    cam.tPan[0] -= dx * s * Math.cos(cam.tTheta);
    cam.tPan[2] += dx * s * Math.sin(cam.tTheta);
    cam.tPan[1] += dy * s;
    cam.tPan[0] = clamp(cam.tPan[0], -0.22, 0.22);
    cam.tPan[1] = clamp(cam.tPan[1], -0.05, 0.22);
    cam.tPan[2] = clamp(cam.tPan[2], -0.22, 0.22);
  } else {
    cam.tTheta -= dx * 0.0068;
    cam.tPhi = clamp(cam.tPhi - dy * 0.0058, 0.22, 1.545);
  }
}
function pointerUp(e) {
  dragging = false; panning = false;
  canvas.classList.remove("dragging");
  try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
}
canvas.addEventListener("pointerdown", pointerDown);
canvas.addEventListener("pointermove", pointerMove);
canvas.addEventListener("pointerup", pointerUp);
canvas.addEventListener("pointercancel", pointerUp);
canvas.addEventListener("contextmenu", e => e.preventDefault());
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  cam.tRadius = clamp(cam.tRadius * Math.exp(e.deltaY * 0.0011), 0.32, 2.20);
}, { passive: false });
canvas.addEventListener("touchmove", e => {
  if (e.touches.length === 2) {
    e.preventDefault();
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                         e.touches[0].clientY - e.touches[1].clientY);
    if (pinch) cam.tRadius = clamp(cam.tRadius * (pinch / d), 0.32, 2.20);
    pinch = d;
  }
}, { passive: false });
canvas.addEventListener("touchend", () => { pinch = 0; });

/* ---------- framebuffers ---------- */
let W = 1, H = 1, bw = 1, bh = 1;
let sceneFBO, texColor, texGlow, depthRB, bloomFBO = [], bloomTex = [];

function makeTex(w, h, fmt) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, gl.RGBA, fmt === gl.RGBA8 ? gl.UNSIGNED_BYTE : gl.HALF_FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (w === W && h === H) return;
  W = w; H = h; bw = Math.max(1, w >> 1); bh = Math.max(1, h >> 1);
  canvas.width = W; canvas.height = H;

  if (sceneFBO) {
    gl.deleteFramebuffer(sceneFBO); gl.deleteTexture(texColor);
    gl.deleteTexture(texGlow); gl.deleteRenderbuffer(depthRB);
    bloomFBO.forEach(f => gl.deleteFramebuffer(f));
    bloomTex.forEach(t => gl.deleteTexture(t));
  }
  texColor = makeTex(W, H, HDR);
  texGlow  = makeTex(W, H, HDR);
  sceneFBO = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texColor, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, texGlow, 0);
  depthRB = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depthRB);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, W, H);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRB);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

  bloomFBO = []; bloomTex = [];
  for (let i = 0; i < 2; i++) {
    const t = makeTex(bw, bh, HDR);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    bloomTex.push(t); bloomFBO.push(f);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
window.addEventListener("resize", resize);

/* ---------- UI state ---------- */
const el = {
  toggle: document.getElementById("toggle"),
  name:   document.getElementById("stateName"),
  note:   document.getElementById("stateNote"),
  bat:    document.getElementById("tBat"),
  lux:    document.getElementById("tLux"),
  hue:    document.getElementById("tHue"),
  sway:   document.getElementById("sway"),
  spin:   document.getElementById("spin")
};
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduceMotion) el.sway.checked = false;

let mood = 0, moodTarget = 0;           // 0 = sunlit/happy, 1 = low battery
const COPY = [
  { name:"Sunlit", note:"Charged and content. The leaves lift toward the light and the underside LEDs run green." },
  { name:"Needs sun", note:"Running low. The leaves droop, the glow fades to amber and breathes slowly — a nudge, not an alarm." }
];
function setMood(v) {
  moodTarget = v;
  const c = COPY[v];
  el.name.textContent = c.name;
  el.note.textContent = c.note;
}
el.toggle.addEventListener("click", () => setMood(moodTarget ? 0 : 1));
if (location.hash === "#low") { setMood(1); mood = 1; }

/* ---------- render loop ---------- */
const proj = M4.perspective(32 * Math.PI/180, 1, 0.02, 24);
let t0 = performance.now(), swayPhase = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
  resize();

  /* --- state easing --- */
  mood += (moodTarget - mood) * (1 - Math.exp(-dt * 2.6));
  const m = smooth(clamp(mood, 0, 1));

  if (el.spin.checked && !dragging) cam.tTheta += dt * 0.13;
  const k = 1 - Math.exp(-dt * 9);
  cam.theta  += (cam.tTheta  - cam.theta)  * k;
  cam.phi    += (cam.tPhi    - cam.phi)    * k;
  cam.radius += (cam.tRadius - cam.radius) * k;
  for (let i = 0; i < 3; i++) cam.pan[i] += (cam.tPan[i] - cam.pan[i]) * k;

  const tgt = [cam.target[0]+cam.pan[0], cam.target[1]+cam.pan[1], cam.target[2]+cam.pan[2]];
  const eye = [
    tgt[0] + cam.radius * Math.sin(cam.phi) * Math.sin(cam.theta),
    tgt[1] + cam.radius * Math.cos(cam.phi),
    tgt[2] + cam.radius * Math.sin(cam.phi) * Math.cos(cam.theta)
  ];
  const view = M4.lookAt(eye, tgt, [0,1,0]);
  const aspect = W / H;
  proj.set(M4.perspective(32 * Math.PI/180, aspect, 0.02, 24));

  /* --- animation --- */
  if (el.sway.checked) swayPhase += dt * (1 - 0.45*m);
  const s = swayPhase;
  const amp = (el.sway.checked ? 1 : 0) * (1 - 0.55*m);
  const bodyRoll = 0.014*Math.sin(s*0.47) * amp;
  const bodyYaw  = 0.020*Math.sin(s*0.33 + 1.2) * amp;

  // big leaf: elevation drops as the battery falls
  const aPitch = 0.86 - 0.44*m + (0.040*Math.sin(s*0.72) + 0.017*Math.sin(s*1.83+1.1)) * amp;
  const aYaw   = 0.50 + (0.030*Math.sin(s*0.51+0.4)) * amp;
  const aRoll  = -0.13 + (0.035*Math.sin(s*0.95+2.0)) * amp;
  // small leaf flutters a little more
  const bPitch = 0.34 - 0.32*m + (0.055*Math.sin(s*0.88+2.3) + 0.022*Math.sin(s*2.11)) * amp;
  const bYaw   = 3.42 + (0.040*Math.sin(s*0.62+1.7)) * amp;
  const bRoll  = 0.14 + (0.045*Math.sin(s*1.14+0.9)) * amp;

  const plantM = M4.trs(0, 0, 0.02, 0, bodyYaw, bodyRoll, 1);
  const leafA  = M4.mul(plantM, M4.trs(0.030, 0.166, 0.008, aRoll, aYaw, aPitch, 1));
  const leafB  = M4.mul(plantM, M4.trs(-0.028, 0.144, -0.006, bRoll, bYaw, bPitch, 1));

  /* --- mood colour & lights --- */
  const glowCol = [0,1,2].map(i => lerp(MOOD.happy[i], MOOD.low[i], m));
  // const breathe = 1 + Math.sin(s * 1.25) * 0.16 * m;         // slow pulse only when low

  const breathe = 1 + Math.sin(pulsePhase * 0.7) * 0.35 * m;

  const glowInt = (1.0 - 0.42*m) * breathe;

  const lightAt = (M, u) => {
    const p = [u * (M === leafA ? LEAF_BIG.length : LEAF_SMALL.length), -0.020, 0];
    return [
      M[0]*p[0] + M[4]*p[1] + M[8]*p[2] + M[12],
      M[1]*p[0] + M[5]*p[1] + M[9]*p[2] + M[13],
      M[2]*p[0] + M[6]*p[1] + M[10]*p[2] + M[14]
    ];
  };
  const pl0 = lightAt(leafA, 0.52), pl1 = lightAt(leafB, 0.50);
  const pl2 = [plantM[12], 0.022, plantM[14] + 0.070];
  const sc = i => glowCol[i] * glowInt;

  /* ================= PASS 1: scene ================= */
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  gl.viewport(0, 0, W, H);
  gl.clearColor(0.026, 0.032, 0.030, 1);
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  gl.useProgram(prog);
  gl.uniformMatrix4fv(U.uProj, false, proj);
  gl.uniformMatrix4fv(U.uView, false, view);
  gl.uniform3fv(U.uCamPos, eye);
  gl.uniform3fv(U.uSunDir, [-0.34, 0.52, -1.0]);
  gl.uniform3fv(U.uSunColor, SUN);
  gl.uniform3fv(U.uSkyCol, [0.40, 0.47, 0.57]);
  gl.uniform3fv(U.uGndCol, [0.13, 0.10, 0.07]);
  gl.uniform1f(U.uAmb, 0.46); /* 0.30 */
  gl.uniform3fv(U.uPL0, pl0);
  gl.uniform3fv(U.uPL1, pl1);
  gl.uniform3fv(U.uPL2, pl2);
  gl.uniform3fv(U.uPC0, [sc(0)*2.30, sc(1)*2.30, sc(2)*2.30]);
  gl.uniform3fv(U.uPC1, [sc(0)*1.55, sc(1)*1.55, sc(2)*1.55]);
  gl.uniform3fv(U.uPC2, [sc(0)*0.30, sc(1)*0.30, sc(2)*0.30]);
  gl.uniform3fv(U.uPR, [0.38, 0.30, 0.10]);

  /* room */
  draw(G.sky,   T.sky,   SKYMAT);
  draw(G.wallL, T.wallL, WALLMAT);
  draw(G.wallR, T.wallR, WALLMAT);
  draw(G.wallT, T.wallT, WALLMAT);
  draw(G.wallB, T.wallB, WALLMAT);
  draw(G.frameV, T.fV,  FRAME);
  draw(G.frameH, T.fH,  FRAME);
  draw(G.sill,  T.sill, { albedo:[0.62,0.63,0.61], rough:0.55, spec:0.16 });
  draw(G.desk,  T.desk, DESKMAT);
  draw(G.apron, T.apron, { albedo:[0.205,0.135,0.085], rough:0.70, spec:0.06 });
  draw(G.legL,  T.legL, { albedo:[0.185,0.125,0.080], rough:0.72, spec:0.05 });
  draw(G.legL,  T.legR, { albedo:[0.185,0.125,0.080], rough:0.72, spec:0.05 });

  /* props */
  draw(G.mug,    T.mug,   CERAMIC);
  draw(G.handle, T.hand,  CERAMIC);
  draw(G.book1,  T.book1, BOOKA);
  draw(G.book2,  T.book2, BOOKB);

  /* plantbot body */
  draw(G.base, M4.mul(plantM, M4.trs(0,0,0,0,0,0,1)), BODY);
  draw(G.seam, M4.mul(plantM, M4.trs(0,0,0,0,0,0,1)), DARK);
  draw(G.stem, M4.mul(plantM, M4.trs(0,0,0,0,0,0,1)), STEMMAT);
  draw(G.petioleA, M4.mul(plantM, M4.trs(0,0,0,0,0,0,1)), STEMMAT);
  draw(G.petioleB, M4.mul(plantM, M4.trs(0,0,0,0,0,0,1)), STEMMAT);
  draw(G.indicator, M4.mul(plantM, M4.trs(0, 0.022, 0.0700, 0,0,0, 1)),
       { albedo:[0.05,0.05,0.05], emissive:glowCol, emiStr:2.4*glowInt, rough:0.25 });

  /* leaves */
  const emiRim = 2.60 * glowInt, emiBot = 1.05 * glowInt;
  draw(G.bigBot, leafA, { albedo:[0.72,0.75,0.72], rough:0.62, spec:0.05,
                          emissive:glowCol, emiStr:emiBot });
  draw(G.bigRim, leafA, { albedo:[0.22,0.24,0.22], rough:0.35, spec:0.10, flag:6,
                          emissive:glowCol, emiStr:emiRim, doubleSided:true });
  draw(G.bigTop, leafA, { albedo:SHELL.albedo, rough:SHELL.rough, spec:SHELL.spec, trans:0.20 });
  draw(G.panelBig, leafA, { flag:1, rough:0.16, spec:0.42, doubleSided:true });

  draw(G.smBot, leafB, { albedo:[0.72,0.75,0.72], rough:0.62, spec:0.05,
                         emissive:glowCol, emiStr:emiBot });
  draw(G.smRim, leafB, { albedo:[0.22,0.24,0.22], rough:0.35, spec:0.10, flag:6,
                         emissive:glowCol, emiStr:emiRim*0.9, doubleSided:true });
  draw(G.smTop, leafB, { albedo:SHELL.albedo, rough:SHELL.rough, spec:SHELL.spec, trans:0.20 });
  draw(G.panelSm, leafB, { flag:1, rough:0.16, spec:0.42, doubleSided:true });

  /* LDR sensors on the upper shells */
  const ldrs = [
    { M: leafA, u: 0.30, v: -0.42 }, { M: leafA, u: 0.62, v: 0.44 },
    { M: leafB, u: 0.44, v: -0.38 }
  ];
  ldrs.forEach(d => {
    const o = (d.M === leafA) ? LEAF_BIG : LEAF_SMALL;
    const hw = o.width * Math.pow(Math.sin(Math.PI*d.u), 0.72);
    const local = M4.trs(d.u*o.length, -o.bend*d.u*d.u + o.thickness*0.5 + 0.004, d.v*hw*2, 0,0,0, 1);
    const M = M4.mul(d.M, local);
    draw(G.ldrStalk, M, { albedo:[0.30,0.31,0.32], rough:0.5, spec:0.2 });
    draw(G.ldrHead, M4.mul(M, M4.trs(0,0.011,0,0,0,0,1)),
         { albedo:[0.62,0.58,0.42], rough:0.22, spec:0.45 });
  });

  /* contact shadows */
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.disable(gl.CULL_FACE);
  draw(G.shadow, T.shBase, { flag:5, alpha:0.62 });
  draw(G.shadow, T.shMug,  { flag:5, alpha:0.45 });
  draw(G.shadow, T.shBook, { flag:5, alpha:0.42 });
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.enable(gl.CULL_FACE);

  /* ================= PASS 2: bloom ================= */
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(blurProg);
  gl.bindVertexArray(quadVAO);
  gl.viewport(0, 0, bw, bh);
  gl.uniform1i(Ub.uTex, 0);
  gl.activeTexture(gl.TEXTURE0);

  let src = texGlow;
  for (let i = 0; i < 3; i++) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO[0]);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform2fv(Ub.uDir, [1.35 / bw, 0]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO[1]);
    gl.bindTexture(gl.TEXTURE_2D, bloomTex[0]);
    gl.uniform2fv(Ub.uDir, [0, 1.35 / bh]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    src = bloomTex[1];
  }

  /* ================= PASS 3: composite ================= */
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  gl.useProgram(compProg);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texColor);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bloomTex[1]);
  gl.uniform1i(Uc.uScene, 0);
  gl.uniform1i(Uc.uBloom, 1);
  gl.uniform1f(Uc.uBloomStr, 0.60); /* 0.45 */
  gl.uniform1f(Uc.uExposure, 1.10);
  gl.uniform1f(Uc.uGrain, 0.016);
  gl.uniform1f(Uc.uTime, now * 0.001);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);

  /* --- telemetry readout --- */
  const bat = Math.round(lerp(86, 11, m));
  const lux = Math.round(lerp(940, 40, m) / 10) * 10;
  const hx  = "#" + glowCol.map(v => Math.round(clamp(v,0,1)*255).toString(16).padStart(2,"0")).join("").toUpperCase();
  if (el.bat.textContent !== bat + "%") el.bat.textContent = bat + "%";
  if (el.lux.textContent !== lux + " lx") el.lux.textContent = lux + " lx";
  if (el.hue.textContent !== hx) { el.hue.textContent = hx; document.documentElement.style.setProperty("--mood", hx); }

  requestAnimationFrame(frame);
}
resize();
requestAnimationFrame(frame);

})();
