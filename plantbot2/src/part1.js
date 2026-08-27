/* ============================================================
   PlantBot Desk Study - custom WebGL2 renderer (no dependencies)
   ============================================================ */
"use strict";

/* ---------- tiny math ---------- */
const M4 = {
  id: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
  mul(a, b, out) {
    out = out || new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      const b0=b[c*4], b1=b[c*4+1], b2=b[c*4+2], b3=b[c*4+3];
      out[c*4]   = a[0]*b0 + a[4]*b1 + a[8]*b2  + a[12]*b3;
      out[c*4+1] = a[1]*b0 + a[5]*b1 + a[9]*b2  + a[13]*b3;
      out[c*4+2] = a[2]*b0 + a[6]*b1 + a[10]*b2 + a[14]*b3;
      out[c*4+3] = a[3]*b0 + a[7]*b1 + a[11]*b2 + a[15]*b3;
    }
    return out;
  },
  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
  },
  lookAt(eye, center, up) {
    let z0=eye[0]-center[0], z1=eye[1]-center[1], z2=eye[2]-center[2];
    let l = 1/Math.hypot(z0,z1,z2); z0*=l; z1*=l; z2*=l;
    let x0 = up[1]*z2 - up[2]*z1, x1 = up[2]*z0 - up[0]*z2, x2 = up[0]*z1 - up[1]*z0;
    l = Math.hypot(x0,x1,x2); l = l ? 1/l : 0; x0*=l; x1*=l; x2*=l;
    const y0 = z1*x2 - z2*x1, y1 = z2*x0 - z0*x2, y2 = z0*x1 - z1*x0;
    return new Float32Array([
      x0,y0,z0,0, x1,y1,z1,0, x2,y2,z2,0,
      -(x0*eye[0]+x1*eye[1]+x2*eye[2]),
      -(y0*eye[0]+y1*eye[1]+y2*eye[2]),
      -(z0*eye[0]+z1*eye[1]+z2*eye[2]), 1
    ]);
  },
  trs(tx, ty, tz, rx, ry, rz, sx, sy, sz) {
    sy = sy === undefined ? sx : sy; sz = sz === undefined ? sx : sz;
    const cx=Math.cos(rx), sxr=Math.sin(rx), cy=Math.cos(ry), syr=Math.sin(ry), cz=Math.cos(rz), szr=Math.sin(rz);
    // R = Ry(ry) * Rx(rx) * Rz(rz), written out as rows
    const r00 =  cy*cz + syr*sxr*szr, r01 = -cy*szr + syr*sxr*cz, r02 = syr*cx;
    const r10 =  cx*szr,              r11 =  cx*cz,               r12 = -sxr;
    const r20 = -syr*cz + cy*sxr*szr, r21 =  syr*szr + cy*sxr*cz, r22 = cy*cx;
    // column-major: column 0 is the transformed X axis
    return new Float32Array([
      r00*sx, r10*sx, r20*sx, 0,
      r01*sy, r11*sy, r21*sy, 0,
      r02*sz, r12*sz, r22*sz, 0,
      tx, ty, tz, 1
    ]);
  },
  normalMat(m) {
    // inverse-transpose of upper 3x3, returned as mat3 in 3x vec4 padding-free mat3
    const a00=m[0],a01=m[1],a02=m[2], a10=m[4],a11=m[5],a12=m[6], a20=m[8],a21=m[9],a22=m[10];
    const b01 =  a22*a11 - a12*a21, b11 = -a22*a10 + a12*a20, b21 =  a21*a10 - a11*a20;
    let det = a00*b01 + a01*b11 + a02*b21;
    det = det ? 1/det : 0;
    return new Float32Array([
      b01*det, (-a22*a01 + a02*a21)*det, ( a12*a01 - a02*a11)*det,
      b11*det, ( a22*a00 - a02*a20)*det, (-a12*a00 + a02*a10)*det,
      b21*det, (-a21*a00 + a01*a20)*det, ( a11*a00 - a01*a10)*det
    ]);
  }
};
const clamp = (v,a,b) => v < a ? a : v > b ? b : v;
const lerp  = (a,b,t) => a + (b-a)*t;
const smooth = t => t*t*(3-2*t);
const hex2rgb = h => [parseInt(h.slice(1,3),16)/255, parseInt(h.slice(3,5),16)/255, parseInt(h.slice(5,7),16)/255];

