import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { useInView, usePageVisible } from '../lib/hooks';
import { media } from '../config/content';
import { Arches, Atmosphere, P, Silk, usePlateTexture } from './parts';

// Renders only while visible; pauses when scrolled away or the tab is hidden.
function Stage({ children, camera, quality, reduced, className }) {
  const ref = useRef();
  const inView = useInView(ref, { rootMargin: '120px' });
  const visible = usePageVisible();
  const active = inView && visible;
  return (
    <div ref={ref} className={className}>
      <Canvas
        frameloop={reduced ? 'demand' : active ? 'always' : 'never'}
        dpr={quality.dpr} camera={camera}
        gl={{ antialias: !quality.low, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.1; gl.domElement.addEventListener('webglcontextlost', e => e.preventDefault()) }}
      >
        <Suspense fallback={null}>{children}</Suspense>
      </Canvas>
    </div>
  );
}

const ease = k => k * k * (3 - 2 * k);

/* ---- Intro portal: camera flies through the arches as light shifts plum -> champagne ---- */
function PortalRig({ entering, mix, reduced }) {
  const t0 = useRef(null);
  const look = useRef(new THREE.Vector3(0, 0, -4));
  useFrame(({ camera, clock }) => {
    if (entering) {
      t0.current ??= clock.elapsedTime;
      const k = Math.min((clock.elapsedTime - t0.current) / 2.1, 1), e = ease(k);
      camera.position.set(THREE.MathUtils.lerp(camera.position.x, 0, 0.1), THREE.MathUtils.lerp(camera.position.y, 0, 0.1), THREE.MathUtils.lerp(6, -9, e));
      mix.current = e;
    } else if (!reduced) {
      camera.position.x += (P.x * 0.7 - camera.position.x) * 0.04;
      camera.position.y += (P.y * 0.4 - camera.position.y) * 0.04;
    }
    camera.lookAt(look.current);
  });
  return null;
}

export function PortalCanvas({ entering, quality, reduced }) {
  const mix = useRef(0);
  return (
    <Stage className="scene" quality={quality} reduced={reduced} camera={{ position: [0, 0, 6], fov: 52, near: 0.1, far: 60 }}>
      <color attach="background" args={['#09090D']} />
      <fog attach="fog" args={['#09090D', 7, 24]} />
      <PortalRig entering={entering} mix={mix} reduced={reduced} />
      <Atmosphere sparkles={quality.sparkles} lightMix={mix} />
      <Arches count={quality.low ? 5 : 7} gap={1.5} still={reduced} />
      <Silk segments={quality.seg} size={[26, 16]} position={[0, 0, -12]} rotation={[0, 0, 0.08]} amp={1.5} mixRef={mix} colors={['#2a1630', '#C6A46A']} scroll={false} />
      <Silk segments={quality.seg} size={[12, 5]} position={[-2, -2.4, -2]} rotation={[-0.9, 0.3, 0.3]} amp={0.8} mixRef={mix} colors={['#3a2230', '#B77F8C']} opacity={0.6} scroll={false} />
    </Stage>
  );
}

/* ---- Hero: sculptural frame, silk, floating fabric plates; reacts to pointer + scroll ---- */
function Plate({ src, seed, position, rotation, scale = 1 }) {
  const tex = usePlateTexture(src, seed);
  if (!tex) return null;
  return (
    <Float speed={0.8} rotationIntensity={0.12} floatIntensity={0.6}>
      <group position={position} rotation={rotation} scale={scale}>
        <mesh position={[0, 0, -0.02]}><planeGeometry args={[1.58, 2.08]} /><meshStandardMaterial color="#C6A46A" metalness={1} roughness={0.3} /></mesh>
        <mesh><planeGeometry args={[1.5, 2]} /><meshStandardMaterial map={tex} roughness={0.55} metalness={0.05} /></mesh>
      </group>
    </Float>
  );
}

function HeroRig({ reduced }) {
  useFrame(({ camera }) => {
    const s = Math.min(window.scrollY / Math.max(innerHeight, 1), 1.4);
    const px = reduced ? 0 : P.x, py = reduced ? 0 : P.y;
    camera.position.x += (px * 0.9 - camera.position.x) * 0.045;
    camera.position.y += (py * 0.5 - s * 1.2 - camera.position.y) * 0.045;
    camera.position.z += (7 + s * 2.5 - camera.position.z) * 0.06;
    camera.lookAt(0.6, -s * 0.8, -2);
  });
  return null;
}

export function HeroCanvas({ quality, reduced }) {
  const lite = quality.mobile;
  const mix = useRef(0.5);
  return (
    <Stage className="scene" quality={quality} reduced={reduced} camera={{ position: [0, 0, 7], fov: 46, near: 0.1, far: 60 }}>
      <color attach="background" args={['#09090D']} />
      <fog attach="fog" args={['#09090D', 9, 26]} />
      <HeroRig reduced={reduced} />
      <Atmosphere sparkles={quality.sparkles} sparkleArea={[12, 7, 10]} lightMix={mix} />
      <Silk segments={quality.seg} size={[16, 9]} position={[lite ? 0 : 1.6, -0.6, -4]} rotation={[-0.25, -0.32, 0.06]} amp={1} mixRef={mix} colors={['#241329', '#C6A46A']} opacity={0.78} />
      <Arches count={lite ? 3 : 4} gap={1.25} width={3} height={4.8} position={[lite ? 0.4 : 2.7, 0, -1]} still={reduced} />
      <Plate src={media.heroPlates[0]} seed="hero-a" position={[lite ? -1.2 : -3.2, 0.9, 0]} rotation={[0, 0.25, -0.06]} scale={lite ? 0.8 : 1.15} />
      {!lite && <Plate src={media.heroPlates[1]} seed="hero-b" position={[-0.6, -1.5, 1.2]} rotation={[0, -0.2, 0.05]} scale={0.8} />}
      {!lite && <Plate src={media.heroPlates[2]} seed="hero-c" position={[5, 1.2, 0.8]} rotation={[0, -0.35, 0.08]} scale={0.7} />}
    </Stage>
  );
}

/* ---- Living Fabric: a larger silk field the visitor can disturb with the pointer ---- */
function FabricRig({ reduced }) {
  useFrame(({ camera }) => {
    if (reduced) return;
    camera.position.x += (P.x * 0.6 - camera.position.x) * 0.04;
    camera.position.y += (P.y * 0.35 - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export function FabricCanvas({ quality, reduced }) {
  const mix = useRef(0.4);
  return (
    <Stage className="scene fabric-scene" quality={quality} reduced={reduced} camera={{ position: [0, 0, 6.5], fov: 50, near: 0.1, far: 50 }}>
      <color attach="background" args={['#1a0f1e']} />
      <FabricRig reduced={reduced} />
      <Atmosphere sparkles={quality.low ? 20 : 60} sparkleArea={[12, 6, 6]} lightMix={mix} />
      <Silk segments={quality.low ? [96, 56] : [180, 100]} size={[18, 9]} position={[0, 0, 0]} rotation={[-0.55, 0, 0]} amp={1.6} mixRef={mix} colors={['#2b1631', '#D9B779']} opacity={0.98} />
      <Sparkles count={quality.low ? 12 : 30} scale={[10, 5, 4]} size={3} speed={0.12} color="#F5F0E8" opacity={0.5} />
    </Stage>
  );
}
