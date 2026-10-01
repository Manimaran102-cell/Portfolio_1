/* ==========================================================================
   KMGL â€” a tiny, dependency-free WebGL renderer for this portfolio.
   No CDN, no bundler, no build step. Works from file:// and from GitHub Pages.

   Two scenes share one GL context and one animation loop:
     "core"    animated displaced icosphere + orbital rings + particle field
     "network" skill constellation: hubs, skill nodes and connection lines

   Shaders are GLSL ES 1.00 so a single source runs on WebGL1 and WebGL2.
   Normals are derived with finite differences in the vertex shader, so no
   derivative extension is required.
   ========================================================================== */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ math */

  var M4 = {
    create: function () {
      return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    },
    perspective: function (out, fovy, aspect, near, far) {
      var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
      out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
      out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
      out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;
      return out;
    },
    lookAt: function (out, eye, center, up) {
      var z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
      var l = 1 / Math.hypot(z0, z1, z2);
      z0 *= l; z1 *= l; z2 *= l;
      var x0 = up[1] * z2 - up[2] * z1,
          x1 = up[2] * z0 - up[0] * z2,
          x2 = up[0] * z1 - up[1] * z0;
      l = Math.hypot(x0, x1, x2);
      if (l) { l = 1 / l; x0 *= l; x1 *= l; x2 *= l; } else { x0 = 1; x1 = 0; x2 = 0; }
      var y0 = z1 * x2 - z2 * x1,
          y1 = z2 * x0 - z0 * x2,
          y2 = z0 * x1 - z1 * x0;
      out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
      out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
      out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
      out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
      out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
      out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
      out[15] = 1;
      return out;
    },
    /* rotation order: Y (yaw) then X (pitch), then uniform scale */
    compose: function (out, yaw, pitch, scale) {
      var cy = Math.cos(yaw), sy = Math.sin(yaw);
      var cx = Math.cos(pitch), sx = Math.sin(pitch);
      out[0] = cy * scale;        out[1] = 0;   out[2] = -sy * scale;       out[3] = 0;
      out[4] = sy * sx * scale;   out[5] = cx * scale; out[6] = cy * sx * scale; out[7] = 0;
      out[8] = sy * cx * scale;   out[9] = -sx * scale; out[10] = cy * cx * scale; out[11] = 0;
      out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
      return out;
    },
    normalMat3: function (out9, m) {
      out9[0] = m[0]; out9[1] = m[1]; out9[2] = m[2];
      out9[3] = m[4]; out9[4] = m[5]; out9[5] = m[6];
      out9[6] = m[8]; out9[7] = m[9]; out9[8] = m[10];
      return out9;
    }
  };

  /* -------------------------------------------------------------- geometry */

  function normalize3(v) {
    var l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  function icosphere(subdiv) {
    var t = (1 + Math.sqrt(5)) / 2;
    var verts = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
    ].map(normalize3);
    var faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
    ];
    for (var s = 0; s < subdiv; s++) {
      var cache = Object.create(null), next = [];
      function mid(a, b) {
        var key = a < b ? a + '_' + b : b + '_' + a;
        if (cache[key] !== undefined) return cache[key];
        var va = verts[a], vb = verts[b];
        verts.push(normalize3([va[0] + vb[0], va[1] + vb[1], va[2] + vb[2]]));
        var idx = verts.length - 1;
        cache[key] = idx;
        return idx;
      }
      for (var f = 0; f < faces.length; f++) {
        var F = faces[f];
        var a = mid(F[0], F[1]), b = mid(F[1], F[2]), c = mid(F[2], F[0]);
        next.push([F[0], a, c], [F[1], b, a], [F[2], c, b], [a, b, c]);
      }
      faces = next;
    }
    var pos = new Float32Array(verts.length * 3);
    for (var i = 0; i < verts.length; i++) {
      pos[i * 3] = verts[i][0]; pos[i * 3 + 1] = verts[i][1]; pos[i * 3 + 2] = verts[i][2];
    }
    var Idx = verts.length > 65535 ? new Uint32Array(faces.length * 3) : new Uint16Array(faces.length * 3);
    for (var j = 0; j < faces.length; j++) {
      Idx[j * 3] = faces[j][0]; Idx[j * 3 + 1] = faces[j][1]; Idx[j * 3 + 2] = faces[j][2];
    }
    return { positions: pos, indices: Idx, count: Idx.length };
  }

  function circleLoop(segments, radius) {
    var a = new Float32Array(segments * 3);
    for (var i = 0; i < segments; i++) {
      var th = (i / segments) * Math.PI * 2;
      a[i * 3] = Math.cos(th) * radius;
      a[i * 3 + 1] = 0;
      a[i * 3 + 2] = Math.sin(th) * radius;
    }
    return a;
  }

  /* points scattered through a spherical shell */
  function particleField(count, innerR, outerR) {
    var pos = new Float32Array(count * 3);
    var rnd = new Float32Array(count * 4);
    for (var i = 0; i < count; i++) {
      var u = Math.random(), v = Math.random();
      var th = u * Math.PI * 2, ph = Math.acos(2 * v - 1);
      var r = innerR + Math.pow(Math.random(), 0.65) * (outerR - innerR);
      var sp = Math.sin(ph);
      pos[i * 3] = sp * Math.cos(th) * r;
      pos[i * 3 + 1] = Math.cos(ph) * r * 0.72;
      pos[i * 3 + 2] = sp * Math.sin(th) * r;
      rnd[i * 4] = Math.random() * 6.283;
      rnd[i * 4 + 1] = 0.12 + Math.random() * 0.5;
      rnd[i * 4 + 2] = 0.45 + Math.pow(Math.random(), 2.1) * 1.75;
      rnd[i * 4 + 3] = Math.random();
    }
    return { positions: pos, rnd: rnd };
  }

  /* ---------------------------------------------------------------- shaders */

  var NOISE = [
    'float hash31(vec3 p){',
    '  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));',
    '  p *= 17.0;',
    '  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));',
    '}',
    'float vnoise(vec3 x){',
    '  vec3 i = floor(x), f = fract(x);',
    '  f = f * f * (3.0 - 2.0 * f);',
    '  float a = mix(mix(hash31(i), hash31(i + vec3(1.0,0.0,0.0)), f.x),',
    '                mix(hash31(i + vec3(0.0,1.0,0.0)), hash31(i + vec3(1.0,1.0,0.0)), f.x), f.y);',
    '  float b = mix(mix(hash31(i + vec3(0.0,0.0,1.0)), hash31(i + vec3(1.0,0.0,1.0)), f.x),',
    '                mix(hash31(i + vec3(0.0,1.0,1.0)), hash31(i + vec3(1.0,1.0,1.0)), f.x), f.y);',
    '  return mix(a, b, f.z);',
    '}',
    'float fbm(vec3 p){',
    '  float a = 0.5, s = 0.0;',
    '  for (int i = 0; i < 4; i++){ s += a * vnoise(p); p *= 2.04; a *= 0.5; }',
    '  return s;',
    '}'
  ].join('\n');

  /* --- scene: displaced icosphere --------------------------------------- */

  var CORE_VS = [
    'precision highp float;',
    'attribute vec3 aPos;',
    'uniform mat4 uProj, uView, uModel;',
    'uniform mat3 uNormal;',
    'uniform float uTime, uAmp, uRadius, uSpin;',
    'varying vec3 vN, vW;',
    'varying float vD;',
    NOISE,
    'vec3 surface(vec3 dir, float t){',
    '  float d = fbm(dir * 1.85 + vec3(0.0, 0.0, t * 0.16)) * 2.0 - 1.0;',
    '  d += (fbm(dir * 4.6 - vec3(t * 0.09)) - 0.5) * 0.34;',
    '  return dir * (uRadius + d * uAmp);',
    '}',
    'void main(){',
    '  vec3 dir = normalize(aPos);',
    '  float ca = cos(uSpin), sa = sin(uSpin);',
    '  dir = vec3(dir.x * ca - dir.z * sa, dir.y, dir.x * sa + dir.z * ca);',
    '  vec3 p0 = surface(dir, uTime);',
    '  vec3 up = abs(dir.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);',
    '  vec3 t1 = normalize(cross(up, dir));',
    '  vec3 t2 = cross(dir, t1);',
    '  float e = 0.045;',
    '  vec3 p1 = surface(normalize(dir + t1 * e), uTime);',
    '  vec3 p2 = surface(normalize(dir + t2 * e), uTime);',
    '  vec3 n = normalize(cross(p1 - p0, p2 - p0));',
    '  vec4 wp = uModel * vec4(p0, 1.0);',
    '  vW = wp.xyz;',
    '  vN = uNormal * n;',
    '  vD = (length(p0) - uRadius) / max(uAmp, 0.0001);',
    '  gl_Position = uProj * uView * wp;',
    '}'
  ].join('\n');

  var CORE_FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec3 vN, vW;',
    'varying float vD;',
    'uniform vec3 uCam;',
    'uniform float uTime, uOpacity, uHue, uEnergy;',
    'void main(){',
    '  vec3 N = normalize(vN);',
    '  vec3 V = normalize(uCam - vW);',
    '  if (!gl_FrontFacing) N = -N;',
    '  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.7);',
    '  vec3 L1 = normalize(vec3(0.55, 0.78, 0.42));',
    '  vec3 L2 = normalize(vec3(-0.72, -0.22, 0.52));',
    '  float d1 = max(dot(N, L1), 0.0);',
    '  float d2 = max(dot(N, L2), 0.0);',
    '  vec3 H = normalize(L1 + V);',
    '  float spec = pow(max(dot(N, H), 0.0), 46.0);',
    '  vec3 cA = vec3(0.34, 0.25, 0.98);',
    '  vec3 cB = vec3(0.00, 0.87, 0.76);',
    '  vec3 cC = vec3(1.00, 0.34, 0.56);',
    '  float h = fract(0.56 + vD * 0.30 + fres * 0.46 + uHue);',
    '  vec3 base = mix(cA, cB, smoothstep(0.0, 0.52, h));',
    '  base = mix(base, cC, smoothstep(0.52, 1.0, h));',
    '  vec3 col = base * (0.09 + d1 * 0.62 + d2 * 0.20);',
    '  col += cB * spec * 0.95;',
    '  col += mix(cC, cB, 0.45) * fres * 0.72;',
    '  float band = smoothstep(0.40, 0.50, abs(fract(vD * 2.6 + uTime * 0.10) - 0.5));',
    '  col += cB * band * 0.11;',
    '  col *= mix(0.55, 1.0, uEnergy);',
    '  gl_FragColor = vec4(col, uOpacity);',
    '}'
  ].join('\n');

  /* --- generic additive point field -------------------------------------- */

  var DUST_VS = [
    'precision highp float;',
    'attribute vec3 aPos;',
    'attribute vec4 aRnd;',
    'uniform mat4 uProj, uView, uModel;',
    'uniform float uTime, uSize, uDpr, uOpacity;',
    'varying float vTint, vA;',
    'void main(){',
    '  float t = uTime * aRnd.y;',
    '  vec3 p = aPos;',
    '  p.x += sin(t + aRnd.x) * 0.18;',
    '  p.y += cos(t * 0.83 + aRnd.x * 1.7) * 0.18;',
    '  p.z += sin(t * 0.61 + aRnd.x * 2.3) * 0.18;',
    '  vec4 mv = uView * uModel * vec4(p, 1.0);',
    '  gl_Position = uProj * mv;',
    '  float dist = max(-mv.z, 0.35);',
    '  gl_PointSize = clamp(uSize * aRnd.z * uDpr / dist, 1.0, 42.0);',
    '  vTint = aRnd.w;',
    '  vA = uOpacity * smoothstep(0.0, 1.0, clamp(1.75 - dist * 0.15, 0.0, 1.0));',
    '}'
  ].join('\n');

  var DUST_FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying float vTint, vA;',
    'void main(){',
    '  vec2 c = gl_PointCoord - 0.5;',
    '  float r = length(c) * 2.0;',
    '  if (r > 1.0) discard;',
    '  float a = pow(1.0 - r, 1.9);',
    '  vec3 col = mix(vec3(0.10, 0.88, 0.80), vec3(0.62, 0.40, 1.0), vTint);',
    '  col = mix(col, vec3(1.0, 0.46, 0.60), smoothstep(0.78, 1.0, vTint) * 0.65);',
    '  gl_FragColor = vec4(col, a * vA);',
    '}'
  ].join('\n');

  /* --- generic coloured lines (rings + constellation edges) --------------- */

  var LINE_VS = [
    'precision highp float;',
    'attribute vec3 aPos;',
    'attribute vec4 aCol;',
    'uniform mat4 uProj, uView, uModel;',
    'varying vec4 vCol;',
    'void main(){',
    '  gl_Position = uProj * uView * uModel * vec4(aPos, 1.0);',
    '  vCol = aCol;',
    '}'
  ].join('\n');

  var LINE_FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec4 vCol;',
    'uniform float uAlpha;',
    'void main(){ gl_FragColor = vec4(vCol.rgb, vCol.a * uAlpha); }'
  ].join('\n');

  /* --- constellation nodes ------------------------------------------------ */

  var NODE_VS = [
    'precision highp float;',
    'attribute vec3 aPos;',
    'attribute vec3 aCol;',
    'attribute vec2 aMeta;',   /* x = highlight 0..1, y = base size */
    'uniform mat4 uProj, uView, uModel;',
    'uniform float uTime, uSize, uDpr, uOpacity;',
    'varying vec3 vCol;',
    'varying float vHi, vA;',
    'void main(){',
    '  vec3 p = aPos;',
    '  float ph = aPos.x * 2.1 + aPos.y * 1.3 + aPos.z * 0.7;',
    '  p += 0.09 * vec3(sin(uTime * 0.7 + ph), cos(uTime * 0.63 + ph * 1.4), sin(uTime * 0.51 + ph * 0.8));',
    '  vec4 mv = uView * uModel * vec4(p, 1.0);',
    '  gl_Position = uProj * mv;',
    '  float dist = max(-mv.z, 0.35);',
    '  float hi = aMeta.x;',
    '  gl_PointSize = clamp(uSize * aMeta.y * (1.0 + hi * 1.35) * uDpr / dist, 2.0, 90.0);',
    '  vCol = aCol;',
    '  vHi = hi;',
    '  vA = uOpacity * (0.55 + hi * 0.45) * smoothstep(0.0, 1.0, clamp(2.0 - dist * 0.12, 0.0, 1.0));',
    '}'
  ].join('\n');

  var NODE_FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec3 vCol;',
    'varying float vHi, vA;',
    'void main(){',
    '  vec2 c = gl_PointCoord - 0.5;',
    '  float r = length(c) * 2.0;',
    '  if (r > 1.0) discard;',
    '  float core = pow(1.0 - r, 2.4);',
    '  float halo = pow(1.0 - r, 0.85) * 0.42;',
    '  float a = (core + halo) * vA;',
    '  vec3 col = mix(vCol, vec3(1.0), vHi * 0.55);',
    '  gl_FragColor = vec4(col * (1.0 + vHi * 0.7), a);',
    '}'
  ].join('\n');

  /* --- scene 2: aurora (fullscreen fragment shader) ------------------------ */

  /* A single full-screen triangle. No matrices, no geometry, no depth — the
     whole effect is a fragment shader, so it costs one cheap pass per frame
     instead of thousands of primitives. */
  var AURORA_VS = [
    'precision highp float;',
    'attribute vec2 aPos;',
    'varying vec2 vUv;',
    'void main(){',
    '  vUv = aPos * 0.5 + 0.5;',
    '  gl_Position = vec4(aPos, 0.0, 1.0);',
    '}'
  ].join('\n');

  var AURORA_FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec2 vUv;',
    'uniform float uTime, uOpacity, uAspect;',
    'uniform vec2 uPointer;',
    '',
    'float hash21(vec2 p){',
    '  p = fract(p * vec2(123.34, 456.21));',
    '  p += dot(p, p + 45.32);',
    '  return fract(p.x * p.y);',
    '}',
    '',
    'float vnoise(vec2 p){',
    '  vec2 i = floor(p);',
    '  vec2 f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  float a = hash21(i);',
    '  float b = hash21(i + vec2(1.0, 0.0));',
    '  float c = hash21(i + vec2(0.0, 1.0));',
    '  float d = hash21(i + vec2(1.0, 1.0));',
    '  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);',
    '}',
    '',
    'float fbm(vec2 p){',
    '  float v = 0.0;',
    '  float a = 0.5;',
    '  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);',
    '  for (int i = 0; i < 5; i++){',
    '    v += a * vnoise(p);',
    '    p = rot * p * 2.03;',
    '    a *= 0.5;',
    '  }',
    '  return v;',
    '}',
    '',
    /* the site palette: aqua -> blue -> violet -> rose */
    'vec3 tint(float k){',
    '  vec3 c = mix(vec3(0.055, 0.878, 0.780), vec3(0.400, 0.580, 1.000), smoothstep(0.00, 0.38, k));',
    '  c = mix(c, vec3(0.647, 0.451, 1.000), smoothstep(0.34, 0.72, k));',
    '  c = mix(c, vec3(1.000, 0.329, 0.580), smoothstep(0.70, 1.00, k));',
    '  return c;',
    '}',
    '',
    'void main(){',
    '  vec2 uv = vUv;',
    '  float t = uTime * 0.055;',
    '  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);',
    '  p += uPointer * 0.045;',
    '',
    '  vec3 col = vec3(0.0);',
    '',
    /* four drifting veils, each on its own lissajous path */
    '  for (int i = 0; i < 4; i++){',
    '    float fi = float(i);',
    '    float ang = fi * 1.72 + 0.55;',
    '    float spin = 0.31 + fi * 0.13;',
    '    vec2 c = vec2(cos(ang), sin(ang * 1.31)) * (0.26 + 0.10 * sin(t * (0.8 + fi * 0.21) + fi * 1.7));',
    '    c.y = c.y * 0.55 + 0.04 * sin(t * 0.43 + fi);',
    '    float rad = 0.30 + 0.11 * sin(t * (0.55 + fi * 0.19) + fi * 2.4);',
    '    vec2 d = p - c;',
    /* horizontal shear is what turns a blob into a hanging curtain */
    '    d.x += 0.10 * sin(d.y * 2.1 + t * spin * 2.0 + fi);',
    '    float dist = length(d) / rad;',
    '    float veil = exp(-dist * dist * 2.15);',
    /* noise tears the edges up so it reads as light rather than a gradient */
    '    float n = fbm(p * (1.9 + fi * 0.5) + vec2(t * 0.42, -t * 0.28) + fi * 5.1);',
    '    veil *= 0.42 + 0.92 * n;',
    '    col += tint(fi / 3.0) * veil * (0.30 - fi * 0.045);',
    '  }',
    '',
    /* vertical light shafts — the part that actually says "aurora" */
    '  float shaft = fbm(vec2(p.x * 1.35 + t * 0.5, p.y * 0.10 - t * 0.16));',
    '  float vfall = smoothstep(1.15, -0.30, uv.y);',
    '  col += tint(0.45) * pow(smoothstep(0.46, 0.92, shaft), 1.6) * vfall * 0.16;',
    '',
    /* stay calm in the middle so body copy keeps its contrast */
    '  col *= 0.30 + 0.70 * smoothstep(0.10, 0.62, length(p));',
    '',
    /* soft stars, not single pixels: the aurora is drawn into a reduced buffer
       and scaled up, so a one-pixel star would turn into a hard square */
    '  float st = vnoise(uv * uAspect * 190.0);',
    '  col += vec3(0.75, 0.85, 1.0) * smoothstep(0.968, 1.0, st) * 0.34;',
    '',
    /* a touch of dither to stop the gradients banding on cheap panels */
    '  col += (hash21(uv * 620.0 + uTime) - 0.5) * 0.012;',
    '',
    '  gl_FragColor = vec4(max(col, 0.0) * uOpacity, 1.0);',
    '}'
  ].join('\n');

  /* ------------------------------------------------------------------ setup */

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('Shader compile failed: ' + log);
    }
    return sh;
  }

  function program(gl, vsSrc, fsSrc) {
    var vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
    var fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    var p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('Program link failed: ' + gl.getProgramInfoLog(p));
    }
    var u = Object.create(null), a = Object.create(null);
    var un = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < un; i++) {
      var info = gl.getActiveUniform(p, i);
      u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name);
    }
    var an = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (var j = 0; j < an; j++) {
      var ai = gl.getActiveAttrib(p, j);
      a[ai.name] = gl.getAttribLocation(p, ai.name);
    }
    return { p: p, u: u, a: a };
  }

  function buffer(gl, data, target) {
    var b = gl.createBuffer();
    gl.bindBuffer(target || gl.ARRAY_BUFFER, b);
    gl.bufferData(target || gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  }

  /* ------------------------------------------------------------------- API */

  function create(canvas, opts) {
    opts = opts || {};
    var lowPower = !!opts.lowPower;

    var gl = null;
    var attrs = { alpha: true, antialias: !lowPower, depth: true, stencil: false,
                  premultipliedAlpha: false, powerPreference: lowPower ? 'low-power' : 'high-performance',
                  failIfMajorPerformanceCaveat: false };
    try { gl = canvas.getContext('webgl2', attrs) || canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs); }
    catch (e) { gl = null; }
    if (!gl) return null;

    var isGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearColor(0, 0, 0, 0);

    var progCore = program(gl, CORE_VS, CORE_FS);
    var progDust = program(gl, DUST_VS, DUST_FS);
    var progLine = program(gl, LINE_VS, LINE_FS);
    var progNode = program(gl, NODE_VS, NODE_FS);
    var progAurora = program(gl, AURORA_VS, AURORA_FS);

    /* --- scene 2: aurora --- one oversized triangle covers the viewport */
    var auroraQuad = buffer(gl, new Float32Array([-1, -1, 3, -1, -1, 3]));

    /* --- scene 0: core --- */
    var subdiv = lowPower ? 3 : 4;
    var ico = icosphere(subdiv);
    var icoPos = buffer(gl, ico.positions);
    var icoIdx = buffer(gl, ico.indices, gl.ELEMENT_ARRAY_BUFFER);

    var field = particleField(lowPower ? 900 : 2400, 2.6, 11);
    var dustPos = buffer(gl, field.positions);
    var dustRnd = buffer(gl, field.rnd);

    var ringSpecs = [
      { r: 2.05, tilt: 0.42, spin: 0.16, a: 0.42, col: [0.30, 0.95, 0.86] },
      { r: 2.75, tilt: -0.75, spin: -0.11, a: 0.26, col: [0.55, 0.45, 1.00] },
      { r: 3.45, tilt: 1.18, spin: 0.07, a: 0.16, col: [1.00, 0.45, 0.62] }
    ];
    var rings = ringSpecs.map(function (spec) {
      var seg = 128;
      var pos = circleLoop(seg, spec.r);
      var col = new Float32Array(seg * 4);
      for (var i = 0; i < seg; i++) {
        col[i * 4] = spec.col[0]; col[i * 4 + 1] = spec.col[1];
        col[i * 4 + 2] = spec.col[2]; col[i * 4 + 3] = spec.a;
      }
      return { spec: spec, pos: buffer(gl, pos), col: buffer(gl, col), seg: seg };
    });

    /* --- scene 1: network (filled in by setNetwork) --- */
    var net = { nodes: [], edges: [], posBuf: null, colBuf: null, metaBuf: null,
                edgePosBuf: null, edgeColBuf: null, edgeCount: 0, nodeCount: 0,
                meta: null, labelCount: 0 };
    var _proj = M4.create(), _view = M4.create(), _model = M4.create(), _nrm = new Float32Array(9);
    var _tmp = M4.create();

    /* --- state --- */
    var state = {
      scene: 'core',
      opacity: 1,
      time: 0,
      dpr: 1,
      width: 1, height: 1,
      pointerX: 0, pointerY: 0,
      scroll: 0,          /* 0..1 driver supplied by the page */
      energy: 1,
      visible: true
    };

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function setNetwork(categories) {
      /* categories: [{ label, color:[r,g,b], skills:[string,...] }] */
      if (!categories || !categories.length) return;
      var hubR = 3.05, ringR = 0.86;
      var nodes = [], edges = [];
      var i, k;

      /* Fibonacci sphere for the category hubs */
      var golden = Math.PI * (3 - Math.sqrt(5));
      categories.forEach(function (cat, ci) {
        var y = 1 - (ci / Math.max(categories.length - 1, 1)) * 2;
        var rad = Math.sqrt(Math.max(0, 1 - y * y));
        var th = golden * ci;
        var hub = [Math.cos(th) * rad * hubR, y * hubR * 0.82, Math.sin(th) * rad * hubR];
        var hubIdx = nodes.length;
        nodes.push({ pos: hub, col: cat.color, size: 2.5, label: cat.label, hub: true, cat: ci });
        var n = cat.skills.length;
        for (var s = 0; s < n; s++) {
          var a = (s / n) * Math.PI * 2 + ci * 0.7;
          var tilt = ((s % 3) - 1) * 0.55;
          var rr = ringR * (0.82 + ((s * 37) % 11) / 24);
          var p = [
            hub[0] + Math.cos(a) * rr * Math.cos(tilt),
            hub[1] + Math.sin(tilt) * rr,
            hub[2] + Math.sin(a) * rr * Math.cos(tilt)
          ];
          var idx = nodes.length;
          nodes.push({ pos: p, col: cat.color, size: 1.05, label: cat.skills[s], hub: false, cat: ci });
          edges.push([hubIdx, idx, 0.55]);
        }
        /* chain the skills of a category together for a denser web */
        for (k = 0; k < n; k++) {
          edges.push([hubIdx + 1 + k, hubIdx + 1 + ((k + 1) % n), 0.2]);
        }
      });
      /* a few bridges between neighbouring categories */
      for (i = 0; i < categories.length - 1; i++) {
        var h1 = i, h2 = i + 1;
        edges.push([h1, h2, 0.35]);
        edges.push([h1, h2 + 1, 0.16]);
      }

      var nc = nodes.length, ec = edges.length;
      var posArr = new Float32Array(nc * 3);
      var colArr = new Float32Array(nc * 3);
      var metaArr = new Float32Array(nc * 2);
      for (i = 0; i < nc; i++) {
        posArr[i * 3] = nodes[i].pos[0];
        posArr[i * 3 + 1] = nodes[i].pos[1];
        posArr[i * 3 + 2] = nodes[i].pos[2];
        colArr[i * 3] = nodes[i].col[0];
        colArr[i * 3 + 1] = nodes[i].col[1];
        colArr[i * 3 + 2] = nodes[i].col[2];
        metaArr[i * 2] = 0;
        metaArr[i * 2 + 1] = nodes[i].size;
      }
      var epos = new Float32Array(ec * 6);
      var ecol = new Float32Array(ec * 8);
      for (i = 0; i < ec; i++) {
        var A = nodes[edges[i][0]], B = nodes[edges[i][1]];
        epos[i * 6] = A.pos[0]; epos[i * 6 + 1] = A.pos[1]; epos[i * 6 + 2] = A.pos[2];
        epos[i * 6 + 3] = B.pos[0]; epos[i * 6 + 4] = B.pos[1]; epos[i * 6 + 5] = B.pos[2];
        for (k = 0; k < 2; k++) {
          ecol[i * 8 + k * 4] = A.col[0] * 0.5 + 0.5;
          ecol[i * 8 + k * 4 + 1] = A.col[1] * 0.5 + 0.5;
          ecol[i * 8 + k * 4 + 2] = A.col[2] * 0.5 + 0.5;
          ecol[i * 8 + k * 4 + 3] = edges[i][2];
        }
      }

      if (net.posBuf) gl.deleteBuffer(net.posBuf);
      if (net.colBuf) gl.deleteBuffer(net.colBuf);
      if (net.metaBuf) gl.deleteBuffer(net.metaBuf);
      if (net.edgePosBuf) gl.deleteBuffer(net.edgePosBuf);
      if (net.edgeColBuf) gl.deleteBuffer(net.edgeColBuf);

      net.posBuf = buffer(gl, posArr);
      net.colBuf = buffer(gl, colArr);
      net.metaBuf = buffer(gl, metaArr);
      net.edgePosBuf = buffer(gl, epos);
      net.edgeColBuf = buffer(gl, ecol);
      net.nodeCount = nc;
      net.edgeCount = ec;
      net.nodes = nodes;
      net.meta = metaArr;
      net.edges = edges;
    }

    function setHighlight(index) {
      if (!net.meta) return;
      var changed = false;
      for (var i = 0; i < net.nodeCount; i++) {
        var want = i === index ? 1 : 0;
        if (net.meta[i * 2] !== want) { net.meta[i * 2] = want; changed = true; }
      }
      if (!changed) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, net.metaBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, net.meta);
    }

    /* screen-space pick â€” returns node index or -1 */
    function pick(cssX, cssY) {
      if (!net.nodeCount) return -1;
      var best = -1, bestScore = Infinity;
      var base = 24;                                    /* px radius for a skill node */
      for (var i = 0; i < net.nodeCount; i++) {
        var s = project(i);
        if (!s) continue;
        var dx = s.x - cssX, dy = s.y - cssY;
        var d = Math.sqrt(dx * dx + dy * dy);
        var hub = net.nodes[i].hub;
        if (d > base * (hub ? 2.2 : 1)) continue;
        /* hubs win ties so the category label is easy to grab */
        var score = d - (hub ? base * 1.1 : 0);
        if (score < bestScore) { bestScore = score; best = i; }
      }
      return best;
    }

    function project(i) {
      if (!net.nodes || i >= net.nodeCount) return null;
      var p = net.nodes[i].pos;
      /* world = model * pos */
      var ex = _model[0] * p[0] + _model[4] * p[1] + _model[8] * p[2] + _model[12];
      var ey = _model[1] * p[0] + _model[5] * p[1] + _model[9] * p[2] + _model[13];
      var ez = _model[2] * p[0] + _model[6] * p[1] + _model[10] * p[2] + _model[14];
      /* view = view * world */
      var vx = _view[0] * ex + _view[4] * ey + _view[8] * ez + _view[12];
      var vy = _view[1] * ex + _view[5] * ey + _view[9] * ez + _view[13];
      var vz = _view[2] * ex + _view[6] * ey + _view[10] * ez + _view[14];
      /* clip = proj * view */
      var cw = -vz;
      if (cw <= 0.05) return null;
      var cx = _proj[0] * vx + _proj[4] * vy + _proj[8] * vz + _proj[12];
      var cy = _proj[1] * vx + _proj[5] * vy + _proj[9] * vz + _proj[13];
      var ndcX = cx / cw, ndcY = cy / cw;
      if (ndcX < -1.4 || ndcX > 1.4 || ndcY < -1.4 || ndcY > 1.4) return null;
      return {
        x: (ndcX * 0.5 + 0.5) * state.width,
        y: (0.5 - ndcY * 0.5) * state.height,
        depth: cw
      };
    }

    /* The aurora is a fullscreen noise shader, so its cost is pure fill rate.
       It is also inherently soft, which means we can afford to draw it into a
       small backing store and let the browser scale it up: ~1/9 of the pixels,
       no visible difference. The core and network scenes need real resolution
       and are drawn 1:1. */
    var RENDER_SCALE = { core: 1, network: 1, aurora: 0.34 };
    var drawnScene = null;

    function resize(force) {
      var rect = canvas.getBoundingClientRect();
      var w = Math.max(1, Math.round(rect.width));
      var h = Math.max(1, Math.round(rect.height));
      var dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2);
      var scale = RENDER_SCALE[state.scene] || 1;
      var pw = Math.max(1, Math.round(w * dpr * scale));
      var ph = Math.max(1, Math.round(h * dpr * scale));
      if (!force && canvas.width === pw && canvas.height === ph && state.width === w) return;
      canvas.width = pw; canvas.height = ph;
      state.width = w; state.height = h; state.dpr = dpr * scale;
      gl.viewport(0, 0, pw, ph);
    }

    function drawCore(time) {
      var aspect = state.width / state.height;
      M4.perspective(_proj, 0.92, aspect, 0.1, 60);

      var drift = reduced ? 0 : state.pointerX * 0.55;
      var lift = reduced ? 0 : state.pointerY * 0.34;
      var camZ = 6.6 - state.scroll * 1.25;
      var eye = [drift * 0.5, lift * 0.5 + 0.15, camZ];
      M4.lookAt(_view, eye, [0, 0, 0], [0, 1, 0]);

      var yaw = time * 0.13 + drift;
      var pitch = 0.18 + Math.sin(time * 0.19) * 0.07 + lift;
      var breathe = 1 + Math.sin(time * 0.5) * 0.02;
      M4.compose(_model, yaw, pitch, breathe);
      M4.normalMat3(_nrm, _model);

      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      var op = state.opacity;

      /* core body */
      gl.useProgram(progCore.p);
      gl.uniformMatrix4fv(progCore.u.uProj, false, _proj);
      gl.uniformMatrix4fv(progCore.u.uView, false, _view);
      gl.uniformMatrix4fv(progCore.u.uModel, false, _model);
      gl.uniformMatrix3fv(progCore.u.uNormal, false, _nrm);
      gl.uniform1f(progCore.u.uTime, time);
      gl.uniform1f(progCore.u.uAmp, 0.30);
      gl.uniform1f(progCore.u.uRadius, 1.55);
      gl.uniform1f(progCore.u.uSpin, time * 0.07);
      gl.uniform3f(progCore.u.uCam, eye[0], eye[1], eye[2]);
      gl.uniform1f(progCore.u.uOpacity, op);
      gl.uniform1f(progCore.u.uHue, state.scroll * 0.35);
      gl.uniform1f(progCore.u.uEnergy, state.energy);

      gl.disable(gl.BLEND);
      gl.bindBuffer(gl.ARRAY_BUFFER, icoPos);
      gl.enableVertexAttribArray(progCore.a.aPos);
      gl.vertexAttribPointer(progCore.a.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, icoIdx);
      gl.drawElements(gl.TRIANGLES, ico.count, ico.indices.BYTES_PER_ELEMENT === 4 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);

      /* rings */
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
      gl.useProgram(progLine.p);
      gl.uniformMatrix4fv(progLine.u.uProj, false, _proj);
      gl.uniformMatrix4fv(progLine.u.uView, false, _view);
      gl.uniform1f(progLine.u.uAlpha, op);
      gl.enableVertexAttribArray(progLine.a.aPos);
      gl.enableVertexAttribArray(progLine.a.aCol);
      for (var r = 0; r < rings.length; r++) {
        var ring = rings[r];
        var rm = M4.compose(_tmp, time * ring.spec.spin + r, ring.spec.tilt, 1);
        gl.uniformMatrix4fv(progLine.u.uModel, false, rm);
        gl.bindBuffer(gl.ARRAY_BUFFER, ring.pos);
        gl.vertexAttribPointer(progLine.a.aPos, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, ring.col);
        gl.vertexAttribPointer(progLine.a.aCol, 4, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINE_LOOP, 0, ring.seg);
      }

      /* dust */
      gl.useProgram(progDust.p);
      gl.uniformMatrix4fv(progDust.u.uProj, false, _proj);
      gl.uniformMatrix4fv(progDust.u.uView, false, _view);
      gl.uniformMatrix4fv(progDust.u.uModel, false, _model);
      gl.uniform1f(progDust.u.uTime, reduced ? 0 : time);
      gl.uniform1f(progDust.u.uSize, 12);
      gl.uniform1f(progDust.u.uDpr, state.dpr);
      gl.uniform1f(progDust.u.uOpacity, op * 0.95);
      gl.enableVertexAttribArray(progDust.a.aPos);
      gl.enableVertexAttribArray(progDust.a.aRnd);
      gl.bindBuffer(gl.ARRAY_BUFFER, dustPos);
      gl.vertexAttribPointer(progDust.a.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, dustRnd);
      gl.vertexAttribPointer(progDust.a.aRnd, 4, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.POINTS, 0, field.positions.length / 3);

      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    function drawNetwork(time) {
      if (!net.nodeCount) return;
      var aspect = state.width / state.height;
      var fit = Math.min(1, aspect / 1.5);
      M4.perspective(_proj, 0.86, aspect, 0.1, 60);
      var camZ = 9.6 / Math.max(fit, 0.55);
      var px = reduced ? 0 : state.pointerX * 0.9;
      var py = reduced ? 0 : state.pointerY * 0.55;
      var eye = [px, py, camZ];
      M4.lookAt(_view, eye, [0, 0, 0], [0, 1, 0]);
      M4.compose(_model, state.scroll * 1.5 + (reduced ? 0.4 : time * 0.05),
                 py * 0.28 - state.scroll * 0.5, 1);
      M4.normalMat3(_nrm, _model);

      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);

      var op = state.opacity;

      /* edges */
      gl.useProgram(progLine.p);
      gl.uniformMatrix4fv(progLine.u.uProj, false, _proj);
      gl.uniformMatrix4fv(progLine.u.uView, false, _view);
      gl.uniformMatrix4fv(progLine.u.uModel, false, _model);
      gl.uniform1f(progLine.u.uAlpha, op * 0.5);
      gl.enableVertexAttribArray(progLine.a.aPos);
      gl.enableVertexAttribArray(progLine.a.aCol);
      gl.bindBuffer(gl.ARRAY_BUFFER, net.edgePosBuf);
      gl.vertexAttribPointer(progLine.a.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, net.edgeColBuf);
      gl.vertexAttribPointer(progLine.a.aCol, 4, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINES, 0, net.edgeCount * 2);

      /* nodes */
      gl.useProgram(progNode.p);
      gl.uniformMatrix4fv(progNode.u.uProj, false, _proj);
      gl.uniformMatrix4fv(progNode.u.uView, false, _view);
      gl.uniformMatrix4fv(progNode.u.uModel, false, _model);
      gl.uniform1f(progNode.u.uTime, reduced ? 0 : time);
      gl.uniform1f(progNode.u.uSize, 26);
      gl.uniform1f(progNode.u.uDpr, state.dpr);
      gl.uniform1f(progNode.u.uOpacity, op);
      gl.enableVertexAttribArray(progNode.a.aPos);
      gl.enableVertexAttribArray(progNode.a.aCol);
      gl.enableVertexAttribArray(progNode.a.aMeta);
      gl.bindBuffer(gl.ARRAY_BUFFER, net.posBuf);
      gl.vertexAttribPointer(progNode.a.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, net.colBuf);
      gl.vertexAttribPointer(progNode.a.aCol, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, net.metaBuf);
      gl.vertexAttribPointer(progNode.a.aMeta, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.POINTS, 0, net.nodeCount);

      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    /* Additive over a cleared buffer, so the CSS background behind the canvas
       still shows through wherever the aurora is dark. */
    function drawAurora(time) {
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

      gl.useProgram(progAurora.p);
      gl.uniform1f(progAurora.u.uTime, reduced ? 0 : time);
      gl.uniform1f(progAurora.u.uOpacity, state.opacity);
      gl.uniform1f(progAurora.u.uAspect, state.width / Math.max(state.height, 1));
      gl.uniform2f(progAurora.u.uPointer, reduced ? 0 : state.pointerX, reduced ? 0 : state.pointerY);

      gl.bindBuffer(gl.ARRAY_BUFFER, auroraQuad);
      gl.enableVertexAttribArray(progAurora.a.aPos);
      gl.vertexAttribPointer(progAurora.a.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
    }

    function render(time) {
      if (!state.visible || state.opacity <= 0.004) return;
      /* a different scene may want a different backing-store size */
      if (state.scene !== drawnScene) { drawnScene = state.scene; resize(true); }
      state.time = time;
      if (state.scene === 'aurora') drawAurora(time);
      else if (state.scene === 'network') drawNetwork(time);
      else drawCore(time);
    }

    /* ------------------------------------------------------- context loss */
    var lost = false;
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); lost = true; }, false);
    canvas.addEventListener('webglcontextrestored', function () { lost = true; }, false);

    resize();

    return {
      gl: gl,
      isGL2: isGL2,
      reduced: reduced,
      state: state,
      resize: resize,
      render: function (time) { if (!lost) render(time); },
      setNetwork: setNetwork,
      setHighlight: setHighlight,
      pick: pick,
      project: project,
      nodeCount: function () { return net.nodeCount; },
      node: function (i) { return net.nodes[i]; },
      get lost() { return lost; }
    };
  }

  global.KMGL = { create: create };
})(window);
