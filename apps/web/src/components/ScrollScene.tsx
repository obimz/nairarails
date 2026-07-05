/**
 * ScrollScene.tsx — scroll-driven 3D narrative for NairaRails landing page.
 *
 * Architecture:
 *  - One fixed Canvas covering the full viewport, behind all HTML content
 *  - A single `scrollProgress` value (0–1) drives everything: camera position,
 *    material colors, geometry visibility, animation speeds
 *  - GSAP ScrollTrigger maps the HTML scroll position → scrollProgress ref
 *  - Zero DOM nodes inside Canvas (optimized using CanvasTextures for labels)
 *
 * Seven acts (scroll 0 → 1):
 *  0.00 – 0.20  ACT 1 CHAOS     Many red lines converging on a single bottleneck node.
 *  0.20 – 0.40  ACT 2 PROBLEM   Glitch on a line, Naira glyph appears.
 *  0.40 – 0.60  ACT 3 TURN      Chaos snap into clean parallel rails with NUBAN labels.
 *  0.60 – 0.75  ACT 4 SOLUTION  Bright green pulse splits into seller, platform, rider.
 *  0.75 – 0.90  ACT 5 PROOF     Camera pans left to align rails with the dashboard mock.
 *  0.90 – 0.95  ACT 6 TRUST     High-tech grid overlay maps HMAC/idempotency logs.
 *  0.95 – 1.00  ACT 7 CLOSE     Logo/re reconciled wide network.
 */

import React from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// ─── Shared scroll progress ref (written by HTML scroll, read by WebGL) ───────
export const scrollRef = { current: 0 };

// ─── Math helpers ─────────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function invlerp(a: number, b: number, v: number) {
  return Math.max(0, Math.min(1, (v - a) / (b - a)));
}

function phase(start: number, end: number, p: number) {
  return invlerp(start, end, p);
}

// ─── Text & Label texture helpers (zero per-frame DOM cost) ────────────────────
function createLabelTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "transparent";
  ctx.clearRect(0, 0, 512, 128);

  // Pill background
  ctx.fillStyle = "rgba(10, 14, 20, 0.9)"; // --rail-night
  ctx.beginPath();
  ctx.roundRect(10, 10, 492, 108, 16);
  ctx.fill();

  // Border
  ctx.strokeStyle = "rgba(124, 136, 150, 0.35)"; // --muted-slate
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Text
  ctx.fillStyle = "#EDEEEB"; // --ledger-white
  ctx.font = "bold 32px 'JetBrains Mono', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 64);

  return new THREE.CanvasTexture(canvas);
}

function createNairaGlyphTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "transparent";
  ctx.clearRect(0, 0, 512, 512);

  // Draw glowing ₦ sign
  ctx.fillStyle = "rgba(22, 169, 123, 0.08)";
  ctx.font = "bold 420px 'Space Grotesk', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("₦", 256, 256);

  ctx.strokeStyle = "rgba(22, 169, 123, 0.3)";
  ctx.lineWidth = 4;
  ctx.strokeText("₦", 256, 256);

  return new THREE.CanvasTexture(canvas);
}

// ─── Constants ───────────────────────────────────────────────────────────────
const CENTER = new THREE.Vector3(0, 0, 0);

const NUM_LINES = 12;
const RAIL_YS = [1.0, 0.5, 0.0, -0.5, -1.0];
const RAIL_YS_FOR_LINE = [1.0, 1.0, 0.5, 0.5, 0.0, 0.0, 0.0, -0.5, -0.5, -1.0, -1.0, -1.0];

const RAIL_LABELS = [
  "Nomba/Wema · 9900281721",
  "Nomba/GTB · 9900482711",
  "Nomba/Access · 9900192837",
  "Nomba/UBA · 9900827361",
  "Nomba/Nomba · 9900726152",
];

