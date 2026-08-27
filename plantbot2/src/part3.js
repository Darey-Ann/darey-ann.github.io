
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
const Uc = uniforms(gl, compProg, ["uScene","uBloom","uBloomStr","uExposure","uGrain"]);

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
/* ------------------------------------------------------------------
   LOOK KNOBS - the things worth tweaking live here and in FRAME below.
   Edit THIS file only if you then run  python src/build.py.
   To edit the running page directly, change the same lines in index.html.
   ------------------------------------------------------------------ */
const SUN     = [1.30, 1.03, 0.72];   // key light through the window (RGB, may exceed 1)
const AMBIENT = 0.30;                 // flat fill from all sides - RAISE = washed out
const SKY_COL = [0.40, 0.47, 0.57];   // ambient from above, cool
const GND_COL = [0.13, 0.10, 0.07];   // ambient bounced off the desk, warm
const BLOOM   = 0.45;                 // how far the LED glow bleeds
const EXPOSURE= 1.10;                 // overall brightness, applied before tonemap
const GRAIN   = 0.016;                // static dither - LOWER = more visible banding
const PULSE_RATE = 0.7;               // low-battery breath, rad/s (0.7 = ~9s cycle)
const PULSE_DEPTH= 0.35;              // breath amplitude, 0.35 = +/-35%

const FLOOR = -0.76;                  // floor height. Desk top is y = 0, so a 76 cm desk.

/* ============================================================
   SPECIES
   ------------------------------------------------------------
   One body, swappable leaf modules. Every entry is the same robot - base,
   stem, PV, LDRs, LED rim - with a different blade parameterization hung on
   it, so the family reads as one product line rather than five objects.

   Leaf entry fields:
     at       attachment point on the stem, in body space
     rx/ry/rz resting roll / yaw / elevation (rz is the lift off horizontal)
     droop    how far rz falls in the low-battery state
     flutter  sway amplitude multiplier (small blades move more)
     phase    sway phase offset, so leaves don't move in lockstep
     o        blade parameters -> leafSurface()
     frond    true = pinnate compound blade (fern), built from o.pairs leaflet pairs
     panel    [u0, u1, vSpan, lift] PV footprint on the blade, true for a frond, or null
     ldrs     [[u, v], ...] light sensors on the upper shell
   ============================================================ */

