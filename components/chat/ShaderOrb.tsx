"use client";

import { useEffect, useRef, useState } from "react";
import { useActivity } from "./ChatProvider";
import { Orb, type OrbState } from "./Orb";
import styles from "./ShaderOrb.module.css";

/**
 * How far the canvas reaches past the orb on every side, as a fraction of the
 * orb's size. The halo lives in that margin, outside the layout box.
 */
const BLEED = 0.25;

/** Past 2x, extra pixels buy nothing visible on soft gradients and cost fill rate. */
const MAX_DPR = 2;

/**
 * The liquid travels round a circle this wide in noise space rather than
 * along a line, so the offset the GPU sees stays small for ever instead of
 * growing until float precision runs out.
 */
const LOOP = 4;

const TAU = Math.PI * 2;

/** How quickly eased values close on a state's targets, per second. Idle settles in about 1.3s. */
const EASE = 3;

/** Within this of every idle target, the orb is still enough to stop drawing. */
const REST = 0.01;

/** Writing pulses at about five and a half beats a second, like speech. */
const BEAT_RATE = TAU * 5.5;
const BREATH_RATE = TAU / 5;
const WARMTH_RATE = TAU / 7;

interface Tuning {
  /** Speed through the noise field, in noise units per second. */
  flow: number;
  /** Turn of the lights about the view axis, in radians per second. */
  swirl: number;
  /** How hard the liquid is folded into itself, from 0 to 1. */
  energy: number;
  /** Strength of the halo. */
  glow: number;
  /** How far the warm light swells and recedes, from 0 to 1. */
  warmth: number;
  /** Rhythmic pulsing, from 0 to 1. */
  beat: number;
  /** Slow breathing, from 0 to 1. */
  breath: number;
}

/**
 * Each state is a set of targets that the orb eases toward, so a change of
 * state reads as a change of mood rather than a cut. Idle has no speed at
 * all: motion should mean something, so at rest the orb decelerates to a
 * stop and the loop ends.
 */
const TUNING: Record<OrbState, Tuning> = {
  idle: { flow: 0, swirl: 0, energy: 0.3, glow: 0.65, warmth: 0, beat: 0, breath: 0 },
  listening: { flow: 0.14, swirl: 0.3, energy: 0.55, glow: 0.9, warmth: 0, beat: 0, breath: 0.5 },
  thinking: { flow: 0.22, swirl: 0.9, energy: 0.65, glow: 0.95, warmth: 1, beat: 0, breath: 0.5 },
  writing: { flow: 0.14, swirl: 0.35, energy: 0.45, glow: 0.85, warmth: 0, beat: 1, breath: 0 },
};

const KEYS = ["flow", "swirl", "energy", "glow", "warmth", "beat", "breath"] as const satisfies readonly (keyof Tuning)[];

