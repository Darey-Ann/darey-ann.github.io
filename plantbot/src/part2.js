
/* ============================================================
   Renderer
   ============================================================ */
const VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec2 aUV;
uniform mat4 uProj, uView, uModel;
uniform mat3 uNrmMat;
out vec3 vWorld; out vec3 vNormal; out vec2 vUV;
void main(){
  vec4 wp = uModel * vec4(aPos,1.0);
  vWorld = wp.xyz;
  vNormal = uNrmMat * aNrm;
  vUV = aUV;
  gl_Position = uProj * uView * wp;
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vWorld; in vec3 vNormal; in vec2 vUV;
layout(location=0) out vec4 oColor;
layout(location=1) out vec4 oGlow;

uniform vec3 uAlbedo, uEmissive;
uniform float uEmiStr, uRough, uSpec, uAlpha, uTrans;
uniform int  uFlag;              // 0 std, 1 solar panel, 2 sky, 3 wood, 4 wall, 5 shadow blob, 6 LED rim
uniform vec3 uCamPos;
uniform vec3 uSunDir, uSunColor;
uniform vec3 uSkyCol, uGndCol;
uniform float uAmb;
uniform vec3 uPL0, uPL1, uPL2;       // point light positions
uniform vec3 uPC0, uPC1, uPC2;       // colours * intensity
uniform vec3 uPR;                     // radii

vec3 pointLight(vec3 P, vec3 C, float R, vec3 N, vec3 W, vec3 V, float rough){
  vec3 d = P - W; float dist = length(d);
  if (dist < 1e-4 || R < 1e-4) return vec3(0.0);
  vec3 L = d / dist;
  float atten = 1.0 / (1.0 + (dist*dist)/(R*R));
  atten *= smoothstep(R*2.4, R*0.15, dist);
  float ndl = max(dot(N,L), 0.0);
  float wrap = (ndl + 0.35) / 1.35;             // soft falloff, reads like bounced LED light
  vec3 H = normalize(L+V);
  float sp = pow(max(dot(N,H),0.0), mix(6.0, 90.0, 1.0-rough)) * (1.0-rough) * 0.5;
  return C * atten * (wrap*0.85 + sp);
}

void main(){
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorld);
  if (!gl_FrontFacing) N = -N;
  vec3 albedo = uAlbedo;
  float rough = uRough;

  if (uFlag == 5) {                                  // contact shadow blob
    float r = length(vUV - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.15, 1.0, r)) * uAlpha;
    oColor = vec4(0.0, 0.0, 0.0, a);
    oGlow  = vec4(0.0);
    return;
  }
  if (uFlag == 2) {                                  // window sky
    float h = clamp(vUV.y, 0.0, 1.0);
    vec3 sky = mix(vec3(1.05,0.86,0.60), vec3(0.46,0.62,0.86), pow(h,0.70));
    float haze = smoothstep(0.55, 0.0, h);
    sky = mix(sky, vec3(1.18,0.98,0.70), haze*0.65);
    oColor = vec4(sky, 1.0);
    oGlow  = vec4(sky * 0.20, 1.0);                  // window blooms gently
    return;
  }
  if (uFlag == 1) {                                  // photovoltaic cells
    float cells = smoothstep(0.02, 0.06, abs(fract(vUV.x*7.0)-0.5)*2.0 - 0.72);
    float bus   = smoothstep(0.03, 0.0, abs(vUV.y-0.5)-0.008);
    albedo = mix(vec3(0.030,0.043,0.070), vec3(0.075,0.092,0.125), cells);
    albedo = mix(albedo, vec3(0.42,0.44,0.48), bus*0.55);
    rough = 0.16;
  }
  if (uFlag == 3) {                                  // desk timber
    float g = sin(vUV.y*118.0 + sin(vUV.x*7.0)*2.6)*0.5+0.5;
    float g2 = sin(vUV.y*31.0 + 1.7)*0.5+0.5;
    albedo *= 0.86 + 0.14*g*0.5 + 0.10*g2;
  }
  if (uFlag == 4) {                                  // wall paint, lit unevenly from the window
    albedo *= 0.94 + 0.10 * smoothstep(-0.4, 1.4, vWorld.y);
  }

  // --- hemisphere ambient ---
  vec3 col = albedo * mix(uGndCol, uSkyCol, N.y*0.5+0.5) * uAmb;

  // --- key light (window sun) ---
  vec3 L = normalize(uSunDir);
  float ndl = max(dot(N,L), 0.0);
  col += albedo * uSunColor * ndl;
  vec3 H = normalize(L+V);
  col += uSunColor * pow(max(dot(N,H),0.0), mix(8.0, 128.0, 1.0-rough)) * uSpec;

  // --- translucency: light bleeding through the leaf blades ---
  if (uTrans > 0.0) {
    float back = pow(max(dot(V, -L), 0.0), 2.2);
    float thin = 1.0 - abs(dot(N, V)) * 0.45;
    col += albedo * uSunColor * back * thin * uTrans;
  }

  // --- LED point lights ---
  col += albedo * pointLight(uPL0, uPC0, uPR.x, N, vWorld, V, rough);
  col += albedo * pointLight(uPL1, uPC1, uPR.y, N, vWorld, V, rough);
  col += albedo * pointLight(uPL2, uPC2, uPR.z, N, vWorld, V, rough);

  // --- emission ---
  float emiMask = 1.0;
  if (uFlag == 6) emiMask = smoothstep(0.30, 0.92, vUV.y);   // LED tape sits on the underside of the rim only
  vec3 emi = uEmissive * uEmiStr * emiMask;
  col += emi;

  // fresnel sheen keeps the moulded plastic reading as a surface at grazing angles
  float fres = pow(1.0 - max(dot(N,V),0.0), 4.0);
  col += vec3(0.16,0.19,0.20) * fres * (1.0 - rough) * 0.5;

  oColor = vec4(col, uAlpha);
  oGlow  = vec4(emi, 1.0);
}`;

const QUAD_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aP;
out vec2 vUV;
void main(){ vUV = aP*0.5+0.5; gl_Position = vec4(aP,0.0,1.0); }`;

