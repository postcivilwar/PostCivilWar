// Client entry point: input, camera, prediction, drawing and sound.
//
// The client never decides an outcome. It predicts its own walking with the
// same map the simulation uses, sends each step as an intent, and snaps back
// if the simulation says no. Everything else is a request and a reply: who
// is in view, what is being said, whether another player is close enough to
// talk to.
//
// In this prototype the simulation runs in the same page, so `server.send`
// is a function call. In the networked game it is a message to a zone server.

import { createHost, SAVE_VERSION } from '../sim/host.js';
import { ZONE, ZONE_PROPS, ZONE_TEXT, ZONE_RESIDENTS, ZONE_SERVICES, ZONE_BENCHES, ZONE_MOULD_STATIONS, ZONE_PARCELS, ZONE_ROADS, ZONE_JETTY, ZONE_SOUNDS, ZONE_COMPOUNDS, ZONE_SHEDS, ZONE_STALLS, ZONE_SPOTS, zoneWalkable, zoneSwimmable, zoneSolid, zoneSiteLayout, zoneResident, zoneRoomAt, zoneShoreZ } from '../sim/zone.js';
import { SPEED, SWIM, structureFootprint } from '../sim/sim.js';
import { DESIGNS, BUSINESSES } from '../sim/economy.js';
import { VEHICLE_KINDS, RUN_RULES, vehicleFits, vehicleSpeedAt, vehicleBox, lowerFirst } from '../sim/vehicles.js';
import { createTranslator } from '../sim/culture.js';
import { createLoopbackHub, createRoomTransport } from '../net/transport.js';
import { createLink } from '../net/link.js';
import { buildWorld } from './render-world.js';
import { buildTown } from './render-town.js';
import { createCrowd } from './render-crowd.js';
import { linear, setLite } from './render-kit.js';
import { makeVehicle, makeVan, createParcelLayer, createSiteLayer, createYardStacks } from './render-actors.js';
import { initVehicles, setVehicleDaylight, vehicleWarmJobs } from './vehicle-models.js';
import { vehicleMeta } from './vehicle-kit.js';
import { makeCharacter, animateCharacter, seatCharacter, standCharacter, showName, layCharacter, reactionNames, reactionLength } from './render-people.js';
import { createSky } from './render-sky.js';
import { createBubbles } from './bubbles.js';
import { createAudio, renderStyle, MUSIC_STYLES, DEFAULT_VOLUMES } from './audio.js';
import { createUI, h } from './ui.js';
import { createControls } from './controls.js';
import { createMonitor, createGovernor } from './monitor.js';
import { createWarmUp } from './warmup.js';
import { HEALTH } from '../sim/conflict.js';
import { driverSide } from '../sim/hijack.js';
import { MOTO, motoSpeedAt } from '../sim/okada.js';
import { startStrike, poseFighter, poseTaking, soundOf } from './combat-view.js';
import { createCameraRig, nextView, viewFor, CAMERA_VIEW } from './camera.js';
import { createIntro } from './intro.js';
import { PROMPT_ICON, icon } from './icons.js';
import { createCreator } from './creator.js';
import { createRadar } from './radar.js';
import { createBlood } from './blood.js';
import { createSkills } from './skills.js';
import { buildCatalog } from './skill-catalog.js';
import { createFitter } from './fit.js';
import { QUALITY_RULES } from './monitor.js';
import { createWebApp } from './webapp.js';
import { packCharacter, unpackCharacter, checkCharacter, CarryError } from './carry.js';
import { cowrieText, cowrieAmount, POUNDS_PER_COWRIE, COWRIE } from '../sim/ledger.js';

const SAVE_KEY = `nlw-save-v5-${ZONE.id}`;      // the keys keep their first names so that a character made before the game was renamed is still found
const PREFS_KEY = 'nlw-prefs-v1';
const SKINS = [0x3b2415, 0x4f3019, 0x6b4226, 0x8a5a36, 0xa9724a, 0xc48e62];
const TOPS = [0xf2c200, 0x1f5c4d, 0xb3261e, 0x2f4f7f, 0xf3ecdc, 0x7b2d5b];
const HOLD_SECONDS = 1.25;
// A phone or a tablet draws the town the lighter way (see `surface` in render-kit.js): fewer full figures,
// nearer; fewer pixels; a smaller, harder-edged shadow; no lamps that every surface must answer to. The
// address ending in #lite asks for it on any device, and #full refuses it, so the two can be compared.
const HASH = typeof location !== 'undefined' ? location.hash : '';
const TOUCH_FIRST = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const LITE = !HASH.includes('full') && (TOUCH_FIRST || HASH.includes('lite'));
const MAX_RIGS = LITE ? [14, 11, 8, 5] : [26, 18, 12, 6];
const VEHICLE_BIAS = [1, 0.8, 0.6, 0.45];     // how much nearer a vehicle must be for each level of detail, as quality drops
const DRIVER_SEAT = vehicleMeta('keke').seats.driver;   // where the keke's driver sits, in the keke's own frame
const SEATED_HEIGHT = 0.845;                 // how far above its own feet a seated figure's seat is, for a figure of height 1
const FIGURE_DETAIL = LITE ? [44, 36, 28, 22] : [60, 45, 32, 24];      // metres within which a townsperson is drawn with limbs
const PLATE_REGION = ZONE.government.state.short.replace(/ State$/, '');   // the state named on a registration plate
const REACH = LITE ? [300, 270, 230, 190] : [400, 330, 260, 200];          // how far the town is drawn, by detail level
const $ = (id) => document.getElementById(id);
// For measuring the page's own work apart from the graphics card's: the address ending in #nodraw draws nothing.
const NO_DRAW = HASH.includes('nodraw');
const NO_INTRO = HASH.includes('nointro');

function readStored(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (error) { return null; }
}
function writeStored(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch (error) { /* storage unavailable or full: play on without saving */ }
}
function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (error) { /* nothing to clear */ }
}

// The page's own words about the town come from the zone.
function dressPage() {
  $('view').setAttribute('aria-label', `The town of ${ZONE.name}`);
  // the steering wheel the stick becomes at the wheel of a vehicle
  { const art = icon('wheel'); art.classList.add('wheelart'); $('stick').append(art); }
  // the phone and the chat in the same solid icons as the rest of the controls
  { const b = $('btn-phone'); const svg = b.querySelector('svg'); if (svg) svg.replaceWith(icon('phone')); const c = $('chat-btn'); const csvg = c.querySelector('svg'); if (csvg) csvg.replaceWith(icon('chat')); }
  $('start-intro').replaceChildren(...(ZONE_TEXT.story || [ZONE_TEXT.intro]).map((line) => h('p', {}, line)));
  $('hud-place').replaceChildren(ZONE.name, h('span', { class: 'wide' }, `, ${ZONE.stateName} State`));
  $('enter').textContent = `Enter ${ZONE.name}`;
}