const SPECIES = {

  lens: {
    label: "Sketch", full: "Original sketch blade",
    note: "The lens blade from your sketch. One large leaf up and back, one small to the side.",
    stem: 0.132, stemR: [0.0098, 0.0072],
    leaves: [
      { at:[0.030,0.166,0.008], rx:-0.13, ry:0.50, rz:0.86, droop:0.44, flutter:1.00, phase:0.0, glow:1.00,
        o:{ length:0.176, width:0.055, bend:0.034, dish:0.30, twist:0.16, thickness:0.0115, nu:40, nv:18 },
        panel:[0.20,0.78,0.62,-0.0072], ldrs:[[0.30,-0.42],[0.62,0.44]] },
      { at:[-0.028,0.144,-0.006], rx:0.14, ry:3.42, rz:0.34, droop:0.32, flutter:1.35, phase:2.3, glow:0.90,
        o:{ length:0.126, width:0.045, bend:0.026, dish:0.26, twist:-0.12, thickness:0.0095, nu:34, nv:16 },
        panel:[0.24,0.76,0.58,-0.0060], ldrs:[[0.44,-0.38]] }
    ]
  },

  snake: {
    label: "Snake", full: "Sansevieria trifasciata",
    note: "Upright straps. Smallest footprint in the family and the one that fits a narrow windowsill, but each blade is thin, so the panel area has to come from having four of them.",
    stem: 0.062, stemR: [0.0130, 0.0105],
    leaves: [
      { at:[0.014,0.058,0.010], rx:-0.05, ry:0.55, rz:1.36, droop:0.30, flutter:0.85, phase:0.0, glow:1.00, petiole:false,
        o:{ length:0.300, width:0.0225, bend:0.030, dish:0.36, twist:0.30, thickness:0.0105, nu:46, nv:12,
            outline: lensOutline(0.24) },
        panel:[0.14,0.86,0.60,-0.0060], ldrs:[[0.46,-0.34],[0.74,0.36]] },
      { at:[-0.016,0.056,-0.008], rx:0.06, ry:3.55, rz:1.30, droop:0.26, flutter:0.95, phase:1.7, glow:0.92, petiole:false,
        o:{ length:0.262, width:0.0205, bend:0.026, dish:0.34, twist:-0.26, thickness:0.0100, nu:42, nv:12,
            outline: lensOutline(0.24) },
        panel:[0.16,0.84,0.58,-0.0056], ldrs:[[0.52,0.34]] },
      { at:[0.010,0.054,-0.018], rx:-0.10, ry:2.10, rz:1.22, droop:0.34, flutter:1.10, phase:3.1, glow:0.80, petiole:false,
        o:{ length:0.214, width:0.0185, bend:0.024, dish:0.32, twist:0.22, thickness:0.0095, nu:38, nv:12,
            outline: lensOutline(0.24) },
        panel:[0.16,0.84,0.56,-0.0052], ldrs:[] },
      { at:[-0.008,0.052,0.018], rx:0.11, ry:5.05, rz:1.15, droop:0.30, flutter:1.20, phase:4.6, glow:0.74, petiole:false,
        o:{ length:0.178, width:0.0170, bend:0.022, dish:0.30, twist:-0.20, thickness:0.0090, nu:34, nv:12,
            outline: lensOutline(0.24) },
        panel:[0.18,0.82,0.56,-0.0048], ldrs:[] }
    ]
  },

  ficus: {
    label: "Ficus", full: "Ficus elastica",
    note: "Broad ovate blade with a drip tip. The most panel area per leaf in the family, and the widest surface to read the underglow off.",
    stem: 0.140, stemR: [0.0102, 0.0076],
    leaves: [
      { at:[0.026,0.170,0.010], rx:-0.16, ry:0.42, rz:0.72, droop:0.46, flutter:0.90, phase:0.0, glow:1.00,
        o:{ length:0.168, width:0.0575, bend:0.038, dish:0.24, twist:0.12, thickness:0.0120, nu:44, nv:20,
            outline: betaOutline(0.62, 0.95) },
        panel:[0.16,0.80,0.66,-0.0076], ldrs:[[0.32,-0.40],[0.60,0.42]] },
      { at:[-0.026,0.150,0.014], rx:0.18, ry:2.78, rz:0.44, droop:0.36, flutter:1.15, phase:2.1, glow:0.92,
        o:{ length:0.140, width:0.0490, bend:0.032, dish:0.24, twist:-0.14, thickness:0.0108, nu:40, nv:18,
            outline: betaOutline(0.62, 0.95) },
        panel:[0.18,0.78,0.62,-0.0068], ldrs:[[0.46,-0.38]] },
      { at:[0.006,0.128,-0.028], rx:-0.06, ry:4.42, rz:0.20, droop:0.28, flutter:1.30, phase:4.0, glow:0.78,
        o:{ length:0.112, width:0.0400, bend:0.026, dish:0.22, twist:0.10, thickness:0.0096, nu:34, nv:16,
            outline: betaOutline(0.62, 0.95) },
        panel:[0.20,0.76,0.58,-0.0060], ldrs:[] }
    ]
  },

  monstera: {
    label: "Monstera", full: "Monstera deliciosa",
    note: "Split margin and true fenestrations. The holes cost panel area, but they let wind and light through, and the silhouette is unmistakable across a room, which is what the display size is for.",
    stem: 0.126, stemR: [0.0112, 0.0086],
    leaves: [
      { at:[0.028,0.162,0.010], rx:-0.14, ry:0.46, rz:0.66, droop:0.42, flutter:0.80, phase:0.0, glow:1.00,
        o:{ length:0.192, width:0.0900, bend:0.030, dish:0.17, twist:0.10, thickness:0.0120, nu:76, nv:24,
            outline: notchOutline(betaOutline(0.82, 0.60), [0.30,0.47,0.64,0.81], 0.66, 0.030) },
        fenestrated: true,
        panel:[0.10,0.28,0.52,-0.0078], ldrs:[[0.22,-0.34],[0.56,0.10]] },
      { at:[-0.026,0.140,-0.008], rx:0.16, ry:3.30, rz:0.30, droop:0.34, flutter:1.05, phase:2.6, glow:0.90,
        o:{ length:0.152, width:0.0710, bend:0.026, dish:0.17, twist:-0.12, thickness:0.0106, nu:66, nv:22,
            outline: notchOutline(betaOutline(0.82, 0.60), [0.32,0.51,0.70], 0.62, 0.034) },
        fenestrated: true,
        panel:[0.10,0.28,0.50,-0.0068], ldrs:[[0.20,0.32]] }
    ]
  },

  fern: {
    label: "Fern", full: "Nephrolepis exaltata",
    note: "A pinnate frond: eleven pairs of leaflets on an arcing rachis. Many small blades instead of one big one, so the PV runs down the rachis and the LED rim traces every leaflet. Softest light in the family.",
    stem: 0.112, stemR: [0.0100, 0.0080],
    leaves: [
      { at:[0.024,0.140,0.008], rx:-0.12, ry:0.40, rz:0.60, droop:0.44, flutter:1.05, phase:0.0, glow:1.00,
        frond: true,
        o:{ length:0.212, width:0.0300, bend:0.052, thickness:0.0092, pinna:0.34, pairs:11 },
        panel:true, ldrs:[[0.34,0],[0.66,0]] },
      { at:[-0.024,0.126,0.014], rx:0.15, ry:2.60, rz:0.40, droop:0.36, flutter:1.25, phase:2.2, glow:0.90,
        frond: true,
        o:{ length:0.176, width:0.0260, bend:0.044, thickness:0.0086, pinna:0.33, pairs:9 },
        panel:true, ldrs:[[0.46,0]] },
      { at:[0.004,0.116,-0.026], rx:-0.08, ry:4.60, rz:0.26, droop:0.28, flutter:1.45, phase:4.3, glow:0.76,
        frond: true,
        o:{ length:0.142, width:0.0230, bend:0.038, thickness:0.0080, pinna:0.33, pairs:8 },
        panel:true, ldrs:[] }
    ]
  }
};

const SPECIES_ORDER = ["lens","snake","ficus","monstera","fern"];

/* ============================================================
   SIZES - same body, scaled. "place" decides desk or floor.
   ============================================================ */
const SIZES = {
  desk:    { label:"Desk",    scale:1.00, place:"desk",
             note:"The original. Sits next to the keyboard and lights the desk." },
  fan:     { label:"Fan",     scale:1.95, place:"desk",
             note:"Scaled until one blade is hand-fan sized. The leaf unclips, and you can actually wave it." },
  floor:   { label:"Floor",   scale:3.10, place:"floor",
             note:"Floor-planter scale, about knee height. Lights a corner instead of a desk." },
  display: { label:"Display", scale:6.20, place:"floor",
             note:"Human height, for a lobby or an exhibition. A leaf is now a solar panel you could stand under." }
};
const SIZE_ORDER = ["desk","fan","floor","display"];

