import { create } from 'zustand';
import { freshSave, parseSave, reward, SAVE_KEY, type Save, upgrade } from '../../shared/save';
import { canWalk } from './world';
export type Scene = 'hub' | 'boathouse' | 'rowing' | 'basketball' | 'office';
let storageIssue = '';
function load() { try { return parseSave(localStorage.getItem(SAVE_KEY)); } catch { storageIssue = 'Your saved file could not be read. This session is temporary; your previous data has not been overwritten.'; return freshSave(); } }
let writeAllowed = true;
const initial = load();
if (!canWalk(...initial.position)) initial.position = [0, 5];
if (storageIssue) writeAllowed = false;
export const runtime = { x: initial.position[0], z: initial.position[1], heading: 0, moving: false, target: null as [number, number] | null, path: [] as [number, number][], near: '', raceCadence: 30, raceLength: 360, raceSeed: 1, shoot: false, shooting: false, aim: 0, charge: 0, steer: 0, burst: false, active: true };
type State = {
  scene: Scene; save: Save; paused: boolean; build: boolean; panel: 'none' | 'help' | 'avatar' | 'memories' | 'settings';
  near: string; notice: string; muted: boolean; quality: 'high' | 'low'; result: null | { game: string; title: string; score: string; coins: number; detail: string }; run: number;
  go: (scene: Scene) => void; setNear: (near: string) => void; persist: () => void;
  award: (id: string, coins: number, xp: number, extra?: Partial<Save>) => void; upgrade: (key: 'boathouse' | 'garden') => void; customize: (color: string, hat: boolean) => void;
};
export const useGame = create<State>((set, get) => ({
  scene: 'hub', save: initial, paused: false, build: false, panel: 'none', near: '', notice: storageIssue, muted: true, quality: 'high', result: null, run: 0,
  go(scene) {
    if (get().scene === 'hub') get().persist();
    if (scene === 'hub') { [runtime.x, runtime.z] = get().save.position; } else if (scene === 'boathouse' || scene === 'office') { runtime.x = 0; runtime.z = 4; } else if (scene === 'basketball') { runtime.x = 0; runtime.z = 5; }
    runtime.target = null; runtime.path = []; runtime.near = ''; runtime.shoot = false; runtime.shooting = false; runtime.aim = 0; runtime.steer = 0; runtime.burst = false;
    set({ scene, near: '', result: null, build: false, paused: false, panel: 'none', run: get().run + 1 });
  },
  setNear(near) { if (get().near !== near) set({ near }); },
  persist() {
    const s = get().scene === 'hub' ? { ...get().save, position: [runtime.x, runtime.z] as [number, number] } : get().save;
    set({ save: s });
    if (!writeAllowed) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { set({ notice: 'Browser storage is unavailable. You can keep playing, but progress only lasts this session.' }); }
  },
  award(id, coins, xp, extra) {
    set({ save: { ...reward(get().save, id, coins, xp), ...extra } }); get().persist();
  },
  upgrade(key) {
    const next = upgrade(get().save, key);
    if (next === get().save) return;
    set({ save: next, notice: key === 'garden' ? 'A little more room to grow. Your garden has been upgraded.' : 'New balcony, new ambitions. Your boathouse has been upgraded.' }); get().persist();
  },
  customize(color, hat) { set({ save: { ...get().save, color, hat } }); get().persist(); },
}));
