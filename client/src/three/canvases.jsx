import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { useInView, usePageVisible } from '../lib/hooks';
import { depthTextureFromAlpha } from './depth';
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

/* ---- Hero: the model is a real 3D object. Her cut-out is displaced by an estimated depth map (2.5D mesh) and lit
   softly, then turns gently with the pointer so her form reads as volume. A silk ribbon matched to her saree flows
   behind her pallu, with a little gold dust. Transparent canvas over the light hero. ---- */
const modelVert = `
uniform sampler2D uDepth; uniform float uScale; uniform float uCam;
varying vec2 vUv;
void main(){
  vUv = uv;
  float d = texture2D(uDepth, uv).r;
  vec3 p = position; float z = d * uScale; p.z += z;
  p.xy *= (uCam - z) / uCam; // cancel perspective growth so the resting pose matches the photograph exactly
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const modelFrag = `
uniform sampler2D uMap; uniform sampler2D uDepth; uniform float uTexel;
varying vec2 vUv;
void main(){
  vec4 c = texture2D(uMap, vUv);
  if (c.a < 0.02) discard;
  // soft relief lighting derived from the depth map (no geometry normals needed)
  float dl = texture2D(uDepth, vUv - vec2(uTexel, 0.)).r, dr = texture2D(uDepth, vUv + vec2(uTexel, 0.)).r;
  float dd = texture2D(uDepth, vUv - vec2(0., uTexel)).r, du = texture2D(uDepth, vUv + vec2(0., uTexel)).r;
  vec3 n = normalize(vec3((dl - dr) * 3.2, (dd - du) * 3.2, 1.0));
  float lit = dot(n, normalize(vec3(-.35, .5, .8)));
  vec3 col = c.rgb * (0.92 + 0.16 * lit);
  gl_FragColor = vec4(col, c.a);
  #include <colorspace_fragment>
}`;

function Model3D({ cutout, depth, reduced }) {
  const { viewport } = useThree();
  const maps = useLoader(THREE.TextureLoader, depth ? [cutout, depth] : [cutout]);
  const map = maps[0];
  // No depth map supplied (e.g. a custom hero upload)? Derive a roundness map from the cut-out's silhouette.
  const depthTex = useMemo(() => (depth ? maps[1] : depthTextureFromAlpha(map.image)), [depth, maps, map]);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; depthTex.colorSpace = THREE.NoColorSpace;
  const group = useRef();
  const aspect = map.image.width / map.image.height;
  let h = viewport.height * 0.98, w = h * aspect;
  const fit = Math.min(1, (viewport.width * 0.62) / w); h *= fit; w *= fit; // never wider than its share of the stage
  const uniforms = useRef({ uMap: { value: map }, uDepth: { value: depthTex }, uScale: { value: 0.45 }, uCam: { value: 6.9 }, uTexel: { value: 1 / (depthTex.image.width || 540) } });
  useFrame(({ clock }) => {
    const g = group.current; if (!g) return;
    const t = clock.elapsedTime, px = reduced ? 0 : P.x, py = reduced ? 0 : P.y;
    g.rotation.y += (px * 0.26 + (reduced ? 0 : Math.sin(t * 0.5) * 0.05) - g.rotation.y) * 0.06;
    g.rotation.x += (-py * 0.1 - g.rotation.x) * 0.06;
  });
  return (
    <group ref={group} position={[0, -viewport.height * 0.02, 0.1]}>
      <mesh>
        <planeGeometry args={[w, h, 120, 156]} />
        <shaderMaterial vertexShader={modelVert} fragmentShader={modelFrag} uniforms={uniforms.current} transparent side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function HeroRig({ reduced }) {
  useFrame(({ camera }) => {
    const px = reduced ? 0 : P.x, py = reduced ? 0 : P.y;
    camera.position.x += (px * 0.35 - camera.position.x) * 0.04;
    camera.position.y += (py * 0.2 - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

function HeroScene({ quality, reduced, cutout, depth }) {
  const { viewport } = useThree();
  const mix = useRef(0.5);
  return (
    <>
      <HeroRig reduced={reduced} />
      <Sparkles count={quality.low ? 24 : 60} scale={[viewport.width, viewport.height, 3]} size={3.2} speed={0.14} color="#C6A46A" opacity={0.7} />
      <Model3D key={cutout} cutout={cutout} depth={depth} reduced={reduced} />
    </>
  );
}

export function HeroCanvas({ quality, reduced, cutout, depth }) {
  return (
    <Stage className="scene hero-silk" quality={quality} reduced={reduced} camera={{ position: [0, 0, 7], fov: 40, near: 0.1, far: 40 }}>
      <HeroScene quality={quality} reduced={reduced} cutout={cutout} depth={depth} />
    </Stage>
  );
}