/* where things stand */
const SPOT = {
  deskHero:  [ 0.00, 0.0, 0.02],   // desk mode, single bot
  deskRef:   [-0.62, 0.0, 0.10],   // desk-size reference bot when a bigger one is present
  deskFan:   [ 0.16, 0.0, 0.02],   // the fan-size bot
  fanLeaf:   [-0.18, 0.008, 0.34], // the detached leaf lying on the desk
  bigBot:    [ 0.70, FLOOR, 1.50],  // clear of the desk footprint at every scale
  human:     [ 1.72, FLOOR, 0.66]
};

/* ---------- geometry: body hardware, room, props, scale figure ---------- */
const G = {
  base:      uploadMesh(gl, lathe([[0.0,0.0455],[0.014,0.0450],[0.028,0.0432],[0.042,0.0388],
                                   [0.055,0.0310],[0.066,0.0208],[0.0745,0.0098],[0.0790,0.0032],[0.0800,0.0]], 56)),
  seam:      uploadMesh(gl, lathe([[0.0690,0.0180],[0.0705,0.0158]], 56)),
  ldrStalk:  uploadMesh(gl, tube(u => [0, u*0.010, 0], () => 0.0016, 6, 10)),
  ldrHead:   uploadMesh(gl, sphereMesh(0.0038, 12, 16)),
  indicator: uploadMesh(gl, sphereMesh(0.0042, 10, 14)),
  fanGrip:   uploadMesh(gl, tube(u => [-u*0.052, 0.0, 0], u => lerp(0.0075, 0.0092, u), 10, 12)),

  desk:      uploadMesh(gl, boxMesh(2.60, 0.045, 1.15)),
  apron:     uploadMesh(gl, boxMesh(2.44, 0.075, 0.90)),
  legL:      uploadMesh(gl, boxMesh(0.055, 0.72, 0.055)),
  floor:     uploadMesh(gl, boxMesh(7.20, 0.06, 7.20)),
  wallL:     uploadMesh(gl, boxMesh(2.80, 3.00, 0.09)),
  wallR:     uploadMesh(gl, boxMesh(2.80, 3.00, 0.09)),
  wallT:     uploadMesh(gl, boxMesh(1.55, 0.92, 0.09)),
  wallB:     uploadMesh(gl, boxMesh(1.55, 0.92, 0.09)),
  wallSide:  uploadMesh(gl, boxMesh(0.09, 3.00, 7.00)),
  sky:       uploadMesh(gl, boxMesh(1.90, 1.60, 0.02)),
  frameV:    uploadMesh(gl, boxMesh(0.022, 1.24, 0.055)),
  frameH:    uploadMesh(gl, boxMesh(1.60, 0.022, 0.055)),
  sill:      uploadMesh(gl, boxMesh(1.66, 0.030, 0.13)),
  mug:       uploadMesh(gl, lathe([[0.0,0.010],[0.033,0.010],[0.035,0.020],[0.037,0.088],[0.043,0.086],
                                   [0.041,0.055],[0.040,0.006],[0.036,0.0],[0.0,0.0]], 40)),
  handle:    uploadMesh(gl, torusArc(0.028, 0.006, Math.PI*1.25, -Math.PI*0.62, 22, 12)),
  book1:     uploadMesh(gl, boxMesh(0.178, 0.023, 0.126)),
  book2:     uploadMesh(gl, boxMesh(0.164, 0.019, 0.118)),
  shadow:    uploadMesh(gl, planeMesh(1, 1)),

  /* 1.71 m scale figure - deliberately blank. It is a ruler, not a character. */
  figTorso:  uploadMesh(gl, lathe([[0.0,1.470],[0.094,1.444],[0.134,1.374],[0.124,1.232],
                                   [0.096,1.086],[0.112,0.998],[0.100,0.942],[0.0,0.922]], 26)),
  figHead:   uploadMesh(gl, sphereMesh(0.098, 14, 18)),
  figNeck:   uploadMesh(gl, tube(u => [0, lerp(1.430,1.545,u), 0.004], u => lerp(0.049,0.042,u), 8, 12)),
  figArm:    uploadMesh(gl, tube(u => [u*0.030, lerp(1.398,0.655,u), 0.012], u => lerp(0.050,0.034,u), 14, 12)),
  figLeg:    uploadMesh(gl, tube(u => [0, lerp(0.960,0.005,u), 0], u => lerp(0.083,0.048,u), 16, 14))
};

/* ---------- per-species geometry, built on first use ---------- */
const SGEO = {};

