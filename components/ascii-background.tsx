"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

// ---------- shared vertex shader ----------
const fullscreenVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

// ---------- splat shader: adds energy at mouse position ----------
const splatFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPrev;
  uniform vec2 uSplatPos;   // mouse position in 0..1 UV
  uniform vec2 uSplatVel;   // mouse velocity (for directional energy)
  uniform float uSplatRadius;
  uniform float uSplatStrength;
  uniform float uDoSplat;    // 1.0 when mouse is moving, 0.0 otherwise

  void main() {
    vec4 prev = texture2D(uPrev, vUv);
    vec2 diff = vUv - uSplatPos;
    // correct for aspect ratio
    diff.x *= (1.0); // we'll handle aspect in JS by scaling radius
    float dist = dot(diff, diff);
    float splat = exp(-dist / uSplatRadius) * uSplatStrength * uDoSplat;
    // store energy in r, velocity direction in gb
    float energy = prev.r + splat;
    vec2 vel = prev.gb + normalize(uSplatVel + 0.001) * splat * 0.5;
    gl_FragColor = vec4(energy, vel, prev.a);
  }
`;

// ---------- decay/advect shader: fades + spreads energy ----------
const decayFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPrev;
  uniform vec2 uTexelSize;
  uniform float uDecay;

  void main() {
    vec4 c = texture2D(uPrev, vUv);

    // light diffusion: mostly keep current value, blend a little with neighbors
    vec4 n = texture2D(uPrev, vUv + vec2(0.0, uTexelSize.y));
    vec4 s = texture2D(uPrev, vUv - vec2(0.0, uTexelSize.y));
    vec4 e = texture2D(uPrev, vUv + vec2(uTexelSize.x, 0.0));
    vec4 w = texture2D(uPrev, vUv - vec2(uTexelSize.x, 0.0));
    vec4 result = c * 0.7 + (n + s + e + w) * 0.075;
    result *= uDecay;

    gl_FragColor = result;
  }
`;

