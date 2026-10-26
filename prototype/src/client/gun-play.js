// Guns in the player's hands, and everyone else's as this game sees them (25 October 2026, the owner's brief for the
// guns, the aiming and fighting with them between players; and his brief of 22 October: shooting, health, blood and the
// 20-life rule). What a gun may do is decided by the town's own rules (src/sim/guns.js) and, between players, by the
// website's server (api/_lib/guns.js); this is how it is played and seen:
//
//   taking it out      the gun comes up into the figure's hands (gun-pose.js); the shooting screen comes (gun-hud.js,
//                      main.js's buttons) and the camera goes over the right shoulder (camera.js 'aim'). Put away, or
//                      taken away by the rules (a vehicle, the water, the police, badly hurt), all of it goes again
//   aiming             the camera's aim is the gun's: a line from over the right shoulder through the middle of the
//                      picture (looking through the sight, from the sight's own eye); the barrel points at whatever that
//                      line first meets, and the rounds go there. On a touch screen a little pull of the aim toward
//                      someone close to it, while the aim is being moved or the gun fired
//   firing             held: one round after another at the gun's rate (its rpm), each the town's to allow and to follow
//                      to where it stops (walls, vehicles, people); each with its flash at the muzzle, its streak, its
//                      sound (the owner's recordings, gun-audio.js), its case thrown out, the gun kicking back into the
//                      shoulder and the aim climbing a little and settling; the rounds spread a little, more on the move
//                      or with the trigger held, less aimed through the sight or crouched
//   reloading          with Reload, or by itself when the trigger is pulled on an empty gun with rounds spare
//   the rounds' word   each round is sent to the website's server (gun-net.js), which counts it and says which hit
//                      another player; the one hit is told by the server, and their own game takes the life off them
//   being hit          blood on the screen (blood-screen.js), on the clothes (wound-paint.js), a flinch, where it came from
//   the others         other players' guns in their hands, aimed where they aim, their rounds seen and heard where they
//                      are; the police officers' rifles as they shoot back

import { GUNS, GUN, POLICE_FIRE } from '../sim/guns.js';
import { makeGun, GUN_NEAR, gunPicture, GUN_MODELS } from './gun-model.js';
import { createGunHold, RELOAD_STEPS } from './gun-pose.js';
import { createGunFx } from './gun-fx.js';
import { createGunHud } from './gun-hud.js';
import { createBloodScreen } from './blood-screen.js';
import { woundAt, addWound, paintWounds } from './wound-paint.js';
import { CAMERA_VIEW } from './camera.js';

const angleGap = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const smooth = (t) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };

// How the aim is held, by what the player is doing (radians either side the rounds may go: GUNS[...].spread), and how
// fast they may go with it (a share of their walk)
export const GUN_PLAY = Object.freeze({
  pace: Object.freeze({ aim: 0.85, sight: 0.55, crouch: 0.5 }),
  // the camera over the right shoulder: from the figure's middle up this high (a figure 1.75 m tall), and the line of
  // the aim this far to its right and above that (camera.js 'aim' has the same)
  pivot: 1.47,
  // looking through the sight: how wide the picture is (degrees, top to bottom)
  sightFov: 32,
  // the pull of the aim toward someone near it, on a touch screen: within this angle of it, at this rate
  assist: Object.freeze({ within: 0.06, sight: 0.03, rate: 3.2, share: 0.5 }),
  // the spread growing as the trigger is held, and settling
  bloom: Object.freeze({ per: 0.0018, most: 0.02, settle: 0.06 }),
  // seconds the view from further back lasts (the owner's brief: five)
  overview: 5,
  // other players and officers further than this are not posed with their guns (too small to see)
  far: 90,
});