function meshArea(m) {
  let A = 0;
  for (let i = 0; i < m.idx.length; i += 3) {
    const a = m.idx[i]*3, b = m.idx[i+1]*3, c = m.idx[i+2]*3;
    const ux = m.pos[b]-m.pos[a], uy = m.pos[b+1]-m.pos[a+1], uz = m.pos[b+2]-m.pos[a+2];
    const vx = m.pos[c]-m.pos[a], vy = m.pos[c+1]-m.pos[a+1], vz = m.pos[c+2]-m.pos[a+2];
    const cx = uy*vz-uz*vy, cy = uz*vx-ux*vz, cz = ux*vy-uy*vx;
    A += 0.5 * Math.hypot(cx, cy, cz);
  }
  return A;
}
function stemMesh(h, r0, r1) {
  return tube(u => [Math.sin(u*1.5)*0.004, lerp(0.036, h, u), Math.cos(u*2.0)*0.002 - 0.002],
              u => lerp(r0, r1, u), 26, 16);
}
function petioleMesh(from, to, r0, r1) {
  const bow = [(to[0]-from[0])*0.30, 0.004, (to[2]-from[2])*0.24];
  return tube(u => [
    lerp(from[0],to[0],u) + Math.sin(u*Math.PI)*bow[0],
    lerp(from[1],to[1],u) + Math.sin(u*Math.PI)*bow[1],
    lerp(from[2],to[2],u) + Math.sin(u*Math.PI)*bow[2]
  ], u => lerp(r0, r1, u), 20, 14);
}

function speciesGeo(key) {
  if (SGEO[key]) return SGEO[key];
  const S = SPECIES[key];
  const stemTop = [0.004, S.stem - 0.006, -0.002];
  const g = { stem: uploadMesh(gl, stemMesh(S.stem, S.stemR[0], S.stemR[1])),
              leaves: [], petioles: [], panelArea: 0, bladeLen: 0, height: 0.10 };

  S.leaves.forEach(L => {
    const o = L.o;
    let solid, rachis = null, panelMesh = null;
    if (L.frond) {
      solid = buildCompound(frondParts(o));
      rachis = uploadMesh(gl, tube(rachisPath(o), u => lerp(o.width*0.150, o.width*0.045, u), 24, 12));
      if (L.panel) panelMesh = rachisPanel(o);
    } else {
      solid = buildLeaf(o);
      if (L.panel) panelMesh = buildPanelOnLeaf(o, L.panel[0], L.panel[1], L.panel[2], L.panel[3]);
    }
    if (panelMesh) g.panelArea += meshArea(panelMesh);
    g.bladeLen = Math.max(g.bladeLen, o.length);
    g.height = Math.max(g.height, L.at[1] + o.length*Math.sin(L.rz) - o.bend*Math.cos(L.rz));

    g.leaves.push({
      top: uploadMesh(gl, solid.top), bot: uploadMesh(gl, solid.bottom), rim: uploadMesh(gl, solid.rim),
      panel: panelMesh ? uploadMesh(gl, panelMesh) : null, rachis, L
    });
    g.petioles.push(L.petiole === false ? null
      : uploadMesh(gl, petioleMesh(stemTop, L.at, o.thickness*0.60, o.thickness*0.45)));
  });
  SGEO[key] = g;
  return g;
}

/* ---------- draw helper ---------- */
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
const BODY    = { albedo:[0.905,0.910,0.895], rough:0.46, spec:0.24 };
const STEMMAT = { albedo:[0.86,0.88,0.86],   rough:0.44, spec:0.22 };
const DARK    = { albedo:[0.10,0.11,0.12],   rough:0.35, spec:0.30 };
const DESKMAT = { albedo:[0.215,0.140,0.086], rough:0.62, spec:0.12, flag:3 };
const FLOORMAT= { albedo:[0.150,0.104,0.070], rough:0.80, spec:0.05, flag:8 };
const WALLMAT = { albedo:[0.395,0.402,0.392], rough:0.94, spec:0.02, flag:4 };
const FRAME   = { albedo:[0.175,0.180,0.178], rough:0.58, spec:0.12 };
const CERAMIC = { albedo:[0.760,0.755,0.735], rough:0.30, spec:0.34 };
const BOOKA   = { albedo:[0.105,0.150,0.142], rough:0.86, spec:0.03 };
const BOOKB   = { albedo:[0.200,0.118,0.090], rough:0.88, spec:0.03 };
const FIGMAT  = { albedo:[0.128,0.136,0.140], rough:0.93, spec:0.02 };
const SKYMAT  = { flag:2 };

/* ---------- static transforms ---------- */
const T = {
  desk:  M4.trs(0, -0.0225, 0.10, 0,0,0, 1),
  apron: M4.trs(0, -0.085, -0.03, 0,0,0, 1),
  legL:  M4.trs(-1.14, -0.41, -0.16, 0,0,0, 1),
  legR:  M4.trs( 1.14, -0.41, -0.16, 0,0,0, 1),
  floor: M4.trs(0, FLOOR - 0.03, 2.15, 0,0,0, 1),
  wallL: M4.trs(-2.190, 0.72, -0.70, 0,0,0, 1),
  wallR: M4.trs( 2.185, 0.72, -0.70, 0,0,0, 1),
  wallT: M4.trs( 0.01, 1.72, -0.70, 0,0,0, 1),
  wallB: M4.trs( 0.01, -0.33, -0.70, 0,0,0, 1),
  wallSL:M4.trs(-3.55, 0.72, 2.30, 0,0,0, 1),
  wallSR:M4.trs( 3.55, 0.72, 2.30, 0,0,0, 1),
  sky:   M4.trs( 0.01, 0.86, -0.86, 0,0,0, 1),
  fV:    M4.trs( 0.01, 0.79, -0.70, 0,0,0, 1),
  fH:    M4.trs( 0.01, 0.79, -0.70, 0,0,0, 1),
  sill:  M4.trs( 0.01, 0.145, -0.655, 0,0,0, 1)
};