/** One triangle that covers the whole canvas, generated from the vertex index, so no buffers are needed. */
const VERTEX = `#version 300 es
void main() {
  vec2 v = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(v * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;

uniform vec2 uRes;
uniform float uRadius;
uniform vec2 uFlow;
uniform vec2 uSpin;
uniform vec3 uAzure;
uniform vec3 uGold;
uniform float uEnergy;
uniform float uWarmth;
uniform float uSwell;
uniform float uLift;
uniform float uGlow;

out vec4 outColor;

// The palette in OKLab, where a blend keeps its colour instead of greying
// out the way an sRGB mix does.
const vec3 INDIGO = vec3(0.5266, -0.0001, -0.2075);
const vec3 AZURE = vec3(0.6884, -0.0540, -0.1605);
const vec3 GOLD = vec3(0.8186, 0.0240, 0.1476);
const vec3 CORAL = vec3(0.7097, 0.1405, 0.0985);
const vec3 HALO = vec3(0.33, 0.43, 1.0);

// Rotating each octave off the lattice hides the grid that value noise has.
const mat3 OCTAVE = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);

float hash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
        mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
        mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  float v = 0.5 * noise(p);
  p = OCTAVE * p * 2.02;
  v += 0.25 * noise(p);
  p = OCTAVE * p * 2.03;
  v += 0.125 * noise(p);
  return v / 0.875;
}

vec3 linearFromOklab(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  return max(vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s), 0.0);
}

vec3 encode(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  float m = min(uRes.x, uRes.y);
  vec2 p = (2.0 * gl_FragCoord.xy - uRes) / m;
  float px = 2.0 / m;
  float r = length(p);
  // A little noise below one step of 8-bit colour, so slow fades do not band.
  float grain = hash(vec3(gl_FragCoord.xy, 5.0)) - 0.5;

  // The silhouette breathes, and with energy it wobbles very slightly.
  vec2 dir = p / max(r, 1e-4);
  float wobble = noise(vec3(dir * 1.4 + uFlow * 0.3, 4.0)) - 0.5;
  float R = uRadius * (1.0 + uSwell + 0.05 * uEnergy * wobble);
  float body = 1.0 - smoothstep(R - 1.25 * px, R + 0.25 * px, r);

  // The halo is measured from a centre a little below the sphere's, so the
  // glow pools underneath it the way the CSS orb's shadow does.
  float d = max(length(p + vec2(0.0, 0.05 * uRadius)) - R, 0.0) / uRadius;
  float halo = uGlow * (0.20 * exp(-7.0 * d) + 0.10 * exp(-2.6 * d));
  halo *= 1.0 - smoothstep(0.84, 1.0, r);
  halo = max(halo + grain / 255.0, 0.0);

  if (body <= 0.0) {
    outColor = vec4(HALO * halo, halo);
    return;
  }

  vec2 q = p / R;
  float ql = length(q);
  float z = sqrt(max(1.0 - ql * ql, 0.0));
  vec3 n = vec3(q, z);
  float rim = 1.0 - z;
  vec2 radial = q / max(ql, 1e-4);

  // Low noise turning with the lights, so their edges move like liquid
  // rather than sliding as rigid shapes.
  vec2 qr = mat2(uSpin.x, uSpin.y, -uSpin.y, uSpin.x) * q;
  vec3 sp = vec3(qr, z) * 1.2 + vec3(uFlow, 0.0);
  float w1 = fbm(sp) - 0.5;
  float w2 = fbm(sp * 1.3 + vec3(3.1, 1.7, 5.3)) - 0.5;
  float amp = 0.35 + 0.45 * uEnergy;

  // Indigo ink lit by two lights inside the glass: a cool azure key, and a
  // warm coral and gold light that lives on the limb. Gold and indigo grey
  // into each other wherever they blend over a distance, so the warm light
  // is held to the rim, and azure gives way wherever it is.
  float wz = 0.6 * smoothstep(0.30, 1.00, dot(n, uAzure) + amp * w1);
  float limb = smoothstep(0.62 - 0.2 * uWarmth, 0.98, ql + 0.12 * w2);
  float warm = dot(n, uGold) + 0.5 * amp * w2;
  float wc = smoothstep(0.30 - 0.2 * uWarmth, 0.85, warm) * limb;
  float wg = smoothstep(0.55 - 0.2 * uWarmth, 1.0, warm) * smoothstep(0.75 - 0.2 * uWarmth, 1.0, ql + 0.1 * w2);
  wz *= 1.0 - wc;

  vec3 lab = INDIGO;
  lab = mix(lab, AZURE, wz);
  lab = mix(lab, CORAL, wc * 0.85);
  lab = mix(lab, GOLD, wg * 0.95);

  // Shading in lightness only, so the hues stay true: lit from the upper
  // left, darker toward the limb for volume, and brighter on the far inner
  // edge where light focused through the ball would land.
  vec3 light = normalize(vec3(-0.5, 0.72, 0.48));
  lab.x *= mix(0.80, 1.06, dot(n, light) * 0.5 + 0.5);
  lab.x *= mix(1.0, 0.8, rim * rim);
  float caustic = smoothstep(0.2, 1.0, dot(radial, -normalize(light.xy)))
    * smoothstep(0.55, 0.92, ql) * (1.0 - smoothstep(0.93, 1.0, ql));
  lab.x += 0.10 * caustic;
  lab.yz *= 1.0 + 0.25 * caustic;
  vec3 color = linearFromOklab(lab);

  // Glass reflects more at grazing angles, so the edge lifts toward a pale
  // version of its own colour: a soft fresnel rim.
  vec3 sheen = linearFromOklab(vec3(0.9, lab.yz * 0.35));
  color = mix(color, sheen, 0.55 * rim * rim * rim);

  float nh = max(dot(n, normalize(light + vec3(0.0, 0.0, 1.0))), 0.0);
  color += 0.9 * pow(nh, 90.0) + 0.07 * pow(nh, 8.0);
  color *= 1.0 + uLift;

  vec3 rgb = clamp(encode(color) + grain / 255.0, 0.0, 1.0);
  float alpha = body + halo * (1.0 - body);
  outColor = vec4(rgb * body + HALO * halo * (1.0 - body), alpha);
}`;