// ---------- main display shader ----------
const displayFrag = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform sampler2D uEnergyTex;

  // --- noise helpers ---
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = rot * p * 2.0 + shift;
      a *= 0.5;
    }
    return v;
  }

  // --- glitch ---
  float glitchBlock(float y, float t) {
    float band = floor(y * 12.0);
    float trigger = hash(vec2(band, floor(t * 3.0)));
    float on = step(0.92, trigger);
    float offset = (hash(vec2(band, floor(t * 7.0))) - 0.5) * 2.0;
    return offset * on;
  }

  // --- corruption scanlines (commented out for now) ---
  // float corruptionLine(float y, float t) {
  //   float band = floor(y * 40.0);
  //   float trigger = hash(vec2(band, floor(t * 4.0)));
  //   return step(0.97, trigger);
  // }

  // --- character drawing ---
  float drawGlyph(vec2 cellUv, int idx) {
    float d = 0.0;
    vec2 c = cellUv - 0.5;

    if (idx == 0) {
      d = smoothstep(0.15, 0.1, length(c));
    } else if (idx == 1) {
      d = smoothstep(0.06, 0.02, abs(c.y)) * smoothstep(0.35, 0.25, abs(c.x));
    } else if (idx == 2) {
      d = smoothstep(0.06, 0.02, abs(c.x)) * smoothstep(0.35, 0.25, abs(c.y));
    } else if (idx == 3) {
      float h = smoothstep(0.06, 0.02, abs(c.y)) * smoothstep(0.35, 0.25, abs(c.x));
      float v = smoothstep(0.06, 0.02, abs(c.x)) * smoothstep(0.35, 0.25, abs(c.y));
      d = max(h, v);
    } else if (idx == 4) {
      float d1 = smoothstep(0.12, 0.08, length(c - vec2(0.0, 0.18)));
      float d2 = smoothstep(0.12, 0.08, length(c + vec2(0.0, 0.18)));
      d = max(d1, d2);
    } else if (idx == 5) {
      float h1 = smoothstep(0.04, 0.01, abs(c.y - 0.15)) * smoothstep(0.35, 0.25, abs(c.x));
      float h2 = smoothstep(0.04, 0.01, abs(c.y + 0.15)) * smoothstep(0.35, 0.25, abs(c.x));
      float v1 = smoothstep(0.04, 0.01, abs(c.x - 0.15)) * smoothstep(0.35, 0.25, abs(c.y));
      float v2 = smoothstep(0.04, 0.01, abs(c.x + 0.15)) * smoothstep(0.35, 0.25, abs(c.y));
      d = max(max(h1, h2), max(v1, v2));
    } else if (idx == 6) {
      vec2 ac = abs(c);
      float box = smoothstep(0.32, 0.28, max(ac.x, ac.y)) - smoothstep(0.24, 0.2, max(ac.x, ac.y));
      d = max(box, 0.0);
    } else {
      vec2 ac = abs(c);
      d = smoothstep(0.32, 0.28, max(ac.x, ac.y));
    }

    return d;
  }

  float asciiField(vec2 uv, float cellSize, float t, float energyBoost) {
    vec2 cells = uResolution / cellSize;
    vec2 gridPos = uv * cells;
    vec2 cellId = floor(gridPos);
    vec2 cellUv = fract(gridPos);

    float td = t * 0.08;
    vec2 noiseCoord = cellId * 0.06 + vec2(td * 0.7, td * 0.3);
    float n = fbm(noiseCoord);
    float n2 = fbm(noiseCoord * 1.5 + vec2(50.0));
    float intensity = n * 0.7 + n2 * 0.3;

    // boost from mouse energy
    intensity += energyBoost * 0.3;

    // vignette
    vec2 vc = uv - 0.5;
    float vignette = 1.0 - dot(vc, vc) * 1.8;
    intensity *= clamp(vignette, 0.0, 1.0);

    int glyphIdx = 0;
    if (intensity < 0.2) glyphIdx = 0;
    else if (intensity < 0.3) glyphIdx = 1;
    else if (intensity < 0.38) glyphIdx = 4;
    else if (intensity < 0.46) glyphIdx = 2;
    else if (intensity < 0.54) glyphIdx = 3;
    else if (intensity < 0.62) glyphIdx = 5;
    else if (intensity < 0.72) glyphIdx = 6;
    else glyphIdx = 7;

    float glyph = drawGlyph(cellUv, glyphIdx);
    return glyph * intensity;
  }

  void main() {
    float cellSize = 14.0;
    float t = uTime;

    // --- glitch: horizontal displacement ---
    vec2 uv = vUv;
    float glitchAmt = glitchBlock(uv.y, t);
    uv.x += glitchAmt * 0.03;
    uv.x = clamp(uv.x, 0.0, 1.0);

    // --- read mouse energy texture ---
    float energy = texture2D(uEnergyTex, uv).r;
    energy = clamp(energy, 0.0, 1.0);

    // --- main ascii field with energy boost ---
    float field = asciiField(uv, cellSize, t, energy);

    // --- glow: sample neighbors ---
    float glowRadius = 3.0 / max(uResolution.x, uResolution.y);
    float glow = 0.0;
    glow += asciiField(uv + vec2( glowRadius,  0.0), cellSize, t, energy);
    glow += asciiField(uv + vec2(-glowRadius,  0.0), cellSize, t, energy);
    glow += asciiField(uv + vec2( 0.0,  glowRadius), cellSize, t, energy);
    glow += asciiField(uv + vec2( 0.0, -glowRadius), cellSize, t, energy);
    glow += asciiField(uv + vec2( glowRadius,  glowRadius) * 0.7, cellSize, t, energy);
    glow += asciiField(uv + vec2(-glowRadius,  glowRadius) * 0.7, cellSize, t, energy);
    glow += asciiField(uv + vec2( glowRadius, -glowRadius) * 0.7, cellSize, t, energy);
    glow += asciiField(uv + vec2(-glowRadius, -glowRadius) * 0.7, cellSize, t, energy);
    glow /= 8.0;

    float combined = field + glow * 0.6;

    // color
    vec3 orange = vec3(0.95, 0.45, 0.05);
    vec3 dimOrange = vec3(0.6, 0.25, 0.02);
    vec3 brightOrange = vec3(1.0, 0.7, 0.3);

    vec2 vc = uv - 0.5;
    float vignette = clamp(1.0 - dot(vc, vc) * 1.8, 0.0, 1.0);

    vec3 col = mix(dimOrange, orange, vignette * combined);

    // glow bloom
    vec3 glowCol = mix(orange, brightOrange, 0.3);
    vec3 litCol = mix(col, glowCol, glow * 0.4);

    // mouse energy: warm accent where cursor has been
    litCol = mix(litCol, brightOrange, energy * 0.25);

    float alpha = combined * 0.35;
    alpha = mix(alpha, min(combined * 0.5, 1.0), energy * 0.18);

    // --- corruption scanlines (commented out) ---
    // float corrupt = corruptionLine(vUv.y, t);
    // litCol = mix(litCol, vec3(1.0, 0.6, 0.1), corrupt * 0.8);
    // alpha = mix(alpha, 0.5, corrupt * 0.6);

    // --- glitch: rgb split ---
    float glitchPresence = clamp(abs(glitchAmt) * 10.0, 0.0, 1.0);
    if (glitchPresence > 0.01) {
      float split = 0.004 * glitchPresence;
      float fieldR = asciiField(uv + vec2(split, 0.0), cellSize, t, energy);
      float fieldB = asciiField(uv - vec2(split, 0.0), cellSize, t, energy);
      litCol.r = mix(litCol.r, fieldR * orange.r * 1.5, glitchPresence * 0.7);
      litCol.b = mix(litCol.b, fieldB * 0.4, glitchPresence * 0.5);
      alpha = mix(alpha, alpha * 1.8, glitchPresence * 0.5);
    }

    vec3 bg = vec3(0.04, 0.04, 0.04);
    vec3 final = mix(bg, litCol, alpha);

    gl_FragColor = vec4(final, 1.0);
  }