/* the props shuffle out of the way once there is more than one bot on the desk */
function propT(mug, book) {
  return {
    mug:   M4.trs(mug[0], 0.0, mug[1], 0, 1.15, 0, 1),
    hand:  M4.trs(mug[0]+0.031, 0.052, mug[1]+0.017, 0, 1.15, 0, 1),
    book1: M4.trs(book[0], 0.013, book[1], 0, 0.34, 0, 1),
    book2: M4.trs(book[0]+0.003, 0.034, book[1]-0.005, 0, 0.23, 0, 1),
    shMug: M4.trs(mug[0], 0.0014, mug[1], 0,0,0, 0.20, 1, 0.20),
    shBook:M4.trs(book[0]+0.001, 0.0012, book[1]-0.001, 0,0,0, 0.36, 1, 0.34)
  };
}
const PROP_T = { close: propT([0.245,0.115], [-0.285,0.015]),
                 wide:  propT([0.86, 0.170], [-0.98, 0.030]) };

/* ---------- camera / orbit ---------- */
const VIEW = {
  desk:    { tgt:[ 0.00, 0.145, 0.01], radius:1.02, phi:1.11, theta:0.36 },
  fan:     { tgt:[-0.42, 0.135, 0.22], radius:2.35, phi:1.13, theta:0.30 },
  floor:   { tgt:[ 0.62,-0.120, 1.00], radius:4.15, phi:1.24, theta:0.31 },
  display: { tgt:[ 0.34, 0.040, 1.10], radius:4.90, phi:1.22, theta:0.31 },
  lineup:  { tgt:[-0.30, 0.150, 0.05], radius:2.48, phi:1.18, theta:0.08 }
};

const cam = {
  target: VIEW.desk.tgt.slice(), tTarget: VIEW.desk.tgt.slice(),
  theta: 0.36, phi: 1.11, radius: 1.02,
  tTheta: 0.36, tPhi: 1.11, tRadius: 1.02,
  pan: [0,0,0], tPan: [0,0,0]
};
let dragging = false, panning = false, lastX = 0, lastY = 0, pinch = 0;

function applyView(v) {
  cam.tTarget = v.tgt.slice();
  cam.tRadius = v.radius;
  cam.tPhi    = v.phi;
  cam.tTheta  = v.theta;
  cam.tPan    = [0,0,0];
}

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
    const lim = 0.22 * Math.max(1, cam.radius);
    cam.tPan[0] = clamp(cam.tPan[0], -lim, lim);
    cam.tPan[1] = clamp(cam.tPan[1], -lim*0.30, lim);
    cam.tPan[2] = clamp(cam.tPan[2], -lim, lim);
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
  cam.tRadius = clamp(cam.tRadius * Math.exp(e.deltaY * 0.0011), 0.32, 7.00);
}, { passive: false });
canvas.addEventListener("touchmove", e => {
  if (e.touches.length === 2) {
    e.preventDefault();
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                         e.touches[0].clientY - e.touches[1].clientY);
    if (pinch) cam.tRadius = clamp(cam.tRadius * (pinch / d), 0.32, 7.00);
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
  toggle:  document.getElementById("toggle"),
  name:    document.getElementById("stateName"),
  note:    document.getElementById("stateNote"),
  bat:     document.getElementById("tBat"),
  lux:     document.getElementById("tLux"),
  hue:     document.getElementById("tHue"),
  sway:    document.getElementById("sway"),
  spin:    document.getElementById("spin"),
  lineup:  document.getElementById("lineup"),
  species: document.getElementById("speciesRow"),
  sizes:   document.getElementById("sizeRow"),
  leafNote:document.getElementById("leafNote"),
  spec:    document.getElementById("specLine"),
  caret:   document.getElementById("panelToggle"),
  caretLbl:document.getElementById("caretLabel")
};

/* --- fold the controls away, so the render gets the whole screen on a phone.
       The class lives on <html>, which lets the CSS also fade the title block
       under the mobile breakpoint. --- */
function setPanelOpen(open) {
  document.documentElement.classList.toggle("hud-min", !open);
  el.caret.setAttribute("aria-expanded", open ? "true" : "false");
  // the visible label is hidden in the open state, so the accessible name
  // has to come from aria-label rather than the button's text
  el.caret.setAttribute("aria-label", open ? "Hide the controls" : "Show the controls");
  el.caret.title = open ? "Hide the controls" : "Show the controls";
}
el.caret.addEventListener("click", () =>
  setPanelOpen(document.documentElement.classList.contains("hud-min")));
setPanelOpen(true);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduceMotion) el.sway.checked = false;

let mood = 0, moodTarget = 0;           // 0 = sunlit/happy, 1 = low battery
let species = "lens", size = "desk", lineup = false;

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

/* --- chip rows --- */
function buildChips(host, items, get, set) {
  host.innerHTML = "";
  items.forEach(it => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.dataset.key = it.key;
    b.textContent = it.label;
    b.title = it.title || it.label;
    b.addEventListener("click", () => set(it.key));
    host.appendChild(b);
  });
  return () => Array.from(host.children).forEach(b =>
    b.classList.toggle("on", b.dataset.key === get()));
}

const syncSpecies = buildChips(el.species,
  SPECIES_ORDER.map(k => ({ key:k, label:SPECIES[k].label, title:SPECIES[k].full })),
  () => species, k => { species = k; refresh(); });

const syncSizes = buildChips(el.sizes,
  SIZE_ORDER.map(k => ({ key:k, label:SIZES[k].label, title:SIZES[k].note })),
  () => size,
  k => { size = k; if (lineup) { lineup = false; el.lineup.checked = false; } refresh(); });

