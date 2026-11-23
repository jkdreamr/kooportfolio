import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { runtime, useGame } from '../core/store';

const rounded = new RoundedBoxGeometry(1, 1, 1, 2, .055);
const box = new THREE.BoxGeometry(1, 1, 1);
const sphere = new THREE.SphereGeometry(1, 12, 8);
const cyl = new THREE.CylinderGeometry(1, 1, 1, 12);
const cone = new THREE.ConeGeometry(1, 1, 8);
const mats = new Map<string, THREE.MeshStandardMaterial>();
function material(color: string) { if (!mats.has(color)) mats.set(color, new THREE.MeshStandardMaterial({ color, roughness: .87 })); return mats.get(color)!; }
type Props = { p?: [number, number, number]; s?: [number, number, number]; c?: string; r?: [number, number, number] };
export function Box({ p = [0, 0, 0], s = [1, 1, 1], c = '#eee5cc', r = [0, 0, 0], sharp = false }: Props & { sharp?: boolean }) { return <mesh geometry={sharp ? box : rounded} material={material(c)} position={p} scale={s} rotation={r} castShadow receiveShadow />; }
export function Ball({ p = [0, 0, 0], s = [1, 1, 1], c = '#81956b' }: Props) { return <mesh geometry={sphere} material={material(c)} position={p} scale={s} castShadow receiveShadow />; }
export function Cylinder({ p = [0, 0, 0], s = [1, 1, 1], c = '#8c7057', r = [0, 0, 0] }: Props) { return <mesh geometry={cyl} material={material(c)} position={p} scale={s} rotation={r} castShadow receiveShadow />; }
export function Cone({ p = [0, 0, 0], s = [1, 1, 1], c = '#647958' }: Props) { return <mesh geometry={cone} material={material(c)} position={p} scale={s} castShadow receiveShadow />; }
export function Ring({ p = [0, 0, 0], radius = 1, tube = .05, c = '#eee5cc', r = [-Math.PI / 2, 0, 0] }: { p?: [number, number, number]; radius?: number; tube?: number; c?: string; r?: [number, number, number] }) { return <mesh position={p} rotation={r} material={material(c)}><torusGeometry args={[radius, tube, 6, 48]} /></mesh>; }
export function Sign({ text, p, color = '#faf0d7', ink = '#414e3b', size = [2, .5] }: { text: string; p: [number, number, number]; color?: string; ink?: string; size?: [number, number] }) {
  const texture = useMemo(() => { const el = document.createElement('canvas'); el.width = 512; el.height = 128; const ctx = el.getContext('2d')!; ctx.fillStyle = color; ctx.fillRect(0, 0, 512, 128); ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 40px monospace'; ctx.fillText(text, 256, 68); const t = new THREE.CanvasTexture(el); t.colorSpace = THREE.SRGBColorSpace; return t; }, [text, color, ink]);
  return <mesh position={p}><planeGeometry args={size} /><meshStandardMaterial map={texture} roughness={.9} /></mesh>;
}
export function Character({ npc = false, color = '#6f8670', hat = true, scale = 1 }: { npc?: boolean; color?: string; hat?: boolean; scale?: number }) {
  const legs = useRef<THREE.Group>(null), arms = useRef<THREE.Group>(null), body = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { const active = npc || runtime.moving, t = clock.elapsedTime * (active ? 9 : 2); if (legs.current) { legs.current.children[0].rotation.x = active ? Math.sin(t) * .65 : 0; legs.current.children[1].rotation.x = active ? -Math.sin(t) * .65 : 0; } if (arms.current) { arms.current.children[0].rotation.x = active ? -Math.sin(t) * .45 : .06; arms.current.children[1].rotation.x = active ? Math.sin(t) * .45 : -.06; } if (body.current) body.current.position.y = active ? Math.abs(Math.sin(t)) * .055 : Math.sin(t) * .015; });
  return <group scale={scale}><group ref={body}>
    <group ref={legs}><group position={[-.16, .42, 0]}><Box p={[0, -.18, 0]} s={[.23, .4, .24]} c="#384648" /><Box p={[0, -.36, .07]} s={[.25, .14, .38]} c="#f5e9d3" /></group><group position={[.16, .42, 0]}><Box p={[0, -.18, 0]} s={[.23, .4, .24]} c="#384648" /><Box p={[0, -.36, .07]} s={[.25, .14, .38]} c="#f5e9d3" /></group></group>
    <Box p={[0, .77, 0]} s={[.65, .67, .4]} c={color} /><Box p={[0, .91, .213]} s={[.16, .1, .02]} c="#e7d3a7" />
    <group ref={arms}><group position={[-.4, .98, 0]}><Box p={[0, -.15, 0]} s={[.2, .4, .25]} c={color} /><Ball p={[0, -.38, 0]} s={[.115, .13, .115]} c="#efc5a0" /></group><group position={[.4, .98, 0]}><Box p={[0, -.15, 0]} s={[.2, .4, .25]} c={color} /><Ball p={[0, -.38, 0]} s={[.115, .13, .115]} c="#efc5a0" /></group></group>
    <Box p={[0, 1.47, .025]} s={[.78, .68, .67]} c="#efc5a0" /><Box p={[0, 1.8, 0]} s={[.82, .24, .7]} c="#3e3936" /><Box p={[-.34, 1.58, -.07]} s={[.16, .36, .62]} c="#3e3936" /><Box p={[.34, 1.58, -.07]} s={[.16, .36, .62]} c="#3e3936" />
    <Ball p={[-.16, 1.47, .366]} s={[.043, .065, .025]} c="#383330" /><Ball p={[.16, 1.47, .366]} s={[.043, .065, .025]} c="#383330" /><Box p={[0, 1.29, .37]} s={[.13, .025, .02]} c="#a47362" />
    {hat && <><Box p={[0, 1.93, 0]} s={[.9, .2, .78]} c="#d88960" /><Box p={[0, 1.86, .4]} s={[.87, .065, .48]} c="#d88960" /><Box p={[0, 2.03, 0]} s={[.6, .07, .6]} c="#e4a275" /></>}
  </group></group>;
}
export function Tree({ p, size = 1, variant = 0 }: { p: [number, number, number]; size?: number; variant?: number }) {
  return <group position={p} scale={size}><Cylinder p={[0, 1.2, 0]} s={[.18, 2.4, .18]} c="#866b50" />{variant % 3 === 0 ? <><Cone p={[0, 2.1, 0]} s={[1.1, 2.2, 1.1]} /><Cone p={[0, 3, 0]} s={[.85, 1.9, .85]} c="#718967" /><Cone p={[0, 3.8, 0]} s={[.55, 1.5, .55]} c="#849773" /></> : <><Ball p={[-.55, 2.8, 0]} s={[1.1, 1.2, 1]} c={variant % 2 ? '#a4ad77' : '#6d8b64'} /><Ball p={[.6, 3.05, 0]} s={[.95, 1.25, 1.04]} c={variant % 2 ? '#c3bb7f' : '#849d70'} /><Ball p={[0, 3.8, .1]} s={[1.05, 1.1, 1.05]} c={variant % 2 ? '#a6ad76' : '#93a776'} /></>}</group>;
}
export function Flowers({ p, color = '#d59470' }: { p: [number, number, number]; color?: string }) {
  return <group position={p}><Cylinder p={[0, .23, 0]} s={[.35, .46, .35]} c="#be8666" />{[0, 1, 2].map(i => <group key={i} position={[Math.sin(i * 4) * .2, 0, Math.cos(i * 4) * .2]}><Cylinder p={[0, .55, 0]} s={[.025, .6, .025]} c="#6b8053" /><Ball p={[0, .87, 0]} s={[.16, .1, .16]} c={color} /><Ball p={[0, .94, 0]} s={[.06, .05, .06]} c="#e6c06d" /></group>)}</group>;
}
export function Window({ p, width = .8 }: { p: [number, number, number]; width?: number }) {
  return <group position={p}><Box s={[width + .18, 1.15, .13]} c="#80715a" /><Box p={[0, 0, .08]} s={[width, 1, .08]} c="#efc982" /><Box p={[0, 0, .14]} s={[.06, 1.05, .07]} c="#faf0d4" /><Box p={[0, 0, .14]} s={[width, .06, .07]} c="#faf0d4" /><Box p={[0, -.6, .14]} s={[width + .35, .14, .38]} c="#e3d6b7" /></group>;
}
export function Lamp({ p }: { p: [number, number, number] }) { return <group position={p}><Cylinder p={[0, 1.15, 0]} s={[.075, 2.3, .075]} c="#4d5d51" /><Box p={[0, 2.5, 0]} s={[.4, .55, .4]} c="#efd296" /><Cone p={[0, 2.87, 0]} s={[.37, .25, .37]} c="#536456" /><Cylinder p={[0, .05, 0]} s={[.25, .1, .25]} c="#697360" /></group>; }
export function Bench({ p, rotation = 0 }: { p: [number, number, number]; rotation?: number }) { return <group position={p} rotation={[0, rotation, 0]}>{[-.6, .6].map(x => <Box key={x} p={[x, .32, 0]} s={[.13, .65, .5]} c="#576454" />)}{[0, 1, 2].map(i => <Box key={i} p={[0, .65, i * .2 - .2]} s={[1.7, .12, .16]} c="#b58b5e" />)}<Box p={[0, 1.08, -.34]} s={[1.7, .45, .12]} c="#bd976d" /></group>; }
export function House({ p, kind = 'boathouse', level = 1 }: { p: [number, number, number]; kind?: 'boathouse' | 'study'; level?: number }) {
  const study = kind === 'study'; const roof = study ? '#768770' : '#be765b';
  return <group position={p}>
    <Box p={[0, .15, 0]} s={[6.4, .4, 4.6]} c="#b8af98" /><Box p={[0, 1.85, 0]} s={[5.8, 3.4, 4.1]} c={study ? '#e1c5a1' : '#eddec0'} />
    {[-2.83, 0, 2.83].map(x => <Box key={x} p={[x, 1.8, 2.08]} s={[.18, 3.4, .16]} c="#a28b69" />)}
    <Box p={[0, 1.1, 2.12]} s={[1.22, 2.1, .2]} c="#61594b" /><Box p={[0, 1.03, 2.24]} s={[.95, 1.9, .12]} c="#8d7655" />{[-.27, 0, .27].map(x => <Box key={x} p={[x, 1.1, 2.32]} s={[.025, 1.7, .02]} c="#bda17a" />)}<Ball p={[.3, 1, 2.35]} s={[.055, .055, .06]} c="#edd38b" />
    <Window p={[-1.75, 1.85, 2.1]} /><Window p={[1.75, 1.85, 2.1]} />
    <Box p={[0, .42, 2.58]} s={[1.8, .2, 1]} c="#d7c8aa" /><Box p={[0, .19, 3]} s={[2.1, .18, .7]} c="#c6b99e" />
    <Box p={[0, 3.55, 0]} s={[6.45, .2, 4.65]} c="#f7e8cb" />
    {[-1, 1].map(side => <group key={side} position={[side * 1.57, 4.32, 0]} rotation={[0, 0, side * -.45]}><Box s={[3.5, .21, 4.95]} c={roof} />{Array.from({ length: 12 }, (_, i) => <Box key={i} p={[0, .12, i * .4 - 2.2]} s={[3.5, .08, .045]} c={study ? '#8d9b80' : '#d99575'} />)}{[-1, 0, 1].map(i => <Box key={i} p={[i * 1.1, .11, 0]} s={[.05, .08, 4.9]} c={study ? '#63755f' : '#a86351'} />)}</group>)}
    <Box p={[0, 5.1, 0]} s={[.24, .24, 5.1]} c={roof} /><Box p={[1.8, 4.9, -.9]} s={[.63, 1.8, .65]} c="#b99b7a" /><Box p={[1.8, 5.85, -.9]} s={[.84, .15, .85]} c="#cdbc9d" />
    <Sign text={study ? 'THE STUDY' : 'BOATHOUSE'} p={[0, 3.05, 2.18]} size={[2.3, .45]} />
    <Flowers p={[-2.7, .4, 2.4]} /><Flowers p={[2.7, .4, 2.4]} color="#e7c05f" />
    {!study && <><group position={[-3.08, 1.5, 0]} rotation={[0, 0, .1]}><Box p={[0, 0, 0]} s={[.12, 2.7, .14]} c="#b38d62" /><Box p={[0, -.85, .1]} s={[.13, .7, .4]} c="#6b8c86" /></group><Box p={[3, .5, 1]} s={[.7, .5, 1.7]} c="#ad8762" /></>}
    {level > 1 && <group><Box p={[0, 2.8, 2.95]} s={[5, .18, 1.6]} c="#a78662" />{[-2.4, 0, 2.4].map(x => <Box key={x} p={[x, 1.4, 3.6]} s={[.14, 2.8, .14]} c="#ad9070" />)}<Box p={[0, 3.4, 3.63]} s={[5, .1, .1]} c="#e2c49d" />{Array.from({ length: 13 }, (_, i) => <Box key={i} p={[i * .4 - 2.4, 3.1, 3.63]} s={[.07, .6, .07]} c="#dfbd91" />)}</group>}
    {level > 2 && <group position={[-3.8, 0, -.5]}><Box p={[0, 1.4, 0]} s={[1.5, 2.8, 2.8]} c="#d6c6a5" /><Cone p={[0, 3.3, 0]} s={[1.5, 1.5, 1.9]} c={roof} /><Window p={[0, 1.8, 1.45]} width={.7} /></group>}
  </group>;
}
export function Boat({ color = '#f1e4b7', pace = 30, race = false }: { color?: string; pace?: number; race?: boolean }) {
  const oars = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (oars.current) oars.current.children.forEach((oar, i) => { oar.rotation.y = Math.sin(clock.elapsedTime * pace / 10 + Math.floor(i / 2) * .05) * .55 * (i % 2 ? -1 : 1); oar.rotation.z = Math.cos(clock.elapsedTime * pace / 10) * .09; }); });
  return <group><Ball p={[0, .1, 0]} s={[.4, .19, race ? 3.6 : 2.8]} c={color} /><Box p={[0, .25, 0]} s={[.46, .11, 4.3]} c="#9e7957" />{[-1.4, -.5, .4, 1.3].map((z, i) => <group key={i} position={[0, .28, z]}><Box p={[0, .12, 0]} s={[.27, .27, .26]} c={color} /><Ball p={[0, .45, 0]} s={[.18, .2, .18]} c="#efc5a0" /><Ball p={[0, .57, -.025]} s={[.19, .12, .18]} c="#4d423a" /></group>)}<group ref={oars}>{[-1.4, -.5, .4, 1.3].flatMap((z, i) => [-1, 1].map((side, j) => <group key={i * 2 + j} position={[side * .3, .3, z]}><Box p={[side * .9, 0, 0]} s={[2, .055, .055]} c="#b49773" /><Box p={[side * 1.95, -.025, 0]} s={[.55, .08, .28]} c={i % 2 ? '#c1745c' : '#eee3c5'} /></group>))}</group></group>;
}
export function Npc({ origin, color }: { origin: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (ref.current && !useGame.getState().paused) { const t = clock.elapsedTime * .3 + origin[0]; ref.current.position.set(origin[0] + Math.sin(t) * 1.8, origin[1], origin[2] + Math.cos(t) * .7); ref.current.rotation.y = Math.atan2(Math.cos(t) * 1.8, -Math.sin(t) * .7); } });
  return <group ref={ref}><Character npc color={color} scale={.67} hat={false} /></group>;
}