const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 o;
uniform sampler2D uTex; uniform vec2 uDir;
void main(){
  float w[5]; w[0]=0.2270; w[1]=0.1946; w[2]=0.1216; w[3]=0.0540; w[4]=0.0162;
  vec3 s = texture(uTex, vUV).rgb * w[0];
  for (int i=1;i<5;i++){
    vec2 d = uDir * float(i) * 1.32;
    s += texture(uTex, vUV + d).rgb * w[i];
    s += texture(uTex, vUV - d).rgb * w[i];
  }
  o = vec4(s,1.0);
}`;

const COMP_FS = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 o;
uniform sampler2D uScene, uBloom;
uniform float uBloomStr, uExposure, uGrain, uTime;

vec3 aces(vec3 x){
  const float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
}
void main(){
  vec3 c = texture(uScene, vUV).rgb;
  vec3 b = texture(uBloom, vUV).rgb;
  c += b * uBloomStr;
  c *= uExposure;
  c = aces(c);
  // vignette
  vec2 q = vUV - 0.5;
  c *= 1.0 - dot(q,q) * 0.62;
  // film grain, keeps large flat areas from banding
  float n = fract(sin(dot(vUV*vec2(1971.0,3571.0), vec2(12.9898,78.233)))*43758.5453);
  c += (n - 0.5) * uGrain;
  o = vec4(pow(max(c,0.0), vec3(1.0/2.2)), 1.0);
}`;

/* ---------- gl helpers ---------- */
function makeProgram(gl, vs, fs) {
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + "\n" + src);
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}
function uniforms(gl, prog, names) {
  const u = {}; names.forEach(n => u[n] = gl.getUniformLocation(prog, n)); return u;
}
function uploadMesh(gl, mesh) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = (data, loc, size) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  };
  buf(mesh.pos, 0, 3); buf(mesh.nrm, 1, 3); buf(mesh.uv, 2, 2);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(mesh.idx), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, count: mesh.idx.length };
}