const CHAOS_ORIGINS = [
  new THREE.Vector3(-3.5, 2.5, -1.5),
  new THREE.Vector3(-4.0, 1.0, 1.5),
  new THREE.Vector3(-3.0, -2.0, -2.0),
  new THREE.Vector3(-3.5, -1.0, 2.0),
  new THREE.Vector3(-4.2, 0.0, -0.5),
  new THREE.Vector3(-3.8, 1.8, -0.8),
  new THREE.Vector3(-3.2, -0.8, -1.2),
  new THREE.Vector3(-4.5, -2.2, 0.8),
  new THREE.Vector3(-3.0, 0.5, 1.2),
  new THREE.Vector3(-4.1, 2.2, 0.5),
  new THREE.Vector3(-3.6, -1.5, -0.2),
  new THREE.Vector3(-3.9, -0.2, 0.9),
];

// ─── Dynamic Line Component (Interpolates Chaos -> Parallel) ──────────────────
interface DynamicLineProps {
  index: number;
  chaosOrigin: THREE.Vector3;
  gridY: number;
  progress: number;
  clockTime: number;
}

function DynamicLine({ index, chaosOrigin, gridY, progress, clockTime }: DynamicLineProps) {
  const geomRef = React.useRef<THREE.BufferGeometry>(null);
  const SEGMENTS = 20;
  const pointsArray = React.useMemo(() => new Float32Array((SEGMENTS + 1) * 3), []);

  React.useEffect(() => {
    if (!geomRef.current) return;
    geomRef.current.setAttribute("position", new THREE.BufferAttribute(pointsArray, 3));
  }, [pointsArray]);

  useFrame(() => {
    if (!geomRef.current) return;

    const snapProgress = phase(0.40, 0.60, progress);

    for (let j = 0; j <= SEGMENTS; j++) {
      const t_seg = j / SEGMENTS;

      // Parallel rail point
      const gridX = -4.0 + t_seg * 8.0;
      const zOffset = ((index % 3) - 1) * 0.06; // Small lateral layout separation
      const gridPos = new THREE.Vector3(gridX, gridY, zOffset);

      // Chaotic converging point
      const chaosPos = chaosOrigin.clone().lerp(CENTER, t_seg);
      if (t_seg < 1.0) {
        const amp = 0.85 * (1 - t_seg);
        chaosPos.y += Math.sin(t_seg * Math.PI * 2.5 + clockTime * 1.4 + index) * amp;
        chaosPos.z += Math.cos(t_seg * Math.PI * 2.0 + clockTime * 1.6 + index) * amp;
      }

      // Interpolate
      const finalPos = chaosPos.lerp(gridPos, snapProgress);

      const idx = j * 3;
      pointsArray[idx] = finalPos.x;
      pointsArray[idx + 1] = finalPos.y;
      pointsArray[idx + 2] = finalPos.z;
    }

    const attr = geomRef.current.getAttribute("position") as THREE.BufferAttribute;
    attr.needsUpdate = true;
  });

  // Glitch representation
  const isGlitched = index === 5 && progress >= 0.20 && progress < 0.40;
  let color = "#16A97B"; // settlement green
  if (progress < 0.40) {
    color = isGlitched
      ? (Math.sin(clockTime * 24) > 0 ? "#dc2626" : "#0A0E14") // Flashing red glitch
      : "#E8A33D"; // Amber warnings
  }

  const fadeOut = phase(0.90, 0.98, progress);
  const opacity = (progress < 0.40 ? 0.35 : 0.65) * (1 - fadeOut);

  return (
    <line>
      <bufferGeometry ref={geomRef} />
      <lineBasicMaterial color={color} linewidth={1} transparent opacity={opacity} />
    </line>
  );
}