/* ---------- mesh container ---------- */
function Mesh() { this.pos = []; this.nrm = []; this.uv = []; this.idx = []; }
Mesh.prototype.vcount = function () { return this.pos.length / 3; };
Mesh.prototype.push = function (p, n, u) {
  this.pos.push(p[0], p[1], p[2]);
  this.nrm.push(n[0], n[1], n[2]);
  this.uv.push(u[0], u[1]);
};
Mesh.prototype.quad = function (a, b, c, d) { this.idx.push(a,b,c, a,c,d); };

/* ---------- generic parametric surface ---------- */
/* fn(u,v) -> [x,y,z]; builds a (nu+1)x(nv+1) grid, normals by finite difference */
function surface(fn, nu, nv, flip, uv0) {
  const m = new Mesh(), eps = 1e-4;
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    for (let j = 0; j <= nv; j++) {
      const v = j / nv;
      const p  = fn(u, v);
      const pu = fn(clamp(u + eps, 0, 1), v), pv = fn(u, clamp(v + eps, 0, 1));
      const mu = fn(clamp(u - eps, 0, 1), v), mv = fn(u, clamp(v - eps, 0, 1));
      const du = [pu[0]-mu[0], pu[1]-mu[1], pu[2]-mu[2]];
      const dv = [pv[0]-mv[0], pv[1]-mv[1], pv[2]-mv[2]];
      let n = [du[1]*dv[2]-du[2]*dv[1], du[2]*dv[0]-du[0]*dv[2], du[0]*dv[1]-du[1]*dv[0]];
      let L = Math.hypot(n[0],n[1],n[2]) || 1;
      n = [n[0]/L, n[1]/L, n[2]/L];
      if (flip) n = [-n[0],-n[1],-n[2]];
      m.push(p, n, uv0 ? uv0(u,v) : [u, v]);
    }
  }
  const row = nv + 1;
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i*row + j, b = a + 1, c = a + row + 1, d = a + row;
    if (flip) m.quad(a, d, c, b); else m.quad(a, b, c, d);
  }
  return m;
}

/* bake a transform into a copy of a mesh, so several sub-meshes can be merged
   into one buffer (used to assemble the compound fern frond) */
function transformMesh(src, M) {
  const N = M4.normalMat(M), m = new Mesh();
  m.idx = src.idx.slice();
  m.uv  = src.uv.slice();
  for (let i = 0; i < src.pos.length; i += 3) {
    const x = src.pos[i], y = src.pos[i+1], z = src.pos[i+2];
    m.pos.push(M[0]*x + M[4]*y + M[8]*z  + M[12],
               M[1]*x + M[5]*y + M[9]*z  + M[13],
               M[2]*x + M[6]*y + M[10]*z + M[14]);
    const a = src.nrm[i], b = src.nrm[i+1], c = src.nrm[i+2];
    const nx = N[0]*a + N[3]*b + N[6]*c,
          ny = N[1]*a + N[4]*b + N[7]*c,
          nz = N[2]*a + N[5]*b + N[8]*c;
    const L = Math.hypot(nx, ny, nz) || 1;
    m.nrm.push(nx/L, ny/L, nz/L);
  }
  return m;
}

function mergeMesh(target, src) {
  const off = target.vcount();
  for (let i = 0; i < src.pos.length; i++) target.pos.push(src.pos[i]);
  for (let i = 0; i < src.nrm.length; i++) target.nrm.push(src.nrm[i]);
  for (let i = 0; i < src.uv.length; i++)  target.uv.push(src.uv[i]);
  for (let i = 0; i < src.idx.length; i++) target.idx.push(src.idx[i] + off);
  return target;
}

/* ---------- LEAF OUTLINES ----------
   An outline is a function of u (0 at the leaf base, 1 at the tip) returning the
   half-width as a fraction of o.width, peaking at 1. Swapping the outline is what
   turns one blade into a different species.                                    */

/* the original sketch blade: a symmetric lens, pointed at both ends */
function lensOutline(p) {
  const e = p === undefined ? 0.72 : p;
  return u => Math.pow(Math.sin(Math.PI * clamp(u, 0, 1)), e);
}

/* asymmetric ovate blade. a<b puts the widest point below the middle (ficus);
   a>b puts it above (monstera). Normalized so the widest point is exactly 1. */
function betaOutline(a, b) {
  const um = a / (a + b);
  const peak = Math.pow(um, a) * Math.pow(1 - um, b);
  return u => { u = clamp(u, 0, 1); return Math.pow(u, a) * Math.pow(1 - u, b) / peak; };
}

