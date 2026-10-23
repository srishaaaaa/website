import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { useInView, usePageVisible } from '../lib/hooks';
import { Arches, Atmosphere, P, Silk } from './parts';

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
        gl={{ antialias: !quality.low, alpha: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => { gl.setClearColor(0x000000, 0); gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.1; gl.domElement.addEventListener('webglcontextlost', e => e.preventDefault()) }}
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
      <FabricRig reduced={reduced} />
      <Atmosphere sparkles={quality.low ? 20 : 60} sparkleArea={[12, 6, 6]} lightMix={mix} />
      <Silk segments={quality.low ? [96, 56] : [180, 100]} size={[18, 9]} position={[0, 0, 0]} rotation={[-0.55, 0, 0]} amp={1.6} mixRef={mix} colors={['#c98f96', '#E4C98F']} opacity={0.96} />
      <Sparkles count={quality.low ? 12 : 30} scale={[10, 5, 4]} size={3} speed={0.12} color="#C6A46A" opacity={0.6} />
    </Stage>
  );
}
