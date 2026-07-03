/**
 * HeroNetworkScene — premium 3D payment network visualization.
 *
 * Performance approach (Razorpay-style):
 *  - Zero DOM nodes inside the Canvas (no Html from @react-three/drei)
 *  - Labels rendered as CanvasTexture on PlaneGeometry — created once at mount
 *  - Bloom post-processing via @react-three/postprocessing — the green glow
 *  - Ambient particle field — 300 points, single draw call, near-zero GPU cost
 *  - dpr capped at [1, 1.5] — never 2+ on a decorative scene
 *  - All animation via useFrame delta — frame-rate independent
 */

import React from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

// ─── Types ────────────────────────────────────────────────────────────────────

type Vec3 = [number, number, number];

interface BankNode {
  name: string;
  position: Vec3;
}

// ─── Scene data ───────────────────────────────────────────────────────────────

const BANK_NODES: BankNode[] = [
  { name: "Wema",   position: [-2.0,  1.2,  0.3] },
  { name: "GTB",    position: [ 2.0,  1.1, -0.2] },
  { name: "Access", position: [-1.6, -1.3, -0.4] },
  { name: "UBA",    position: [ 0.0,  2.0,  0.0] },
  { name: "Zenith", position: [ 0.0, -2.0,  0.2] },
  { name: "Nomba",  position: [ 1.8, -1.0,  0.5] },
];

const EDGES: Array<[string, string]> = [
  ["Wema",   "GTB"],
  ["Wema",   "Access"],
  ["GTB",    "Nomba"],
  ["Access", "Nomba"],
  ["Wema",   "Nomba"],
  ["GTB",    "UBA"],
  ["UBA",    "Zenith"],
  ["Zenith", "Nomba"],
  ["Access", "Zenith"],
  ["UBA",    "Wema"],
];

function resolvePosition(name: string): Vec3 {
  const node = BANK_NODES.find((n) => n.name === name);
  if (!node) throw new Error(`Missing node: ${name}`);
  return node.position;
}

// ─── Canvas texture label (rendered once, zero per-frame DOM cost) ─────────────

function createLabelTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width  = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;

  // Background pill
  ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
  ctx.beginPath();
  ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 12);
  ctx.fill();

  // Border
  ctx.strokeStyle = "rgba(34, 197, 94, 0.4)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Text
  ctx.fillStyle = "#F8FAFC";
  ctx.font = "bold 28px 'Plus Jakarta Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  return new THREE.CanvasTexture(canvas);
}

// ─── Bank node with label ────────────────────────────────────────────────────

function BankNodeMesh({ name, position }: BankNode) {
  const labelTexture = React.useMemo(() => createLabelTexture(name), [name]);
  const nodeRef = React.useRef<THREE.Mesh>(null);
  const pulseRef = React.useRef(0);

  useFrame(({ clock }) => {
    if (!nodeRef.current) return;
    // Gentle breathing scale — makes nodes feel alive
    pulseRef.current = clock.getElapsedTime();
    const s = 1 + Math.sin(pulseRef.current * 1.4 + position[0]) * 0.08;
    nodeRef.current.scale.setScalar(s);
  });

  return (
    <group position={position}>
      {/* Core sphere — high emissive so Bloom picks it up */}
      <mesh ref={nodeRef}>
        <sphereGeometry args={[0.10, 32, 32]} />
        <meshStandardMaterial
          color="#86efac"
          emissive="#22c55e"
          emissiveIntensity={3.0}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>
      {/* Outer halo ring */}
      <mesh>
        <torusGeometry args={[0.16, 0.012, 8, 48]} />
        <meshStandardMaterial
          color="#22c55e"
          emissive="#22c55e"
          emissiveIntensity={1.5}
          transparent
          opacity={0.6}
        />
      </mesh>
      {/* Label plane — CanvasTexture, not Html */}
      <mesh position={[0, 0.38, 0]} rotation={[0, 0, 0]}>
        <planeGeometry args={[0.7, 0.18]} />
        <meshBasicMaterial map={labelTexture} transparent alphaTest={0.01} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ─── Travelling payment pulse ─────────────────────────────────────────────────

function EdgePulse({ from, to, phaseOffset, speed = 0.18 }: {
  from: Vec3;
  to: Vec3;
  phaseOffset: number;
  speed?: number;
}) {
  const meshRef = React.useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = (clock.getElapsedTime() * speed + phaseOffset) % 1;
    meshRef.current.position.set(
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t,
    );
    // Pulse size — grows slightly at midpoint
    const s = 0.8 + Math.sin(t * Math.PI) * 0.5;
    meshRef.current.scale.setScalar(s);
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.055, 16, 16]} />
      <meshStandardMaterial
        color="#ffffff"
        emissive="#22c55e"
        emissiveIntensity={5.0}
        roughness={0}
      />
    </mesh>
  );
}

// ─── Ambient particle field ───────────────────────────────────────────────────