/* cut narrow gorges into an outline - the monstera's split margin.
   cuts: positions along u; depth: 0..1 fraction of the width removed;
   sharp: gorge width in u.                                                 */
function notchOutline(base, cuts, depth, sharp) {
  return u => {
    let n = 0;
    for (let i = 0; i < cuts.length; i++) {
      const d = (u - cuts[i]) / sharp;
      n = Math.max(n, Math.exp(-d * d));
    }
    return base(u) * (1 - depth * n);
  };
}

/* ---------- LEAF ----------
   Local frame: +X along the midrib (base -> tip), +Y is the leaf's "up",
   +Z across the width. Outline from o.outline (defaults to the sketch lens),
   dished across, with a gentle lengthwise arc so the blade curls.          */
function leafSurface(o) {
  const L = o.length, W = o.width, bend = o.bend, tw = o.twist || 0;
  const out = o.outline || lensOutline();
  const dishAt = typeof o.dish === "function" ? o.dish : () => o.dish;
  const bendPow = o.bendPow === undefined ? 2 : o.bendPow;
  const minW = W * 0.014;   // keeps deep notches from collapsing to a zero-area strip
  const halfW = u => Math.max(minW, W * out(u));
  return function (u, vv) {
    const v = vv * 2 - 1;            // -1 .. 1 across
    const hw = halfW(u);
    const arc = -bend * Math.pow(clamp(u, 0, 1), bendPow);   // tip curls
    const twist = tw * u;
    const y0 = arc + dishAt(u) * v * v * hw;
    const z0 = v * hw;
    // roll the cross-section slightly with the twist
    const y = y0 * Math.cos(twist) - z0 * Math.sin(twist);
    const z = y0 * Math.sin(twist) + z0 * Math.cos(twist);
    return [u * L, y, z];
  };
}

/* solid leaf: top shell, bottom shell, and the rim strip between them */
function buildLeaf(o) {
  const base = leafSurface(o), t = o.thickness, nu = o.nu || 34, nv = o.nv || 16;
  const eps = 1e-3;
  function normalAt(u, v) {
    const p = base(u,v);
    const du = [], dv = [];
    const pu = base(clamp(u+eps,0,1), v), mu = base(clamp(u-eps,0,1), v);
    const pv = base(u, clamp(v+eps,0,1)), mv = base(u, clamp(v-eps,0,1));
    for (let i = 0; i < 3; i++) { du[i] = pu[i]-mu[i]; dv[i] = pv[i]-mv[i]; }
    let n = [du[1]*dv[2]-du[2]*dv[1], du[2]*dv[0]-du[0]*dv[2], du[0]*dv[1]-du[1]*dv[0]];
    const Ln = Math.hypot(n[0],n[1],n[2]) || 1;
    return [n[0]/Ln, n[1]/Ln, n[2]/Ln];
  }
  // taper the thickness toward tip and edges so it reads like a molded shell
  const th = (u, v) => t * (0.35 + 0.65 * Math.sin(Math.PI*clamp(u,0,1))) * (0.45 + 0.55 * Math.sin(Math.PI*clamp(v,0,1)));
  const off = s => (u, v) => {
    const p = base(u, v), n = normalAt(u, v), d = th(u, v) * 0.5 * s;
    return [p[0]+n[0]*d, p[1]+n[1]*d, p[2]+n[2]*d];
  };
  // the parametric normal points downward, so the upper shell is the -normal offset
  const top    = surface(off(-1), nu, nv, true);
  const bottom = surface(off(+1), nu, nv, false);

  // rim: follow the v=0 and v=1 boundaries, joining top and bottom offsets
  const rim = new Mesh();
  [0, 1].forEach((vEdge, side) => {
    const fT = off(-1), fB = off(+1);
    const start = rim.vcount();
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const pt = fT(u, vEdge), pb = fB(u, vEdge);
      let n = normalAt(u, vEdge);
      // outward-ish rim normal: cross of the edge tangent with the surface normal
      const a = fT(clamp(u+eps,0,1), vEdge), b = fT(clamp(u-eps,0,1), vEdge);
      const tg = [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
      let rn = [tg[1]*n[2]-tg[2]*n[1], tg[2]*n[0]-tg[0]*n[2], tg[0]*n[1]-tg[1]*n[0]];
      const Lr = Math.hypot(rn[0],rn[1],rn[2]) || 1;
      rn = [rn[0]/Lr, rn[1]/Lr, rn[2]/Lr];
      if (side === 1) rn = [-rn[0],-rn[1],-rn[2]];
      rim.push(pt, rn, [u, 0]);
      rim.push(pb, rn, [u, 1]);
    }
    for (let i = 0; i < nu; i++) {
      const a = start + i*2, b = a+1, c = a+3, d = a+2;
      if (side === 0) rim.quad(a, b, c, d); else rim.quad(a, d, c, b);
    }
  });
  return { top, bottom, rim, surf: base, normalAt };
}