const fmtCm = v => v < 1 ? Math.round(v*100) + " cm" : v.toFixed(2) + " m";

function refresh() {
  syncSpecies(); syncSizes();
  const S = SPECIES[species], g = speciesGeo(species);
  el.species.classList.toggle("muted", lineup);
  el.leafNote.textContent = lineup
    ? "All five leaf modules at desk size on the same body — the blade is the only thing that changes."
    : S.full + " — " + S.note;
  if (lineup) {
    el.spec.textContent = "5 modules  ·  desk size  ·  same base, same stem, same PV area budget";
  } else {
    const sc = SIZES[size].scale;
    el.spec.textContent = "blade " + fmtCm(g.bladeLen * sc)
      + "  ·  height " + fmtCm(g.height * sc)
      + "  ·  PV " + (g.panelArea * sc * sc).toFixed(3) + " m²";
  }
  applyView(lineup ? VIEW.lineup : VIEW[size]);
}

el.lineup.addEventListener("change", () => {
  lineup = el.lineup.checked;
  if (lineup) SPECIES_ORDER.forEach(speciesGeo);   // warm the cache before the first frame
  refresh();
});

/* deep links:  #low  #monstera  #display  #lineup  #min   (comma separated) */
location.hash.replace(/^#/, "").split(/[,+\s]+/).forEach(tok => {
  if (tok === "low") { setMood(1); mood = 1; }
  else if (tok === "lineup") { lineup = true; el.lineup.checked = true; }
  else if (tok === "min") { setPanelOpen(false); }
  else if (SPECIES[tok]) species = tok;
  else if (SIZES[tok]) size = tok;
});
if (lineup) SPECIES_ORDER.forEach(speciesGeo);
refresh();
cam.target = cam.tTarget.slice();
cam.radius = cam.tRadius; cam.phi = cam.tPhi; cam.theta = cam.tTheta;

/* ============================================================
   POSE + DRAW one PlantBot
   ============================================================ */
function poseBot(key, root, m, s, amp) {
  const S = SPECIES[key], g = speciesGeo(key);
  const bodyRoll = 0.014*Math.sin(s*0.47) * amp;
  const bodyYaw  = 0.020*Math.sin(s*0.33 + 1.2) * amp;
  const bodyM = M4.mul(root, M4.trs(0, 0, 0, 0, bodyYaw, bodyRoll, 1));
  const leaves = S.leaves.map((L, i) => {
    const f = amp * L.flutter, p = L.phase;
    const rz = L.rz - L.droop*m + (0.040*Math.sin(s*0.72 + p) + 0.017*Math.sin(s*1.83 + 1.1 + p)) * f;
    const ry = L.ry + 0.030*Math.sin(s*0.51 + 0.4 + p) * f;
    const rx = L.rx + 0.035*Math.sin(s*0.95 + 2.0 + p) * f;
    return { M: M4.mul(bodyM, M4.trs(L.at[0], L.at[1], L.at[2], rx, ry, rz, 1)), L, geo: g.leaves[i] };
  });
  return { S, g, bodyM, leaves, root };
}

/* world position of a point in a leaf's local frame, for placing the LED lights */
function atLeaf(M, p) {
  return [ M[0]*p[0] + M[4]*p[1] + M[8]*p[2]  + M[12],
           M[1]*p[0] + M[5]*p[1] + M[9]*p[2]  + M[13],
           M[2]*p[0] + M[6]*p[1] + M[10]*p[2] + M[14] ];
}

function drawBot(pose, glowCol, glowInt) {
  const { g, bodyM, leaves } = pose;
  draw(G.base, bodyM, BODY);
  draw(G.seam, bodyM, DARK);
  draw(g.stem, bodyM, STEMMAT);
  g.petioles.forEach(p => { if (p) draw(p, bodyM, STEMMAT); });
  draw(G.indicator, M4.mul(bodyM, M4.trs(0, 0.022, 0.0700, 0,0,0, 1)),
       { albedo:[0.05,0.05,0.05], emissive:glowCol, emiStr:2.4*glowInt, rough:0.25 });

  leaves.forEach(({ M, L, geo }) => {
    const gi = glowInt * L.glow;
    const fen = L.fenestrated ? 7 : 0;
    if (geo.rachis) draw(geo.rachis, M, STEMMAT);
    draw(geo.bot, M, { albedo:[0.72,0.75,0.72], rough:0.62, spec:0.05, flag:fen,
                       emissive:glowCol, emiStr:1.05*gi });
    draw(geo.rim, M, { albedo:[0.22,0.24,0.22], rough:0.35, spec:0.10, flag:6,
                       emissive:glowCol, emiStr:2.60*gi, doubleSided:true });
    draw(geo.top, M, { albedo:SHELL.albedo, rough:SHELL.rough, spec:SHELL.spec, trans:0.20, flag:fen });
    if (geo.panel) draw(geo.panel, M, { flag:1, rough:0.16, spec:0.42, doubleSided:true });

    L.ldrs.forEach(d => {
      let local;
      if (L.frond) {
        const p = rachisPath(L.o)(d[0]);
        local = M4.trs(p[0], p[1] + L.o.thickness*0.9, p[2], 0,0,0, 1);
      } else {
        const o = L.o, out = o.outline || lensOutline();
        const hw = o.width * Math.max(0.02, out(d[0]));
        local = M4.trs(d[0]*o.length, -o.bend*d[0]*d[0] + o.thickness*0.5 + 0.004, d[1]*hw*2, 0,0,0, 1);
      }
      const LM = M4.mul(M, local);
      draw(G.ldrStalk, LM, { albedo:[0.30,0.31,0.32], rough:0.5, spec:0.2 });
      draw(G.ldrHead, M4.mul(LM, M4.trs(0,0.011,0,0,0,0,1)),
           { albedo:[0.62,0.58,0.42], rough:0.22, spec:0.45 });
    });
  });
}