function start(carried) {
  dressPage();
  const canvas = $('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LITE ? 1.25 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = LITE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  setLite(LITE);
  renderer.outputEncoding = THREE.sRGBEncoding;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 2000);
  initVehicles(renderer);
  const world = buildWorld(scene);
  const town = buildTown(scene, world.glowMaterial);
  const crowd = createCrowd(scene);
  const blood = createBlood(scene);
  const sky = createSky(scene, renderer);
  const parcelLayer = createParcelLayer(scene);
  const siteLayer = createSiteLayer(scene);
  const yardStacks = createYardStacks(scene);
  const audio = createAudio();

  // Street lamps at night. Every light of this kind is worked out for every pixel of everything, lit or
  // not, at any hour, so there are few: the two lamps nearest the player on a desktop, none on a phone.
  // What every lamp does have is a pool of light painted on the ground under it, which costs next to nothing.
  const lampLights = [];
  for (let i = 0; i < (LITE ? 0 : 2); i += 1) { const light = new THREE.PointLight(0xffc98a, 0, 30, 1.6); light.position.y = 4.8; scene.add(light); lampLights.push(light); }
  const lampPools = (() => {
    const size = 64;
    const canvas2 = document.createElement('canvas');
    canvas2.width = size; canvas2.height = size;
    const g = canvas2.getContext('2d');
    const fall = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    fall.addColorStop(0, 'rgba(255,214,160,1)'); fall.addColorStop(0.35, 'rgba(255,200,138,0.5)'); fall.addColorStop(1, 'rgba(255,190,120,0)');
    g.fillStyle = fall; g.fillRect(0, 0, size, size);
    const material = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
    const disc = new THREE.PlaneGeometry(15, 15);
    disc.rotateX(-Math.PI / 2);
    const mesh = new THREE.InstancedMesh(disc, material, Math.max(1, world.lampHeads.length));
    const at = new THREE.Matrix4();
    world.lampHeads.forEach((lamp, i) => { at.makeTranslation(lamp.x, 0.07, lamp.z); mesh.setMatrixAt(i, at); });
    mesh.count = world.lampHeads.length;
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, material };
  })();
  // What is marked for the player in the town is marked in white: the game's interface has no colour of its own.
  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const beaconMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
  // A place marked from the phone: a tall white beacon in the town, and its distance at the top of the screen.
  let waypoint = null;
  const waypointMesh = new THREE.Group();
  {
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.6, 32), material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 22, 10, 1, true), material);
    column.position.y = 11;
    waypointMesh.add(ring, column);
    waypointMesh.visible = false;
    scene.add(waypointMesh);
  }
  function setWaypoint(mark) {
    waypoint = mark && Number.isFinite(mark.x) && Number.isFinite(mark.z) ? { x: mark.x, z: mark.z, label: mark.label || '' } : null;
    waypointMesh.visible = !!waypoint;
    if (waypoint) waypointMesh.position.set(waypoint.x, 0, waypoint.z);
  }
  const markers = new Map();
  let viewW = 1, viewH = 1;

  // The radar in the top left. Where it points the player: a place marked on the phone, else the current
  // job or run. The way there is asked of the simulation now and then (it follows the roads), not every frame.
  const radar = createRadar($('radar-map'));

  // Skills: the character's own animations, five to a page, from the button at the middle of the right edge.
  // A skill only moves the body: it is told to the simulation so that others see it, and hurts nobody.
  let meEmote = null;            // a skill being played on a figure on the game's own skeleton: { name, start }
  const skills = createSkills({ root: $('hud'), touch: $('touch'), onPlay: playSkill, onChange: () => { fitTimer = 0; } });
  // nothing on screen lies on anything else: measured and fitted a few times a second, and at once on a turn
  const fitter = createFitter({ game: $('game'), hud: $('hud'), radar: $('radar'), hudr: $('hudr'), stick: $('stick'), pad: $('pad'), skillsBtn: $('skills-btn'), skillsPage: $('skills-page'), isOpen: () => skills.state.open });
  let fitTimer = 0;
  for (const type of ['resize', 'orientationchange']) window.addEventListener(type, () => { fitTimer = 0; setTimeout(() => fitter.fit(), 120); });
  function skillsFor(rig) {
    skills.setCatalog([]);
    const fill = () => { if (rig !== me) return; skills.setCatalog(rig.animated ? buildCatalog(rig.clips(), { source: 'file' }) : buildCatalog(reactionNames().map((n) => ({ name: n, label: n.charAt(0).toUpperCase() + n.slice(1), duration: reactionLength(n) })), { source: 'carried' })); };
    if (rig.animated) rig.loaded.then(fill); else fill();
    if (rig.animated) rig.onEmoteEnd = () => skills.setPlaying(null);
  }
  function playSkill(entry) {
    if (!playing || mode !== 'walking' || !me) return;
    const result = server.send({ type: 'emote', name: entry.clip });
    if (!result.ok) { ui.toast({ type: 'note', text: result.message }); return; }
    if (me.animated) { if (!me.emote(entry.clip)) return; } else meEmote = { name: entry.clip, start: clock };
    skills.setPlaying(entry.id);
  }
  // a skill on a figure on the game's own skeleton: the carried-over clip, faded in and out over the body
  function driveKitEmote(dt, speed) {
    if (!me || me.animated) return;
    if (!meEmote) { if (me.reaction && me.reaction.weight > 0) me.reaction.weight = Math.max(0, me.reaction.weight - dt * 4); return; }
    const t = clock - meEmote.start, length = reactionLength(meEmote.name) || 1;
    if (t >= length || speed > 0.35 || mode !== 'walking') { meEmote = null; skills.setPlaying(null); return; }
    me.reaction = { name: meEmote.name, time: t, weight: Math.min(1, t / 0.25, (length - t) / 0.3), loop: false, upper: false };
  }
  $('radar').addEventListener('click', () => ui.openPhone('map'));
  let radarWait = 0, radarWay = null, radarRouteWait = 0, radarRouteFor = '';
  function radarTarget() {
    if (waypoint) return waypoint;
    const run = view.self.run;
    if (run) return run.state === 'accepted' ? run.from : run.to;
    return null;
  }
  function drawRadar(dt, { driving, astride, riding }) {
    radarWait -= dt; radarRouteWait -= dt;
    if (radarWait > 0) return;
    radarWait = 1 / 12;
    const target = radarTarget();
    const key = target ? `${target.x},${target.z}` : '';
    if (!target) radarWay = null;
    else if (key !== radarRouteFor || radarRouteWait <= 0) {
      radarRouteFor = key; radarRouteWait = 1.5;
      const r = server.send({ type: 'map.route', x: target.x, z: target.z, label: target.label || '' });
      radarWay = r && r.ok && r.points ? [...r.points, [target.x, target.z]] : null;
    }
    const self = view.self;
    const chased = self.law.state === 'pursuit' || self.law.state === 'wanted';
    const keke = !self.driving && view.vehicles.find((v) => v.yours);
    radar.draw({
      x: predicted.x, z: predicted.z, heading: predicted.heading, yaw: rig.live.yaw, vehicle: !!(driving || astride || riding),
      target, route: radarWay, keke: keke ? { x: keke.x, z: keke.z } : null,
      police: chased ? (view.officers || []) : [], ambulance: view.ambulance && view.ambulance.mode !== 'parked' ? view.ambulance : null,
      parcels: view.parcels, t: clock,
    });
  }

  function resize() {
    viewW = canvas.clientWidth || 1;
    viewH = canvas.clientHeight || 1;
    renderer.setSize(viewW, viewH, false);
    camera.aspect = viewW / viewH;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- state --

  const stored = carried && carried.host ? carried : readStored(SAVE_KEY);
  const prefs = { translate: true, sound: true, detail: 'auto', ...(readStored(PREFS_KEY) || {}) };
  let host = createHost({ saved: stored ? stored.host : null });
  let playerId = stored && host.game.hasPlayer(stored.playerId) ? stored.playerId : null;
  let playing = false;
  let view = null;
  let predicted = { x: ZONE.spawn.x, z: ZONE.spawn.z, heading: 0 };
  let me = null;
  const residentActors = new Map();
  const vehicleActors = new Map();
  const known = new Map();           // what the simulation has told us of the people we have seen
  const asking = new Set();
  const car = { speed: 0, complained: -10 };
  const moto = { speed: 0, lean: 0 };       // a motorcycle the player is riding themselves
  // Low roofs with open sides: trade sheds and market stalls. Someone under one cannot be seen from above it,
  // so the camera stays below the eaves there, or comes in front of them.
  const lowRoofs = [
    ...ZONE_SHEDS.map((sh) => { const alongX = sh.face === 'n' || sh.face === 's'; const hx = (alongX ? sh.w : sh.d) / 2 + 0.5, hz = (alongX ? sh.d : sh.w) / 2 + 0.5; return { x0: sh.x - hx, x1: sh.x + hx, z0: sh.z - hz, z1: sh.z + hz }; }),
    ...ZONE_STALLS.map((st) => ({ x0: st.x - 2, x1: st.x + 2, z0: st.z - 2.2, z1: st.z + 1.8 })),
  ];
  const underLowRoof = (x, z) => { for (const r of lowRoofs) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return true; return false; };
  const rig = createCameraRig(camera, { blocked: (x, z, y) => zoneSolid(x, z, 0.25) || (y > 1.95 && underLowRoof(x, z)) });
  let near = { fight: null, steal: null, take: null };      // who and what is within reach for the things only sometimes on offer
  let lastFight = 0;                 // the last blow from the simulation that has been shown
  let flash = 0;                     // the screen's edge reddens for a moment when the player is struck
  let requestSeq = 0;
  const coarse = TOUCH_FIRST;      // a touch screen: hints speak of the stick and the buttons
  // An id for one press of a button that spends or takes money: the simulation answers it once, however often it arrives.
  const requestId = (what) => `${what}-${Date.now().toString(36)}-${(requestSeq += 1)}`;
  const cam = { yaw: Math.PI, pitch: 0.27, dist: 8, target: new THREE.Vector3(ZONE.spawn.x, 1.5, ZONE.spawn.z), lastDrag: -10 };
  const controls = createControls({ stick: $('stick'), pad: $('pad') });
  const input = controls.state;      // keys down, where the stick is, whether Run is on
  let actKey = false;                // E or Enter held down
  const acting = () => actKey || controls.held('act');
  let mode = 'start';                // what the player is doing, which decides the buttons shown: see controlMode()
  const perf = { fps: 60, calls: 0, triangles: 0, programs: 0, geometries: 0, textures: 0 };
  const monitor = createMonitor();
  const warmUp = createWarmUp(renderer, scene);
  const warm = { stage: 0, frames: 0, extras: [] };
  const startEl = $('start');
  let prompt = null;
  let holdProgress = 0;
  let clock = 0;
  let viewTimer = 1;
  let saveTimer = 0;
  let lampTimer = 1;
  let soundTimer = 1;
  let lastComplaint = -10;
  let lastHonk = -10;
  let night = 0;
  let inside = null;
  let room = null;
  let stepPhase = 0;
  let sources = [];
  let spectator = null;

  // Other players. A transport reports who else is here; the link passes
  // them to the simulation, which decides who is near and what is heard.
  let transport = null;
  let link = null;
  let twin = null;                    // a second world in this page, for testing two players
  function relink() {
    if (link) { link.close(); link = null; }
    if (transport && playerId) link = createLink({ transport: transport.make(), game: host.game, zoneId: ZONE.id, self: () => (view ? view.self : null) });
  }
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('room').then((live) => { if (live) { transport = { make: () => createRoomTransport(live) }; if (playing) relink(); } }).catch(() => {});
  }

  // Translation: the phrase book first; then, only when the player taps
  // Translate on a message, a request to Claude if this page has been given it.
  let sampler = null;
  const translator = createTranslator({ service: Object.assign(async (text, from, to) => {
    const out = await sampler(`Translate this short chat message from ${from} into ${to}. Reply with the translation only: no quotation marks and no notes. If it is already in ${to}, repeat it unchanged.\n\nMessage: ${text}`, { modelTier: 'quick' });
    return out && out.text ? out.text.trim() : null;
  }, { ready: () => !!sampler }) });
  if (window.claude && typeof window.claude.use === 'function') window.claude.use('sample').then((fn) => { sampler = fn || null; }).catch(() => {});

  // On the website the game can be put on a device and kept there; anywhere else this offers nothing.
  const webapp = createWebApp({ figures: { W1: 'woman.b64.txt', M1: 'man.b64.txt' }, figure: () => (prefs.look && prefs.look.figure === 'M1' ? 'M1' : 'W1') });

  const settings = {
    language: () => (view ? view.self.lang : 'en'),
    translate: () => prefs.translate,
    setTranslate: (on) => { prefs.translate = !!on; writeStored(PREFS_KEY, prefs); },
    machine: () => translator.hasService,
  };
  const bubbles = createBubbles($('bubbles'), { translator, settings });

  const server = {
    send: (intent) => host.game.intent(playerId, intent),
    portal: (method, args) => host.portal(playerId, method, args),
  };
  const ui = createUI({
    send: (intent) => { const r = server.send(intent); refreshView(); return r; },
    portal: (method, args) => { const r = server.portal(method, args); refreshView(); return r; },
    view: () => view,
    restart: () => { clearSave(); playing = false; ui.close(); showStart(true); },
    closed: () => { if (playing) { refreshView(); prompt = findPrompt(); } },
    settings,
    webapp,
    // the character as a code, to take to another browser or device (src/client/carry.js)
    character: { code: () => packCharacter({ zone: ZONE.id, save: { host: host.save(), playerId }, prefs }) },
    link: () => (link ? link.status() : { kind: 'none', peers: 0, failed: false }),
    room: () => (room ? `${room.name}` : null),
    sound: () => { prefs.sound = !prefs.sound; audio.setMuted(!prefs.sound); if (prefs.sound) audio.start(); writeStored(PREFS_KEY, prefs); return prefs.sound; },
    soundOn: () => prefs.sound,
    requestId,
    waypoint: () => waypoint,
    setWaypoint: (mark) => setWaypoint(mark),
    setDetail: (value) => setDetail(value),
    volumes: () => audio.volumes(),
    setVolume: (name, value) => { audio.setVolumes({ [name]: value }); prefs.volumes = audio.volumes(); writeStored(PREFS_KEY, prefs); if (name === 'ui') audio.chime('ok'); },
    chime: (kind) => audio.chime(kind),
    perf: () => { const s = host.game.stats(); return { lite: LITE, fps: perf.fps, calls: perf.calls, triangles: perf.triangles, near: s.near, middle: s.middle, far: s.far, rigs: crowd.stats.rigs + residentActors.size, figures: crowd.stats.figures, viewMs: s.lastViewMs, scanMs: s.lastScanMs, quality: quality.level, frame: monitor.report(), hitchMs: monitor.HITCH_MS, freezeMs: monitor.FREEZE_MS, changes: governor.changes, detail: prefs.detail, sound: !audio.supported ? 'Not available in this browser' : audio.muted ? 'Muted' : audio.status().state }; },
  });
  audio.setMuted(!prefs.sound);
  audio.setVolumes({ ...DEFAULT_VOLUMES, ...(prefs.volumes || {}) });

  for (const r of ZONE_RESIDENTS) {
    const actor = makeCharacter(r.look, r.name, false, 1);
    actor.group.visible = false;
    scene.add(actor.group);
    residentActors.set(r.id, actor);
  }

  function drawZone(zone) {
    parcelLayer.update(zone.parcels);
    siteLayer.update(zone.sites);
    yardStacks.set(zone.yardBlocks);
    const seen = new Set();
    for (const v of zone.vehicles) {
      seen.add(v.id);
      let actor = vehicleActors.get(v.id);
      if (!actor) {
        actor = makeVehicle(v.look, v.plate, PLATE_REGION);
        actor.group.position.set(v.x, 0, v.z);
        actor.group.rotation.y = v.heading;
        scene.add(actor.group);
        vehicleActors.set(v.id, actor);
      }
      actor.truth = v;
      actor.ring.visible = v.yours && !v.driver;
    }
    for (const [id, actor] of vehicleActors) if (!seen.has(id)) { scene.remove(actor.group); actor.model.dispose(); vehicleActors.delete(id); }
  }

  // Asks the simulation who the people now in view are. It is asked once for
  // each new face; after that only their positions arrive.
  function learnFaces(zone) {
    const unknown = [];
    const want = (i) => { if (typeof i === 'number' && !known.has(i) && !asking.has(i)) { asking.add(i); unknown.push(i); } };
    for (const row of zone.people) want(row[0]);
    for (const o of zone.okadas) { want(o.person); want(o.passenger); }
    if (!unknown.length) return;
    const faces = playerId ? [] : host.game.faces(unknown);
    if (playerId) for (let from = 0; from < unknown.length; from += 60) { const r = server.send({ type: 'people.describe', ids: unknown.slice(from, from + 60) }); if (r.ok) faces.push(...r.people); }
    for (const face of faces) known.set(face.index, face);
    for (const i of unknown) asking.delete(i);
  }

  // What the simulation has to tell this player: receipts and notices to show, things to sound.
  function hear(event) {
    if (event.type === 'sound') { audio.bell(event.x, event.z, event.sound); return; }
    if (event.type === 'struck') { flash = 1; startStrike(me, 'flinch', clock); return; }             // the blow itself is drawn and sounded from the fight feed
    if (event.type === 'police' && event.sound === 'whistle') audio.whistle(event.x, event.z);
    if (event.type === 'critical' || event.type === 'alert' || (event.type === 'police' && event.title !== 'Released')) audio.chime('alert');
    else if (event.type === 'call') audio.chime('ring');
    else if (event.type === 'message' || event.type === 'witness') audio.chime('ok');
    else if (event.type === 'receipt' && event.amount) audio.chime('paid');
    ui.toast(event);
  }

  // Blows struck within sight since last time: each moves the two figures and makes its sound.
  function showFights(events) {
    for (const e of events) {
      if (e.id <= lastFight) continue;
      lastFight = e.id;
      const mine = e.from === `p:${playerId}`;
      const from = mine ? me : crowd.rigOf(e.from);
      const to = !e.to ? null : e.to === `p:${playerId}` ? me : crowd.rigOf(e.to);
      startStrike(from, e.kind, clock);
      if (to && e.hit) startStrike(to, e.blocked ? 'block' : 'flinch', clock);
      const sound = soundOf(e);
      if (sound) audio.blow(sound, e.x, e.z);
    }
  }

  // A vehicle has struck someone within sight: it is heard, and whoever was in it or under it feels it.
  let lastImpact = 0;
  function showImpacts(events) {
    for (const e of events || []) {
      if (e.id <= lastImpact) continue;
      lastImpact = e.id;
      audio.blow('heavy', e.x, e.z);
      setTimeout(() => audio.blow('fall', e.x, e.z), 140);
      const mine = (e.by.kind === 'player' && e.by.id === playerId) || (e.on.kind === 'player' && e.on.id === playerId);
      if (mine) { jolt(); if (e.on.id === playerId) flash = 1; }
    }
  }
  // The picture shakes once: a short, small movement of the whole view, and a buzz where the device has one.
  function jolt() {
    const el = $('view');
    el.classList.remove('jolt'); void el.offsetWidth; el.classList.add('jolt');
    try { if (navigator.vibrate) navigator.vibrate(60); } catch (error) { /* no buzzer */ }
  }

  // Is the player being moved by the simulation and not by their own hands? (walked in by an officer, carried, held)
  const led = () => !!view && (!!view.self.law.arrest || !!view.self.carried || !!view.self.hijack || !!view.self.down || !!view.self.dead || (view.self.fight && view.self.fight.held));

  function refreshView() {
    if (!playerId) return;
    view = host.game.view(playerId);
    drawZone(view);
    learnFaces(view);
    ui.updateHud(view);
    for (const event of host.game.drain(playerId)) hear(event);
    showFights(view.fights);
    showImpacts(view.impacts);
    crowd.setGuards(new Set(view.moods.filter((m) => m.mood === 'fighting' || m.mood === 'warned').map((m) => m.i)));
    if (led()) { predicted.x = view.self.x; predicted.z = view.self.z; if (!view.self.down && !view.self.dead) predicted.heading = view.self.heading; }
    // put somewhere else altogether by the simulation (coming round at the hospital): the figure goes with it
    else if (!view.self.driving && !view.self.astride && view.self.riding === null && Math.hypot(view.self.x - predicted.x, view.self.z - predicted.z) > 6) { predicted.x = view.self.x; predicted.z = view.self.z; predicted.heading = view.self.heading; going.speed = 0; }
    syncMarkers();
  }

  // Before anyone has joined, show the town as a bystander would see it.
  function drawSpectator() {
    spectator = host.game.spectate(ZONE_PROPS.startCamera);
    drawZone(spectator);
    learnFaces(spectator);
    for (const actor of vehicleActors.values()) { actor.group.position.set(actor.truth.x, 0, actor.truth.z); actor.group.rotation.y = actor.truth.heading; actor.ring.visible = false; }
    for (const r of spectator.residents) {
      const actor = residentActors.get(r.id);
      actor.group.visible = r.mode !== 'inside';
      actor.group.position.set(r.x, 0, r.z);
      actor.group.rotation.y = r.heading;
      actor.label.visible = false;
    }
  }

  function syncMarkers() {
    const wanted = new Set();
    for (const site of view.sites) {
      if (!site.design || site.complete || !view.self.owned.includes(site.parcelId)) continue;
      wanted.add(site.parcelId);
      if (!markers.has(site.parcelId)) {
        const spot = zoneSiteLayout(ZONE_PARCELS.find((p) => p.id === site.parcelId)).work;
        const mesh = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.8, 24), markerMaterial);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(spot.x, 0.07, spot.z);
        scene.add(mesh);
        markers.set(site.parcelId, mesh);
      }
    }
    // where the current delivery run has to go next
    const run = view.self.run;
    if (run) {
      const spot = run.state === 'accepted' ? run.from : run.to;
      const key = `run:${run.id}:${run.state}`;
      wanted.add(key);
      if (!markers.has(key)) {
        const mesh = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.RingGeometry(RUN_RULES.reach - 0.5, RUN_RULES.reach, 40), markerMaterial);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.09;
        const column = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 16, 10, 1, true), beaconMaterial);
        column.position.y = 8;
        mesh.add(ring, column);
        mesh.position.set(spot.x, 0, spot.z);
        scene.add(mesh);
        markers.set(key, mesh);
      }
    }
    for (const [id, mesh] of markers) if (!wanted.has(id)) { scene.remove(mesh); markers.delete(id); }
  }

  // What players have built.
  function builtBoxes() {
    const boxes = [];
    if (!view) return boxes;
    for (const site of view.sites) if (site.design && site.stage >= 1) boxes.push(structureFootprint(ZONE_PARCELS.find((p) => p.id === site.parcelId), DESIGNS[site.design]));
    return boxes;
  }

  // What stands in the way of someone on foot: buildings and parked vehicles,
  // except a vehicle that has been put down on top of them.
  function structureBoxes() {
    const boxes = builtBoxes();
    if (!view) return boxes;
    for (const v of view.vehicles) {
      if (v.driver) continue;
      const b = vehicleBox(v);
      if (predicted.x > b.x0 - 0.4 && predicted.x < b.x1 + 0.4 && predicted.z > b.z0 - 0.4 && predicted.z < b.z1 + 0.4) continue;
      boxes.push(b);
    }
    // and the ambulance, wherever it is standing
    const a = view.ambulance;
    const van = Math.abs(Math.sin(a.h)) > 0.5 ? { x0: a.x - 2.7, x1: a.x + 2.7, z0: a.z - 1.1, z1: a.z + 1.1 } : { x0: a.x - 1.1, x1: a.x + 1.1, z0: a.z - 2.7, z1: a.z + 2.7 };
    if (!(predicted.x > van.x0 - 0.5 && predicted.x < van.x1 + 0.5 && predicted.z > van.z0 - 0.5 && predicted.z < van.z1 + 0.5)) boxes.push(van);
    return boxes;
  }

  // -------------------------------------------------------------- start --

  // The character: one of the owner's supplied figures, turned in its own view, in the colours the player
  // picks. The last choice made on this device is where the screen starts.
  const creator = createCreator({
    canvas: $('stage-view'), root: $('start'), nameField: $('name'),
    saved: prefs.look || {},
    onPick: (look) => { prefs.look = look; writeStored(PREFS_KEY, prefs); },
  });
  window.__creator = creator;
  // The answer to the opening's question: remembered on this device, and shown here so it can be changed
  // before a character is made. It goes to the simulation with the character and stays with them.
  let pathChosen = prefs.path === 'villain' ? 'villain' : 'hero';
  function choosePath(path, remember = true) {
    pathChosen = path === 'villain' ? 'villain' : 'hero';
    for (const button of $('paths').children) button.setAttribute('aria-pressed', String(button.dataset.path === pathChosen));
    if (remember) { prefs.path = pathChosen; writeStored(PREFS_KEY, prefs); }
  }
  choosePath(pathChosen, false);
  for (const button of $('paths').children) button.addEventListener('click', () => { choosePath(button.dataset.path); audio.choose('move'); });

  function showStart(fresh) {
    $('start').hidden = false;
    $('hud').hidden = true;
    $('touch').hidden = true;
    bubbles.clear();
    if (link) { link.close(); link = null; }
    if (fresh) { host = createHost(); playerId = null; view = null; known.clear(); if (me) { scene.remove(me.group); me = null; } }
    for (const mesh of markers.values()) scene.remove(mesh);
    markers.clear();
    drawSpectator();
    const resume = $('continue');
    resume.hidden = !playerId;
    $('bring').hidden = !!playerId;      // offered only where there is no character to lose
    $('start-install').hidden = !!playerId || webapp.state().way !== 'share';
    if (playerId) resume.textContent = `Continue as ${host.game.view(playerId).self.name}`;
  }

  function enterWorld() {
    view = host.game.view(playerId);
    if (me) scene.remove(me.group);
    me = makeCharacter(view.self.look, null, true);
    scene.add(me.group);
    skillsFor(me);
    predicted = { x: view.self.x, z: view.self.z, heading: view.self.heading };
    car.speed = 0;
    cam.target.set(predicted.x, 1.5, predicted.z);
    cam.yaw = Math.PI; cam.pitch = 0.27; cam.dist = view.self.driving ? 11 : 8;
    $('start').hidden = true;
    $('hud').hidden = false;
    if (coarse) $('touch').hidden = false;
    playing = true;
    spectator = null;
    if (prefs.sound) audio.start();
    relink();
    refreshView();
    canvas.focus({ preventScroll: true });
  }

  $('creator').addEventListener('submit', (event) => {
    event.preventDefault();
    const fresh = createHost();
    try {
      const id = fresh.game.join({ name: $('name').value, path: pathChosen, look: creator.look() });
      host = fresh; playerId = id;
      known.clear();
      $('start-error').hidden = true;
      enterWorld();
      ui.toast({ type: 'note', text: ZONE_TEXT.arrival });
    } catch (error) {
      $('start-error').hidden = false;
      $('start-error').textContent = error.message;
    }
  });
  $('continue').addEventListener('click', () => { if (playerId) enterWorld(); });

  // A character from somewhere else, brought here as a code (src/client/carry.js). Offered only while there is
  // no character on this device, so nothing is ever replaced. What the code holds is checked before it is kept;
  // then the page starts again, as it does for anyone coming back, without the opening a second time.
  const bringSay = (text) => { $('bring-error').hidden = !text; $('bring-error').textContent = text || ''; };
  async function bringCharacter(text) {
    if (playerId) return false;
    bringSay('');
    try {
      const found = checkCharacter(await unpackCharacter(text), { zone: ZONE.id, version: SAVE_VERSION, createHost });
      if (!found.ok) { bringSay(found.why); return false; }
      let kept = false;
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(found.save)); kept = !!readStored(SAVE_KEY); } catch (error) { kept = false; }
      if (!kept) { bringSay('This browser would not keep the character: its storage is full or switched off.'); return false; }
      writeStored(PREFS_KEY, { ...prefs, ...found.prefs });
      const flags = location.hash.replace(/^#/, '').split('-').filter(Boolean);
      if (!flags.includes('nointro')) flags.push('nointro');
      location.hash = flags.join('-');
      location.reload();
      return true;
    } catch (error) {
      bringSay(error instanceof CarryError ? error.message : 'That code could not be read.');
      return false;
    }
  }
  $('bring-open').addEventListener('click', () => { const panel = $('bring-panel'); panel.hidden = !panel.hidden; $('bring-open').setAttribute('aria-expanded', String(!panel.hidden)); });
  $('bring-go').addEventListener('click', () => { bringCharacter($('bring-code').value); });
  $('bring-paste').addEventListener('click', async () => {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch (error) { text = ''; }
    if (!text || !text.trim()) { bringSay('This browser will not hand over what was copied. Press and hold in the box below, choose Paste, then press Bring it here.'); $('bring-code').focus(); return; }
    $('bring-code').value = text.trim();
    bringCharacter(text);
  });

  // -------------------------------------------------------------- input --

  const typing = (target) => target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
  const keyName = (event) => (event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toLowerCase() : event.key);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { if (ui.chatOpen()) ui.closeChat(); else if (ui.isOpen()) ui.close(); return; }
    if (!playing || typing(event.target)) return;
    const key = keyName(event);
    if (key === 'Tab' || key === 'p') { event.preventDefault(); if (ui.isOpen()) ui.close(); else ui.openPhone(); return; }
    if (key === 'm') { ui.openPhone('map'); return; }
    if (key === 'n') { toggleSound(); return; }
    if (ui.isOpen()) return;
    if (key === 't') { if (ui.openChat()) event.preventDefault(); return; }
    if (key === 'k') { if (!event.repeat) skills.tap(); return; }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(key)) event.preventDefault();
    if (key === 'Enter') { if (!event.repeat) act('act', 'down'); actKey = true; return; }
    // whatever is on offer just now has a key: the same list that draws the buttons says which
    const button = keymap.get(key);
    if (button) { if (!event.repeat) { act(button.id, 'down'); if (button.kind === 'hold') heldKeys.add(key); } if (button.id === 'act') actKey = true; return; }
    input.keys.add(key);
  });
  window.addEventListener('keyup', (event) => {
    const key = keyName(event);
    if (key === 'Enter' || key === 'e') actKey = false;
    if (heldKeys.delete(key)) { const button = keymap.get(key); if (button) act(button.id, 'up'); }
    input.keys.delete(key);
  });
  // a key or a finger lifted while the page is not looking is never reported, so let go of everything
  const letGo = () => { controls.release(); actKey = false; for (const key of heldKeys) { const button = keymap.get(key); if (button) act(button.id, 'up'); } heldKeys.clear(); };
  window.addEventListener('blur', letGo);
  const toggleSound = () => { prefs.sound = !prefs.sound; audio.setMuted(!prefs.sound); if (prefs.sound) audio.start(); writeStored(PREFS_KEY, prefs); ui.toast({ type: 'note', text: prefs.sound ? 'Sound on.' : 'Sound off.' }); };

  const pointers = new Map();
  let pinch = 0;
  canvas.addEventListener('pointerdown', (event) => { canvas.setPointerCapture(event.pointerId); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); canvas.focus({ preventScroll: true }); if (playing && prefs.sound) audio.start(); });
  canvas.addEventListener('pointermove', (event) => {
    const p = pointers.get(event.pointerId);
    if (!p) return;
    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;
    p.x = event.clientX; p.y = event.clientY;
    if (pointers.size === 1) {
      if (!rig.drag(-dx * 0.0055)) cam.yaw -= dx * 0.0055;
      cam.pitch = Math.max(0.08, Math.min(1.25, cam.pitch + dy * 0.004));
      cam.lastDrag = clock;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const gap = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) cam.dist = Math.max(3.5, Math.min(60, cam.dist * (pinch / gap)));
      pinch = gap;
    }
  });
  const release = (event) => { pointers.delete(event.pointerId); pinch = 0; };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', (event) => { event.preventDefault(); cam.dist = Math.max(3.5, Math.min(60, cam.dist * (1 + Math.sign(event.deltaY) * 0.1))); }, { passive: false });

  // touch controls: the stick and the buttons live in controls.js; what each does is in act(), below
  controls.on((id, phase) => act(id, phase));
  window.addEventListener('touchstart', () => { if (playing) $('touch').hidden = false; }, { passive: true, once: true });

  // ------------------------------------------------------- interactions --

  const say = (result, text) => { refreshView(); if (!result.ok) ui.toast({ type: 'note', text: result.message }); else if (text) ui.toast({ type: 'note', text }); };

  function enterVehicle(v) {
    const result = server.send({ type: 'vehicle.enter', vehicleId: v.id });
    if (result.ok) { car.speed = 0; predicted = { x: result.vehicle.x, z: result.vehicle.z, heading: v.heading }; cam.dist = Math.max(cam.dist, 12); }
    say(result, result.ok ? (coarse ? 'Hold the pedal to go and steer with the stick. The door button lets you out.' : 'W and S to drive and brake, A and D to steer. E to step out.') : null);
  }

  function leaveVehicle() {
    const result = server.send({ type: 'vehicle.exit' });
    if (result.ok) { car.speed = 0; predicted.x = result.x; predicted.z = result.z; cam.dist = Math.min(cam.dist, 9); }
    say(result);
  }

  function getDown() {
    const result = server.send({ type: 'okada.alight' });
    if (result.ok) { predicted.x = result.x; predicted.z = result.z; }
    say(result);
  }

  // While driving there is one thing E does: the job in front of you, or stepping out.
  function findDrivingPrompt() {
    const v = view.self.driving;
    const run = view.self.run;
    const near = (spot) => Math.hypot(predicted.x - spot.x, predicted.z - spot.z) <= RUN_RULES.reach;
    if (Math.abs(car.speed) > 1.5) return null;
    if (run && run.state === 'accepted' && near(run.from)) return { short: 'Load', text: `Load: ${lowerFirst(run.what)}`, run: () => say(server.send({ type: 'run.load' }), `Loaded. Take it to ${run.to.label}.`) };
    if (run && run.state === 'loaded' && near(run.to)) return { short: 'Deliver', text: `Deliver to ${run.to.label}: ${cowrieText(run.fee)}`, run: () => say(server.send({ type: 'run.deliver' })) };
    if (v.load > 0) {
      for (const id of view.self.owned) {
        const p = ZONE_PARCELS.find((parcel) => parcel.id === id);
        const dx = Math.max(p.x0 - predicted.x, 0, predicted.x - p.x1);
        const dz = Math.max(p.z0 - predicted.z, 0, predicted.z - p.z1);
        if (Math.hypot(dx, dz) <= 9) return { short: 'Unload', text: `Unload at Plot ${p.plot}`, run: () => say(server.send({ type: 'vehicle.unload', vehicleId: v.id, parcelId: id })) };
      }
    }
    return { short: 'Get out', text: 'Step out of the keke', run: leaveVehicle };
  }

  function findPrompt() {
    if (!view) return null;
    if (view.self.law.arrest || view.self.carried || view.self.hijack) return null;
    if (view.self.driving) return findDrivingPrompt();
    if (view.self.astride) return Math.abs(moto.speed) > 1.5 ? null : { short: 'Get off', text: 'Get off the motorcycle', run: () => { const r = server.send({ type: 'moto.leave' }); if (r.ok) { moto.speed = 0; moto.lean = 0; predicted.x = r.x; predicted.z = r.z; } say(r); } };
    if (view.self.fight) return null;
    if (view.self.riding) return { short: 'Get down', text: 'Get down from the okada', run: getDown };
    const here = predicted;
    const options = [];
    const add = (x, z, range, option) => { const d = Math.hypot(here.x - x, here.z - z); if (d <= range) options.push({ ...option, d: d - (option.bias || 0) }); };
    for (const v of view.vehicles) {
      if (v.driver) continue;
      if (v.yours) add(v.x, v.z, 3.4, { bias: 1.2, short: 'Drive', text: `Drive keke ${v.plate}`, run: () => enterVehicle(v) });
      else add(v.x, v.z, 2.6, { bias: -0.5, short: 'Look', text: `Keke ${v.plate}: ${v.ownerName}`, run: () => ui.toast({ type: 'note', text: `This keke belongs to ${v.ownerName}. Kekes are hired and sold at the motor park.${v.locked ? ' It is locked.' : ''}` }) });
    }
    for (const o of view.okadas) {
      if (!o.free || o.moving || typeof o.person !== 'number') continue;
      const rider = known.get(o.person);
      add(o.x, o.z, 3.2, { bias: 0.5, short: 'Ride', text: `Okada: ride with ${rider ? rider.short : 'this rider'}`, run: () => ui.openOkada(o.n) });
    }
    for (const s of ZONE_SERVICES) {
      const status = view.services[s.id];
      add(s.x, s.z, 2.6, { bias: 0.8, short: 'Enter', text: status.open ? s.name : `${s.name}: ${status.reason}`, run: () => { if (status.open) ui.openService(s.id); else ui.toast({ type: 'note', text: `${s.name}. ${status.reason}` }); } });
    }
    for (const r of view.residents) {
      if (r.mode === 'inside') continue;
      const actor = residentActors.get(r.id);
      add(actor.group.position.x, actor.group.position.z, 3.0, { short: 'Talk', text: `Talk to ${zoneResident(r.id).name}`, run: () => ui.openDialogue(r.id) });
    }
    // anyone else in town, the nearest one
    let nearest = null;
    let nearestD = 2.7;
    for (const actor of crowd.actors()) { if (actor.pose === 3 || actor.d === undefined || actor.d >= nearestD || !known.has(actor.i)) continue; nearestD = actor.d; nearest = actor; }
    if (nearest) { const who = known.get(nearest.i); options.push({ d: nearestD + 0.3, short: 'Talk', text: `Talk to ${who.short}`, run: () => ui.talkToPerson(nearest.i) }); }
    for (const bench of ZONE_BENCHES) add(bench.x, bench.z, 2.0, { short: 'Sit', text: 'Sit on the bench', run: () => ui.openRest(bench.id) });
    for (const p of ZONE_PARCELS) {
      const layout = zoneSiteLayout(p);
      add(layout.board.x, layout.board.z, 2.6, { short: 'Read', text: `Read the survey board: Plot ${p.plot}`, run: () => ui.openBoard(p.id) });
    }
    for (const station of ZONE_MOULD_STATIONS) {
      if (station.reservedFor) continue;
      add(station.standX, station.standZ, 1.7, { bias: 1, hold: true, short: 'Mould', text: `Hold to mould a block: ${cowrieText(BUSINESSES.yard.wagePerBlock)} each`, intent: { type: 'job.mould', stationId: station.id } });
    }
    for (const site of view.sites) {
      if (!view.self.owned.includes(site.parcelId) || !site.design) continue;
      const parcel = ZONE_PARCELS.find((p) => p.id === site.parcelId);
      const layout = zoneSiteLayout(parcel);
      if (site.complete) {
        add(layout.work.x, layout.work.z, 5, { short: 'Sleep', text: 'Go in and sleep until morning', run: () => { const r = server.send({ type: 'sleep' }); refreshView(); ui.toast({ type: 'note', text: r.ok ? 'You sleep in your own house. It is morning.' : r.message }); } });
      } else {
        const stageName = DESIGNS[site.design].stages[site.stage].name.toLowerCase();
        add(layout.work.x, layout.work.z, 2.0, { bias: 1, hold: true, short: 'Work', text: `Hold to work on the ${stageName}`, intent: { type: 'site.work', parcelId: site.parcelId } });
      }
    }
    options.sort((a, b) => a.d - b.d);
    return options[0] || null;
  }

  function pressAct() {
    if (!playing || ui.isOpen() || !prompt || prompt.hold) return;
    prompt.run();
  }

  function completeHold() {
    const result = server.send(prompt.intent);
    refreshView();
    if (!result.ok && clock - lastComplaint > 2.5) { lastComplaint = clock; ui.toast({ type: 'note', text: result.message }); }
    if (!result.ok) { actKey = false; controls.release(); }
  }

  // ------------------------------------------------------------- controls --

  const keymap = new Map();          // key -> the button it presses just now
  const heldKeys = new Set();        // keys being held that are holding a button down
  let blocking = false;
  let lastGrumble = -10;
  const grumble = (text) => { if (clock - lastGrumble > 1.6) { lastGrumble = clock; ui.toast({ type: 'note', text }); } };

  // What the player is doing. It decides which buttons are on screen and what
  // each key means, and every change of it ends a run: the player always
  // starts again at a walk.
  // Whether the vehicle being driven is driven from a seat with a wheel and pedals: three wheels or more.
  function wheelLayout() { const d = view && view.self.driving; const kind = d && VEHICLE_KINDS[d.kind || 'keke']; return !!kind && (kind.wheels || 4) >= 3; }
  function controlMode() {
    if (!playing || !view) return 'start';
    if (ui.isOpen()) return 'panel';
    const self = view.self;
    if (self.dead || self.down) return 'down';
    if (self.law.arrest) return 'custody';
    if (self.carried) return 'carried';
    if (self.hijack) return 'taking';
    if (self.driving) return 'driving';
    if (self.astride) return 'moto';
    if (self.riding) return 'riding';
    if (self.fight) return 'combat';
    if (self.swimming) return 'swimming';
    return 'walking';
  }
  // Where the camera's choice of views comes from.
  const where = () => (view && (view.self.driving || view.self.astride || view.self.riding) ? 'vehicle' : 'foot');

  // Who and what is within reach for the things that are only sometimes on
  // offer: someone to square up to, a pocket, a vehicle at its driver's side.
  function findNear() {
    const out = { fight: null, steal: null, take: null };
    const self = view.self;
    if (self.driving || self.riding || self.astride || self.law.arrest || self.carried || self.hijack) return out;
    const fx = Math.sin(predicted.heading), fz = Math.cos(predicted.heading);
    let best = 2.2;
    const consider = (kind, id, name, x, z, h) => {
      const dx = x - predicted.x, dz = z - predicted.z;
      const d = Math.hypot(dx, dz);
      if (d >= best || d < 0.05) return;
      if ((dx * fx + dz * fz) / d < 0.55) return;          // only someone the player is turned towards
      best = d;
      out.fight = { kind, id, name };
      // close behind them, a pocket is in reach
      out.steal = d <= 1.5 && Math.cos(Math.atan2(-dx, -dz) - h) < -0.3 ? { kind, id, name } : null;
    };
    for (const actor of crowd.actors()) {
      const who = known.get(actor.i);
      if (!who || actor.pose === 3 || actor.d === undefined || actor.d > 2.4 || who.fig.scale < 0.82) continue;      // nobody lying down, and no children
      consider('npc', actor.i, who.short, actor.x, actor.z, actor.h);
    }
    for (const q of view.players) if (!q.visitor) consider('player', q.id, q.name, q.x, q.z, q.heading);
    for (const o of view.okadas) {
      if (!o.stopped || !driverSide('okada', o, predicted.x, predicted.z).ok) continue;
      const rider = known.get(o.person);
      out.take = { okada: o.n, text: `Take ${rider ? `${rider.short}'s` : 'the'} motorcycle` };
      break;
    }
    if (!out.take) for (const v of view.vehicles) {
      if (v.yours || v.driver || v.locked || !driverSide('keke', v, predicted.x, predicted.z).ok) continue;
      out.take = { vehicle: v.id, text: `Take keke ${v.plate}` };
      break;
    }
    return out;
  }

  // The buttons for what the player is doing now: never more than that needs.
  // Each has a key on a keyboard; on a touch screen they are the pad.
  function buttonsFor(m) {
    const self = view.self;
    const main = { id: 'act', key: 'e', label: (prompt && prompt.short) || 'Act', icon: (prompt && PROMPT_ICON[prompt.short]) || 'act', kind: 'hold', primary: true, off: !prompt, hint: prompt ? prompt.text : '' };
    // on a touch screen a vehicle has two pedals; the stick steers (and still drives, for one thumb)
    const pedals = coarse ? [{ id: 'gas', label: 'Accelerate', kind: 'hold', primary: true, hint: 'Hold to go' }, { id: 'brake', label: 'Brake', kind: 'hold', hint: 'Hold to brake, and to go back' }] : [];
    const out = { ...main, primary: !coarse };
    const look = { id: 'camera', key: 'c', label: 'View', hint: 'Change the view' };
    if (m === 'swimming') {
      // in the river: the right hand strokes (held, faster); near the bank, a way out. The left hand is the stick.
      const list = [{ id: 'stroke', key: 'Shift', label: 'Stroke', icon: 'hand', kind: 'hold', primary: true, hint: 'Hold to swim harder' }];
      if (self.swimming.nearBank) list.push({ id: 'climb', key: 'e', label: 'Climb out', icon: 'climb', hint: 'Climb out onto the bank' });
      return list;
    }
    if (m === 'walking') {
      const list = [main];
      if (!self.critical) list.push({ id: 'run', key: 'Shift', label: 'Run', kind: 'toggle', pressed: input.run, hint: 'Hold Shift, or switch Run on' });
      // at the water's edge: what the river needs, and nothing that does not (no fights, no taking vehicles)
      if (self.byWater && !self.critical) {
        list.push({ id: 'swim', key: 'q', label: 'Swim', icon: 'swim', hint: 'Go into the river' });
        if (self.law.state === 'wanted' || self.law.state === 'pursuit') list.push({ id: 'surrender', key: 'u', label: 'Give up', hint: 'Give yourself up to the police' });
        return list;
      }
      if (near.fight && !self.critical) list.push({ id: 'fight', key: 'f', label: 'Fight', tone: 'warn', hint: `Square up to ${near.fight.name}` });
      if (near.take && !self.critical) list.push({ id: 'take', key: 'g', label: 'Take', tone: 'warn', hint: near.take.text });
      if (near.steal && !self.critical) list.push({ id: 'steal', key: 'b', label: 'Steal', tone: 'warn', hint: `Pick ${near.steal.name}'s pocket` });
      if (self.critical) list.push({ id: 'ambulance', key: 'h', label: 'Help', hint: 'Call an ambulance' });
      if (self.law.state === 'wanted' || self.law.state === 'pursuit') list.push({ id: 'surrender', key: 'u', label: 'Give up', hint: 'Give yourself up to the police' });
      // no view button on foot: the camera follows behind and is turned by dragging; the views are for vehicles
      return list;
    }
    if (m === 'combat') {
      return [
        { id: 'punch', key: 'f', label: 'Punch', primary: true, tone: 'warn' },
        { id: 'heavy', key: 'g', label: 'Heavy' }, { id: 'kick', key: 'r', label: 'Kick' },
        { id: 'block', key: 'q', label: 'Block', kind: 'hold', pressed: blocking }, { id: 'dodge', key: 'Space', label: 'Dodge' },
        { id: 'shove', key: 'z', label: 'Shove' }, { id: 'grab', key: 'x', label: 'Grab' },
        { id: 'leave', key: 'v', label: 'Leave', hint: 'Step back from the fight' },
      ];
    }
    // At the wheel of anything with three wheels or more: on a touch screen, nothing but the wheel (the stick, on
    // the left) and, on the right, the accelerator, the brake, the horn, and the door to step out by. The view
    // is still C on a keyboard.
    if (m === 'driving' && coarse && wheelLayout()) return [{ id: 'gas', label: 'Accelerate', icon: 'gas', kind: 'hold', primary: true, hint: 'Hold to go' }, { id: 'brake', label: 'Brake', icon: 'brake', kind: 'hold', hint: 'Hold to brake, and to go back' }, { id: 'horn', key: 'h', label: 'Horn', icon: 'horn' }, { ...main, primary: false, icon: 'getout', label: (prompt && prompt.short) || 'Step out' }, { ...look, keyOnly: true }];
    if (m === 'driving') return [...pedals, out, { id: 'horn', key: 'h', label: 'Horn' }, look];
    if (m === 'moto') return [...pedals, out, { id: 'horn', key: 'h', label: 'Horn' }, look];
    if (m === 'riding') return [main, look];
    if (m === 'custody') return [{ id: 'custody', key: 'e', label: 'Police', primary: true, hint: 'Your arrest: the fine, a phone call, the time to serve' }, { id: 'phone', key: 'o', label: 'Phone', keyOnly: true }];
    if (m === 'taking') return [{ id: 'cancel', key: 'e', label: 'Stop', primary: true, hint: 'Let go' }];
    if (m === 'carried') return [];
    return [];
  }

  function showControls() {
    const next = controlMode();
    if (next !== mode) {
      mode = next;
      controls.setRun(false);
      if (blocking) { blocking = false; }
      rig.view = viewFor(rig.view, where());
    }
    // skills only on foot and free: in a fight, a vehicle, the water, the hands of the police, they close, and
    // whatever that state shows is what comes back
    skills.allow(mode === 'walking');
    const list = mode === 'start' || mode === 'panel' ? [] : buttonsFor(mode);
    // the phone has its own button on a touch screen already; a pedal has no key
    controls.layout(list.filter((b) => !b.keyOnly).map((b) => ({ ...b, pressed: b.kind === 'toggle' ? b.pressed : false })));
    // in the river the stick is the left hand
    const stickEl = $('stick'); if (stickEl.classList.contains('swim') !== (mode === 'swimming')) stickEl.classList.toggle('swim', mode === 'swimming');
    // at the wheel the stick is a steering wheel, and the right side is the pedals
    const wheel = mode === 'driving' && coarse && wheelLayout();
    if (stickEl.classList.contains('wheel') !== wheel) { stickEl.classList.toggle('wheel', wheel); $('touch').classList.toggle('wheel', wheel); $('hud').classList.toggle('wheel', wheel); controls.setSteering(wheel); }
    keymap.clear();
    for (const b of list) if (b.key && b.key !== 'Shift') keymap.set(b.key, b);
    ui.setKeys(mode === 'walking' || mode === 'combat' || mode === 'driving' || mode === 'moto' || mode === 'riding' || mode === 'custody' || mode === 'taking' || mode === 'carried' ? list : [], (id, phase) => act(id, phase));
  }

  // One move in a fight: asked of the simulation, which says what came of it.
  function strike(move) {
    const result = server.send({ type: 'combat.act', move });
    refreshView();
    if (!result.ok) { if (result.code !== 'NOT_READY') grumble(result.message); return; }
    if (!result.hit && result.reason === 'out of reach') grumble('Out of reach. Step closer.');
    else if (result.reaction === 'down') ui.toast({ type: 'note', text: `${result.target.name} has had enough.` });
  }

  // Everything a button or its key can do.
  function act(id, phase) {
    if (!playing || !view) return;
    if (id === 'block') {
      const on = phase === 'down';
      if (view.self.fight) { server.send({ type: 'combat.block', on }); blocking = on; }
      return;
    }
    if (phase !== 'down' || ui.isOpen()) return;
    const said = (result, good) => { refreshView(); if (!result.ok) ui.toast({ type: 'note', text: result.message }); else if (good) ui.toast({ type: 'note', text: good }); return result; };
    switch (id) {
      case 'act': pressAct(); break;
      case 'run': controls.setRun(!input.run); break;
      case 'swim': { const r = said(server.send({ type: 'swim.in' }), 'You wade in and swim.'); if (r.ok) { predicted.x = r.x; predicted.z = r.z; predicted.heading = 0; going.speed = 0; } break; }
      case 'climb': { const r = said(server.send({ type: 'swim.out' }), 'You climb out onto the bank.'); if (r.ok) { predicted.x = r.x; predicted.z = r.z; predicted.heading = Math.PI; going.speed = 0; } break; }
      case 'horn': audio.horn(); server.send({ type: view.self.driving ? 'vehicle.horn' : 'moto.horn' }); break;
      case 'camera': rig.view = nextView(rig.view, where()); ui.toast({ type: 'note', text: `View: ${CAMERA_VIEW[rig.view].name.toLowerCase()}.` }); break;
      case 'fight': if (near.fight) said(server.send({ type: 'combat.engage', target: { kind: near.fight.kind, id: near.fight.id } }), `You square up to ${near.fight.name}.`); break;
      case 'punch': case 'heavy': case 'kick': case 'shove': case 'grab': strike(id); break;
      case 'dodge': {
        // the way the player is pushing, as the camera sees it; straight back if they are not pushing at all
        const { forward, strafe } = controls.axes();
        const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw), rx = -Math.cos(cam.yaw), rz = Math.sin(cam.yaw);
        const result = server.send({ type: 'combat.dodge', dx: fx * forward + rx * strafe, dz: fz * forward + rz * strafe });
        if (result.ok) { predicted.x = result.x; predicted.z = result.z; startStrike(me, 'dodge', clock); audio.blow('miss'); } else if (result.code !== 'NOT_READY') grumble(result.message);
        refreshView();
        break;
      }
      case 'leave': said(server.send({ type: 'combat.disengage' })); break;
      case 'take': if (near.take) said(server.send({ type: 'hijack.start', okada: near.take.okada, vehicle: near.take.vehicle })); break;
      case 'cancel': said(server.send({ type: 'hijack.cancel' })); break;
      case 'steal': {
        if (!near.steal) break;
        const result = said(server.send({ type: 'crime.steal', target: { kind: near.steal.kind, id: near.steal.id } }));
        if (result.ok && !result.taken) ui.toast({ type: 'note', text: `${near.steal.name} felt your hand and turned round.` });
        break;
      }
      case 'custody': ui.openCustody(); break;
      case 'phone': ui.openPhone(); break;
      case 'ambulance': ui.openPhone('health'); break;
      case 'surrender': said(server.send({ type: 'police.surrender' }), 'You stand still with your hands where they can be seen. An officer is coming.'); break;
      default: break;
    }
  }

  // ----------------------------------------------------------------- loop --

  const angleGap = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

  // Driving: the client works out the next step from the controls and asks the
  // simulation for it, the same way walking does.
  function driveVehicle(dt) {
    const v = view.self.driving;
    const k = VEHICLE_KINDS[v.kind];
    const axes = ui.isOpen() ? { forward: 0, strafe: 0 } : controls.axes();
    const throttle = axes.forward;
    const steer = axes.strafe;
    car.steer = steer;
    car.throttle = Math.abs(throttle);
    const top = vehicleSpeedAt(v.kind, predicted.x, predicted.z, view.weather.wet);
    const dry = v.fuel <= 0;
    const target = dry ? 0 : throttle > 0.1 ? top * throttle : throttle < -0.1 ? k.reverse * throttle : 0;
    const braking = target === 0 || Math.sign(target) !== Math.sign(car.speed || target);
    const rate = (braking ? 10 : 4.5) * dt;
    car.speed += Math.max(-rate, Math.min(rate, target - car.speed));
    if (dry && Math.abs(throttle) > 0.1 && clock - car.complained > 4) { car.complained = clock; ui.toast({ type: 'note', text: 'The tank is empty. Petrol is sold at the motor park.' }); }
    if (Math.abs(car.speed) < 0.03) { car.speed = 0; return 0; }
    predicted.heading -= steer * 1.9 * Math.min(1, Math.abs(car.speed) / 3) * Math.sign(car.speed) * dt;
    const nx = predicted.x + Math.sin(predicted.heading) * car.speed * dt;
    const nz = predicted.z + Math.cos(predicted.heading) * car.speed * dt;
    const others = view.vehicles.filter((o) => o.id !== v.id);
    if (!vehicleFits(v.kind, nx, nz, builtBoxes(), others)) { car.speed = 0; return 0; }
    const result = server.send({ type: 'vehicle.drive', x: nx, z: nz, heading: predicted.heading });
    if (result.ok) { predicted.x = nx; predicted.z = nz; v.fuel = result.fuel; if (result.hit) car.speed = 0; } else {
      const truth = host.game.view(playerId).self;
      predicted.x = truth.x; predicted.z = truth.z; car.speed = 0;
      if (clock - car.complained > 4 && result.code !== 'BLOCKED' && result.code !== 'TOO_FAST' && result.code !== 'STALLED') { car.complained = clock; ui.toast({ type: 'note', text: result.message }); }
    }
    // the camera swings round behind the vehicle unless the player is holding it
    if (clock - cam.lastDrag > 1.5 && car.speed > 0.8) cam.yaw += angleGap(predicted.heading, cam.yaw) * Math.min(1, dt * 2.4);
    return Math.abs(car.speed);
  }

  // A motorcycle under the player's own hands: quicker than a keke and it leans into a turn.
  function driveMoto(dt) {
    const axes = ui.isOpen() ? { forward: 0, strafe: 0 } : controls.axes();
    const top = motoSpeedAt(predicted.x, predicted.z, view.weather.wet);
    const target = axes.forward > 0.1 ? top * axes.forward : axes.forward < -0.1 ? MOTO.reverse * axes.forward : 0;
    const braking = target === 0 || Math.sign(target) !== Math.sign(moto.speed || target);
    const rate = (braking ? 12 : 6.5) * dt;
    moto.speed += Math.max(-rate, Math.min(rate, target - moto.speed));
    moto.lean += (axes.strafe * Math.min(1, Math.abs(moto.speed) / 6) * 0.42 - moto.lean) * Math.min(1, dt * 6);
    if (Math.abs(moto.speed) < 0.03) { moto.speed = 0; return 0; }
    predicted.heading -= axes.strafe * 2.3 * Math.min(1, Math.abs(moto.speed) / 3) * Math.sign(moto.speed) * dt;
    const nx = predicted.x + Math.sin(predicted.heading) * moto.speed * dt;
    const nz = predicted.z + Math.cos(predicted.heading) * moto.speed * dt;
    if (!zoneWalkable(nx, nz, structureBoxes(), MOTO.radius)) { moto.speed = 0; return 0; }
    const result = server.send({ type: 'moto.drive', x: nx, z: nz, heading: predicted.heading });
    if (result.ok) { predicted.x = nx; predicted.z = nz; if (result.hit) moto.speed = 0; } else { const truth = host.game.view(playerId).self; predicted.x = truth.x; predicted.z = truth.z; moto.speed = 0; }
    if (clock - cam.lastDrag > 1.5 && moto.speed > 0.8) cam.yaw += angleGap(predicted.heading, cam.yaw) * Math.min(1, dt * 2.6);
    return Math.abs(moto.speed);
  }

  // The player on foot. A body does not reach its pace, or lose it, in no time, and it does not go one way
  // while facing another: it turns to where it is sent, slows to turn about, and takes a step or two to stop.
  // All of that is how the figure is moved here; the simulation is still told each place it reaches and
  // still refuses any that is too far (see `move` in sim.js).
  const going = { speed: 0, turn: 0 };
  // In the river: the left hand (the stick, drawn as a hand) sends the swimmer, the right hand strokes harder.
  function swimPlayer(dt) {
    const { forward, strafe } = controls.axes();
    const magnitude = Math.min(1, Math.hypot(forward, strafe));
    const steering = !ui.isOpen() && magnitude >= 0.12;
    const hard = controls.held('stroke') || controls.running;
    let pace = 0, wanted = predicted.heading;
    if (steering) {
      const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw), rx = -Math.cos(cam.yaw), rz = Math.sin(cam.yaw);
      wanted = Math.atan2(fx * forward + rx * strafe, fz * forward + rz * strafe);
      pace = (hard ? SWIM.fast : SWIM.speed) * magnitude;
    }
    const off = angleGap(wanted, predicted.heading);
    const swing = Math.max(-PACE.turn * 0.6 * dt, Math.min(PACE.turn * 0.6 * dt, off));
    predicted.heading += swing; going.turn = swing / Math.max(dt, 1e-3);
    pace *= 0.4 + 0.6 * Math.max(0, Math.cos(off));
    going.speed += Math.max(-4 * dt, Math.min(3 * dt, pace - going.speed));
    if (going.speed <= 0.02 && !steering) { going.speed = 0; return 0; }
    const nx = predicted.x + Math.sin(predicted.heading) * going.speed * dt, nz = predicted.z + Math.cos(predicted.heading) * going.speed * dt;
    if (!zoneSwimmable(nx, nz) && !zoneWalkable(nx, nz)) { going.speed = 0; return 0; }
    const result = server.send({ type: 'move', x: nx, z: nz, heading: predicted.heading, run: hard });
    if (result.ok) { predicted.x = nx; predicted.z = nz; } else { const truth = host.game.view(playerId).self; predicted.x = truth.x; predicted.z = truth.z; going.speed = 0; }
    return going.speed;
  }
  const PACE = { gather: 9, shed: 13, turn: 9.5 };      // metres a second each second; radians a second
  function movePlayer(dt) {
    going.turn = 0;
    if (led() || view.self.driving || view.self.astride || view.self.riding) going.speed = 0;
    if (led()) return 0;                       // walked in by an officer, carried, or with hands on a vehicle: not theirs to steer
    if (view.self.driving) return driveVehicle(dt);
    if (view.self.astride) return driveMoto(dt);
    if (view.self.riding) return 0;
    if (view.self.swimming) return swimPlayer(dt);
    const { forward, strafe } = controls.axes();
    const magnitude = Math.min(1, Math.hypot(forward, strafe));
    const steering = !ui.isOpen() && magnitude >= 0.12;
    if (!steering && going.speed <= 0.02) { going.speed = 0; return 0; }
    // Running is what the player chose (Shift, or Run switched on), never a guess from how far the stick is pushed.
    const run = controls.running && !view.self.critical;
    let wanted = predicted.heading;
    let pace = 0;
    if (steering) {
      const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
      const rx = -Math.cos(cam.yaw), rz = Math.sin(cam.yaw);
      wanted = Math.atan2(fx * forward + rx * strafe, fz * forward + rz * strafe);
      pace = (run ? SPEED.run : SPEED.walk) * (view.weather.wet ? SPEED.rain : 1) * magnitude;
    }
    const off = angleGap(wanted, predicted.heading);
    const swing = Math.max(-PACE.turn * dt, Math.min(PACE.turn * dt, off));
    predicted.heading += swing;
    going.turn = swing / dt;
    // facing well away from where it is sent, it slows to come round
    pace *= 0.4 + 0.6 * Math.max(0, Math.cos(off));
    going.speed += Math.max(-PACE.shed * dt, Math.min(PACE.gather * dt, pace - going.speed));
    const speed = going.speed;
    const dx = Math.sin(predicted.heading), dz = Math.cos(predicted.heading);
    const boxes = structureBoxes();
    let nx = predicted.x + dx * speed * dt;
    let nz = predicted.z + dz * speed * dt;
    if (!zoneWalkable(nx, nz, boxes)) {
      if (zoneWalkable(nx, predicted.z, boxes)) nz = predicted.z;
      else if (zoneWalkable(predicted.x, nz, boxes)) nx = predicted.x;
      else { going.speed = 0; return 0; }
    }
    let result = server.send({ type: 'move', x: nx, z: nz, heading: predicted.heading, run });
    if (!result.ok && result.code === 'IN_THE_WAY') {
      // Someone is standing there (a player, a townsperson, a resident). Nobody goes through anybody, but a walker brushes past: the step is
      // tried again along the side of them, at a slower pace, and the simulation decides that one too.
      let nearest = result.at ? { d: Math.hypot(result.at.x - predicted.x, result.at.z - predicted.z), x: result.at.x, z: result.at.z } : null;
      if (!nearest) for (const q of view.players) { const d = Math.hypot(q.x - predicted.x, q.z - predicted.z); if (d < 2 && (!nearest || d < nearest.d)) nearest = { d, x: q.x, z: q.z }; }
      if (nearest && nearest.d > 0.01) {
        const ox = (nearest.x - predicted.x) / nearest.d, oz = (nearest.z - predicted.z) / nearest.d;
        const side = dx * -oz + dz * ox >= 0 ? 1 : -1;
        const sx = predicted.x + (-oz * side - ox * 0.08) * speed * dt * 0.7, sz = predicted.z + (ox * side - oz * 0.08) * speed * dt * 0.7;
        if (zoneWalkable(sx, sz, boxes)) { const slid = server.send({ type: 'move', x: sx, z: sz, heading: predicted.heading, run }); if (slid.ok) { predicted.x = sx; predicted.z = sz; going.speed = Math.min(going.speed, speed * 0.7); return going.speed; } }
      }
      going.speed = Math.min(going.speed, 0.6);
      return 0;
    }
    if (result.ok) { predicted.x = nx; predicted.z = nz; } else { const truth = host.game.view(playerId).self; predicted.x = truth.x; predicted.z = truth.z; going.speed = 0; }
    // steer the camera gently when walking sideways, so the keyboard alone can turn
    const aside = angleGap(wanted, cam.yaw);
    if (steering && clock - cam.lastDrag > 1.2 && Math.abs(aside) > 0.2 && Math.abs(aside) < 2.2) cam.yaw += aside * Math.min(1, dt * 0.9);
    return speed;
  }

  // Detail steps down when the device truly cannot keep up, and back up when
  // it can: see createGovernor in monitor.js for how that is judged. Every
  // level can be reached from every other, so nothing here is one-way.
  //   0  everything            2  smaller shadow map, no garden plants
  //   1  one pixel per pixel   3  no shadows, three quarters resolution, no grass
  // On a phone the picture is never made blurry to save time (that was the "quality dropping" players saw):
  // the sharpness stays put and the first thing given up is the sun's shadows (people keep the dark patch
  // under their feet), then half the grass and fewer townspeople with limbs, then how far the town is drawn.
  const PIXEL_RATIO = LITE ? [1.25, 1.25, 1.25, 1] : [2, 1, 1, 0.75];
  const SHADOW_MAP = LITE ? [1024, 1024, 1024, 1024] : [2048, 2048, 1024, 1024];
  function applyQuality(level) {
    world.setQuality(level);
    town.setQuality(level);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PIXEL_RATIO[level]));
    const shadow = sky.sun.shadow;
    if (shadow.mapSize.x !== SHADOW_MAP[level]) { shadow.mapSize.set(SHADOW_MAP[level], SHADOW_MAP[level]); if (shadow.map) { shadow.map.dispose(); shadow.map = null; } }
    // Shadows go by telling the sun not to cast them. The renderer then moves each material to a
    // program without shadows as it next draws it, and back again the same way.
    sky.sun.castShadow = level < (LITE ? 1 : 3);
    soundTimer = 1;      // look again at what is in reach
    resize();
    monitor.count(`quality to ${level}`);
  }
  // a phone is asked to hold thirty frames a second, and is stepped down sooner when it cannot
  // and it climbs back slowly, so that detail does not flicker up and down while walking about
  const governor = createGovernor(applyQuality, LITE ? { ...QUALITY_RULES, slowMs: 1000 / 31, downAfter: 2.5, upAfter: 25, settle: 4 } : QUALITY_RULES);
  // The player may fix the detail level, or leave it to the governor ('auto').
  function setDetail(value) {
    prefs.detail = value === 'auto' ? 'auto' : Math.max(0, Math.min(3, Number(value) || 0));
    writeStored(PREFS_KEY, prefs);
    governor.hold(prefs.detail !== 'auto');
    if (prefs.detail !== 'auto') governor.set(prefs.detail, 'chosen in Help');
  }
  if (prefs.detail !== 'auto') setDetail(prefs.detail);
  const quality = { get level() { return governor.level; } };

  // What can be heard from where the player stands. Worked out twice a second.
  const onTar = (x, z) => ZONE_ROADS.some((r) => r.surface === 'asphalt' && x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
  const between = (hour, from, to) => hour >= from && hour < to;
  function soundSources(hour, wet) {
    const out = [];
    const day = view ? view.calendar : spectator ? spectator.calendar : { weekday: 'Wednesday', school: true };
    for (const s of ZONE_SOUNDS) if (between(hour, s.from, s.to)) out.push(s);
    for (const c of ZONE_COMPOUNDS) {
      if (c.ambience === 'school' && day.school) {
        const pitch = c.yard.find((y) => y.kind === 'pitch');
        const loud = between(hour, c.hours[0] - 0.1, 8.2) ? 0.8 : between(hour, c.kind === 'primary' ? 10.5 : 11, c.kind === 'primary' ? 11.05 : 11.55) ? 1 : between(hour, 8.2, c.hours[1]) ? 0.18 : 0;
        if (loud && pitch) out.push({ id: `children-${c.id}`, kind: 'children', x: (pitch.x0 + pitch.x1) / 2 - 20, z: (pitch.z0 + pitch.z1) / 2, reach: 70, level: loud });
      }
      if (c.ambience === 'hospital') out.push({ id: 'beeps', kind: 'beeps', x: -188, z: 34, reach: 16 });
      if (c.ambience === 'church') {
        const church = c.buildings[0];
        const sunday = day.weekday === 'Sunday';
        const service = c.faith === 'catholic' ? (sunday ? between(hour, 6.45, 7.65) || between(hour, 8, 9.25) || between(hour, 9.75, 11) : between(hour, 6.5, 7.15)) : (sunday && (between(hour, 7.45, 9.15) || between(hour, 9.95, 11.65)));
        if (service) out.push({ id: `hymn-${c.id}`, kind: 'music', style: 'hymn', x: (church.x0 + church.x1) / 2, z: (church.z0 + church.z1) / 2, reach: 60 });
      }
    }
    if (!wet && between(hour, 7, 17.5)) {
      out.push({ id: 'work-yard', kind: 'work', x: -78, z: -170, reach: 45 });
      for (const s of ZONE_SHEDS) if (['carpenter', 'welder', 'mechanic'].includes(s.trade)) out.push({ id: `work-${s.id}`, kind: 'work', x: s.x, z: s.z, reach: 32 });
    }
    return out;
  }

  // a point in the world, on the screen
  const projected = new THREE.Vector3();
  function project(x, y, z) {
    projected.set(x, y, z).project(camera);
    return { x: (projected.x * 0.5 + 0.5) * viewW, y: (-projected.y * 0.5 + 0.5) * viewH, behind: projected.z > 1 || projected.z < -1 };
  }
  // where a speaker's head is
  function headOf(key) {
    if (key === `p:${playerId}`) return { x: me.group.position.x, y: 1.9, z: me.group.position.z };
    if (key.startsWith('r:')) { const actor = residentActors.get(key.slice(2)); return actor && actor.group.visible ? { x: actor.group.position.x, y: 1.9 * (actor.scale || 1), z: actor.group.position.z } : null; }
    return crowd.anchor(key, known);
  }

  // The start screen is also the loading screen: while it is up, everything
  // that is slow the first time is done (see warmup.js). Entering waits for it.
  function warmStep() {
    warm.frames += 1;
    try {
      // the character on the start screen comes first: the warming up waits until it is drawn (or six seconds)
      const figureUp = !creator || !creator.rig || !creator.rig.animated || !!creator.rig.mixer;
      if (warm.stage === 0 && warm.frames >= 3 && (figureUp || clock > 6)) {
        // one of each thing otherwise first made in play: a figure that casts a shadow and carries a name, and the markers
        const figure = makeCharacter({ skin: SKINS[2], top: TOPS[0], bottom: 0x2c3440, build: 1, body: 'm' }, 'Name', true);
        figure.label.visible = true; figure.label.material.opacity = 1;
        figure.group.position.set(cam.target.x, 0, cam.target.z);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.8, 12), markerMaterial);
        const column = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2, 8, 1, true), beaconMaterial);
        ring.position.copy(figure.group.position); column.position.copy(figure.group.position);
        warm.extras = [figure.group, ring, column];
        warm.figure = figure;
        for (const o of warm.extras) scene.add(o);
        warm.stage = 1;
      } else if (warm.stage === 1) {
        monitor.note('programs compiled ahead', warmUp.compile(camera));
        warm.stage = 2;
      } else if (warm.stage === 2) {
        monitor.note('programs compiled ahead', warmUp.compileWithout(sky.sun, camera));
        warm.stage = 3;
      } else if (warm.stage === 3) {
        for (const o of warm.extras) scene.remove(o);
        warm.figure.dispose(); warm.extras[1].geometry.dispose(); warm.extras[2].geometry.dispose();
        warm.extras = [];
        warmUp.pin();
        warm.stage = 4;
        ready();
      } else if (warm.stage === 4) {
        // one piece of the vehicle kit unpacked a frame, then the town's meshes, a few a frame
        if (!warm.jobs) warm.jobs = vehicleWarmJobs();
        if (warm.jobs.length) warmUp.add(warm.jobs.pop()());
        if (!warmUp.step() && !warm.jobs.length) warm.stage = 5;
      }
    } catch (error) {
      // warming up is a kindness, not a need: without it the town still draws, with a hitch here and there
      for (const o of warm.extras) scene.remove(o);
      warm.extras = [];
      warm.stage = 5;
      ready();
    }
  }
  let isReady = false;
  function ready() { isReady = true; $('enter').disabled = false; $('continue').disabled = false; $('enter').textContent = `Enter ${ZONE.name}`; }
  $('enter').disabled = true; $('continue').disabled = true; $('enter').textContent = 'Preparing the town…';
  if (NO_DRAW) ready();

  // The hospital's ambulance: one van that the simulation drives about town.
  const camGoal = new THREE.Vector3();
  let ambulance = null;
  function updateAmbulance(a, dt) {
    if (!ambulance) {
      ambulance = makeVan({ body: 0xf4f4f0, band: 0xc0392b, beacon: 0x2f6fd0 }, world.glowMaterial);
      ambulance.group.position.set(a.x, 0, a.z); ambulance.group.rotation.y = a.h;
      scene.add(ambulance.group);
    }
    const g = ambulance.group;
    if (Math.hypot(a.x - g.position.x, a.z - g.position.z) > 12) { g.position.x = a.x; g.position.z = a.z; g.rotation.y = a.h; }
    g.position.x += (a.x - g.position.x) * Math.min(1, dt * 9);
    g.position.z += (a.z - g.position.z) * Math.min(1, dt * 9);
    g.rotation.y += angleGap(a.h, g.rotation.y) * Math.min(1, dt * 7);
    // the lamp on the roof turns blue and white while it is on a call
    ambulance.beacon.emissive.setHex(a.siren && Math.floor(clock * 4) % 2 ? 0x3a7bff : a.siren ? 0xffffff : 0x000000);
    ambulance.beacon.emissiveIntensity = a.siren ? 2.2 : 0;
    ambulance.siren = a.siren ? { x: g.position.x, z: g.position.z } : null;
  }

  let last = performance.now();
  function frame(now) {
    const elapsed = (now - last) / 1000;
    const dt = Math.min(0.5, Math.max(0.001, elapsed));
    last = now;
    clock += dt;
    monitor.begin();
    perf.fps += (1 / dt - perf.fps) * Math.min(1, dt * 2);
    let hour = 7.4;
    let weather = { kind: 'clear', wet: false, intensity: 0 };
    let ownEngine = null;

    if (playing) {
      // A slow frame is simulated as several short steps, so the world keeps
      // real time on a weak device and movement stays within what the
      // simulation accepts.
      let speed = 0;
      monitor.mark('simulation');
      for (let left = dt; left > 0.0005; left -= 0.05) {
        const step = Math.min(0.05, left);
        host.tick(step);
        if (twin) twin.host.tick(step);
        speed = Math.max(speed, monitor.time('movement', () => movePlayer(step)));
      }
      if (link) link.tick(dt);
      if (twin) twin.link.tick(dt);
      monitor.mark('view');
      viewTimer += dt;
      if (viewTimer > 0.1) { viewTimer = 0; refreshView(); prompt = ui.isOpen() ? null : findPrompt(); near = ui.isOpen() ? { fight: null, steal: null, take: null } : findNear(); }
      hour = view.clock.hourFloat;
      weather = view.weather;

      monitor.mark('player and vehicles');
      const holding = acting() && prompt && prompt.hold && !ui.isOpen();
      if (holding) { holdProgress += dt / HOLD_SECONDS; if (holdProgress >= 1) { holdProgress = 0; completeHold(); } } else holdProgress = 0;
      ui.setPrompt(prompt, holdProgress);
      showControls();

      const self = view.self;
      const driving = self.driving;
      const riding = self.riding;
      const astride = self.astride;
      const taking = self.hijack;
      const aboard = self.carried === 'aboard';
      const bike = riding ? crowd.bike(riding.n) : null;
      if (riding) {
        // the passenger goes where the motorcycle goes
        const at = bike || self;
        predicted.x = at.x; predicted.z = at.z; predicted.heading = bike ? bike.h : self.heading;
        if (clock - cam.lastDrag > 1.5) cam.yaw += angleGap(predicted.heading, cam.yaw) * Math.min(1, dt * 2);
      }
      // squared up to someone and standing still, the player keeps facing them
      if (self.fight && self.fight.target && speed < 0.2) predicted.heading += angleGap(Math.atan2(self.fight.target.x - predicted.x, self.fight.target.z - predicted.z), predicted.heading) * Math.min(1, dt * 10);
      // the driver sits on the keke's own seat, which is ahead of its middle; a rider sits a little back of the middle of his machine
      const back = riding ? -0.5 : driving ? DRIVER_SEAT[2] : astride ? -0.17 : 0;
      let wantX = predicted.x + Math.sin(predicted.heading) * back;
      let wantZ = predicted.z + Math.cos(predicted.heading) * back;
      if (taking && (taking.step === 'mount' || taking.step === 'enter')) {
        // the last step of taking a vehicle: up and into the seat
        const seat = taking.kind === 'okada' ? view.okadas.find((o) => o.n === taking.id) : view.vehicles.find((v) => v.id === taking.id);
        if (seat) { const k = Math.min(1, Math.max(0, (taking.progress - 0.62) / 0.38)); wantX += (seat.x - wantX) * k; wantZ += (seat.z - wantZ) * k; }
      }
      if (led()) {
        // moved by the simulation: the figure walks to where it has been put, and its pace is whatever that takes
        const gx = wantX - me.group.position.x, gz = wantZ - me.group.position.z;
        const gap = Math.hypot(gx, gz);
        const stride = gap > 6 ? gap : Math.min(gap, (1.2 + gap * 6) * dt);
        if (gap > 0.001) { me.group.position.x += (gx / gap) * stride; me.group.position.z += (gz / gap) * stride; }
        speed = Math.min(5, stride / Math.max(dt, 0.001));
        if (speed > 0.4 && !taking) predicted.heading += angleGap(Math.atan2(gx, gz), predicted.heading) * Math.min(1, dt * 8);
      } else { me.group.position.x = wantX; me.group.position.z = wantZ; }
      if (holding && prompt.intent.type === 'site.work') { const parcel = ZONE_PARCELS.find((p) => p.id === prompt.intent.parcelId); predicted.heading += angleGap(Math.atan2(parcel.cx - predicted.x, parcel.cz - predicted.z), predicted.heading) * Math.min(1, dt * 8); }
      if (holding && prompt.intent.type === 'job.mould') predicted.heading += angleGap(Math.PI, predicted.heading) * Math.min(1, dt * 8);
      me.group.rotation.y = predicted.heading;
      me.group.rotation.z = astride ? -moto.lean : 0;
      animateCharacter(me, dt, driving || riding || astride ? 0 : speed, holding, led() ? 0 : going.turn);
      driveKitEmote(dt, speed);
      if (driving) { seatCharacter(me); me.group.position.y = DRIVER_SEAT[1] - SEATED_HEIGHT * me.scale; } else if (riding) { seatCharacter(me); me.group.position.y = -0.04; } else if (astride) { seatCharacter(me); me.group.position.y = -0.15 * me.scale; } else standCharacter(me);
      if (taking) poseTaking(me, taking.step, taking.progress);
      else if (self.fight || me.strike) poseFighter(me, clock, { guard: !!self.fight, block: blocking && !!self.fight });
      // knocked down by a vehicle, or killed: flat on the ground quickly, and up again more slowly
      // in the river: the figure floats with its body at the water's surface (the water is drawn at -0.32)
      me.swimming = !!self.swimming;
      const flat = !me.animated && me.swimming;
      const lying = !!self.dead || (!!self.down && !self.down.rising) || flat;
      me.fall = (me.fall || 0) + ((lying ? 1 : 0) - (me.fall || 0)) * Math.min(1, dt * (lying ? 12 : 4));
      layCharacter(me, me.fall);
      if (me.swimming) { me.group.position.y = me.animated ? -(me.spec.height * 0.58) - 0.22 : -0.5; if (me.blob) me.blob.visible = false; } else if (me.wasSwimming) me.group.position.y = 0;
      me.wasSwimming = me.swimming;
      // in the ambulance, or with the eye inside its own head, the figure is not drawn
      me.group.visible = !aboard && !rig.hidesPlayer;
      ui.setDash(driving ? { plate: driving.plate, fuel: driving.fuel, tank: driving.tank, kmh: Math.abs(car.speed) * 3.6, load: driving.load, capacity: driving.capacity } : astride ? { plate: 'Motorcycle', fuel: null, kmh: Math.abs(moto.speed) * 3.6, load: 0, capacity: 0 } : null);
      if (driving) ownEngine = { kind: 'keke', rev: Math.min(1, Math.abs(car.speed) / VEHICLE_KINDS.keke.speedRoad), throttle: car.throttle || 0 };
      else if (astride) ownEngine = { kind: 'okada', rev: Math.min(1, Math.abs(moto.speed) / MOTO.speedRoad), throttle: Math.abs(controls.axes().forward) };
      flash = Math.max(0, flash - dt * 2.2);
      ui.setVitals(self, flash);
      if (waypoint) {
        const metres = Math.hypot(waypoint.x - predicted.x, waypoint.z - predicted.z);
        if (metres < 3.5) { ui.toast({ type: 'note', text: `You have reached ${waypoint.label || 'the marked place'}.` }); setWaypoint(null); }
        ui.setWaypoint(waypoint, metres);
      } else ui.setWaypoint(null, 0);
      drawRadar(dt, { driving, astride, riding });

      // footsteps, in time with the stride
      if (!driving && !riding && !astride && !aboard && speed > 0.3) {
        // a step is heard as each foot comes down: the figure's own stride says when
        const foot = Math.floor(me.phase * 2);
        if (foot !== stepPhase) { stepPhase = foot; audio.footstep(inside ? 'floor' : predicted.x > ZONE_JETTY.x0 && predicted.x < ZONE_JETTY.x1 && predicted.z > ZONE_JETTY.z0 ? 'wood' : onTar(predicted.x, predicted.z) ? 'tar' : 'earth'); }
      }

      if (!driving) car.steer = 0;
      for (const [id, actor] of vehicleActors) {
        const g = actor.group;
        const t = actor.truth;
        const mine = !!driving && driving.id === id;
        const was = actor.was || (actor.was = { x: g.position.x, z: g.position.z, steer: 0 });
        if (mine) { g.position.x = predicted.x; g.position.z = predicted.z; g.rotation.y = predicted.heading; } else {
          if (Math.hypot(g.position.x - t.x, g.position.z - t.z) > 6) { g.position.x = t.x; g.position.z = t.z; g.rotation.y = t.heading; was.x = t.x; was.z = t.z; }
          g.position.x += (t.x - g.position.x) * Math.min(1, dt * 10);
          g.position.z += (t.z - g.position.z) * Math.min(1, dt * 10);
          g.rotation.y += angleGap(t.heading, g.rotation.y) * Math.min(1, dt * 10);
        }
        // the wheels turn by as far as the vehicle went, and the front one follows the handlebar
        const along = (g.position.x - was.x) * Math.sin(g.rotation.y) + (g.position.z - was.z) * Math.cos(g.rotation.y);
        if (Math.abs(along) > 1e-4) actor.model.roll(along);
        was.x = g.position.x; was.z = g.position.z;
        was.steer += ((mine ? -(car.steer || 0) * 0.5 : 0) - was.steer) * Math.min(1, dt * 8);
        actor.model.steer(was.steer);
        if (mine) actor.model.setLevel(0); else actor.model.setDistance(Math.hypot(g.position.x - camera.position.x, g.position.z - camera.position.z), undefined, VEHICLE_BIAS[quality.level]);
        const lit = t.driver && night > 0.45 ? 1 : 0;
        if (lit !== actor.lit) { actor.lit = lit; actor.model.lamps(lit, lit, 0, 0); }
      }

      monitor.mark('townspeople');
      for (const r of view.residents) {
        const actor = residentActors.get(r.id);
        const g = actor.group;
        const wasVisible = g.visible;
        g.visible = r.mode !== 'inside';
        if (!g.visible) continue;
        if (!wasVisible || Math.hypot(g.position.x - r.x, g.position.z - r.z) > 12) { g.position.x = r.x; g.position.z = r.z; g.rotation.y = r.heading; }
        const gx = r.x - g.position.x;
        const gz = r.z - g.position.z;
        const gap = Math.hypot(gx, gz);
        const stride = Math.min(gap, 1.6 * dt + gap * dt * 2);
        if (gap > 0.01) { g.position.x += (gx / gap) * stride; g.position.z += (gz / gap) * stride; }
        const moving = r.mode === 'walking' && gap > 0.02;
        let face = r.heading;
        const toPlayer = Math.hypot(predicted.x - g.position.x, predicted.z - g.position.z);
        if (!moving && toPlayer < 3.2) face = Math.atan2(predicted.x - g.position.x, predicted.z - g.position.z);
        g.rotation.y += angleGap(face, g.rotation.y) * Math.min(1, dt * 7);
        const working = !moving && (r.busy === 'mould3' || r.busy === 'site' || r.busy === 'r12') && r.mode === 'at' && view.clock.hour >= 7 && view.clock.hour < 18;
        animateCharacter(actor, dt, moving ? Math.max(0.7, Math.min(2.2, stride / Math.max(dt, 0.001))) : 0, working);
        // a name is shown to someone close, but not held up against the lens
        showName(actor, toPlayer < 8 && Math.hypot(camera.position.x - g.position.x, camera.position.z - g.position.z) > 3.2, dt);
      }

      // the rest of the town, the okadas and other players
      updateAmbulance(view.ambulance, dt);
blood.update(dt, view.blood || []);
            crowd.update({ dt, rows: view.people, okadas: view.okadas, players: view.players, known, eye: predicted, real: elapsed, clock, others: view.others,
        own: astride ? { n: astride.n, x: predicted.x, z: predicted.z, h: predicted.heading, lean: moto.lean, speed: Math.abs(moto.speed) } : null,
        tug: taking && taking.kind === 'okada' && taking.step !== 'reach' ? { n: taking.id, amount: Math.min(1, Math.max(0, (taking.progress - 0.23) / 0.4)), side: taking.side } : null,
        maxRigs: MAX_RIGS[quality.level], detail: FIGURE_DETAIL[quality.level], riding: !!view.self.riding, pause: LITE ? 0.3 : 0.11, fallen: view.fallen, reacts: view.reacts });
      // a moving okada close by sounds its horn
      if (!driving && !riding && !astride && clock - lastHonk > 12) for (const b of crowd.bikes()) if (b.truth.moving && Math.hypot(b.x - predicted.x, b.z - predicted.z) < 4.5) { lastHonk = clock; audio.horn(b.x, b.z); break; }

      monitor.mark('interface');
      // indoors: put away the roof of the building the player is in
      inside = town.setInside(predicted.x, predicted.z);
      room = inside ? zoneRoomAt(predicted.x, predicted.z) : null;

      saveTimer += dt;
      if (saveTimer > 20) { saveTimer = 0; monitor.time('save', () => writeStored(SAVE_KEY, { host: host.save(), playerId })); }
      ui.tick(dt);

      if (cam.free) cam.target.set(cam.free.x, cam.free.y, cam.free.z); else cam.target.lerp(camGoal.set(me.group.position.x, 1.55, me.group.position.z), Math.min(1, dt * 9));
    } else {
      // the start screen circles the town centre
      cam.yaw = 0.35 + Math.sin(clock * 0.05) * 0.5;
      cam.pitch = 0.3;
      cam.dist = 85;
      cam.target.lerp(new THREE.Vector3(ZONE_PROPS.startCamera.x, 2, ZONE_PROPS.startCamera.z), 0.05);
      viewTimer += dt;
      if (viewTimer > 0.25) { viewTimer = 0; host.tick(0.25); if (!(startEl && !startEl.hidden && warm.stage >= 5)) drawSpectator(); }
      if (spectator) { hour = spectator.clock.hourFloat; crowd.update({ dt, rows: spectator.people, okadas: spectator.okadas, players: [], known, eye: { x: 1e6, z: 1e6 }, maxRigs: 0 }); }
      inside = town.setInside(1e6, 1e6);
    }

    monitor.mark('sky and camera');
    // Indoors the camera looks down into the room from above; in every view it keeps out of walls.
    const sitting = playing && view && (view.self.driving || view.self.riding || view.self.astride);
    rig.update(dt, {
      cam, target: cam.target, heading: playing ? predicted.heading : cam.yaw,
      indoors: inside && playing ? { pitch: inside.church ? 0.88 : 1.0, dist: inside.church ? 15 : 11 } : null,
      dragged: clock - cam.lastDrag, eyeHeight: sitting ? 1.45 : 1.62,
    });

    world.tick(dt);
    const skyState = sky.update(dt, hour, weather, cam.target, camera);
    night = skyState.night;
    setVehicleDaylight(1 - night);
    world.glowMaterial.emissiveIntensity = night * 1.5;
    siteLayer.setNight(night * 1.5);
    world.waterMaterial.color.copy(linear(ZONE_PROPS.water.day)).lerp(linear(ZONE_PROPS.water.night), night * 0.8).lerp(linear(ZONE_PROPS.water.dull), skyState.dull * 0.5);
    lampTimer += dt;
    if (lampTimer > 0.5) {
      lampTimer = 0;
      const nearest = world.lampHeads.map((lamp) => ({ lamp, d: Math.hypot(lamp.x - cam.target.x, lamp.z - cam.target.z) })).sort((a, b) => a.d - b.d);
      lampLights.forEach((light, index) => { const item = nearest[index]; if (item) { light.position.x = item.lamp.x; light.position.z = item.lamp.z; } });
    }
    for (const light of lampLights) light.intensity = night * 1.25;
    lampPools.mesh.visible = night > 0.02;
    lampPools.material.opacity = night * 0.5;
    markerMaterial.opacity = 0.55 + Math.sin(clock * 3) * 0.3;

    monitor.mark('sound and sight');
    // sound, and what is too far off to draw
    soundTimer += dt;
    if (soundTimer > 0.5) {
      soundTimer = 0;
      sources = soundSources(hour, weather.wet);
      const reach = Math.min(REACH[quality.level], scene.fog.far * 0.82);
      world.see(cam.target.x, cam.target.z, reach);
      world.seeVehicles(camera.position.x, camera.position.z, reach + cam.dist);
      town.see(cam.target.x, cam.target.z, reach);
    }
    if (playing) {
      const engines = [];
      for (const b of crowd.bikes()) if (b.truth.moving) engines.push({ x: b.x, z: b.z, rev: Math.min(1, 0.35 + b.speed / 9), d: Math.hypot(b.x - predicted.x, b.z - predicted.z) });
      engines.sort((a, b) => a.d - b.d);
      let close = 0;
      for (const actor of crowd.actors()) if (actor.d < 14) close += 1;
      audio.update(dt, { listener: { x: predicted.x, z: predicted.z, yaw: cam.yaw, indoors: !!inside }, hour, night, weather, shore: zoneShoreZ(predicted.x) - predicted.z, crowd: close, own: ownEngine, engines: engines.slice(0, 3).filter((e) => e.d < 60), sources, panel: ui.isOpen(), siren: ambulance ? ambulance.siren : null });
    }

    monitor.mark('warming up');
    if (!NO_DRAW) warmStep();
    monitor.mark('drawing');
    // behind the opening nothing of the town can be seen: once it is warmed up, it is not drawn at all
    // the start screen covers the town entirely: once it is warmed, it is not drawn behind it for nobody
    const covered = !playing && startEl && !startEl.hidden && warm.stage >= 5;
    if (!NO_DRAW && !covered && !(intro.active() && warm.stage >= 5)) renderer.render(scene, camera);
    perf.calls = renderer.info.render.calls;
    perf.triangles = renderer.info.render.triangles;
    // what the graphics card was sent for the first time in this frame
    const made = renderer.info;
    if (made.programs.length !== perf.programs) { monitor.note('programs compiled', made.programs.length - perf.programs); perf.programs = made.programs.length; }
    if (made.memory.geometries > perf.geometries) monitor.note('geometries made', made.memory.geometries - perf.geometries);
    if (made.memory.textures > perf.textures) monitor.note('textures made', made.memory.textures - perf.textures);
    perf.geometries = made.memory.geometries; perf.textures = made.memory.textures;
    monitor.mark('interface');
    if (playing) { fitTimer -= dt; if (fitTimer <= 0) { fitTimer = 0.3; fitter.fit(); } }
    if (playing && view) bubbles.update(view.speech, headOf, project, predicted, `p:${playerId}`, viewW, viewH);
    monitor.end(elapsed * 1000);
    if (clock > 4 && !document.hidden) governor.frame(elapsed * 1000, dt);
    requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) letGo(); if (document.hidden && playing) writeStored(SAVE_KEY, { host: host.save(), playerId }); if (document.hidden) audio.suspend(); else if (playing && prefs.sound) audio.start(); last = performance.now(); monitor.pause(); });
  if (window.claude && window.claude.hot && typeof window.claude.hot.snapshot === 'function') {
    window.claude.hot.snapshot(() => (playing ? { host: host.save(), playerId } : {}));
  }
  // Debug handle for automated play-testing. It reaches into the simulation
  // directly, which only works because this prototype runs it in the page.
  window.__nlw = {
    skillsState: () => skills.state,
    get host() { return host; }, get playerId() { return playerId; }, get view() { return view; }, ui, cam, crowd, audio, town, bubbles, known, perf,
    place(x, z) { const p = host.game.state.players[playerId]; p.x = x; p.z = z; p.lastMoveAt = host.game.state.real; predicted.x = x; predicted.z = z; refreshView(); },
    // puts the vehicle being driven somewhere, for screenshots
    park(x, z, heading) { const p = host.game.state.players[playerId]; const v = host.game.state.vehicles.list[p.driving]; v.x = x; v.z = z; v.heading = heading; p.x = x; p.z = z; p.lastMoveAt = host.game.state.real; predicted.x = x; predicted.z = z; predicted.heading = heading; car.speed = 0; refreshView(); },
    get car() { return car; }, controls, monitor, rig, get mode() { return mode; },
    get drawn() { return { triangles: renderer.info.render.triangles, calls: renderer.info.render.calls }; },
    get inside() { return inside ? inside.id : null; },
    get quality() { return quality.level; }, governor, scene, renderer, warmUp, get ready() { return isReady; },
    // every keke and coach in the scene: which level of detail it is at and what it costs
    get fleet() { return [...world.parkedVehicles.map((v) => v.model), ...[...vehicleActors.values()].map((a) => a.model)].map((m) => ({ model: m.model, look: m.look.id, trim: m.trim, level: m.level, triangles: m.triangles, shown: m.group.visible, spin: m.spin, steering: m.steering, lit: m.lit, x: m.group.position.x, z: m.group.position.z })); },
    get link() { return link ? link.status() : null; },
    face(heading) { predicted.heading = heading; host.game.state.players[playerId].heading = heading; },
    act(id) { near = findNear(); prompt = findPrompt(); act(id, 'down'); },
    walkable: (x, z) => zoneWalkable(x, z, structureBoxes()),
    saveNow() { writeStored(SAVE_KEY, { host: host.save(), playerId }); },
    get lite() { return LITE; }, get going() { return going; }, get me() { return me; },
    skip(gameHours) { host.game.advance(gameHours * 3600); refreshView(); },
    // A second player, in a second copy of the world in this page, joined to
    // this one by the loopback transport: the same path two devices take.
    twin(name = 'Second Player', x = null, z = null) {
      const hub = createLoopbackHub();
      const other = createHost();
      const id = other.game.join({ name, look: { skin: 0x4f3019, top: 0x1f5c4d, body: 'f' } });
      transport = { make: () => hub.join('first') };
      relink();
      const q = other.game.state.players[id];
      if (x !== null) { q.x = x; q.z = z; }
      twin = { host: other, id, link: createLink({ transport: hub.join('second'), game: other.game, zoneId: ZONE.id, self: () => other.game.view(id).self }), place(px, pz) { q.x = px; q.z = pz; q.lastMoveAt = other.game.state.real; }, say: (text) => other.game.intent(id, { type: 'chat.say', text }), language: (lang) => other.game.intent(id, { type: 'settings.language', lang }), view: () => other.game.view(id) };
      return twin;
    },
    get second() { return twin; },
    // where a kind of place is, for the play-through: the first spot of that venue and slot
    spot(venue, slot, nth = 0) { const found = ZONE_SPOTS.filter((sp) => sp.venue === venue && sp.slot === slot)[nth]; return found ? { x: found.x, z: found.z, facing: found.facing, room: found.room } : null; },
    // plays each kind of music for a few seconds into a buffer and measures it
    musicCheck: () => Promise.all(Object.keys(MUSIC_STYLES).map((style) => renderStyle(style, 4))),
  };

  showStart(false);
  // The opening plays over the start screen while the town is made ready behind it. A player with a character
  // on this device who has answered before is not asked again.
  const intro = createIntro({
    audio,
    // the same switch as Settings and the N key: on for a first visit, and whatever the player last chose after that
    sound: { on: () => !!prefs.sound, toggle: () => { prefs.sound = !prefs.sound; audio.setMuted(!prefs.sound); writeStored(PREFS_KEY, prefs); } },
    ask: () => !(playerId && (prefs.path === 'hero' || prefs.path === 'villain')),
    onDone: (path) => { if (path) choosePath(path); const first = playerId ? $('continue') : $('name'); if (first && !NO_INTRO && !coarse) first.focus({ preventScroll: true }); },
  });
  window.__nlw.intro = intro;
  requestAnimationFrame(frame);
}

if (typeof THREE === 'undefined') {
  // The 3D library is loaded from a CDN. Without it there is nothing to draw.
  $('start-error').hidden = false;
  $('start-error').textContent = 'The 3D library did not load, so the world cannot be drawn. Check the connection and reload the page.';
  $('enter').disabled = true;
  const opening = document.getElementById('intro');
  if (opening) opening.remove();
} else {
  const begin = () => { if (window.claude && window.claude.hot && typeof window.claude.hot.ready === 'function') window.claude.hot.ready(start); else start((window.claude && window.claude.hot && window.claude.hot.data) || {}); };
  // Building the town holds the page for a moment. The brand is drawing itself on screen just then, so the
  // town waits until it has: the opening is ten seconds long, and the town is ready well inside that.
  const shown = typeof window.__introAt === 'number' ? performance.now() - window.__introAt : Infinity;
  if (NO_INTRO || !document.getElementById('intro') || shown > 1900) begin(); else setTimeout(begin, 1900 - shown);
}
