import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, Lightformer, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { palette, rng } from '../lib/art';

// Pointer is tracked on window so overlaid HTML never blocks the scene from reacting.
export const P = { x: 0, y: 0 };
if (typeof window !== 'undefined' && !window.__dhanyaPointer) {
  window.__dhanyaPointer = true;
  window.addEventListener('pointermove', e => { P.x = (e.clientX / innerWidth) * 2 - 1; P.y = -((e.clientY / innerHeight) * 2 - 1) }, { passive: true });
}

const vert = /* glsl */`
uniform float uTime; uniform vec2 uPointer; uniform float uScroll; uniform float uAmp;
varying vec3 vPos; varying vec3 vNorm; varying vec2 vUv;
float disp(vec2 p){
  float w = sin(p.x*1.1 + uTime*.45)*.35 + cos(p.y*1.4 + uTime*.35)*.25 + sin((p.x+p.y)*.7 + uTime*.3 + uScroll*3.)*.2;
  float d = distance(p, uPointer*vec2(4.,2.5));
  w += exp(-d*d*.35)*.3*sin(uTime*1.2 - d*2.);
  return w*uAmp;
}
void main(){
  vUv = uv; vec3 p = position; float e = .02;
  float h = disp(p.xy);
  vec3 n = normalize(vec3(-(disp(p.xy+vec2(e,0.))-h)/e, -(disp(p.xy+vec2(0.,e))-h)/e, 1.));
  p.z += h;
  vNorm = normalize(normalMatrix*n);
  vec4 mv = modelViewMatrix*vec4(p,1.);
  vPos = mv.xyz; gl_Position = projectionMatrix*mv;
}`;
const frag = /* glsl */`
uniform vec3 uA; uniform vec3 uB; uniform float uMix; uniform float uOpacity;
varying vec3 vPos; varying vec3 vNorm; varying vec2 vUv;
void main(){
  vec3 n = normalize(vNorm); if(!gl_FrontFacing) n = -n;
  vec3 l = normalize(vec3(.4,.6,1.)); vec3 v = normalize(-vPos);
  float diff = max(dot(n,l),0.)*.8 + .2;
  float fres = pow(1.-max(dot(n,v),0.), 2.5);
  float spec = pow(max(dot(reflect(-l,n),v),0.), 28.);
  vec3 base = mix(uA, uB, uMix);
  vec3 col = base*(.3+.7*diff) + vec3(.96,.94,.9)*spec*.5 + uB*fres*.4;
  float weave = .97 + .03*sin(vUv.x*220.)*sin(vUv.y*220.);
  float edge = smoothstep(0.,.14,vUv.x)*smoothstep(1.,.86,vUv.x)*smoothstep(0.,.2,vUv.y)*smoothstep(1.,.8,vUv.y);
  gl_FragColor = vec4(col*weave, edge*uOpacity);
}`;

// Procedural silk: all displacement happens in the vertex shader (no per-frame CPU loops).
export function Silk({ segments = [96, 64], size = [9, 6], position = [0, 0, 0], rotation = [0, 0, 0], amp = 1, mixRef, mix = 0, colors = ['#2a1630', '#C6A46A'], opacity = 0.92, scroll = true }) {
  const mat = useRef();
  const uniforms = useMemo(() => ({
    uTime: { value: 0 }, uPointer: { value: new THREE.Vector2() }, uScroll: { value: 0 }, uAmp: { value: amp },
    uA: { value: new THREE.Color(colors[0]) }, uB: { value: new THREE.Color(colors[1]) }, uMix: { value: mix }, uOpacity: { value: opacity },
  }), []); // eslint-disable-line
  useFrame(({ clock }) => {
    const u = mat.current.uniforms;
    u.uTime.value = clock.elapsedTime;
    u.uPointer.value.lerp(P, 0.06);
    u.uScroll.value = scroll ? window.scrollY / Math.max(innerHeight, 1) : 0;
    u.uMix.value = mixRef ? mixRef.current : mix;
  });
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[size[0], size[1], segments[0], segments[1]]} />
      <shaderMaterial ref={mat} vertexShader={vert} fragmentShader={frag} uniforms={uniforms} side={THREE.DoubleSide} transparent depthWrite={false} />
    </mesh>
  );
}

function archShape(w, h, t) {
  const s = new THREE.Shape(); const r = w / 2;
  s.moveTo(-r, -h / 2); s.lineTo(r, -h / 2); s.lineTo(r, h / 2 - r); s.absarc(0, h / 2 - r, r, 0, Math.PI, false); s.lineTo(-r, -h / 2);
  const ir = r - t; const hole = new THREE.Path();
  hole.moveTo(-ir, -h / 2 + t); hole.lineTo(ir, -h / 2 + t); hole.lineTo(ir, h / 2 - r); hole.absarc(0, h / 2 - r, ir, 0, Math.PI, false); hole.lineTo(-ir, -h / 2 + t);
  s.holes.push(hole);
  return s;
}

