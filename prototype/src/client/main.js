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

import { createHost } from '../sim/host.js';
import { ZONE, ZONE_PROPS, ZONE_TEXT, ZONE_RESIDENTS, ZONE_SERVICES, ZONE_BENCHES, ZONE_MOULD_STATIONS, ZONE_PARCELS, ZONE_ROADS, ZONE_JETTY, ZONE_SOUNDS, ZONE_COMPOUNDS, ZONE_SHEDS, ZONE_STALLS, ZONE_SPOTS, zoneWalkable, zoneStep, zoneSwimmable, zoneSolid, zoneSiteLayout, zoneResident, zoneRoomAt, zoneShoreZ, ZONE_SHOPS, zoneShop, ZONE_CAST, ZONE_BUILDINGS, OUTSKIRT_ROADS, zoneGroundY, POWERBIKE, inPowerbikeHall, onPowerbikeExit, powerbikeDisplayNear, CARSHOW, inCarHall, onCarshowExit, carshowAtDoors, carshowDisplayNear, carshowSideAt, carshowSideOf, carshowBuildingAt, carshowGateBoxes, SPORTS_MALL, inSportsHall, onSportsExit, sportsDisplayNear, sportsBuildingAt, zoneBlockKind, habitationFootOnly, HABITATION, HABITATION_FALLS, HABITATION_HOT_RIVER, hotRiverNear, HABITATION_STREAMS, HABITATION_WATERS, habitationWaterAt, habitationGroundAt, habitationFooting, habitationClimbing, habitationAlongDeck, habitationAway, CITY_AREA } from '../sim/zone.js';
import { SPEED, SWIM, UPGRADE, structureFootprint, wallSeconds } from '../sim/sim.js';
import { FIGURES } from '../sim/figures.js';
import { DESIGNS, BUSINESSES } from '../sim/economy.js';
import { VEHICLE_KINDS, RUN_RULES, vehicleFits, vehicleSpeedAt, vehicleBox, lowerFirst } from '../sim/vehicles.js';
import { createTranslator } from '../sim/culture.js';
import { createLoopbackHub, createRoomTransport } from '../net/transport.js';
import { createLink } from '../net/link.js';
import { buildWorld } from './render-world.js';
import { outskirtsSteps } from './render-outskirts.js';
import { programsReady } from './program-ready.js';
import { buildBillboards } from './render-billboards.js';
import { buildTown } from './render-town.js';
import { createCrowd } from './render-crowd.js';
import { linear, setLite, restoreGeometry, settleMesh, restState } from './render-kit.js';
import { fetchKept, restorePictures, setPictureMost, stepPictures, picturesWaiting, pictureMost, pictureState, isRestorable, setUploader } from './glb.js';
import { createPictureKeeper } from './picture-keeper.js';
import { gradeInstalled } from './grade.js';
import { setWorldShading, airAt, worldShadingState, cloudShadeAt } from './world-shading.js';
import { createScreenGlow } from './screen-glow.js';
import { createAmbientOcclusion } from './ambient-occlusion.js';
import { setRiver, createRiverMirror, riverState } from './river-water.js';
import { createDust } from './dust.js';
import { createFireflies } from './fireflies.js';
import { createWetTracks } from './wet-tracks.js';
import { makeVehicle, makeVan, createParcelLayer, createSiteLayer, createYardStacks } from './render-actors.js';
import { initVehicles, setVehicleDaylight, vehicleWarmJobs, vehicleEnvironment, renewEnvironment } from './vehicle-models.js';
import { vehicleMeta } from './vehicle-kit.js';
import { makeCharacter, animateCharacter, seatCharacter, standCharacter, showName, layCharacter, reactionNames, reactionLength } from './render-people.js';
import { createSky } from './render-sky.js';
import { createBubbles } from './bubbles.js';
import { createAudio, renderStyle, MUSIC_STYLES, DEFAULT_VOLUMES } from './audio.js';
import { createVoicePlayer } from './voices.js';
import { createUI, h } from './ui.js';
import { createControls } from './controls.js';
import { createSpeedometer } from './speedometer.js';
import { createMonitor, createGovernor } from './monitor.js';
import { createWarmUp } from './warmup.js';
import { HEALTH } from '../sim/conflict.js';
import { driverSide } from '../sim/hijack.js';
import { MOTO, motoSpeedAt } from '../sim/okada.js';
import { POWER_BIKES, handlingOf, stepPowerBike, bikeRevs } from '../sim/power-bikes.js';
import { CRASH } from '../sim/own-bikes.js';
import { POWER_CARS, carHandlingOf, stepPowerCar, carRevs, carBoxes } from '../sim/power-cars.js';
import { CAR_CRASH, carFits } from '../sim/own-cars.js';
import { BIKE_SOUNDS, BIKE_HORNS, createBikeEngine, soundBikeHorn, firingHz } from './bike-audio.js';
import { startStrike, poseFighter, poseTaking, soundOf } from './combat-view.js';
import { createCameraRig, nextView, viewFor, CAMERA_VIEW, STREET, RIDE } from './camera.js';
import { createIntro } from './intro.js';
import { PROMPT_ICON, icon } from './icons.js';
import { createCreator } from './creator.js';
import { loadPack, packProgress } from './packs.js';
import { createLoadingCard } from './loading.js';
import { REACTIONS } from './reaction-data.js';
import { shareRenderer, renewViews, canvasAway, canvasHome } from './shared-view.js';
import { createRadar } from './radar.js';
import { createBlood } from './blood.js';
import { createSkills } from './skills.js';
import { buildCatalog } from './skill-catalog.js';
import { createFitter } from './fit.js';
import { QUALITY_RULES, PHONE_QUALITY_RULES } from './monitor.js';
import { createWebApp } from './webapp.js';
import { createPhoneHold } from './phone-hold.js';
import { ANIMATED, heldModels, warmFigures, lightFiles, dropUnusedFigures, figureLog } from './animated.js';
import { paintedStats } from './painted.js';
import { createMusic } from './music.js';
import { trText, trAmount, TR } from '../sim/ledger.js';
import { createOnline, createWebTransport, packSave, unpackSave } from '../net/online.js';
import { createMarket, createAccountSync, newId } from './market.js';
import { createAccountUI } from './account-ui.js';
import { createWallet } from './wallet.js';
import { createConfirm } from './confirm.js';
import { createVoiceChat } from '../net/voice-chat.js';
import { createVoiceUI, PRIVACY } from './ui-voice.js';
import { makeDealMarker } from './render-holaris.js';
import { createOwnBikeView } from './own-bike-view.js';
import { createSportView } from './sport-view.js';
import { createSportRidersView } from './sport-riders-view.js';
import { SPORT_HANDLING, SPORT_BELL, stepSport, sportSeated } from '../sim/sport-ride.js';
import { trimSports } from './sports-model.js';
import { createCarView } from './car-view.js';
import { createStandins } from './vehicle-standins.js';
import { setCarDaylight, carsHeld, trimCars } from './car-model.js';
import { bikesHeld, trimBikes } from './bike-model.js';
import { buildCarshow } from './render-carshow.js';
import { buildSports } from './render-sports.js';
import { SPORTS } from '../sim/sports.js';
import { createSupplied } from './render-supplied.js';
import { createTownBuildings } from './render-town-buildings.js';
import { updateFinishes, finishState, setReflections, setWater } from './render-finish.js';
import { foliageState } from './render-foliage.js';
import { buildPowerbike } from './render-powerbike.js';
import { pictureSize, GRAPHICS_BUDGET_MB, modelFile } from './budget.js';
import { countGraphics } from './graphics-count.js';
import { frameClock, statsLines, showStats } from './stats.js';
import { createSalesman } from '../sim/salesman.js';
import { talkGesture } from './talk-gestures.js';
import { watchPicture } from './picture-watch.js';
import { buildClosures } from './render-closures.js';
import { createTorchBeams } from './torch-beams.js';
import { STREET_LAMP, HEADLAMP_LIGHT, TORCH_LIGHT } from './light.js';
import { GRAPHICS_LEVELS, GRAPHICS_LOWERED, LOW, levelSetting, memoryLimitMB, autoStart, autoCeiling, remembered, remember, levelOf } from './graphics.js';
import { showSoftPatches, softPatchesShown, softPatchOpacity } from './soft-patch.js';
import { fallTime, flightAt } from './falls.js';
import { CONTACT, contactNormal, contactOutcome } from '../sim/contact.js';
import { createGunPlay, GUN_PLAY } from './gun-play.js';
import { setGunDrawing, GUN_MODELS } from './gun-model.js';
import { createGunNet } from '../net/gun-net.js';

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
const VEHICLE_BIAS = [1, 0.8, 0.6, 0.45];     // how much nearer a vehicle must be for each step of detail (quality.detail), as quality drops
const DRIVER_SEAT = vehicleMeta('keke').seats.driver;   // where the keke's driver sits, in the keke's own frame
const SEATED_HEIGHT = 0.845;                 // how far above its own feet a seated figure's seat is, for a figure of height 1
const FIGURE_DETAIL = LITE ? [44, 36, 28, 22] : [60, 45, 32, 24];      // metres within which a townsperson is drawn with limbs
// His townspeople drawn as themselves beyond the full figures (render-crowd.js, crowd-figures.js; 30 October 2026, the
// owner's brief: "the npc are looking so cartoonish"): within `reach` metres everyone standing or walking is drawn from
// his own figure, `kinds` of his figures held at once, `each` people drawn from each; further off, the plain figures.
// (a phone at Low held six at first: at the market by day four of the seventeen near and in the picture were drawn
// plainly, their figures not among the six held: it holds nine now. Each figure held is its light copy on the graphics
// card, its picture at 512 on a phone, shared with any full figure of it; at Medium, where the town's own pictures are
// larger, eight, so that a phone keeps under 135 MB at the busiest place, measured, tools/measure/places.mjs)
const CROWD = LITE
  ? [{ reach: 34, kinds: 10, each: 14 }, { reach: 30, kinds: 9, each: 12 }, { reach: 26, kinds: 8, each: 10 }, { reach: 22, kinds: 9, each: 8 }]
  : [{ reach: 55, kinds: 16, each: 36 }, { reach: 46, kinds: 14, each: 28 }, { reach: 38, kinds: 12, each: 20 }, { reach: 30, kinds: 10, each: 14 }];