interface Live {
  size: number;
  state: OrbState;
}

interface Engine {
  /** Decides afresh whether to animate, draw one still frame, or rest. */
  sync: () => void;
  kick: () => void;
  destroy: () => void;
}

interface Uniforms {
  res: WebGLUniformLocation | null;
  radius: WebGLUniformLocation | null;
  flow: WebGLUniformLocation | null;
  spin: WebGLUniformLocation | null;
  azure: WebGLUniformLocation | null;
  gold: WebGLUniformLocation | null;
  energy: WebGLUniformLocation | null;
  warmth: WebGLUniformLocation | null;
  swell: WebGLUniformLocation | null;
  lift: WebGLUniformLocation | null;
  glow: WebGLUniformLocation | null;
}

function locate(gl: WebGL2RenderingContext, program: WebGLProgram): Uniforms {
  const at = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(program, name);
  return {
    res: at("uRes"),
    radius: at("uRadius"),
    flow: at("uFlow"),
    spin: at("uSpin"),
    azure: at("uAzure"),
    gold: at("uGold"),
    energy: at("uEnergy"),
    warmth: at("uWarmth"),
    swell: at("uSwell"),
    lift: at("uLift"),
    glow: at("uGlow"),
  };
}

/** Uploads a direction on the sphere, given its angle from the view axis and its turn about it. */
function aim(gl: WebGL2RenderingContext, location: WebGLUniformLocation | null, polar: number, azimuth: number): void {
  const s = Math.sin(polar);
  gl.uniform3f(location, s * Math.cos(azimuth), s * Math.sin(azimuth), Math.cos(polar));
}

/**
 * The renderer, kept outside React. Everything that changes per frame lives
 * in this closure, so a frame never touches component state; React hears
 * from it only when the canvas becomes ready or loses its context.
 */