function ParticleField() {
  const COUNT = 320;

  const { positions, speeds } = React.useMemo(() => {
    const pos    = new Float32Array(COUNT * 3);
    const spd    = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 10;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 6;
      spd[i]         = 0.002 + Math.random() * 0.004;
    }
    return { positions: pos, speeds: spd };
  }, []);

  const geomRef   = React.useRef<THREE.BufferGeometry>(null);
  const posArray  = React.useRef(positions);

  useFrame(() => {
    if (!geomRef.current) return;
    const pos = posArray.current;
    for (let i = 0; i < COUNT; i++) {
      const yi = i * 3 + 1;
      const xi = i * 3;
      // Drift upward, wrap around
      pos[yi] = (pos[yi] ?? 0) + (speeds[i] ?? 0.002);
      if ((pos[yi] ?? 0) > 5) {
        pos[yi] = -5;
        pos[xi] = (Math.random() - 0.5) * 10;
      }
    }
    const attr = geomRef.current.getAttribute("position") as THREE.BufferAttribute;
    (attr.array as Float32Array).set(pos);
    attr.needsUpdate = true;
  });

  return (
    <points>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#22c55e"
        size={0.022}
        sizeAttenuation
        transparent
        opacity={0.45}
        depthWrite={false}
      />
    </points>
  );
}

// ─── Main network group ───────────────────────────────────────────────────────

function BankNetwork() {
  const groupRef = React.useRef<THREE.Group>(null);

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.06;
    groupRef.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.22) * 0.08;
  });

  return (
    <group ref={groupRef}>
      {/* Edges */}
      {EDGES.map(([fromName, toName], i) => {
        const from = resolvePosition(fromName);
        const to   = resolvePosition(toName);
        return (
          <React.Fragment key={`edge-${i}`}>
            <Line
              points={[from, to]}
              color="#22c55e"
              opacity={0.2}
              transparent
              lineWidth={0.8}
            />
            <EdgePulse
              from={from}
              to={to}
              phaseOffset={i * (1 / EDGES.length)}
              speed={0.14 + (i % 3) * 0.04}
            />
          </React.Fragment>
        );
      })}

      {/* Nodes */}
      {BANK_NODES.map((node) => (
        <BankNodeMesh key={node.name} {...node} />
      ))}
    </group>
  );
}

// ─── Camera auto-look ─────────────────────────────────────────────────────────

function CameraRig() {
  const { camera } = useThree();

  useFrame(({ clock }) => {
    // Subtle camera drift — makes the scene feel cinematic
    camera.position.x = Math.sin(clock.getElapsedTime() * 0.12) * 0.3;
    camera.position.y = Math.cos(clock.getElapsedTime() * 0.09) * 0.15;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

// ─── Static SVG fallback ─────────────────────────────────────────────────────

function StaticNetworkFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#020617]">
      <svg
        width="400"
        height="300"
        viewBox="0 0 400 300"
        fill="none"
        className="opacity-40"
        aria-hidden="true"
      >
        {/* Edges */}
        <line x1="80"  y1="80"  x2="320" y2="80"  stroke="#22c55e" strokeWidth="0.8" strokeOpacity="0.4" />
        <line x1="80"  y1="80"  x2="120" y2="220" stroke="#22c55e" strokeWidth="0.8" strokeOpacity="0.4" />
        <line x1="320" y1="80"  x2="280" y2="220" stroke="#22c55e" strokeWidth="0.8" strokeOpacity="0.4" />
        <line x1="120" y1="220" x2="280" y2="220" stroke="#22c55e" strokeWidth="0.8" strokeOpacity="0.4" />
        <line x1="80"  y1="80"  x2="280" y2="220" stroke="#22c55e" strokeWidth="0.8" strokeOpacity="0.4" />
        <line x1="200" y1="40"  x2="320" y2="80"  stroke="#22c55e" strokeWidth="0.8" strokeOpacity="0.4" />
        {/* Nodes */}
        {[
          [80, 80], [320, 80], [120, 220], [280, 220], [200, 40], [200, 260],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="7" fill="#22c55e" fillOpacity="0.9" />
        ))}
      </svg>
    </div>
  );
}

// ─── Exported component ───────────────────────────────────────────────────────

export function HeroNetworkScene() {
  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReduced) return <StaticNetworkFallback />;

  return (
    <div className="absolute inset-0">
      <Canvas
        camera={{ position: [0, 0, 6.5], fov: 42 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: false }}
      >
        {/* Scene background */}
        <color attach="background" args={["#020617"]} />
        <fog attach="fog" args={["#020617", 7, 16]} />

        {/* Lighting */}
        <ambientLight intensity={0.15} />
        <pointLight position={[4, 4, 4]}   intensity={0.8} color="#ffffff" />
        <pointLight position={[-4, -2, 2]} intensity={1.2} color="#22c55e" />
        <pointLight position={[0, 5, -3]}  intensity={0.5} color="#86efac" />

        {/* Scene content */}
        <ParticleField />
        <BankNetwork />
        <CameraRig />

        {/* Post-processing — Bloom makes emissive materials glow */}
        <EffectComposer>
          <Bloom
            intensity={1.4}
            luminanceThreshold={0.25}
            luminanceSmoothing={0.85}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