// ─── Bottleneck Single Point (Act 1-2) ───────────────────────────────────────
function SharedAccountNode({ progress, clockTime }: { progress: number; clockTime: number }) {
  const meshRef = React.useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!meshRef.current) return;
    const fadeOut = phase(0.38, 0.52, progress);
    const opacity = 1 - fadeOut;
    meshRef.current.visible = opacity > 0.01;
    if (!meshRef.current.visible) return;

    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    mat.opacity = opacity;

    const isGlitched = progress >= 0.20 && progress < 0.40;
    if (isGlitched) {
      const s = 0.22 + Math.sin(clockTime * 28) * 0.04;
      meshRef.current.scale.setScalar(s);
      mat.emissive.setHex(Math.sin(clockTime * 18) > 0 ? 0xdc2626 : 0x7c2d12);
    } else {
      const s = 0.18 + Math.sin(clockTime * 1.2) * 0.015;
      meshRef.current.scale.setScalar(s);
      mat.emissive.setHex(0xe8a33d);
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 32, 32]} />
      <meshStandardMaterial
        color="#0A0E14"
        emissive="#e8a33d"
        emissiveIntensity={2.8}
        transparent
      />
    </mesh>
  );
}

// ─── Bank nodes (Act 3-5) ────────────────────────────────────────────────────
function TrackNodes({ progress, clockTime }: { progress: number; clockTime: number }) {
  const meshRefs = React.useRef<(THREE.Mesh | null)[]>([]);

  useFrame(() => {
    const appear = phase(0.48, 0.62, progress);
    const fadeOut = phase(0.90, 0.98, progress);
    const opacity = appear * (1 - fadeOut * 0.3);

    meshRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      mesh.visible = opacity > 0.01;
      if (!mesh.visible) return;

      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = opacity;

      const s = 0.08 * (1 + Math.sin(clockTime * 1.8 + i) * 0.06);
      mesh.scale.setScalar(s);
    });
  });

  return (
    <>
      {RAIL_YS.map((y, i) => (
        <mesh
          key={i}
          ref={(el) => { meshRefs.current[i] = el; }}
          position={[-2.5, y, 0]}
        >
          <sphereGeometry args={[1, 24, 24]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#16A97B"
            emissiveIntensity={3.2}
            transparent
            opacity={0}
          />
        </mesh>
      ))}
    </>
  );
}

// ─── NUBAN Labels (Act 3-5) ──────────────────────────────────────────────────
function TrackLabels({ progress }: { progress: number }) {
  const meshRefs = React.useRef<(THREE.Mesh | null)[]>([]);
  const labelTextures = React.useMemo(() => RAIL_LABELS.map(createLabelTexture), []);

  useFrame(() => {
    meshRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const appear = phase(0.50 + i * 0.02, 0.64 + i * 0.02, progress);
      const fadeOut = phase(0.90, 0.98, progress);
      const opacity = appear * (1 - fadeOut);

      mesh.visible = opacity > 0.01;
      if (!mesh.visible) return;

      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = opacity;
    });
  });

  return (
    <>
      {RAIL_YS.map((y, i) => (
        <mesh
          key={i}
          ref={(el) => { meshRefs.current[i] = el; }}
          position={[-2.5, y + 0.28, 0.05]}
        >
          <planeGeometry args={[1.1, 0.28]} />
          <meshBasicMaterial
            map={labelTextures[i] ?? null}
            transparent
            alphaTest={0.001}
            depthWrite={false}
            opacity={0}
          />
        </mesh>
      ))}
    </>
  );
}

// ─── Floating ₦ Glyph (Act 2) ─────────────────────────────────────────────────
function NairaGlyph({ progress }: { progress: number }) {
  const meshRef = React.useRef<THREE.Mesh>(null);
  const texture = React.useMemo(() => createNairaGlyphTexture(), []);

  useFrame(() => {
    if (!meshRef.current) return;
    const appear = phase(0.20, 0.32, progress);
    const disappear = phase(0.36, 0.44, progress);
    const opacity = appear * (1 - disappear);
    meshRef.current.visible = opacity > 0.01;

    if (!meshRef.current.visible) return;

    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = opacity;
    const scale = 3.6 * (1.0 + phase(0.20, 0.40, progress) * 0.20);
    meshRef.current.scale.set(scale, scale, 1.0);
  });

  return (
    <mesh ref={meshRef} position={[0, 0, -1.0]}>
      <planeGeometry args={[1.0, 1.0]} />
      <meshBasicMaterial
        map={texture}
        transparent
        alphaTest={0.001}
        depthWrite={false}
        opacity={0}
      />
    </mesh>
  );
}