function createEngine(
  canvas: HTMLCanvasElement,
  live: { readonly current: Live },
  setReady: (ready: boolean) => void,
): Engine {
  const root = document.documentElement;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  let gl: WebGL2RenderingContext | null = null;
  let parallel: KHR_parallel_shader_compile | null = null;
  let program: WebGLProgram | null = null;
  let shaders: WebGLShader[] = [];
  let vao: WebGLVertexArrayObject | null = null;
  let uniforms: Uniforms | null = null;
  let failed = false;
  let drawn = false;
  let frame = 0;
  let last = -1;
  let onScreen = true;
  /** Idle has settled and the loop has stopped on a still frame. */
  let resting = false;

  // Eased values start on the first state's targets, so the orb does not
  // ease in from nothing when it mounts.
  const eased: Tuning = { ...TUNING[live.current.state] };
  // Phases are doubles that only ever grow. The GPU sees only their sines,
  // cosines and unit vectors, so they never lose precision there, and they
  // never wrap, so nothing that depends on them can jump.
  let drift = 0;
  let swirl = 0;
  let warmth = 0;
  let breath = 0;
  let beat = 0;
  let impulse = 0;
  let kick = 0;
  let pulse = 0;

  const moving = (): boolean => !reduce.matches && root.dataset["motion"] !== "paused";
  const visible = (): boolean => onScreen && !document.hidden;
  const active = (): boolean => live.current.state !== "idle" || !resting;

  const request = (): void => {
    if (frame === 0) frame = requestAnimationFrame(tick);
  };

  const cancel = (): void => {
    cancelAnimationFrame(frame);
    frame = 0;
  };

  function release(): void {
    if (gl !== null && !gl.isContextLost()) {
      gl.deleteProgram(program);
      for (const shader of shaders) gl.deleteShader(shader);
      gl.deleteVertexArray(vao);
    }
    program = null;
    shaders = [];
    vao = null;
    uniforms = null;
  }

  function setup(): void {
    failed = false;
    drawn = false;
    const context = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });
    gl = context;
    if (context === null || context.isContextLost()) {
      failed = true;
      return;
    }
    parallel = context.getExtension("KHR_parallel_shader_compile");
    const vertex = context.createShader(context.VERTEX_SHADER);
    const fragment = context.createShader(context.FRAGMENT_SHADER);
    if (vertex === null || fragment === null) {
      failed = true;
      return;
    }
    context.shaderSource(vertex, VERTEX);
    context.shaderSource(fragment, FRAGMENT);
    context.compileShader(vertex);
    context.compileShader(fragment);
    const linked = context.createProgram();
    context.attachShader(linked, vertex);
    context.attachShader(linked, fragment);
    context.linkProgram(linked);
    program = linked;
    shaders = [vertex, fragment];
    vao = context.createVertexArray();
  }

  function settled(): boolean {
    const target = TUNING.idle;
    return impulse < REST && kick < REST && KEYS.every((key) => Math.abs(eased[key] - target[key]) < REST);
  }

  function advance(dt: number, animate: boolean): void {
    const target = TUNING[live.current.state];
    if (!animate) {
      // Motion is off: show the state as it would settle, and hold still.
      Object.assign(eased, target);
      impulse = 0;
      kick = 0;
      pulse = 0;
      return;
    }
    // Exponential easing scaled by the frame's duration, so the orb settles
    // at the same pace on a 60Hz screen and a 120Hz one.
    const k = 1 - Math.exp(-dt * EASE);
    for (const key of KEYS) eased[key] += (target[key] - eased[key]) * k;
    // A keystroke sets an impulse that decays; the kick follows it with a
    // quick attack, so a key press swells the orb instead of snapping it.
    impulse *= Math.exp(-dt * 5);
    kick += (impulse - kick) * (1 - Math.exp(-dt * 30));
    // Phases accumulate speed times time, so a change of speed bends the
    // motion where it is instead of jumping it to a new position. A
    // keystroke also stirs the liquid a little.
    drift += dt * (eased.flow + 0.5 * kick);
    swirl += dt * (eased.swirl + 0.6 * kick);
    warmth += dt * WARMTH_RATE;
    breath += dt * BREATH_RATE;
    beat += dt * BEAT_RATE;
    // Soft-shouldered beats whose strength wanders slowly, like phrasing.
    pulse = eased.beat * Math.pow(0.5 - 0.5 * Math.cos(beat), 1.6) * (0.78 + 0.22 * Math.sin(3 * warmth + 1));
    if (live.current.state === "idle" && settled()) {
      // Idle has arrived: close the last hundredth and let the loop end.
      Object.assign(eased, target);
      impulse = 0;
      kick = 0;
      pulse = 0;
      resting = true;
    }
  }

  function draw(context: WebGL2RenderingContext, u: Uniforms, animate: boolean): void {
    const { size } = live.current;
    const span = size + Math.round(size * BLEED) * 2;
    const pixels = Math.max(1, Math.round(span * Math.min(window.devicePixelRatio || 1, MAX_DPR)));
    if (canvas.width !== pixels || canvas.height !== pixels) {
      canvas.width = pixels;
      canvas.height = pixels;
    }
    const breathing = animate ? eased.breath * 0.012 * Math.sin(breath) : 0;
    context.viewport(0, 0, pixels, pixels);
    context.clear(context.COLOR_BUFFER_BIT);
    context.uniform2f(u.res, pixels, pixels);
    context.uniform1f(u.radius, size / span);
    context.uniform2f(u.flow, Math.cos(drift / LOOP) * LOOP, Math.sin(drift / LOOP) * LOOP);
    context.uniform2f(u.spin, Math.cos(swirl), Math.sin(swirl));
    // The two lights wander on incommensurate rhythms and turn in opposite
    // directions, so the liquid shears instead of spinning as one piece.
    aim(context, u.azure, 0.75 + 0.25 * Math.sin(drift * 0.8 + 0.4), 2.4 + swirl + 0.5 * Math.sin(drift * 0.6));
    aim(
      context,
      u.gold,
      1.25 + 0.12 * Math.sin(drift * 1.1 + 2),
      2.4 + Math.PI - 0.75 * swirl + 0.45 * Math.sin(drift * 0.7 + 1),
    );
    context.uniform1f(u.energy, eased.energy);
    context.uniform1f(u.warmth, eased.warmth * (0.5 - 0.5 * Math.cos(warmth)));
    context.uniform1f(u.swell, breathing + 0.014 * pulse + 0.03 * kick);
    context.uniform1f(u.lift, 0.05 * pulse + 0.1 * kick);
    context.uniform1f(u.glow, eased.glow + 0.15 * pulse + 0.4 * kick);
    context.drawArrays(context.TRIANGLES, 0, 3);
  }

  function report(context: WebGL2RenderingContext, linked: WebGLProgram): void {
    if (process.env.NODE_ENV === "production") return;
    const logs = [context.getProgramInfoLog(linked), ...shaders.map((shader) => context.getShaderInfoLog(shader))];
    console.warn("ShaderOrb is showing the CSS orb instead:", ...logs.filter(Boolean));
  }

  function tick(time: number): void {
    frame = 0;
    const context = gl;
    const linked = program;
    if (context === null || linked === null || failed) return;
    let u = uniforms;
    if (u === null) {
      // With parallel compilation, asking for the link status before the
      // driver is done would stall the main thread, so poll a frame at a time.
      if (parallel !== null && context.getProgramParameter(linked, parallel.COMPLETION_STATUS_KHR) !== true) {
        request();
        return;
      }
      if (context.getProgramParameter(linked, context.LINK_STATUS) !== true) {
        report(context, linked);
        failed = true;
        release();
        return;
      }
      u = locate(context, linked);
      uniforms = u;
      context.useProgram(linked);
      context.bindVertexArray(vao);
      context.clearColor(0, 0, 0, 0);
    }
    const animate = moving() && visible() && active();
    const dt = animate && last >= 0 ? Math.min((time - last) / 1000, 0.1) : 0;
    last = animate ? time : -1;
    advance(dt, animate);
    draw(context, u, animate);
    if (!drawn) {
      drawn = true;
      setReady(true);
    }
    if (animate && active()) request();
  }

  function sync(): void {
    if (gl === null || failed) return;
    if (live.current.state !== "idle") resting = false;
    // Offscreen or in a hidden tab there is nothing to draw at all.
    if (!visible()) {
      cancel();
      last = -1;
      return;
    }
    if (moving() && active()) {
      if (frame === 0) last = -1;
      request();
      return;
    }
    // Still, because motion is off or idle has come to rest: draw one frame
    // of the state as it stands, then stop.
    cancel();
    last = -1;
    request();
  }

  const onLost = (event: Event): void => {
    // Without preventDefault the browser never offers the context back.
    event.preventDefault();
    cancel();
    // Everything on the GPU died with the context; forget it rather than delete it.
    program = null;
    shaders = [];
    vao = null;
    uniforms = null;
    setReady(false);
  };

  const onRestored = (): void => {
    setup();
    sync();
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[entries.length - 1];
      if (entry === undefined) return;
      onScreen = entry.isIntersecting;
      sync();
    },
    { rootMargin: "64px" },
  );

  // The motion toggle pauses decorative motion by setting data-motion on <html>.
  const watcher = new MutationObserver(sync);

  observer.observe(canvas);
  watcher.observe(root, { attributes: true, attributeFilter: ["data-motion"] });
  reduce.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("resize", sync);
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  setup();
  sync();

  return {
    sync,
    kick() {
      if (!moving() || !visible()) return;
      impulse = Math.min(impulse + 0.6, 1.2);
      // Even at rest a keystroke wakes the loop, which draws until the pulse
      // has decayed and then stops again if the orb is still idle.
      resting = false;
      sync();
    },
    destroy() {
      cancel();
      observer.disconnect();
      watcher.disconnect();
      reduce.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("resize", sync);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      // Deleted, not lost: StrictMode mounts twice on the same canvas, and a
      // context lost on purpose with loseContext() cannot be had back.
      release();
    },
  };
}

