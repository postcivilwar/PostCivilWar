// The character lab: a plain room to look at characters in. It shows sets of
// figures side by side, standing, walking, sitting or working, at any level
// of detail, so a character can be judged before it is put in the town.
//
// The address can carry the view: #set=lineup&move=walk&lod=1&yaw=0.5&dist=5 (and lite=1: as a phone draws them)

import { makeFigure, makeCharacter, animateCharacter, seatCharacter, standCharacter } from './character.js';
import { labSets } from './character-looks.js';
import { POLICE_LOOKS, policeLook } from '../sim/police-looks.js';
import { setLite } from './render-kit.js';
import { LIGHT } from './light.js';
import { makeGun } from './gun-model.js';
import { ANIMATED } from './animated.js';
import { createGunHold } from './gun-pose.js';

const $ = (id) => document.getElementById(id);
const params = new Map(location.hash.slice(1).split('&').filter(Boolean).map((p) => p.split('=').map(decodeURIComponent)));
const num = (key, fallback) => (params.has(key) && !Number.isNaN(Number(params.get(key))) ? Number(params.get(key)) : fallback);
// (#lite=1: the figures' surfaces as a phone draws them, render-kit.js)
if (params.get('lite') === '1') setLite(true);

const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;      /* (three.js r186 has one kind of soft shadow: PCFSoftShadowMap is gone) */
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8e98a3);
scene.fog = new THREE.Fog(0x8e98a3, 30, 70);
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
scene.add(new THREE.HemisphereLight(0xdfe8f5, 0x6f6658, 0.8 * LIGHT));
const sun = new THREE.DirectionalLight(0xfff1dc, 0.95 * LIGHT);
sun.position.set(3.5, 7, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 6, bottom: -3, near: 0.5, far: 30 });
sun.shadow.bias = -0.0006;
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x5d6168, roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const sets = labSets();
// every supplied figure a player can be (animated.js), as it came
sets.players = () => Object.keys(ANIMATED).map((id) => ({ name: id, note: ANIMATED[id].file, look: { figure: id } }));
// the town's sixteen policewomen (police-dress.js), after the supplied police officer they are drawn from, as she came
sets.police = () => [{ name: 'Amaka', note: 'as supplied', look: { figure: 'W3' } }, ...POLICE_LOOKS.map((L, k) => ({ name: `Officer ${k + 1}`, note: `${L.skin}, ${L.uniform}`, look: policeLook(k) }))];
const state = { set: params.get('set') || Object.keys(sets)[0], move: params.get('move') || 'stand', lod: num('lod', 0), spin: num('spin', 0) };
const cam = { yaw: num('yaw', 0), pitch: num('pitch', 0.06), dist: num('dist', 0), x: num('x', 0), y: num('y', 0.95), z: num('z', 0), auto: !params.has('dist') };
let figures = [];
let stats = { triangles: 0, figures: 0 };

function fill() {
  for (const f of figures) { scene.remove(f.rig.group); f.rig.dispose(); f.tag.remove(); if (f.gun) f.gun.dispose(); }
  figures = [];
  let list = sets[state.set] ? sets[state.set](state.lod) : [];
  if (params.has('first') || params.has('count')) list = list.slice(num('first', 0), num('first', 0) + num('count', 99));
  const gap = num('gap', 1.0);
  stats = { triangles: 0, figures: list.length };
  list.forEach((entry, i) => {
    const rig = entry.look ? makeCharacter(entry.look, null, true) : makeFigure(entry.spec, null, true);
    rig.group.position.set((i - (list.length - 1) / 2) * gap, 0, 0);
    rig.group.rotation.y = state.spin;
    scene.add(rig.group);
    if (params.get('wire') === '1') { const wire = new THREE.SkinnedMesh(rig.mesh.geometry, new THREE.MeshBasicMaterial({ color: 0x101010, wireframe: true, transparent: true, opacity: 0.35 })); wire.bind(rig.skeleton, new THREE.Matrix4()); rig.body.add(wire); }
    const tag = document.createElement('div');
    tag.innerHTML = `${entry.name}<small>${entry.note || ''} ${rig.triangles.toLocaleString()} tris</small>`;
    $('names').append(tag);
    // (#gun=aim|sight|carry|reload: each figure holding the owner's rifle, gun-pose.js; aim=yaw,pitch from ahead; crouch=1)
    const gun = GUN ? makeGun('rifle') : null;
    if (gun) scene.add(gun.group);
    figures.push({ rig, tag, entry, gun, hold: gun ? createGunHold() : null, said: null });
    stats.triangles += rig.triangles;
  });
  if (cam.auto) { const aspect = Math.max(0.5, canvas.clientWidth / Math.max(1, canvas.clientHeight)); cam.dist = Math.max(4.4, (list.length * gap + 0.6) / (2 * Math.tan((16 * Math.PI) / 180) * aspect)); }
  $('info').textContent = `${list.length} figures, ${stats.triangles.toLocaleString()} triangles. Drag to turn, scroll to zoom.`;
}

