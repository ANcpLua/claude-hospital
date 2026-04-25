"use client";

import React, { useRef, useMemo, useCallback, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { cn } from "@/lib/utils";
import * as THREE from "three";

export interface HalftoneWaveProps {
  /** Container width */
  width?: string | number;
  /** Container height */
  height?: string | number;
  /** Additional CSS classes */
  className?: string;
  /** Content rendered above the effect */
  children?: React.ReactNode;
  /** Animation speed multiplier */
  speed?: number;
  /** Noise field scale — higher values create smaller, denser noise features */
  noiseScale?: number;
  /** Number of FBM octaves (1–6). More octaves = finer detail */
  octaves?: number;
  /** Number of dots per screen-width */
  gridDensity?: number;
  /** Maximum dot radius as fraction of cell (0–1) */
  dotSize?: number;
  /** Dot edge softness — higher = blurrier edges */
  softness?: number;
  /** Lower bound of noise contrast remap */
  contrastMin?: number;
  /** Upper bound of noise contrast remap */
  contrastMax?: number;
  /** Horizontal scroll speed of the noise field */
  scrollX?: number;
  /** Vertical scroll speed of the noise field */
  scrollY?: number;
  /** Rotation angle in degrees */
  rotation?: number;
  /** Primary dot color at low noise values (hex) */
  colorA?: string;
  /** Secondary dot color at high noise values (hex) */
  colorB?: string;
  /** Background color (hex) */
  backgroundColor?: string;
  /** Master opacity (0–1) */
  opacity?: number;
  /** Enable cursor interaction to boost dot size near pointer */
  cursorInteraction?: boolean;
}

const VERTEX_SHADER = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform float uTime;
uniform vec2  uRes;
uniform float uSpeed;
uniform float uNoiseScale;
uniform int   uOctaves;
uniform float uGridDensity;
uniform float uDotSize;
uniform float uSoftness;
uniform float uContrastMin;
uniform float uContrastMax;
uniform float uScrollX;
uniform float uScrollY;
uniform float uRotation;
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform vec3  uBg;
uniform float uAlpha;
uniform vec2  uPointer;
uniform float uCursorActive;

varying vec2 vUv;

float hash(vec2 st) {
  return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453123);
}