/**
 * The assistant's living presence: a glass sphere of indigo ink lit from
 * inside by a cool azure light and a warm coral and gold one on its rim,
 * drawn with WebGL2 where the CSS orb is a turning gradient.
 *
 * The CSS orb is always rendered underneath and the canvas fades in over it
 * only once the shader has compiled and drawn, so a browser without WebGL2,
 * a failed compile or a lost context all leave the familiar orb in place. The
 * S is drawn once, above both, so the mark survives every swap.
 *
 * Motion means something. Idle eases to a stop and the loop ends, leaving a
 * still frame that costs nothing; listening stirs and swells with each
 * keystroke, thinking turns faster as its warm light swells and recedes, and
 * writing pulses gently, about five times a second. The loop also stops when
 * the orb is offscreen or the tab is hidden, and under reduced motion, or
 * while decorative motion is paused, every state is a single still frame.
 */
export function ShaderOrb({
  size = 40,
  state = "idle",
  listen = false,
  className = "",
}: {
  size?: number;
  state?: OrbState;
  listen?: boolean;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const live = useRef<Live>({ size, state });
  const [ready, setReady] = useState(false);
  const { onKeystroke } = useActivity();

  useEffect(() => {
    live.current.size = size;
    live.current.state = state;
    engine.current?.sync();
  }, [size, state]);

  useEffect(() => {
    const element = canvas.current;
    if (element === null) return;
    const created = createEngine(element, live, setReady);
    engine.current = created;
    return () => {
      created.destroy();
      engine.current = null;
    };
  }, []);

  useEffect(() => {
    if (!listen) return;
    return onKeystroke(() => {
      engine.current?.kick();
    });
  }, [listen, onKeystroke]);

  const bleed = Math.round(size * BLEED);

  return (
    <span
      aria-hidden
      className={`${styles.root} ${className}`}
      data-ready={ready ? "" : undefined}
      style={{ width: size, height: size }}
    >
      {/* Until the canvas is ready the fallback answers keystrokes itself, so
          a browser without WebGL2 keeps the ripple. */}
      <Orb size={size} state={state} listen={listen && !ready} className={styles.fallback} />
      <canvas
        ref={canvas}
        className={styles.canvas}
        style={{ left: -bleed, top: -bleed, width: size + bleed * 2, height: size + bleed * 2 }}
      />
      <span className={`orb-glyph ${styles.glyph}`} style={{ fontSize: Math.round(size * 0.46) }}>
        S
      </span>
    </span>
  );
}