// A tunnel of architectural arches alternating polished champagne metal and smoked glass.
export function Arches({ count = 6, gap = 1.4, width = 3.2, height = 5, thickness = 0.13, position = [0, -0.2, 0], still }) {
  const geo = useMemo(() => new THREE.ExtrudeGeometry(archShape(width, height, thickness), { depth: 0.08, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1, curveSegments: 40 }), [width, height, thickness]);
  useEffect(() => () => geo.dispose(), [geo]);
  const group = useRef();
  useFrame(({ clock }) => {
    if (still) return;
    group.current.children.forEach((m, i) => { m.rotation.z = Math.sin(clock.elapsedTime * 0.18 + i * 0.9) * 0.035; m.position.y = Math.sin(clock.elapsedTime * 0.25 + i) * 0.04 });
  });
  return (
    <group ref={group} position={position}>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} geometry={geo} position={[0, 0, -i * gap]} scale={1 - i * 0.025}>
          {i % 2 === 0
            ? <meshStandardMaterial color="#C6A46A" metalness={1} roughness={0.26} envMapIntensity={1.3} />
            : <meshPhysicalMaterial color="#2a1a33" transparent opacity={0.5} roughness={0.08} metalness={0.25} clearcoat={1} clearcoatRoughness={0.1} envMapIntensity={1.6} />}
        </mesh>
      ))}
    </group>
  );
}

// Procedural lighting: a static environment of light panels (no network HDRs) for reflections.
export function Atmosphere({ sparkles = 80, sparkleArea = [14, 8, 16], lightMix }) {
  const key = useRef(); const rim = useRef();
  const plum = useMemo(() => new THREE.Color('#6b4a7a'), []); const champ = useMemo(() => new THREE.Color('#E4C98F'), []);
  useFrame(() => { const m = lightMix ? lightMix.current : 0; key.current.color.lerpColors(plum, champ, m); rim.current.color.lerpColors(new THREE.Color('#B77F8C'), champ, m) });
  return (
    <>
      <ambientLight intensity={0.25} />
      <pointLight ref={key} position={[3, 3, 4]} intensity={70} distance={30} />
      <pointLight ref={rim} position={[-4, -1, 2]} intensity={35} distance={25} />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.2} position={[0, 4, 3]} scale={[8, 1.2, 1]} color="#F5F0E8" />
        <Lightformer form="rect" intensity={1.4} position={[-5, 0, 2]} scale={[1.2, 6, 1]} color="#B77F8C" />
        <Lightformer form="rect" intensity={1.8} position={[5, 1, -2]} scale={[1.2, 6, 1]} color="#C6A46A" />
      </Environment>
      <Sparkles count={sparkles} scale={sparkleArea} size={2.2} speed={0.18} opacity={0.7} color="#E4C98F" noise={0.6} />
    </>
  );
}

function makeFabricTexture(seed) {
  const c = document.createElement('canvas'); c.width = 384; c.height = 512; const g = c.getContext('2d');
  const [a, b, d] = palette(seed); const r = rng(seed);
  const grad = g.createLinearGradient(0, 0, c.width, c.height); grad.addColorStop(0, a); grad.addColorStop(0.55, b); grad.addColorStop(1, d);
  g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
  g.lineWidth = 1.2;
  for (let i = 0; i < 46; i++) {
    g.strokeStyle = `rgba(${r() > 0.5 ? '245,240,232' : '9,9,13'},${0.05 + r() * 0.14})`;
    const y = (i / 46) * c.height; g.beginPath(); g.moveTo(-10, y);
    g.bezierCurveTo(c.width * 0.3, y + (r() - 0.5) * 140, c.width * 0.7, y + (r() - 0.5) * 140, c.width + 10, y + (r() - 0.5) * 90); g.stroke();
  }
  g.fillStyle = 'rgba(0,0,0,.05)'; for (let x = 0; x < c.width; x += 3) g.fillRect(x, 0, 1, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function usePlateTexture(src, seed) {
  const [tex, setTex] = useState(null);
  useEffect(() => {
    let t; let dead = false;
    if (src) new THREE.TextureLoader().load(src, x => { if (dead) { x.dispose(); return } x.colorSpace = THREE.SRGBColorSpace; t = x; setTex(x) });
    else { t = makeFabricTexture(seed); setTex(t) }
    return () => { dead = true; t?.dispose() };
  }, [src, seed]);
  return tex;
}
