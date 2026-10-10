// The vehicle yard: a plain yard to look at the keke and the coach in. It
// shows the supplied designs, their colours and markings, and each level of
// detail, with someone standing by for scale.
//
// The address can carry the view: #set=coach&level=1&yaw=0.6&dist=14&roll=1

import { makeVehicleModel, initVehicles, setVehicleDaylight, VEHICLE_LEVELS } from './vehicle-models.js';
import { vehicleMeta } from './vehicle-kit.js';
import { variantSheet, kekeLook, busLook, VEHICLE_MODELS, KEKE_TRIMS } from '../sim/vehicle-looks.js';
import { makeCharacter, animateCharacter, seatCharacter, standCharacter } from './character.js';
import { PROTOTYPES } from '../sim/characters.js';

const $ = (id) => document.getElementById(id);
const params = new Map(location.hash.slice(1).split('&').filter(Boolean).map((p) => p.split('=').map(decodeURIComponent)));
const num = (key, fallback) => (params.has(key) && !Number.isNaN(Number(params.get(key))) ? Number(params.get(key)) : fallback);

const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
initVehicles(renderer);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9aa3ad);
scene.fog = new THREE.Fog(0x9aa3ad, 60, 160);
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400);
const hemi = new THREE.HemisphereLight(0xdfe8f5, 0x6f6658, 0.8);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 0.95);
sun.position.set(9, 16, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 16, bottom: -16, near: 0.5, far: 60 });
sun.shadow.bias = -0.0008;
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ color: 0x6a6d72, roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const supplied = { keke: (trim) => ({ model: 'keke', trim, paint: 'yellow', floor: trim === 'classic' ? 'green' : 'dark', wear: 0.12, dirt: 0 }), bus: () => ({ model: 'bus', livery: 'green', cabin: 'blue', wear: 0, dirt: 0 }) };
const sets = {
  'keke fronts': () => VEHICLE_MODELS.keke.trims.map((trim) => ({ name: `Keke, ${KEKE_TRIMS[trim].toLowerCase()}`, note: 'as supplied', look: supplied.keke(trim) })),
  'keke colours': () => variantSheet('keke').map((v) => ({ name: v.name, note: `${v.look.trim} front`, look: v.look, plate: true })),
  coach: () => [{ name: 'Coach', note: 'as supplied', look: supplied.bus() }],
  'coach colours': () => variantSheet('bus').map((v) => ({ name: v.name, note: v.look.operator.toLowerCase(), look: v.look, plate: true })),
  detail: () => [0, 1, 2].map((level) => ({ name: `Keke, ${VEHICLE_LEVELS[level]}`, look: supplied.keke('modern'), level })).concat([0, 1, 2].map((level) => ({ name: `Coach, ${VEHICLE_LEVELS[level]}`, look: supplied.bus(), level }))),
  scale: () => [{ name: 'Keke', note: 'driver and passenger seated', look: kekeLook(3), plate: true, people: 'keke' }, { name: 'Coach', note: 'someone at the door', look: busLook(1), plate: true, people: 'bus' }],
  fleet: () => [0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({ name: `Keke ${n + 1}`, look: kekeLook(n), plate: true })).concat([0, 1, 2].map((n) => ({ name: `Coach ${n + 1}`, look: busLook(n), plate: true }))),
};

const state = { set: params.get('set') || 'keke fronts', level: params.has('level') ? num('level', 0) : 'auto', roll: num('roll', 0) === 1, lamps: num('lamps', 0) === 1, night: num('night', 0) === 1 };
const cam = { yaw: num('yaw', 0.7), pitch: num('pitch', 0.22), dist: num('dist', 0), x: num('x', 0), y: num('y', 0.9), z: num('z', 0), auto: !params.has('dist') };
const SEATED_HEIGHT = 0.845;        // how far above its own feet a seated figure's seat is, for a figure of height 1
let shown = [];
let people = [];
let stats = { triangles: 0, vehicles: 0 };

function plateFor(i) { return `AT${String(100 + i * 37).slice(-3)}${'ABCDEFGH'[i % 8]}${'XKLMPRST'[(i * 3) % 8]}`; }

function fill() {
  for (const s of shown) { scene.remove(s.model.group); s.model.dispose(); s.tag.remove(); }
  for (const p of people) { scene.remove(p.rig.group); p.rig.dispose(); }
  shown = []; people = [];
  let list = sets[state.set] ? sets[state.set]() : [];
  if (params.has('first') || params.has('count')) list = list.slice(num('first', 0), num('first', 0) + num('count', 99));
  const widths = list.map((e) => (e.look.model === 'bus' ? 4.6 : 2.5));
  const total = widths.reduce((a, b) => a + b, 0);
  let x = -total / 2;
  list.forEach((entry, i) => {
    const model = makeVehicleModel(entry.look, { plate: entry.plate ? plateFor(i) : null, region: 'Anambra', level: entry.level === undefined ? 0 : entry.level });
    model.group.position.set(x + widths[i] / 2, 0, 0);
    model.group.rotation.y = num('turn', 0);
    x += widths[i];
    scene.add(model.group);
    const tag = document.createElement('div');
    $('names').append(tag);
    shown.push({ model, tag, entry });
    if (entry.people) {
      const meta = vehicleMeta(entry.look.model);
      const place = (rig, at, seated, yaw = 0) => { rig.group.position.set(model.group.position.x + at[0], at[1], at[2]); rig.group.rotation.y = yaw; scene.add(rig.group); people.push({ rig, seated, y: at[1] }); };
      if (entry.people === 'keke') {
        place(makeCharacter(PROTOTYPES[1].config ? { wear: PROTOTYPES[1].config, body: 'm' } : {}, null, true), [meta.seats.driver[0], meta.seats.driver[1], meta.seats.driver[2]], true);
        place(makeCharacter({ wear: PROTOTYPES[3].config, body: 'f' }, null, true), meta.seats.passengers[0], true);
        place(makeCharacter({ wear: PROTOTYPES[10].config, body: 'f' }, null, true), [1.5, 0, 0.4], false, -1.2);
      } else {
        place(makeCharacter({ wear: PROTOTYPES[1].config, body: 'm' }, null, true), [2.1, 0, 4.6], false, -Math.PI / 2);
        place(makeCharacter({ wear: PROTOTYPES[4].config, body: 'm' }, null, true), [-2.2, 0, -2.0], false, Math.PI / 2);
      }
    }
  });
  if (cam.auto) { const aspect = Math.max(0.5, canvas.clientWidth / Math.max(1, canvas.clientHeight)); const span = Math.max(total, list.some((e) => e.look.model === 'bus') ? 13 : 4); cam.dist = Math.max(7, (span + 1.5) / (2 * Math.tan((16 * Math.PI) / 180) * aspect)); cam.y = list.some((e) => e.look.model === 'bus') ? 1.6 : 0.9; }
  apply();
}