// ─── Branching Split Settlements & Pulses (Act 4) ──────────────────────────────
const BRANCH_LABELS = ["Seller (85%)", "Platform (10%)", "Rider (5%)"];
const BRANCH_DESTINATIONS = [
  new THREE.Vector3(3.0, 0.5, 0),
  new THREE.Vector3(3.0, 0.0, 0),
  new THREE.Vector3(3.0, -0.5, 0),
];

function BranchingSplits({ progress, clockTime }: { progress: number; clockTime: number }) {
  const groupRef = React.useRef<THREE.Group>(null);
  const splitterRef = React.useRef<THREE.Mesh>(null);
  const destRefs = React.useRef<(THREE.Mesh | null)[]>([]);
  const labelRefs = React.useRef<(THREE.Mesh | null)[]>([]);
  const pulseRefs = React.useRef<(THREE.Mesh | null)[]>([]);
  const mainPulseRef = React.useRef<THREE.Mesh>(null);

  const branchTextures = React.useMemo(() => BRANCH_LABELS.map(createLabelTexture), []);

  useFrame(() => {
    if (!groupRef.current) return;

    const sectionOpacity = phase(0.58, 0.70, progress) * (1 - phase(0.90, 0.98, progress));
    groupRef.current.visible = sectionOpacity > 0.01;
    if (!groupRef.current.visible) return;

    if (splitterRef.current) {
      const s = 0.08 * (1 + Math.sin(clockTime * 2.8) * 0.05) * sectionOpacity;
      splitterRef.current.scale.setScalar(s);
      const mat = splitterRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = sectionOpacity;
    }

    destRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = sectionOpacity;

      const burstProgress = phase(0.73, 0.76, progress);
      const s = 0.08 * (1 + Math.sin(burstProgress * Math.PI) * 1.1) * sectionOpacity;
      mesh.scale.setScalar(s);
    });

    labelRefs.current.forEach((mesh) => {
      if (!mesh) return;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = sectionOpacity;
    });

    // Main traveling pulse (x = -2.5 -> x = 1.0)
    const mainPulseActive = progress >= 0.60 && progress < 0.66;
    if (mainPulseRef.current) {
      mainPulseRef.current.visible = mainPulseActive;
      if (mainPulseActive) {
        const t_pulse = phase(0.60, 0.66, progress);
        const px = lerp(-2.5, 1.0, t_pulse);
        mainPulseRef.current.position.set(px, 0.0, 0.05);
        mainPulseRef.current.scale.setScalar(0.08 * (1 + Math.sin(t_pulse * Math.PI) * 0.4));
      }
    }

    // Split branch pulses (x = 1.0 -> dest)
    const splitPulsesActive = progress >= 0.66 && progress < 0.73;
    pulseRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      mesh.visible = splitPulsesActive;
      if (splitPulsesActive) {
        const t_pulse = phase(0.66, 0.73, progress);
        const dest = BRANCH_DESTINATIONS[i];
        if (dest) {
          const px = lerp(1.0, dest.x, t_pulse);
          const py = lerp(0.0, dest.y, t_pulse);
          mesh.position.set(px, py, 0.05);
          mesh.scale.setScalar(0.065 * (1 + Math.sin(t_pulse * Math.PI) * 0.4));
        }
      }
    });
  });

  const splitterPos = new THREE.Vector3(1.0, 0.0, 0);

  return (
    <group ref={groupRef}>
      {/* Junction/Splitter node */}
      <mesh ref={splitterRef} position={splitterPos}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#16A97B"
          emissiveIntensity={3}
          transparent
          opacity={0}
        />
      </mesh>

      {/* Split channels */}
      {BRANCH_DESTINATIONS.map((dest, i) => (
        <Line
          key={i}
          points={[splitterPos, dest]}
          color="#16A97B"
          opacity={0.35}
          transparent
          lineWidth={0.8}
        />
      ))}

      {/* Split destinations */}
      {BRANCH_DESTINATIONS.map((dest, i) => (
        <mesh
          key={`dest-${i}`}
          ref={(el) => { destRefs.current[i] = el; }}
          position={dest}
        >
          <sphereGeometry args={[1, 24, 24]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#16A97B"
            emissiveIntensity={3.2}
            transparent
            opacity={0}
          />
        </mesh>
      ))}

      {/* Destination text labels */}
      {BRANCH_DESTINATIONS.map((dest, i) => (
        <mesh
          key={`dest-label-${i}`}
          ref={(el) => { labelRefs.current[i] = el; }}
          position={[dest.x + 0.1, dest.y + 0.22, 0.05]}
        >
          <planeGeometry args={[0.9, 0.22]} />
          <meshBasicMaterial
            map={branchTextures[i] ?? null}
            transparent
            alphaTest={0.001}
            depthWrite={false}
            opacity={0}
          />
        </mesh>
      ))}

      {/* Main NUBAN pulse */}
      <mesh ref={mainPulseRef} visible={false}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#16A97B"
          emissiveIntensity={6}
          roughness={0}
        />
      </mesh>

      {/* Three splits */}
      {BRANCH_DESTINATIONS.map((_, i) => (
        <mesh
          key={`pulse-${i}`}
          ref={(el) => { pulseRefs.current[i] = el; }}
          visible={false}
        >
          <sphereGeometry args={[1, 12, 12]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#16A97B"
            emissiveIntensity={5}
            roughness={0}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─── Trust Grid background (Act 6) ───────────────────────────────────────────
function TrustGrid({ progress }: { progress: number }) {
  const gridRef = React.useRef<THREE.GridHelper>(null);

  useFrame(() => {
    if (!gridRef.current) return;
    const appear = phase(0.88, 0.94, progress);
    const fadeOut = phase(0.96, 1.00, progress);
    const opacity = appear * (1 - fadeOut * 0.4) * 0.15;
    gridRef.current.visible = opacity > 0.01;
    if (gridRef.current.visible) {
      const mat = gridRef.current.material as THREE.LineBasicMaterial;
      mat.opacity = opacity;
    }
  });

  return (
    <gridHelper
      ref={gridRef}
      args={[16, 16, "#16A97B", "#1C2430"]}
      rotation={[Math.PI / 2.5, 0, 0]}
      position={[0, 0, -2.5]}
    />
  );
}

// ─── StarField (ambient depth) ────────────────────────────────────────────────
function StarField() {
  const COUNT = 350;
  const posArr = React.useMemo(() => {
    const a = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      a[i * 3] = (Math.random() - 0.5) * 20;
      a[i * 3 + 1] = (Math.random() - 0.5) * 20;
      a[i * 3 + 2] = (Math.random() - 0.5) * 10 - 2;
    }
    return a;
  }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[posArr, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#475569"
        size={0.018}
        sizeAttenuation
        transparent
        opacity={0.5}
        depthWrite={false}
      />
    </points>
  );
}

// ─── Camera Controller (continuous 7-act interpolation) ────────────────────────
const CAM_KEYFRAMES = [
  // [scroll, camX, camY, camZ, lookAtX, lookAtY]
  [0.00, 0.0, 0.2, 7.5, 0.0, 0.0], // Act 1: far back
  [0.20, 0.0, 0.1, 6.0, 0.0, 0.0], // Act 2: push in
  [0.40, 0.0, 0.0, 4.5, 0.0, 0.0], // Act 3: snap turn
  [0.60, 0.0, 0.0, 3.8, 0.0, 0.0], // Act 4: split pulse
  [0.75, -1.8, 0.2, 5.0, -0.8, 0.0], // Act 5: shift left for mock
  [0.90, -1.8, 0.1, 5.2, -0.8, 0.0], // Act 6: maintain left for trust
  [1.00, 0.0, 0.1, 6.5, 0.0, 0.0], // Act 7: center wide
] as const;

function CameraController() {
  const { camera } = useThree();

  useFrame(() => {
    const p = scrollRef.current;

    let i = 0;
    while (i < CAM_KEYFRAMES.length - 2 && (CAM_KEYFRAMES[i + 1]?.[0] ?? 1) <= p) i++;

    const ka = CAM_KEYFRAMES[i];
    const kb = CAM_KEYFRAMES[i + 1] ?? CAM_KEYFRAMES[CAM_KEYFRAMES.length - 1];
    if (!ka || !kb) return;

    const t = invlerp(ka[0], kb[0], p);

    const tx = lerp(ka[1], kb[1], t);
    const ty = lerp(ka[2], kb[2], t);
    const tz = lerp(ka[3], kb[3], t);
    const lax = lerp(ka[4], kb[4], t);
    const lay = lerp(ka[5], kb[5], t);

    camera.position.x = lerp(camera.position.x, tx, 0.05);
    camera.position.y = lerp(camera.position.y, ty, 0.05);
    camera.position.z = lerp(camera.position.z, tz, 0.05);
    camera.lookAt(lax, lay, 0);
  });

  return null;
}

// ─── Scene Root ───────────────────────────────────────────────────────────────
function Scene() {
  const p = scrollRef.current;

  return (
    <>
      <color attach="background" args={["#0A0E14"]} />
      <fog attach="fog" args={["#0A0E14", 8, 18]} />

      <ambientLight intensity={0.12} />
      <pointLight position={[4, 4, 4]} intensity={0.7} color="#ffffff" />
      <pointLight position={[-3, -2, 2]} intensity={1.6} color="#16A97B" />
      <pointLight position={[0, 5, -3]} intensity={0.4} color="#86efac" />

      <StarField />
      <TrustGrid progress={p} />
      <NairaGlyph progress={p} />
      <SharedAccountNode progress={p} clockTime={performance.now() / 1000} />

      {/* Parallel and converging rails */}
      {CHAOS_ORIGINS.map((origin, i) => (
        <DynamicLine
          key={i}
          index={i}
          chaosOrigin={origin}
          gridY={RAIL_YS_FOR_LINE[i] ?? 0.0}
          progress={p}
          clockTime={performance.now() / 1000}
        />
      ))}

      {/* Nodes and labels */}
      <TrackNodes progress={p} clockTime={performance.now() / 1000} />
      <TrackLabels progress={p} />

      {/* Branch splits */}
      <BranchingSplits progress={p} clockTime={performance.now() / 1000} />

      <CameraController />

      <EffectComposer>
        <Bloom intensity={1.8} luminanceThreshold={0.2} luminanceSmoothing={0.9} mipmapBlur />
      </EffectComposer>
    </>
  );
}

// ─── Static Fallback ──────────────────────────────────────────────────────────
function StaticFallback() {
  return (
    <div className="fixed inset-0 bg-[#0A0E14]">
      <div className="absolute inset-0 bg-gradient-to-br from-green-950/15 via-transparent to-red-950/10" />
    </div>
  );
}

// ─── ScrollScene (exported) ───────────────────────────────────────────────────
interface ScrollSceneProps {
  scrollerRef: React.RefObject<HTMLDivElement | null>;
}

export function ScrollScene({ scrollerRef }: ScrollSceneProps) {
  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  React.useEffect(() => {
    if (prefersReduced || !scrollerRef.current) return;

    const scroller = scrollerRef.current;

    const update = () => {
      const max = scroller.scrollHeight - window.innerHeight;
      scrollRef.current = max > 0 ? scroller.scrollTop / max : 0;
    };

    scroller.addEventListener("scroll", update, { passive: true });
    return () => scroller.removeEventListener("scroll", update);
  }, [prefersReduced, scrollerRef]);

  if (prefersReduced) return <StaticFallback />;

  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <Canvas
        camera={{ position: [0, 0.2, 7.5], fov: 44 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: false }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