function buttons(host, items, key) {
  host.innerHTML = '';
  for (const [value, text] of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.setAttribute('aria-pressed', String(String(state[key]) === String(value)));
    b.addEventListener('click', () => { state[key] = value; draw(); if (key !== 'move') fill(); });
    host.append(b);
  }
}
function draw() {
  buttons($('sets'), Object.keys(sets).map((k) => [k, k]), 'set');
  buttons($('moves'), [['stand', 'Stand'], ['walk', 'Walk'], ['jog', 'Jog'], ['run', 'Run'], ['sit', 'Sit'], ['work', 'Work']], 'move');
  buttons($('details'), [[0, 'Full'], [1, 'Near'], [2, 'Middle']], 'lod');
}

let dragging = null;
canvas.addEventListener('pointerdown', (e) => { dragging = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (!dragging) return; cam.yaw -= (e.clientX - dragging.x) * 0.008; cam.pitch = Math.max(-0.3, Math.min(1.4, cam.pitch + (e.clientY - dragging.y) * 0.005)); dragging = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', () => { dragging = null; });
canvas.addEventListener('wheel', (e) => { cam.dist = Math.max(0.5, Math.min(40, cam.dist * (1 + Math.sign(e.deltaY) * 0.1))); cam.auto = false; e.preventDefault(); }, { passive: false });

const V = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), V4 = new THREE.Vector3();
const GUN = params.get('gun') || null;
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  for (const f of figures) {
    const rig = f.rig;
    const speed = params.has('speed') && state.move !== 'stand' && state.move !== 'sit' && state.move !== 'work' ? num('speed', 1.35) : state.move === 'walk' ? 1.35 : state.move === 'jog' ? 2.4 : state.move === 'run' ? 5.6 : 0;
    animateCharacter(rig, dt, speed, state.move === 'work');
    if (state.move === 'sit') { seatCharacter(rig); rig.group.position.y = -0.44 * rig.scale; } else { standCharacter(rig); }
    if (f.gun) {
      const [ay, ap] = (params.get('aim') || '0,0').split(',').map(Number);
      const yaw = rig.group.rotation.y + (ay || 0);
      const dir = V2.set(Math.sin(yaw) * Math.cos(ap || 0), -Math.sin(ap || 0), Math.cos(yaw) * Math.cos(ap || 0)).normalize();
      rig.body.updateMatrixWorld(true);
      const at = V3.copy(rig.group.position).add(V4.set(0, 1.45, 0)).addScaledVector(dir, num('far', 25));
      const reload = GUN === 'reload' ? (params.has('u') ? num('u', 0.2) : (now / 2400) % 1) : null;
      const moving = speed > 0 ? { x: Math.sin(rig.group.rotation.y + num('move', 0)) * speed, z: Math.cos(rig.group.rotation.y + num('move', 0)) * speed } : null;
      f.said = f.hold.pose(rig, f.gun, { up: true, mode: GUN === 'sight' ? 'sight' : GUN === 'carry' ? 'carry' : 'aim', dir, at, crouch: params.get('crouch') === '1', reload, moving, kicks: params.get('fire') === '1' && Math.random() < dt * 14 ? 1 : 0, hideHead: GUN === 'sight' && params.get('eye') === '1' && f === figures[0] }, dt);
      if (params.get('far') === 'x') f.gun.setNear(false);
    }
  }
  camera.position.set(cam.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist, cam.y + Math.sin(cam.pitch) * cam.dist, cam.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist);
  camera.lookAt(cam.x, cam.y, cam.z);
  // (#eye=1: the view from behind the first figure's sight, as the player aiming through it sees it)
  if (params.get('eye') === '1' && figures[0] && figures[0].said && figures[0].said.shown) { const e = figures[0].said; camera.position.copy(e.eye); camera.lookAt(V3.copy(e.eye).addScaledVector(e.dir, 10)); camera.near = 0.06; camera.fov = num('fov', 32); camera.updateProjectionMatrix(); }
  renderer.render(scene, camera);
  for (const f of figures) {
    V.set(f.rig.group.position.x, -0.02, f.rig.group.position.z).project(camera);
    f.tag.style.left = `${(V.x * 0.5 + 0.5) * w}px`;
    f.tag.style.top = `${(-V.y * 0.5 + 0.5) * h + 4}px`;
    f.tag.hidden = params.get('tags') === '0';
  }
  requestAnimationFrame(frame);
}

draw();
fill();
window.__lab = { state, cam, fill, get figures() { return figures; }, get stats() { return stats; }, renderer, scene, freeze(phase) { for (const f of figures) { if (phase === null) delete f.rig.hold; else f.rig.hold = phase; } } };
requestAnimationFrame(frame);
