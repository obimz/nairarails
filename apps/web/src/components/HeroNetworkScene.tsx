import React from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import type { Mesh, Group } from "three";

type Vec3 = [number, number, number];

interface BankNode {
  name: string;
  position: Vec3;
}

const BANK_NODES: BankNode[] = [
  { name: "Wema", position: [-1.8, 1.1, 0.2] },
  { name: "GTB", position: [1.7, 1.0, -0.1] },
  { name: "Access", position: [-1.4, -1.2, -0.3] },
  { name: "Nomba", position: [1.4, -1.0, 0.4] },
];

const EDGES: Array<[string, string]> = [
  ["Wema", "GTB"],
  ["Wema", "Access"],
  ["GTB", "Nomba"],
  ["Access", "Nomba"],
  ["Wema", "Nomba"],
  ["GTB", "Access"],
];

interface ResolvedEdge {
  from: Vec3;
  to: Vec3;
}

const RESOLVED_EDGES: ResolvedEdge[] = EDGES.map(([fromName, toName]) => {
  const from = BANK_NODES.find((node) => node.name === fromName);
  const to = BANK_NODES.find((node) => node.name === toName);

  if (!from || !to) {
    throw new Error(`Missing node for edge ${fromName} -> ${toName}`);
  }

  return { from: from.position, to: to.position };
});

function EdgePulse({ from, to, phaseOffset }: { from: Vec3; to: Vec3; phaseOffset: number }) {
  const pulseRef = React.useRef<Mesh>(null);

  useFrame(({ clock }) => {
    if (!pulseRef.current) return;

    const progress = (clock.getElapsedTime() * 0.22 + phaseOffset) % 1;
    const x = from[0] + (to[0] - from[0]) * progress;
    const y = from[1] + (to[1] - from[1]) * progress;
    const z = from[2] + (to[2] - from[2]) * progress;

    pulseRef.current.position.set(x, y, z);
  });

  return (
    <mesh ref={pulseRef}>
      <sphereGeometry args={[0.06, 16, 16]} />
      <meshStandardMaterial color="#86efac" emissive="#22c55e" emissiveIntensity={1.5} />
    </mesh>
  );
}

function BankNetwork() {
  const groupRef = React.useRef<Group>(null);

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.12;
    groupRef.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.28) * 0.1;
  });

  return (
    <group ref={groupRef}>
      {RESOLVED_EDGES.map((edge, index) => (
        <React.Fragment key={`${index}-${edge.from[0]}-${edge.to[0]}`}>
          <Line points={[edge.from, edge.to]} color="#86efac" opacity={0.45} transparent />
          <EdgePulse from={edge.from} to={edge.to} phaseOffset={index * 0.17} />
        </React.Fragment>
      ))}

      {BANK_NODES.map((node) => (
        <group key={node.name} position={node.position}>
          <mesh>
            <sphereGeometry args={[0.12, 24, 24]} />
            <meshStandardMaterial color="#bbf7d0" emissive="#16a34a" emissiveIntensity={0.9} />
          </mesh>
          <Html position={[0, 0.28, 0]} distanceFactor={10} center>
            <div className="pointer-events-none rounded-md border border-green-100/80 bg-white/90 px-2 py-1 text-xs font-medium text-gray-700 shadow-sm">
              {node.name}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}

export function HeroNetworkScene() {
  return (
    <div className="absolute inset-0">
      <Canvas camera={{ position: [0, 0, 5.2], fov: 46 }} dpr={[1, 1.5]}>
        <color attach="background" args={["#f8fafc"]} />
        <fog attach="fog" args={["#f8fafc", 4, 9]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 4, 5]} intensity={1.1} />
        <pointLight position={[-3, -2, 1]} color="#4ade80" intensity={1.1} />
        <BankNetwork />
      </Canvas>
    </div>
  );
}
