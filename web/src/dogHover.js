// What the sleeping dog does under the cursor, which depends on how it is lying.
//   dream: the tail thumps and paws twitch for as long as the cursor stays.
//   sigh: one deep breath.
//   flick: the ear flicks twice.
import * as THREE from 'three';

const degrees = THREE.MathUtils.degToRad;
const UP = new THREE.Vector3(0, 1, 0);
const EASE_IN = 0.2, EASE_OUT = 0.35; // seconds for the dream to start and settle

const THUMP_SECONDS = 0.75;
const TAIL = [['Tail0', 0], ['Tail1', 0.05], ['Tail2', 0.1]]; // each bone follows the last
const TAIL_LIFT = degrees(13);
const PAW_SECONDS = 0.34;
// The dog lies on its right side, so its left legs are the upper pair.
const PAWS = [['FrontL2', 0.1], ['FrontR2', 0.42], ['HindL2', 0.26], ['HindR2', 0.58]];
const PAW_FLEX = degrees(11);

const SIGH_DEPTH = 0.03; // metres, on top of normal breathing
const SIGH_SECONDS = 3.4;

const EAR = ['EarL0', 'EarL1']; // the upper ear
const EAR_LIFT = degrees(30);
const FLICKS = 2, FLICK_SECONDS = 0.22;

const pulse = (t) => Math.sin(t * Math.PI) ** 2;

export function createDogHover(root) {
  const turn = new THREE.Quaternion();
  let kind = null;
  let moves = [];
  let active = false;
  let level = 0; // how far into the dream, 0 to 1
  let started = -Infinity; // when the current sigh or flick began
  let lastFrame = 0;

  const position = (name) => root.getObjectByName(name).getWorldPosition(new THREE.Vector3());
  const lifting = (from, to) => position(to).sub(position(from)).normalize().cross(UP).normalize();
  const move = (name, worldAxis, delay = 0) => {
    const bone = root.getObjectByName(name);
    const axis = worldAxis.clone().applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert());
    return { bone, axis, delay, rest: bone.quaternion.clone() };
  };
  const pose = (item, angle) => item.bone.quaternion.copy(item.rest).multiply(turn.setFromAxisAngle(item.axis, angle));

  const settle = () => {
    for (const item of moves) item.bone.quaternion.copy(item.rest);
    moves = [];
    kind = null;
    active = false;
    level = 0;
    started = -Infinity;
  };

  return {
    settle,
    get kind() { return kind; },
    // Depth of the sigh right now, in metres.
    sigh(now) {
      const t = (now - started) / 1000 / SIGH_SECONDS;
      return kind === 'sigh' && t > 0 && t < 1 ? SIGH_DEPTH * pulse(t) : 0;
    },
    // Call after the pose is set, because each reaction starts from that pose.
    use(next) {
      kind = next ?? null;
      if (!kind || kind === 'sigh') return;
      root.updateMatrixWorld(true);
      if (kind === 'dream') {
        const lift = lifting('Tail0', 'Tail1');
        moves = [...TAIL.map(([name, delay]) => ({ ...move(name, lift, delay), part: 'tail' })),
          ...PAWS.map(([name, delay]) => ({ ...move(name, UP, delay), part: 'paw' }))];
      } else {
        const lift = lifting(...EAR);
        moves = EAR.map((name, i) => move(name, lift, i * 0.03));
      }
    },
    setActive(on, now) {
      if (on && !active && now - started > (kind === 'sigh' ? SIGH_SECONDS : FLICKS * FLICK_SECONDS) * 1000) started = now;
      active = on;
    },
    // Returns true while bones moved, so the shadows can follow.
    update(now) {
      const dt = Math.min((now - lastFrame) / 1000, 0.1);
      lastFrame = now;
      if (kind === 'dream') {
        level = THREE.MathUtils.clamp(level + (active ? dt / EASE_IN : -dt / EASE_OUT), 0, 1);
        const seconds = now / 1000;
        for (const item of moves) {
          const tail = item.part === 'tail';
          const phase = (seconds - item.delay) / (tail ? THUMP_SECONDS : PAW_SECONDS);
          pose(item, level * (tail ? TAIL_LIFT : PAW_FLEX) * pulse(phase % 1));
        }
        return level > 0 || active;
      }
      if (kind === 'flick') {
        const seconds = (now - started) / 1000;
        const length = FLICKS * FLICK_SECONDS;
        for (const item of moves) {
          const t = seconds - item.delay;
          pose(item, t > 0 && t < length ? EAR_LIFT * pulse((t / FLICK_SECONDS) % 1) : 0);
        }
        return seconds < length + 0.1;
      }
      return false;
    },
  };
}