const PLATE_REGION = ZONE.government.state.short.replace(/ State$/, '');   // the state named on a registration plate
const REACH = LITE ? [300, 270, 230, 190] : [400, 330, 260, 200];          // how far the town is drawn, by detail level
const $ = (id) => document.getElementById(id);
// For measuring the page's own work apart from the graphics card's: the address ending in #nodraw draws nothing.
const NO_DRAW = HASH.includes('nodraw');
const NO_INTRO = HASH.includes('nointro');
// The town keeps the player's own time: the real hour, day and date (sim.js). '#gameclock' in the address
// gives the old forty-eight-minute day instead, for the play-throughs that need a whole day in a few minutes.
const REAL_CLOCK = !HASH.includes('gameclock');

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
  // The page's one drawing surface (shared-view.js): the town, and the character screen's turntable and the market's
  // viewer drawn by it in turn. It can be see-through (alpha), for those two, whose backgrounds are the page's; the
  // town is drawn over a clear that is not (setClearColor below).
  // (three.js r186 draws with WebGL 2 alone, which every phone and computer of the last several years has; a browser
  // without it, or with its graphics acceleration turned off, is told so, where r128 would have tried WebGL 1)
  let renderer = null;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); } catch (error) {
    $('start-error').hidden = false;
    $('start-error').textContent = 'This browser cannot draw the game: it needs WebGL 2. Update the browser, or turn its graphics acceleration on, and reload the page.';
    $('enter').disabled = true;
    const opening = document.getElementById('intro');
    if (opening) opening.remove();
    return;
  }
  renderer.setClearColor(0x000000, 1);
  // (while the town is not being played in, the turntable may have the canvas sized to itself: enterWorld sizes it for
  // the town again)
  shareRenderer(renderer, { idle: () => !playing, paused: () => pictureGone });
  // what the page holds on the graphics card, counted as it is handed over (graphics-count.js), against its budget
  const graphics = countGraphics(renderer.getContext(), { antialias: true });
  const graphicsBudgetMB = GRAPHICS_BUDGET_MB[LITE ? 'lite' : 'full'];
  let graphicsTrims = 0;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LITE ? 1.25 : 2));
  renderer.shadowMap.enabled = true;
  // (three.js r186 has one kind of soft shadow; how soft is the sun's own: render-sky.js)
  renderer.shadowMap.type = THREE.PCFShadowMap;
  setLite(LITE);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // (the colour grade, every level: grade.js; its warmth for the hour set by the sky each frame)
  if (gradeInstalled) { renderer.toneMapping = THREE.CustomToneMapping; renderer.toneMappingExposure = 1; }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 2000);
  // The town is built when the player goes into it, not while the page starts (20 October 2026, the owner's brief: on
  // a phone the town was built and warmed up while the character screen was up, which froze the screen for seconds at
  // a time, and took the phone's graphics memory before a figure was even shown). Each piece of it is a step here,
  // where it always was in this file; prepareTown runs them, one a frame, behind the loading card, once a character
  // is chosen (or, for someone who has one, once PLAY is pressed). Until then, these are all null.
  const townSteps = [];          // [what it is, () => build it]
  let townBuilt = false;
  let world = null, closures = null;
  townSteps.push(['the ground and the roads', () => {
    initVehicles(renderer, { lite: LITE });
    world = buildWorld(scene);
    // the roads not open yet and the edge of the built land: roadblocks and a fence, solid where they are drawn
    // (render-closures.js, closures.js; 19 October 2026)
    closures = buildClosures(scene, { lite: LITE });
  }]);
  // Beyond the town: the road to Onitsha, the airport, the bridge (render-outskirts.js). Built once the player is in
  // town and the town has been warmed up, not while the page is starting: it is a kilometre away from where anyone
  // arrives, and starting is what the owner asked to be quick. Its lamps then join the town's.
  let outskirts = { lampHeads: [], see() {}, ready: false };
  let beyondWait = 0;
  let billboards = null;
  // the campaigns showing on billboards now: asked of the server every few minutes, and drawn on them
  const adBoard = {
    at: -1e9, list: [],
    async refresh() {
      if (!online.available) return;
      const answer = await online.ask('ads.board', {});
      if (answer.ok) { adBoard.list = answer.campaigns; adBoard.at = clock; if (billboards) billboards.show(answer.campaigns); }
    },
  };
  // (26 October 2026, the owner's brief: the game hung on his phones. Built all at once a minute into play, the land
  // beyond the town and its billboards held a phone's page for several seconds; now a piece a frame (stepBeyond, a few
  // milliseconds' worth each frame), put in once the graphics card has compiled what it needs. All at once still for
  // someone already out there, and for the tests: buildBeyond.)
  let beyondJob = null, beyondBegun = false;
  // (`land` false: the billboards alone, for a phone far from the land beyond the town: BEYOND_PHONE)
  function* beyondSteps(stepwise, land = true) {
    let step, said, built = null;
    if (land) {
      const steps = outskirtsSteps(scene, { glowMaterial: world.glowMaterial, renderer: stepwise ? renderer : null, camera: stepwise ? camera : null });
      while (!(step = steps.next(said)).done) said = yield step.value;
      built = step.value;
    }
    said = yield;
    // the advertising billboards, in town and beyond it (render-billboards.js), with the same wait (once: the land beyond
    // the town is built again on a phone that let it go, its billboards are not)
    if (!billboards) {
      billboards = buildBillboards(scene, { glowMaterial: world.glowMaterial, lite: LITE, loadArtwork: async (id) => {
        // an approved campaign's picture, from the server (only an approved one is given to anyone but its advertiser)
        const answer = await online.ask('ads.art', { id }, { timeout: 30000 });
        if (!answer.ok) throw new Error(answer.message);
        const raw = atob(answer.data); const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
        return new Blob([bytes], { type: answer.mime });
      } });
      // (their programs too, made ready before they are shown: program-ready.js)
      if (stepwise) {
        billboards.group.visible = false;
        const ready = programsReady(renderer, billboards.group, camera, scene);
        while (said !== 'now' && !ready.step(6)) said = yield 'waiting';
        billboards.group.visible = true;
      }
      adBoard.refresh();
    }
    if (!built) return;
    outskirts = { ...built, ready: true };
    world.lampHeads.push(...outskirts.lampHeads);
    lampPools.place();
    beyondStats.builds += 1;
  }
  // A phone does not hold the land beyond the town while the player is far from it (29 October 2026, the owner's
  // recording: at the town's east end his iPhone held the town, the land beyond it, a kilometre to the west, and the
  // habitation all at once, and closed the game). It is built as they come west (BEYOND_PHONE.come: the town's middle,
  // some 270 m from its nearest part, as far as a phone sees), and let go again past BEYOND_PHONE.go to the east, before
  // the habitation is built. A computer keeps it.
  const BEYOND_PHONE = Object.freeze({ come: 40, go: 140 });
  const beyondWanted = (x, z) => !LITE || x < BEYOND_PHONE.come || z > 150;
  function letGoBeyond() {
    if (!outskirts.ready || !outskirts.group || beyondJob) return false;
    const group = outskirts.group;
    scene.remove(group);
    // (each mesh resting far off given its own geometry back, so that letting it go forgets what was kept of it)
    group.traverse((o) => { if (o.isMesh) settleMesh(o); });
    // (each shape, and each sign's own picture, that nothing else in the scene draws: its room on the graphics card and
    // its numbers; its materials are small and may be the town's own, and are left to go with it)
    const elsewhere = new Set(), pictures = new Set();
    scene.traverse((o) => { if (o.geometry) elsewhere.add(o.geometry); const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of mats) if (m.map) pictures.add(m.map); });
    let shapes = 0;
    group.traverse((o) => { if (o.geometry && !elsewhere.has(o.geometry)) { o.geometry.dispose(); elsewhere.add(o.geometry); shapes += 1; } });
    for (const sign of outskirts.signs || []) { const m = sign.material; if (m && m.map && !pictures.has(m.map)) m.map.dispose(); }
    const heads = new Set(outskirts.lampHeads);
    for (let i = world.lampHeads.length - 1; i >= 0; i -= 1) if (heads.has(world.lampHeads[i])) world.lampHeads.splice(i, 1);
    lampPools.place();
    outskirts = { lampHeads: [], see() {}, ready: false };
    beyondBegun = false; beyondWait = 0;
    beyondStats.letGo += 1; beyondStats.shapesLetGo += shapes;
    return true;
  }
  function buildBeyond() {
    if (outskirts.ready) return;
    if (!beyondJob) beyondJob = beyondSteps(false);
    while (!beyondJob.next('now').done) { /* all of it, now */ }
    beyondJob = null;
  }
  // (for the measuring: how many pieces, over how many frames, the longest piece, the work in all, in ms)
  const beyondStats = { steps: 0, frames: 0, longestMs: 0, workMs: 0, builds: 0, letGo: 0, shapesLetGo: 0 };
  function stepBeyond(budgetMs = 6) {
    if (outskirts.ready) { beyondJob = null; return; }
    // (a phone far from the land beyond the town: its billboards alone, once)
    const land = beyondWanted(predicted.x, predicted.z);
    if (!land && billboards && !beyondJob) { beyondBegun = false; return; }
    if (!beyondJob) beyondJob = beyondSteps(true, land);
    const t0 = performance.now();
    beyondStats.frames += 1;
    // (waiting on the graphics card's compiling: looked at again next frame)
    for (;;) {
      const s0 = performance.now();
      const step = beyondJob.next();
      const took = performance.now() - s0;
      beyondStats.steps += 1; beyondStats.workMs += took; beyondStats.longestMs = Math.max(beyondStats.longestMs, took);
      if (step.done) { beyondJob = null; return; }
      if (step.value === 'waiting' || performance.now() - t0 >= budgetMs) return;
    }
  }
  let town = null, crowd = null, blood = null, sky = null, parcelLayer = null, siteLayer = null, yardStacks = null;
  // (stage 3's realism, 23 and 24 October 2026: dust on dirt, fireflies in the habitation at night, wet marks after rain,
  // and the glow round what is brightest, with the sun's flare at Ultra)
  let dust = null, fireflies = null, wetTracks = null, glow = null, occlusion = null, riverMirror = null;
  townSteps.push(['the buildings', () => { town = buildTown(scene, world.glowMaterial); }]);
  townSteps.push(['the people, the sky and the plots', () => {
    crowd = createCrowd(scene);
    blood = createBlood(scene);
    sky = createSky(scene, renderer);
    dust = createDust(scene, { lite: LITE });
    fireflies = createFireflies(scene, { lite: LITE });
    wetTracks = createWetTracks(scene, { lite: LITE });
    parcelLayer = createParcelLayer(scene);
    siteLayer = createSiteLayer(scene);
    yardStacks = createYardStacks(scene);
  }]);
  const audio = createAudio();
  // the town's recorded voices (28 October 2026): played from where each speaker stands (voices.js)
  const voicePlayer = createVoicePlayer({ audio, fetchFile: (url) => fetchKept(url) });
  let phoneHold = null, ownBikeView = null, peerBikeView = null, carView = null, standins = null, sportView = null, peerSportView = null, sportRidersView = null;
  townSteps.push(['the phones, the motorcycles and the cars', () => {
    // the phone in the character's hand: the handset, the arm that holds it, the light of its screen
    phoneHold = createPhoneHold({ scene, lite: LITE });
    // the player's own motorcycles: the one ridden and the ones left standing (own-bike-view.js)
    ownBikeView = createOwnBikeView(scene, { lite: LITE, onError: () => { ui.toast({ type: 'note', text: 'Your motorcycle could not be fetched. Check the connection.' }); } });
    // other players' motorcycles, seen from here (the same drawing, without anything to fetch until one is near)
    peerBikeView = createOwnBikeView(scene, { lite: LITE, priority: 'low' });
    // the things from the sports mall (31 October 2026): the one the player rides and theirs left standing, and other
    // players' (sport-view.js)
    sportView = createSportView(scene, { lite: LITE, onError: () => { ui.toast({ type: 'note', text: 'It could not be fetched. Check the connection.' }); } });
    peerSportView = createSportView(scene, { lite: LITE, priority: 'low' });
    // and the town's people out on theirs (sport-riders-view.js)
    sportRidersView = createSportRidersView(scene, { lite: LITE });
    // cars (17 October 2026): the one the player drives, theirs left standing, and other players' (car-view.js)
    carView = createCarView(scene, { lite: LITE, onError: () => { ui.toast({ type: 'note', text: 'Your car could not be fetched. Check the connection.' }); } });
    // other players' motorcycles and cars as their pictures, where their models are not drawn (vehicle-standins.js)
    standins = createStandins(scene, { lite: LITE });
  }]);
  // The guns (25 October 2026, the owner's briefs for the guns): the player's own, other players' and the police
  // officers', what their rounds do, the shooting screen, blood on the screen (gun-play.js). Made with the town, before
  // it is warmed up, so that what their rounds leave is ready to be drawn (a muzzle's flash lights what is round it with
  // the town's own lamp for a vehicle's headlamps: see the lamps, below).
  let gunPlay = null;
  // (should they fail to be made, the town is built all the same, without them: said in the console)
  townSteps.push(['the guns', () => {
    try { makeGuns(); } catch (error) { gunPlay = null; console.error('PostCivilWar: the guns could not be made', error); }
  }]);
  function makeGuns() {
    setGunDrawing({ env: LITE ? null : vehicleEnvironment(), maxTexture: pictureSize('supplied', { lite: LITE, most: renderer.capabilities.maxTextureSize }), lite: LITE });
    gunPlay = createGunPlay({
      scene, camera, audio, lite: LITE, coarse, ground: zoneGroundY, net: gunNet, online, drawn: () => renderer.info.render.frame,
      game: () => host.game, send: (intent) => server.send(intent), view: () => view, playerId: () => playerId,
      refresh: () => refreshView(), cam: () => cam, calm: () => !!prefs.calm,
      peers: () => shownPeers, rigOf: (key) => (crowd ? crowd.rigOf(key) : null),
      toast: (text) => ui.toast({ type: 'note', text }),
      confirm: ({ title, text, yes, no }) => confirm.ask({ title, body: text, confirm: yes, cancel: no, run: async () => ({ ok: true }) }),
      hudRoot: $('hud'), hudr: $('hudr'), bloodRoot: $('game') || document.body,
    });
  }
  // the rounds this player fires, told to the website's server with each word about where they are (gun-net.js)
  const gunNet = createGunNet();
  const PEER_STANDIN = 260;          // metres within which another player's vehicle is drawn at all
  // and the town's cars beyond the nearest few drawn as their models (car-view.js): their pictures within this (a phone
  // nearer: each car's picture sheet is memory on its graphics card)
  const TRAFFIC_STANDIN = Object.freeze({ lite: 160, full: 260 });
  // the phone in other players' hands (phone-hold.js, one each, made when one is first seen with it out; no lamp)
  const peerPhones = new Map();      // id -> { hold, idle }
  function updatePeerPhones(dt) {
    const near = new Set();
    for (const q of shownPeers) {
      const close = Math.hypot(q.x - predicted.x, q.z - predicted.z) < 45;
      let e = peerPhones.get(q.id);
      if (!e && (!q.phone || !close || peerPhones.size >= 8)) continue;
      const rig = crowd.rigOf(`p:${q.id}`);
      if (!e) { e = { hold: createPhoneHold({ scene, lite: true }), idle: 0 }; peerPhones.set(q.id, e); }
      near.add(q.id);
      const side = q.car ? 'r' : q.ride || (q.vehicle && !q.vehicle.back) ? 'l' : q.vehicle ? 'r' : null;
      e.hold.update(dt, rig, { use: q.phone === 1 || q.phone === 3, able: !!rig && close, night, screen: q.phone === 3 ? 'camera' : 'page', call: q.phone === 2, seated: side ? { side } : null });
      e.idle = e.hold.out > 0 ? 0 : e.idle + dt;
    }
    for (const [id, e] of peerPhones) if (!near.has(id) || e.idle > 8) { e.hold.dispose(); peerPhones.delete(id); }
  }
  let peerRides = [], peerSportRides = [];
  const riderBells = new Map();          // the last ring of each of the town's cyclists' bells heard (by when it was)
  let riderBellsHeard = 0;
  let carsHeard = [];                // other players' cars near enough to be heard: { key, car, x, z, rev, throttle }
  let shownPeers = [];
  // Other players as they are now: one in or on a vehicle is carried on from where their game last said they were,
  // at the speed it said they were going (a vehicle at speed would otherwise stand still between words and jump)
  function peersNow() {
    const ahead = Math.max(0, clock - viewAt);
    shownPeers = (view.players || []).map((q) => {
      const v = q.vel;
      if (!v || !(q.vehicle || q.ride || q.sport || q.car) || Math.hypot(v[0], v[1]) < 0.3) return q;
      const k = Math.min(0.3, (q.ago || 0) + ahead);
      return { ...q, x: q.x + v[0] * k, z: q.z + v[1] * k };
    });
    return shownPeers;
  }
  // Other players' kekes: the one each drives, and those of theirs standing near them. Each copy of the town has its
  // own vehicles; these are drawn from what the other player's game says. A keke of the town's hire fleet that
  // another player has out is not also shown standing in its bay here (nor in the way).
  const peerKekes = new Map();          // key -> { actor, was, seen }
  const claimedFleet = new Set();       // ids of the hire fleet's kekes another player has out
  function updatePeerKekes(dt) {
    const want = [];
    claimedFleet.clear();
    for (const q of shownPeers) {
      if (q.vehicle && q.vehicle.kind === 'keke') {
        const rig = crowd.rigOf(`p:${q.id}`);
        want.push({ key: `d:${q.id}`, v: q.vehicle, x: q.x, z: q.z, h: rig ? rig.group.rotation.y : q.heading, driven: true });
        if (q.vehicle.fleet && q.vehicle.id) claimedFleet.add(q.vehicle.id);
      }
      for (const k of q.kekes || []) { want.push({ key: `p:${q.id}:${k.id}`, v: k, x: k.x, z: k.z, h: k.heading, driven: false }); if (k.fleet && k.id) claimedFleet.add(k.id); }
    }
    const seen = new Set();
    for (const w of want) {
      seen.add(w.key);
      let e = peerKekes.get(w.key);
      const look = w.v.look || {};
      const sig = JSON.stringify([look, w.v.plate]);
      if (e && e.sig !== sig) { scene.remove(e.actor.group); e.actor.model.dispose(); peerKekes.delete(w.key); e = null; }
      if (!e) { const actor = makeVehicle(look, w.v.plate || null, PLATE_REGION); actor.group.position.set(w.x, 0, w.z); actor.group.rotation.y = w.h; scene.add(actor.group); e = { actor, sig, was: { x: w.x, z: w.z } }; peerKekes.set(w.key, e); }
      const g = e.actor.group;
      g.position.set(w.x, zoneGroundY(w.x, w.z), w.z);
      g.rotation.y = w.h;
      const along = (w.x - e.was.x) * Math.sin(w.h) + (w.z - e.was.z) * Math.cos(w.h);
      if (Math.abs(along) > 1e-4 && Math.abs(along) < 5) e.actor.model.roll(along);
      e.was.x = w.x; e.was.z = w.z;
      e.actor.model.setDistance(Math.hypot(w.x - camera.position.x, w.z - camera.position.z), undefined, VEHICLE_BIAS[quality.detail]);
      const lit = w.driven && night > 0.45 ? 1 : 0;
      if (lit !== e.lit) { e.lit = lit; e.actor.model.lamps(lit, lit, 0, 0); }
    }
    for (const [key, e] of peerKekes) if (!seen.has(key)) { scene.remove(e.actor.group); e.actor.model.dispose(); peerKekes.delete(key); }
    for (const [id, actor] of vehicleActors) if (!(view.self.driving && view.self.driving.id === id)) actor.group.visible = !claimedFleet.has(id);
  }
  const peerHorned = new Map();
  let peerHornsHeard = 0;
  // the ridden bike's headlamp: one light, following it, on at night (a lamp's glow is drawn on every bike)
  let headlight = null;
  // The phone's torch (20 October 2026, the owner's brief: a "Torch" button on the phone; the light from the back of
  // the phone, beside its camera, pointing forward, a soft cone that fades with distance and moves with the player; and
  // other players see the beam). While it is on the character keeps the phone in hand, held out in front, as anyone
  // walking by a phone's torch does. Its lamp is the one the motorcycles' and cars' headlamps use: one light, always in
  // the scene, so that switching it on makes nothing be worked out again; a headlamp, when one is lit, comes first.
  // (its strength, reach and fall-off in three.js's units: light.js)
  const TORCH = Object.freeze({ intensity: TORCH_LIGHT.intensity, distance: TORCH_LIGHT.distance, angle: 0.5, penumbra: 0.85, decay: TORCH_LIGHT.decay, colour: 0xf2f5ff });
  const HEADLAMP = Object.freeze({ distance: HEADLAMP_LIGHT.distance, angle: 0.42, penumbra: 0.55, decay: HEADLAMP_LIGHT.decay, colour: 0xfff1d6 });
  // (a gun's flash, by the same lamp: wide, warm, short, its light falling off within a few metres; gun-fx.js times it)
  const GUN_FLASH = Object.freeze({ distance: 9, angle: 1.3, penumbra: 1, decay: 2, colour: 0xffb366 });
  const torch = { on: false, held: false, lit: false, self: { from: new THREE.Vector3(), dir: new THREE.Vector3() } };
  const torchWork = { back: new THREE.Vector3(), q: new THREE.Quaternion() };
  function setTorch(on) { torch.on = !!on; audio.chime('tap'); }
  // where a phone's torch shines from (the lens beside its camera, on the handset's back) and which way: forward, where
  // its holder faces, and a little down, onto the ground ahead
  function torchOf(hold, heading, out) {
    const prop = hold.prop;
    prop.updateMatrixWorld();
    out.from.set(0.018, 0.052, -0.012).applyMatrix4(prop.matrixWorld);
    const back = torchWork.back.set(0, 0, -1).applyQuaternion(prop.getWorldQuaternion(torchWork.q));
    out.dir.set(Math.sin(heading), 0, Math.cos(heading)).multiplyScalar(0.75).addScaledVector(back, 0.25);
    out.dir.y = Math.min(out.dir.y, 0) - 0.24;
    out.dir.normalize();
    return out;
  }
  // Street lamps at night. Every light of this kind is worked out for every pixel of everything, lit or
  // not, at any hour, so there are few: the two lamps nearest the player on a desktop, none on a phone.
  // What every lamp does have is a pool of light painted on the ground under it, which costs next to nothing.
  const lampLights = [];
  let lampPools = null;
  townSteps.push(['the lamps', () => {
  headlight = new THREE.SpotLight(HEADLAMP.colour, 0, HEADLAMP.distance, HEADLAMP.angle, HEADLAMP.penumbra, HEADLAMP.decay);
  headlight.castShadow = false; scene.add(headlight); scene.add(headlight.target);
  for (let i = 0; i < (LITE ? 0 : 2); i += 1) { const light = new THREE.PointLight(0xffc98a, 0, STREET_LAMP.distance, STREET_LAMP.decay); light.position.y = 4.8; scene.add(light); lampLights.push(light); }
  lampPools = (() => {
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
    // (room for the lamps beyond the town too, which are put in when it is built)
    const mesh = new THREE.InstancedMesh(disc, material, Math.max(1, world.lampHeads.length + 80));
    const at = new THREE.Matrix4();
    const place = () => { world.lampHeads.slice(0, mesh.instanceMatrix.count).forEach((lamp, i) => { at.makeTranslation(lamp.x, 0.07 + zoneGroundY(lamp.x, lamp.z), lamp.z); mesh.setMatrixAt(i, at); }); mesh.count = Math.min(world.lampHeads.length, mesh.instanceMatrix.count); mesh.instanceMatrix.needsUpdate = true; };
    place();
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, material, place };
  })();
  }]);
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
      radarWay = r && r.ok && (r.road || r.points) ? [...(r.road || r.points), [target.x, target.z]] : null;
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
  // (`calm`: Settings, "Reduce intense effects": less blood on the screen and in the town, gun-play.js)
  const prefs = { translate: true, subtitles: true, sound: true, graphics: 'auto', calm: false, skyTime: 'real', skyWeather: 'real', ...(readStored(PREFS_KEY) || {}) };
  // The sky the player chooses (30 October 2026, the owner's brief: "users to be able to choose the weather of their
  // game. The game should be able to use the real time weather as default but users can choose to change the settings,
  // maybe morning, noon, dusk or night, rainy or whatever"): Settings, Time and weather. 'real' (the default) is the time
  // and the weather where the player is, as before. A choice changes how this player's own game looks and sounds: the
  // sky, the sun and its shadows, the lamps, the rain and its sound. The town's own day (who is where, when the shops
  // open) and what its weather does (the roads' grip in the rain, the jobs that stop for it) stay the real ones, the
  // same for every player in it.
  const SKY_TIMES = Object.freeze({ morning: 8, noon: 12.5, dusk: 18.5, night: 22 });
  const SKY_WEATHERS = Object.freeze({ clear: Object.freeze({ kind: 'clear', wet: false, intensity: 0 }), cloudy: Object.freeze({ kind: 'cloudy', wet: false, intensity: 0 }), rain: Object.freeze({ kind: 'rain', wet: true, intensity: 0.6 }), storm: Object.freeze({ kind: 'storm', wet: true, intensity: 1 }) });
  const skyChoice = () => ({ time: SKY_TIMES[prefs.skyTime] !== undefined ? prefs.skyTime : 'real', weather: SKY_WEATHERS[prefs.skyWeather] ? prefs.skyWeather : 'real' });
  // the weather this player sees: their choice, or the town's
  const shownWeather = (real) => (SKY_WEATHERS[prefs.skyWeather] || real);
  // Every world made here keeps the real clock, and the real weather where the player is, once that is known.
  let realWeather = null;              // { kind, place, temperature, at } from the site's server
  const newHost = (options = {}) => {
    const made = createHost({ ...options, wallClock: REAL_CLOCK ? wallSeconds : null });
    if (realWeather && made.game.realTime) made.game.setWeather(realWeather.kind);
    return made;
  };
  let host = newHost({ saved: stored ? stored.host : null });
  let playerId = stored && host.game.hasPlayer(stored.playerId) ? stored.playerId : null;
  let playing = false;
  let exited = false;                 // left the town by Exit game (Settings): out of it until Play is pressed
  let exitNote = '';                  // what is to be said about where the game was saved, on the way out
  let intro = null;                   // the opening (intro.js); it can also put the one question again, later
  let gallery = false;                // looking at the characters, from inside the game: nothing is being played meanwhile
  let characterTrouble = '';          // why the character kept with the account could not be brought here, if it could not
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
  // (in PostCivilWar PowerBike's hall only its walls stand in the camera's way: the stands and the furniture are low,
  // under the camera's line; and the tower over it is solid to its top)
  const towerAt = POWERBIKE.footprint;
  // (what players have built stands in the camera's way too, as high as its walls: the boxes are gathered once a
  // frame, before the camera is placed, rather than at every point it tries)
  let builtForCamera = [];
  const builtAt = (x, z, y) => { if (y > 3.4) return false; for (const b of builtForCamera) if (x > b.x0 - 0.25 && x < b.x1 + 0.25 && z > b.z0 - 0.25 && z < b.z1 + 0.25) return true; return false; };
  const rig = createCameraRig(camera, {
    // (a roadblock or the fence at the edge of the land is low: the camera looks over it)
    blocked: (x, z, y) => (inPowerbikeHall(x, z) || inCarHall(x, z) || inSportsHall(x, z) ? y < 1.3 && zoneSolid(x, z, 0.25) : zoneSolid(x, z, 0.25, y - zoneGroundY(x, z))) || (y > 1.95 && underLowRoof(x, z)) || builtAt(x, z, y),
    ground: (x, z) => zoneGroundY(x, z),
    // (the habitation's land: its hills, cliffs and gorges stand between the camera and the player as walls do)
    // (the ground as it is drawn: 22 October 2026, the eye kept above the simulation's own finer ground went under the
    // coarser ground a phone drew, and the player saw the ground from below)
    terrain: (x, z) => (x > HABITATION.bounds.x0 - 2 && x < HABITATION.bounds.x1 && z > HABITATION.bounds.z0 && z < HABITATION.bounds.z1 ? habitationGroundAt(x, z) : NaN),
    tall: (x, z) => (x > towerAt.x0 && x < towerAt.x1 && z > towerAt.z0 && z < towerAt.z1 && !inPowerbikeHall(x, z) ? POWERBIKE.model.height : inCarHall(x, z) || inSportsHall(x, z) ? 0 : carshowBuildingAt(x, z) || sportsBuildingAt(x, z)),
  });
  let near = { fight: null, steal: null, take: null };      // who and what is within reach for the things only sometimes on offer
  let lastFight = 0;                 // the last blow from the simulation that has been shown
  let flash = 0;                     // the screen's edge reddens for a moment when the player is struck
  let requestSeq = 0;
  const coarse = TOUCH_FIRST;      // a touch screen: hints speak of the stick and the buttons
  // An id for one press of a button that spends or takes money: the simulation answers it once, however often it arrives.
  const requestId = (what) => `${what}-${Date.now().toString(36)}-${(requestSeq += 1)}`;
  // (`own`: how far behind the player on foot the player has pinched the camera to, kept when a shop or a showroom
  // brings it further for a while (`back`: to go back to it once that is over); `ride`: how much nearer or further than
  // usual behind a vehicle: 30 October 2026, camera.js)
  const cam = { yaw: Math.PI, pitch: STREET.pitch, dist: STREET.dist, own: STREET.dist, ride: 1, back: false, target: new THREE.Vector3(ZONE.spawn.x, 1.5, ZONE.spawn.z), lastDrag: -10 };
  const controls = createControls({ stick: $('stick'), pad: $('pad') });
  // the speedometer at the front of the screen, while one of the player's own motorcycles is ridden
  const speedo = createSpeedometer($('speedo'));
  const input = controls.state;      // keys down, where the stick is, whether Run is on
  let actKey = false;                // E or Enter held down
  const acting = () => actKey || controls.held('act');
  let mode = 'start';                // what the player is doing, which decides the buttons shown: see controlMode()
  let viewBeforeGun = null;          // the camera's view before the gun came out (it comes back when the gun goes)
  const perf = { fps: 60, calls: 0, triangles: 0, programs: 0, geometries: 0, textures: 0 };
  const monitor = createMonitor();
  const warmUp = createWarmUp(renderer, scene);
  let programsPinnedAt = 0;
  // (a picture made again, for a change of level or a drawing surface given back, handed to the graphics card at once,
  // so that the page's own copy of it is let go at once: glb.js, setUploader)
  setUploader((texture) => renderer.initTexture(texture));
  // (a phone: the pictures painted in the page that nothing drawn has used for half a minute let go from the graphics
  // card, handed to it again when next drawn: picture-keeper.js)
  const keeper = LITE ? createPictureKeeper(scene, renderer, { skip: isRestorable }) : null;
  const warm = { stage: 0, frames: 0, extras: [] };
  const startEl = $('start');
  let prompt = null;
  let holdProgress = 0;
  let clock = 0;
  let viewTimer = 1;
  let viewAt = 0;                     // when the view was last asked for (other players are carried on from it)
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
  // what this player's game tells the others: the simulation's own view of them, with the phone in their hand
  // (`phoneShown`, from the frame: 1 held to be read, 2 on a call, 3 held up for a picture), and, while they ask the
  // showroom's salesman about a motorcycle, which one and for how long (salesman.js goes to whoever began first)
  let phoneShown = 0;
  function linkSelf() {
    if (!view) return null;
    const armed = gunPlay ? gunPlay.linkFields(cam) : null;
    // (and the height of the ground they stand on: the website's server checks a round said to have struck them
    // against it, on a deck or a bridge as on the street)
    const gy = zoneGroundY(view.self.x, view.self.z);
    const me = { ...view.self, ...(voiceChat.active ? { voiceOn: 1 } : {}), ...(armed || {}), ...(Number.isFinite(gy) ? { gy } : {}), ...(phoneShown ? { phone: phoneShown, ...(torch.lit ? { torch: 1 } : {}) } : {}) };
    if (carshow.talk && carshow.inside) return { ...me, carTalk: { car: carshow.talk.car, ago: Math.max(0, host.game.state.real - carshow.talk.since) } };
    if (!showroom.talk || !showroom.inside) return me;
    return { ...me, talk: { bike: showroom.talk.bike, ago: Math.max(0, host.game.state.real - showroom.talk.since) } };
  }
  function relink() {
    if (link) { link.close(); link = null; }
    if (transport && playerId) link = createLink({ transport: transport.make(), game: host.game, zoneId: ZONE.id, self: () => linkSelf() });
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
  // (each figure's file beside the page: the first six as base64 text, the eighteen of 16 October as they are)
  // the files of a figure the web app's worker keeps for this device: its light copy at the size this device draws it
  const figureFiles = (id) => { const f = lightFiles(id); return f ? [f.model, ...f.pictures.map((p) => p.url), ...(f.moves ? [f.moves[0]] : [])].map((u) => String(u).split('?')[0]) : []; };
  const webapp = createWebApp({ figures: figureFiles, figure: () => (prefs.look && FIGURES[prefs.look.figure] ? prefs.look.figure : 'W1') });

  // Music on the phone (music.js): the game's own pieces, and on the website the songs listed in music/library.json.
  const music = createMusic({
    player: audio.player,
    fetchJson: webapp.site ? () => (navigator.onLine === false ? Promise.resolve({ tracks: [] }) : fetch('music/library.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : { tracks: [] }))) : null,
    recalled: prefs.song || null,
    remember: (id) => { prefs.song = id; writeStored(PREFS_KEY, prefs); },
  });

  // ---------------------------------------------------------- the website's server --
  // Accounts, the character kept with them, the market and the other players (net/online.js). Only the website
  // has a server; anywhere else `online.available` is false and none of this asks the network for anything.
  const ACCOUNT_KEY = 'pcw-account-v1';
  const SEEN_KEY = 'pcw-wallet-seen-v1';      // the last entry of each account's wallet this device has told its player about
  const online = createOnline({ available: !!webapp.site });
  // Voice chat with the players near you (net/voice-chat.js; on the screen, ui-voice.js): off until the player turns it
  // on. The other players as the game shows them, by the server's id for each; a building between muffles a voice.
  const voiceWalls = (x1, z1, x2, z2) => {
    const d = Math.hypot(x2 - x1, z2 - z1);
    for (let t = 1.2; t < d - 1.2; t += 1) { const k = t / d; if (zoneSolid(x1 + (x2 - x1) * k, z1 + (z2 - z1) * k, 0.05, 1.6)) return true; }
    return false;
  };
  const voiceChat = createVoiceChat({
    online, audio, zone: ZONE.id,
    peers: () => shownPeers.map((q) => ({ id: String(q.id).replace(/^v:/, ''), x: q.x, z: q.z, name: q.name })),
    me: () => (view ? view.self : null),
    walls: voiceWalls,
    store: { get: () => readStored('pcw-voice-v1'), set: (value) => writeStored('pcw-voice-v1', value) },
  });
  let voiceUI = null;
  // The real weather where the player is: asked of the site's server now and every twenty minutes. The server
  // asks the Norwegian Meteorological Institute, for the approximate place the connection comes from (worked
  // out by the host; nothing is asked of the player, and nothing is kept about where they are). Where there is
  // no server, or no answer, the town keeps weather of its own.
  async function fetchWeather() {
    if (!online.available || !REAL_CLOCK) return;
    const answer = await online.ask('world.weather', {}, { timeout: 9000 });
    if (!answer.ok || !answer.weather) return;
    realWeather = answer.weather;
    if (host.game.realTime) host.game.setWeather(realWeather.kind);
  }
  setTimeout(fetchWeather, 1500);
  setInterval(fetchWeather, 20 * 60 * 1000);
  const confirm = createConfirm();
  const savedNow = () => (playerId ? { host: host.save(), playerId } : null);
  const accountMark = () => readStored(ACCOUNT_KEY);
  // The player's wallet: the bank's figure, and this world's own wallet kept in line with it (client/wallet.js).
  const walletClient = createWallet({
    online, bank: () => (playerId ? host.bank : null), playerId: () => playerId,
    saveNow: () => accountSync.upload(), saveSoon: () => accountSync.soon(),
    notify: (event) => walletNote(event),
    seen: {
      get: () => { const all = readStored(SEEN_KEY) || {}; const user = online.account ? online.account.username.toLowerCase() : null; return user && Number.isSafeInteger(all[user]) ? all[user] : null; },
      set: (value) => { const user = online.account ? online.account.username.toLowerCase() : null; if (!user) return; const all = readStored(SEEN_KEY) || {}; all[user] = value; writeStored(SEEN_KEY, all); },
    },
  });
  const market = createMarket({
    online, zone: ZONE.id, bridge: () => (playerId ? host.market : null), playerId: () => playerId,
    notify: (event) => marketNote(event), saveSoon: () => accountSync.soon(),
    saveNow: () => accountSync.upload(), wallet: () => walletClient,
  });
  // The character leaves this device: it was erased, or its player has logged out.
  function forgetCharacter(why) {
    clearSave(); playing = false; gallery = false; exited = false; exitNote = ''; ui.close(); if (why !== 'erased') walletClient.reset(); showStart(true); route();
  }
  const accountSync = createAccountSync({
    online, pack: packSave, unpack: unpackSave, read: savedNow,
    adopt: (saved, why) => adoptCharacter(saved, why),
    forget: (why) => forgetCharacter(why),
    summary: () => { const self = host.game.view(playerId).self; return { name: self.name, figure: self.look && self.look.figure ? self.look.figure : '' }; },
    applied: () => market.applied(),
    wallet: () => walletClient,
    // (the username is kept as its owner writes it too, to be shown when there is no connection to ask)
    mark: { get: accountMark, set: (value) => { if (value) { const before = accountMark(); const shown = online.signedIn && online.account.username.toLowerCase() === value.user ? online.account.username : before && before.user === value.user && before.name ? before.name : value.user; writeStored(ACCOUNT_KEY, { ...value, name: shown }); } else { try { localStorage.removeItem(ACCOUNT_KEY); } catch (error) { /* nothing kept */ } } } },
    notify: (event) => {
      if (event.type === 'newer') ui.toast({ type: 'note', text: 'This character has been played on another device since. The newer one has been loaded.' });
      if (event.type === 'erased') ui.toast({ type: 'note', text: 'This saved game was erased from another device. A new journey begins here.' });
    },
  });
  // The character kept with the account becomes the one played here. One that belonged to no account is put
  // aside on this device, not lost.
  function adoptCharacter(saved, why) {
    const next = newHost({ saved: saved.host });
    if (!next.game.hasPlayer(saved.playerId)) return false;
    if (why === 'account' && playerId) writeStored(`${SAVE_KEY}-guest`, { host: host.save(), playerId });
    const wasPlaying = playing;
    if (wasPlaying) ui.close();
    host = next; playerId = saved.playerId; known.clear();
    writeStored(SAVE_KEY, { host: host.save(), playerId });
    characterTrouble = '';
    if (wasPlaying) enterWorld(); else { showStart(false); route(); }
    return true;
  }
  // Signed in, the other players in town are those the server knows of; signed out, there are none. And on the
  // website nobody is in town signed out: a session that has ended (signed out on another device, or thirty
  // days gone by) puts the character away on this device and asks for the account again.
  function onlineChanged() {
    if (!online.available) return;
    const want = online.signedIn;
    if (want && !(transport && (transport.kind === 'web' || transport.kind === 'twin'))) { transport = { kind: 'web', make: () => createWebTransport({ online, zone: ZONE.id, visible: () => !document.hidden, gun: gunNet, voice: voiceChat }) }; if (playing) relink(); }
    if (!want && transport && transport.kind === 'web') { transport = null; if (playing) relink(); }
    if (!want) { market.reset(); ui.signedOut(); if (voiceChat.active) voiceChat.stop(); }
    else if (playing && voiceUI) voiceUI.wakeIfAllowed();
    if (online.status().state === 'out') {
      walletClient.reset();
      if (playing || gallery) {
        writeStored(SAVE_KEY, { host: host.save(), playerId });
        playing = false; gallery = false; ui.close(); showStart(false);
        accountUI.why('You have been signed out', 'Log in to carry on. Your character is kept with your account, and on this device as you left it.');
      }
    }
    accountUI.draw();
    route();
  }
  // What the bank has told this device since it last looked: TR that has arrived, and the like.
  function walletNote(event) {
    const say = (text) => ui.toast({ type: 'note', text });
    if (event.type === 'received') { say(`${trText(event.amount)} received from ${event.other}.${event.note ? ` "${event.note}"` : ''}`); audio.chime('paid'); }
    else if (event.type === 'sold') { say(`Sold: ${event.what || 'something of yours'}. ${trText(event.amount)} is in your wallet.`); audio.chime('paid'); ui.marketStale(); refreshDealMarkers(); }
    else if (event.type === 'bought') { say(`Bought: ${event.what || 'something'}, for ${trText(event.amount)}. It is in Property on your phone.`); audio.chime('paid'); ui.marketStale(); refreshDealMarkers(); }
    else if (event.type === 'returned') say(`Your offer${event.what ? ` for ${event.what}` : ''} came to nothing. ${trText(event.amount)} is back in your wallet.`);
    else if (event.type === 'unpaid') say(`${trText(event.amount)} of what this game says was spent on things to own was not taken by the bank: only TR you have earned buys them, and there was not enough. Your balance is the bank's figure.`);
    else if (event.type === 'refused') say(`The bank did not take ${trText(event.amount)} of what this game says was earned in town: it was more than could have been earned in the time. Your balance is the bank's figure.`);
    ui.walletStale();
    refreshView();
  }
  function marketNote(event) {
    const say = (text) => ui.toast({ type: 'note', text });
    if (event.type === 'sold') { say(`Sold: ${event.what}. ${trText(event.amount)} is in your wallet.`); audio.chime('paid'); ui.marketStale(); refreshDealMarkers(); }
    else if (event.type === 'bought') { say(`Bought: ${event.what}, for ${trText(event.amount)}. It is in Property on your phone.`); audio.chime('paid'); ui.marketStale(); refreshDealMarkers(); market.mine(); }
    else if (event.type === 'returned') say(`Your offer for ${event.what} came to nothing. ${trText(event.amount)} is back in your wallet.`);
    else if (event.type === 'owing') say(`You owe ${trText(event.amount)} for ${event.what} and do not have it. It is paid as soon as you do.`);
    else if (event.type === 'offer') { say('Someone has made an offer for something you are selling. Open Property on your phone.'); audio.chime('alert'); ui.marketStale(); }
    else if (event.type === 'message') { say('A message about something for sale. Open Property on your phone.'); audio.chime('tap'); ui.marketStale(); }
    refreshView();
  }

  // Where things are sold: a pink column at every open listing in this town, the kind one steps into. Stepping
  // in is how a buyer begins to deal: the screen goes to black and comes back on the conversation.
  const dealMarkers = new Map();     // listing id -> { listing, marker, x, z, armed }
  let dealListAt = -1e9;
  let fading = false;
  async function refreshDealMarkers() {
    // only of a server that has answered: one that cannot be reached, or has no market, is not asked again and again
    if (!online.available || !['in', 'out'].includes(online.status().state)) return;
    dealListAt = clock;
    const answer = await market.all();
    if (!answer.ok) return;
    const wanted = new Set();
    for (const l of market.state.all) {
      if (l.place.zone !== ZONE.id) continue;
      // PostCivilWar PowerBike's motorcycles are sold in its hall: the one pink column before its doors is its own
      // (render-powerbike.js), and none is put up for each of them
      if (l.shop === POWERBIKE.shop) continue;
      // nor for the Post Civil War Car Showroom's cars, sold in its hall, which is walked into by its doors
      if (l.shop === CARSHOW.shop) continue;
      // nor for the Post Civil War Sports Mall's things, the same way
      if (l.shop === SPORTS_MALL.shop) continue;
      const shop = l.shop ? zoneShop(l.shop) : null;
      const at = shop ? shop.marker : l.place;
      wanted.add(l.id);
      const had = dealMarkers.get(l.id);
      if (had) { had.listing = l; continue; }
      const marker = makeDealMarker();
      marker.group.position.set(at.x, 0, at.z);
      scene.add(marker.group);
      dealMarkers.set(l.id, { listing: l, marker, x: at.x, z: at.z, armed: Math.hypot(at.x - predicted.x, at.z - predicted.z) > marker.radius + 0.9 });
    }
    for (const [id, m] of dealMarkers) if (!wanted.has(id)) { scene.remove(m.marker.group); m.marker.dispose(); dealMarkers.delete(id); }
  }
  function enterDeal(m) {
    const l = m.listing;
    if (!online.signedIn) { accountUI.open('signup', `To buy from ${l.seller} you need an account.`); return; }
    if (l.mine) { ui.toast({ type: 'note', text: 'This is your own marker. A buyer who steps into it will write to you: look under Conversations in Property on your phone.' }); return; }
    fading = true;
    controls.release(); input.keys.clear();
    $('fade').classList.add('on');
    setTimeout(() => {
      // face whoever is selling: the shop's own attendant, if it has one and is drawn (ZONE_CAST)
      const shop = l.shop ? zoneShop(l.shop) : null;
      if (shop && shop.attendant && ZONE_CAST.shopAttendants && playing) {
        predicted.heading = Math.atan2(shop.attendant.x - predicted.x, shop.attendant.z - predicted.z);
        server.send({ type: 'move', x: predicted.x, z: predicted.z, heading: predicted.heading, run: false });
        // the eye stands behind and to one side, so that both of them and the shop are in the picture
        cam.yaw = predicted.heading - 0.6; cam.pitch = 0.12; cam.dist = 6.2; cam.back = true;
      }
      if (playing) ui.openDeal({ listing: l.id, at: { x: predicted.x, z: predicted.z } });
      setTimeout(() => { $('fade').classList.remove('on'); fading = false; }, 280);
    }, 340);
  }
  function tickDealMarkers(dt) {
    if (online.available && playing && !document.hidden && clock - dealListAt > (dealMarkers.size ? 120 : 60)) refreshDealMarkers();
    const self = view ? view.self : null;
    const onFoot = playing && self && !self.driving && !self.riding && !self.astride && !self.swimming && !self.dead && !self.down && !self.carried && !self.law.arrest && !self.fight;
    for (const m of dealMarkers.values()) {
      const far = Math.hypot(m.x - predicted.x, m.z - predicted.z);
      m.marker.group.visible = playing && far < 260;
      if (far < 90) m.marker.tick(dt);
      if (far > m.marker.radius + 0.9) m.armed = true;
      else if (far < m.marker.radius - 0.2 && m.armed && onFoot && !ui.isOpen() && !fading && !accountUI.isOpen) { m.armed = false; enterDeal(m); }
    }
  }
  // A shop's own person, standing where the shop says: there to be seen and faced; the dealing is on the phone. (None is
  // drawn since 22 October 2026, ZONE_CAST: the dealing is on the phone as it was.)
  let shopActors = [];
  townSteps.push(['the shopkeepers', () => {
    shopActors = (ZONE_CAST.shopAttendants ? ZONE_SHOPS.filter((shop) => shop.attendant) : []).map((shop) => {
      const actor = makeCharacter(shop.attendant.look, shop.attendant.name, false, 1);
      actor.group.position.set(shop.attendant.x, 0, shop.attendant.z);
      actor.group.rotation.y = shop.attendant.facing;
      actor.group.visible = false;
      scene.add(actor.group);
      return { shop, actor };
    });
  }]);
  function tickShopActors(dt) {
    for (const s of shopActors) {
      const far = Math.hypot(s.shop.attendant.x - predicted.x, s.shop.attendant.z - predicted.z);
      s.actor.group.visible = playing && far < 170;
      if (!s.actor.group.visible || far > 70) continue;
      // they turn a little towards someone who comes close
      const want = far < 9 ? Math.atan2(predicted.x - s.shop.attendant.x, predicted.z - s.shop.attendant.z) : s.shop.attendant.facing;
      let turn = (want - s.actor.group.rotation.y) % (Math.PI * 2); if (turn > Math.PI) turn -= Math.PI * 2; if (turn < -Math.PI) turn += Math.PI * 2;
      s.actor.group.rotation.y += turn * Math.min(1, dt * 3);
      animateCharacter(s.actor, dt, 0, false);
      showName(s.actor, far < 8, dt);
    }
  }
  // ---- PostCivilWar PowerBike ----
  // The motorcycle showroom beside HOLARIS (atani-powerbike.js says where everything is; render-powerbike.js draws
  // it): its one pink column, which takes a player in; the hall, where the fifteen motorcycles stand; the mat by the
  // doors, which takes them out again; Obi, the salesman (salesman.js); and asking him about a motorcycle, which is
  // the market's own conversation on the phone (ui-market.js) while the two of them talk face to face in the hall.
  let powerbike = null, salesmanActor = null;
  const salesman = createSalesman();
  townSteps.push(['the motorcycle showroom', () => {
  powerbike = buildPowerbike(scene, { lite: LITE, renderer, maxTexture: pictureSize('tower', { lite: LITE, most: renderer.capabilities.maxTextureSize }) });
  // one of the game's own figures, dressed for the showroom floor: a white shirt, a dark red tie, dark trousers (not drawn
  // since 22 October 2026, ZONE_CAST: the owner's own model of him is to come; asking about a motorcycle is on the phone)
  if (!ZONE_CAST.showroomStaff) return;
  salesmanActor = makeCharacter({ body: 'm', skin: 0x4a2c17, build: 1, wear: { outfit: 'shirt', hair: 'fade', face: 83, extras: ['tie', 'belt', 'watch'], colours: { top: 0xf5f6f8, accent: 0x8c1d2c, bottom: 0x1e2229, shoe: 0x141210, button: 0xdcdcdc, frame: 0xb9bec4 } } }, POWERBIKE.salesman, true, 1);
  salesmanActor.group.visible = false;
  scene.add(salesmanActor.group);
  }]);
  const HALL_ROOM = Object.freeze({ x0: POWERBIKE.hall.x0, z0: POWERBIKE.hall.z0, x1: POWERBIKE.hall.x1, z1: POWERBIKE.hall.z1, top: POWERBIKE.hall.ceiling });
  const HALL_VIEW = Object.freeze({ pitch: 0.04, maxPitch: 1.05, dist: 7.5 });
  const HALL_SIGHT = 60;            // metres of the town drawn while the player is in the hall (what its glass front shows)
  const showroom = {
    inside: false,             // the player is in the hall
    armed: true,               // the column takes them in (once they have stepped out of it)
    talk: null,                // asking the salesman about a motorcycle: { bike, since, listing }
    amount: 0,                 // how much of that conversation shows on the player's figure (eased in and out)
    lines: [],                 // who says what when, for the hands and heads: [{ who: 'me' | 'him', from, to }] (seconds)
    turnSent: -10,             // when the player's turn toward him was last told to the town
    him: { amount: 0, speaking: 0 },
    peers: new Map(),          // other players asking him about a motorcycle: id -> { amount, seed }
    welcomed: false,           // the player has been told how the showroom works
  };
  const nowSeconds = () => Date.now() / 1000;          // the wall clock: the same on every device
  // Everyone in the hall, the player and anyone else, as the salesman sees them (the same on every device)
  function hallCustomers() {
    const out = [];
    if (view && inPowerbikeHall(predicted.x, predicted.z)) out.push({ id: `p:${playerId}`, x: predicted.x, z: predicted.z, heading: predicted.heading, talking: showroom.talk ? showroom.talk.bike : null, since: showroom.talk ? showroom.talk.since : 0 });
    for (const q of (view && view.players) || []) if (inPowerbikeHall(q.x, q.z)) out.push({ id: `p:${q.id}`, x: q.x, z: q.z, heading: q.heading, talking: q.talk ? q.talk.bike : null, since: q.talk ? q.talk.since : 0 });
    return out;
  }
  // In or out: the screen goes dark, the simulation sets the player down inside the doors (or outside beside the
  // column), and the screen comes back on the hall (or the street)
  function goShowroom(way) {
    if (fading) return;
    fading = true;
    controls.release(); input.keys.clear();
    $('fade').classList.add('on');
    setTimeout(() => {
      const r = playing ? server.send({ type: way === 'in' ? 'showroom.in' : 'showroom.out' }) : { ok: false };
      if (r.ok) {
        predicted.x = r.x; predicted.z = r.z; predicted.heading = r.heading;
        if (me) me.group.position.set(r.x, zoneGroundY(r.x, r.z), r.z);
        // the eye behind them, looking the way they face: into the hall, or out at the town
        cam.yaw = r.heading; cam.pitch = way === 'in' ? 0.14 : STREET.pitch; cam.dist = way === 'in' ? 6.2 : cam.own; cam.back = false;
        cam.target.set(r.x, 1.55 + zoneGroundY(r.x, r.z), r.z);
        rig.snap(cam);
        refreshView();
        audio.chime(way === 'in' ? 'ok' : 'tap');
        if (way === 'in' && !showroom.welcomed) { showroom.welcomed = true; ui.toast({ type: 'note', text: ZONE_CAST.showroomStaff ? `${POWERBIKE.name}. Walk up to any motorcycle to ask ${POWERBIKE.salesman}, the salesman, about it. The mat by the doors takes you back out.` : `${POWERBIKE.name}. Walk up to any motorcycle to ask about it: the conversation opens on your phone. The mat by the doors takes you back out.` }); }
      } else if (r.message) ui.toast({ type: 'note', text: r.message });
      setTimeout(() => { $('fade').classList.remove('on'); fading = false; }, 320);
    }, 360);
  }
  const showroomListing = (bike) => market.state.all.find((l) => l.shop === POWERBIKE.shop && l.asset && l.asset.model === `bike:${bike}`) || null;
  // Asking him about a motorcycle on the floor: the market's conversation about it opens on the phone, and he comes
  // to stand with the player by it
  async function askAbout(display) {
    const bike = POWER_BIKES[display.bike];
    if (!bike) return;
    if (!online.available) { ui.toast({ type: 'note', text: `${ZONE_CAST.showroomStaff ? POWERBIKE.salesman : POWERBIKE.name} sells these through the market every player shares, and this copy of the game cannot reach it: the ${bike.name} cannot be bought here.` }); return; }
    if (!online.signedIn) { accountUI.open('signup', `To buy the ${bike.name} you need an account.`); return; }
    let l = showroomListing(display.bike);
    if (!l) { await market.all(); l = showroomListing(display.bike); }
    if (!l) { ui.toast({ type: 'note', text: `The ${bike.name} is not on sale just now.` }); return; }
    if (!playing || !inPowerbikeHall(predicted.x, predicted.z)) return;
    showroom.talk = { bike: display.bike, since: host.game.state.real, listing: l.id };
    showroom.lines = [];
    ui.openDeal({ listing: l.id, at: { x: predicted.x, z: predicted.z } });
  }
  function endTalk() { showroom.talk = null; showroom.lines = []; }
  // What is said in that conversation, as it is said (ui-market.js): whoever said it speaks, with the hands, for as
  // long as it would take to say; the other listens. One after the other, never both at once.
  // (in the car showroom's hall, the conversation about a car, with whichever of the two sells it)
  function dealSaid({ from, body = '' }) {
    const talk = carshow.talk && carshow.inside ? carshow : showroom.talk ? showroom : null;
    if (!talk) return;
    const now = nowSeconds();
    const who = from === 'me' ? 'me' : 'him';
    const length = Math.min(who === 'me' ? 4.5 : 7.5, 1.1 + String(body).length * 0.045);
    const last = talk.lines.length ? talk.lines[talk.lines.length - 1].to : 0;
    const start = Math.max(now, last + 0.3);
    talk.lines.push({ who, from: start, to: start + length });
    if (talk.lines.length > 8) talk.lines.shift();
  }
  function speakingNow(now, lines = showroom.lines) {
    let mine = 0, his = 0;
    for (const l of lines) {
      if (now < l.from - 0.25 || now > l.to + 0.35) continue;
      const k = Math.max(0, Math.min(1, (now - l.from + 0.25) / 0.45, (l.to + 0.35 - now) / 0.45));
      if (l.who === 'me') mine = Math.max(mine, k); else his = Math.max(his, k);
    }
    const quiet = lines.length ? now - lines[lines.length - 1].to : 99;
    return { mine, his, quiet };
  }
  // the steady to and fro of a conversation nobody here can read (another player's with him): turns of a few seconds
  const turnOf = (t, seed) => { const u = Math.sin(t * 0.43 + seed) + 0.6 * Math.sin(t * 0.17 + seed * 2.1); return u > 0.25 ? 1 : u < -0.35 ? 0 : 0.35; };

  function tickShowroom(dt) {
    if (!playing || !view) { if (salesmanActor) salesmanActor.group.visible = false; powerbike.portal.group.visible = false; return; }
    const self = view.self;
    const inHall = inPowerbikeHall(predicted.x, predicted.z);
    if (inHall !== showroom.inside) {
      showroom.inside = inHall;
      powerbike.setInside(inHall);
      // coming into an empty hall he is at his desk and comes over; into a busy one, he is where he is for everyone
      if (inHall) { if (hallCustomers().length > 1) salesman.rejoin(); else salesman.home(); } else endTalk();
      soundTimer = 1;               // (what is drawn of the town, at once: only what the glass front shows, or all of it again)
    }
    powerbike.near(predicted.x, predicted.z);
    const c = POWERBIKE.portal, far = Math.hypot(c.x - predicted.x, c.z - predicted.z);
    powerbike.portal.group.visible = !inHall && far < 260;
    // the column, stepped into on foot: in; the mat inside the doors: out
    const onFoot = !self.driving && !self.riding && !self.astride && !self.swimming && !self.dead && !self.down && !self.carried && !self.law.arrest && !self.fight;
    if (far > c.radius + 0.9) showroom.armed = true;
    else if (!inHall && far < c.radius - 0.2 && showroom.armed && onFoot && !ui.isOpen() && !fading && !accountUI.isOpen) { showroom.armed = false; goShowroom('in'); }
    if (inHall && onFoot && !fading && !uiBlocks() && onPowerbikeExit(predicted.x, predicted.z)) { if (ui.isOpen()) ui.close(); endTalk(); goShowroom('out'); }
    // the conversation is over when it is closed
    if (showroom.talk && !ui.dealOpen()) endTalk();
    if (!inHall) { if (salesmanActor) salesmanActor.group.visible = false; return; }
    if (!salesmanActor) return;

    // the salesman: where he goes, the same on every device (salesman.js), and drawn there
    const customers = hallCustomers();
    const st = salesman.step(dt, { now: nowSeconds(), customers });
    const a = salesmanActor;
    a.group.visible = true;
    a.group.position.set(st.x, 0, st.z);
    a.group.rotation.y = st.heading;
    animateCharacter(a, dt, st.speed, false);
    standCharacter(a);
    showName(a, Math.hypot(st.x - predicted.x, st.z - predicted.z) < 7 && !showroom.talk, dt);
    // talking with someone (asking about a bike) or showing them one: his hands, his head and his body
    const withWho = st.with ? customers.find((q) => q.id === st.with) : null;
    const t = clock;
    let want = 0, speak = 0;
    if (withWho && st.speed < 0.35 && Math.hypot(withWho.x - st.x, withWho.z - st.z) < 3.4) {
      if (st.mode === 'talk') {
        want = 1;
        if (st.with === `p:${playerId}`) { const sp = speakingNow(nowSeconds()); speak = sp.his > 0 ? sp.his : sp.mine > 0 ? 0 : sp.quiet > 5 ? 0.3 * (0.5 + 0.5 * Math.sin(t * 0.6)) : 0.1; }
        else speak = 1 - turnOf(t, 3.7);
      } else if (st.mode === 'assist') { want = 0.65; speak = 0.45 + 0.35 * Math.sin(t * 0.5); }
      else if (st.mode === 'roam') { want = 0.4; speak = 0.3; }
    }
    showroom.him.amount += (want - showroom.him.amount) * Math.min(1, dt * (want > showroom.him.amount ? 2.5 : 4));
    showroom.him.speaking += (speak - showroom.him.speaking) * Math.min(1, dt * 5);
    if (showroom.him.amount > 0.01) talkGesture(a, { t, amount: showroom.him.amount, speaking: showroom.him.speaking, look: withWho ? angleGap(Math.atan2(withWho.x - st.x, withWho.z - st.z), st.heading) : 0 });
  }
  // The player's own figure while asking about a motorcycle: turned to him (the town is told now and then, so that
  // other players see it), speaking with the hands when they have written something, listening when he answers.
  function tickTalkPose(dt, speed) {
    if (!ZONE_CAST.showroomStaff) return;
    const want = showroom.talk && showroom.inside && speed < 0.3 && !ui.calling() ? 1 : 0;
    showroom.amount += (want - showroom.amount) * Math.min(1, dt * (want ? 2.5 : 6));
    if (showroom.amount < 0.01 || !me) return;
    const s = salesman.state;
    const toHim = Math.atan2(s.x - predicted.x, s.z - predicted.z);
    if (want && speed < 0.05 && !led()) {
      predicted.heading += angleGap(toHim, predicted.heading) * Math.min(1, dt * 3);
      if (clock - showroom.turnSent > 0.6 && Math.abs(angleGap(predicted.heading, view.self.heading)) > 0.06) { showroom.turnSent = clock; server.send({ type: 'move', x: predicted.x, z: predicted.z, heading: predicted.heading, run: false }); }
    }
    const sp = speakingNow(nowSeconds());
    talkGesture(me, { t: clock + 7.3, amount: showroom.amount, speaking: sp.mine, look: angleGap(toHim, me.group.rotation.y) });
  }
  // Other players asking him about a motorcycle: turned to him, and talking with him by turns
  function tickPeerTalk(dt) {
    if (!ZONE_CAST.showroomStaff) return;
    const s = salesman.state;
    const seen = new Set();
    if (showroom.inside) for (const q of shownPeers) {
      if (!q.talk || !inPowerbikeHall(q.x, q.z)) continue;
      const rig = crowd.rigOf(`p:${q.id}`);
      if (!rig) continue;
      seen.add(q.id);
      let p = showroom.peers.get(q.id);
      if (!p) { p = { amount: 0, seed: (String(q.id).length * 7.13) % 6.28 }; showroom.peers.set(q.id, p); }
      p.amount += (1 - p.amount) * Math.min(1, dt * 2.5);
      talkGesture(rig, { t: clock + p.seed * 3, amount: p.amount, speaking: turnOf(clock, 3.7), look: angleGap(Math.atan2(s.x - rig.group.position.x, s.z - rig.group.position.z), rig.group.rotation.y) });
    }
    for (const id of showroom.peers.keys()) if (!seen.has(id)) showroom.peers.delete(id);
  }
  // In the conversation the eye stands where it sees the two of them, side on, a little behind the player (the
  // picture is moved over by the phone's width, so that neither is behind the phone). A drag looks about as usual.
  function frameTalk(dt) {
    if (!ZONE_CAST.showroomStaff) return;
    if (!showroom.talk || !showroom.inside || showroom.amount < 0.05) return;
    const s = salesman.state;
    const mx = (predicted.x + s.x) / 2, mz = (predicted.z + s.z) / 2;
    const toHim = Math.atan2(s.x - predicted.x, s.z - predicted.z);
    const k = Math.min(1, dt * 2.2) * showroom.amount;
    if (clock - cam.lastDrag > 2.5) {
      cam.yaw += angleGap(toHim + 1.3, cam.yaw) * k;
      cam.pitch += (0.1 - cam.pitch) * k;
      cam.dist += (4.4 - cam.dist) * k;
    }
    cam.target.lerp(camGoal.set(mx, 1.42 + zoneGroundY(mx, mz), mz), Math.min(1, dt * 4) * showroom.amount);
  }

  // ---- the Post Civil War Car Showroom ----
  // The compound on the Kwale road (asaba-carshow.js says where everything is; render-carshow.js draws it): its gate,
  // which slides open for whoever comes to it; the showroom's glass doors, which take a player in; the hall, where the
  // twenty cars stand; the mat inside the doors, which takes them out again; Tochi and Oluchi, who sell the cars, each
  // looking after one side of the floor (salesman.js); and asking one of them about a car, which is the market's own
  // conversation on the phone (ui-market.js) while the two of them talk face to face in the hall.
  let carshowView = null, supplied = null, townBuildings = null;
  townSteps.push(['the car showroom', () => { carshowView = buildCarshow(scene, { lite: LITE, renderer, maxTexture: pictureSize('building', { lite: LITE, most: renderer.capabilities.maxTextureSize }) }); }]);
  // The Post Civil War Sports Mall beside it (asaba-sports.js; render-sports.js draws it): made the first time it is
  // asked for (by someone near, or once the town is warm), its things in its hall as the player comes in
  let sportsView = null;
  townSteps.push(['the sports mall', () => { sportsView = buildSports(scene, { lite: LITE, renderer }); }]);
  townSteps.push(['the owner\'s buildings and vehicles', () => {
    // The owner's vehicles of 17 October 2026 (render-supplied.js): the jet at the airport, the trucks at the store and
    // the block yard, each fetched as someone comes near it; and the ambulance's model, put on the hospital's van.
    supplied = createSupplied(scene, { lite: LITE, maxTexture: pictureSize('supplied', { lite: LITE, most: renderer.capabilities.maxTextureSize }), env: LITE ? null : vehicleEnvironment() });
    // The owner's houses and towers (render-town-buildings.js), in place of the town's plain houses and on the city side
    townBuildings = createTownBuildings(scene, { lite: LITE, maxTexture: pictureSize('building', { lite: LITE, most: renderer.capabilities.maxTextureSize }), env: LITE ? null : vehicleEnvironment() });
  }]);
  // The road up the river and the habitation at its far end (render-habitation.js, 20 October 2026): nothing of it is
  // drawn or fetched until the player goes up the road (the river and the road beyond the town a little way out; the
  // habitation itself, and the owner's models in it, once they are well on the way), and it is all let go again when
  // they come back. Its fish, birds and fireflies (render-habitation-life.js) live while it is there.
  let habitation = null, habitationLife = null, torchBeams = null, habitationTold = false;
  // Its code (render-habitation.js and its kin, habitation-code.js) is not in the game's script: on the website it is a
  // script of its own, asked for once the town is up and warmed, or at once for someone on the road north (21 October
  // 2026: carried in the game's script, it made PLAY a second later on a slow phone connection). Until it has come,
  // nothing of the habitation is drawn; one that could not be fetched is asked for again half a minute later.
  let habitationKit = null, habitationAsked = false, habitationRetryAt = 0, habitationKept = false;
  const partNotRead = (error, what) => { console.warn('PostCivilWar: part of the habitation could not be read', what || '', error && error.message ? error.message : error); if (!habitationTold) { habitationTold = true; ui.toast({ type: 'note', text: 'Part of the habitation could not be fetched. Check the connection.' }); } };
  function askForHabitation() {
    habitationAsked = true;
    new Promise((resolve, reject) => {
      if (window.__pcwHabitationCode) { resolve(window.__pcwHabitationCode); return; }
      const script = document.createElement('script');
      script.src = (window.__PCW_FILES && window.__PCW_FILES.habitation) || 'habitation-code.js';
      script.async = true;
      script.onload = () => (window.__pcwHabitationCode ? resolve(window.__pcwHabitationCode) : reject(new Error('its script did not start')));
      script.onerror = () => { script.remove(); reject(new Error('its script could not be fetched')); };
      document.head.appendChild(script);
    }).then((kit) => {
      if (habitation) return;
      habitationKit = kit;
      habitation = kit.createHabitation(scene, { lite: LITE, renderer, riverMaterial: world.waterMaterial, onError: partNotRead });
    }, (error) => {
      // (asked for again in half a minute; told once, only to someone already on the road north)
      habitationAsked = false; habitationRetryAt = performance.now() + 30000;
      if (playing && habitationAway(predicted.x, predicted.z) < 200) partNotRead(error, 'its drawing');
    });
  }
  townSteps.push(['the road up the river', () => {
    // other players' torches, seen as beams (torch-beams.js)
    torchBeams = createTorchBeams(scene, { lite: LITE });
  }]);
  // the birds that have sung, waiting to be heard (audio.js takes them as it plays them)
  const habitatCalls = [];
  // who is in the habitation now, for its fish and birds (and their footprints in its sand)
  function habitationPeople() {
    const b = HABITATION.bounds, out = [];
    const near = (x, z) => x > b.x0 - 10 && x < b.x1 + 10 && z > b.z0 - 10 && z < b.z1 + 10;
    if (playing && view && near(predicted.x, predicted.z)) out.push({ key: 'me', x: predicted.x, z: predicted.z, y: zoneGroundY(predicted.x, predicted.z), riding: !!(view.self.driving || view.self.incar || view.self.astride || view.self.riding) });
    if (playing) for (const q of shownPeers) if (near(q.x, q.z)) out.push({ key: `p:${q.id}`, x: q.x, z: q.z, y: zoneGroundY(q.x, q.z), riding: !!(q.vehicle || q.ride || q.car) });
    return out;
  }
  // What is heard of the habitation from where the player is (audio.js habitatSounds): its waterfalls, the nearest
  // stream, the lagoon's edge, the frogs by the water, the wind; worked out a few times a second.
  const HABITAT_FALLS = HABITATION_FALLS.map((f) => ({ id: f.id, x: f.foot[0], y: f.foot[2], z: f.foot[1], size: f.id === 'big' ? 1 : f.id === 'thin' ? 0.35 : 0.7 }));
  // (the frogs' places: round the edges of the lagoon, the swamp and the pools, and along the gorge's stream)
  const HABITAT_FROGS = (() => {
    const kinds = ['tree', 'ribbit', 'bull', 'ribbit'];
    const out = [];
    for (const w of HABITATION_WATERS) w.outline.forEach(([x, z], i) => out.push({ x, z, kind: w.kind === 'swamp' ? kinds[(i + 2) % 3] : kinds[i % kinds.length] }));
    for (const st of HABITATION_STREAMS) if (!st.rapids && !st.deep) st.line.forEach(([x, z], i) => out.push({ x, z, kind: i % 2 ? 'tree' : 'ribbit' }));
    return out;
  })();
  const habitatHeard = { at: -1, value: null };
  const lookAhead = new THREE.Vector3();
  // How far into the habitation's wild a point is: 0 in the town, 1 in the habitation (its nights darker, its air
  // clearer, its own sounds). Since 21 October 2026 it is at the end of the town's road: from its own edge, 80 m.
  const wildAt = (x, z) => { const b = HABITATION.bounds; return Math.max(0, Math.min(1, (x - (b.x0 - 80)) / 80, Math.min(z - (b.z0 - 80), b.z1 + 80 - z) / 80)); };
  function habitatSound() {
    if (!habitation || !playing || !view) return null;
    const x = predicted.x, z = predicted.z;
    const wild = wildAt(x, z);
    if (wild <= 0) return null;
    if (habitatHeard.value && clock - habitatHeard.at < 0.25) { habitatHeard.value.night = night; return habitatHeard.value; }
    habitatHeard.at = clock;
    // the nearest point of any stream, within 50 m
    let stream = null, best = 50;
    for (const st of HABITATION_STREAMS) for (let i = 0; i + 1 < st.line.length; i += 1) {
      const [ax, az] = st.line[i], [bx, bz] = st.line[i + 1], dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
      const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)), px = ax + dx * u, pz = az + dz * u, d = Math.hypot(px - x, pz - z);
      if (d < best) { best = d; const h0 = st.heights[i], h1 = st.heights[i + 1] !== undefined ? st.heights[i + 1] : h0; stream = { x: px, y: h0 + (h1 - h0) * u, z: pz, rapids: !!st.rapids }; }
    }
    // how far it is to the lagoon's (or a pool's) edge, looked for round the player
    let shore = 99;
    const wet = (w) => w && (w.id === 'lagoon' || w.kind === 'pool');
    if (wet(habitationWaterAt(x, z))) shore = 0;
    else for (const r of [4, 10, 20, 30]) { for (let k = 0; k < 8 && shore === 99; k += 1) { const a = (k / 8) * Math.PI * 2; if (wet(habitationWaterAt(x + Math.cos(a) * r, z + Math.sin(a) * r))) shore = r; } if (shore !== 99) break; }
    const frogs = HABITAT_FROGS.filter((f) => Math.hypot(f.x - x, f.z - z) < 70).sort((p, q) => Math.hypot(p.x - x, p.z - z) - Math.hypot(q.x - x, q.z - z)).slice(0, 4);
    const t = habitationKit.habitationWind();
    // the boiling river: its nearest water, within 120 m (21 October 2026)
    const hn = hotRiverNear(x, z);
    const hot = hn.d < 120 ? (() => { const L = HABITATION_HOT_RIVER.line, [ax, az] = L[hn.seg], [bx, bz] = L[hn.seg + 1]; return { x: ax + (bx - ax) * hn.t, y: hn.level, z: az + (bz - az) * hn.t, d: hn.d }; })() : null;
    habitatHeard.value = { wild, calls: habitatCalls, falls: HABITAT_FALLS, stream, shore, frogs, hot, gust: 0.55 + 0.45 * Math.sin(t * 0.21), night };
    return habitatHeard.value;
  }
  // two of the game's own figures, dressed for the showroom floor: a white shirt and a navy tie; a white blouse and a
  // navy skirt
  const CAR_STAFF_LOOKS = Object.freeze({
    tochi: { body: 'm', skin: 0x5b3a22, build: 1, wear: { outfit: 'shirt', hair: 'low', face: 31, extras: ['tie', 'belt', 'watch'], colours: { top: 0xf5f6f8, accent: 0x1d3557, bottom: 0x23262c, shoe: 0x141210, button: 0xdcdcdc, frame: 0xb9bec4 } } },
    oluchi: { body: 'f', skin: 0x6b4226, build: 1, wear: { outfit: 'shirt-skirt', hair: 'bun', face: 64, extras: ['watch'], colours: { top: 0xf5f6f8, bottom: 0x1d3557, shoe: 0x141210 } } },
  });
  let carSalesmen = [];
  townSteps.push(['the car showroom\'s staff', () => {
    carSalesmen = CARSHOW.salesmen.map((spec) => {
      // (not drawn since 22 October 2026, ZONE_CAST: the owner's own models of them are to come; who sells which car,
      // and asking about it on the phone, are as they were)
      const actor = ZONE_CAST.showroomStaff ? makeCharacter(CAR_STAFF_LOOKS[spec.id], spec.name, true, 1) : null;
      if (actor) { actor.group.visible = false; scene.add(actor.group); }
      // each looks after the customers on their own side of the floor, and anyone asking about one of their cars
      const mine = (c) => (c.talking ? carshowSideOf(c.talking) === spec.side : carshowSideAt(c.x) === spec.side);
      return { spec, actor, sim: createSalesman({ floor: 'carshow', home: spec.home, round: spec.round, mine }), him: { amount: 0, speaking: 0 } };
    });
  }]);
  // who sells a car: the one whose side of the floor it stands on
  const sellerOf = (car) => carSalesmen.find((s) => s.spec.side === carshowSideOf(car)) || carSalesmen[0];
  const CAR_HALL_ROOM = Object.freeze({ x0: CARSHOW.hall.x0, z0: CARSHOW.hall.z0, x1: CARSHOW.hall.x1, z1: CARSHOW.hall.z1, top: CARSHOW.hall.ceiling });
  const carshow = {
    inside: false,             // the player is in the hall
    armed: true,               // the doors take them in (once they have stepped back from them)
    talk: null,                // asking about a car: { car, since, listing }
    seller: null,              // whom they are asking (one of carSalesmen; kept while the conversation eases out)
    amount: 0,                 // how much of that conversation shows on the player's figure
    lines: [],                 // who says what when: [{ who: 'me' | 'him', from, to }] (seconds)
    turnSent: -10,
    peers: new Map(),          // other players asking about a car: id -> { amount, seed }
    welcomed: false,
  };
  // Everyone in the hall, the player and anyone else, as the two of them see it (the same on every device)
  function carHallCustomers() {
    const out = [];
    if (view && inCarHall(predicted.x, predicted.z)) out.push({ id: `p:${playerId}`, x: predicted.x, z: predicted.z, heading: predicted.heading, talking: carshow.talk ? carshow.talk.car : null, since: carshow.talk ? carshow.talk.since : 0 });
    for (const q of (view && view.players) || []) if (inCarHall(q.x, q.z)) out.push({ id: `p:${q.id}`, x: q.x, z: q.z, heading: q.heading, talking: q.carTalk ? q.carTalk.car : null, since: q.carTalk ? q.carTalk.since : 0 });
    return out;
  }
  // In or out by the doors: the screen goes dark, the simulation sets the player down inside the doors (or outside
  // before them), and the screen comes back on the hall (or the forecourt)
  function goCarshow(way) {
    if (fading) return;
    fading = true;
    controls.release(); input.keys.clear();
    $('fade').classList.add('on');
    setTimeout(() => {
      const r = playing ? server.send({ type: way === 'in' ? 'carshow.in' : 'carshow.out' }) : { ok: false };
      if (r.ok) {
        predicted.x = r.x; predicted.z = r.z; predicted.heading = r.heading;
        if (me) me.group.position.set(r.x, zoneGroundY(r.x, r.z), r.z);
        cam.yaw = r.heading; cam.pitch = way === 'in' ? 0.14 : STREET.pitch; cam.dist = way === 'in' ? 6.2 : cam.own; cam.back = false;
        cam.target.set(r.x, 1.55 + zoneGroundY(r.x, r.z), r.z);
        rig.snap(cam);
        refreshView();
        audio.chime(way === 'in' ? 'ok' : 'tap');
        if (way === 'in' && !carshow.welcomed) { carshow.welcomed = true; ui.toast({ type: 'note', text: ZONE_CAST.showroomStaff ? `${CARSHOW.name}. Walk up to any car to ask about it: ${carSalesmen[0].spec.name} looks after the cars on your left as you come in, ${carSalesmen[1].spec.name} those on your right. The mat by the doors takes you back out.` : `${CARSHOW.name}. Walk up to any car to ask about it: the conversation opens on your phone. The mat by the doors takes you back out.` }); }
      } else if (r.message) ui.toast({ type: 'note', text: r.message });
      setTimeout(() => { $('fade').classList.remove('on'); fading = false; }, 320);
    }, 360);
  }
  const carListing = (car) => market.state.all.find((l) => l.shop === CARSHOW.shop && l.asset && l.asset.model === `car:${car}`) || null;

  // The Post Civil War Sports Mall (30 October 2026): in by its glass doors and out by the mat inside them, as at the
  // car showroom; a thing on its floor asked about on the phone, where Nkem, its saleswoman, answers
  const SPORTS_HALL_ROOM = Object.freeze({ x0: SPORTS_MALL.hall.x0, z0: SPORTS_MALL.hall.z0, x1: SPORTS_MALL.hall.x1, z1: SPORTS_MALL.hall.z1, top: SPORTS_MALL.hall.ceiling });
  const sports = {
    inside: false,             // the player is in the hall
    armed: true,               // the doors take them in (once they have stepped back from them)
    talk: null,                // asking about a thing on show: { item, since, listing }
    welcomed: false,
  };
  function goSports(way) {
    if (fading) return;
    fading = true;
    controls.release(); input.keys.clear();
    $('fade').classList.add('on');
    setTimeout(() => {
      const r = playing ? server.send({ type: way === 'in' ? 'sports.in' : 'sports.out' }) : { ok: false };
      if (r.ok) {
        predicted.x = r.x; predicted.z = r.z; predicted.heading = r.heading;
        if (me) me.group.position.set(r.x, zoneGroundY(r.x, r.z), r.z);
        cam.yaw = r.heading; cam.pitch = way === 'in' ? 0.14 : STREET.pitch; cam.dist = way === 'in' ? 6.2 : cam.own; cam.back = false;
        cam.target.set(r.x, 1.55 + zoneGroundY(r.x, r.z), r.z);
        rig.snap(cam);
        refreshView();
        audio.chime(way === 'in' ? 'ok' : 'tap');
        if (way === 'in' && !sports.welcomed) { sports.welcomed = true; ui.toast({ type: 'note', text: `${SPORTS_MALL.name}. Walk up to anything on show to ask about it: the conversation opens on your phone. The mat by the doors takes you back out.` }); }
      } else if (r.message) ui.toast({ type: 'note', text: r.message });
      setTimeout(() => { $('fade').classList.remove('on'); fading = false; }, 320);
    }, 360);
  }
  const sportListing = (item) => market.state.all.find((l) => l.shop === SPORTS_MALL.shop && l.asset && l.asset.model === `sport:${item}`) || null;
  async function askAboutSport(display) {
    const item = SPORTS[display.item];
    if (!item) return;
    if (!online.available) { ui.toast({ type: 'note', text: `${SPORTS_MALL.name} sells through the market every player shares, and this copy of the game cannot reach it: the ${item.name} cannot be bought here.` }); return; }
    if (!online.signedIn) { accountUI.open('signup', `To buy the ${item.name} you need an account.`); return; }
    let l = sportListing(display.item);
    if (!l) { await market.all(); l = sportListing(display.item); }
    if (!l) { ui.toast({ type: 'note', text: `The ${item.name} is not on sale just now.` }); return; }
    if (!playing || !inSportsHall(predicted.x, predicted.z)) return;
    sports.talk = { item: display.item, since: host.game.state.real, listing: l.id };
    ui.openDeal({ listing: l.id, at: { x: predicted.x, z: predicted.z } });
  }
  function tickSports() {
    if (!playing || !view || !sportsView) return;
    const self = view.self;
    const inHall = inSportsHall(predicted.x, predicted.z);
    if (inHall !== sports.inside) {
      sports.inside = inHall;
      sportsView.setInside(inHall);
      if (!inHall) sports.talk = null;
      soundTimer = 1;
    }
    sportsView.near(predicted.x, predicted.z);
    const onFoot = !self.driving && !self.riding && !self.astride && !self.incar && !self.swimming && !self.dead && !self.down && !self.carried && !self.law.arrest && !self.fight;
    const e = SPORTS_MALL.entry, far = Math.hypot(e.x - predicted.x, e.z - predicted.z);
    if (far > e.radius + 0.9) sports.armed = true;
    else if (!inHall && far < e.radius - 0.2 && sports.armed && onFoot && !ui.isOpen() && !fading && !accountUI.isOpen) { sports.armed = false; goSports('in'); }
    if (inHall && onFoot && !fading && !uiBlocks() && onSportsExit(predicted.x, predicted.z)) { if (ui.isOpen()) ui.close(); sports.talk = null; goSports('out'); }
    if (sports.talk && !ui.dealOpen()) sports.talk = null;
  }
  // Asking about a car on the floor: the market's conversation about it opens on the phone, and the one who sells it
  // comes to stand with the player by it
  async function askAboutCar(display) {
    const car = POWER_CARS[display.car];
    if (!car) return;
    const who = ZONE_CAST.showroomStaff ? sellerOf(display.car).spec.name : CARSHOW.name;
    if (!online.available) { ui.toast({ type: 'note', text: `${who} sells these through the market every player shares, and this copy of the game cannot reach it: the ${car.name} cannot be bought here.` }); return; }
    if (!online.signedIn) { accountUI.open('signup', `To buy the ${car.name} you need an account.`); return; }
    let l = carListing(display.car);
    if (!l) { await market.all(); l = carListing(display.car); }
    if (!l) { ui.toast({ type: 'note', text: `The ${car.name} is not on sale just now.` }); return; }
    if (!playing || !inCarHall(predicted.x, predicted.z)) return;
    carshow.talk = { car: display.car, since: host.game.state.real, listing: l.id };
    carshow.seller = sellerOf(display.car);
    carshow.lines = [];
    ui.openDeal({ listing: l.id, at: { x: predicted.x, z: predicted.z } });
  }
  function endCarTalk() { carshow.talk = null; carshow.lines = []; }

  function tickCarshow(dt) {
    if (!playing || !view) { for (const s of carSalesmen) if (s.actor) s.actor.group.visible = false; return; }
    const self = view.self;
    const inHall = inCarHall(predicted.x, predicted.z);
    if (inHall !== carshow.inside) {
      carshow.inside = inHall;
      carshowView.setInside(inHall);
      // coming into an empty hall they are at their desks and come over; into a busy one, they are where they are
      // for everyone
      if (inHall) { const busy = carHallCustomers().length > 1; for (const s of carSalesmen) { if (busy) s.sim.rejoin(); else s.sim.home(); } } else endCarTalk();
      soundTimer = 1;
    }
    carshowView.near(predicted.x, predicted.z);
    // the doors, walked up to on foot: in; the mat inside them: out
    const onFoot = !self.driving && !self.riding && !self.astride && !self.incar && !self.swimming && !self.dead && !self.down && !self.carried && !self.law.arrest && !self.fight;
    const e = CARSHOW.entry, far = Math.hypot(e.x - predicted.x, e.z - predicted.z);
    if (far > e.radius + 0.9) carshow.armed = true;
    else if (!inHall && far < e.radius - 0.2 && carshow.armed && onFoot && !ui.isOpen() && !fading && !accountUI.isOpen) { carshow.armed = false; goCarshow('in'); }
    if (inHall && onFoot && !fading && !uiBlocks() && onCarshowExit(predicted.x, predicted.z)) { if (ui.isOpen()) ui.close(); endCarTalk(); goCarshow('out'); }
    if (carshow.talk && !ui.dealOpen()) endCarTalk();
    if (!inHall) { for (const s of carSalesmen) if (s.actor) s.actor.group.visible = false; return; }
    if (!ZONE_CAST.showroomStaff) return;

    // the two of them: where each goes, the same on every device (salesman.js), and drawn there
    const customers = carHallCustomers();
    const t = clock;
    for (const s of carSalesmen) {
      const st = s.sim.step(dt, { now: nowSeconds(), customers });
      const a = s.actor;
      a.group.visible = true;
      a.group.position.set(st.x, 0, st.z);
      a.group.rotation.y = st.heading;
      animateCharacter(a, dt, st.speed, false);
      standCharacter(a);
      showName(a, Math.hypot(st.x - predicted.x, st.z - predicted.z) < 7 && !carshow.talk, dt);
      const withWho = st.with ? customers.find((q) => q.id === st.with) : null;
      let want = 0, speak = 0;
      if (withWho && st.speed < 0.35 && Math.hypot(withWho.x - st.x, withWho.z - st.z) < 3.4) {
        if (st.mode === 'talk') {
          want = 1;
          if (st.with === `p:${playerId}`) { const sp = speakingNow(nowSeconds(), carshow.lines); speak = sp.his > 0 ? sp.his : sp.mine > 0 ? 0 : sp.quiet > 5 ? 0.3 * (0.5 + 0.5 * Math.sin(t * 0.6)) : 0.1; }
          else speak = 1 - turnOf(t, 3.7);
        } else if (st.mode === 'assist') { want = 0.65; speak = 0.45 + 0.35 * Math.sin(t * 0.5 + s.spec.home.x); }
        else if (st.mode === 'roam') { want = 0.4; speak = 0.3; }
      }
      s.him.amount += (want - s.him.amount) * Math.min(1, dt * (want > s.him.amount ? 2.5 : 4));
      s.him.speaking += (speak - s.him.speaking) * Math.min(1, dt * 5);
      if (s.him.amount > 0.01) talkGesture(a, { t: t + s.spec.home.z, amount: s.him.amount, speaking: s.him.speaking, look: withWho ? angleGap(Math.atan2(withWho.x - st.x, withWho.z - st.z), st.heading) : 0 });
    }
  }
  // The player's own figure while asking about a car: turned to whoever sells it, speaking with the hands when they
  // have written something, listening when they are answered.
  function tickCarTalkPose(dt, speed) {
    if (!ZONE_CAST.showroomStaff) return;
    const want = carshow.talk && carshow.inside && speed < 0.3 && !ui.calling() ? 1 : 0;
    carshow.amount += (want - carshow.amount) * Math.min(1, dt * (want ? 2.5 : 6));
    if (carshow.amount < 0.01 || !me || !carshow.seller) return;
    const s = carshow.seller.sim.state;
    const toThem = Math.atan2(s.x - predicted.x, s.z - predicted.z);
    if (want && speed < 0.05 && !led()) {
      predicted.heading += angleGap(toThem, predicted.heading) * Math.min(1, dt * 3);
      if (clock - carshow.turnSent > 0.6 && Math.abs(angleGap(predicted.heading, view.self.heading)) > 0.06) { carshow.turnSent = clock; server.send({ type: 'move', x: predicted.x, z: predicted.z, heading: predicted.heading, run: false }); }
    }
    const sp = speakingNow(nowSeconds(), carshow.lines);
    talkGesture(me, { t: clock + 7.3, amount: carshow.amount, speaking: sp.mine, look: angleGap(toThem, me.group.rotation.y) });
  }
  // Other players asking about a car: turned to whoever sells it, talking by turns
  function tickCarPeerTalk(dt) {
    if (!ZONE_CAST.showroomStaff) return;
    const seen = new Set();
    if (carshow.inside) for (const q of shownPeers) {
      if (!q.carTalk || !POWER_CARS[q.carTalk.car] || !inCarHall(q.x, q.z)) continue;
      const rig = crowd.rigOf(`p:${q.id}`);
      if (!rig) continue;
      seen.add(q.id);
      const s = sellerOf(q.carTalk.car).sim.state;
      let p = carshow.peers.get(q.id);
      if (!p) { p = { amount: 0, seed: (String(q.id).length * 7.13) % 6.28 }; carshow.peers.set(q.id, p); }
      p.amount += (1 - p.amount) * Math.min(1, dt * 2.5);
      talkGesture(rig, { t: clock + p.seed * 3, amount: p.amount, speaking: turnOf(clock, 3.7), look: angleGap(Math.atan2(s.x - rig.group.position.x, s.z - rig.group.position.z), rig.group.rotation.y) });
    }
    for (const id of carshow.peers.keys()) if (!seen.has(id)) carshow.peers.delete(id);
  }
  // In the conversation the eye stands where it sees the two of them, side on, a little behind the player
  function frameCarTalk(dt) {
    if (!ZONE_CAST.showroomStaff) return;
    if (!carshow.talk || !carshow.inside || carshow.amount < 0.05 || !carshow.seller) return;
    const s = carshow.seller.sim.state;
    const mx = (predicted.x + s.x) / 2, mz = (predicted.z + s.z) / 2;
    const toThem = Math.atan2(s.x - predicted.x, s.z - predicted.z);
    const k = Math.min(1, dt * 2.2) * carshow.amount;
    if (clock - cam.lastDrag > 2.5) {
      cam.yaw += angleGap(toThem + 1.3, cam.yaw) * k;
      cam.pitch += (0.1 - cam.pitch) * k;
      cam.dist += (4.4 - cam.dist) * k;
    }
    cam.target.lerp(camGoal.set(mx, 1.42 + zoneGroundY(mx, mz), mz), Math.min(1, dt * 4) * carshow.amount);
  }

  // What to call a spot in town, for a listing made where its seller stands.
  function placeName(x, z) {
    const title = (text) => text.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
    let best = null;
    for (const b of ZONE_BUILDINGS) { if (!b.sign) continue; const d = Math.hypot(b.x - x, b.z - z) - Math.max(b.w, b.d) / 2; if (d < 26 && (!best || d < best.d)) best = { d, text: `Near ${title(b.sign)}` }; }
    if (!best) for (const r of ZONE_ROADS) { if (!r.name) continue; const d = Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1)); if (!best || d < best.d) best = { d, text: d < 8 ? r.name : `Off ${r.name}` }; }
    return best ? `${best.text}, ${ZONE.name}` : ZONE.name;
  }
  function goToListing(l) {
    if (l.shop === POWERBIKE.shop) {
      // one of PostCivilWar PowerBike's motorcycles: to its column, or, for someone already inside, to its stand
      const bike = String((l.asset && l.asset.model) || '').replace(/^bike:/, '');
      const stand = POWERBIKE.displays.find((d) => d.bike === bike);
      const inHall = inPowerbikeHall(predicted.x, predicted.z);
      const at = inHall && stand ? { x: stand.x + Math.sin(stand.h) * (stand.r + 1.2), z: stand.z + Math.cos(stand.h) * (stand.r + 1.2) } : POWERBIKE.portal;
      setWaypoint({ x: at.x, z: at.z, label: inHall ? l.name : POWERBIKE.name });
      ui.close();
      const ask = ZONE_CAST.showroomStaff ? `ask ${POWERBIKE.salesman} about it` : 'ask about it on your phone';
      ui.toast({ type: 'note', text: inHall ? `The ${l.name} is marked on the floor. Walk up to it to ${ask}.` : `${POWERBIKE.name} is marked, beside HOLARIS Watch. Follow the line on the map at the top left to the pink column before its doors and step into it: the ${l.name} is on the floor inside${ZONE_CAST.showroomStaff ? `, and ${POWERBIKE.salesman} the salesman will help you` : ''}.` });
      return;
    }
    if (l.shop === CARSHOW.shop) {
      // one of the car showroom's cars: to its doors, or, for someone already inside, to its stand
      const id = String((l.asset && l.asset.model) || '').replace(/^car:/, '');
      const stand = CARSHOW.displays.find((d) => d.car === id);
      const inHall = inCarHall(predicted.x, predicted.z);
      const at = inHall && stand ? { x: stand.x + Math.sin(stand.h) * (stand.r + 1.2), z: stand.z + Math.cos(stand.h) * (stand.r + 1.2) } : CARSHOW.entry;
      setWaypoint({ x: at.x, z: at.z, label: inHall ? l.name : CARSHOW.name });
      ui.close();
      const ask = ZONE_CAST.showroomStaff ? `ask ${sellerOf(id).spec.name} about it` : 'ask about it on your phone';
      ui.toast({ type: 'note', text: inHall ? `The ${l.name} is marked on the floor. Walk up to it to ${ask}.` : `${CARSHOW.name} is marked, ${CARSHOW.where}. Follow the line on the map at the top left through its gate to the showroom's glass doors and walk in: the ${l.name} is on the floor inside${ZONE_CAST.showroomStaff ? `, and ${sellerOf(id).spec.name} will help you` : ''}.` });
      return;
    }
    if (l.shop === SPORTS_MALL.shop) {
      // one of the sports mall's things: to its doors, or, for someone already inside, to its stand
      const id = String((l.asset && l.asset.model) || '').replace(/^sport:/, '');
      const stand = SPORTS_MALL.displays.find((d) => d.item === id);
      const inHall = inSportsHall(predicted.x, predicted.z);
      const at = inHall && stand ? { x: stand.x + Math.sin(stand.h) * (stand.r + 1.2), z: stand.z + Math.cos(stand.h) * (stand.r + 1.2) } : SPORTS_MALL.entry;
      setWaypoint({ x: at.x, z: at.z, label: inHall ? l.name : SPORTS_MALL.name });
      ui.close();
      ui.toast({ type: 'note', text: inHall ? `The ${l.name} is marked on the floor. Walk up to it to ask about it on your phone.` : `${SPORTS_MALL.name} is marked, ${SPORTS_MALL.where}. Follow the line on the map at the top left through its gateway to the mall's glass doors and walk in: the ${l.name} is on the floor inside.` });
      return;
    }
    const shop = l.shop ? zoneShop(l.shop) : null;
    const at = shop ? shop.marker : l.place;
    setWaypoint({ x: at.x, z: at.z, label: l.kind === 'primary' ? l.seller : `${l.seller}: ${l.name}` });
    ui.close();
    ui.toast({ type: 'note', text: `${l.place.label} is marked. Follow the line on the map at the top left to the pink marker, and step into it.` });
  }

  // The phone's own camera. What it shows is this scene, drawn a second time from where the handset is: looking
  // the way the character faces (the back camera), or back at the character's face from arm's length (the front
  // one, turned left to right as a phone shows a face). It is drawn small, a dozen times a second, into the
  // canvas in the Camera app, and only while that app is the one open.
  const phoneCam = (() => {
    const W = 270, H = 480;
    let target = null, pixels = null, image = null, spare = null;
    const eye = new THREE.PerspectiveCamera(64, W / H, 0.06, 900);
    const at = new THREE.Vector3(), to = new THREE.Vector3();
    let facing = 'back', wait = 0;
    function draw(dt) {
      const canvas = document.getElementById('phone-cam');
      if (!canvas || !me || pictureGone) return;
      wait -= dt;
      if (wait > 0) return;
      wait = LITE ? 1 / 9 : 1 / 14;
      if (!target) {
        target = new THREE.WebGLRenderTarget(W, H); target.texture.colorSpace = THREE.SRGBColorSpace;
        pixels = new Uint8Array(W * H * 4);
        spare = document.createElement('canvas'); spare.width = W; spare.height = H;
        image = spare.getContext('2d').createImageData(W, H);
      }
      const tall = (me.spec ? me.spec.height : 1.7) * (me.scale || 1);
      const base = me.group.position, hx = Math.sin(predicted.heading), hz = Math.cos(predicted.heading);
      const headY = base.y + tall * 0.9;
      // from where the handset is, once it is held up; until then from where it will be
      if (phoneHold.ready && phoneHold.raised > 0.9) at.copy(phoneHold.prop.position); else at.set(base.x + hx * 0.3 * tall / 1.7, base.y + tall * 0.88, base.z + hz * 0.3 * tall / 1.7);
      // the back camera looks out from the far side of the handset, past the fingers that hold it
      if (facing === 'back') { at.x += hx * 0.12; at.z += hz * 0.12; to.set(at.x + hx * 12, at.y - 0.6, at.z + hz * 12); eye.fov = 66; }
      else { to.set(base.x, headY, base.z); eye.fov = 84; }
      eye.position.copy(at); eye.lookAt(to); eye.updateProjectionMatrix();
      // the handset and its glow are not in its own picture; the figure is, even when the game's own eye is inside its head
      const shown = me.group.visible, handset = phoneHold.prop.visible, shadows = renderer.shadowMap.autoUpdate;
      me.group.visible = true; phoneHold.hideForPicture(true); renderer.shadowMap.autoUpdate = false;
      // (put back whatever happens: left on the phone's picture, the town would be drawn there and the screen left black)
      renderer.setRenderTarget(target);
      try { renderer.render(scene, eye); } finally {
        renderer.setRenderTarget(null);
        renderer.shadowMap.autoUpdate = shadows; me.group.visible = shown; phoneHold.hideForPicture(false); phoneHold.prop.visible = handset;
      }
      renderer.readRenderTargetPixels(target, 0, 0, W, H, pixels);
      // what was drawn comes back last row first
      const data = image.data, row = W * 4;
      for (let y = 0; y < H; y += 1) data.set(pixels.subarray((H - 1 - y) * row, (H - y) * row), y * row);
      for (let i = 3; i < data.length; i += 4) data[i] = 255;
      spare.getContext('2d').putImageData(image, 0, 0);
      const g = canvas.getContext('2d');
      g.setTransform(facing === 'front' ? -1 : 1, 0, 0, 1, facing === 'front' ? W : 0, 0);
      g.drawImage(spare, 0, 0);
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    return { width: W, height: H, facing: () => facing, flip() { facing = facing === 'back' ? 'front' : 'back'; wait = 0; }, draw, dispose() { if (target) { target.dispose(); target = null; } } };
  })();
  // a page or a panel stops the feet; the phone in the hand does not
  const uiBlocks = () => ui.isOpen() && !ui.phoneOut();
  let phoneShift = 0;

  const settings = {
    language: () => (view ? view.self.lang : 'en'),
    translate: () => prefs.translate,
    setTranslate: (on) => { prefs.translate = !!on; writeStored(PREFS_KEY, prefs); },
    // the words of the town's recorded voices shown as they are said (28 October 2026): on unless the player turns them off
    subtitles: () => prefs.subtitles !== false,
    setSubtitles: (on) => { prefs.subtitles = !!on; writeStored(PREFS_KEY, prefs); },
    machine: () => translator.hasService,
  };
  const bubbles = createBubbles($('bubbles'), { translator, settings });

  const server = {
    send: (intent) => host.game.intent(playerId, intent),
  };
  const ui = createUI({
    // voice chat's place in Settings, the Privacy page, and the reports in the Admin app (ui-voice.js)
    voiceSettings: (root, kit) => { if (voiceUI) voiceUI.settingsSection(root, kit); },
    privacy: () => PRIVACY,
    voiceAdmin: (root, redraw) => { if (voiceUI) voiceUI.adminPage(root, redraw); },
    send: (intent) => { const r = server.send(intent); refreshView(); return r; },
    view: () => view,
    erase: () => eraseSave(),
    exitGame: () => exitGame(),
    // the characters, to look at; and which one the player is
    gallery: () => openGallery(),
    character: () => { const id = myFigure(); return id ? { figure: id, name: figureName(id) } : null; },
    closed: () => { if (playing) { refreshView(); prompt = findPrompt(); } },
    settings,
    webapp,
    link: () => (link ? link.status() : { kind: 'none', peers: 0, failed: false }),
    room: () => (room ? `${room.name}` : null),
    sound: () => { prefs.sound = !prefs.sound; audio.setMuted(!prefs.sound); if (prefs.sound) audio.start(); writeStored(PREFS_KEY, prefs); return prefs.sound; },
    soundOn: () => prefs.sound,
    requestId,
    waypoint: () => waypoint,
    setWaypoint: (mark) => setWaypoint(mark),
    setGraphics: (value) => setGraphics(value),
    calm: () => !!prefs.calm,
    setCalm: (on) => { prefs.calm = !!on; writeStored(PREFS_KEY, prefs); },
    volumes: () => audio.volumes(),
    setVolume: (name, value) => { audio.setVolumes({ [name]: value }); prefs.volumes = audio.volumes(); writeStored(PREFS_KEY, prefs); if (name === 'ui') audio.chime('ok'); },
    chime: (kind) => audio.chime(kind),
    shutter: () => audio.shutter(),
    music,
    phoneCam,
    torch: { on: () => torch.on, toggle: () => setTorch(!torch.on) },
    online, market, wallet: walletClient,
    rideBike: (id) => rideOwnBike(id),
    rideSport: (id) => rideOwnSport(id),
    driveCar: (id) => enterOwnCar(id),
    bikeSound: (id) => audio.previewBike(id),
    stopBikeSound: () => audio.stopPreview(),
    // (the market's engine controls: audio.js previewBike gives { ignite, revHold, hornHold, stop })
    refreshAdverts: () => adBoard.refresh(),
    saveNow: () => accountSync.upload(),
    account: { open: (mode, why) => accountUI.open(mode, why), logOut: () => accountUI.logOut() },
    accountName: () => { const m = accountMark(); return online.account ? online.account.username : m && m.user ? m.user : ''; },
    goToListing: (l) => goToListing(l),
    placeName: (x, z) => placeName(x, z),
    marketChanged: () => { refreshDealMarkers(); market.soon(); accountSync.soon(); },
    // what is said in an open conversation, as it is said: in the showroom, the one who says it speaks
    dealSaid: (said) => dealSaid(said),
    realWeather: () => realWeather,
    realClock: REAL_CLOCK,
    // the sky the player chooses (Settings, Time and weather): { time: 'real'|'morning'|'noon'|'dusk'|'night',
    // weather: 'real'|'clear'|'cloudy'|'rain'|'storm' }, kept with the other settings on this device
    sky: () => skyChoice(),
    setSky: ({ time, weather } = {}) => { if (time !== undefined) prefs.skyTime = SKY_TIMES[time] !== undefined ? time : 'real'; if (weather !== undefined) prefs.skyWeather = SKY_WEATHERS[weather] ? weather : 'real'; writeStored(PREFS_KEY, prefs); return skyChoice(); },
    shownWeather: (real) => shownWeather(real),
    shownHour: (real) => (SKY_TIMES[prefs.skyTime] !== undefined ? SKY_TIMES[prefs.skyTime] : real),
    // (Settings, Measured on this device: the readout's lines, but for the frames, which it has of its own)
    readout: () => statsLines(statsNow()).filter(([label]) => label !== 'Frames' && label !== 'Game' && label !== 'Graphics'),
    perf: () => { const s = host.game.stats(); return { lite: LITE, fps: perf.fps, calls: perf.calls, triangles: perf.triangles, near: s.near, middle: s.middle, far: s.far, rigs: crowd.stats.rigs + residentActors.size, figures: crowd.stats.figures, viewMs: s.lastViewMs, scanMs: s.lastScanMs, quality: quality.level, frame: monitor.report(), hitchMs: monitor.HITCH_MS, freezeMs: monitor.FREEZE_MS, changes: governor.changes, graphics: prefs.graphics, sound: !audio.supported ? 'Not available in this browser' : audio.muted ? 'Muted' : audio.status().state }; },
  });
  audio.setMuted(!prefs.sound);
  audio.setVolumes({ ...DEFAULT_VOLUMES, ...(prefs.volumes || {}) });

  const accountUI = createAccountUI({
    online, sync: accountSync, confirm,
    local: () => {
      if (!playerId) return null;
      const mark = accountMark();
      return { name: host.game.view(playerId).self.name, mine: !!(online.signedIn && mark && mark.user === online.account.username.toLowerCase()), owner: mark && mark.user ? (mark.name || mark.user) : null };
    },
    onChange: (event) => {
      onlineChanged();
      if (event.type === 'created') ui.toast({ type: 'note', text: `Your account is made. You are ${event.account.username}: other players near you see that name over your head.` });
      else if (event.type === 'in') ui.toast({ type: 'note', text: event.warning || (event.adopted ? `Logged in as ${event.account.username}. Your character has been brought to this device.` : `Logged in as ${event.account.username}.`) });
      else if (event.type === 'out') ui.toast({ type: 'note', text: 'You are logged out. Your character is kept with your account.' });
      if (event.type !== 'checked') { market.soon(); refreshDealMarkers(); ui.marketStale(); ui.walletStale(); }
      // signed in: the account's own character and path are the ones that count, and the player goes where they belong
      if (event.type === 'created' || event.type === 'in') { characterTrouble = event.warning || ''; syncProfile().then(() => route()); }
      if (playing) ui.redraw();
    },
  });

  // "Erase this save and start again": asked about first, and done with the account before it is done here.
  // What is erased is the character. The account, its username and password, its wallet and every entry in it,
  // the people it sends to and what it owns in the market are not touched.
  function eraseSave() {
    return confirm.ask({
      title: 'Erase your saved game?',
      body: 'This will permanently delete the selected game\'s saved progress and start a new journey. This action cannot be undone.',
      confirm: 'Erase Save and Restart', cancel: 'Cancel', busy: 'Erasing...', danger: true,
      run: async () => {
        if (!online.available) { forgetCharacter('erased'); return { ok: true }; }
        // with no connection the copy kept with the account could not be erased, and would only come back
        if (!online.signedIn) return { ok: false, message: 'Your saved game is kept with your account, and the game\'s server cannot be reached just now, so it has not been erased. Nothing was changed. Check your connection and try again.' };
        const answer = await accountSync.erase();
        if (!answer.ok) return { ok: false, message: `Your saved game could not be erased, and nothing was changed. ${answer.message || ''}` };
        return { ok: true };
      },
    }).then((done) => {
      if (done) ui.toast({ type: 'note', text: online.available ? 'Your saved game has been erased. Your account, your TR and what you own are as they were. A new journey begins.' : 'Your saved game has been erased. A new journey begins.' });
      return done;
    });
  }
  // "Exit game" (Settings; 19 October 2026, the owner): asked about first. The game is saved on this device and, on
  // the website, with the account (its answer is waited for, a little while), and the player leaves the town for the
  // start screen, where Play carries on from where they were. Other players stop seeing them and the town's sounds
  // stop; they stay signed in. A save that cannot reach the account just now is kept on this device and goes to the
  // account when there is a connection again (as any save does), and the player is told so. A page cannot close
  // its own tab: from the start screen the player closes the app or the tab, or plays on.
  function exitGame() {
    if (!playing || !playerId) return Promise.resolve(false);
    let note = '';
    return confirm.ask({
      title: 'Exit the game?',
      body: online.available
        ? 'Your game will be saved, on this device and with your account, and you will leave the town. Press Play to carry on from where you are.'
        : 'Your game will be saved on this device, and you will leave the town. Press Play to carry on from where you are.',
      confirm: 'Save and Exit', cancel: 'Cancel', busy: 'Saving...',
      run: async () => {
        writeStored(SAVE_KEY, { host: host.save(), playerId });
        if (online.available) {
          // (on a slow connection the save is not waited for past fifteen seconds: it goes on its way, and is kept here)
          const sent = online.signedIn ? await Promise.race([accountSync.upload(), new Promise((done) => { setTimeout(() => done('slow'), 15000); })]) : null;
          if (sent === 'slow') note = 'It is saved on this device, and is still on its way to your account.';
          else if (!sent || (!sent.ok && (sent.code === 'OFFLINE' || sent.code === 'SERVER'))) note = 'It is saved on this device, and goes to your account as soon as there is a connection.';
        }
        return { ok: true };
      },
    }).then((done) => { if (done) leaveTown(note); return done; });
  }
  function leaveTown(note) {
    if (!playing) return;
    exited = true; exitNote = note || '';
    letGo();
    if (gunPlay) gunPlay.reset();
    playing = false;
    ui.close();
    audio.suspend();
    showStart(false);
    $('start').scrollTop = 0;
    if (!$('resume-play').hidden) $('resume-play').focus({ preventScroll: true });
  }
  // Play, on the start screen after Exit game: back into the town where the player left it.
  $('resume-play').addEventListener('click', () => {
    if (!exited) return;
    exited = false; exitNote = '';
    if (prefs.sound) audio.start();
    route();
  });
  voiceUI = createVoiceUI({
    voice: voiceChat, online, h, hud: $('hud'), project,
    headOfPeer: (id) => headOf(`p:v:${id}`),
    place: () => (view ? { x: view.self.x, z: view.self.z } : null),
    isAdmin: () => !!(online.signedIn && online.account && online.account.admin),
    toast: (event) => ui.toast(event),
  });
  online.onChange(() => onlineChanged());
  // Is there a server, and is this browser signed in? If so, which copy of the character is the one to play.
  // Asked when the page opens, and again now and then for as long as the server cannot be reached.
  let greetedAt = 0, greeting = false;
  async function greetServer() {
    if (!online.available || greeting) return;
    greeting = true; greetedAt = clock;
    try {
      await online.check();
      onlineChanged();
      if (online.signedIn) {
        const settled = await accountSync.settle();
        // a character that could not be fetched is not replaced by a new one: the player is told, and can try again
        characterTrouble = !settled.ok && settled.message ? settled.message : '';
        if (settled.erased) ui.toast({ type: 'note', text: 'This saved game was erased from another device. A new journey begins here.' });
        await syncProfile();
      }
      accountUI.draw();
      refreshDealMarkers();
    } finally { greeting = false; route(); }
  }
  greetServer();
  window.addEventListener('online', () => { if (online.status().state === 'down') greetServer(); });

  townSteps.push(['the townspeople', () => {
    for (const r of ZONE_RESIDENTS) {
      const actor = makeCharacter(r.look, r.name, false, 1);
      actor.group.visible = false;
      scene.add(actor.group);
      residentActors.set(r.id, actor);
    }
  }]);

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
    for (const q of zone.players || []) if (q.vehicle && typeof q.vehicle.driver === 'number') want(q.vehicle.driver);
    for (const r of zone.sportRiders || []) want(r.person);
    if (!unknown.length) return;
    const faces = playerId ? [] : host.game.faces(unknown);
    if (playerId) for (let from = 0; from < unknown.length; from += 60) { const r = server.send({ type: 'people.describe', ids: unknown.slice(from, from + 60) }); if (r.ok) faces.push(...r.people); }
    for (const face of faces) known.set(face.index, face);
    for (const i of unknown) asking.delete(i);
  }

  // What the simulation has to tell this player: receipts and notices to show, things to sound.
  function hear(event) {
    if (event.type === 'sound') { audio.bell(event.x, event.z, event.sound); return; }
    // a round has struck the player (gun-play.js: blood on the screen, the flinch, where it came from)
    if (event.type === 'shot') { if (gunPlay) gunPlay.onShot(event, { me }); return; }
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
  // A knock felt in the view: the camera pushed a few centimetres back off what was hit and let go, dying away in a
  // fraction of a second (19 October 2026, the owner's brief: restrained impact feedback). `amount` 0..1.
  const camKick = { at: -10, amount: 0, x: 0, z: 0 };
  function kick(amount, normal) { camKick.at = clock; camKick.amount = Math.max(0, Math.min(1, amount)); camKick.x = normal ? normal.x : 0; camKick.z = normal ? normal.z : 0; }
  // The picture shakes once: a short, small movement of the whole view, and a buzz where the device has one.
  function jolt() {
    const el = $('view');
    el.classList.remove('jolt'); void el.offsetWidth; el.classList.add('jolt');
    try { if (navigator.vibrate) navigator.vibrate(60); } catch (error) { /* no buzzer */ }
  }

  // What falls.js needs of the player's own fall (the town's `down` or `dead`), or null on their feet: how (struck,
  // thrown from a motorcycle, killed), how long ago, how long on the ground and getting up, which way the blow sent
  // them and which way they faced when it came, and from where to where.
  let fallFacing = null;
  function playerDown(self, facing) {
    const d = self.down, k = self.dead;
    if (!d && !k) { fallFacing = null; return null; }
    if (fallFacing === null) fallFacing = facing;
    // (the town's word comes ten times a second: its age is carried on to this frame, so that the fall flows)
    const ahead = Math.max(0, clock - viewAt);
    if (k) return { kind: 'dead', age: (k.age || 0) + ahead, lie: 1e6, rise: 0, push: fallFacing + Math.PI, facing: fallFacing, hard: true, from: null };
    return { kind: d.by === 'crash' ? 'crash' : 'knock', age: (d.age || 0) + ahead, lie: d.lie || 2.4, rise: d.rise || 2.7, push: Number.isFinite(d.h) ? d.h : fallFacing, facing: fallFacing, hard: !!d.hard, from: d.from || null, over: d.over || null, to: { x: self.x, z: self.z }, thrown: d.from ? Math.hypot(self.x - d.from.x, self.z - d.from.z) : 1 };
  }

  // Is the player being moved by the simulation and not by their own hands? (walked in by an officer, carried, held)
  const led = () => !!view && (!!view.self.law.arrest || !!view.self.carried || !!view.self.hijack || !!view.self.down || !!view.self.dead || (view.self.fight && view.self.fight.held));

  function refreshView() {
    if (!playerId) return;
    view = host.game.view(playerId);
    viewAt = clock;
    drawZone(view);
    learnFaces(view);
    ui.updateHud(view);
    for (const event of host.game.drain(playerId)) hear(event);
    showFights(view.fights);
    showImpacts(view.impacts);
    crowd.setGuards(new Set(view.moods.filter((m) => m.mood === 'fighting' || m.mood === 'warned').map((m) => m.i)));
    crowd.setLimps(new Set(view.moods.filter((m) => m.limp).map((m) => m.i)));
    crowd.setTrouble(new Set([...view.moods.map((m) => m.i), ...(view.fallen || [])]));
    crowd.setTalking(view.voiceTalk);
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
      if (v.driver || claimedFleet.has(v.id)) continue;
      const b = vehicleBox(v);
      if (predicted.x > b.x0 - 0.4 && predicted.x < b.x1 + 0.4 && predicted.z > b.z0 - 0.4 && predicted.z < b.z1 + 0.4) continue;
      boxes.push(b);
    }
    // and the ambulance, wherever it is standing
    const a = view.ambulance;
    const van = Math.abs(Math.sin(a.h)) > 0.5 ? { x0: a.x - 2.7, x1: a.x + 2.7, z0: a.z - 1.1, z1: a.z + 1.1 } : { x0: a.x - 1.1, x1: a.x + 1.1, z0: a.z - 2.7, z1: a.z + 2.7 };
    if (!(predicted.x > van.x0 - 0.5 && predicted.x < van.x1 + 0.5 && predicted.z > van.z0 - 0.5 && predicted.z < van.z1 + 0.5)) boxes.push(van);
    // the player's own cars where they were left (not the one they are in), and the car showroom's gate as far as it is shut
    for (const c of (view.self.ownCars && view.self.ownCars.parked) || []) {
      if (!POWER_CARS[c.car]) continue;
      for (const b of carBoxes(POWER_CARS[c.car], c.x, c.z, c.h)) if (!(predicted.x > b.x0 - 0.4 && predicted.x < b.x1 + 0.4 && predicted.z > b.z0 - 0.4 && predicted.z < b.z1 + 0.4)) boxes.push(b);
    }
    // the town's cars near them (traffic.js), where they stand or are going; not one the player is in
    for (const c of view.traffic || []) {
      if (!POWER_CARS[c.model] || Math.abs(c.x - predicted.x) > 40 || Math.abs(c.z - predicted.z) > 40) continue;
      for (const b of carBoxes(POWER_CARS[c.model], c.x, c.z, c.h)) if (!(predicted.x > b.x0 - 0.4 && predicted.x < b.x1 + 0.4 && predicted.z > b.z0 - 0.4 && predicted.z < b.z1 + 0.4)) boxes.push(b);
    }
    boxes.push(...carshowGateBoxes(view.carshowGate || 0));
    return boxes;
  }

  // -------------------------------------------------------------- start --

  // The character: one of the owner's supplied figures, turned in its own view. A new player chooses one, once;
  // after that the same view is where the others can be looked at, and nothing in it changes who the player is.
  const creator = createCreator({
    canvas: $('stage-view'), root: $('start'), nameField: $('name'),
    saved: prefs.look || {},
    // someone with a character here is going into town, not choosing one: the screen's own view waits until it is shown
    lazy: !!playerId,
    // (and nothing of it is made or fetched while the opening is in front of it)
    held: () => { const opening = document.getElementById('intro'); return !!opening && !opening.hidden; },
    onPick: (look) => { prefs.look = look; writeStored(PREFS_KEY, prefs); },
    onView: (figure) => drawGallery(figure),
  });
  window.__creator = creator;

  // The answer to "hero or villain". It is given once: in the opening where there are no accounts, and to an
  // account that has never answered where there are. It is kept (on the device, with the character, and with
  // the account), and nothing on the screen where a character is made asks it again.
  let pathChosen = prefs.path === 'villain' ? 'villain' : 'hero';
  function choosePath(path, remember = true) {
    pathChosen = path === 'villain' ? 'villain' : 'hero';
    if (remember) { prefs.path = pathChosen; writeStored(PREFS_KEY, prefs); }
  }
  // The answer already given, wherever it is kept; null if it never was.
  function knownPath() {
    if (playerId) { const mine = host.game.view(playerId).self.path; if (mine) return mine; }
    if (online.signedIn && online.account && online.account.path) return online.account.path;
    return prefs.path === 'hero' || prefs.path === 'villain' ? prefs.path : null;
  }
  // The character the account is, if it has chosen one (the server's word); or, with no accounts, this device's.
  const accountFigure = () => (online.signedIn && online.account && online.account.figure ? online.account.figure : null);
  const myFigure = () => { if (!playerId) return null; const look = host.game.view(playerId).self.look; return look && look.figure ? look.figure : null; };
  const figureName = (id) => (FIGURES[id] ? FIGURES[id].name : 'your character');

  // The account and the copy of the game on this device are made to agree about who the player is. The account's
  // character is the one that counts: a copy here that says otherwise is changed to it, never the other way.
  // An account that has no character or path yet (one from before they were kept with it) takes what its own
  // game already has, once.
  async function syncProfile() {
    if (!online.signedIn || !online.account) return;
    const self = playerId ? host.game.view(playerId).self : null;
    const here = self && self.look && self.look.figure ? self.look.figure : null;
    const want = {};
    if (!online.account.figure && here) want.figure = here;
    if (!online.account.path) { const path = (self && self.path) || (prefs.path === 'hero' || prefs.path === 'villain' ? prefs.path : null); if (path) want.path = path; }
    if (want.figure || want.path) {
      const answer = await online.ask('character.choose', want);
      if (answer.ok) online.noteCharacter(answer.character);
      else if (answer.code === 'CHOSEN') online.noteCharacter({ figure: answer.figure, path: answer.path });
    }
    const theirs = accountFigure();
    if (theirs && playerId && myFigure() && myFigure() !== theirs) { host.bank.figure(playerId, theirs); writeStored(SAVE_KEY, { host: host.save(), playerId }); if (playing) wearCharacter(); accountSync.soon(); }
    if (online.account.path) choosePath(online.account.path);
  }

  // What the start screen is showing: 'create' (a new journey), 'resume' (a character there is, being made
  // ready or fetched), 'gallery' (looking at the characters from inside the game). The account's own part of
  // it, shut until someone is signed in, is account-ui.js's.
  function setScreen(screen) {
    $('start').dataset.screen = screen;
    $('resume').hidden = screen !== 'resume';
    $('gallery').hidden = screen !== 'gallery';
  }

  function showStart(fresh) {
    $('start').hidden = false;
    $('hud').hidden = true;
    $('touch').hidden = true;
    bubbles.clear();
    if (link) { link.close(); link = null; }
    if (fresh) { host = newHost(); playerId = null; view = null; known.clear(); if (me) { scene.remove(me.group); me = null; } }
    for (const mesh of markers.values()) scene.remove(mesh);
    markers.clear();
    if (townBuilt) drawSpectator();
    drawStart();
  }

  // The start screen, as things stand: someone with a character is not asked to make one, and someone whose
  // character could not be fetched is told so and is not given another.
  function drawStart() {
    if (gallery) { setScreen('gallery'); $('start-title').textContent = 'Characters'; return; }
    const waiting = !!playerId || expectsCharacter();
    setScreen(waiting ? 'resume' : 'create');
    $('resume-play').hidden = !(waiting && exited && playerId);
    if (waiting && exited && playerId) {
      // left by Exit game: the game is saved, and Play carries on
      const who = host.game.view(playerId).self.name;
      $('resume-title').textContent = 'Your game is saved';
      $('resume-text').textContent = `${who || 'Your character'} is waiting where you left off. ${exitNote ? `${exitNote} ` : ''}Press Play to carry on.`;
      $('resume-wait').hidden = true;
      $('resume-retry').hidden = true;
      return;
    }
    if (waiting) {
      const name = playerId ? host.game.view(playerId).self.name : (online.status().save && online.status().save.name) || '';
      $('resume-title').textContent = name ? `Welcome back, ${name}` : 'Welcome back';
      const failed = !playerId && !!characterTrouble;
      $('resume-text').textContent = failed ? `Your character is kept with your account, and it could not be brought to this device just now. ${characterTrouble} Nothing has been lost, and no new character has been made.` : playerId ? 'Your character is as you left it.' : 'Your character is being brought from your account.';
      $('resume-wait').hidden = failed;
      $('resume-wait-text').textContent = playerId ? 'Preparing the town...' : 'Fetching your character...';
      $('resume-retry').hidden = !failed;
      return;
    }
    // a new journey. The character is chosen here once; an account that already has one keeps it
    const fixed = accountFigure();
    creator.setMode(fixed ? 'locked' : 'choose', fixed);
    $('start-title').textContent = fixed ? 'Begin a new journey' : 'Create your character';
    $('locked-note').hidden = !fixed;
    if (fixed) $('locked-note').textContent = `Your character is ${figureName(fixed)}'s figure. It is yours on every journey, and can be changed in town with a character upgrade.`;
  }
  // Signed in, with a character kept by the account that is not on this device yet.
  const expectsCharacter = () => online.available && online.signedIn && !playerId && !!online.status().save && !online.status().save.erased;
  $('resume-retry').addEventListener('click', async () => {
    $('resume-retry').disabled = true; characterTrouble = ''; drawStart();
    const settled = online.signedIn ? await accountSync.settle() : { ok: false, message: 'You are not signed in.' };
    characterTrouble = !settled.ok && settled.message ? settled.message : '';
    $('resume-retry').disabled = false;
    route();
  });

  // Where the player belongs, once the opening is over. Called whenever something that decides it has changed
  // (the opening ended, the town is ready, someone signed in or out, a character arrived or went). Someone with
  // a character goes into the town: they are not shown the screen where one is made, and are not asked anything.
  function route() {
    if (playing || gallery) return;
    if (!intro || (intro.active() && !intro.asking())) return;         // the opening is still on the screen
    if (!accountUI.mayPlay()) { if (!$('start').hidden) drawStart(); return; }  // the website, signed out: the start screen is shut (account-ui.js)
    if (playerId) {
      if (exited || isReady) { if (isReady && !exited) enterWorld(); else drawStart(); return; }
      drawStart();
      prepareTown().then(() => route());
      return;
    }
    if (expectsCharacter()) { drawStart(); return; }
    // nobody's character is here: a new journey. The one question is asked first, if it has never been answered
    if (!knownPath()) {
      if (!intro.asking()) intro.question().then((answer) => { if (answer) { choosePath(answer); syncProfile().then(() => route()); } });
      return;
    }
    choosePath(knownPath(), false);
    drawStart();
    if (!coarse && !NO_INTRO && document.activeElement === document.body) $('name').focus({ preventScroll: true });
  }

  // The figure in the town is the character the simulation says the player is.
  function wearCharacter() {
    view = host.game.view(playerId);
    if (me) scene.remove(me.group);
    me = makeCharacter(view.self.look, null, true);
    scene.add(me.group);
    skillsFor(me);
    // (the player's own figure: once it is drawn, the device keeps its files, so that the game opens without a connection)
    const own = me;
    if (own.animated && own.loaded) own.loaded.then(() => { if (me === own) webapp.keepFigure(own.animated); }, () => {});
  }

  function enterWorld() {
    gallery = false;
    exited = false; exitNote = '';
    // (the turntable may have had the canvas to itself: the town's size and sharpness again)
    applyQuality(quality.level);
    wearCharacter();
    predicted = { x: view.self.x, z: view.self.z, heading: view.self.heading };
    car.speed = 0;
    cam.target.set(predicted.x, 1.5 + zoneGroundY(predicted.x, predicted.z), predicted.z);
    // (on the street view, close behind the player: the view the game starts with, 19 October 2026)
    cam.yaw = Math.PI; cam.pitch = STREET.pitch; cam.dist = STREET.dist; cam.own = STREET.dist; cam.ride = 1; cam.back = false; rig.view = 'street';
    $('start').hidden = true;
    $('hud').hidden = false;
    if (coarse) $('touch').hidden = false;
    playing = true;
    spectator = null;
    if (prefs.sound) audio.start();
    relink();
    refreshView();
    // voice chat left on: started again by itself where the browser already allows the microphone, otherwise at a tap
    if (voiceUI && online.signedIn) { voiceUI.wakeIfAllowed(); voiceUI.showWarning(); }
    // the guns: put away, and what the account has (its starter rifle, its rounds) from the website's server; the
    // rifle's model and its sounds kept on the device for playing without a connection (fetched in the worker's time)
    if (gunPlay) { gunPlay.reset(); if (online.signedIn) gunPlay.askState(); }
    if (webapp.site && window.__PCW_GUNS) webapp.keepFiles([modelFile(GUN_MODELS.rifle.file), ...((window.__PCW_GUNS.rifle && window.__PCW_GUNS.rifle.sounds) || [])]);
    canvas.focus({ preventScroll: true });
  }

  // On the website nobody goes into town without an account: asked here, whatever the start screen is showing.
  function mayEnter() {
    if (accountUI.mayPlay()) return true;
    if (online.status().state === 'out') accountUI.open('signup', 'An account is needed to play.');
    return false;
  }

  // A new journey begins. For someone who has never chosen, this is the choosing: they are asked to be sure,
  // the account is told (and it is the account's answer that stands), and only then is there a character.
  let beginning = false;
  async function beginJourney() {
    if (beginning || !mayEnter()) return;
    const fail = (text) => { $('start-error').hidden = false; $('start-error').textContent = text; };
    $('start-error').hidden = true;
    const name = $('name').value;
    if (String(name || '').replace(/[^\p{L}\p{M} .'-]/gu, '').trim().length < 2) { fail('Choose a name of at least two letters.'); return; }
    if (online.available && !online.signedIn) { fail('A new journey is begun with your account, and the game\'s server cannot be reached just now. Check your connection and try again.'); return; }
    beginning = true;
    try {
      let figure = accountFigure();
      if (!figure) {
        const picked = creator.look().figure;
        const sure = await confirm.ask({
          title: `Choose ${figureName(picked)}?`,
          body: `${figureName(picked)}'s figure will be your character from now on, on every device and every journey. You can look at the others whenever you like; changing to one of them later is a character upgrade, which is paid for.`,
          confirm: 'Choose This Character', cancel: 'Go Back', busy: 'Saving...',
          run: async () => {
            if (!online.signedIn) return { ok: true };
            const answer = await online.ask('character.choose', { figure: picked, path: pathChosen });
            if (answer.ok) { online.noteCharacter(answer.character); return { ok: true }; }
            // (chosen already, on another device a moment ago: that choice is the account's)
            if (answer.code === 'CHOSEN') { online.noteCharacter({ figure: answer.figure, path: answer.path }); return { ok: true }; }
            return { ok: false, message: `Your character could not be saved to your account, so nothing has been chosen. ${answer.message || ''}` };
          },
        });
        if (!sure) return;
        figure = accountFigure() || picked;
      }
      // the town is built now, behind the loading card, for the character just chosen
      await prepareTown();
      const fresh = newHost();
      const id = fresh.game.join({ name, path: knownPath() || pathChosen, look: { ...creator.look(), figure, body: FIGURES[figure].gender } });
      host = fresh; playerId = id;
      known.clear();
      prefs.look = { ...creator.look(), figure }; writeStored(PREFS_KEY, prefs);
      writeStored(SAVE_KEY, { host: host.save(), playerId });
      enterWorld();
      ui.toast({ type: 'note', text: ZONE_TEXT.arrival });
      // the new character is kept with the account at once, and its wallet is the account's own
      if (online.signedIn) accountSync.upload();
    } catch (error) {
      fail(error.message);
    } finally { beginning = false; }
  }
  $('creator').addEventListener('submit', (event) => { event.preventDefault(); beginJourney(); });

  // ---- the characters, looked at from inside the game ----
  // Every character can be turned and watched. Looking changes nothing: not who the player is, not where they
  // stand, not what is kept on the device. The only way to become another is the upgrade.
  function openGallery() {
    if (!playing || !playerId) return;
    writeStored(SAVE_KEY, { host: host.save(), playerId });
    ui.close();
    playing = false; gallery = true;
    $('hud').hidden = true; $('touch').hidden = true;
    bubbles.clear();
    $('start').hidden = false;
    setScreen('gallery');
    $('start-title').textContent = 'Characters';
    creator.setMode('gallery', myFigure() || undefined);
    $('start').scrollTop = 0;
    $('gallery-back').focus({ preventScroll: true });
  }
  function closeGallery() {
    if (!gallery) return;
    gallery = false;
    if (playerId) enterWorld(); else route();
  }
  // What the gallery says about the character on the turntable.
  let quoted = null;                  // the last thing the bank (or this world) said an upgrade to it would cost
  function drawGallery(figure) {
    if (!gallery) return;
    const mine = myFigure();
    const own = figure === mine;
    $('gallery-tag').textContent = own ? 'Your character' : 'Looking only';
    $('gallery-tag').dataset.own = String(own);
    $('gallery-text').textContent = own
      ? `You are ${figureName(mine)}'s figure. The arrows show the other characters: looking at them changes nothing.`
      : `This is ${figureName(figure)}'s figure. You are still ${figureName(mine)}'s: looking changes nothing.`;
    $('gallery-upgrade').hidden = own || !mine;
    $('gallery-upgrade').textContent = `Upgrade to ${figureName(figure)}`;
    $('gallery-rule').textContent = `A character upgrade is offered once you have more than ${trText(UPGRADE.above)}. It costs a quarter of your whole balance at that moment, paid in TR you have earned (starter TR pays none of it), and it is permanent until you pay for another.`;
    $('gallery-note').hidden = true;
    quoted = null;
  }
  // What an upgrade to `figure` would cost now: from the bank where there is one (after it has been told of
  // everything spent in town), from this world's own ledger where there is not.
  async function upgradeQuote(figure) {
    if (online.available) {
      if (!online.signedIn) return { ok: false, message: 'The game\'s server cannot be reached just now, so a character cannot be upgraded. Check your connection and try again.' };
      const saved = await accountSync.upload();
      if (saved && !saved.ok && (saved.code === 'OFFLINE' || saved.code === 'SERVER')) return { ok: false, message: saved.message };
      const answer = await online.ask('character.quote', { figure });
      return answer.ok ? answer.quote : { ok: false, message: answer.message };
    }
    const answer = host.game.intent(playerId, { type: 'character.quote', figure });
    return answer.ok ? answer.quote : { ok: false, message: answer.message };
  }
  async function upgradeCharacter() {
    const figure = creator.figure();
    const button = $('gallery-upgrade');
    if (!gallery || button.disabled || figure === myFigure()) return;
    button.disabled = true;
    const quote = await upgradeQuote(figure);
    button.disabled = false;
    if (!gallery) return;
    quoted = quote;
    const rows = quote.total === undefined ? null : [
      ['Current character', figureName(quote.from)], ['New character', figureName(quote.to)],
      ['Current balance', trText(quote.total)], ['Upgrade fee', trText(quote.fee)], ['Balance after upgrade', trText(quote.after)],
      ['TR you have earned', trText(quote.eligible)],
    ];
    if (!quote.ok) {
      // not to be had just now: the player is shown the figures and the actual reason, and there is nothing to confirm
      await confirm.ask({ title: 'Upgrade Character', body: quote.message || 'A character cannot be upgraded just now.', rows, note: $('gallery-rule').textContent, confirm: null, cancel: 'Close' });
      return;
    }
    const key = newId();
    let result = null;
    const done = await confirm.ask({
      title: 'Upgrade Character', rows,
      body: 'Upgrading changes your permanent character. You will need to pay another upgrade fee to change it again.',
      note: 'The fee is a quarter of your balance, and is paid in TR you have earned.',
      confirm: 'Confirm Upgrade', cancel: 'Cancel', busy: 'Upgrading...',
      run: async () => {
        if (!online.available) {
          const answer = host.game.intent(playerId, { type: 'character.upgrade', figure, fee: quote.fee, requestId: `upgrade-${key}` });
          if (!answer.ok) return { ok: false, message: `${answer.message} Nothing was charged and your character has not changed.` };
          result = { fee: answer.upgrade.fee, to: figure };
          return { ok: true };
        }
        // the same key however often it has to be asked: the bank does it once
        const answer = await online.ask('character.upgrade', { key, figure, fee: quote.fee }, { timeout: 20000 });
        if (!answer.ok) {
          const lost = answer.code === 'OFFLINE' || answer.code === 'SERVER';
          return { ok: false, message: lost ? 'No answer came back. Press Confirm Upgrade again: it will not be charged twice.' : `${answer.message} Nothing was charged and your character has not changed.` };
        }
        online.noteCharacter(answer.character);
        // the character here becomes the account's; the fee reaches this world's wallet as any movement at the bank does
        host.bank.figure(playerId, answer.character.figure, { fee: answer.upgrade.fee, total: answer.upgrade.total, ref: answer.upgrade.ref });
        walletClient.heard(answer, `Character upgrade: ${trText(answer.upgrade.fee)}`);
        result = { fee: answer.upgrade.fee, to: answer.character.figure, ref: answer.upgrade.ref };
        return { ok: true };
      },
    });
    if (!done || !result) return;
    prefs.look = { ...(prefs.look || {}), figure: result.to }; writeStored(PREFS_KEY, prefs);
    writeStored(SAVE_KEY, { host: host.save(), playerId });
    if (online.signedIn) accountSync.upload();
    audio.chime('paid');
    closeGallery();
    ui.toast({ type: 'note', text: `You are now ${figureName(result.to)}'s figure. The upgrade cost ${trText(result.fee)}${result.ref ? ` (${result.ref})` : ''}.` });
  }
  $('gallery-back').addEventListener('click', closeGallery);
  $('gallery-upgrade').addEventListener('click', upgradeCharacter);
  window.addEventListener('keydown', (event) => { if (gallery && event.key === 'Escape' && !confirm.isOpen) { event.preventDefault(); closeGallery(); } });

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
    // with the phone in the hand only the feet answer: the keys that walk, and nothing else
    if (ui.phoneOut()) { if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) { if (key.startsWith('Arrow')) event.preventDefault(); input.keys.add(key); } return; }
    if (ui.isOpen()) return;
    if (key === 't') { if (ui.openChat()) event.preventDefault(); return; }
    if (key === 'b' && voiceChat.on) { if (!event.repeat) { if (voiceChat.active) voiceChat.press(); else voiceUI.wake(); } return; }
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
    if (key === 'b') voiceChat.release();
    if (heldKeys.delete(key)) { const button = keymap.get(key); if (button) act(button.id, 'up'); }
    input.keys.delete(key);
  });
  // a key or a finger lifted while the page is not looking is never reported, so let go of everything
  const letGo = () => { voiceChat.release(); controls.release(); actKey = false; for (const key of heldKeys) { const button = keymap.get(key); if (button) act(button.id, 'up'); } heldKeys.clear(); };
  window.addEventListener('blur', letGo);
  const toggleSound = () => { prefs.sound = !prefs.sound; audio.setMuted(!prefs.sound); if (prefs.sound) audio.start(); writeStored(PREFS_KEY, prefs); ui.toast({ type: 'note', text: prefs.sound ? 'Sound on.' : 'Sound off.' }); };

  const pointers = new Map();
  let pinch = 0;
  // With a gun out the aim is the camera's, and may look up as well as down (gun-play.js); through the sight it turns
  // more finely. `gunAimedAt`: when the aim was last moved by hand (the pull toward someone near it works only then).
  let gunAimedAt = -10;
  const GUN_PITCH = Object.freeze({ up: -0.85, down: 1.0 });
  function aimBy(dx, dy, rate = 0.0055) {
    const fine = gunPlay && gunPlay.sighting ? 0.45 : 1;
    cam.yaw -= dx * rate * fine;
    cam.pitch = Math.max(GUN_PITCH.up, Math.min(GUN_PITCH.down, cam.pitch + dy * rate * 0.75 * fine));
    cam.lastDrag = clock; gunAimedAt = clock;
  }
  // A mouse, with a gun out: the pointer is held in the picture (pointer lock: Esc lets it go), the mouse aims, its left
  // button shoots and its right button aims through the sight. The first click only takes hold of the pointer.
  const gunMouse = (event) => mode === 'gun' && event.pointerType === 'mouse' && typeof canvas.requestPointerLock === 'function';
  canvas.addEventListener('contextmenu', (event) => { if (mode === 'gun') event.preventDefault(); });
  document.addEventListener('mousemove', (event) => { if (document.pointerLockElement === canvas && mode === 'gun' && playing) aimBy(event.movementX || 0, event.movementY || 0, 0.0024); });
  canvas.addEventListener('pointerdown', (event) => {
    if (gunMouse(event)) {
      event.preventDefault();
      canvas.focus({ preventScroll: true });
      if (playing && prefs.sound && !pictureGone) audio.start();
      if (document.pointerLockElement !== canvas) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (error) { /* not here */ } return; }
      if (event.button === 0) act('shoot', 'down'); else if (event.button === 2) act('aim', 'hold-down');
      return;
    }
    canvas.setPointerCapture(event.pointerId); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); canvas.focus({ preventScroll: true }); if (playing && prefs.sound && !pictureGone) audio.start();
  });
  canvas.addEventListener('pointerup', (event) => { if (gunMouse(event) && document.pointerLockElement === canvas) { if (event.button === 0) act('shoot', 'up'); else if (event.button === 2) act('aim', 'hold-up'); } });
  document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== canvas && gunPlay) { gunPlay.act('shoot', 'up'); gunPlay.act('aim', 'hold-up'); } });
  canvas.addEventListener('pointermove', (event) => {
    const p = pointers.get(event.pointerId);
    if (!p) return;
    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;
    p.x = event.clientX; p.y = event.clientY;
    if (pointers.size === 1 && mode === 'gun') aimBy(dx, dy);
    else if (pointers.size === 1) {
      // (a view that follows a vehicle is turned round it, and tipped, by the camera itself: camera.js `drag`; on foot the
      // camera goes round the player and up and down, from a little below their chest to high over them)
      if (!rig.drag(-dx * 0.0055, dy * 0.004)) { cam.yaw -= dx * 0.0055; cam.pitch = Math.max(STREET.low, Math.min(STREET.high, cam.pitch + dy * 0.004)); }
      cam.lastDrag = clock;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const gap = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch && gap > 1) zoomBy(pinch / gap);
      pinch = gap;
      cam.lastDrag = clock;
    }
  });
  // A pinch, or the mouse's wheel (30 October 2026: the camera button is gone from a touch screen): on foot the camera
  // nearer or further behind the player (and kept there: `cam.own`); behind a vehicle its view nearer or further
  // (`cam.ride`); with a gun out, two fingers brought together show the whole scene for five seconds, as V does, and
  // spread apart go back over the shoulder.
  let gunPinch = 1;
  function zoomBy(factor) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    if (mode === 'gun' && gunPlay) {
      gunPinch *= factor;
      if (gunPinch > 1.35 && !gunPlay.overviewing) { act('overview', 'down'); gunPinch = 1; } else if (gunPinch < 0.74 && gunPlay.overviewing) { act('overview', 'down'); gunPinch = 1; }
      return;
    }
    if (where() === 'vehicle') { cam.ride = Math.max(RIDE.nearest, Math.min(RIDE.farthest, (cam.ride || 1) * factor)); return; }
    cam.dist = Math.max(STREET.nearest, Math.min(STREET.farthest, cam.dist * factor)); cam.own = cam.dist; cam.back = false;
  }
  const release = (event) => { pointers.delete(event.pointerId); pinch = 0; gunPinch = 1; };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', (event) => { event.preventDefault(); zoomBy(1 + Math.sign(event.deltaY) * 0.1); }, { passive: false });

  // touch controls: the stick and the buttons live in controls.js; what each does is in act(), below
  controls.on((id, phase, dx, dy) => { if (phase === 'move') { if (id === 'shoot' && mode === 'gun') aimBy(dx, dy); return; } act(id, phase); });
  window.addEventListener('touchstart', () => { if (playing) $('touch').hidden = false; }, { passive: true, once: true });

  // ------------------------------------------------------- interactions --

  const say = (result, text) => { refreshView(); if (!result.ok) ui.toast({ type: 'note', text: result.message }); else if (text) ui.toast({ type: 'note', text }); };

  function enterVehicle(v) {
    const result = server.send({ type: 'vehicle.enter', vehicleId: v.id });
    if (result.ok) { car.speed = 0; predicted = { x: result.vehicle.x, z: result.vehicle.z, heading: v.heading }; }
    say(result, result.ok ? (coarse ? 'Hold the pedal to go and steer with the stick. The door button lets you out.' : 'W and S to drive and brake, A and D to steer. E to step out.') : null);
  }

  function leaveVehicle() {
    const result = server.send({ type: 'vehicle.exit' });
    if (result.ok) { car.speed = 0; predicted.x = result.x; predicted.z = result.z; }
    say(result);
  }

  function getDown() {
    const result = server.send({ type: 'okada.alight' });
    if (result.ok) { predicted.x = result.x; predicted.z = result.z; }
    say(result);
  }

  // A bridge, a boardwalk, a jetty or stairs are walked, never driven (the habitation, 20 October 2026): a vehicle
  // whose front comes to one is stopped there, and the player is told to get off and given the button to. The vehicle
  // stays where it stopped.
  let bridgeStop = null;            // { at, deck, x, z } while a vehicle is stopped at one
  function stopsAtBridge(x, z, heading, reach) {
    const d = habitationFootOnly(x + Math.sin(heading) * reach, z + Math.cos(heading) * reach) || habitationFootOnly(x, z);
    if (!d) return false;
    bridgeStop = { at: clock, deck: d, x, z };
    return true;
  }
  // (the message and its button stay until the player gets off, or rides or drives away from the bridge: letting go
  // of the throttle does not take them away)
  const atBridge = () => {
    if (!bridgeStop) return false;
    const on = !!(view && (view.self.driving || view.self.incar || view.self.astride));
    if (!on || Math.hypot(view.self.x - bridgeStop.x, view.self.z - bridgeStop.z) > 4) { bridgeStop = null; return false; }
    return true;
  };
  function getOffHere() {
    if (view.self.driving) return leaveVehicle();
    if (view.self.incar) return leaveOwnCar();
    if (view.self.astride) { const r = server.send({ type: 'moto.leave' }); if (r.ok) { moto.speed = 0; moto.lean = 0; bikeState.speed = 0; bikeState.lean = 0; stillSport(); predicted.x = r.x; predicted.z = r.z; } say(r); }
    return null;
  }
  // (at a bridge: to cross it; anywhere else at the habitation's edge: it is entered on foot)
  const BRIDGE_TEXT = { bridge: 'Get off your vehicle to cross the bridge', land: 'Get off your vehicle: the habitation is entered on foot' };
  const bridgeText = () => (bridgeStop && bridgeStop.deck && bridgeStop.deck.kind === 'land' ? BRIDGE_TEXT.land : BRIDGE_TEXT.bridge);
  const BRIDGE_PROMPT = { short: 'Get off', get text() { return bridgeText(); }, run: () => getOffHere() };
  { const off = $('bridge-stop-off'); if (off) off.addEventListener('click', () => { if (atBridge()) { getOffHere(); bridgeStop = null; $('bridge-stop').hidden = true; } }); }

  // While driving there is one thing E does: the job in front of you, or stepping out.
  function findDrivingPrompt() {
    const v = view.self.driving;
    const run = view.self.run;
    const near = (spot) => Math.hypot(predicted.x - spot.x, predicted.z - spot.z) <= RUN_RULES.reach;
    if (Math.abs(car.speed) > 1.5) return null;
    if (run && run.state === 'accepted' && near(run.from)) return { short: 'Load', text: `Load: ${lowerFirst(run.what)}`, run: () => say(server.send({ type: 'run.load' }), `Loaded. Take it to ${run.to.label}.`) };
    if (run && run.state === 'loaded' && near(run.to)) return { short: 'Deliver', text: `Deliver to ${run.to.label}: ${trText(run.fee)}`, run: () => say(server.send({ type: 'run.deliver' })) };
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
    // (on the ground, or getting up: nothing to be done until up again, so nothing is offered, 19 October 2026)
    if (view.self.down || view.self.dead) return null;
    if (atBridge()) return BRIDGE_PROMPT;
    if (view.self.driving) return findDrivingPrompt();
    if (view.self.incar) return Math.abs(carState.speed) > 1.5 ? null : { short: 'Get out', text: ownCar() ? `Get out of the ${ownCar().name}` : 'Get out of the car', run: leaveOwnCar };
    if (view.self.astride) return Math.abs(moto.speed) > 1.5 ? null : { short: ownSport() === 'inline-skates' ? 'Take off' : 'Get off', text: ownSport() === 'inline-skates' ? 'Take your skates off' : ownSport() ? `Get off the ${SPORTS[ownSport()].name}` : powerBike() ? `Get off the ${powerBike().name}` : 'Get off the motorcycle', run: () => { const r = server.send({ type: 'moto.leave' }); if (r.ok) { moto.speed = 0; moto.lean = 0; bikeState.speed = 0; bikeState.lean = 0; stillSport(); predicted.x = r.x; predicted.z = r.z; } say(r); } };
    if (view.self.fight) return null;
    if (view.self.riding) return { short: 'Get down', text: 'Get down from the okada', run: getDown };
    const here = predicted;
    const options = [];
    const add = (x, z, range, option) => { const d = Math.hypot(here.x - x, here.z - z); if (d <= range) options.push({ ...option, d: d - (option.bias || 0) }); };
    // in PostCivilWar PowerBike: the motorcycle on show nearest, to ask the salesman about; and the salesman himself
    if (showroom.inside) {
      const at = powerbikeDisplayNear(here.x, here.z, 1.7);
      if (at && POWER_BIKES[at.display.bike]) options.push({ d: at.gap - 1, short: 'Ask', text: ZONE_CAST.showroomStaff ? `Ask ${POWERBIKE.salesman} about the ${POWER_BIKES[at.display.bike].name}` : `Ask about the ${POWER_BIKES[at.display.bike].name}`, run: () => askAbout(at.display) });
      const s = salesman.state;
      if (ZONE_CAST.showroomStaff) add(s.x, s.z, 2.4, { short: 'Talk', text: `Talk to ${POWERBIKE.salesman}, the salesman`, run: () => ui.toast({ type: 'note', text: `${POWERBIKE.salesman}: "Welcome to ${POWERBIKE.name}! Every bike on the floor is for sale. Walk up to the one you like and ask me about it, and I'll tell you everything."` }) });
    }
    // in the Post Civil War Car Showroom: the car on show nearest, to ask about; and the two who sell them
    if (carshow.inside) {
      const at = carshowDisplayNear(here.x, here.z, 1.7);
      if (at && POWER_CARS[at.display.car]) options.push({ d: at.gap - 1, short: 'Ask', text: ZONE_CAST.showroomStaff ? `Ask ${sellerOf(at.display.car).spec.name} about the ${POWER_CARS[at.display.car].name}` : `Ask about the ${POWER_CARS[at.display.car].name}`, run: () => askAboutCar(at.display) });
      for (const s of ZONE_CAST.showroomStaff ? carSalesmen : []) {
        const other = carSalesmen.find((o) => o !== s).spec.name;
        add(s.sim.state.x, s.sim.state.z, 2.4, { short: 'Talk', text: `Talk to ${s.spec.name}`, run: () => ui.toast({ type: 'note', text: `${s.spec.name}: "Welcome to ${CARSHOW.name}! Every car on this floor is for sale. Walk up to the one you like and ask me about it. I look after this side of the hall, and ${other} the other."` }) });
      }
    }
    // in the Post Civil War Sports Mall: the thing on show nearest, to ask about
    if (sports.inside) {
      const at = sportsDisplayNear(here.x, here.z, 1.4);
      if (at && SPORTS[at.display.item]) options.push({ d: at.gap - 1, short: 'Ask', text: `Ask about the ${SPORTS[at.display.item].name}`, run: () => askAboutSport(at.display) });
    }
    // the player's own motorcycles, where they left them
    for (const b of (view.self.ownBikes && view.self.ownBikes.parked) || []) if (POWER_BIKES[b.bike]) add(b.x, b.z, 2.6, { bias: 1.4, short: 'Ride', text: `Ride your ${POWER_BIKES[b.bike].name}`, run: () => rideOwnBike(b.bike) });
    // and their things from the sports mall, where they left them (the skates: put on again)
    for (const b of (view.self.ownSports && view.self.ownSports.parked) || []) if (SPORT_HANDLING[b.item]) add(b.x, b.z, 2.2, { bias: 1.4, short: b.item === 'inline-skates' ? 'Put on' : 'Ride', text: b.item === 'inline-skates' ? 'Put your skates on' : `Ride your ${SPORTS[b.item].name}`, run: () => rideOwnSport(b.item) });
    // and their own cars (reached from beside a door: the car's own half-width and a step)
    for (const c of (view.self.ownCars && view.self.ownCars.parked) || []) if (POWER_CARS[c.car]) add(c.x, c.z, POWER_CARS[c.car].length / 2 + 1.6, { bias: 2.2, short: 'Drive', text: `Drive your ${POWER_CARS[c.car].name}`, run: () => enterOwnCar(c.car) });
    // one of the town's riders going slowly or standing, close by: theirs to take (sport-riders.js); and one taken and
    // left standing, to ride again
    for (const r of view.sportRiders || []) {
      const word = r.item === 'inline-skates' ? 'skates' : r.item === 'skateboard' ? 'skateboard' : 'bicycle';
      if (typeof r.person === 'number' && r.speed <= 3.4 && (r.mode === 'ride' || r.mode === 'stop')) { const who = known.get(r.person); add(r.x, r.z, 2.4, { bias: 0.4, short: 'Take', text: `Take the ${word} from ${who ? who.short : 'them'}`, run: () => takeSport(r.n) }); }
      if (r.mine && r.person === null && r.mode === 'kept') add(r.x, r.z, 2.4, { bias: 1.2, short: 'Ride', text: `Ride the ${word} you took`, run: () => retakeSport(r.n) });
    }
    // and a car of the town's they took and left standing (never theirs: traffic.js)
    for (const c of view.traffic || []) if (c.mine && c.mode === 'kept' && POWER_CARS[c.model]) add(c.x, c.z, POWER_CARS[c.model].length / 2 + 1.6, { bias: 2.2, short: 'Drive', text: `Drive the ${POWER_CARS[c.model].name} you took`, run: () => enterTakenCar(c.n) });
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
      add(station.standX, station.standZ, 1.7, { bias: 1, hold: true, short: 'Mould', text: `Hold to mould a block: ${trText(BUSINESSES.yard.wagePerBlock)} each`, intent: { type: 'job.mould', stationId: station.id } });
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
    // a car of their own: its own controls, as a power bike's
    if (self.incar && ownCar()) return 'car';
    // a power bike has its own controls (power-bikes.js); none is in the game until its model is supplied
    if (self.astride && ownSport()) return 'sport';
    if (self.astride && powerBike()) return 'powerbike';
    if (bikePreview) return 'powerbike';
    if (self.astride) return 'moto';
    if (self.riding) return 'riding';
    if (self.fight) return 'combat';
    if (self.swimming) return 'swimming';
    // a gun in the hands: the shooting screen (gun-play.js)
    if (gunPlay && gunPlay.out) return 'gun';
    return 'walking';
  }
  // Where the camera's choice of views comes from.
  const where = () => (view && (view.self.driving || view.self.astride || view.self.riding || view.self.incar) ? 'vehicle' : 'foot');

  // Who could be aimed at near the player (for a touch screen's pull of the aim toward someone close to it: gun-play.js):
  // the other players who can be shot as their own games say (above 20, on their feet), and the police officers near,
  // each at their chest
  function gunTargets() {
    const out = [];
    for (const q of shownPeers) {
      if (Math.hypot(q.x - predicted.x, q.z - predicted.z) > 70) continue;
      const able = Number.isFinite(q.health) && q.health > 20 && !q.vehicle && !q.ride && !q.sport && !q.car && !q.swimming && !q.held && !q.down;
      out.push({ x: q.x, y: zoneGroundY(q.x, q.z) + (q.gun && q.gun.crouch ? 0.85 : 1.25), z: q.z, able });
    }
    if (crowd) for (const a of crowd.actors()) {
      const who = known.get(a.i);
      if (!who || !who.police || a.d === undefined || a.d > 70 || a.pose === 3) continue;
      out.push({ x: a.x, y: zoneGroundY(a.x, a.z) + 1.25, z: a.z, able: true });
    }
    return out;
  }

  // Who and what is within reach for the things that are only sometimes on
  // offer: someone to square up to, a pocket, a vehicle at its driver's side.
  function findNear() {
    const out = { fight: null, steal: null, take: null };
    const self = view.self;
    if (self.driving || self.riding || self.astride || self.incar || self.law.arrest || self.carried || self.hijack) return out;
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
      // (at 20, the 20-life rule: offered greyed)
      if (out.fight && out.fight.kind === 'npc' && out.fight.id === actor.i) { const mood = view.moods.find((q) => q.i === actor.i); if (mood && mood.health <= 20) out.fight.spent = true; }
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
    // a car of the town's standing still with its driver at the wheel (traffic.js), from beside either front door
    if (!out.take) for (const c of view.traffic || []) {
      if (!c.stopped || c.mode === 'kept' || !POWER_CARS[c.model] || !driverSide('car', c, predicted.x, predicted.z).ok) continue;
      const driver = known.get(c.person);
      out.take = { car: c.n, text: `Take ${driver ? `${driver.short}'s` : 'the'} ${POWER_CARS[c.model].name}` };
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
    // (the view: C on a keyboard; on a touch screen there is no button for it since 30 October 2026, the owner's word:
    // "remove that camera icon on the screen": a finger drags the view round and two pinch it in and out)
    const look = { id: 'camera', key: 'c', label: 'View', hint: 'Change the view', keyOnly: true };
    if (m === 'swimming') {
      // in the river: the right hand strokes (held, faster); near the bank, a way out. The left hand is the stick.
      const list = [{ id: 'stroke', key: 'Shift', label: 'Stroke', icon: 'hand', kind: 'hold', primary: true, hint: 'Hold to swim harder' }];
      if (self.swimming.nearBank) list.push({ id: 'climb', key: 'e', label: 'Climb out', icon: 'climb', hint: 'Climb out onto the bank' });
      return list;
    }
    if (m === 'walking') {
      const list = [main];
      if (!self.critical) list.push({ id: 'run', key: 'Shift', label: 'Run', kind: 'toggle', pressed: input.run, hint: 'Hold Shift, or switch Run on' });
      // (22 October 2026, the owner: a jump, every figure's own)
      if (!self.critical && me && me.animated) list.push({ id: 'jump', key: 'Space', label: 'Jump', icon: 'jump', hint: 'Jump (Space)' });
      // at the water's edge: what the river needs, and nothing that does not (no fights, no taking vehicles)
      if (self.byWater && !self.critical) {
        list.push({ id: 'swim', key: 'q', label: 'Swim', icon: 'swim', hint: 'Go into the river' });
        if (self.law.state === 'wanted' || self.law.state === 'pursuit') list.push({ id: 'surrender', key: 'u', label: 'Give up', hint: 'Give yourself up to the police' });
        return list;
      }
      // the gun (25 October 2026): everyone has the rifle; at 20, it cannot be used (the 20-life rule: shown, greyed)
      if (gunPlay) list.push({ id: 'gun', key: 'x', label: 'Gun', icon: 'gun', off: !!self.critical, hint: self.critical ? 'You are badly hurt: you cannot use a gun' : 'Take out your gun (X)' });
      if (near.fight && !self.critical) list.push({ id: 'fight', key: 'f', label: 'Fight', tone: 'warn', off: !!near.fight.spent, hint: near.fight.spent ? `${near.fight.name} is badly hurt. Leave them.` : `Square up to ${near.fight.name}` });
      if (near.take && !self.critical) list.push({ id: 'take', key: 'g', label: 'Take', tone: 'warn', hint: near.take.text });
      if (near.steal && !self.critical) list.push({ id: 'steal', key: voiceChat.on ? 'j' : 'b', label: 'Steal', tone: 'warn', hint: `Pick ${near.steal.name}'s pocket` });
      if (self.critical) list.push({ id: 'ambulance', key: 'h', label: 'Help', hint: 'Call an ambulance' });
      if (self.law.state === 'wanted' || self.law.state === 'pursuit') list.push({ id: 'surrender', key: 'u', label: 'Give up', hint: 'Give yourself up to the police' });
      // the view (19 October 2026, the owner's brief: the camera button kept, and on foot too): on the street close
      // behind, further back, over the shoulder, from above; since 30 October on a keyboard only (C).
      list.push(look);
      return list;
    }
    // With a gun out (22 October 2026, the owner's picture of the shooting screen: "ALL other action buttons disappear,
    // except the camera adjustment button(s)"; 25 October 2026: aim, shoot, reload, switch weapon, crouch, jump, the
    // camera, and what can be used where the player is, where there is something): Shoot the large one at the lower
    // right, Aim above it, the rest round them; on a keyboard and mouse, each has its key (the mouse's buttons shoot
    // and aim).
    if (m === 'gun') {
      const g = self.gun || {};
      const reloading = !!g.reloading;
      const list = [
        { id: 'shoot', key: 'f', label: 'Shoot', icon: 'shoot', kind: 'hold', primary: true, drag: true, off: reloading || gunPlay.running, hint: reloading ? 'Reloading' : 'Hold to shoot (F, or the mouse\'s left button). Drag it to aim as you shoot' },
        { id: 'aim', key: 'q', label: 'Aim', icon: 'aim', kind: 'toggle', pressed: gunPlay.sighting, off: gunPlay.running, hint: 'Aim through the sight (the mouse\'s right button, or Q)' },
        { id: 'reload', key: 'r', label: 'Reload', icon: 'reload', off: reloading || (g.mag >= g.magazine) || g.spare <= 0, hint: reloading ? 'Reloading' : g.spare <= 0 ? 'No rounds left to reload with' : 'Reload (R)' },
      ];
      if (prompt && prompt.short) list.push({ ...main, primary: false, hint: `${prompt.text} (E)` });
      list.push({ id: 'crouch', key: 'c', label: 'Crouch', icon: 'crouch', kind: 'toggle', pressed: gunPlay.crouched, hint: 'Crouch (C)' });
      if (me && me.animated) list.push({ id: 'jump', key: 'Space', label: 'Jump', icon: 'jump', hint: 'Jump (Space)' });
      if (!(prompt && prompt.short)) list.push({ id: 'switch', key: 'g', label: 'Guns', icon: 'switch', hint: 'Your guns (G)' });
      // (the whole scene for five seconds: V on a keyboard, two fingers pinched together on a touch screen, 30 October 2026)
      list.push({ id: 'overview', key: 'v', label: 'View', icon: 'camera', kind: 'toggle', pressed: gunPlay.overviewing, hint: 'See all round you for five seconds (V)', keyOnly: true });
      list.push({ id: 'holster', key: 'x', label: 'Put away', icon: 'holster', hint: 'Put your gun away (X)' });
      return list;
    }
    if (m === 'combat') {
      // (the one faced at 20, the 20-life rule: nobody may strike them; the blows greyed, only stepping away left)
      const foe = self.fight && self.fight.target;
      const spent = !!foe && Number.isFinite(foe.health) && foe.health <= 20;
      const why = spent ? `${foe.name} is badly hurt. Leave them.` : '';
      return [
        { id: 'punch', key: 'f', label: 'Punch', primary: true, tone: 'warn', off: spent, hint: why },
        { id: 'heavy', key: 'g', label: 'Heavy', off: spent, hint: why }, { id: 'kick', key: 'r', label: 'Kick', off: spent, hint: why },
        { id: 'block', key: 'q', label: 'Block', kind: 'hold', pressed: blocking }, { id: 'dodge', key: 'Space', label: 'Dodge' },
        { id: 'shove', key: 'z', label: 'Shove', off: spent, hint: why }, { id: 'grab', key: 'x', label: 'Grab', off: spent, hint: why },
        { id: 'leave', key: 'v', label: 'Leave', hint: 'Step back from the fight' },
      ];
    }
    // At the wheel of anything with three wheels or more: on a touch screen, nothing but the wheel (the stick, on
    // the left) and, on the right, the accelerator, the brake, the horn, and the door to step out by. The view
    // is still C on a keyboard.
    if (m === 'driving' && coarse && wheelLayout()) return [{ id: 'gas', label: 'Accelerate', icon: 'pedalgas', shape: 'pedal-tall', kind: 'hold', primary: true, hint: 'Hold to go' }, { id: 'brake', label: 'Brake', icon: 'pedalbrake', shape: 'pedal-wide', kind: 'hold', hint: 'Hold to brake, and to go back' }, { id: 'horn', key: 'h', label: 'Horn', icon: 'horn' }, { ...main, primary: false, icon: 'getout', label: (prompt && prompt.short) || 'Step out' }, { ...look, keyOnly: true }];
    if (m === 'driving') return [...pedals, out, { id: 'horn', key: 'h', label: 'Horn' }, look];
    if (m === 'moto') return [...pedals, out, { id: 'horn', key: 'h', label: 'Horn' }, look];
    // On a thing from the sports mall: the power bike's layout, the pedal named for what moves it (the bicycle's pedals,
    // a push, a stride, the motor), its bell if it has one, and getting off.
    if (m === 'sport') {
      const id = ownSport() || 'bicycle', drive = SPORT_HANDLING[id] ? SPORT_HANDLING[id].drive : 'motor';
      const go = drive === 'pedals' ? ['Pedal', 'Hold to pedal'] : drive === 'push' ? ['Push', 'Hold to push along'] : drive === 'stride' ? ['Skate', 'Hold to skate'] : ['Go', 'Hold to go'];
      return [{ id: 'throttle', label: go[0], icon: 'pedalgas', shape: 'pedal-tall', kind: 'hold', primary: true, hint: go[1] }, { id: 'brake', label: 'Brake', icon: 'pedalbrake', shape: 'pedal-wide', kind: 'hold', hint: 'Hold to slow down' }, { id: 'steer-left', label: 'Lean left', icon: 'chevleft', kind: 'hold' }, { id: 'steer-right', label: 'Lean right', icon: 'chevright', kind: 'hold' }, ...(SPORT_BELL.includes(id) ? [{ id: 'horn', key: 'h', label: 'Bell', icon: 'horn' }] : []), { ...out, primary: false, icon: 'getoff' }, { ...look, keyOnly: true }];
    }
    // On a power bike: its own layout, on a touch screen and with a keyboard alike. Steering arrows at the lower
    // left, the throttle and the brake at the right, the horn at the top, and getting off.
    if (m === 'powerbike') return [{ id: 'throttle', label: 'Throttle', icon: 'pedalgas', shape: 'pedal-tall', kind: 'hold', primary: true, hint: 'Hold to accelerate' }, { id: 'brake', label: 'Brake', icon: 'pedalbrake', shape: 'pedal-wide', kind: 'hold', hint: 'Hold to brake' }, { id: 'steer-left', label: 'Steer left', icon: 'chevleft', kind: 'hold' }, { id: 'steer-right', label: 'Steer right', icon: 'chevright', kind: 'hold' }, { id: 'horn', key: 'h', label: 'Horn', icon: 'horn' }, { ...out, primary: false, icon: 'getoff' }, { ...look, keyOnly: true }];
    // In a car: the same layout as on a power bike (the arrows steer; the accelerator and the brake at the right), the
    // horn, and the door to get out by.
    if (m === 'car') return [{ id: 'throttle', label: 'Accelerate', icon: 'pedalgas', shape: 'pedal-tall', kind: 'hold', primary: true, hint: 'Hold to accelerate' }, { id: 'brake', label: 'Brake', icon: 'pedalbrake', shape: 'pedal-wide', kind: 'hold', hint: 'Hold to brake, and to back up' }, { id: 'steer-left', label: 'Steer left', icon: 'chevleft', kind: 'hold' }, { id: 'steer-right', label: 'Steer right', icon: 'chevright', kind: 'hold' }, { id: 'horn', key: 'h', label: 'Horn', icon: 'horn' }, { ...out, primary: false, icon: 'getout', label: (prompt && prompt.short) || 'Get out' }, { ...look, keyOnly: true }];
    if (m === 'riding') return [main, look];
    if (m === 'custody') return [{ id: 'custody', key: 'e', label: 'Police', primary: true, hint: 'Your arrest: the fine, a phone call, the time to serve' }, { id: 'phone', key: 'o', label: 'Phone', keyOnly: true }];
    if (m === 'taking') return [{ id: 'cancel', key: 'e', label: 'Stop', primary: true, hint: 'Let go' }];
    if (m === 'carried') return [];
    return [];
  }

  function showControls() {
    const next = controlMode();
    if (next !== mode) {
      const was = mode;
      mode = next;
      controls.setRun(false);
      if (blocking) { blocking = false; }
      // (the view the player had before the gun came out comes back when it goes)
      if (mode === 'gun') { if (was !== 'gun') viewBeforeGun = rig.view; }
      else { if (was === 'gun' && viewBeforeGun) { rig.view = viewBeforeGun; cam.pitch = Math.max(STREET.low, Math.min(STREET.high, cam.pitch)); } rig.view = viewFor(rig.view, where()); if (document.pointerLockElement) document.exitPointerLock(); }
      $('touch').classList.toggle('armed', mode === 'gun');
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
    // on a power bike the stick goes and the bike's own buttons come; anything else, and they go again
    const onBike = mode === 'powerbike' || mode === 'car' || mode === 'sport';
    if ($('touch').classList.contains('bike') !== onBike) { $('touch').classList.toggle('bike', onBike); $('hud').classList.toggle('bike', onBike); }
    keymap.clear();
    for (const b of list) if (b.key && b.key !== 'Shift') keymap.set(b.key, b);
    ui.setKeys(mode === 'walking' || mode === 'gun' || mode === 'combat' || mode === 'driving' || mode === 'moto' || mode === 'powerbike' || mode === 'sport' || mode === 'car' || mode === 'riding' || mode === 'custody' || mode === 'taking' || mode === 'carried' ? list : [], (id, phase) => act(id, phase));
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
  // A jump (22 October 2026): the player's figure leaps where it is, or as it goes, for everyone near to see. Only a
  // movement of the body: nothing is jumped over or onto (a deck's rails, deep water and the rest stay as they are).
  function jump() {
    if ((mode !== 'walking' && mode !== 'gun') || !me || !me.animated || view.self.swimming) return;
    const result = server.send({ type: 'jump' });
    if (result.ok) me.jump(0);
  }
  // In the habitation, water too deep to wade stops whoever walks into it: they are told why, now and then (22 October
  // 2026, the owner: the river was waded into, and then could not be gone on in, and nothing said why).
  let deepToldAt = -99;
  function deepAhead(x, z) {
    if (clock - deepToldAt < 30) return;
    const f = habitationFooting(x, z);
    if (!f || f.kind !== 'water') return;
    deepToldAt = clock;
    ui.toast({ type: 'note', text: 'The water is too deep to wade on here. Swimming in the swamps is not advisable.' });
  }
  function act(id, phase) {
    if (!playing || !view) return;
    if (gunPlay && (id === 'shoot' || id === 'aim')) {
      // (a press and a letting go of Shoot; Aim pressed switches the sight on and off, held with the mouse it is held)
      if (id === 'aim' && phase === 'up') return;
      if (phase === 'down' || phase === 'up') gunPlay.act(id, phase);
      else if (phase === 'hold-down' || phase === 'hold-up') gunPlay.act(id, phase);
      showControls();
      return;
    }
    if (id === 'block') {
      const on = phase === 'down';
      if (view.self.fight) { server.send({ type: 'combat.block', on }); blocking = on; }
      return;
    }
    if (phase !== 'down' || ui.isOpen()) return;
    const said = (result, good) => { refreshView(); if (!result.ok) ui.toast({ type: 'note', text: result.message }); else if (good) ui.toast({ type: 'note', text: good }); return result; };
    switch (id) {
      case 'act': if (gunPlay && gunPlay.out) gunPlay.putAway(); pressAct(); break;
      case 'run': controls.setRun(!input.run); break;
      case 'gun': if (gunPlay) { if (ui.usingPhone()) ui.close(); gunPlay.act('gun', 'down'); refreshView(); showControls(); } break;
      case 'holster': case 'reload': case 'crouch': case 'switch': case 'overview': if (gunPlay) { gunPlay.act(id, 'down'); showControls(); } break;
      case 'jump': jump(); break;
      case 'swim': { const r = said(server.send({ type: 'swim.in' }), 'You wade in and swim.'); if (r.ok) { predicted.x = r.x; predicted.z = r.z; predicted.heading = 0; going.speed = 0; } break; }
      case 'climb': { const r = said(server.send({ type: 'swim.out' }), 'You climb out onto the bank.'); if (r.ok) { predicted.x = r.x; predicted.z = r.z; predicted.heading = Math.PI; going.speed = 0; } break; }
      case 'horn': { if (ownSport()) { if (SPORT_BELL.includes(ownSport())) { audio.cycleBell(); server.send({ type: 'moto.horn' }); } break; } if (view.self.incar) { audio.carHorn(ownCar() ? ownCar().id : null); server.send({ type: 'car.horn' }); break; } const bike = powerBike(); if (bike) audio.bikeHorn(bike.horn); else if (bikePreview) audio.bikeHorn('dual'); else audio.horn(); if (!bikePreview) server.send({ type: view.self.driving ? 'vehicle.horn' : 'moto.horn' }); break; }
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
      case 'take': if (near.take) said(server.send({ type: 'hijack.start', okada: near.take.okada, vehicle: near.take.vehicle, car: near.take.car })); break;
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
  // (with the phone in the hand the vehicle is still driven: only a page over the whole screen takes the controls
  // away, as it does on foot; 18 October 2026, the owner's brief: the phone used while riding or driving, the
  // vehicle still under control. Until then the phone in the hand let go of the throttle, the brake and the steering)
  function driveVehicle(dt) {
    const v = view.self.driving;
    const k = VEHICLE_KINDS[v.kind];
    const axes = uiBlocks() ? { forward: 0, strafe: 0 } : controls.axes();
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
    if (stopsAtBridge(nx, nz, predicted.heading + (car.speed < 0 ? Math.PI : 0), 1.7)) { car.speed = 0; return 0; }
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

  // The power bike the player is on, if it is one (its entry in POWER_BIKES), and a preview of its controls for
  // the browser tests: `bikePreview` puts the riding controls on screen with nothing to ride (see __nlw).
  let bikePreview = false;
  const powerBike = () => { const a = view && view.self.astride; return a && a.model && POWER_BIKES[a.model] ? POWER_BIKES[a.model] : null; };
  const bikeState = { speed: 0, lean: 0, heading: 0, throttle: 0, steer: 0, braking: false };
  const SHAKE = 0.022;                 // metres: the most the view shakes at a motorcycle's top speed
  const shakeBy = new THREE.Vector3(), shakeAim = new THREE.Vector3();
  // On one of the player's own motorcycles: where they left it if they are beside it, or brought to them
  // (from Property on the phone). The simulation decides; the bike is fetched the first time it is ridden.
  function rideOwnBike(id) {
    if (!view) return { ok: false };
    const r = server.send({ type: 'bikes.ride', bike: id });
    if (r.ok) { audio.stopPreview(); ui.close(); bikeState.speed = 0; bikeState.lean = 0; moto.speed = 0; moto.lean = 0; predicted.x = r.x; predicted.z = r.z; predicted.heading = r.h; refreshView(); }
    say(r);
    return r;
  }
  // What the server says this player owns, passed to the town whenever it changes: only those can be ridden.
  let bikesSent = null, mineAskedAt = -1e9;
  function syncOwnBikes() {
    if (!playing || !view) return;
    if (!market.state.mine) { if (online.signedIn && clock - mineAskedAt > 30) { mineAskedAt = clock; market.mine(); } return; }
    const ids = market.state.mine.holdings.map((h) => (h.asset.model || '').replace(/^bike:/, '')).filter((id) => POWER_BIKES[id]).sort();
    const key = ids.join(',');
    if (key === bikesSent) return;
    const r = server.send({ type: 'bikes.owned', bikes: ids });
    if (r.ok) bikesSent = key;
  }
  // Meeting something on a power bike (19 October 2026, the owner's brief and video: a rider was thrown off on open
  // grass with nothing in front of him; contact.js says why that cannot happen now). What comes of it is how hard the
  // bike goes INTO what it meets: brushing along a wall it scrapes along, a little slower, turned a little to follow
  // it; a knock stops it dead with a jolt and a step back, the rider still on; only a real crash throws the rider, and
  // the town decides that (own-bikes.js `crash`), from what it knows. The edge of what is built (the end of the map,
  // the river's bank) is never something to be thrown by. Returns where the bike goes on to, sliding, or null.
  let scrapedAt = -10;
  function meetWithBike(dt, nx, nz, boxes, handling, forced = null) {
    const r = handling.radius;
    const free = (x, z) => zoneWalkable(x, z, boxes, r);
    const kind = forced || zoneBlockKind(nx, nz, boxes, r) || 'solid';
    const normal = contactNormal(free, predicted.x, predicted.z, nx, nz);
    const c = contactOutcome({ speed: bikeState.speed, heading: bikeState.heading, normal, kind });
    if (c.outcome === 'slide' && !forced) {
      const sx = predicted.x + c.alongX * CONTACT.slideLoss * dt, sz = predicted.z + c.alongZ * CONTACT.slideLoss * dt;
      if (c.along > 0.25 && free(sx, sz)) {
        const way = Math.atan2(c.alongX, c.alongZ) + (bikeState.speed < 0 ? Math.PI : 0);
        bikeState.heading += angleGap(way, bikeState.heading) * Math.min(1, dt * 5);
        bikeState.speed = Math.sign(bikeState.speed) * c.along * CONTACT.slideLoss;
        moto.speed = bikeState.speed;
        if (c.into > 0.8 && clock - scrapedAt > 0.4) { scrapedAt = clock; audio.blow('block', predicted.x, predicted.z); }
        return { x: sx, z: sz };
      }
      bikeState.speed = 0; moto.speed = 0;
      return null;
    }
    if (c.outcome === 'crash') { crashOrStop(c, normal, kind); return null; }
    knockBike(c, normal, kind, handling);
    return null;
  }
  // Stopped dead against it: a jolt and a step back off it, as far as there is room (a hand's width to a third of a
  // metre, by how hard); the rider stays on.
  function knockBike(c, normal, kind, handling) {
    bikeState.speed = 0; moto.speed = 0; bikeState.lean *= 0.3; moto.lean = bikeState.lean;
    if (c.into < CONTACT.scrape * 0.6) return;
    const back = Math.min(0.35, 0.06 + c.into * 0.045);
    const bx = predicted.x + normal.x * back, bz = predicted.z + normal.z * back;
    if (zoneWalkable(bx, bz, structureBoxes(), handling.radius)) {
      const r = server.send({ type: 'moto.drive', x: bx, z: bz, heading: bikeState.heading, lean: 0, speed: 0, throttle: 0, brake: true, rev: 0, steer: bikeState.steer });
      if (r.ok) { predicted.x = bx; predicted.z = bz; }
    }
    kick(Math.min(1, c.into / CONTACT.knock), normal);
    audio.blow(kind === 'barrier' ? 'shove' : 'block', predicted.x, predicted.z);
    if (c.into > CONTACT.scrape) jolt();
  }
  // A crash: the town is asked, and decides (own-bikes.js `crash`: it looks for itself at what is there and how fast it
  // saw the bike go). Thrown, the rider goes over the bars and lands ahead (falls.js shows it); not thrown, a knock.
  function crashOrStop(c, normal, kind) {
    const speed = bikeState.speed, heading = bikeState.heading;
    const handling = handlingOf(powerBike() || {});
    const r = server.send({ type: 'moto.crash', speed, heading });
    if (r.ok && r.fell) {
      bikeState.speed = 0; moto.speed = 0; bikeState.lean = 0; moto.lean = 0;
      predicted.x = r.x; predicted.z = r.z;
      kick(1, normal);
      jolt();
      audio.blow('fall', r.bike.x, r.bike.z);
      ui.toast({ type: 'alert', title: 'Thrown off', text: `You hit it at ${r.kmh} km/h and were thrown off. Your ${POWER_BIKES[r.bike.id].name} is where it fell.` });
      refreshView();
      return;
    }
    knockBike(c, normal, kind, handling);
  }
  // A power bike under the player's hands: it leans into a turn and turns by leaning (power-bikes.js).
  function drivePowerBike(dt, bike) {
    const input = uiBlocks() ? { steer: 0, throttle: 0, brake: 0 } : controls.bike();
    const handling = handlingOf(bike);
    bikeState.heading = predicted.heading;
    const tar = motoSpeedAt(predicted.x, predicted.z, false) === MOTO.speedRoad;
    stepPowerBike(bikeState, input, dt, { handling, onTar: tar, wet: view.weather.wet });
    bikeState.throttle = input.throttle; bikeState.braking = input.brake > 0;
    // the bars, as they are seen: turned by the steering at walking pace, hardly at all at speed
    bikeState.steer += (input.steer * 0.42 * Math.max(0.08, 1 - Math.abs(bikeState.speed) / 7) - bikeState.steer) * Math.min(1, dt * 8);
    moto.speed = bikeState.speed; moto.lean = bikeState.lean;
    if (Math.abs(bikeState.speed) < 0.03) return 0;
    let nx = predicted.x + Math.sin(bikeState.heading) * bikeState.speed * dt;
    let nz = predicted.z + Math.cos(bikeState.heading) * bikeState.speed * dt;
    if (stopsAtBridge(nx, nz, bikeState.heading + (bikeState.speed < 0 ? Math.PI : 0), 1.2)) { bikeState.speed = 0; moto.speed = 0; return 0; }
    // into something: along it, against it, or a crash (meetWithBike); never through it
    const boxes = structureBoxes();
    if (!zoneWalkable(nx, nz, boxes, handling.radius)) {
      const on = meetWithBike(dt, nx, nz, boxes, handling);
      if (!on) return 0;
      nx = on.x; nz = on.z;
    }
    // (with what the bike is doing, for other players to see and hear: its lean, speed, throttle, brake and revs)
    const result = server.send({ type: 'moto.drive', x: nx, z: nz, heading: bikeState.heading, lean: bikeState.lean, speed: bikeState.speed, throttle: bikeState.throttle, brake: bikeState.braking, rev: bikeRevs(bikeState.speed, bikeState.throttle, handling), steer: bikeState.steer });
    if (result.ok) { predicted.x = nx; predicted.z = nz; predicted.heading = bikeState.heading; if (result.hit) bikeState.speed = 0; }
    // (the town saw something in the way that the page did not: a vehicle, a gate)
    else if (result.code === 'BLOCKED') { meetWithBike(dt, nx, nz, boxes, handling, 'solid'); return 0; }
    else { const truth = host.game.view(playerId).self; predicted.x = truth.x; predicted.z = truth.z; bikeState.speed = 0; }
    if (clock - cam.lastDrag > 1.5 && bikeState.speed > 0.8) cam.yaw += angleGap(predicted.heading, cam.yaw) * Math.min(1, dt * 2.2);
    return Math.abs(bikeState.speed);
  }

  // A motorcycle under the player's own hands: quicker than a keke and it leans into a turn.
  function driveMoto(dt) {
    const bike = powerBike();
    if (bike) return drivePowerBike(dt, bike);
    const axes = uiBlocks() ? { forward: 0, strafe: 0 } : controls.axes();
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
    if (stopsAtBridge(nx, nz, predicted.heading + (moto.speed < 0 ? Math.PI : 0), 1.1)) { moto.speed = 0; return 0; }
    if (!zoneWalkable(nx, nz, structureBoxes(), MOTO.radius)) { moto.speed = 0; return 0; }
    const result = server.send({ type: 'moto.drive', x: nx, z: nz, heading: predicted.heading });
    if (result.ok) { predicted.x = nx; predicted.z = nz; if (result.hit) moto.speed = 0; } else { const truth = host.game.view(playerId).self; predicted.x = truth.x; predicted.z = truth.z; moto.speed = 0; }
    if (clock - cam.lastDrag > 1.5 && moto.speed > 0.8) cam.yaw += angleGap(predicted.heading, cam.yaw) * Math.min(1, dt * 2.6);
    return Math.abs(moto.speed);
  }

  // --- the player's things from the sports mall (31 October 2026) ---
  // The one they ride, if they ride one (its id), and how it is going (sport-ride.js: pedalled, pushed, skated, or by its
  // motor; leaned into a turn as a motorcycle is; the hoverboard turned on the spot).
  const ownSport = () => { const a = view && view.self.astride; return a && a.sport && SPORT_HANDLING[a.sport] ? a.sport : null; };
  const sportState = { speed: 0, lean: 0, heading: 0, phase: 0, pushing: false, throttle: 0, steer: 0, braking: false, sentHeading: 0 };
  const stillSport = () => { sportState.speed = 0; sportState.lean = 0; sportState.steer = 0; sportState.throttle = 0; sportState.braking = false; };
  // On one of them: where they left it if they are beside it, or brought to them (from Property on the phone); the
  // skates put on. The town decides; it is fetched the first time it is ridden.
  function rideOwnSport(id) {
    if (!view) return { ok: false };
    const r = server.send({ type: 'sports.ride', item: id });
    if (r.ok) { ui.close(); stillSport(); sportState.phase = 0; moto.speed = 0; moto.lean = 0; predicted.x = r.x; predicted.z = r.z; predicted.heading = r.h; sportState.sentHeading = r.h; refreshView(); }
    say(r);
    return r;
  }
  // Taking one from one of the town's riders (31 October 2026): they are pushed off and run, the police are told; it is
  // ridden as one's own, but it is never theirs (sport-riders.js). And back on one taken and left standing.
  function takeSport(n) {
    if (!view) return { ok: false };
    const r = server.send({ type: 'sports.take', n });
    if (r.ok) { ui.close(); stillSport(); sportState.phase = 0; moto.speed = 0; moto.lean = 0; predicted.x = r.x; predicted.z = r.z; predicted.heading = r.h; sportState.sentHeading = r.h; refreshView(); ui.toast({ type: 'alert', title: 'Taken', text: `You took ${r.name ? `${r.name}'s` : 'the'} ${r.item === 'inline-skates' ? 'skates' : r.item === 'skateboard' ? 'skateboard' : 'bicycle'}. It is not yours: it cannot be sold, and the police will take it back.` }); }
    else say(r);
    return r;
  }
  function retakeSport(n) {
    if (!view) return { ok: false };
    const r = server.send({ type: 'sports.retake', n });
    if (r.ok) { ui.close(); stillSport(); sportState.phase = 0; moto.speed = 0; moto.lean = 0; predicted.x = r.x; predicted.z = r.z; predicted.heading = r.h; sportState.sentHeading = r.h; refreshView(); }
    else say(r);
    return r;
  }
  // What the server says this player owns from the mall, passed to the town whenever it changes (the motorcycles' sync
  // asks the server for it): only those can be ridden.
  let sportsSent = null;
  function syncOwnSports() {
    if (!playing || !view || !market.state.mine) return;
    const ids = market.state.mine.holdings.map((h) => String((h.asset && h.asset.model) || '')).filter((m) => m.startsWith('sport:') && SPORTS[m.slice(6)]).map((m) => m.slice(6)).sort();
    const key = ids.join(',');
    if (key === sportsSent) return;
    const r = server.send({ type: 'sports.owned', items: ids });
    if (r.ok) sportsSent = key;
  }
  // Meeting something on it, as on a motorcycle (meetWithBike): along a wall it scrapes along; harder it stops dead with
  // a jolt; a real crash throws the rider, and the town decides that (own-sports.js `crash`).
  function meetWithSport(dt, nx, nz, boxes, h, forced = null) {
    const free = (x, z) => zoneWalkable(x, z, boxes, h.room);
    const kind = forced || zoneBlockKind(nx, nz, boxes, h.room) || 'solid';
    const normal = contactNormal(free, predicted.x, predicted.z, nx, nz);
    const c = contactOutcome({ speed: sportState.speed, heading: sportState.heading, normal, kind });
    if (c.outcome === 'slide' && !forced) {
      const sx = predicted.x + c.alongX * CONTACT.slideLoss * dt, sz = predicted.z + c.alongZ * CONTACT.slideLoss * dt;
      if (c.along > 0.25 && free(sx, sz)) {
        sportState.heading += angleGap(Math.atan2(c.alongX, c.alongZ), sportState.heading) * Math.min(1, dt * 5);
        sportState.speed = c.along * CONTACT.slideLoss;
        moto.speed = sportState.speed;
        if (c.into > 0.8 && clock - scrapedAt > 0.4) { scrapedAt = clock; audio.blow('block', predicted.x, predicted.z); }
        return { x: sx, z: sz };
      }
      sportState.speed = 0; moto.speed = 0;
      return null;
    }
    if (c.outcome === 'crash') {
      const r = server.send({ type: 'moto.crash', speed: sportState.speed, heading: sportState.heading });
      if (r.ok && r.fell) {
        stillSport(); moto.speed = 0; moto.lean = 0;
        predicted.x = r.x; predicted.z = r.z;
        kick(1, normal); jolt();
        audio.blow('fall', r.item.x, r.item.z);
        ui.toast({ type: 'alert', title: 'Thrown off', text: `You hit it at ${r.kmh} km/h and came off. Your ${SPORTS[r.item.id].name} is where it fell.` });
        refreshView();
        return null;
      }
    }
    // stopped dead against it: a jolt and a step back off it; the rider stays on
    sportState.speed = 0; moto.speed = 0; sportState.lean *= 0.3; moto.lean = sportState.lean;
    if (c.into < CONTACT.scrape * 0.6) return null;
    const back = Math.min(0.3, 0.05 + c.into * 0.04);
    const bx = predicted.x + normal.x * back, bz = predicted.z + normal.z * back;
    if (zoneWalkable(bx, bz, structureBoxes(), h.room)) {
      const r = server.send({ type: 'moto.drive', x: bx, z: bz, heading: sportState.heading, lean: 0, speed: 0, throttle: 0, brake: true, steer: sportState.steer, phase: sportState.phase });
      if (r.ok) { predicted.x = bx; predicted.z = bz; }
    }
    kick(Math.min(1, c.into / CONTACT.knock), normal);
    audio.blow(kind === 'barrier' ? 'shove' : 'block', predicted.x, predicted.z);
    if (c.into > CONTACT.scrape) jolt();
    return null;
  }
  // Riding it: the pedal (or push, or skate, or go) button and the brake, the arrows to lean it into a turn (the
  // hoverboard turns on the spot); off the tar it goes slower (a skateboard and skates hardly at all).
  function driveSport(dt, id) {
    const h = SPORT_HANDLING[id];
    const input = uiBlocks() ? { steer: 0, throttle: 0, brake: 0 } : controls.bike();
    sportState.heading = predicted.heading;
    const tar = motoSpeedAt(predicted.x, predicted.z, false) === MOTO.speedRoad;
    stepSport(sportState, input, dt, { handling: h, onTar: tar, wet: view.weather.wet });
    sportState.throttle = input.throttle; sportState.braking = input.brake > 0;
    // the bars, as they are seen: turned by the steering at walking pace, hardly at all at speed (left positive)
    sportState.steer += (-input.steer * 0.45 * Math.max(0.1, 1 - Math.abs(sportState.speed) / 6) - sportState.steer) * Math.min(1, dt * 8);
    moto.speed = sportState.speed; moto.lean = sportState.lean;
    if (Math.abs(sportState.speed) < 0.03) {
      // standing still: turned on the spot (the hoverboard), the town is told which way it now faces
      predicted.heading = sportState.heading;
      if (Math.abs(angleGap(sportState.heading, sportState.sentHeading)) > 0.03) { const r = server.send({ type: 'moto.drive', x: predicted.x, z: predicted.z, heading: sportState.heading, lean: 0, speed: 0, throttle: sportState.throttle, brake: sportState.braking, steer: sportState.steer, phase: sportState.phase }); if (r.ok) sportState.sentHeading = sportState.heading; }
      return 0;
    }
    let nx = predicted.x + Math.sin(sportState.heading) * sportState.speed * dt;
    let nz = predicted.z + Math.cos(sportState.heading) * sportState.speed * dt;
    if (stopsAtBridge(nx, nz, sportState.heading + (sportState.speed < 0 ? Math.PI : 0), 1.0)) { stillSport(); moto.speed = 0; return 0; }
    const boxes = structureBoxes();
    if (!zoneWalkable(nx, nz, boxes, h.room)) {
      const on = meetWithSport(dt, nx, nz, boxes, h);
      if (!on) return 0;
      nx = on.x; nz = on.z;
    }
    // (with what it is doing, for other players to see: its lean, speed and steering, the pedals or the push or the stride)
    const result = server.send({ type: 'moto.drive', x: nx, z: nz, heading: sportState.heading, lean: sportState.lean, speed: sportState.speed, throttle: sportState.throttle, brake: sportState.braking, steer: sportState.steer, phase: sportState.phase });
    if (result.ok) { predicted.x = nx; predicted.z = nz; predicted.heading = sportState.heading; sportState.sentHeading = sportState.heading; if (result.hit) sportState.speed = 0; }
    else if (result.code === 'BLOCKED') { meetWithSport(dt, nx, nz, boxes, h, 'solid'); return 0; }
    else { const truth = host.game.view(playerId).self; predicted.x = truth.x; predicted.z = truth.z; sportState.speed = 0; }
    if (clock - cam.lastDrag > 1.5 && sportState.speed > 0.8) cam.yaw += angleGap(predicted.heading, cam.yaw) * Math.min(1, dt * 2.2);
    return Math.abs(sportState.speed);
  }

  // --- the player's own cars (17 October 2026) ---
  // The car the player is in, if it is one of their own (its entry in POWER_CARS), and how it is going.
  const ownCar = () => { const c = view && view.self.incar; return c && POWER_CARS[c.car] ? POWER_CARS[c.car] : null; };
  const carState = { speed: 0, steer: 0, heading: 0, throttle: 0, braking: false };
  // Into one of the player's own cars: where they left it if they are beside it, or brought to them (from Property
  // on the phone). The simulation decides; the car is fetched the first time it is driven.
  function enterOwnCar(id) {
    if (!view) return { ok: false };
    const r = server.send({ type: 'cars.enter', car: id });
    if (r.ok) { audio.stopPreview(); ui.close(); carState.speed = 0; carState.steer = 0; predicted.x = r.x; predicted.z = r.z; predicted.heading = r.h; cam.yaw = r.h; refreshView(); }
    say(r);
    return r;
  }
  // Back into a car of the town's this player took and left standing (traffic.js): from beside it.
  function enterTakenCar(n) {
    if (!view) return { ok: false };
    const r = server.send({ type: 'traffic.enter', n });
    if (r.ok) { carState.speed = 0; carState.steer = 0; predicted.x = r.x; predicted.z = r.z; predicted.heading = r.h; cam.yaw = r.h; refreshView(); }
    say(r);
    return r;
  }
  // The town's traffic (traffic.js, 30 October 2026) as it is drawn: each car where the town last said it was, carried
  // on to this frame at its speed, and eased there, so that it does not step ten times a second.
  const trafficShown = new Map();
  function trafficNow(dt) {
    const list = (view && view.traffic) || [];
    const ahead = Math.min(0.25, Math.max(0, clock - viewAt));
    const seen = new Set();
    for (const t of list) {
      if (!POWER_CARS[t.model]) continue;
      seen.add(t.n);
      const tx = t.x + Math.sin(t.h) * t.speed * ahead, tz = t.z + Math.cos(t.h) * t.speed * ahead;
      let e = trafficShown.get(t.n);
      if (!e || Math.hypot(e.x - tx, e.z - tz) > 6) { e = { x: tx, z: tz, h: t.h }; trafficShown.set(t.n, e); }
      else { const k = Math.min(1, dt * 12); e.x += (tx - e.x) * k; e.z += (tz - e.z) * k; e.h += angleGap(t.h, e.h) * k; }
      e.n = t.n; e.model = t.model; e.speed = t.speed; e.steer = t.steer; e.brake = t.brake; e.held = t.held; e.mode = t.mode; e.mine = t.mine; e.hornAgo = t.hornAgo;
    }
    for (const n of [...trafficShown.keys()]) if (!seen.has(n)) trafficShown.delete(n);
    return [...trafficShown.values()];
  }
  const trafficHorned = new Map();
  let trafficCars = [];
  // What the server says this player owns, passed to the town whenever it changes: only those can be driven.
  let carsSent = null;
  function syncOwnCars() {
    if (!playing || !view || !market.state.mine) return;
    const ids = market.state.mine.holdings.map((h) => (h.asset.model || '').replace(/^car:/, '')).filter((id) => POWER_CARS[id]).sort();
    const key = ids.join(',');
    if (key === carsSent) return;
    const r = server.send({ type: 'cars.owned', cars: ids });
    if (r.ok) carsSent = key;
  }
  // Into something solid: at speed it hurts the driver (the town decides how much: own-cars.js, `crash`); slower,
  // the car only stops against it.
  // (19 October 2026: as on a motorcycle, contact.js decides: along a wall it scrapes along, a knock stops it, only a
  // real crash hurts the driver, the town deciding; the edge of the map hurts nobody. Returns where the car goes on to,
  // sliding, or null.)
  function meetWithCar(dt, spec, nx, nz, boxes, forced = null) {
    const free = (x, z) => carFits(spec.id, x, z, carState.heading, boxes, 0.2);
    const way = Math.sign(carState.speed) || 1;
    const ex = nx + Math.sin(carState.heading) * (spec.length / 2) * way, ez = nz + Math.cos(carState.heading) * (spec.length / 2) * way;
    const kind = forced || zoneBlockKind(ex, ez, boxes, 0.6) || 'solid';
    const normal = contactNormal(free, predicted.x, predicted.z, nx, nz);
    const c = contactOutcome({ speed: carState.speed, heading: carState.heading, normal, kind });
    if (c.outcome === 'slide' && !forced) {
      const sx = predicted.x + c.alongX * CONTACT.slideLoss * dt, sz = predicted.z + c.alongZ * CONTACT.slideLoss * dt;
      if (c.along > 0.25 && free(sx, sz)) {
        carState.speed = Math.sign(carState.speed) * c.along * CONTACT.slideLoss;
        if (c.into > 0.8 && clock - scrapedAt > 0.4) { scrapedAt = clock; audio.blow('block', predicted.x, predicted.z); }
        return { x: sx, z: sz };
      }
      carState.speed = 0;
      return null;
    }
    if (c.outcome === 'crash') {
      // (a crash jolts the car and the camera, and is heard; it costs no life: 30 October 2026, own-cars.js)
      const r = server.send({ type: 'car.crash', speed: carState.speed, heading: carState.heading });
      carState.speed = 0;
      kick(r.ok && r.crashed ? 1 : 0.6, normal); jolt(); audio.blow('fall', predicted.x, predicted.z);
      return null;
    }
    carState.speed = 0;
    if (c.into > CONTACT.scrape * 0.6) { kick(Math.min(1, c.into / CONTACT.knock), normal); audio.blow(kind === 'barrier' ? 'shove' : 'block', predicted.x, predicted.z); if (c.into > CONTACT.scrape) jolt(); }
    return null;
  }
  // A car under the player's hands (power-cars.js): it turns about its back wheels, no harder than its tyres grip,
  // and the whole of it is checked against what is solid, not only its middle (own-cars.js, `carFits`).
  function driveOwnCar(dt, spec) {
    const input = uiBlocks() ? { steer: 0, throttle: 0, brake: 0 } : controls.bike();
    const handling = carHandlingOf(spec);
    carState.heading = predicted.heading;
    const tar = motoSpeedAt(predicted.x, predicted.z, false) === MOTO.speedRoad;
    stepPowerCar(carState, input, dt, { handling, onTar: tar, wet: view.weather.wet });
    carState.throttle = input.throttle; carState.braking = input.brake > 0;
    if (Math.abs(carState.speed) < 0.03) return 0;
    let nx = predicted.x + Math.sin(carState.heading) * carState.speed * dt;
    let nz = predicted.z + Math.cos(carState.heading) * carState.speed * dt;
    if (stopsAtBridge(nx, nz, carState.heading + (carState.speed < 0 ? Math.PI : 0), (spec.length || 4.6) / 2 + 0.3)) { carState.speed = 0; return 0; }
    // into something: along it, against it, or a crash (meetWithCar); never through it
    const boxes = structureBoxes();
    if (!carFits(spec.id, nx, nz, carState.heading, boxes, 0.2)) {
      const on = meetWithCar(dt, spec, nx, nz, boxes);
      if (!on) return 0;
      nx = on.x; nz = on.z;
    }
    // (with what the car is doing, for other players to see and hear: its steering, speed, throttle, brake, revs, lamps)
    const result = server.send({ type: 'car.drive', x: nx, z: nz, heading: carState.heading, steer: carState.steer, speed: carState.speed, throttle: carState.throttle, brake: carState.braking, rev: carRevs(carState.speed, carState.throttle, handling), lamps: night > 0.25 });
    if (result.ok) { predicted.x = nx; predicted.z = nz; predicted.heading = carState.heading; if (result.hit) carState.speed = 0; }
    else if (result.code === 'BLOCKED') { meetWithCar(dt, spec, nx, nz, boxes, 'solid'); return 0; }
    else { const truth = host.game.view(playerId).self; predicted.x = truth.x; predicted.z = truth.z; carState.speed = 0; }
    // the view swings round behind the car as it goes (not while it backs up)
    if (clock - cam.lastDrag > 1.5 && carState.speed > 0.8) cam.yaw += angleGap(predicted.heading, cam.yaw) * Math.min(1, dt * 2.0);
    return Math.abs(carState.speed);
  }
  function leaveOwnCar() {
    const r = server.send({ type: 'car.leave' });
    if (r.ok) { carState.speed = 0; carState.steer = 0; predicted.x = r.x; predicted.z = r.z; }
    say(r);
    return r;
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
    const steering = !uiBlocks() && magnitude >= 0.12;
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
  // (at the wheel of a car just taken from its driver, traffic.js: where the town has it, at rest)
  let takenWas = null;
  function movePlayer(dt) {
    const taken = view.self.incar && Number.isInteger(view.self.incar.taken) ? view.self.incar.taken : null;
    if (taken !== null && taken !== takenWas) { predicted.x = view.self.x; predicted.z = view.self.z; predicted.heading = view.self.heading; cam.yaw = view.self.heading; carState.speed = 0; carState.steer = 0; }
    takenWas = taken;
    going.turn = 0;
    if (led() || view.self.driving || view.self.astride || view.self.riding || view.self.incar) going.speed = 0;
    if (led()) return 0;                       // walked in by an officer, carried, or with hands on a vehicle: not theirs to steer
    if (view.self.incar) { const spec = ownCar(); return spec ? driveOwnCar(dt, spec) : 0; }
    if (view.self.driving) return driveVehicle(dt);
    if (view.self.astride) return ownSport() ? driveSport(dt, ownSport()) : driveMoto(dt);
    if (view.self.riding) return 0;
    if (view.self.swimming) return swimPlayer(dt);
    const { forward, strafe } = controls.axes();
    const magnitude = Math.min(1, Math.hypot(forward, strafe));
    const steering = !uiBlocks() && magnitude >= 0.12;
    // With a gun out (gun-play.js) the figure faces where it aims, whichever way it goes: it steps sideways and back
    // (the walk turned or played backwards: gun-pose.js), at a walk aimed, slower through the sight or crouched; at a
    // run (Shift) the gun is lowered and it runs where it goes
    const armed = !!(gunPlay && gunPlay.out);
    if (armed && !(controls.running && steering)) { const turn = angleGap(cam.yaw, predicted.heading); predicted.heading += Math.max(-14 * dt, Math.min(14 * dt, turn)); }
    if (!steering && going.speed <= 0.02) { going.speed = 0; going.way = null; return 0; }
    // Running is what the player chose (Shift, or Run switched on), never a guess from how far the stick is pushed.
    // nobody runs with their eyes on a phone; nor badly hurt (the 20-life rule: a slow limp)
    const run = controls.running && !view.self.critical && !ui.phoneOut();
    // (with a gun out, slowing to a stop goes on the way it was going; otherwise, the way the figure faces)
    let wanted = armed && going.way !== undefined && going.way !== null ? going.way : predicted.heading;
    let pace = 0;
    if (steering) {
      const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
      const rx = -Math.cos(cam.yaw), rz = Math.sin(cam.yaw);
      wanted = Math.atan2(fx * forward + rx * strafe, fz * forward + rz * strafe);
      pace = (run ? SPEED.run : SPEED.walk) * (view.weather.wet ? SPEED.rain : 1) * magnitude;
      if (armed && !run) pace *= gunPlay.pace();
      if (view.self.critical) pace *= 0.55;
    }
    const strafing = armed && !run;
    let off = 0;
    if (!strafing) {
      off = angleGap(wanted, predicted.heading);
      const swing = Math.max(-PACE.turn * dt, Math.min(PACE.turn * dt, off));
      predicted.heading += swing;
      going.turn = swing / dt;
      // facing well away from where it is sent, it slows to come round
      pace *= 0.4 + 0.6 * Math.max(0, Math.cos(off));
    }
    going.way = wanted;
    going.speed += Math.max(-PACE.shed * dt, Math.min(PACE.gather * dt, pace - going.speed));
    const speed = going.speed;
    const moveWay = strafing ? wanted : predicted.heading;
    const dx = Math.sin(moveWay), dz = Math.cos(moveWay);
    const boxes = structureBoxes();
    let nx = predicted.x + dx * speed * dt;
    let nz = predicted.z + dz * speed * dt;
    // nobody walks through the showroom's salesman (he is drawn on each device, not kept by the simulation): a step
    // into him keeps only its part past him
    for (const s of !ZONE_CAST.showroomStaff ? [] : showroom.inside ? [salesman.state] : carshow.inside ? carSalesmen.map((c) => c.sim.state) : []) {
      const before = Math.hypot(predicted.x - s.x, predicted.z - s.z), after = Math.hypot(nx - s.x, nz - s.z);
      if (after < 0.62 && after < before && before > 1e-3) { const ox = (s.x - predicted.x) / before, oz = (s.z - predicted.z) / before, along = (nx - predicted.x) * ox + (nz - predicted.z) * oz; nx -= ox * along; nz -= oz * along; }
    }
    // (where one may stand, and a step there that one can take: not off the side of a bridge, nor down a drop)
    const ok = (x, z) => zoneWalkable(x, z, boxes) && zoneStep(predicted.x, predicted.z, x, z);
    // (on a deck, a step into its rails goes on along it instead; at a deck's end, one into its end's posts goes round
    // them to its way in: habitation.js habitationAlongDeck)
    const slide = !ok(nx, nz) ? habitationAlongDeck(predicted.x, predicted.z, nx - predicted.x, nz - predicted.z, ok) : null;
    if (slide) { nx = predicted.x + slide.dx; nz = predicted.z + slide.dz; }
    if (!ok(nx, nz)) {
      deepAhead(nx, nz);
      if (ok(nx, predicted.z)) nz = predicted.z;
      else if (ok(predicted.x, nz)) nx = predicted.x;
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
        if (ok(sx, sz)) { const slid = server.send({ type: 'move', x: sx, z: sz, heading: predicted.heading, run }); if (slid.ok) { predicted.x = sx; predicted.z = sz; going.speed = Math.min(going.speed, speed * 0.7); return going.speed; } }
      }
      going.speed = Math.min(going.speed, 0.6);
      return 0;
    }
    if (result.ok) { predicted.x = nx; predicted.z = nz; } else { const truth = host.game.view(playerId).self; predicted.x = truth.x; predicted.z = truth.z; going.speed = 0; }
    // On the street view (19 October 2026): the camera goes round behind the way the player is going, unhurried,
    // a little quicker at a run, as the classic open-world games do; never round toward someone walking or running at
    // the screen (they come toward it, and it gives way), and not while the player is holding it round themselves.
    // In the other views, as before: turned gently when walking sideways, so the keyboard alone can turn.
    if (armed) { /* the aim is the player's: the camera is not turned for them */ } else if (rig.view === 'street') {
      const behind = angleGap(predicted.heading, cam.yaw);
      if (speed > 0.4 && clock - cam.lastDrag > 1.2 && Math.abs(behind) < 2.0) cam.yaw += behind * (1 - Math.exp(-dt * (run ? 2.1 : 1.3) * Math.min(1, speed / 1.2)));
    } else {
      const aside = angleGap(wanted, cam.yaw);
      if (steering && clock - cam.lastDrag > 1.2 && Math.abs(aside) > 0.2 && Math.abs(aside) < 2.2) cam.yaw += aside * Math.min(1, dt * 0.9);
    }
    return speed;
  }

  // The graphics level (graphics.js: 0 Ultra, 1 High, 2 Medium, 3 Low), chosen in Settings or left to the game (Auto):
  // Auto starts where this device was last found to keep up (or where its kind starts), judges the first seconds in
  // the town quickly (the silent test), steps down when the device truly cannot keep up (a typical frame slower than
  // a thirtieth of a second for a few seconds: monitor.js) or the graphics card is nearly full, and back up, slowly,
  // when there is room. A step down by itself is said once: "Graphics lowered to keep the game smooth".
  //   Each level (graphics.js, LEVEL_SETTINGS): the pixels drawn; the sun's shadows, how far they reach and how soft they
  //   are (none at Low, where every vehicle has its soft patch as every figure has); the largest picture; the sky in
  //   glass, water, metal and wet roads; the waters' ripples; how far one sees; and the device's own steps of detail
  //   (`quality.detail`: how many figures move their limbs and how near, how far the town is drawn, the grass, the
  //   showrooms' models), which a phone keeps at its fullest from Medium up, as it was drawn before the levels, and a
  //   computer at each level as its detail steps were (0 to 3).
  const DETAIL_OF = LITE ? [0, 0, 0, 3] : [0, 1, 2, 3];
  // Who and what moves over the ground this frame, for the dust and the wet marks: the player on foot or in or on a
  // vehicle, the other players likewise, and the police walking near.
  const moversNow = [];
  function groundMovers(hallNow) {
    moversNow.length = 0;
    if (!playing || !view || hallNow) return moversNow;
    const s = view.self;
    const mine = s.incar ? 'car' : s.astride ? 'bike' : s.driving ? 'keke' : s.riding || s.swimming || s.carried || inside ? null : 'foot';
    if (mine) moversNow.push({ key: 'me', x: predicted.x, z: predicted.z, heading: predicted.heading, kind: mine });
    for (const q of shownPeers) {
      const kind = q.car ? 'car' : q.ride ? 'bike' : q.vehicle ? (q.vehicle.kind === 'keke' && !q.vehicle.back ? 'keke' : null) : q.swimming ? null : 'foot';
      if (kind && Math.hypot(q.x - predicted.x, q.z - predicted.z) < 80) moversNow.push({ key: `p:${q.id}`, x: q.x, z: q.z, heading: q.heading || 0, kind });
    }
    if (crowd) for (const a of crowd.actors()) if (a.d !== undefined && a.d < 60 && a.pose === 1) moversNow.push({ key: `a:${a.i}`, x: a.x, z: a.z, heading: a.h, kind: 'foot' });
    return moversNow;
  }
  // bare red earth and the laterite lanes: neither tarmac, nor the city block's pavements, nor the showroom's yard, nor
  // the habitation
  const inBox = (b, x, z) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1;
  const dirtAt = (x, z) => !onTar(x, z) && !inBox(CITY_AREA, x, z) && !inBox(CARSHOW.compound, x, z) && !inBox(SPORTS_MALL.compound, x, z) && habitationAway(x, z) > 0 && !inBox(ZONE_JETTY, x, z);
  const GROUND_WIND = Object.freeze({ x: -1.2, z: -0.5 });
  const bufferSize = new THREE.Vector2(), sunWay = new THREE.Vector3(), sunSeen = new THREE.Vector3();
  // where the sun is in the picture (0 to 1 across and up), for its flare: none at night, under a grey sky, or behind
  function sunOnScreen(skyState) {
    if (!(skyState.sunUp > 0.02) || skyState.dull > 0.7) return null;
    sunSeen.copy(sky.sun.position).sub(sky.sun.target.position).normalize().multiplyScalar(800).add(camera.position).project(camera);
    if (!(sunSeen.z > -1 && sunSeen.z < 1)) return null;
    return { x: sunSeen.x * 0.5 + 0.5, y: sunSeen.y * 0.5 + 0.5, amount: airLevel.flare * Math.min(1, skyState.sunUp * 5) * (1 - skyState.dull) };
  }
  const airLevel = { clouds: 0, haze: 0, mirage: 0, glint: 0, puddles: 0, glow: 0, glowWide: false, flare: 0, dust: 0, fireflies: 0, wetTracks: 0, ao: 0, waves: 0, foam: 0, mirror: 0, mirrorSize: 0 };
  function applyQuality(level) {
    if (!townBuilt) return;          // (applied when the town is built)
    const at = (key) => levelSetting(key, level, LITE);
    world.setQuality(DETAIL_OF[level]);
    town.setQuality(DETAIL_OF[level]);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, at('pixelRatio')));
    const shadow = sky.sun.shadow, size = at('shadowMap');
    // (the map let go when shadows go, and made again at its new size when they come back: memory freed at once)
    if (size === 0 || shadow.mapSize.x !== size) { if (size) shadow.mapSize.set(size, size); if (shadow.map) { shadow.map.dispose(); shadow.map = null; } }
    shadow.radius = at('shadowSoft');
    if (size) sky.reachShadows(at('shadowReach'));
    // Shadows go by telling the sun not to cast them. The renderer then moves each material to a
    // program without shadows as it next draws it, and back again the same way. Without them, every vehicle has its
    // soft patch under it, as every figure always has (soft-patch.js).
    sky.sun.castShadow = size > 0;
    showSoftPatches(size === 0);
    // the sky in glass, water, metal and wet roads, or less; the waters' ripples; how far the air lets one see
    setReflections(at('reflections'));
    setWater(at('water'));
    sky.setView(at('view'));
    // the light from the whole sky by the hour (Medium and up), or the hemisphere light's two colours (Low)
    sky.setSkyLight(at('skyLight'));
    // the air: the clouds' shadows, the haze and the mirage (Medium and up), far gloss spread (every level), puddles (High
    // and up): numbers for the shaders each frame, times these (world-shading.js)
    for (const key of Object.keys(airLevel)) airLevel[key] = at(key);
    // (the glow's pictures let go at a level without it)
    if (!airLevel.glow && glow) glow.dispose();
    if (!airLevel.ao && occlusion) occlusion.dispose();
    if (!airLevel.mirror && riverMirror) riverMirror.dispose();
    // the largest picture: those larger made again smaller, a few at a time (glb.js), freeing the graphics card's memory
    setPictureMost(at('pictureMost'));
    soundTimer = 1;      // look again at what is in reach
    resize();
    monitor.count(`graphics to ${GRAPHICS_LEVELS[level].name}`);
  }
  // a phone is stepped down sooner when it cannot keep up, and climbs back far more slowly (monitor.js,
  // PHONE_QUALITY_RULES); both climb back slowly, so that the picture does not flicker between levels while walking about
  let loweredSaid = false;
  const governor = createGovernor((level, from) => {
    applyQuality(level);
    const last = governor.changes[governor.changes.length - 1];
    // (said when the game lowered it by itself while playing, for slow frames or a full graphics card, and only the first
    // time (the owner: "tell the player once"); never when the player chose)
    if (level > from && last && /^typical frame|^the graphics card/.test(last.why) && townBuilt && ui && !loweredSaid) { loweredSaid = true; ui.toast({ type: 'note', text: GRAPHICS_LOWERED }); }
  }, LITE ? PHONE_QUALITY_RULES : QUALITY_RULES);
  let gpuSaid = null;
  const gpuName = () => { if (gpuSaid === null) { try { const gl = renderer.getContext(); const info = gl.getExtension('WEBGL_debug_renderer_info'); gpuSaid = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); } catch (error) { return ''; } } return gpuSaid; };
  const deviceMemory = typeof navigator !== 'undefined' && Number.isFinite(navigator.deviceMemory) ? navigator.deviceMemory : null;
  const storage = (() => { try { return window.localStorage; } catch (error) { return null; } })();
  const autoLevel = () => { const known = storage ? remembered(storage, gpuName()) : null; return known !== null ? known : autoStart({ lite: LITE, gpu: gpuName(), memory: deviceMemory }); };
  governor.setCeiling(autoCeiling({ lite: LITE, gpu: gpuName(), memory: deviceMemory }));
  // The player's choice: 'auto' or a level ('low', 'medium', 'high', 'ultra'), kept with the game's preferences.
  function setGraphics(value) {
    const level = levelOf(value);
    prefs.graphics = level === null ? 'auto' : value;
    writeStored(PREFS_KEY, prefs);
    governor.hold(level !== null);
    if (level !== null) governor.set(level, `chosen in Settings: ${GRAPHICS_LEVELS[level].name}`);
    else governor.set(Math.max(autoLevel(), governor.ceiling), 'Auto');
  }
  if (!prefs.graphics || (prefs.graphics !== 'auto' && levelOf(prefs.graphics) === null)) prefs.graphics = 'auto';
  if (prefs.graphics === 'auto') governor.set(Math.max(autoLevel(), governor.ceiling), 'Auto: where this device starts'); else setGraphics(prefs.graphics);
  // Auto's silent test while loading (the owner's brief: "a short silent test while loading"): a dozen frames of the town
  // drawn behind the loading card, timed; their typical frame slower than a thirtieth of a second, a level lower and
  // again, at most three times (never said: it is the first choice, not a change while playing). Then, playing, the
  // first half minute in the town judged quickly (quickTest); the level it settles at kept for this device.
  // (the first few frames after the town is put together are not timed: in them the graphics card is handed every
  // picture and shape it has not had yet, which a phone takes a while over once, and which is not how fast it draws:
  // timed, they put a phone that draws the town comfortably at Low, and it climbed back while playing, every time:
  // 26 October 2026)
  const typicalFrame = (n, skip = 0) => new Promise((resolve) => { const t = []; let last = null, skipped = 0; const f = (now) => { if (last !== null) { if (skipped < skip) skipped += 1; else t.push(now - last); } last = now; if (t.length >= n) { t.sort((a, b) => a - b); resolve(t[Math.floor(t.length / 2)]); } else requestAnimationFrame(f); }; requestAnimationFrame(f); });
  async function silentTest() {
    if (prefs.graphics !== 'auto') return;
    for (let tries = 0; tries < 3 && governor.level < LOW; tries += 1) {
      const ms = await typicalFrame(12, 4);
      if (!(ms > QUALITY_RULES.slowMs)) return;
      governor.set(governor.level + 1, `the silent test while loading: a typical frame ${ms.toFixed(0)} ms`);
      await painted(); await painted();
    }
  }
  let testedAt = null;
  function quickTest(clock) {
    if (prefs.graphics !== 'auto') return;
    if (testedAt === null) { testedAt = clock; governor.quick(30); return; }
    if (clock - testedAt > 60 && storage) { remember(storage, gpuName(), governor.level); testedAt = Infinity; }
  }
  const quality = { get level() { return governor.level; }, get detail() { return DETAIL_OF[governor.level]; } };

  // What can be heard from where the player stands. Worked out twice a second.
  const onTar = (x, z) => ZONE_ROADS.some((r) => r.surface === 'asphalt' && x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) || OUTSKIRT_ROADS.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
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

  // Warming up (warmup.js), in town: one piece of the vehicle kit unpacked a frame, then the town's meshes, a few a
  // frame. What has to be done all at once (the programs the town needs) is done behind the loading card, when the
  // town is built (prepareTown).
  function warmStep() {
    if (warm.stage !== 4) return;
    warm.frames += 1;
    try {
      if (!warm.jobs) warm.jobs = vehicleWarmJobs();
      if (warm.jobs.length) warmUp.add(warm.jobs.pop()());
      if (!warmUp.step() && !warm.jobs.length) warm.stage = 5;
    } catch (error) {
      // warming up is a kindness, not a need: without it the town still draws, with a hitch here and there
      warm.stage = 5;
    }
  }
  // The programs every material in the town needs, with the sun's shadow (`half` 1) and without it (2), compiled
  // behind the loading card so that nothing is compiled in the middle of play.
  function warmPrograms(half) {
    try {
      if (half === 1) {
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
        monitor.note('programs compiled ahead', warmUp.compile(camera));
      } else {
        monitor.note('programs compiled ahead', warmUp.compileWithout(sky.sun, camera));
        for (const o of warm.extras) scene.remove(o);
        if (warm.figure) { warm.figure.dispose(); warm.extras[1].geometry.dispose(); warm.extras[2].geometry.dispose(); }
        warm.extras = []; warm.figure = null;
        warmUp.pin();
      }
    } catch (error) {
      for (const o of warm.extras) scene.remove(o);
      warm.extras = []; warm.figure = null;
    }
  }
  let isReady = false;
  // The kits the town is built from (packs.js): asked for once the player is choosing a character, quietly, behind the
  // figure being looked at, so that they are here by the time Enter is pressed. Someone who has a character asks for
  // them when the town is prepared.
  let packsAsked = false;
  function askPacks() { if (packsAsked) return; packsAsked = true; loadPack('kit').catch(() => {}); loadPack('vehicles').catch(() => {}); }
  const loading = createLoadingCard();
  // after the browser has drawn what is on the screen (the loading card, as it now stands)
  const painted = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
  let preparing = null;
  // The townspeople's reactions (character.js): on the website a file of their own (build.mjs), fetched with the town.
  let reactionsJob = null;
  function loadReactions() {
    const address = window.__PCW_FILES && window.__PCW_FILES.reactions;
    if (!address || Object.keys(REACTIONS).length) return Promise.resolve();
    if (!reactionsJob) {
      reactionsJob = fetch(address, { credentials: 'same-origin' }).then((r) => { if (!r.ok) throw new Error(`${address}: ${r.status}`); return r.json(); }).then((all) => { Object.assign(REACTIONS, all); });
      reactionsJob.catch(() => { reactionsJob = null; });
    }
    return reactionsJob;
  }
  // The town, built for the player going into it (townSteps): the kits fetched, if they have not come already; the
  // pieces of the town built, one a frame, behind the loading card, its line moving as they are; and the programs it
  // needs compiled. Done once; asked for again while it is under way, it is the same doing. Nothing here gives up: if
  // the kits do not come, the player is told so and can try again, and the promise is kept only once the town is built.
  function prepareTown() {
    if (isReady) return Promise.resolve();
    if (preparing) return preparing;
    preparing = (async () => {
      const kits = ['kit', 'vehicles'];
      loading.show(`Entering ${ZONE.name}`, 'Fetching the town');
      askPacks();
      for (;;) {
        const all = Promise.all([...kits.map((k) => loadPack(k)), loadReactions()]);
        let settled = false;
        all.then(() => { settled = true; }, () => { settled = true; });
        while (!settled) {
          const p = kits.map((k) => packProgress(k));
          const got = p.reduce((n, x) => n + x.got, 0), of = p.reduce((n, x) => n + x.of, 0);
          loading.progress(of ? (0.35 * got) / of : 0);
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
        try { await all; break; } catch (error) {
          await new Promise((resolve) => loading.trouble('The town did not arrive', 'Check your connection, then try again.', 'Try again', () => { loading.show(`Entering ${ZONE.name}`, 'Fetching the town'); resolve(); }));
        }
      }
      const steps = townSteps.splice(0);
      try {
        for (let i = 0; i < steps.length; i += 1) {
          loading.progress(0.35 + (0.5 * i) / steps.length, `Building the town: ${steps[i][0]}`);
          await painted();
          steps[i][1]();
        }
        townBuilt = true;
        resize();
        applyQuality(quality.level);
        if (!NO_DRAW) {
          loading.progress(0.88, 'Getting the picture ready');
          await painted();
          warmPrograms(1);
          loading.progress(0.95);
          await painted();
          warmPrograms(2);
          await silentTest();
        }
        warm.stage = 4;
        isReady = true;
        loading.progress(1);
        await painted();
        loading.hide();
      } catch (error) {
        console.error('PostCivilWar: the town could not be built', error);
        // (a step that failed half way cannot be done again in this page: the game is loaded afresh, by the player)
        await new Promise(() => loading.trouble('Something went wrong', 'The town could not be put together on this device just now. Your game is saved.', 'Continue', () => location.reload()));
      }
    })();
    return preparing;
  }

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
    // the lamp on the roof turns blue and white while it is on a call; on the owner's ambulance (once its model has
    // come, render-supplied.js), the two lamps at the front of its roof flash red and blue in turn
    const dressed = supplied.dressAmbulance(ambulance);
    if (dressed) {
      const beat = Math.floor(clock * 5) % 2;
      for (const l of dressed.lamps) l.material.emissiveIntensity = a.siren && (l.side < 0) === (beat === 0) ? 3.2 : 0;
    } else {
      ambulance.beacon.emissive.setHex(a.siren && Math.floor(clock * 4) % 2 ? 0x3a7bff : a.siren ? 0xffffff : 0x000000);
      ambulance.beacon.emissiveIntensity = a.siren ? 2.2 : 0;
    }
    ambulance.siren = a.siren ? { x: g.position.x, z: g.position.z } : null;
  }

  let last = performance.now();
  // (the game's clock against the real one: 1, unless a browser test slows everything down to look at it closely)
  let timeScale = 1;
  // The game's loop. The next frame is asked for before this one is drawn, and a mistake in drawing one frame is
  // written to the console and counted (`frameErrors`) rather than left to end the loop (18 October 2026, the owner's
  // brief: the game sometimes froze. Until now the next frame was asked for at the end of this one, so any error
  // thrown on the way, however rare, stopped the game where it stood, the last picture left on the screen). The
  // browser tests fail on any such error in the console, so none is hidden from them.
  let frameErrors = 0;
  // The picture watched (19 October 2026, the owner: on his phone the game played on behind a picture purely black).
  // What the town needs to be seen is checked as it is played: that frames are being drawn, that drawing them does not
  // fail, that the browser still lets the page draw, that the camera is somewhere real, and, every few seconds, a few
  // points of what was drawn read back (a picture black at every point, held for a while, is not the town at any
  // hour). When the town cannot be seen the player is told so on the screen, with what was found (the error the
  // browser gave, the device's graphics), so that it can be photographed and sent; reloading the page is offered, and
  // is theirs to choose (the game never reloads itself).
  let townWanted = false;
  // (what it finds wrong is said on the loading card, plainly, with Continue; what it found in detail is in the readout)
  const watch = watchPicture({ renderer, camera, canvas, lost: () => pictureGone, errors: () => frameErrors, tell: (trouble) => { if (trouble) loading.trouble('The picture stopped', 'Your game is saved where you are. Continue to carry on from there.', 'Continue', carryOnAfresh); else if (loading.kind === 'trouble' && !pictureGone) loading.hide(); } });
  function frame(now) {
    requestAnimationFrame(frame);
    // (the kits the town is built from, asked for once a figure is on the character screen: see askPacks)
    if (!packsAsked && creator.rig && creator.rig.mixer && !$('start').hidden) askPacks();
    try { drawFrame(now); } catch (error) {
      frameErrors += 1;
      // (a frame that failed part way through a picture drawn elsewhere, the phone's or the warm-up's, must not leave
      // the town to be drawn there from then on: the screen would stay black with the game going on behind it)
      try { if (renderer.getRenderTarget() !== null) renderer.setRenderTarget(null); } catch (e) { /* the context is gone */ }
      if (frameErrors <= 5 || frameErrors % 600 === 0) console.error(`PostCivilWar: a frame could not be drawn (${frameErrors})`, error);
      monitor.count('frame error');
      watch.failed(error);
    }
    // (looked at after the frame, whether it was drawn or failed on the way: should the town be on the screen, and is it)
    try { watch.frame(now, townWanted); } catch (error) { /* the watch never stops the game */ }
  }
  function drawFrame(now) {
    const elapsed = (now - last) / 1000;
    const frameDt = Math.min(0.5, Math.max(0.001, elapsed)), dt = frameDt * timeScale;
    last = now;
    clock += dt;
    // (until the town is built there is nothing of it to move or draw: the opening and the start screen are the page's)
    if (!townBuilt) return;
    monitor.begin();
    perf.fps += (1 / frameDt - perf.fps) * Math.min(1, frameDt * 2);
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
      // (the sky as the player has chosen it, Settings: the time and the weather it looks, not the town's own)
      if (SKY_TIMES[prefs.skyTime] !== undefined) hour = SKY_TIMES[prefs.skyTime];
      weather = shownWeather(weather);

      monitor.mark('player and vehicles');
      const holding = acting() && prompt && prompt.hold && !ui.isOpen();
      if (holding) { holdProgress += dt / HOLD_SECONDS; if (holdProgress >= 1) { holdProgress = 0; completeHold(); } } else holdProgress = 0;
      ui.setPrompt(prompt, holdProgress);
      // (stopped at a bridge on a vehicle: the message and its button, until the player is off it or drives away)
      { const box = $('bridge-stop'), show = atBridge(); if (box && box.hidden === show) box.hidden = !show; if (show) { const t = $('bridge-stop-text'), said = bridgeText(); if (t && t.textContent !== said) t.textContent = said; } }
      showControls();

      const self = view.self;
      const driving = self.driving;
      const riding = self.riding;
      const astride = self.astride;
      const incar = self.incar;
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
      const back = riding ? -0.5 : driving ? DRIVER_SEAT[2] : astride && !powerBike() && !ownSport() ? -0.17 : 0;
      let wantX = predicted.x + Math.sin(predicted.heading) * back;
      let wantZ = predicted.z + Math.cos(predicted.heading) * back;
      if (taking && (taking.step === 'mount' || taking.step === 'enter')) {
        // the last step of taking a vehicle: up and into the seat
        const seat = taking.kind === 'okada' ? view.okadas.find((o) => o.n === taking.id) : taking.kind === 'car' ? (view.traffic || []).find((c) => c.n === taking.id) : view.vehicles.find((v) => v.id === taking.id);
        if (seat) { const k = Math.min(1, Math.max(0, (taking.progress - 0.62) / 0.38)); wantX += (seat.x - wantX) * k; wantZ += (seat.z - wantZ) * k; }
      }
      // knocked down, thrown from a motorcycle, killed (falls.js, 19 October 2026): the figure falls the way the blow
      // sent it, from where it was struck (through the air, thrown over the handlebars), lies, and gets up; it is not
      // walked from where it was struck to where it landed
      const downState = playerDown(self, predicted.heading);
      me.downState = downState;
      let fallPlace = null;
      if (downState && downState.from && downState.kind !== 'dead') {
        const t = fallTime(downState);
        if (downState.age < t) {
          if (downState.kind === 'crash') fallPlace = flightAt(downState, downState.age, zoneGroundY(downState.from.x, downState.from.z));
          else { const u = Math.min(1, downState.age / t), e = u * u * (3 - 2 * u); fallPlace = { x: downState.from.x + (downState.to.x - downState.from.x) * e, z: downState.from.z + (downState.to.z - downState.from.z) * e }; }
        }
      }
      if (downState) {
        const p = fallPlace || { x: self.x, z: self.z };
        me.group.position.x = p.x; me.group.position.z = p.z;
        speed = 0;
      } else if (led()) {
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
      // (all three: a seat in a car turns the figure with the car's body as it pitches and rolls, car-view.js)
      me.group.rotation.set(0, predicted.heading, astride ? moto.lean : 0);      // (lean positive: over to the right, into a right turn)
      // (going up the habitation's stairs: the figure's own climb up them)
      me.climbing = !!me.animated && !driving && !riding && !astride && !incar && speed > 0.3 && habitationClimbing(me.group.position.x, me.group.position.z, predicted.heading);
      // badly hurt (the 20-life rule): a limp, made from the figure's own walk (animated.js)
      me.limp = !!self.critical && !driving && !riding && !astride && !incar && !self.swimming;
      animateCharacter(me, dt, driving || riding || astride || incar ? 0 : speed, holding, led() ? 0 : going.turn);
      driveKitEmote(dt, speed);
      // the ground under the figure: the town's, or the bridge's deck and its approaches (zoneGroundY)
      const groundY = zoneGroundY(me.group.position.x, me.group.position.z);
      if (driving) { seatCharacter(me); me.group.position.y = groundY + DRIVER_SEAT[1] - SEATED_HEIGHT * me.scale; } else if (riding) { seatCharacter(me); me.group.position.y = groundY - 0.04; } else if (astride && ownSport() && !sportSeated(ownSport())) { standCharacter(me); me.group.position.y = groundY; } else if (astride) { seatCharacter(me); me.group.position.y = groundY - 0.15 * me.scale; } else if (incar) { seatCharacter(me); me.group.position.y = groundY; } else { standCharacter(me); me.group.position.y = groundY; }
      // (through the air, thrown over the handlebars)
      if (fallPlace && fallPlace.y !== undefined) me.group.position.y = fallPlace.y;
      // on one of the player's own motorcycles: it is drawn under them, and they sit on it (own-bike-view.js)
      const ownRide = astride && powerBike() ? { id: powerBike().id, x: predicted.x, z: predicted.z, h: predicted.heading, lean: moto.lean, speed: moto.speed, steer: bikeState.steer, throttle: bikeState.throttle, brake: bikeState.braking, rev: bikeRevs(moto.speed, bikeState.throttle, handlingOf(powerBike())), rough: motoSpeedAt(predicted.x, predicted.z, false) !== MOTO.speedRoad } : null;
      // (one that has just come down carried on to this frame from the town's last word, as a fall is)
      const ownParked = ((self.ownBikes && self.ownBikes.parked) || []).map((b) => (b.fallen && Number.isFinite(b.ago) ? { ...b, ago: b.ago + Math.max(0, clock - viewAt) } : b));
      ownBikeView.update(dt, { ridden: ownRide, parked: ownParked, groundY: zoneGroundY, from: predicted, night, now: clock });
      if (ownRide) ownBikeView.seat(me, ownRide, zoneGroundY);
      // on one of the player's things from the sports mall: it is drawn under them (the skates on their feet), and they
      // ride it as it is ridden (sport-view.js); theirs left standing are drawn where they are
      const sportRide = astride && ownSport() ? { id: ownSport(), x: predicted.x, z: predicted.z, h: predicted.heading, lean: sportState.lean, speed: sportState.speed, steer: sportState.steer, phase: sportState.phase, throttle: sportState.throttle, brake: sportState.braking } : null;
      const sportParked = ((self.ownSports && self.ownSports.parked) || []).map((b) => (b.fallen && Number.isFinite(b.ago) ? { ...b, ago: b.ago + Math.max(0, clock - viewAt) } : b));
      sportView.update(dt, { ridden: sportRide, parked: sportParked, groundY: zoneGroundY, from: predicted, now: clock });
      if (sportRide) sportView.seat(me, sportRide, zoneGroundY);
      // in one of the player's own cars: the car is drawn where they are (car-view.js), with the other players' cars
      // near them, and every car of theirs and others' left standing within sight; the player sits at its wheel, seen
      // where its cabin can be seen into (car-view.js says where), unseen in a closed one
      const ownDrive = incar && ownCar() ? { id: ownCar().id, x: predicted.x, z: predicted.z, h: predicted.heading, speed: carState.speed, steer: carState.steer, throttle: carState.throttle, brake: carState.braking } : null;
      const peerCars = [], parkedCars = ((self.ownCars && self.ownCars.parked) || []).map((c) => ({ ...c }));
      for (const q of shownPeers) {
        if (q.car && POWER_CARS[q.car.car]) peerCars.push({ key: q.id, id: q.car.car, x: q.x, z: q.z, h: q.heading, speed: q.car.speed, steer: q.car.steer, throttle: q.car.throttle, brake: q.car.brake, rev: q.car.rev, lamps: q.car.lamps });
        for (const c of q.cars || []) parkedCars.push({ ...c, key: `cpark:${q.id}:${c.car}` });
      }
      trafficCars = trafficNow(dt);
      const trafficDrawn = trafficCars.map((e) => ({ key: e.n, id: e.model, x: e.x, z: e.z, h: e.h, speed: e.speed, steer: e.steer, brake: e.brake, held: e.held }));
      carView.update(dt, { driven: ownDrive, drives: peerCars, parked: parkedCars, parkedMost: 6, traffic: trafficDrawn, groundY: zoneGroundY, from: predicted, night });
      const carSeated = !!ownDrive && carView.seat(me, ownDrive);
      carsHeard = peerCars.map((q) => ({ key: q.key, car: q.id, x: q.x, z: q.z, rev: q.rev || 0, throttle: q.throttle || 0 }));
      // the town's cars on the move are heard as other players' are (the nearest few: audio.js), and their horns
      for (const e of trafficCars) {
        if (e.mode === 'drive' || e.mode === 'stop') carsHeard.push({ key: `t:${e.n}`, car: e.model, x: e.x, z: e.z, rev: carRevs(e.speed, e.brake ? 0 : 0.35, carHandlingOf(POWER_CARS[e.model])), throttle: e.brake ? 0 : 0.35 });
        if (e.hornAgo >= 0 && e.hornAgo < 0.8) { const at = Math.round((viewAt - e.hornAgo) * 10); if (trafficHorned.get(e.n) !== at) { trafficHorned.set(e.n, at); audio.carHorn(e.model, e.x, e.z); } }
      }
      if (taking) poseTaking(me, taking.step, taking.progress);
      else if (self.fight || me.strike) poseFighter(me, clock, { guard: !!self.fight, block: blocking && !!self.fight });
      // the phone, in the hand of someone on their feet: out of the pocket, held up, looked at (on a call it is held to
      // the ear). On a motorcycle or a keke's handlebars, the left hand comes off them for it (the right keeps the
      // throttle); at the wheel of a car, the right (the left keeps the wheel); on the back of a motorcycle, the right.
      // Getting on or off, a fall, a crash, a fight: the phone is put away at once, and a call is ended.
      const phoneSide = incar ? 'r' : driving || astride ? 'l' : riding ? 'r' : null;
      const phoneAble = !taking && !aboard && !self.fight && !me.strike && !self.swimming && !self.dead && !self.down && !self.carried;
      if (!phoneAble && ui.calling()) ui.hangUp();
      // (asking the showroom's salesman about a motorcycle, the player talks to him face to face: the phone's screen
      // is the conversation, and the handset is not held up in the town. With nobody on the showroom's floor, ZONE_CAST,
      // the conversation is on the phone, held up as any other)
      const talking = ZONE_CAST.showroomStaff && ((!!showroom.talk && showroom.inside) || (!!carshow.talk && carshow.inside));
      // (the torch on, on foot: the phone stays in the hand, held out in front, when the phone's screen is put away)
      torch.held = torch.on && phoneAble && !phoneSide && !talking && !ui.calling();
      phoneHold.update(dt, me, { use: (ui.usingPhone() && !talking) || torch.held, able: phoneAble, night, screen: ui.phoneOut() ? ui.phoneScreen() : torch.held && !ui.usingPhone() ? 'home' : 'page', call: ui.calling(), seated: phoneSide ? { side: phoneSide } : null });
      phoneShown = !phoneAble ? 0 : ui.calling() ? 2 : (ui.usingPhone() && !talking) || torch.held ? (ui.phoneOut() && ui.phoneScreen() === 'camera' ? 3 : 1) : 0;
      // the gun in the hands (gun-play.js): aimed, fired, reloaded; put away for the phone
      if (gunPlay) {
        if (gunPlay.out && ui.usingPhone()) gunPlay.putAway();
        const way = going.way !== undefined && going.way !== null ? going.way : predicted.heading;
        gunPlay.frameSelf(dt, { me, self, cam, pos: me.group.position, moving: { x: Math.sin(way) * going.speed, z: Math.cos(way) * going.speed }, running: !!gunPlay.out && controls.running && going.speed > 0.4, aiming: clock - gunAimedAt < 0.4, peersHere: gunPlay.out && coarse ? gunTargets() : [] });
      }
      tickTalkPose(dt, speed);
      tickCarTalkPose(dt, speed);
      // knocked down by a vehicle, or killed: flat on the ground quickly, and up again more slowly
      // in the river: the figure floats with its body at the water's surface (the water is drawn at -0.32)
      me.swimming = !!self.swimming;
      const flat = !me.animated && me.swimming;
      const lying = !!self.dead || (!!self.down && !self.down.rising) || flat;
      me.fall = (me.fall || 0) + ((lying ? 1 : 0) - (me.fall || 0)) * Math.min(1, dt * (lying ? 12 : 4));
      // (a supplied figure falls with its own fall: the harder one when killed, or bowled over on the move)
      if (lying && !me.fellHow) me.fellHow = self.dead || (self.down && self.down.by === 'crash') || (me.speed || 0) > 1.5 ? 'hard' : 'soft';
      if (!lying && me.fall < 0.02) me.fellHow = null;
      if (!me.fallDriver) layCharacter(me, me.fall, me.fellHow || 'hard');
      if (me.swimming) { me.group.position.y = me.animated ? -(me.spec.height * 0.58) - 0.22 : -0.5; if (me.blob) me.blob.visible = false; } else if (me.wasSwimming) me.group.position.y = groundY;
      me.wasSwimming = me.swimming;
      // in the ambulance, in a closed car (or one not yet drawn), or with the eye inside its own head, the figure is not drawn
      me.group.visible = !aboard && (!incar || carSeated) && !rig.hidesPlayer;
      ui.setDash(driving ? { plate: driving.plate, fuel: driving.fuel, tank: driving.tank, kmh: Math.abs(car.speed) * 3.6, load: driving.load, capacity: driving.capacity } : astride && ownSport() ? { plate: SPORTS[ownSport()].name, fuel: null, kmh: Math.abs(sportState.speed) * 3.6, load: 0, capacity: 0 } : astride && !powerBike() ? { plate: 'Motorcycle', fuel: null, kmh: Math.abs(moto.speed) * 3.6, load: 0, capacity: 0 } : null);
      // one of the player's own motorcycles: its own speedometer, scaled to its engine (speedometer.js)
      if (astride && powerBike()) {
        const bike = powerBike();
        if (!speedo.shown || speedo.bike !== bike.id) { speedo.show({ topKmh: bike.topKmh, cc: bike.cc }); speedo.bike = bike.id; }
        speedo.update(dt, { kmh: Math.abs(bikeState.speed) * 3.6, braking: bikeState.braking && Math.abs(bikeState.speed) > 0.3 });
      } else if (incar && ownCar()) {
        // in one of their own cars: its speedometer, scaled to its top speed
        const c = ownCar();
        if (!speedo.shown || speedo.bike !== `car:${c.id}`) { speedo.show({ topKmh: c.kmh, cc: 0 }); speedo.bike = `car:${c.id}`; }
        speedo.update(dt, { kmh: Math.abs(carState.speed) * 3.6, braking: carState.braking && carState.speed > 0.3 });
      } else speedo.hide();
      if (incar && ownCar()) { const c = ownCar(); ownEngine = { kind: 'car', car: c.id, tone: c.tone, rev: carRevs(carState.speed, carState.throttle, carHandlingOf(c)), throttle: carState.throttle }; }
      else if (driving) ownEngine = { kind: 'keke', rev: Math.min(1, Math.abs(car.speed) / VEHICLE_KINDS.keke.speedRoad), throttle: car.throttle || 0 };
      else if (astride && ownSport()) ownEngine = { kind: 'sport', item: ownSport(), speed: Math.abs(sportState.speed), throttle: sportState.throttle, phase: sportState.phase };
      else if (astride && powerBike()) { const bike = powerBike(); ownEngine = { kind: 'powerbike', bike: bike.id, sound: bike.sound, rev: bikeRevs(moto.speed, bikeState.throttle, handlingOf(bike)), throttle: bikeState.throttle }; }
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
      if (!driving && !riding && !astride && !incar && !aboard && speed > 0.3) {
        // a step is heard as each foot comes down: the figure's own stride says when
        const foot = Math.floor(me.phase * 2);
        if (foot !== stepPhase) { stepPhase = foot; audio.footstep(inside || showroom.inside || carshow.inside || sports.inside ? 'floor' : predicted.x > ZONE_JETTY.x0 && predicted.x < ZONE_JETTY.x1 && predicted.z > ZONE_JETTY.z0 ? 'wood' : onTar(predicted.x, predicted.z) ? 'tar' : 'earth'); }
      }

      if (!driving) car.steer = 0;
      // (beyond the haze's far edge nothing is seen: a vehicle or a townsperson there is not drawn at all, rather than drawn
      // unseen, 21 October 2026: from the habitation at the end of the road the town's fleet and its people, 600 m and
      // more off, were most of what a phone drew)
      const hazeFar = (scene.fog ? scene.fog.far : Infinity) + 25;
      for (const [id, actor] of vehicleActors) {
        const g = actor.group;
        const t = actor.truth;
        const mine = !!driving && driving.id === id;
        if (!mine) g.visible = !claimedFleet.has(id) && Math.hypot(t.x - camera.position.x, t.z - camera.position.z) < hazeFar;
        const was = actor.was || (actor.was = { x: g.position.x, z: g.position.z, steer: 0 });
        if (mine) { g.position.x = predicted.x; g.position.z = predicted.z; g.rotation.y = predicted.heading; } else {
          if (Math.hypot(g.position.x - t.x, g.position.z - t.z) > 6) { g.position.x = t.x; g.position.z = t.z; g.rotation.y = t.heading; was.x = t.x; was.z = t.z; }
          g.position.x += (t.x - g.position.x) * Math.min(1, dt * 10);
          g.position.z += (t.z - g.position.z) * Math.min(1, dt * 10);
          g.rotation.y += angleGap(t.heading, g.rotation.y) * Math.min(1, dt * 10);
        }
        // on the bridge and its approaches: up on the deck, nose up or down with the slope
        g.position.y = zoneGroundY(g.position.x, g.position.z);
        if (g.position.y || g.rotation.x) { g.rotation.order = 'YXZ'; const fx = Math.sin(g.rotation.y), fz = Math.cos(g.rotation.y); g.rotation.x = -Math.atan((zoneGroundY(g.position.x + fx, g.position.z + fz) - zoneGroundY(g.position.x - fx, g.position.z - fz)) / 2); }
        // the wheels turn by as far as the vehicle went, and the front one follows the handlebar
        const along = (g.position.x - was.x) * Math.sin(g.rotation.y) + (g.position.z - was.z) * Math.cos(g.rotation.y);
        if (Math.abs(along) > 1e-4) actor.model.roll(along);
        was.x = g.position.x; was.z = g.position.z;
        was.steer += ((mine ? -(car.steer || 0) * 0.5 : 0) - was.steer) * Math.min(1, dt * 8);
        actor.model.steer(was.steer);
        if (mine) actor.model.setLevel(0); else actor.model.setDistance(Math.hypot(g.position.x - camera.position.x, g.position.z - camera.position.z), undefined, VEHICLE_BIAS[quality.detail]);
        const lit = t.driver && night > 0.45 ? 1 : 0;
        if (lit !== actor.lit) { actor.lit = lit; actor.model.lamps(lit, lit, 0, 0); }
      }

      monitor.mark('townspeople');
      for (const r of view.residents) {
        const actor = residentActors.get(r.id);
        const g = actor.group;
        const wasVisible = g.visible;
        g.visible = r.mode !== 'inside' && Math.hypot(r.x - camera.position.x, r.z - camera.position.z) < hazeFar;
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
            crowd.update({ dt, rows: view.people, okadas: view.okadas, players: peersNow(), known, eye: predicted, real: elapsed, clock, townTime: view.t, others: view.others,
        own: astride ? { n: astride.n, x: predicted.x, z: predicted.z, h: predicted.heading, lean: moto.lean, speed: Math.abs(moto.speed) } : null,
        tug: taking && taking.kind === 'okada' && taking.step !== 'reach' ? { n: taking.id, amount: Math.min(1, Math.max(0, (taking.progress - 0.23) / 0.4)), side: taking.side } : null,
        maxRigs: MAX_RIGS[quality.detail], detail: FIGURE_DETAIL[quality.detail], crowd: CROWD[quality.detail], camera, riding: !!view.self.riding, pause: LITE ? 0.3 : 0.11, fallen: view.fallen, falls: view.falls, reacts: view.reacts, ahead: Math.max(0, clock - viewAt) });
      // other players on their own motorcycles: the bike under them and them on it, with its lamps and flames
      // (own-bike-view.js), from what their game says the bike is doing; its engine and horn are heard where it is
      peerRides = [];
      for (const q of shownPeers) {
        if (q.vehicle && q.hornAgo >= 0 && q.hornAgo < 0.8 && peerHorned.get(q.id) !== q.hornAt) { peerHorned.set(q.id, q.hornAt); peerHornsHeard += 1; audio.horn(q.x, q.z); }
        if (!q.ride || !POWER_BIKES[q.ride.bike]) continue;
        const rig = crowd.rigOf(`p:${q.id}`);
        if (!rig) continue;
        const g = rig.group;
        peerRides.push({ key: q.id, id: q.ride.bike, x: g.position.x, z: g.position.z, h: g.rotation.y, lean: q.ride.lean, speed: q.ride.speed, steer: q.ride.steer || 0, throttle: q.ride.throttle, brake: q.ride.brake, rev: q.ride.rev, rig });
        if (q.hornAgo >= 0 && q.hornAgo < 0.8 && peerHorned.get(q.id) !== q.hornAt) { peerHorned.set(q.id, q.hornAt); peerHornsHeard += 1; audio.bikeHornAt(POWER_BIKES[q.ride.bike].horn, g.position.x, g.position.z); }
      }
      const peerParked = [];
      for (const q of shownPeers) for (const b of q.parked || []) peerParked.push({ ...b, key: `ppark:${q.id}:${b.bike}`, ...(b.fallen && Number.isFinite(b.ago) ? { ago: b.ago + Math.max(0, clock - viewAt) } : {}) });
      peerBikeView.update(dt, { rides: peerRides, parked: peerParked, parkedMost: 6, groundY: zoneGroundY, from: predicted, night, now: clock });
      // other players on their things from the sports mall (31 October 2026): the thing under them and them on it, as
      // their game says it is going; theirs left standing near them; a bicycle's bell heard where it is
      peerSportRides = [];
      const peerSportParked = [];
      for (const q of shownPeers) {
        for (const b of q.sports || []) peerSportParked.push({ ...b, key: `spark:${q.id}:${b.item}` });
        if (!q.sport || !SPORT_HANDLING[q.sport.sport]) continue;
        const rig = crowd.rigOf(`p:${q.id}`);
        if (!rig) continue;
        const g = rig.group;
        peerSportRides.push({ key: q.id, id: q.sport.sport, x: g.position.x, z: g.position.z, h: g.rotation.y, lean: q.sport.lean, speed: q.sport.speed, steer: q.sport.steer || 0, phase: q.sport.phase || 0, throttle: q.sport.throttle, brake: q.sport.brake, rig });
        if (q.hornAgo >= 0 && q.hornAgo < 0.8 && peerHorned.get(q.id) !== q.hornAt) { peerHorned.set(q.id, q.hornAt); peerHornsHeard += 1; audio.cycleBell(g.position.x, g.position.z); }
      }
      peerSportView.update(dt, { rides: peerSportRides, parked: peerSportParked, parkedMost: 6, groundY: zoneGroundY, from: predicted, now: clock });
      for (const r of peerSportRides) {
        if (sportSeated(r.id)) seatCharacter(r.rig); else standCharacter(r.rig);
        // (not drawn yet: they stand where they are until it is)
        if (!peerSportView.seat(r.rig, r, zoneGroundY, `peer:${r.key}`)) r.rig.group.position.set(r.x, zoneGroundY(r.x, r.z), r.z);
      }
      // another player at the wheel of their car: seen in their seat where its cabin can be seen into, as the player is
      // (car-view.js); unseen in a closed one, or while their car is not drawn (its picture stands in for it, below)
      const standing = [];
      for (const q of shownPeers) {
        if (!q.car) continue;
        const rig = crowd.rigOf(`p:${q.id}`);
        if (rig) { seatCharacter(rig); rig.group.visible = carView.seat(rig, { steer: q.car.steer }, `peer:${q.id}`); }
        if (!carView.driven(`peer:${q.id}`) && POWER_CARS[q.car.car] && Math.hypot(q.x - predicted.x, q.z - predicted.z) < PEER_STANDIN) standing.push({ key: `c:${q.id}`, kind: 'car', id: q.car.car, x: q.x, y: zoneGroundY(q.x, q.z), z: q.z, h: q.heading });
        if (q.hornAgo >= 0 && q.hornAgo < 0.8 && peerHorned.get(q.id) !== q.hornAt) { peerHorned.set(q.id, q.hornAt); peerHornsHeard += 1; audio.carHorn(q.car.car, q.x, q.z); }
      }
      for (const e of trafficCars) if (!carView.driven(`traffic:${e.n}`) && Math.hypot(e.x - predicted.x, e.z - predicted.z) < (LITE ? TRAFFIC_STANDIN.lite : TRAFFIC_STANDIN.full)) standing.push({ key: `t:${e.n}`, kind: 'car', id: e.model, x: e.x, y: zoneGroundY(e.x, e.z), z: e.z, h: e.h, lamps: night > 0.25 && (e.mode === 'drive' || e.mode === 'stop') });
      updatePeerKekes(dt);
      // the town's people out on their bicycles, skateboards and skates (sport-riders-view.js), and a cyclist's bell
      sportRidersView.update(dt, { list: view.sportRiders || [], known, eye: predicted, ahead: Math.max(0, clock - viewAt), groundY: zoneGroundY, now: clock });
      // (a ring is new when the time since the last one is shorter than it was)
      for (const r of view.sportRiders || []) { const was = riderBells.has(r.n) ? riderBells.get(r.n) : 99; if (r.bellAgo >= 0 && r.bellAgo < 0.8 && r.bellAgo < was - 0.05 && Math.hypot(r.x - predicted.x, r.z - predicted.z) < 50) { audio.cycleBell(r.x, r.z); riderBellsHeard += 1; } riderBells.set(r.n, r.bellAgo); }
      for (const r of peerRides) {
        seatCharacter(r.rig); r.rig.group.rotation.z = r.lean || 0;
        if (peerBikeView.seat(r.rig, r, zoneGroundY, `peer:${r.key}`)) continue;
        // their motorcycle not drawn as its model (on its way, or beyond the nearest few): its picture stands in for
        // it, and they sit where its saddle is, rather than on nothing
        const fx = Math.sin(r.h), fz = Math.cos(r.h), gy = zoneGroundY(r.x, r.z);
        r.rig.group.position.set(r.x - fx * 0.17, gy - 0.15 * r.rig.scale, r.z - fz * 0.17);
        if (Math.hypot(r.x - predicted.x, r.z - predicted.z) < PEER_STANDIN) standing.push({ key: `b:${r.key}`, kind: 'bike', id: r.id, x: r.x, y: gy, z: r.z, h: r.h });
        else r.rig.group.visible = false;
      }
      standins.update(standing, camera.position, performance.now() / 1000, 1 - Math.min(1, night) * 0.82);
      // the phone in other players' hands, as they hold it: on foot, on a motorcycle (the left hand), at the wheel (the right)
      updatePeerPhones(dt);
      // other players' guns and rounds, and the officers' (gun-play.js)
      if (gunPlay) gunPlay.frameOthers(dt, { peers: shownPeers, shooting: view.shooting || [], shots: view.shots || [], eye: { x: predicted.x, y: zoneGroundY(predicted.x, predicted.z) + 1.6, z: predicted.z }, rigOf: (key) => crowd.rigOf(key) });
      // a moving okada close by sounds its horn
      if (!driving && !riding && !astride && clock - lastHonk > 12) for (const b of crowd.bikes()) if (b.truth.moving && Math.hypot(b.x - predicted.x, b.z - predicted.z) < 4.5) { lastHonk = clock; audio.horn(b.x, b.z); break; }

      tickDealMarkers(dt); tickShopActors(dt); tickShowroom(dt); tickPeerTalk(dt); tickCarshow(dt); tickCarPeerTalk(dt); tickSports();
    if (online.available && online.status().state === 'down' && clock - greetedAt > 60 && !document.hidden) greetServer();
    monitor.mark('interface');
      // indoors: put away the roof of the building the player is in
      inside = town.setInside(predicted.x, predicted.z);
      room = inside ? zoneRoomAt(predicted.x, predicted.z) : null;

      saveTimer += dt;
      market.tick(dt); accountSync.tick(dt); syncOwnBikes(); syncOwnCars(); syncOwnSports();
      if (saveTimer > 20) { saveTimer = 0; monitor.time('save', () => writeStored(SAVE_KEY, { host: host.save(), playerId })); }
      ui.tick(dt);

      if (cam.free) cam.target.set(cam.free.x, cam.free.y, cam.free.z);
      // (with a gun out, where the aim is from, at once: what is in the middle of the picture is where the rounds go)
      else if (gunPlay && gunPlay.out && !gunPlay.overviewing) gunPlay.cameraTarget(me, cam.target);
      else cam.target.lerp(camGoal.set(me.group.position.x, 1.55 + zoneGroundY(me.group.position.x, me.group.position.z), me.group.position.z), 1 - Math.exp(-dt * 9));
      if (!cam.free) { frameTalk(dt); frameCarTalk(dt); }
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
    const sitting = playing && view && (view.self.driving || view.self.riding || view.self.astride || view.self.incar);
    // (in PostCivilWar PowerBike's hall, and in the car showroom's, the camera stays inside its walls and under its ceiling)
    const hall = playing && (showroom.inside || carshow.inside || sports.inside);
    builtForCamera = playing ? builtBoxes() : [];
    const runShare = playing && view && !sitting && !view.self.swimming ? Math.max(0, Math.min(1, (going.speed - SPEED.walk) / Math.max(0.1, SPEED.run - SPEED.walk))) : 0;
    // with a gun out: over the shoulder, or for five seconds the whole scene (gun-play.js); through the sight, from its eye
    const gunView = playing && gunPlay ? gunPlay.cameraView() : null;
    if (gunView && rig.view !== gunView) rig.view = gunView;
    // (a shop's or a showroom's view over: back to where the player had the camera, 30 October 2026)
    if (playing && cam.back && !ui.isOpen() && !(showroom.talk && showroom.inside) && !(carshow.talk && carshow.inside)) { cam.dist += (cam.own - cam.dist) * Math.min(1, dt * 2.5); if (Math.abs(cam.dist - cam.own) < 0.05) { cam.dist = cam.own; cam.back = false; } }
    // (the vehicle under the player moving: a view turned round it swings back behind it only then)
    const astride = !!view && view.self.astride !== null && view.self.astride !== undefined;
    const rideSpeed = !sitting ? 0 : view.self.incar ? Math.abs(carState.speed) : astride && ownSport() ? Math.abs(sportState.speed) : astride && powerBike() ? Math.abs(bikeState.speed) : astride ? Math.abs(moto.speed) : view.self.driving ? Math.abs(car.speed) : 9;
    rig.update(dt, {
      moving: !sitting || rideSpeed > 0.8,
      sight: gunView ? gunPlay.sightCamera() : null,
      cam, target: cam.target, heading: playing ? predicted.heading : cam.yaw, running: runShare,
      indoors: hall ? HALL_VIEW : inside && playing ? { pitch: inside.church ? 0.88 : 1.0, dist: inside.church ? 15 : 11 } : null,
      room: hall ? (carshow.inside ? CAR_HALL_ROOM : sports.inside ? SPORTS_HALL_ROOM : HALL_ROOM) : null,
      // (on a thing from the sports mall: higher, on its saddle or its deck)
      dragged: clock - cam.lastDrag, eyeHeight: astride && ownSport() ? (sportSeated(ownSport()) ? 1.62 : 1.74) : sitting ? 1.45 : 1.62,
      // (in a car, the view from the bonnet is over its own bonnet, however long and high the car is)
      bonnet: playing && view && view.self.incar && ownCar() ? { ahead: ownCar().length * 0.36, height: ownCar().height * 0.66 + 0.1 } : null,
      longer: playing && view && view.self.incar && ownCar() ? Math.max(0, ownCar().length - 3) : 0,
    });
    // a knock: the view pushed back off what was hit, a few centimetres, and let go
    const sinceKick = clock - camKick.at;
    if (sinceKick < 0.5 && camKick.amount > 0) { const k = camKick.amount * 0.07 * Math.exp(-sinceKick * 9) * Math.cos(sinceKick * 26); camera.position.x += camKick.x * k; camera.position.z += camKick.z * k; camera.position.y -= Math.abs(k) * 0.4; }
    // the shooting screen's aim, where the rounds go in the picture as the camera now has it
    if (playing && gunPlay) gunPlay.frameHud({ width: viewW, height: viewH, interactable: !!(prompt && prompt.short) });
    // fast on a motorcycle: the view shakes a little, more the nearer it is to its top speed (never much)
    const bikeNow = playing && view && view.self.astride && powerBike() ? powerBike() : null;
    if (bikeNow) {
      const share = Math.abs(bikeState.speed) / bikeNow.handling.top;
      const amount = share > 0.55 ? SHAKE * ((share - 0.55) / 0.45) ** 2 : 0;
      if (amount > 0) camera.position.add(shakeBy.set(Math.sin(clock * 47.1) * amount, Math.sin(clock * 53.7 + 1.1) * amount * 0.8, Math.sin(clock * 41.3 + 2.3) * amount));
    }
    // its headlamp at night
    const lit = !!bikeNow && night > 0.25 && ownBikeView.ridden() && ownBikeView.ridden().headlamp;
    const carLit = !lit && playing && view && view.self.incar && night > 0.25 && carView.driven();
    const torchLit = !lit && !carLit && playing && torch.held && !!phoneHold && phoneHold.out > 0.85;
    torch.lit = torchLit;
    // (and a gun's flash close by, gun-fx.js: its light thrown ahead of the muzzle for a few hundredths of a second, by the
    // same lamp, which nothing else uses while a gun is out: on foot, the phone put away. A lamp of the flash's own, in
    // the scene at all times, was one more light worked out for every pixel of everything: 25 October 2026, measured.)
    const flashLit = !lit && !carLit && !torchLit && playing && gunPlay ? gunPlay.flashLamp : null;
    headlight.intensity = lit ? HEADLAMP_LIGHT.bike : carLit ? HEADLAMP_LIGHT.car : torchLit ? TORCH.intensity : flashLit ? flashLit.intensity : 0;
    { const lamp = torchLit ? TORCH : flashLit ? GUN_FLASH : HEADLAMP; if (headlight.angle !== lamp.angle) { headlight.angle = lamp.angle; headlight.penumbra = lamp.penumbra; headlight.distance = lamp.distance; headlight.decay = lamp.decay; headlight.color.setHex(lamp.colour); } }
    if (torchLit) { const t = torchOf(phoneHold, predicted.heading, torch.self); headlight.position.copy(t.from); headlight.target.position.copy(t.from).addScaledVector(t.dir, 10); headlight.target.updateMatrixWorld(); }
    if (flashLit) { headlight.position.copy(flashLit.at); headlight.target.position.copy(flashLit.at).addScaledVector(flashLit.dir, 6); headlight.target.updateMatrixWorld(); }
    // the beams of the torches, as the others see them (and, faintly, the player's own)
    if (torchBeams) {
      const beams = [];
      if (torchLit) beams.push({ key: 'me', self: true, from: torch.self.from, dir: torch.self.dir, ground: zoneGroundY(predicted.x, predicted.z) });
      if (playing) for (const q of shownPeers) {
        if (!q.torch) continue;
        const e = peerPhones.get(q.id), r = crowd.rigOf(`p:${q.id}`);
        if (!e || !r || e.hold.out < 0.85) continue;
        if (!e.torch) e.torch = { from: new THREE.Vector3(), dir: new THREE.Vector3() };
        const t = torchOf(e.hold, r.group.rotation.y, e.torch);
        beams.push({ key: q.id, from: t.from, dir: t.dir, ground: zoneGroundY(q.x, q.z), d: Math.hypot(q.x - predicted.x, q.z - predicted.z) });
      }
      beams.sort((a, b) => (a.self ? -1 : b.self ? 1 : a.d - b.d));
      torchBeams.update(beams, night);
    }
    if (lit) { const b = ownBikeView.ridden(); b.headlampAt(headlight.position); headlight.target.position.copy(b.lean.localToWorld(shakeAim.set(0, 0.2, 12))); headlight.target.updateMatrixWorld(); }
    else if (carLit) { const c = carView.driven(); c.group.localToWorld(headlight.position.set(0, 0.75, c.size.length / 2 - 0.2)); headlight.target.position.copy(c.group.localToWorld(shakeAim.set(0, 0, 18))); headlight.target.updateMatrixWorld(); }

    world.tick(dt, host && host.game ? host.game.state.real : null);
    const skyState = sky.update(dt, hour, weather, cam.target, camera, hall ? 1 : 0, playing ? wildAt(predicted.x, predicted.z) : 0);
    // (the motorcycles in the hall, each its model with the pictures its distance asks for: smaller ones on a device
    // that is struggling; made ready as the player comes up to the doors, let go once the player is well away)
    powerbike.tick(dt, { eye: camera.position, player: predicted, now: nowSeconds() % 1e5, level: quality.detail, sun: sky.sun.castShadow });
    // (the car showroom: its gate as far open as the town has it, its doors, its cameras, its flags; in its hall the
    // cars, as the motorcycles are in theirs)
    if (playing && view) carshowView.tick(dt, { eye: camera.position, player: predicted, now: nowSeconds() % 1e5, people: [predicted, ...shownPeers], gateOpen: view.carshowGate || 0, level: quality.detail, sun: sky.sun.castShadow });
    // (the sports mall: its doors; in its hall the things on show)
    if (playing && view && sportsView) sportsView.tick(dt, { player: predicted, people: [predicted, ...shownPeers], level: quality.detail, sun: sky.sun.castShadow });
    night = skyState.night;
    setVehicleDaylight(1 - night);
    setCarDaylight(1 - night);
    // (glass, the river and zinc give back the sky by day; in the rain the ground is wet, and dries after it)
    const groundWet = updateFinishes(dt, { daylight: 1 - night, wetness: skyState.wetness, dull: skyState.dull });
    // (the air, by the hour, the weather and the level: the clouds' shadows drifting, the haze, the mirage on hot tarmac,
    // far gloss spread, puddles after rain)
    { const a = airAt({ sunUp: skyState.sunUp, cover: skyState.cover, wet: groundWet, indoor: hall ? 1 : 0, hour, clear: playing ? wildAt(predicted.x, predicted.z) : 0 }); setWorldShading({ t: clock, clouds: a.clouds * airLevel.clouds, threshold: a.threshold, haze: a.haze * airLevel.haze, glint: airLevel.glint, mirage: a.mirage * airLevel.mirage, puddles: a.puddles * airLevel.puddles }); }
    // (the river's waves and foam: High and up)
    setRiver({ waves: airLevel.waves, foam: airLevel.foam, t: clock });
    // (what moves over the ground: dust lifted behind vehicles on dirt, wet footprints and tyre marks after rain; and the
    // fireflies round the player in the habitation at night)
    {
      const movers = groundMovers(hall);
      const bufferHeight = renderer.getDrawingBufferSize(bufferSize).y;
      sunWay.copy(sky.sun.position).sub(sky.sun.target.position).normalize();
      const sunny = skyState.sunUp > 0.02 ? Math.min(1, skyState.sunUp * 4) * (1 - skyState.dull) : 0;
      if (dust) dust.update(dt, { amount: hall ? 0 : airLevel.dust, eye: playing ? predicted : null, camera, height: bufferHeight, sunDir: sunWay, daylight: sunny, wet: groundWet, dirt: dirtAt, ground: zoneGroundY, movers, wind: GROUND_WIND, light: 1 - night * 0.85 });
      if (wetTracks) wetTracks.update(dt, { amount: hall ? 0 : airLevel.wetTracks, wet: groundWet, raining: skyState.wetness, ground: zoneGroundY, movers, eye: playing ? predicted : null });
      if (fireflies) fireflies.update(dt, { amount: playing && !hall && habitationAway(predicted.x, predicted.z) <= 0 ? airLevel.fireflies * Math.max(0, Math.min(1, (night - 0.55) / 0.4)) * (1 - skyState.wetness) : 0, eye: playing ? predicted : null, camera, height: bufferHeight, ground: zoneGroundY });
    }
    world.glowMaterial.emissiveIntensity = night * 1.5;
    closures.update(dt, night, cam.target);
    if (!habitation && !habitationAsked && playing && performance.now() > habitationRetryAt && (warm.stage >= 5 || habitationAway(predicted.x, predicted.z) < 320)) askForHabitation();
    // (and the worker keeps it from the start, so that the game plays the habitation with no connection too)
    // (its ground too, the build's own: tools/habitation/ground-file.mjs)
    if (playing && !habitationKept && window.__PCW_FILES && window.__PCW_FILES.habitation) { habitationKept = true; webapp.keepFiles([window.__PCW_FILES.habitation, window.__PCW_FILES.ground].filter(Boolean)); }
    if (habitation) {
      // (`prepare`: its ground worked out a little a frame once the land beyond the town is in: render-habitation.js)
      habitation.update(dt, { at: playing ? predicted : cam.target, eye: camera.position, camera, night, prepare: playing && outskirts.ready });
      if (habitation.built && !habitationLife) habitationLife = habitationKit.createHabitationLife(scene, { lite: LITE });
      else if (!habitation.built && habitationLife) { habitationLife.dispose(); habitationLife = null; }
      if (habitationLife) {
        camera.getWorldDirection(lookAhead);
        habitationLife.update(dt, { eye: camera.position, look: { x: lookAhead.x, z: lookAhead.z }, night, people: habitationPeople() });
        habitatCalls.push(...habitationLife.calls());
        if (habitatCalls.length > 24) habitatCalls.splice(0, habitatCalls.length - 24);
      }
    }
    if (billboards) billboards.update(dt, { x: cam.target.x, z: cam.target.z, night, clock });
    if (billboards && playing && clock - adBoard.at > 300) { adBoard.at = clock; adBoard.refresh(); }
    for (const showroom of world.showrooms) showroom.setNight(night);
    siteLayer.setNight(night * 1.5);
    world.waterMaterial.color.copy(linear(ZONE_PROPS.water.day)).lerp(linear(ZONE_PROPS.water.night), night * 0.8).lerp(linear(ZONE_PROPS.water.dull), skyState.dull * 0.5);
    lampTimer += dt;
    if (lampTimer > 0.5) {
      lampTimer = 0;
      const nearest = world.lampHeads.map((lamp) => ({ lamp, d: Math.hypot(lamp.x - cam.target.x, lamp.z - cam.target.z) })).sort((a, b) => a.d - b.d);
      lampLights.forEach((light, index) => { const item = nearest[index]; if (item) { light.position.x = item.lamp.x; light.position.z = item.lamp.z; light.position.y = 4.8 + zoneGroundY(item.lamp.x, item.lamp.z); } });
    }
    for (const light of lampLights) light.intensity = hall ? 0 : night * STREET_LAMP.intensity;
    lampPools.mesh.visible = night > 0.02;
    lampPools.material.opacity = night * 0.5;
    markerMaterial.opacity = 0.55 + Math.sin(clock * 3) * 0.3;

    monitor.mark('sound and sight');
    // sound, and what is too far off to draw
    soundTimer += dt;
    if (soundTimer > 0.5) {
      soundTimer = 0;
      sources = soundSources(hour, weather.wet);
      // (in PostCivilWar PowerBike's hall only what is near can be seen, through its glass front: the rest of the
      // town, behind its walls, is not drawn)
      // (`outdoors`: how far one sees out of doors, by which a phone lets what is well beyond it rest: render-kit.js)
      const outdoors = Math.min(REACH[quality.detail], scene.fog.far * 0.82);
      const reach = showroom.inside || carshow.inside || sports.inside ? HALL_SIGHT : outdoors;
      world.see(cam.target.x, cam.target.z, reach, outdoors);
      // (the owner's houses and towers: each model fetched once the town is ready, for someone who can see it, or at
      // once for someone right by one; not from inside a hall)
      // (on a phone, while the habitation at the end of the road is drawn, the towers far off are drawn from their
      // smaller pictures: render-town-buildings.js)
      townBuildings.setThin(!!(habitation && habitation.built));
      townBuildings.see(cam.target.x, cam.target.z, reach, playing && warm.stage >= 5 && !hall, hall ? 0 : undefined);
      // (PostCivilWar PowerBike's tower: the owner's model, fetched once the town is ready, or at once for someone near it)
      if (playing && (warm.stage >= 5 || Math.hypot(predicted.x - POWERBIKE.portal.x, predicted.z - POWERBIKE.portal.z) < 160)) powerbike.load();
      // (the car showroom's buildings: the owner's models, each fetched once the town is ready, for someone near
      // enough to see it; render-carshow.js says how near; not while in PowerBike's hall, from where none is seen); and
      // each drawn only where it can be seen from
      if (playing && !showroom.inside && (warm.stage >= 5 || Math.hypot(predicted.x - CARSHOW.doors.x, predicted.z - CARSHOW.doors.z) < 400)) carshowView.load(predicted.x, predicted.z);
      carshowView.see(cam.target.x, cam.target.z, reach, hall ? 0 : undefined);
      // (the sports mall: made once the town is ready, or at once for someone near it; drawn where it can be seen from)
      if (sportsView) {
        if (playing && !showroom.inside && (warm.stage >= 5 || Math.hypot(predicted.x - SPORTS_MALL.doors.x, predicted.z - SPORTS_MALL.doors.z) < 400)) sportsView.load(predicted.x, predicted.z);
        sportsView.see(cam.target.x, cam.target.z, reach, hall ? 0 : undefined);
      }
      // (the owner's vehicles: the parked ones as someone comes near each, the ambulance's once the town is ready; and,
      // like the houses and towers above, nothing fetched from inside a hall, from where none of them is seen)
      if (playing && !hall) { supplied.tick(predicted); if (warm.stage >= 5) supplied.loadAmbulance(); }
      // (beyond the town: built a few seconds into play once the town is warmed up, or at once for someone already out there)
      if (!outskirts.ready && playing && (beyondWanted(predicted.x, predicted.z) || !billboards)) {
        beyondWait += 0.5;      // (this is looked at twice a second)
        const out = predicted.x < ZONE.bounds.minX + 40 || predicted.z > 150;
        if (out) buildBeyond(); else if (warm.stage >= 5 && beyondWait > 4) beyondBegun = true;
      }
      // (a phone far to the east: the land beyond the town let go, BEYOND_PHONE)
      if (LITE && playing && outskirts.ready && predicted.x > BEYOND_PHONE.go && predicted.z <= 150) letGoBeyond();
      outskirts.see(cam.target.x, cam.target.z, reach, outdoors);
      world.seeVehicles(camera.position.x, camera.position.z, reach + cam.dist);
      town.see(cam.target.x, cam.target.z, reach, outdoors);
    }
    if (playing) {
      const engines = [];
      for (const b of crowd.bikes()) if (b.truth.moving) engines.push({ x: b.x, z: b.z, rev: Math.min(1, 0.35 + b.speed / 9), d: Math.hypot(b.x - predicted.x, b.z - predicted.z) });
      // other players' kekes and okadas, heard where they are
      for (const q of shownPeers) if (q.vehicle && Math.hypot(q.vel ? q.vel[0] : 0, q.vel ? q.vel[1] : 0) > 0.5) { const sp = Math.hypot(q.vel[0], q.vel[1]); engines.push({ x: q.x, z: q.z, rev: Math.min(1, 0.35 + sp / 9), d: Math.hypot(q.x - predicted.x, q.z - predicted.z) }); }
      engines.sort((a, b) => a.d - b.d);
      let close = 0;
      for (const actor of crowd.actors()) if (actor.d < 14) close += 1;
      if (view) voicePlayer.update(view.speech, view.voicesNear, headOf);
      audio.update(dt, { listener: { x: predicted.x, z: predicted.z, yaw: cam.yaw, indoors: !!inside || showroom.inside || carshow.inside || sports.inside }, hour, night, weather, shore: zoneShoreZ(predicted.x) - predicted.z, crowd: close, own: ownEngine, engines: engines.slice(0, 3).filter((e) => e.d < 60), peerBikes: peerRides.map((r) => ({ key: r.key, bike: r.id, x: r.x, z: r.z, rev: r.rev || 0, throttle: r.throttle || 0 })), peerCars: carsHeard, sources, panel: uiBlocks(), siren: ambulance ? ambulance.siren : null, habitat: habitatSound() });
    }

    monitor.mark('warming up');
    if (!NO_DRAW) warmStep();
    // every program compiled while playing is held on to as those compiled ahead are (warmup.js, pin): one the town
    // drew a while ago, the habitation's say, was otherwise thrown away with the last material using it and compiled
    // again, a hang of a second or more on a phone, every time it came back into sight (26 October 2026)
    if (clock - programsPinnedAt > 2) { programsPinnedAt = clock; warmUp.pin(); }
    // the land beyond the town, a piece a frame once begun (buildBeyond)
    if (beyondBegun && !outskirts.ready && playing) stepBeyond();
    monitor.mark('drawing');
    // behind the opening nothing of the town can be seen: once it is warmed up, it is not drawn at all
    // the start screen covers the town entirely: once it is warmed, it is not drawn behind it for nobody
    const covered = !playing && startEl && !startEl.hidden;
    // The phone held up covers the right of the screen: the picture is moved over so the character is not behind it.
    phoneShift += ((playing ? ui.phoneWidth() : 0) / 2 - phoneShift) * Math.min(1, dt * 7);
    if (phoneShift > 0.5) camera.setViewOffset(viewW, viewH, phoneShift, 0, viewW, viewH); else if (camera.view && camera.view.enabled) camera.clearViewOffset();
    // a page of the phone covers the town entirely, so the town is not drawn behind it
    const paged = playing && ui.usingPhone() && !ui.phoneOut();
    if (playing && !NO_DRAW && ui.phoneScreen() === 'camera') monitor.time('phone camera', () => phoneCam.draw(dt));
    // (nothing is drawn once the browser has taken the graphics away: what the graphics card held is gone, and the
    // page let its own copies go once the card had them, so the picture cannot be made again without a reload)
    // (the character screen draws on the town's canvas, put in its turntable's box: back where it lives, and the town's
    // size again, the moment the start screen is gone: shared-view.js)
    if (!covered && canvasAway()) { canvasHome(); if (townBuilt) applyQuality(quality.level); else resize(); }
    townWanted = playing && !NO_DRAW && !covered && !paged && !intro.active();
    const drewTown = !NO_DRAW && !covered && !paged && !pictureGone && !intro.active();
    // (at Ultra the town as the river gives it back, drawn first: river-water.js)
    if (drewTown && airLevel.mirror > 0 && world && world.water) {
      if (!riverMirror) riverMirror = createRiverMirror(renderer, scene, camera, world.water);
      monitor.time('river mirror', () => riverMirror.render(hall ? 0 : airLevel.mirror, airLevel.mirrorSize));
    }
    if (drewTown) { renderer.render(scene, camera); watch.drawn(now); }
    // the soft darkening where things meet (High and up: ambient-occlusion.js), outdoors and in the halls
    if (drewTown && airLevel.ao > 0) {
      if (!occlusion) occlusion = createAmbientOcclusion(renderer, scene, camera);
      monitor.time('occlusion', () => occlusion.apply(airLevel.ao, now));
    }
    // the glow round what is brightest in the picture (Medium and up), and the sun's flare (Ultra): screen-glow.js
    if (drewTown && airLevel.glow > 0) {
      if (!glow) glow = createScreenGlow(renderer);
      monitor.time('glow', () => glow.apply({ amount: airLevel.glow * (0.28 + 0.42 * night), night, wide: airLevel.glowWide, flare: airLevel.flare > 0 && !hall ? sunOnScreen(skyState) : null }));
    }
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
    if (voiceChat.on) voiceChat.update();
    if (voiceUI) voiceUI.frame();
    monitor.end(elapsed * 1000);
    if (clock > 4 && !document.hidden) { governor.frame(elapsed * 1000, dt); if (playing && townBuilt) quickTest(clock); }
    // (pictures the graphics level asked to be made another size: the next one, one at a time)
    stepPictures();
    if (keeper && townBuilt && !pictureGone) keeper.step(performance.now());
  }

  // The picture taken away (18 October 2026, and again 20 October: "players must never see a notice like 'The picture
  // was lost'"). A browser short of graphics memory, most often a phone's, may take a page's drawing surface (its WebGL
  // context) away, and give it back a moment later. The game is saved at once, and a calm card says only that the
  // picture is coming back. When the browser gives it back, everything the graphics card held is handed to it again
  // where the game still has it, and made again where it let its own copy go (the town's numbers kept aside:
  // render-kit.js; every picture from its file: glb.js; the vehicles' sky: vehicle-models.js), and the game carries
  // on where it was, nothing reloaded. Only if the browser has not given it back within five seconds is the player
  // given one thing to press, Continue, which opens the game afresh straight into the town where they were (the
  // game never reloads itself: the player chooses). Each time it is taken is counted (`contextLost`).
  let contextLost = 0;
  let pictureGone = false;            // taken away and not given back yet: nothing is drawn meanwhile
  let lostTimer = 0;
  const carryOnAfresh = () => {
    if (playing) { try { writeStored(SAVE_KEY, { host: host.save(), playerId }); } catch (error) { /* saved as far as it could be */ } }
    // (the game opened afresh goes straight into the town, past the opening: intro.js)
    try { sessionStorage.setItem('pcw-carry-on', String(Date.now())); } catch (error) { /* a browser that keeps nothing: the opening is shown */ }
    location.reload();
  };
  const goneTrouble = () => loading.trouble('The picture stopped', 'Your game is saved where you are. Continue to carry on from there.', 'Continue', carryOnAfresh);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();          // (so that the browser gives it back)
    contextLost += 1;
    pictureGone = true;
    graphics.lost();
    monitor.count('graphics context lost');
    if (playing) { try { writeStored(SAVE_KEY, { host: host.save(), playerId }); accountSync.upload({ keepalive: true }); } catch (error) { /* saved as far as it could be */ } }
    loading.show('One moment', 'Bringing the picture back');
    clearTimeout(lostTimer);
    lostTimer = setTimeout(() => { if (pictureGone) goneTrouble(); }, 5000);
  }, false);
  canvas.addEventListener('webglcontextrestored', async () => {
    monitor.count('graphics context restored');
    clearTimeout(lostTimer);
    if (!loading.open || loading.kind !== 'wait') loading.show('One moment', 'Bringing the picture back');
    try {
      // (three.js has made itself ready again already: its own listener comes first; the programs are compiled again
      // as each is first drawn)
      const numbers = await restoreGeometry();
      loading.progress(0.4);
      const pictures = await restorePictures();
      loading.progress(0.85);
      const reflections = townBuilt ? renewEnvironment(renderer, scene) : 0;
      const views = renewViews();
      warmUp.restart();
      restored = { at: Math.round(performance.now()), numbers, pictures, reflections, views };
      restoredTimes += 1;
      pictureGone = false;
      // (Auto never keeps a level the device could not hold: the picture taken away in the town, a level lower, and said)
      if (townBuilt && prefs.graphics === 'auto' && governor.level < LOW) governor.set(governor.level + 1, 'the graphics card gave the picture up');
      loading.progress(1);
      await painted();
      if (!preparing || isReady) loading.hide();
    } catch (error) {
      console.error('PostCivilWar: the picture could not be brought back', error);
      goneTrouble();
    }
  }, false);
  let restored = null;                // what the last giving back did (for the checks and the readout)
  let restoredTimes = 0;

  // Over the budget for the graphics card (budget.js), or nearly full (graphics.js, memoryLimitMB: on a phone nine
  // tenths of its budget): first everything kept ready but not being drawn is let go (figures looked at on the character
  // screen, motorcycles and cars no longer in sight). Looked at every two seconds. Still nearly full with nothing more to
  // let go, the graphics level is lowered a step (whether Auto or chosen: the picture is never lost to a level), and said
  // (once); and the level given up is not climbed back to for a while, longer each time (monitor.js, `lower`). (A step at
  // most every ten seconds, and only once the pictures the last one made smaller have all been made: what a lower level
  // lets go takes a moment to be let go.)
  let memoryStepAt = -Infinity;
  const memoryLimit = memoryLimitMB(graphicsBudgetMB, LITE);
  // (the tests: how much more than it holds the card is taken to hold, to try what nearly full does without filling it)
  const pretend = { extraMB: 0 };
  setInterval(() => {
    if (pictureGone || graphics.unwatched) return;
    const usedMB = (graphics.pictures + graphics.buffers) / 1048576 + pretend.extraMB;
    // (first what is kept ready and not drawn is let go, and the card counted again two seconds later; the level is
    // lowered only when that was not enough)
    if (usedMB > Math.min(graphicsBudgetMB, memoryLimit)) {
      const freed = dropUnusedFigures() + trimBikes() + trimCars() + trimSports();
      if (freed) { graphicsTrims += 1; monitor.count('over the graphics budget: let go of what was kept ready'); return; }
    }
    if (townBuilt && usedMB > memoryLimit && governor.level < LOW && performance.now() - memoryStepAt > 10000 && picturesWaiting() === 0) {
      memoryStepAt = performance.now();
      governor.lower(`the graphics card nearly full (${usedMB.toFixed(0)} of ${graphicsBudgetMB} MB)`);
    }
  }, 2000);

  // The readout (stats.js): the address ending in #stats shows it in a corner of every screen; Settings shows the same.
  const build = (() => { try { const src = (document.querySelector('script[src*="game.js"]') || {}).src; return src ? `game ${new URL(src).searchParams.get('v') || ''}`.trim() : 'one page'; } catch (error) { return 'one page'; } })();
  const screenName = () => (!intro || intro.active() ? 'the opening' : loading.open ? `the loading card: ${document.getElementById('loading-title').textContent}` : playing ? 'the town' : $('start') && !$('start').hidden ? (($('start').dataset.screen === 'create' ? 'the character screen' : `the start screen (${$('start').dataset.screen || ''})`)) : 'between screens');
  const heapNow = () => { try { const m = performance.memory; return m && m.usedJSHeapSize ? { used: m.usedJSHeapSize, limit: m.jsHeapSizeLimit } : null; } catch (error) { return null; } };
  const frameTimes = HASH.includes('stats') ? frameClock().start() : null;
  const statsNow = () => ({ build, engine: THREE.REVISION, level: GRAPHICS_LEVELS[governor.level].name, levelAuto: prefs.graphics === 'auto', gpu: gpuName(), screen: screenName(), device: watch.device, pixelRatio: renderer.getPixelRatio(), graphics, budgetMB: graphicsBudgetMB, trims: graphicsTrims, heap: heapNow(), frames: frameTimes ? frameTimes.report() : null, lost: contextLost, restored: restoredTimes, figures: figureLog(), watch: watch.said ? watch.detail.split('\n').slice(0, 3).join('; ') : '' });
  // (the readout never holds the game up: anything it cannot say this second, it says the next)
  if (frameTimes) { const box = showStats(); const draw = () => { try { box.update(statsLines(statsNow())); } catch (error) { /* said next second */ } }; setTimeout(draw, 0); setInterval(draw, 1000); }
  // (the town's sounds stop while the page is out of sight, and start again when it is back)
  // (the microphone stops while the game is out of sight, and starts again when it is back)
  document.addEventListener('visibilitychange', () => { if (voiceChat.on) { if (document.hidden) voiceChat.pause(); else voiceChat.resume(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) letGo(); if (document.hidden && playing) { writeStored(SAVE_KEY, { host: host.save(), playerId }); accountSync.upload({ keepalive: true }); } if (document.hidden) audio.suspend(); else if (playing && prefs.sound) audio.start(); last = performance.now(); monitor.pause(); });
  if (window.claude && window.claude.hot && typeof window.claude.hot.snapshot === 'function') {
    window.claude.hot.snapshot(() => (playing ? { host: host.save(), playerId } : {}));
  }
  // Debug handle for automated play-testing. It reaches into the simulation
  // directly, which only works because this prototype runs it in the page.
  window.__nlw = {
    // voice chat (29 October 2026)
    voiceChat, get voiceUI() { return voiceUI; },
    // the habitation (20 October 2026): what is built of it, its fish and birds, the torch and the others' beams, the sky
    get habitation() { return habitation; }, get habitationLife() { return habitationLife; }, torch, get torchBeams() { return torchBeams; }, get sky() { return sky; }, get scene() { return scene; }, get camera() { return camera; },
    heldModels, carsHeld, bikesHeld, figureLog, paintedStats, crowdFigures: () => (crowd ? crowd.crowdFigures() : []), crowdReach: () => CROWD[quality.detail].reach, get graphics() { return graphics; },
    get supplied() { return supplied; }, get keeper() { return keeper; }, get townBuildings() { return townBuildings; }, get ambulanceDrawn() { return ambulance; }, finishes: finishState, foliage: foliageState,
    skillsState: () => skills.state,
    // the town's voices (28 October 2026): what the page has fetched and played
    voicePlayer, voiceStats: () => ({ ...voicePlayer.stats(), ...audio.voiceStats() }),
    get host() { return host; }, get playerId() { return playerId; }, get view() { return view; }, ui, cam, get crowd() { return crowd; }, audio, get ownBikeView() { return ownBikeView; }, rideBike: (id) => rideOwnBike(id), bikeState, get sportView() { return sportView; }, get peerSportView() { return peerSportView; }, get sportRidersView() { return sportRidersView; }, takeSport: (n) => takeSport(n), retakeSport: (n) => retakeSport(n), get bellsHeard() { return riderBellsHeard; }, get peerSportRides() { return peerSportRides; }, rideSport: (id) => rideOwnSport(id), sportState, ownSport: () => ownSport(), speedo, bikeCc: (id) => (POWER_BIKES[id] ? POWER_BIKES[id].cc : 0), bikeTop: (id) => (POWER_BIKES[id] ? handlingOf(POWER_BIKES[id]).top : 0), get peerBikeView() { return peerBikeView; }, get peerRides() { return peerRides; }, get shownPeers() { return shownPeers; }, get predicted() { return predicted; }, ground: (x, z) => zoneGroundY(x, z), service: (id) => { const sv = ZONE_SERVICES.find((x) => x.id === id) || ZONE_SERVICES[id]; return sv ? { x: sv.x, z: sv.z } : null; }, peerKekes, claimedFleet, vehicleActors, get peerHornsHeard() { return peerHornsHeard; }, get night() { return night; }, get headlight() { return headlight; }, server, prompt: () => findPrompt(), get town() { return town; }, bubbles, known, perf,
    place(x, z) { const p = host.game.state.players[playerId]; p.x = x; p.z = z; p.lastMoveAt = host.game.state.real; predicted.x = x; predicted.z = z; refreshView(); },
    // puts the vehicle being driven somewhere, for screenshots
    park(x, z, heading) { const p = host.game.state.players[playerId]; const v = host.game.state.vehicles.list[p.driving]; v.x = x; v.z = z; v.heading = heading; p.x = x; p.z = z; p.lastMoveAt = host.game.state.real; predicted.x = x; predicted.z = z; predicted.heading = heading; car.speed = 0; refreshView(); },
    get car() { return car; }, controls, monitor, rig, get mode() { return mode; },
    get drawn() { return { triangles: renderer.info.render.triangles, calls: renderer.info.render.calls }; },
    get inside() { return inside ? inside.id : null; },
    get quality() { return quality.level; }, get qualityDetail() { return quality.detail; }, graphicsBudget: graphicsBudgetMB, memoryLimit,
    // (the graphics level as drawn now: for the tests)
    cloudShadeAt,
    get levelState() { return { level: governor.level, detail: quality.detail, pixelRatio: renderer.getPixelRatio(), shadows: sky.sun.castShadow, shadowMap: sky.sun.shadow.mapSize.x, shadowReach: sky.sun.shadow.camera.right, softness: sky.sun.shadow.radius, patches: softPatchesShown(), patchOpacity: softPatchOpacity(), skyLight: sky.skyLight, warmth: sky.state().warmth, toneMapping: renderer.toneMapping, air: worldShadingState(), airLevel: { ...airLevel }, glow: glow ? glow.state() : null, dust: dust ? dust.state() : null, fireflies: fireflies ? fireflies.state() : null, wetTracks: wetTracks ? wetTracks.state() : null, occlusion: occlusion ? occlusion.state() : null, river: { ...riverState(), mirror: riverMirror ? riverMirror.state() : null }, finish: finishState(), view: sky.view, pictureMost: pictureMost(), picturesWaiting: picturesWaiting(), pictures: pictureState(), trims: graphicsTrims, memoryLimit, kept: keeper ? keeper.state() : null, resting: restState() }; }, graphicsPretend: pretend, get graphicsChoice() { return prefs.graphics; }, setGraphics: (value) => setGraphics(value), get sunShadows() { return sky.sun.castShadow; }, governor, scene, renderer, THREE, get world() { return world; }, warmUp, get ready() { return isReady; },
    // every keke and coach in the scene: which level of detail it is at and what it costs
    get fleet() { return [...world.parkedVehicles.map((v) => v.model), ...[...vehicleActors.values()].map((a) => a.model)].map((m) => ({ model: m.model, look: m.look.id, trim: m.trim, level: m.level, triangles: m.triangles, shown: m.group.visible, spin: m.spin, steering: m.steering, lit: m.lit, x: m.group.position.x, z: m.group.position.z })); },
    get link() { return link ? link.status() : null; },
    // the guns (gun-play.js), their word with the server (gun-net.js), and the shooting screen's state
    get gunPlay() { return gunPlay; }, gunNet, gunTargets: () => gunTargets(), aimBy: (dx, dy) => aimBy(dx, dy),
    get phoneHold() { return phoneHold; }, camera,
    // PostCivilWar PowerBike: the building, the salesman, and asking about a motorcycle
    get powerbike() { return powerbike; }, salesman, get salesmanActor() { return salesmanActor; }, showroom, goShowroom: (way) => goShowroom(way), askAbout: (bike) => askAbout(POWERBIKE.displays.find((d) => d.bike === bike)), hallCustomers: () => hallCustomers(),
    // the Post Civil War Car Showroom: the compound and its hall, the two who sell the cars, and asking about one; the
    // player's own cars and driving them
    get sportsView() { return sportsView; }, sports, goSports: (way) => goSports(way), askAboutSport: (item) => askAboutSport(SPORTS_MALL.displays.find((d) => d.item === item)),
    get carshowView() { return carshowView; }, get carSalesmen() { return carSalesmen; }, carshow, goCarshow: (way) => goCarshow(way), askAboutCar: (car) => askAboutCar(CARSHOW.displays.find((d) => d.car === car)), carHallCustomers: () => carHallCustomers(),
    get carView() { return carView; }, carState, get standins() { return standins; }, peerPhones, get contextLost() { return contextLost; }, get pictureGone() { return pictureGone; }, get restored() { return restored; }, loading, get frameErrors() { return frameErrors; }, watch, driveCar: (id) => enterOwnCar(id), leaveCar: () => leaveOwnCar(), driveTaken: (n) => enterTakenCar(n), get trafficCars() { return trafficCars; }, get near() { return near; }, refresh: () => { refreshView(); near = findNear(); prompt = findPrompt(); }, carTop: (id) => (POWER_CARS[id] ? carHandlingOf(POWER_CARS[id]).top : 0), get carsHeard() { return carsHeard; },
    online, market, accountSync, dealMarkers, get accountUI() { return accountUI; }, refreshDealMarkers, wallet: walletClient, confirm, mayEnter: () => mayEnter(), eraseSave: () => eraseSave(), route: () => route(), openGallery: () => openGallery(), closeGallery: () => closeGallery(), get gallery() { return gallery; }, exitGame: () => exitGame(), get exited() { return exited; }, get playing() { return playing; }, upgradeCharacter: () => upgradeCharacter(), get quoted() { return quoted; }, knownPath: () => knownPath(), syncProfile: () => syncProfile(),
    face(heading) { predicted.heading = heading; host.game.state.players[playerId].heading = heading; },
    act(id) { near = findNear(); prompt = findPrompt(); act(id, 'down'); },
    walkable: (x, z) => zoneWalkable(x, z, structureBoxes()),
    saveNow() { writeStored(SAVE_KEY, { host: host.save(), playerId }); },
    get lite() { return LITE; }, get going() { return going; }, get me() { return me; },
    // for the browser tests: the power bike's riding controls on screen, with nothing to ride (no bike is in the game yet)
    get beyond() { return outskirts.ready; }, get closures() { return closures; }, get billboards() { return billboards; }, adBoard, buildBeyond: () => buildBeyond(), beginBeyond: () => { beyondBegun = true; }, get beyondSteps() { return { ...beyondStats }; },
    bikePreview(on) { bikePreview = !!on; showControls(); return controls.shown; },
    bikeAudio: { BIKE_SOUNDS, BIKE_HORNS, createBikeEngine, soundBikeHorn, firingHz }, get bikeInput() { return controls.bike(); },
    skip(gameHours) { host.game.advance(gameHours * 3600); refreshView(); },
    // everything at a share of its speed (a fall seen frame by frame in a slow headless browser), and back to 1
    slow(share = 1) { timeScale = Math.max(0.02, Math.min(1, Number(share) || 1)); return timeScale; },
    fetchWeather: () => fetchWeather(), get realWeather() { return realWeather; },
    // the sky the player chooses (Settings, Time and weather), as the panel sets it
    setSky: (choice) => { prefs.skyTime = SKY_TIMES[choice.time] !== undefined ? choice.time : 'real'; prefs.skyWeather = SKY_WEATHERS[choice.weather] ? choice.weather : 'real'; writeStored(PREFS_KEY, prefs); return skyChoice(); },
    // A second player, in a second copy of the world in this page, joined to
    // this one by the loopback transport: the same path two devices take.
    twin(name = 'Second Player', x = null, z = null) {
      const hub = createLoopbackHub();
      const other = newHost();
      const id = other.game.join({ name, look: { skin: 0x4f3019, top: 0x1f5c4d, body: 'f' } });
      transport = { kind: 'twin', make: () => hub.join('first') };
      relink();
      const q = other.game.state.players[id];
      if (x !== null) { q.x = x; q.z = z; }
      let asking = null;            // the second player asking the showroom's salesman about a motorcycle
      let askingCar = null;         // or asking about one of the car showroom's cars
      const selfOf = () => { const v = other.game.view(id).self; return asking ? { ...v, talk: { bike: asking.bike, ago: other.game.state.real - asking.since } } : askingCar ? { ...v, carTalk: { car: askingCar.car, ago: other.game.state.real - askingCar.since } } : v; };
      twin = { host: other, id, link: createLink({ transport: hub.join('second'), game: other.game, zoneId: ZONE.id, self: selfOf }), place(px, pz) { q.x = px; q.z = pz; q.lastMoveAt = other.game.state.real; }, face(h) { q.heading = h; }, ask(bike) { asking = bike ? { bike, since: other.game.state.real } : null; }, askCar(car) { askingCar = car ? { car, since: other.game.state.real } : null; }, say: (text) => other.game.intent(id, { type: 'chat.say', text }), language: (lang) => other.game.intent(id, { type: 'settings.language', lang }), view: () => other.game.view(id) };
      return twin;
    },
    get second() { return twin; },
    // where a kind of place is, for the play-through: the first spot of that venue and slot
    spot(venue, slot, nth = 0) { const found = ZONE_SPOTS.filter((sp) => sp.venue === venue && sp.slot === slot)[nth]; return found ? { x: found.x, z: found.z, facing: found.facing, room: found.room } : null; },
    // plays each kind of music for a few seconds into a buffer and measures it
    musicCheck: () => Promise.all(Object.keys(MUSIC_STYLES).map((style) => renderStyle(style, 4))),
  };

  showStart(false);
  // The opening plays over the start screen while the town is made ready behind it. The one question is asked
  // in it only where there are no accounts and it has never been answered on this device; on the website it is
  // the account's to answer, and is put (once) after signing in, to an account that never has (`route`).
  intro = createIntro({
    audio,
    // the same switch as Settings and the N key: on for a first visit, and whatever the player last chose after that
    sound: { on: () => !!prefs.sound, toggle: () => { prefs.sound = !prefs.sound; audio.setMuted(!prefs.sound); writeStored(PREFS_KEY, prefs); } },
    ask: () => !online.available && !knownPath(),
    onDone: (path) => { if (path) choosePath(path); setTimeout(route, 0); },
    // the cover is up, and PLAY with it: the figure the character screen opens on is fetched now, quietly, into the
    // browser's cache, while the player looks at the cover (never before: the opening comes first)
    onCover: () => { if (!playerId) warmFigures([creator.figure()]); },
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
  // The game starts the moment its script is here (20 October 2026): the town is built only when the player goes into
  // it (prepareTown), and what it is built from is fetched only when it is wanted (packs.js), so nothing holds the
  // opening up. The brand has its moment on the screen (intro.js), and PLAY follows it.
  begin();
}