float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 st) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 6; i++) {
    if (i >= uOctaves) break;
    value += amplitude * valueNoise(st);
    st *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  float t = uTime * uSpeed;

  vec2 uv = gl_FragCoord.xy / uRes;
  uv.x *= uRes.x / uRes.y;

  vec2 center = vec2((uRes.x / uRes.y) * 0.5, 0.5);
  vec2 rotUv = uv - center;
  float cr = cos(uRotation);
  float sr = sin(uRotation);
  rotUv = mat2(cr, -sr, sr, cr) * rotUv;
  uv = rotUv + center;

  vec2 noiseUV = uv * uNoiseScale + vec2(t * uScrollX, t * uScrollY);
  float n = fbm(noiseUV);

  n = smoothstep(uContrastMin, uContrastMax, n);

  vec2 gridUV = uv * uGridDensity;
  vec2 cellUV = fract(gridUV) - 0.5;
  float dist = length(cellUV);

  vec2 pointerUv = vec2(uPointer.x * (uRes.x / uRes.y), uPointer.y);
  float cursorDist = length(uv - pointerUv);
  float cursorBoost = smoothstep(0.35, 0.0, cursorDist) * 0.3 * uCursorActive;

  float targetRadius = n * uDotSize + cursorBoost;
  float dotMask = smoothstep(targetRadius + uSoftness, targetRadius - uSoftness, dist);

  vec3 dotColor = mix(uColorA, uColorB, n);
  vec3 finalColor = mix(uBg, dotColor, dotMask);

  gl_FragColor = vec4(finalColor, uAlpha);
}
`;

function parseHexColor(hex: string): [number, number, number] {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return [0, 0, 0];
  return [
    parseInt(match[1], 16) / 255,
    parseInt(match[2], 16) / 255,
    parseInt(match[3], 16) / 255,
  ];
}

interface WaveSceneProps {
  speed: number;
  noiseScale: number;
  octaves: number;
  gridDensity: number;
  dotSize: number;
  softness: number;
  contrastMin: number;
  contrastMax: number;
  scrollX: number;
  scrollY: number;
  rotation: number;
  colorARgb: [number, number, number];
  colorBRgb: [number, number, number];
  bgRgb: [number, number, number];
  opacity: number;
  pointer: [number, number];
  cursorInteraction: boolean;
}

const WaveScene: React.FC<WaveSceneProps> = ({
  speed,
  noiseScale,
  octaves,
  gridDensity,
  dotSize,
  softness,
  contrastMin,
  contrastMax,
  scrollX,
  scrollY,
  rotation,
  colorARgb,
  colorBRgb,
  bgRgb,
  opacity,
  pointer,
  cursorInteraction,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { size, viewport } = useThree();
  const smoothPointer = useRef(new THREE.Vector2(0.5, 0.5));

  const shaderUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2() },
      uSpeed: { value: speed },
      uNoiseScale: { value: noiseScale },
      uOctaves: { value: octaves },
      uGridDensity: { value: gridDensity },
      uDotSize: { value: dotSize },
      uSoftness: { value: softness },
      uContrastMin: { value: contrastMin },
      uContrastMax: { value: contrastMax },
      uScrollX: { value: scrollX },
      uScrollY: { value: scrollY },
      uRotation: { value: (rotation * Math.PI) / 180 },
      uColorA: { value: new THREE.Vector3(...colorARgb) },
      uColorB: { value: new THREE.Vector3(...colorBRgb) },
      uBg: { value: new THREE.Vector3(...bgRgb) },
      uAlpha: { value: opacity },
      uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uCursorActive: { value: 0 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.ShaderMaterial;

    mat.uniforms.uTime.value = state.clock.elapsedTime;
    mat.uniforms.uRes.value.set(
      size.width * viewport.dpr,
      size.height * viewport.dpr,
    );
    mat.uniforms.uSpeed.value = speed;
    mat.uniforms.uNoiseScale.value = noiseScale;
    mat.uniforms.uOctaves.value = octaves;
    mat.uniforms.uGridDensity.value = gridDensity;
    mat.uniforms.uDotSize.value = dotSize;
    mat.uniforms.uSoftness.value = softness;
    mat.uniforms.uContrastMin.value = contrastMin;
    mat.uniforms.uContrastMax.value = contrastMax;
    mat.uniforms.uScrollX.value = scrollX;
    mat.uniforms.uScrollY.value = scrollY;
    mat.uniforms.uRotation.value = (rotation * Math.PI) / 180;
    mat.uniforms.uColorA.value.set(...colorARgb);
    mat.uniforms.uColorB.value.set(...colorBRgb);
    mat.uniforms.uBg.value.set(...bgRgb);
    mat.uniforms.uAlpha.value = opacity;
    mat.uniforms.uCursorActive.value = cursorInteraction ? 1 : 0;

    const ease = 1 - Math.exp(-delta / 0.15);
    smoothPointer.current.x += (pointer[0] - smoothPointer.current.x) * ease;
    smoothPointer.current.y += (pointer[1] - smoothPointer.current.y) * ease;
    mat.uniforms.uPointer.value.set(
      smoothPointer.current.x,
      smoothPointer.current.y,
    );
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={shaderUniforms}
        transparent
      />
    </mesh>
  );
};

const HalftoneWave: React.FC<HalftoneWaveProps> = ({
  width = "100%",
  height = "100%",
  className,
  children,
  speed = 1.0,
  noiseScale = 3.0,
  octaves = 3,
  gridDensity = 40.0,
  dotSize = 0.75,
  softness = 0.35,
  contrastMin = 0.2,
  contrastMax = 0.8,
  scrollX = 0.1,
  scrollY = 0.1,
  rotation = 0,
  colorA = "#FFFFFF",
  colorB = "#000000",
  backgroundColor = "#FFFFFF",
  opacity = 1,
  cursorInteraction = false,
}) => {
  const colorARgb = useMemo(() => parseHexColor(colorA), [colorA]);
  const colorBRgb = useMemo(() => parseHexColor(colorB), [colorB]);
  const bgRgb = useMemo(
    () => parseHexColor(backgroundColor),
    [backgroundColor],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [pointer, setPointer] = useState<[number, number]>([0.5, 0.5]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!cursorInteraction) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = 1 - (e.clientY - rect.top) / rect.height;
      setPointer([nx, ny]);
    },
    [cursorInteraction],
  );

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden", className)}
      style={{ width, height, backgroundColor }}
      onPointerMove={handlePointerMove}
    >
      <Canvas
        className="absolute inset-0 h-full w-full"
        orthographic
        camera={{
          position: [0, 0, 1],
          zoom: 1,
          left: -1,
          right: 1,
          top: 1,
          bottom: -1,
        }}
        gl={{ antialias: true, alpha: true }}
      >
        <WaveScene
          speed={speed}
          noiseScale={noiseScale}
          octaves={octaves}
          gridDensity={gridDensity}
          dotSize={dotSize}
          softness={softness}
          contrastMin={contrastMin}
          contrastMax={contrastMax}
          scrollX={scrollX}
          scrollY={scrollY}
          rotation={rotation}
          colorARgb={colorARgb}
          colorBRgb={colorBRgb}
          bgRgb={bgRgb}
          opacity={opacity}
          pointer={pointer}
          cursorInteraction={cursorInteraction}
        />
      </Canvas>
      {children && (
        <div className="pointer-events-none relative z-10">{children}</div>
      )}
    </div>
  );
};

HalftoneWave.displayName = "HalftoneWave";

export default HalftoneWave;