function apply() {
  const day = state.night ? 0.08 : 1;
  setVehicleDaylight(day);
  hemi.intensity = 0.8 * (state.night ? 0.25 : 1); sun.intensity = 0.95 * (state.night ? 0.12 : 1);
  scene.background.set(state.night ? 0x151a26 : 0x9aa3ad); scene.fog.color.copy(scene.background);
  stats = { triangles: 0, vehicles: shown.length };
  for (const s of shown) {
    if (s.entry.level !== undefined) s.model.setLevel(s.entry.level); else if (state.level !== 'auto') s.model.setLevel(Number(state.level));
    s.model.lamps(state.lamps ? 1 : 0, state.lamps ? 1 : 0, 0, state.lamps ? 1 : 0);
  }
}

function buttons(host, items, key, toggle = false) {
  for (const [value, text] of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.setAttribute('aria-pressed', String(toggle ? !!state[value] : String(state[key]) === String(value)));
    b.addEventListener('click', () => { if (toggle) state[value] = !state[value]; else state[key] = value; draw(); if (key === 'set') fill(); else apply(); });
    host.append(b);
  }
}
function draw() {
  for (const id of ['sets', 'levels', 'switches']) $(id).innerHTML = '';
  buttons($('sets'), Object.keys(sets).map((k) => [k, k]), 'set');
  buttons($('levels'), [['auto', 'Auto'], [0, 'Near'], [1, 'Middle'], [2, 'Far']], 'level');
  buttons($('switches'), [['roll', 'Drive'], ['lamps', 'Lamps'], ['night', 'Night']], null, true);
}

let dragging = null;
canvas.addEventListener('pointerdown', (e) => { dragging = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => { if (!dragging) return; cam.yaw -= (e.clientX - dragging.x) * 0.008; cam.pitch = Math.max(-0.05, Math.min(1.5, cam.pitch + (e.clientY - dragging.y) * 0.005)); dragging = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', () => { dragging = null; });
canvas.addEventListener('wheel', (e) => { cam.dist = Math.max(1.2, Math.min(150, cam.dist * (1 + Math.sign(e.deltaY) * 0.1))); cam.auto = false; e.preventDefault(); }, { passive: false });

const V = new THREE.Vector3();
let last = performance.now();
let clock = num('time', 0);
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!params.has('time')) clock += dt;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  camera.position.set(cam.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist, cam.y + Math.sin(cam.pitch) * cam.dist, cam.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist);
  camera.lookAt(cam.x, cam.y, cam.z);
  stats.triangles = 0;
  for (const s of shown) {
    if (s.entry.level === undefined && state.level === 'auto') s.model.setDistance(camera.position.distanceTo(s.model.group.position));
    if (state.roll) { s.model.roll(dt * 4); s.model.steer(Math.sin(clock * 1.3) * 0.45); } else if (params.has('steer')) s.model.steer(num('steer', 0));
    stats.triangles += s.model.triangles;
  }
  for (const p of people) { animateCharacter(p.rig, dt, 0, false); if (p.seated) { seatCharacter(p.rig); p.rig.group.position.y = p.y - SEATED_HEIGHT * p.rig.scale; } else standCharacter(p.rig); }
  renderer.render(scene, camera);
  for (const s of shown) {
    V.set(s.model.group.position.x, -0.02, s.model.group.position.z + (s.model.model === 'bus' ? 6.2 : 1.6)).project(camera);
    s.tag.style.left = `${(V.x * 0.5 + 0.5) * w}px`;
    s.tag.style.top = `${(-V.y * 0.5 + 0.5) * h + 4}px`;
    s.tag.hidden = params.get('tags') === '0' || V.z > 1;
    s.tag.innerHTML = `${s.entry.name}<small>${s.entry.note ? `${s.entry.note} · ` : ''}${VEHICLE_LEVELS[s.model.level]} ${s.model.triangles.toLocaleString()} tris</small>`;
  }
  $('info').textContent = `${shown.length} vehicles, ${stats.triangles.toLocaleString()} triangles drawn. Drag to turn, scroll to zoom.`;
  requestAnimationFrame(frame);
}

draw();
fill();
window.__yard = { state, cam, fill, apply, get shown() { return shown; }, get stats() { return stats; }, renderer, scene, camera };
requestAnimationFrame(frame);