function drawFigure(M) {
  draw(G.figTorso, M4.mul(M, M4.trs(0,0,0,0,0,0, 1,1,0.56)), FIGMAT);
  draw(G.figHead,  M4.mul(M, M4.trs(0,1.617,0.004,0,0,0, 0.94,1,0.88)), FIGMAT);
  draw(G.figNeck,  M, FIGMAT);
  draw(G.figArm,   M4.mul(M, M4.trs( 0.182,0,0,0,0,0,1)), FIGMAT);
  draw(G.figArm,   M4.mul(M, M4.trs(-0.182,0,0, 0, Math.PI, 0, 1)), FIGMAT);
  draw(G.figLeg,   M4.mul(M, M4.trs( 0.096,0,0,0,0,0,1)), FIGMAT);
  draw(G.figLeg,   M4.mul(M, M4.trs(-0.096,0,0,0,0,0,1)), FIGMAT);
}

/* ---------- render loop ---------- */
const proj = M4.perspective(32 * Math.PI/180, 1, 0.02, 40);
let t0 = performance.now(), swayPhase = 0, pulsePhase = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
  resize();

  /* --- state easing --- */
  mood += (moodTarget - mood) * (1 - Math.exp(-dt * 2.6));
  const m = smooth(clamp(mood, 0, 1));

  if (el.spin.checked && !dragging) cam.tTheta += dt * 0.13;
  const k  = 1 - Math.exp(-dt * 9);
  const kv = 1 - Math.exp(-dt * 3.4);        // slower easing for size changes
  cam.theta  += (cam.tTheta  - cam.theta)  * k;
  cam.phi    += (cam.tPhi    - cam.phi)    * k;
  cam.radius += (cam.tRadius - cam.radius) * kv;
  for (let i = 0; i < 3; i++) {
    cam.pan[i]    += (cam.tPan[i]    - cam.pan[i])    * k;
    cam.target[i] += (cam.tTarget[i] - cam.target[i]) * kv;
  }

  const tgt = [cam.target[0]+cam.pan[0], cam.target[1]+cam.pan[1], cam.target[2]+cam.pan[2]];
  const eye = [
    tgt[0] + cam.radius * Math.sin(cam.phi) * Math.sin(cam.theta),
    tgt[1] + cam.radius * Math.cos(cam.phi),
    tgt[2] + cam.radius * Math.sin(cam.phi) * Math.cos(cam.theta)
  ];
  const view = M4.lookAt(eye, tgt, [0,1,0]);
  const aspect = W / H;
  proj.set(M4.perspective(32 * Math.PI/180, aspect, 0.02, 40));

  /* --- animation --- */
  if (el.sway.checked) swayPhase += dt * (1 - 0.45*m);
  pulsePhase += dt;   // always advances, so the low-battery breath is independent of sway
  const s = swayPhase;
  const amp = (el.sway.checked ? 1 : 0) * (1 - 0.55*m);

  /* --- who is on stage --- */
  const Z = SIZES[size];
  const bots = [];
  if (lineup) {
    SPECIES_ORDER.forEach((k, i) => {
      bots.push({ key:k, scale:1, pos:[(i-2)*0.285, 0, 0.05], phase:i*1.7, hero:i===2 });
    });
  } else if (size === "desk") {
    bots.push({ key:species, scale:1, pos:SPOT.deskHero, phase:0, hero:true });
  } else if (size === "fan") {
    bots.push({ key:species, scale:1, pos:SPOT.deskRef, phase:2.4, hero:false });
    bots.push({ key:species, scale:Z.scale, pos:SPOT.deskFan, phase:0, hero:true });
  } else {
    bots.push({ key:species, scale:1, pos:SPOT.deskHero, phase:2.4, hero:false });
    bots.push({ key:species, scale:Z.scale, pos:SPOT.bigBot, phase:0, hero:true });
  }
  const P = (lineup || size !== "desk") ? PROP_T.wide : PROP_T.close;

  /* --- pose everything first: the point lights need world positions --- */
  const poses = bots.map(b => ({
    b, pose: poseBot(b.key, M4.trs(b.pos[0], b.pos[1], b.pos[2], 0, 0, 0, b.scale), m, s + b.phase, amp)
  }));

  /* --- mood color & lights --- */
  const glowCol = [0,1,2].map(i => lerp(MOOD.happy[i], MOOD.low[i], m));
  const breathe = 1 + Math.sin(pulsePhase * PULSE_RATE) * PULSE_DEPTH * m;
  const glowInt = (1.0 - 0.42*m) * breathe;
  const sc = i => glowCol[i] * glowInt;

  /* three point lights: the hero gets two, whoever else is on stage gets the third */
  const hero  = poses.find(p => p.b.hero) || poses[0];
  const other = poses.find(p => p !== hero) || hero;
  const hs = hero.b.scale, os = other.b.scale;
  const lampAt = (P0, i) => {
    const Lf = P0.pose.leaves[Math.min(i, P0.pose.leaves.length - 1)];
    return atLeaf(Lf.M, [Lf.L.o.length * 0.52, -0.020, 0]);
  };
  const pl0 = lampAt(hero, 0);
  const pl1 = lampAt(hero, 1);
  const pl2 = [other.pose.root[12], other.pose.root[13] + 0.022*os, other.pose.root[14] + 0.070*os];

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
  gl.uniform3fv(U.uSkyCol, SKY_COL);
  gl.uniform3fv(U.uGndCol, GND_COL);
  gl.uniform1f(U.uAmb, AMBIENT);
  gl.uniform3fv(U.uPL0, pl0);
  gl.uniform3fv(U.uPL1, pl1);
  gl.uniform3fv(U.uPL2, pl2);
  gl.uniform3fv(U.uPC0, [sc(0)*2.30, sc(1)*2.30, sc(2)*2.30]);
  gl.uniform3fv(U.uPC1, [sc(0)*1.55, sc(1)*1.55, sc(2)*1.55]);
  gl.uniform3fv(U.uPC2, [sc(0)*0.30, sc(1)*0.30, sc(2)*0.30]);
  gl.uniform3fv(U.uPR, [0.38*hs, 0.30*hs, 0.10*os]);

  /* room */
  draw(G.sky,   T.sky,   SKYMAT);
  draw(G.wallL, T.wallL, WALLMAT);
  draw(G.wallR, T.wallR, WALLMAT);
  draw(G.wallT, T.wallT, WALLMAT);
  draw(G.wallB, T.wallB, WALLMAT);
  draw(G.wallSide, T.wallSL, WALLMAT);
  draw(G.wallSide, T.wallSR, WALLMAT);
  draw(G.floor, T.floor, FLOORMAT);
  draw(G.frameV, T.fV,  FRAME);
  draw(G.frameH, T.fH,  FRAME);
  draw(G.sill,  T.sill, { albedo:[0.62,0.63,0.61], rough:0.55, spec:0.16 });
  draw(G.desk,  T.desk, DESKMAT);
  draw(G.apron, T.apron, { albedo:[0.205,0.135,0.085], rough:0.70, spec:0.06 });
  draw(G.legL,  T.legL, { albedo:[0.185,0.125,0.080], rough:0.72, spec:0.05 });
  draw(G.legL,  T.legR, { albedo:[0.185,0.125,0.080], rough:0.72, spec:0.05 });

  /* props */
  draw(G.mug,    P.mug,   CERAMIC);
  draw(G.handle, P.hand,  CERAMIC);
  draw(G.book1,  P.book1, BOOKA);
  draw(G.book2,  P.book2, BOOKB);

  /* the family */
  poses.forEach(p => drawBot(p.pose, glowCol, glowInt * (p.b.hero ? 1 : 0.92)));

  /* the detached leaf at fan size: unclipped, unpowered, lying on the desk */
  let fanOn = false;
  if (!lineup && size === "fan") {
    fanOn = true;
    const gg = speciesGeo(species), Lf = gg.leaves[0];
    const fanM = M4.trs(SPOT.fanLeaf[0], SPOT.fanLeaf[1], SPOT.fanLeaf[2], 0.12, -0.78, 0.14, Z.scale);
    const fen = Lf.L.fenestrated ? 7 : 0;
    if (Lf.rachis) draw(Lf.rachis, fanM, STEMMAT);
    draw(Lf.bot, fanM, { albedo:[0.72,0.75,0.72], rough:0.62, spec:0.05, flag:fen });
    draw(Lf.rim, fanM, { albedo:[0.22,0.24,0.22], rough:0.35, spec:0.10, doubleSided:true });
    draw(Lf.top, fanM, { albedo:SHELL.albedo, rough:SHELL.rough, spec:SHELL.spec, trans:0.20, flag:fen });
    if (Lf.panel) draw(Lf.panel, fanM, { flag:1, rough:0.16, spec:0.42, doubleSided:true });
    draw(G.fanGrip, fanM, { albedo:[0.30,0.32,0.31], rough:0.55, spec:0.14 });
  }

  /* the scale figure, at floor and display size */
  const figOn = !lineup && Z.place === "floor";
  if (figOn) drawFigure(M4.trs(SPOT.human[0], SPOT.human[1], SPOT.human[2], 0, -1.35, 0, 1));

  /* contact shadows */
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.disable(gl.CULL_FACE);
  poses.forEach(p => {
    const b = p.b, r = 0.42 * Math.pow(b.scale, 0.92);
    draw(G.shadow, M4.trs(b.pos[0], b.pos[1] + 0.0016, b.pos[2], 0,0,0, r, 1, r),
         { flag:5, alpha:0.62 });
  });
  if (fanOn) draw(G.shadow, M4.trs(SPOT.fanLeaf[0]+0.11, 0.0015, SPOT.fanLeaf[2]-0.05, 0,0,0,
                                   0.34*Z.scale, 1, 0.21*Z.scale), { flag:5, alpha:0.26 });
  if (figOn)  draw(G.shadow, M4.trs(SPOT.human[0], FLOOR+0.0016, SPOT.human[2], 0,0,0, 0.60, 1, 0.44),
                   { flag:5, alpha:0.48 });
  draw(G.shadow, P.shMug,  { flag:5, alpha:0.45 });
  draw(G.shadow, P.shBook, { flag:5, alpha:0.42 });
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
  gl.uniform1f(Uc.uBloomStr, BLOOM);
  gl.uniform1f(Uc.uExposure, EXPOSURE);
  gl.uniform1f(Uc.uGrain, GRAIN);
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
