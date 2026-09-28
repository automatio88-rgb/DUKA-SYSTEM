/**
 * The ONE signature 3D scene (§14): a slowly rotating low-poly duka storefront built from primitives.
 * Lazy-loaded (its own chunk with three + r3f), never on POS, falls back to SVG on low-end devices.
 */
import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { Group } from 'three';

const BRAND = '#D9480F', MAIZE = '#F5A623', CREAM = '#FAF6EF', CLAY = '#C4502C', LEAF = '#1F8A5B', WOOD = '#6B4A2E';
const GOODS = [BRAND, MAIZE, LEAF, CLAY, '#3E7CB1', CREAM, '#8E3B8E'];

function Shelf({ y, seed }: { y: number; seed: number }) {
  const items = useMemo(() => Array.from({ length: 7 }, (_, i) => ({ x: -1.35 + i * 0.45, h: 0.22 + ((seed * (i + 3)) % 5) * 0.05, c: GOODS[(seed + i * 3) % GOODS.length], round: (seed + i) % 3 === 0 })), [seed]);
  return (
    <group position={[0, y, -0.55]}>
      <mesh><boxGeometry args={[3.3, 0.06, 0.5]} /><meshStandardMaterial color={WOOD} roughness={0.9} /></mesh>
      {items.map((it, i) => (
        <mesh key={i} position={[it.x, it.h / 2 + 0.03, 0]} castShadow>
          {it.round ? <cylinderGeometry args={[0.13, 0.13, it.h, 10]} /> : <boxGeometry args={[0.3, it.h, 0.28]} />}
          <meshStandardMaterial color={it.c} roughness={0.55} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Storefront() {
  const g = useRef<Group>(null);
  useFrame(({ clock }) => { if (!g.current) return; const t = clock.getElapsedTime(); g.current.rotation.y = Math.sin(t * 0.25) * 0.45 - 0.2; g.current.position.y = Math.sin(t * 0.8) * 0.06; });
  const scallops = Array.from({ length: 9 }, (_, i) => -1.6 + i * 0.4);
  return (
    <group ref={g} scale={0.9}>
      {/* back wall + counter */}
      <mesh position={[0, 0.9, -0.85]}><boxGeometry args={[3.6, 2.6, 0.1]} /><meshStandardMaterial color="#2A2F36" /></mesh>
      <Shelf y={0.2} seed={1} /><Shelf y={0.75} seed={4} /><Shelf y={1.3} seed={7} />
      <mesh position={[0, -0.55, 0.45]}><boxGeometry args={[3.4, 0.9, 0.6]} /><meshStandardMaterial color={CREAM} roughness={0.8} /></mesh>
      <mesh position={[0, -0.08, 0.45]}><boxGeometry args={[3.5, 0.06, 0.66]} /><meshStandardMaterial color={WOOD} /></mesh>
      {/* the kitabu on the counter */}
      <mesh position={[0.8, -0.02, 0.5]} rotation={[0, -0.3, 0]}><boxGeometry args={[0.45, 0.04, 0.32]} /><meshStandardMaterial color={LEAF} /></mesh>
      {/* awning in brand colours */}
      <mesh position={[0, 2.25, 0.2]} rotation={[0.5, 0, 0]}><boxGeometry args={[3.8, 0.08, 1.2]} /><meshStandardMaterial color={BRAND} flatShading /></mesh>
      {scallops.map((x, i) => (<mesh key={i} position={[x, 1.92, 0.72]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.2, 0.2, 0.06, 12, 1, false, 0, Math.PI]} /><meshStandardMaterial color={i % 2 ? MAIZE : BRAND} flatShading /></mesh>))}
      {/* posts */}
      {[-1.75, 1.75].map(x => <mesh key={x} position={[x, 0.7, 0.6]}><cylinderGeometry args={[0.05, 0.05, 2.6, 8]} /><meshStandardMaterial color={WOOD} /></mesh>)}
    </group>
  );
}

export default function DukaScene({ height = 280 }: { height?: number }) {
  return (
    <div style={{ height }} aria-hidden>
      <Canvas dpr={[1, 1.75]} camera={{ position: [0, 1.1, 5.2], fov: 38 }} gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}>
        <ambientLight intensity={0.55} />
        <directionalLight position={[3, 5, 4]} intensity={1.3} color="#FFE8C7" />
        <directionalLight position={[-4, 2, -2]} intensity={0.35} color="#F5A623" />
        <Storefront />
      </Canvas>
    </div>
  );
}
