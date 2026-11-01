// Building facades, drawn entirely in the shader from world position so any box size gets a
// clean grid. Types: -1 antenna, 0 glass tower, 1 brick, 2 stone, 3 plain trim (ledges, roof boxes).
// Lit windows use interior mapping: a ray is traced into a box "room" behind the glass, so each
// window shows walls, floor, ceiling and furniture with real parallax as the camera moves.

export const buildingVert = /* glsl */ `
  attribute float aSeed;
  attribute vec3 aTint;
  attribute float aTop;
  attribute float aType;
  attribute float aBase;
  varying vec3 vW;
  varying vec3 vN;
  varying float vSeed;
  varying vec3 vTint;
  varying float vTop;
  varying float vType;
  varying float vBase;
  void main() {
    vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vSeed = aSeed;
    vTint = aTint;
    vTop = aTop;
    vType = aType;
    vBase = aBase;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

export const buildingFrag = /* glsl */ `
  uniform vec3 uFog;
  uniform float uFogDensity;
  uniform vec3 uMoon;
  uniform float uTime;
  varying vec3 vW;
  varying vec3 vN;
  varying float vSeed;
  varying vec3 vTint;
  varying float vTop;
  varying float vType;
  varying float vBase;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  // f: position inside the window (0..1), size: window size in metres, d: view ray in
  // facade space (x along the wall, y up, z into the building).
  vec3 room(vec2 f, vec2 size, vec3 d, float r) {
    const float DEPTH = 5.0;
    vec3 p = vec3(f * size, 0.0);
    float tx = d.x > 0.0 ? (size.x - p.x) / d.x : p.x / max(-d.x, 1e-4);
    float ty = d.y > 0.0 ? (size.y - p.y) / d.y : p.y / max(-d.y, 1e-4);
    float tz = DEPTH / max(d.z, 1e-4);
    float t = min(tx, min(ty, tz));
    vec3 h = p + d * t;
    vec3 light = mix(vec3(1.0, 0.72, 0.42), vec3(0.66, 0.82, 1.0), step(0.8, fract(r * 9.7)));
    vec3 c;
    if (t == tz) {
      c = light * (0.5 + 0.3 * hash(vec2(r, 3.1)));
      // Furniture: dark shapes along the lower part of the back wall.
      float shelf = step(h.y, size.y * 0.32) * step(0.45, fract(h.x * 0.41 + r * 3.0));
      c *= 1.0 - 0.65 * shelf;
    } else if (t == ty) {
      // Ceiling with a lamp glow, or a dim floor.
      vec2 q = vec2(h.x / size.x, h.z / DEPTH) - 0.5;
      c = d.y > 0.0 ? light * (1.25 - 1.4 * length(q)) : light * 0.22;
    } else {
      c = light * 0.38;
    }
    return c * (1.0 - 0.5 * h.z / DEPTH);
  }

  void main() {
    vec3 n = normalize(vN);
    float dist = distance(vW, cameraPosition);
    float moon = 0.5 + 0.5 * max(dot(n, uMoon), 0.0);
    vec3 V = normalize(vW - cameraPosition);
    vec3 col;

    if (vType < -0.5) {
      // Antenna with a blinking aircraft-warning light on top.
      col = vTint * moon * 0.6;
      float blink = step(0.5, fract(uTime * 0.8 + vTop * 0.13));
      col += vec3(1.0, 0.15, 0.15) * 2.0 * blink * smoothstep(vTop - 2.0, vTop - 0.5, vW.y);
    } else if (vType > 2.5) {
      col = vTint * moon * (n.y > 0.5 ? 0.6 : 0.85);
    } else if (abs(n.y) > 0.5) {
      // Roof: tar with a little grit.
      col = vTint * 0.32 * (0.85 + 0.3 * hash(floor(vW.xz * 0.8)));
    } else {
      int type = int(vType + 0.5);
      bool xFace = abs(n.x) > 0.5;
      vec3 u = xFace ? vec3(0.0, 0.0, -sign(n.x)) : vec3(sign(n.z), 0.0, 0.0);
      vec2 uv = vec2(dot(vW, u), vW.y);

      vec2 cs;
      vec4 win; // window rectangle inside its cell: x0, x1, y0, y1
      if (type == 0) { cs = vec2(3.0, 4.0); win = vec4(0.04, 0.96, 0.1, 0.97); }
      else if (type == 1) { cs = vec2(3.4, 3.8); win = vec4(0.27, 0.73, 0.24, 0.8); }
      else { cs = vec2(3.2, 4.2); win = vec4(0.25, 0.87, 0.14, 0.86); }

      vec2 c = uv / cs;
      vec2 id = floor(c);
      vec2 f = fract(c);
      float isWin = step(win.x, f.x) * step(f.x, win.y) * step(win.z, f.y) * step(f.y, win.w);
      float r = hash(id + vSeed * 17.0);
      float floorLit = step(0.93, hash(vec2(id.y, vSeed * 31.0)));
      float lit = clamp(step(0.62, r) + floorLit * step(0.25, r), 0.0, 1.0);

      vec3 wall = vTint * moon;
      if (type == 1) {
        // Brick courses with lighter mortar, and a stone lintel over each window.
        vec2 b = uv / vec2(0.6, 0.25);
        b.x += 0.5 * mod(floor(b.y), 2.0);
        vec2 bf = fract(b);
        float mortar = min(step(bf.x, 0.06) + step(bf.y, 0.12), 1.0);
        float detail = 1.0 - smoothstep(50.0, 140.0, dist); // bricks shimmer when tiny on screen
        wall *= mix(1.07, (0.82 + 0.3 * hash(floor(b))) * (1.0 + 0.45 * mortar), detail);
        float lintel = step(win.x - 0.04, f.x) * step(f.x, win.y + 0.04) * step(win.w, f.y) * step(f.y, win.w + 0.07);
        wall = mix(wall, vec3(0.32, 0.3, 0.28) * moon, lintel);
      } else if (type == 2) {
        // Stone piers between window columns and a sill line under each floor.
        wall *= 1.0 + 0.28 * step(f.x, 0.17);
        wall *= 1.0 - 0.35 * step(f.y, 0.06);
      } else {
        // Glass curtain wall: dark spandrels, thin bright mullions.
        wall *= 0.75 + 0.4 * (step(f.x, 0.04) + step(0.96, f.x));
      }

      vec3 d = vec3(dot(V, u), V.y, dot(V, -n));
      vec2 wf = vec2((f.x - win.x) / (win.y - win.x), (f.y - win.z) / (win.w - win.z));
      vec2 wsize = cs * vec2(win.y - win.x, win.w - win.z);
      vec3 inside = lit > 0.5 ? room(wf, wsize, d, r) : room(wf, wsize, d, r) * 0.06 + vec3(0.01, 0.012, 0.02);
      // Some lit windows have blinds half down.
      float slats = mix(0.5, step(0.5, fract(wf.y * 14.0)), 1.0 - smoothstep(40.0, 110.0, dist));
      inside *= 1.0 - 0.55 * step(0.85, fract(r * 5.3)) * step(0.55, wf.y) * slats;
      float fres = pow(1.0 - clamp(d.z, 0.0, 1.0), 4.0);
      vec3 sky = mix(vec3(0.2, 0.11, 0.2), vec3(0.04, 0.05, 0.13), clamp(V.y * 2.0 + 0.5, 0.0, 1.0));
      float refl = clamp(fres + (type == 0 ? 0.3 : 0.12) * (1.0 - lit), 0.0, 0.9);
      vec3 glass = mix(inside, sky, refl);
      // Recess shadow just inside the frame sells the window depth.
      float edge = min(min(wf.x, 1.0 - wf.x) * wsize.x, min(wf.y, 1.0 - wf.y) * wsize.y);
      glass *= mix(0.45, 1.0, smoothstep(0.0, 0.22, edge));
      vec3 near = mix(wall, glass, isWin);

      // Far away the detail aliases, so fade to the facade's average colour.
      float area = (win.y - win.x) * (win.w - win.z);
      vec3 far = mix(wall, vec3(1.0, 0.78, 0.5) * 0.2 + vec3(0.02), area);
      col = mix(near, far, smoothstep(350.0, 1100.0, dist));

      // Street level: shopfronts and neon signs on buildings that reach the ground.
      if (vBase < 0.5 && vW.y < 5.4) {
        float sf = fract(uv.x / 6.0);
        float sid = floor(uv.x / 6.0);
        float rs = hash(vec2(sid, vSeed * 7.0));
        float pane = step(0.08, sf) * step(sf, 0.92) * step(0.3, vW.y) * step(vW.y, 4.0);
        vec3 shop = mix(vec3(1.0, 0.8, 0.55), vec3(0.7, 0.9, 1.0), step(0.7, rs)) * (0.5 + 0.7 * rs) * step(0.22, rs);
        vec3 neon = rs < 0.33 ? vec3(1.0, 0.2, 0.35) : rs < 0.66 ? vec3(0.2, 0.9, 1.0) : vec3(1.0, 0.75, 0.2);
        float band = step(4.3, vW.y) * step(vW.y, 5.1) * step(0.15, sf) * step(sf, 0.85) * step(0.45, hash(vec2(sid, vSeed)));
        col = mix(col, shop, pane);
        col = mix(col, neon * 1.5, band);
      }

      col += vec3(1.0, 0.5, 0.28) * 0.16 * (1.0 - smoothstep(0.0, 14.0, vW.y));
      col += vec3(0.95, 0.2, 0.25) * 0.3 * smoothstep(vTop - 1.0, vTop, vW.y);
    }
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
    gl_FragColor = vec4(mix(col, uFog, fog), 1.0);
  }`;