/* a thin conforming panel that sits just above a leaf's top shell */
function buildPanelOnLeaf(o, u0, u1, vSpan, lift) {
  const base = leafSurface(o), eps = 1e-3;
  function n_at(u,v){
    const pu = base(clamp(u+eps,0,1),v), mu = base(clamp(u-eps,0,1),v);
    const pv = base(u,clamp(v+eps,0,1)), mv = base(u,clamp(v-eps,0,1));
    const du=[pu[0]-mu[0],pu[1]-mu[1],pu[2]-mu[2]], dv=[pv[0]-mv[0],pv[1]-mv[1],pv[2]-mv[2]];
    let n=[du[1]*dv[2]-du[2]*dv[1], du[2]*dv[0]-du[0]*dv[2], du[0]*dv[1]-du[1]*dv[0]];
    const L=Math.hypot(n[0],n[1],n[2])||1; return [n[0]/L,n[1]/L,n[2]/L];
  }
  const f = (a, b) => {
    const u = lerp(u0, u1, a);
    const v = 0.5 + (b - 0.5) * vSpan;
    const p = base(u, v), n = n_at(u, v);
    return [p[0]+n[0]*lift, p[1]+n[1]*lift, p[2]+n[2]*lift];
  };
  return surface(f, 26, 10, false, (a,b) => [a, b]);
}

/* ---------- COMPOUND LEAF ----------
   Merge several blades, each with its own local transform, into one top /
   bottom / rim buffer set. A fern frond is ~22 little blades on a rachis, and
   drawing them as one mesh keeps it to the same three draw calls as a simple leaf. */
function buildCompound(parts) {
  const top = new Mesh(), bottom = new Mesh(), rim = new Mesh();
  parts.forEach(p => {
    const L = buildLeaf(p.o);
    mergeMesh(top,    p.M ? transformMesh(L.top, p.M)    : L.top);
    mergeMesh(bottom, p.M ? transformMesh(L.bottom, p.M) : L.bottom);
    mergeMesh(rim,    p.M ? transformMesh(L.rim, p.M)    : L.rim);
  });
  return { top, bottom, rim };
}

/* the rachis (central stalk) of a pinnate frond, arcing like a leaf midrib */
function rachisPath(o) {
  return u => [u * o.length, -o.bend * u * u, 0];
}

/* a pinnate frond: pairs of leaflets down an arcing rachis, shrinking and
   folding forward toward the tip. Returns parts for buildCompound.        */
function frondParts(o) {
  const parts = [], n = o.pairs || 11, arc = rachisPath(o);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const u = lerp(0.12, 0.95, t);
    // leaflets are longest about a third of the way up, shortest at the tip
    const Lp = o.length * o.pinna * (0.34 + 0.72 * Math.sin(Math.PI * Math.pow(t, 0.62)));
    const po = {
      length: Lp, width: Lp * 0.26, bend: Lp * 0.22, dish: 0.20, twist: 0.06,
      thickness: o.thickness * 0.62, nu: 12, nv: 7, outline: lensOutline(0.52)
    };
    const p = arc(u);
    const sweep = lerp(1.16, 0.58, t);     // splayed at the base, swept forward at the tip
    [1, -1].forEach(side => {
      const du = side > 0 ? 0 : 0.030;     // alternate rather than strictly opposite
      const q = arc(clamp(u + du, 0, 1));
      parts.push({ o: po, M: M4.trs(q[0], q[1] + 0.0012, p[2],
                                    side * 0.24, side * sweep, 0.18 - 0.13 * t, 1) });
    });
  }
  return parts;
}

/* a slim PV ribbon running along the top of a rachis */
function rachisPanel(o) {
  const arc = rachisPath(o);
  return surface((a, b) => {
    const u = lerp(0.10, 0.90, a);
    const p = arc(u);
    const w = o.width * 0.34 * Math.sin(Math.PI * Math.pow(a, 0.45));
    return [p[0], p[1] + o.thickness * 0.55, (b - 0.5) * 2 * w];
  }, 28, 6, true, (a, b) => [a, b]);
}