`;

// ---------- ping-pong FBO helper ----------
class DoubleFBO {
  read: THREE.WebGLRenderTarget;
  write: THREE.WebGLRenderTarget;

  constructor(w: number, h: number) {
    const opts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    };
    this.read = new THREE.WebGLRenderTarget(w, h, opts);
    this.write = new THREE.WebGLRenderTarget(w, h, opts);
  }

  swap() {
    const tmp = this.read;
    this.read = this.write;
    this.write = tmp;
  }

  dispose() {
    this.read.dispose();
    this.write.dispose();
  }
}

// ---------- main scene component ----------
function ShaderPlane() {
  const meshRef = useRef<THREE.Mesh>(null);
  const { gl, size } = useThree();

  // mouse state
  const mouseRef = useRef({
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    moving: false,
    lastMoveTime: 0,
  });

  // energy field FBOs (lower res for perf)
  const fboSize = 256;
  const energyFBO = useMemo(() => new DoubleFBO(fboSize, fboSize), []);

  // offscreen scenes + materials for splat & decay passes
  const splatScene = useMemo(() => new THREE.Scene(), []);
  const decayScene = useMemo(() => new THREE.Scene(), []);
  const orthoCamera = useMemo(
    () => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    []
  );

  const splatMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: fullscreenVert,
        fragmentShader: splatFrag,
        uniforms: {
          uPrev: { value: null },
          uSplatPos: { value: new THREE.Vector2(0.5, 0.5) },
          uSplatVel: { value: new THREE.Vector2(0, 0) },
          uSplatRadius: { value: 0.015 },
          uSplatStrength: { value: 0.025 },
          uDoSplat: { value: 0.0 },
        },
      }),
    []
  );

  const decayMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: fullscreenVert,
        fragmentShader: decayFrag,
        uniforms: {
          uPrev: { value: null },
          uTexelSize: {
            value: new THREE.Vector2(1 / fboSize, 1 / fboSize),
          },
          uDecay: { value: 0.985 },
        },
      }),
    []
  );

  // build offscreen scenes once
  useEffect(() => {
    const geo = new THREE.PlaneGeometry(2, 2);

    const splatMesh = new THREE.Mesh(geo, splatMaterial);
    splatScene.add(splatMesh);

    const decayMesh = new THREE.Mesh(geo, decayMaterial);
    decayScene.add(decayMesh);

    return () => {
      energyFBO.dispose();
      geo.dispose();
      splatMaterial.dispose();
      decayMaterial.dispose();
    };
  }, [splatScene, decayScene, splatMaterial, decayMaterial, energyFBO]);

  // display uniforms
  const displayUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(size.width, size.height) },
      uEnergyTex: { value: energyFBO.read.texture },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // mouse handler
  const onPointerMove = useCallback((e: PointerEvent) => {
    const m = mouseRef.current;
    m.prevX = m.x;
    m.prevY = m.y;
    m.x = e.clientX / window.innerWidth;
    m.y = 1.0 - e.clientY / window.innerHeight; // flip y for GL
    m.moving = true;
    m.lastMoveTime = performance.now();
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, [onPointerMove]);

  // render loop
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    const m = mouseRef.current;

    // fade out splat if mouse stopped
    const timeSinceMove = performance.now() - m.lastMoveTime;
    const doSplat = timeSinceMove < 100 ? 1.0 : 0.0;

    // --- splat pass ---
    splatMaterial.uniforms.uPrev.value = energyFBO.read.texture;
    splatMaterial.uniforms.uSplatPos.value.set(m.x, m.y);
    splatMaterial.uniforms.uSplatVel.value.set(
      m.x - m.prevX,
      m.y - m.prevY
    );
    splatMaterial.uniforms.uDoSplat.value = doSplat;

    gl.setRenderTarget(energyFBO.write);
    gl.render(splatScene, orthoCamera);
    energyFBO.swap();

    // --- decay pass ---
    decayMaterial.uniforms.uPrev.value = energyFBO.read.texture;

    gl.setRenderTarget(energyFBO.write);
    gl.render(decayScene, orthoCamera);
    energyFBO.swap();

    // --- display pass ---
    gl.setRenderTarget(null);
    const mat = meshRef.current.material as THREE.ShaderMaterial;
    mat.uniforms.uTime.value = t;
    mat.uniforms.uResolution.value.set(size.width, size.height);
    mat.uniforms.uEnergyTex.value = energyFBO.read.texture;
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={fullscreenVert}
        fragmentShader={displayFrag}
        uniforms={displayUniforms}
      />
    </mesh>
  );
}

export function AsciiBackground() {
  return (
    <div className="fixed inset-0 -z-10">
      <Canvas
        gl={{ antialias: false, alpha: false }}
        camera={{ position: [0, 0, 1] }}
        dpr={[1, 1.5]}
        style={{ width: "100%", height: "100%" }}
      >
        <ShaderPlane />
      </Canvas>
    </div>
  );
}