export function createGunPlay(deps) {
  const { scene, camera, audio, lite = false, coarse = false, ground = () => 0, net = null, online = null } = deps;
  const game = () => deps.game();
  const send = (intent) => deps.send(intent);
  const fx = createGunFx(scene, { lite, ground, drawn: deps.drawn });
  const hud = createGunHud({ hud: deps.hudRoot, hudr: deps.hudr, picture: (id) => gunPicture(id), onSwitch: () => openSwitch(), onEquip: (id) => equip(id), onBuy: (g) => buy(g) });
  const blood = createBloodScreen(deps.bloodRoot || document.body, deps.hudRoot || null);

  const V = () => new THREE.Vector3();
  const t = { d: V(), T: V(), P: V(), o: V(), e: V(), a: V(), b: V(), c: V(), right: V(), up: V(), muzzle: V(), aimFrom: V(), proj: V(), sightEye: V(), sightDir: V() };
  const S = {
    out: false, gunId: 'rifle', gun: null, hold: createGunHold(), weight: 0,
    aimHeld: false, aimToggle: false, crouch: false, overviewUntil: 0, overviewAt: -1,
    firing: false, next: 0, fired: 0, kicks: 0, lastShot: -9, bloom: 0, recoilPitch: 0, recoilYaw: 0, wasFiring: false,
    running: false, look: null, block: null, assisting: false,
    lastAim: '', health: 100, healthBefore: 100,
    shots: [],               // this player's rounds lately, for the others to see (link.js `sh`)
    wounds: [],              // the wounds on this player's body (link.js `wd`)
    owned: null,             // the server's word on what guns this account has (gun.state)
    stateAsked: false, readyAt: 0, autoReload: false, said: { empty: 0 },
    reloadDoing: null,       // a reload under way here: { gun, t (when it began), after (the last round before it), mag }
    clock: 0, sightW: 0, moving: { x: 0, z: 0 },
  };
  const stats = { fired: 0, refused: {}, hits: 0, confirmed: 0, struck: 0, peerShots: 0, policeShots: 0, assists: 0, reloads: 0, autoReloads: 0, empties: 0 };

  // ---- taking it out and putting it away ----
  function draw() {
    if (S.out) return true;
    const r = send({ type: 'gun.draw' });
    if (!r.ok) { if (deps.toast) deps.toast(r.message || 'You cannot use a gun just now.'); return false; }
    S.out = true;
    S.gunId = r.gun.equipped;
    ensureGun(S.gunId);
    audio.gunLoad(S.gunId);
    hud.show(true);
    if (net) net.armed = true;
    S.firing = false; S.aimHeld = false; S.aimToggle = false; S.crouch = false;
    S.readyAt = S.clock + 0.35;
    sendAim();
    return true;
  }
  function putAway({ told = false } = {}) {
    if (!S.out) return;
    if (!told) send({ type: 'gun.holster' });
    if (S.wasFiring) burstEnd();
    S.out = false; S.firing = false; S.aimHeld = false; S.aimToggle = false; S.crouch = false; S.overviewUntil = 0;
    hud.show(false);
    if (net) net.armed = false;
    S.lastAim = '';
  }
  function ensureGun(id) {
    if (S.gun && S.gun.id === id) return S.gun;
    if (S.gun) S.gun.dispose();
    S.gun = makeGun(id);
    S.gun.group.visible = false;
    scene.add(S.gun.group);
    return S.gun;
  }
  // how the gun is held, and crouched or not, for the town (others see it: link.js `gn`)
  function sendAim() {
    if (!S.out) return;
    const how = S.running ? 0 : sightWanted() ? 2 : 1;
    const key = `${how}|${S.crouch ? 1 : 0}`;
    if (key === S.lastAim) return;
    S.lastAim = key;
    send({ type: 'gun.aim', aim: how, crouch: S.crouch });
  }
  const sightWanted = () => S.out && !S.running && (S.aimHeld || S.aimToggle);

  // ---- the guns the account has (the website's server) ----
  async function askState() {
    if (!online || !online.signedIn) return null;
    S.stateAsked = true;
    const r = await online.ask('gun.state');
    if (!r.ok || !r.gun) { S.stateAsked = false; return null; }
    takeState(r.gun);
    return r.gun;
  }
  function takeState(state) {
    S.owned = state;
    const guns = state.guns.filter((g) => g.owned).map((g) => ({ id: g.id, mag: g.mag, spare: g.spare }));
    // (rounds fired that the server has not yet heard of are taken off what it says)
    const waiting = net ? net.waiting : 0;
    for (const g of guns) if (g.id === state.equipped) g.mag = Math.max(0, g.mag - waiting);
    send({ type: 'gun.owned', guns, equipped: state.equipped });
  }
  function openSwitch() {
    const v = deps.view();
    const have = v && v.self.gun ? v.self.gun : null;
    const all = Object.values(GUNS).map((def) => {
      const mine = have ? have.have.find((g) => g.id === def.id) : null;
      const server = S.owned ? S.owned.guns.find((g) => g.id === def.id) : null;
      return { id: def.id, name: def.name, owned: !!mine, mag: mine ? mine.mag : 0, spare: mine ? mine.spare : 0, magazine: def.magazine, starter: !!def.starter, price: server ? server.price : def.price, forSale: server ? server.forSale : !!def.forSale && !def.starter };
    });
    hud.openSwitch({ guns: all, equipped: have ? have.equipped : S.gunId });
  }
  function equip(id) {
    const r = send({ type: 'gun.equip', gun: id });
    if (!r.ok) { if (deps.toast) deps.toast(r.message); return; }
    if (online && online.signedIn) online.ask('gun.equip', { gun: id }).then((a) => { if (a.ok && a.gun) S.owned = a.gun; });
    S.gunId = id;
    if (S.out) ensureGun(id);
  }
  // A gun bought (none is sold yet: the owner sends them, with their prices): paid from earned TR, through the bank
  async function buy(g) {
    if (!online || !online.signedIn) { if (deps.toast) deps.toast('Guns are bought with your account, online.'); return; }
    const sure = deps.confirm ? await deps.confirm({ title: `Buy the ${g.name}?`, text: `${g.price} TR, from your earned TR. It is yours, on any device.`, yes: 'Buy', no: 'Not now' }) : true;
    if (!sure) return;
    const r = await online.ask('gun.buy', { gun: g.id, price: g.price, key: `gun-${g.id}-${Date.now().toString(36)}` });
    if (!r.ok) { if (deps.toast) deps.toast(r.message); return; }
    if (r.gun) takeState(r.gun);
    if (deps.toast) deps.toast(`The ${g.name} is yours.`);
    openSwitch();
  }

  // ---- the server's answers to this player's rounds, and hits on this player ----
  if (net) net.onAnswer(({ fire, struck, sent }) => {
    if (fire && !fire.error) {
      // hits on other players the server agrees: the mark round the aim, and the offence in this town
      const hits = Array.isArray(fire.hit) ? fire.hit : [];
      const told = [];
      for (const [seq, who] of hits) {
        const shot = sent.find((s) => s[0] === seq);
        const at = shot && shot[5] ? shot[5].at : null;
        const peer = (deps.peers() || []).find((q) => q.peer === who);
        stats.confirmed += 1;
        hud.hit(peer && Number.isFinite(peer.health) && peer.health - GUN.damage <= GUN.floor ? 'down' : 'hit');
        if (at) told.push({ x: at[0], z: at[2], who, name: peer ? peer.name : 'another player' });
        // (their figure flinches here at once; their own game takes the life off them)
        if (peer) { const rig = deps.rigOf(`p:${peer.id}`); if (rig && rig.react) rig.react('hit', { length: 0.3 }); }
      }
      if (told.length) send({ type: 'gun.confirmed', hits: told });
      for (const [, code] of Array.isArray(fire.no) ? fire.no : []) stats.refused[code] = (stats.refused[code] || 0) + 1;
      // the server's count of rounds, when nothing more is on its way to it and no reload is under way
      const v = deps.view();
      if (v && v.self.gun && !v.self.gun.reloading && !S.reloadDoing && net.waiting === 0 && S.owned && fire.gun) {
        const guns = v.self.gun.have.map((g) => (g.id === fire.gun ? { id: g.id, mag: fire.mag, spare: fire.spare } : { id: g.id, mag: g.mag, spare: g.spare }));
        if (guns.some((g) => g.id === fire.gun)) send({ type: 'gun.owned', guns, equipped: v.self.gun.equipped });
      }
    }
    if (struck && struck.length) {
      const r = send({ type: 'gun.struck', hits: struck });
      stats.struck += struck.length;
      if (r.ok) net.took(Math.max(...struck.map((s) => s.id)));
      if (deps.refresh) deps.refresh();
    }
  });

  // ---- each frame: the player's own gun ----
  // `me`: the player's figure; `self`: the town's view of the player; `cam`: the camera's aim ({ yaw, pitch }, which
  // this turns with the recoil and the pull of the aim); `pos`: where the player is; `moving`: { x, z } how fast and
  // which way; `running`: at a run (the gun lowered: no firing); `stick`: whether the player is moving the aim
  function frameSelf(dt, { me, self, cam, pos, moving, running, aiming = false, peersHere = [], officersHere = [] }) {
    S.clock += dt;
    S.moving = moving || { x: 0, z: 0 };
    const g = self && self.gun;
    // taken away by the rules (badly hurt, a vehicle, the water, the police...)
    if (S.out && g && !g.out) { putAway({ told: true }); }
    reloadDone(g);
    S.health = self ? self.health : 100;
    S.running = !!running && S.out;
    if (S.running && S.firing) S.firing = false;
    if (S.running) { S.aimToggle = false; S.aimHeld = false; }
    sendAim();
    const gun = S.gun;
    const H = me && me.spec ? me.spec.height : 1.75, hs = H / 1.75;
    // the aim
    const pitch = cam.pitch, yaw = cam.yaw;
    t.d.set(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
    t.right.set(-Math.cos(yaw), 0, Math.sin(yaw));
    const crouchDrop = S.hold.crouch * 0.4 * (H / 1.8);
    const view = CAMERA_VIEW.aim;
    t.T.set(pos.x, ground(pos.x, pos.z) + GUN_PLAY.pivot * hs - crouchDrop + view.lift, pos.z).addScaledVector(t.right, view.shift);
    // (looking through the sight: from the sight's own eye)
    S.sightW = S.hold.sight;
    t.aimFrom.copy(t.T);
    if (S.out && S.sightW > 0.01) t.aimFrom.lerp(t.sightEye, S.sightW);
    // what the aim is on: the first thing along its line (the town's own map, its people, the other players)
    S.look = S.out || S.weight > 0.02 ? game().aimAt([t.aimFrom.x, t.aimFrom.y, t.aimFrom.z], [t.d.x, t.d.y, t.d.z], 150, deps.playerId()) : null;
    if (S.look) t.P.set(S.look.point[0], S.look.point[1], S.look.point[2]); else t.P.copy(t.aimFrom).addScaledVector(t.d, 150);
    // a touch screen's pull of the aim toward someone near it, while the aim moves or the gun fires
    S.assisting = false;
    if (S.out && coarse && (aiming || S.firing)) assist(dt, cam, [...peersHere, ...officersHere]);
    // the pose: the gun in the hands, aimed there
    const reloading = g && g.reloading ? Math.max(0, Math.min(1, 1 - g.reloading.left / Math.max(0.1, g.reloading.total))) : null;
    if (gun) {
      const said = S.hold.pose(me, gun, { up: S.out, mode: S.running ? 'carry' : sightWanted() ? 'sight' : 'aim', at: t.P, dir: t.d, crouch: S.crouch, moving: S.moving, reload: reloading, kicks: S.kicks, hideHead: sightWanted() || S.sightW > 0.3 }, dt);
      S.kicks = 0;
      S.weight = S.hold.weight;
      if (said.shown) {
        t.muzzle.copy(said.muzzle);
        t.sightEye.copy(said.eye); t.sightDir.copy(said.dir);
        for (const step of said.events) {
          audio.gunReload(step);
          if (step === 'out' && gun.mag) { gun.mag.updateMatrixWorld(true); fx.dropMagazine(gun.mag, gun.mag.getWorldPosition(t.a), gun.group.quaternion, gun.spec.scale); }
        }
      }
      gun.setNear(true);
    }
    // firing
    const gunNow = g && g.out ? g : null;
    if (S.firing && gunNow) fire(gunNow);
    if (!S.firing && S.wasFiring) burstEnd();
    S.wasFiring = S.firing && !!gunNow && S.clock - S.lastShot < 0.2;
    // the recoil settling back, the spread settling
    const def = GUNS[S.gunId] || GUNS.rifle;
    const back = S.recoilPitch * (1 - Math.exp(-dt * def.recoil.recover));
    cam.pitch += back; S.recoilPitch -= back;
    const side = S.recoilYaw * (1 - Math.exp(-dt * def.recoil.recover));
    cam.yaw -= side; S.recoilYaw -= side;
    S.bloom = Math.max(0, S.bloom - GUN_PLAY.bloom.settle * dt * (S.firing ? 0.3 : 1));
    // what is in the way of the rounds close in front of the muzzle (a corner, a wall the gun is beside)
    S.block = null;
    if (S.out && gun && S.hold.weight > 0.9 && S.look) {
      const toP = t.a.copy(t.P).sub(t.muzzle); const far = toP.length();
      if (far > 1.2) {
        toP.divideScalar(far);
        const w = game().aimAt([t.muzzle.x, t.muzzle.y, t.muzzle.z], [toP.x, toP.y, toP.z], far, deps.playerId());
        if (w && w.at < far - 0.6) S.block = t.b.set(w.point[0], w.point[1], w.point[2]).clone();
      }
    }
    // blood on the screen, by the player's health
    blood.update(dt, { health: S.health, calm: !!deps.calm(), active: true });
    // healed: the stains on the clothes go as the health comes back (all of them at 100)
    if (S.health >= 100 && S.wounds.length) S.wounds.length = 0;
    else if (S.health - S.healthBefore >= 15 && S.wounds.length) S.wounds.splice(0, Math.ceil(S.wounds.length / 2));
    S.healthBefore = S.health;
    if (me) paintWounds(me, S.wounds);
    fx.update(dt);
  }

  // One round, or as many as the gun's rate has come round to this frame (two at most)
  function fire(g) {
    const def = GUNS[g.equipped];
    if (!def || S.clock < S.readyAt || S.hold.weight < 0.8) return;
    if (g.reloading) return;
    if (g.mag <= 0) {
      // empty: the click, and a reload by itself if there are rounds spare (once for each pull of the trigger)
      if (!S.said.empty) { S.said.empty = 1; audio.gunEmpty(); hud.empty(); stats.empties += 1; if (g.spare > 0) { stats.autoReloads += 1; reload(); } }
      S.firing = def.mode === 'auto' && false;
      return;
    }
    const gap = 60 / def.rpm;
    if (S.next < S.clock - gap) S.next = S.clock;
    let n = 0;
    while (S.clock >= S.next && n < 2) {
      // (each round at its own moment by the gun's rate, two in one slow frame as well: the server holds the rounds to
      // the gun's rate by these)
      if (!oneRound(def, S.next)) break;
      S.next += gap; n += 1;
      if (def.mode !== 'auto') { S.firing = false; break; }
    }
  }
  function oneRound(def, when = S.clock) {
    // the way it goes: from the muzzle to what the aim is on, spread by how steady the aim is
    const o = t.muzzle;
    const to = t.a.copy(t.P).sub(o);
    if (to.lengthSq() < 1e-6) to.copy(t.d);
    to.normalize();
    // (too close to point at: along the aim)
    if (t.P.distanceTo(o) < 1.2 || to.dot(t.d) < 0.6) to.copy(t.d);
    const spread = currentSpread(def);
    const r = Math.sqrt(Math.random()) * spread, a = Math.random() * Math.PI * 2;
    // a little to the side and up, about the way it goes
    t.b.set(-to.z, 0, to.x).normalize();
    t.c.crossVectors(to, t.b).normalize();
    to.addScaledVector(t.b, Math.cos(a) * r).addScaledVector(t.c, Math.sin(a) * r).normalize();
    const result = send({ type: 'gun.fire', shots: [{ o: [o.x, o.y, o.z], d: [to.x, to.y, to.z] }] });
    const s = result.ok && result.shots ? result.shots[0] : null;
    if (!s || !s.ok) {
      const code = s ? s.code : result.code;
      stats.refused[code] = (stats.refused[code] || 0) + 1;
      if (code === 'EMPTY') { S.said.empty = 0; return false; }
      return false;
    }
    stats.fired += 1;
    S.lastShot = S.clock;
    S.kicks += 1;
    const end = t.e.set(s.end[0], s.end[1], s.end[2]);
    // seen and heard
    const bore = t.sightDir.lengthSq() > 0 ? t.sightDir : to;
    fx.flash(o, bore, { near: true });
    fx.streak(o, end);
    fx.strike(s.what, end, to, { calm: !!deps.calm() });
    audio.gunShot(def.id, { x: o.x, y: o.y, z: o.z }, { own: true });
    if (end.distanceTo(o) < 45) audio.gunStrike(s.what, { x: end.x, y: end.y, z: end.z });
    if (S.gun) {
      const port = S.gun.point('port', t.b);
      t.right.set(0, 0, 1).applyQuaternion(S.gun.group.quaternion);
      t.up.set(0, 1, 0).applyQuaternion(S.gun.group.quaternion);
      if (!lite || stats.fired % 2 === 0) fx.eject(port, t.right, t.up);
    }
    // the aim climbs a little, and to one side
    const climb = def.recoil.climb * (sightWanted() ? 0.7 : 1) * (S.crouch ? 0.75 : 1);
    deps.cam().pitch -= climb; S.recoilPitch += climb;
    const kick = (Math.random() - 0.4) * def.recoil.side;
    deps.cam().yaw += kick; S.recoilYaw += kick;
    S.bloom = Math.min(GUN_PLAY.bloom.most, S.bloom + GUN_PLAY.bloom.per);
    // what it struck
    if (s.target) {
      if (s.target.kind === 'npc') {
        stats.hits += 1;
        hud.hit(s.target.health <= GUN.floor ? 'down' : 'hit');
        const rig = deps.rigOf(`n:${s.target.id}`);
        if (rig) { if (rig.react) rig.react('hit', { length: 0.3 }); officerWound(s.target.id, rig, end, to); }
      } else if (s.target.kind === 'local') {
        stats.hits += 1;
        hud.hit(s.target.health <= GUN.floor ? 'down' : 'hit');
      }
    }
    // for the others to see (link.js `sh`), and for the server to count (gun-net.js)
    S.shots.push({ q: s.seq, t: S.clock, o: [o.x, o.y, o.z], e: s.end.slice(), what: s.what });
    // (kept a few seconds: a slow connection's words come seconds apart, and each round should be in one of them)
    while (S.shots.length > 12 || (S.shots.length && S.clock - S.shots[0].t > 3)) S.shots.shift();
    if (net && online && online.signedIn) net.fire({ t: when, gun: def.id, o: [o.x, o.y, o.z], d: [to.x, to.y, to.z], hit: s.claim ? { who: s.claim.peer, at: s.claim.point } : null });
    return true;
  }
  // The burst is over: the echo of the last round
  function burstEnd() {
    S.wasFiring = false;
    if (S.clock - S.lastShot < 0.3) audio.gunTail(S.gunId, { x: t.muzzle.x, y: t.muzzle.y, z: t.muzzle.z }, { own: true });
  }
  function currentSpread(def) {
    const sp = def.spread;
    const moving = Math.hypot(S.moving.x, S.moving.z) > 0.4;
    let s = sightWanted() ? sp.sight + (moving ? sp.moving * 0.35 : 0) : sp.aim + (moving ? sp.moving : 0);
    if (S.crouch) s *= sp.crouched;
    return s + S.bloom;
  }
  // The pull of the aim toward someone near it (a touch screen's, while the aim moves or the gun fires): the nearest
  // to the aim's line within GUN_PLAY.assist.within, who can be seen from the aim, drawn toward a little each frame
  function assist(dt, cam, candidates) {
    const A = GUN_PLAY.assist;
    const within = S.sightW > 0.5 ? A.sight : A.within;
    let best = null;
    for (const c of candidates) {
      if (!c || !c.able) continue;
      t.a.set(c.x, c.y, c.z).sub(t.aimFrom);
      const d = t.a.length();
      if (d < 1.5 || d > 70) continue;
      t.a.divideScalar(d);
      const off = Math.acos(Math.max(-1, Math.min(1, t.a.dot(t.d))));
      if (off > within || (best && off >= best.off)) continue;
      best = { off, dir: t.a.clone(), d };
    }
    if (!best) return;
    // (only someone the aim could reach: nothing solid between)
    const look = game().aimAt([t.aimFrom.x, t.aimFrom.y, t.aimFrom.z], [best.dir.x, best.dir.y, best.dir.z], best.d + 1, deps.playerId());
    if (!look || look.what !== 'person') return;
    const k = (1 - Math.exp(-dt * A.rate)) * A.share * (1 - best.off / within);
    const wantYaw = Math.atan2(best.dir.x, best.dir.z), wantPitch = -Math.asin(Math.max(-1, Math.min(1, best.dir.y)));
    cam.yaw += angleGap(wantYaw, cam.yaw) * k;
    cam.pitch += (wantPitch - cam.pitch) * k;
    S.assisting = true; stats.assists += 1;
  }

  // ---- reloading ----
  // The town's own reload (the time it takes, the rounds moved at its end); the website's server is told of it once it is
  // done, in its place among the rounds (gun-net.js): after the last round fired before it, before the next. (One stopped
  // part way, the gun put away, is never told: nothing was moved.)
  function reload() {
    const v = deps.view();
    const g = v && v.self.gun;
    if (!S.out || !g || g.reloading) return false;
    const r = send({ type: 'gun.reload' });
    if (!r.ok) { if (r.code !== 'FULL' && deps.toast) deps.toast(r.message); return false; }
    stats.reloads += 1;
    S.reloadDoing = { gun: g.equipped, t: S.clock, after: net ? net.seq : 0, mag: g.mag, spare: g.spare };
    if (deps.refresh) deps.refresh();
    return true;
  }
  // (each frame: the reload done, or stopped)
  function reloadDone(g) {
    const d = S.reloadDoing;
    if (!d || (g && g.reloading)) return;
    S.reloadDoing = null;
    const now = g && g.have ? g.have.find((h) => h.id === d.gun) : null;
    if (now && now.mag > d.mag && net && online && online.signedIn) net.reload({ gun: d.gun, t: d.t, after: d.after });
  }

  // ---- being hit (the town's event: a police officer's round, or another player's the server agreed) ----
  function onShot(event, { me }) {
    if (!event || event.type !== 'shot') return;
    const at = Array.isArray(event.at) ? t.a.set(event.at[0], event.at[1], event.at[2]) : null;
    const from = Array.isArray(event.from) ? event.from : null;
    // the way it came from, on the screen (0 ahead, turning to the right)
    let angle = null;
    if (from && me) {
      const p = me.group.position;
      const toward = Math.atan2(from[0] - p.x, from[1] - p.z);
      angle = -angleGap(toward, deps.cam().yaw);
    }
    blood.hit({ amount: event.damage || 1, from: angle });
    if (me && me.react) me.react('hit', { length: 0.28 });
    if (me && me.bones) {
      // where it struck: the town's word, or the chest; the stain on that side of the body
      const p = at || t.b.copy(me.group.position).add(t.c.set(0, 1.25 * (me.spec ? me.spec.height / 1.75 : 1), 0));
      const dir = from ? t.c.set(p.x - from[0], 0, p.z - from[1]).normalize() : t.c.set(0, 0, -1);
      addWound(S.wounds, woundAt(me, p, dir));
      fx.blood(p, dir, { calm: !!deps.calm(), amount: 0.6 });
    }
    audio.gunStrike('person', at ? { x: at.x, y: at.y, z: at.z } : { x: 0, y: 0, z: 0 });
  }

  // ---- the others: other players' guns and rounds, the officers' ----
  const others = new Map();            // key -> { gun, hold, seen, lastQ, queue, lastShotAt, gunId }
  const officerWounds = new Map();     // officer index -> { list, at }
  function officerWound(i, rig, point, dir) {
    let w = officerWounds.get(i);
    if (!w) { w = { list: [], at: 0 }; officerWounds.set(i, w); }
    addWound(w.list, woundAt(rig, point, dir));
    w.at = S.clock;
    fx.blood(point, dir, { calm: !!deps.calm() });
  }
  function otherOf(key, gunId) {
    let o = others.get(key);
    if (!o) { o = { gun: null, hold: createGunHold(), seen: 0, lastQ: null, queue: [], lastShotAt: -9, gunId, rig: null }; others.set(key, o); }
    if (!o.gun || o.gun.id !== gunId) { if (o.gun) o.gun.dispose(); o.gun = makeGun(gunId); o.gun.group.visible = false; scene.add(o.gun.group); o.gunId = gunId; }
    return o;
  }
  // a round someone else fired: seen at their muzzle (where their gun is drawn) and where it stopped, heard from there
  function replay(o, shot, eye) {
    const from = t.o.set(shot.o[0], shot.o[1], shot.o[2]);
    const end = t.e.set(shot.e[0], shot.e[1], shot.e[2]);
    const dir = t.c.copy(end).sub(from);
    if (dir.lengthSq() < 1e-6) return;
    dir.normalize();
    const muzzle = o && o.gun && o.gun.group.visible && o.gun.ready ? o.gun.point('muzzle', t.b) : from;
    const near = Math.hypot(muzzle.x - eye.x, muzzle.z - eye.z) < 25;
    fx.flash(muzzle, dir, { near });
    fx.streak(muzzle, end);
    fx.strike(shot.what, end, dir, { calm: !!deps.calm() });
    audio.gunShot(shot.gun || 'rifle', { x: from.x, y: from.y, z: from.z });
    audio.gunStrike(shot.what, { x: end.x, y: end.y, z: end.z });
    // past the listener's head: the crack of it going by
    const ear = t.a.set(eye.x, eye.y, eye.z);
    const along = t.b.copy(ear).sub(from).dot(dir);
    if (along > 2 && along < from.distanceTo(end)) { const nearest = from.clone().addScaledVector(dir, along); if (nearest.distanceTo(ear) < 3) audio.gunPast({ x: nearest.x, y: nearest.y, z: nearest.z }); }
    if (o) { o.lastShotAt = S.clock; o.tailAt = { x: from.x, y: from.y, z: from.z }; o.tailGun = shot.gun || 'rifle'; }
  }

  // `peers`: the other players as shown (main.js shownPeers); `shooting`: the officers shooting back (the town's view);
  // `shots`: the rounds fired in this town lately (the officers', and another player's in this same town);
  // `eye`: where the player's ears are
  function frameOthers(dt, { peers = [], shooting = [], shots = [], eye, rigOf }) {
    const stamp = S.clock;
    // other players
    for (const q of peers) {
      const rig = rigOf(`p:${q.id}`);
      const key = `p:${q.id}`;
      const out = !!(q.gun && q.gun.out && GUNS[q.gun.id]);
      const d = Math.hypot(q.x - eye.x, q.z - eye.z);
      let o = others.get(key);
      if (out || (o && o.hold.weight > 0.01)) {
        o = otherOf(key, out ? q.gun.id : (o ? o.gunId : 'rifle'));
        o.seen = stamp; o.rig = rig;
        if (rig && d < GUN_PLAY.far) {
          const yaw = out && Number.isFinite(q.gun.yaw) ? q.gun.yaw : rig.group.rotation.y;
          const pitch = out && Number.isFinite(q.gun.pitch) ? q.gun.pitch : 0;
          const dir = t.d.set(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
          const hs = rig.spec ? rig.spec.height / 1.75 : 1;
          const at = t.P.set(q.x, ground(q.x, q.z) + GUN_PLAY.pivot * hs, q.z).addScaledVector(dir, 30);
          const vel = Array.isArray(q.vel) ? { x: q.vel[0], z: q.vel[1] } : null;
          o.hold.pose(rig, o.gun, { up: out, mode: !out ? 'aim' : q.gun.aim === 2 ? 'sight' : q.gun.aim === 1 ? 'aim' : 'carry', at, dir, crouch: out && q.gun.crouch, moving: vel, reload: out ? q.gun.reload : null, kicks: o.kicks || 0 }, dt);
          o.kicks = 0;
          o.gun.setNear(d < GUN_NEAR);
        } else if (o.gun) o.gun.group.visible = false;
      }
      // their rounds: each once, in the order and at the spacing they were fired
      if (Array.isArray(q.shots) && q.shots.length) {
        o = o || otherOf(key, q.gun && GUNS[q.gun.id] ? q.gun.id : 'rifle');
        o.seen = stamp;
        const fresh = q.shots.filter((s) => (o.lastQ === null ? s.ago < 1.5 : s.q > o.lastQ) && s.ago < 3.5);
        if (fresh.length) {
          const oldest = Math.max(...fresh.map((s) => s.ago));
          for (const s of fresh.sort((a, b) => a.q - b.q)) o.queue.push({ at: S.clock + (oldest - s.ago), shot: { ...s, gun: q.gun && GUNS[q.gun.id] ? q.gun.id : 'rifle' } });
        }
        o.lastQ = Math.max(o.lastQ === null ? -1 : o.lastQ, ...q.shots.map((s) => s.q));
      }
      // the wounds on them, as their own game says
      if (rig) paintWounds(rig, Array.isArray(q.wounds) ? q.wounds : []);
    }
    // the officers shooting back: their rifles up, aimed at whoever they shoot at
    for (const s of shooting) {
      const key = `n:${s.i}`;
      const rig = rigOf(key);
      if (!rig) continue;
      const o = otherOf(key, 'rifle');
      o.seen = stamp; o.rig = rig;
      const p = rig.group.position;
      const d = Math.hypot(p.x - eye.x, p.z - eye.z);
      if (d > GUN_PLAY.far) { o.gun.group.visible = false; continue; }
      const at = t.P.set(s.at[0], ground(s.at[0], s.at[1]) + 1.2, s.at[1]);
      const dir = t.d.copy(at).sub(t.a.set(p.x, p.y + 1.45, p.z)).normalize();
      o.hold.pose(rig, o.gun, { up: true, mode: 'aim', at, dir, crouch: false, moving: null, reload: null, kicks: o.kicks || 0 }, dt);
      o.kicks = 0;
      o.gun.setNear(d < GUN_NEAR);
    }
    // rounds fired in this town by someone else (the officers; another player in this same town)
    const mine = `p:${deps.playerId()}`;
    for (const s of shots) {
      if (s.from === mine) continue;
      const key = s.from;
      let o = others.get(key);
      if (!o) o = otherOf(key, 'rifle');
      if (o.lastId !== undefined && s.id <= o.lastId) continue;
      o.lastId = s.id;
      o.seen = stamp;
      o.queue.push({ at: S.clock, shot: { o: s.o, e: s.e, what: s.what, gun: 'rifle' } });
      if (key.startsWith('n:')) stats.policeShots += 1;
    }
    // play what is due; a burst over, its echo
    for (const [key, o] of others) {
      while (o.queue.length && o.queue[0].at <= S.clock) {
        const { shot } = o.queue.shift();
        replay(o, shot, eye);
        o.kicks = (o.kicks || 0) + 1;
        if (key.startsWith('p:')) stats.peerShots += 1;
      }
      if (o.tailAt && S.clock - o.lastShotAt > 0.25 && !o.queue.length) { audio.gunTail(o.tailGun, o.tailAt); o.tailAt = null; }
      // gone from sight: put away and let go
      if (stamp - o.seen > 3) { if (o.gun) o.gun.dispose(); if (o.rig) o.hold.release(o.rig); others.delete(key); }
      else if (o.seen !== stamp && o.gun) o.gun.group.visible = false;
    }
    // the officers' wounds (this town's), painted while they are drawn, gone after a while
    for (const [i, w] of officerWounds) {
      const rig = rigOf(`n:${i}`);
      if (S.clock - w.at > 240) { if (rig) paintWounds(rig, []); officerWounds.delete(i); continue; }
      if (rig) paintWounds(rig, w.list);
    }
  }

  // ---- the screen ----
  function frameHud({ width, height, interactable = false }) {
    if (!S.out) return;
    const v = deps.view();
    const g = v && v.self.gun;
    const at = S.look ? t.proj.copy(t.P).project(camera) : null;
    const on = at && at.z > -1 && at.z < 1 ? { x: (at.x * 0.5 + 0.5) * width, y: (-at.y * 0.5 + 0.5) * height } : null;
    const who = S.look && S.look.what === 'person' && S.look.target ? S.look.target : null;
    const kind = who ? (who.able ? 'hostile' : 'friendly') : interactable ? 'use' : 'neutral';
    const def = GUNS[S.gunId] || GUNS.rifle;
    const fov = camera.fov * Math.PI / 180;
    const spread = (currentSpread(def) / Math.tan(fov / 2)) * (height / 2);
    let block = null;
    if (S.block) { const b = t.proj.copy(S.block).project(camera); if (b.z > -1 && b.z < 1) block = { x: (b.x * 0.5 + 0.5) * width, y: (-b.y * 0.5 + 0.5) * height }; }
    const reloading = g && g.reloading ? Math.max(0, Math.min(1, 1 - g.reloading.left / Math.max(0.1, g.reloading.total))) : null;
    hud.update({ at: on, kind, spread: Math.max(9, spread * 1.6), sight: S.sightW, who: who ? { name: who.name, health: who.health, able: who.able } : null, gun: g ? { id: g.equipped, name: (GUNS[g.equipped] || def).name, mag: g.mag, spare: g.spare, magazine: g.magazine, reloading } : null, health: S.health, block });
  }

  // ---- what the camera does (camera.js) ----
  function cameraView() {
    if (!S.out) return null;
    return S.clock < S.overviewUntil ? 'overview' : 'aim';
  }
  function sightCamera() {
    if (!S.out || S.sightW < 0.002 || S.clock < S.overviewUntil) return null;
    return { eye: t.sightEye, dir: t.d, amount: smooth(S.sightW), fov: GUN_PLAY.sightFov };
  }
  // The view from further back, for five seconds (pressed again: back at once)
  function overview() {
    if (!S.out) return;
    if (S.clock < S.overviewUntil) { S.overviewUntil = 0; return 'off'; }
    S.overviewUntil = S.clock + GUN_PLAY.overview; S.overviewAt = S.clock;
    S.aimToggle = false; S.aimHeld = false;
    return 'on';
  }

  // ---- what the buttons and keys do ----
  function act(id, phase) {
    if (id === 'shoot') {
      if (phase === 'down') { if (!S.out) return; S.firing = true; S.said.empty = 0; if (S.running) S.running = false; }
      else S.firing = false;
      return;
    }
    if (id === 'aim') {
      // held with a mouse's right button; a tap on a touch screen switches it on and off
      if (phase === 'hold-down') { S.aimHeld = true; S.overviewUntil = 0; }
      else if (phase === 'hold-up') S.aimHeld = false;
      else if (phase === 'down') { S.aimToggle = !S.aimToggle; if (S.aimToggle) S.overviewUntil = 0; }
      sendAim();
      return;
    }
    if (phase !== 'down') return;
    if (id === 'gun') { if (S.out) putAway(); else draw(); }
    else if (id === 'holster') putAway();
    else if (id === 'reload') reload();
    else if (id === 'crouch') { if (S.out) { S.crouch = !S.crouch; sendAim(); } }
    else if (id === 'switch') { if (hud.switching) hud.closeSwitch(); else openSwitch(); }
    else if (id === 'overview') overview();
  }

  // ---- what the others are told (link.js) ----
  function linkFields(cam) {
    if (!S.out && !S.shots.length && !S.wounds.length) return null;
    return {
      gunAim: { yaw: cam.yaw, pitch: cam.pitch },
      gunShots: S.shots.map((s) => ({ q: s.q, ago: Math.max(0, S.clock - s.t), o: s.o, e: s.e, what: s.what })),
      wounds: S.wounds,
    };
  }

  // Everything let go (the town left, the player signed out)
  function reset() {
    putAway({ told: true });
    for (const [, o] of others) { if (o.gun) o.gun.dispose(); }
    others.clear();
    officerWounds.clear();
    S.wounds.length = 0; S.shots.length = 0; S.reloadDoing = null;
    fx.clear(); blood.clear();
  }

  // Where the camera looks from with the gun out (camera.js 'aim' sets itself off to the right and up from it): the
  // figure's middle, at its chest, lower crouched
  function cameraTarget(me, out) {
    const p = me.group.position;
    const hs = me.spec ? me.spec.height / 1.75 : 1;
    const H = hs * 1.75;
    return out.set(p.x, ground(p.x, p.z) + GUN_PLAY.pivot * hs - S.hold.crouch * 0.4 * (H / 1.8), p.z);
  }

  return {
    draw, putAway, reload, act, frameSelf, frameOthers, frameHud, onShot, askState, reset, linkFields, cameraView, sightCamera, overview, cameraTarget,
    get out() { return S.out; },
    get running() { return S.running; },
    // the way the figure faces with the gun out (the aim), and how fast it may go
    pace() { return !S.out ? 1 : S.crouch ? GUN_PLAY.pace.crouch : sightWanted() ? GUN_PLAY.pace.sight : GUN_PLAY.pace.aim; },
    get crouched() { return S.out && S.crouch; },
    get sighting() { return sightWanted(); },
    get firing() { return S.firing; },
    get overviewing() { return S.clock < S.overviewUntil; },
    get aimPoint() { return t.P; },
    // (for the tests: where the aim is from, and its way)
    get aimFrom() { return t.aimFrom; }, get aimDir() { return t.d; },
    get look() { return S.look; },
    get weight() { return S.weight; },
    // a flash's light just now (gun-fx.js), for the town's lamp (main.js); null when there is none
    get flashLamp() { return fx.lamp; },
    fx, hud, blood, stats, state: S,
  };
}