/* ---------- primitives ---------- */
function lathe(profile, seg, uvScale) {
  // profile: [[r,y], ...] from top to bottom
  const n = profile.length;
  return surface((u, v) => {
    const fi = u * (n - 1), i = Math.min(n - 2, Math.floor(fi)), f = fi - i;
    const r = lerp(profile[i][0], profile[i+1][0], f);
    const y = lerp(profile[i][1], profile[i+1][1], f);
    const a = v * Math.PI * 2;
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  }, n * 6, seg, false, (u,v) => [v * (uvScale||1), u]);
}

function tube(pathFn, radFn, nu, nv) {
  const eps = 1e-3;
  return surface((u, v) => {
    const c = pathFn(u);
    const a = pathFn(clamp(u+eps,0,1)), b = pathFn(clamp(u-eps,0,1));
    let t = [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
    const L = Math.hypot(t[0],t[1],t[2]) || 1; t = [t[0]/L,t[1]/L,t[2]/L];
    let up = Math.abs(t[1]) > 0.92 ? [1,0,0] : [0,1,0];
    let n1 = [up[1]*t[2]-up[2]*t[1], up[2]*t[0]-up[0]*t[2], up[0]*t[1]-up[1]*t[0]];
    let L1 = Math.hypot(n1[0],n1[1],n1[2]) || 1; n1 = [n1[0]/L1,n1[1]/L1,n1[2]/L1];
    const n2 = [t[1]*n1[2]-t[2]*n1[1], t[2]*n1[0]-t[0]*n1[2], t[0]*n1[1]-t[1]*n1[0]];
    const ang = v * Math.PI * 2, r = radFn(u);
    return [
      c[0] + (n1[0]*Math.cos(ang) + n2[0]*Math.sin(ang)) * r,
      c[1] + (n1[1]*Math.cos(ang) + n2[1]*Math.sin(ang)) * r,
      c[2] + (n1[2]*Math.cos(ang) + n2[2]*Math.sin(ang)) * r
    ];
  }, nu, nv);
}

function boxMesh(w, h, d, r) {
  // rounded box via a squircle-ish superellipsoid when r>0, plain box otherwise
  const m = new Mesh();
  const faces = [
    { n:[0,0,1],  o:[0,0,d/2],  a:[w/2,0,0], b:[0,h/2,0] },
    { n:[0,0,-1], o:[0,0,-d/2], a:[-w/2,0,0],b:[0,h/2,0] },
    { n:[1,0,0],  o:[w/2,0,0],  a:[0,0,-d/2],b:[0,h/2,0] },
    { n:[-1,0,0], o:[-w/2,0,0], a:[0,0,d/2], b:[0,h/2,0] },
    { n:[0,1,0],  o:[0,h/2,0],  a:[w/2,0,0], b:[0,0,-d/2] },
    { n:[0,-1,0], o:[0,-h/2,0], a:[w/2,0,0], b:[0,0,d/2] }
  ];
  faces.forEach(f => {
    const s = m.vcount();
    [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(c => {
      m.push([f.o[0]+f.a[0]*c[0]+f.b[0]*c[1], f.o[1]+f.a[1]*c[0]+f.b[1]*c[1], f.o[2]+f.a[2]*c[0]+f.b[2]*c[1]],
             f.n, [(c[0]+1)/2, (c[1]+1)/2]);
    });
    m.quad(s, s+1, s+2, s+3);
  });
  return m;
}

function sphereMesh(r, nu, nv) {
  return surface((u, v) => {
    const phi = u * Math.PI, th = v * Math.PI * 2;
    return [Math.sin(phi)*Math.cos(th)*r, Math.cos(phi)*r, Math.sin(phi)*Math.sin(th)*r];
  }, nu, nv);
}

function planeMesh(w, d) {
  const m = new Mesh();
  [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(c => m.push([c[0]*w/2, 0, c[1]*d/2], [0,1,0], [(c[0]+1)/2,(c[1]+1)/2]));
  m.quad(0,1,2,3);
  return m;
}

function torusArc(R, r, arc, start, nu, nv) {
  return surface((u, v) => {
    const a = start + u * arc, b = v * Math.PI * 2;
    const cx = Math.cos(a) * (R + r*Math.cos(b)), cy = Math.sin(a) * (R + r*Math.cos(b));
    return [cx, cy, r * Math.sin(b)];
  }, nu, nv);
}
