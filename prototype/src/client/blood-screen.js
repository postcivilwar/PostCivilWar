// Blood on the screen when the player's own character is shot (25 October 2026, the owner's brief: "irregular translucent
// splashes or edge overlays. It must not obscure the entire screen immediately after a single minor hit ... Repeated
// hits gradually increase the intensity and coverage ... limited to the player who was actually hit ... must never change
// hit detection, camera aim, or the actual health value ... gradually fade the blood overlay away as health recovers.
// At 100% health, the overlay should be fully cleared ... Keep the effect performant ... Provide an option to reduce
// intense visual effects").
//
// It is the page's own, over the picture of the town, and nothing else reads it. How much there is follows the
// player's health as the game has it (`update`): none at 100, more as it falls, at its most at 20 (the floor: the
// 20-life rule); healed at the hospital, it fades as the health comes back, and is gone at 100. A hit adds a moment
// more (a splash at the edge, the edges darkening red) that dies away over a second. A mark at the edge of the aim
// shows which way the round came from.
//
// Drawn with the page's own layers (a few pictures of splashes made once, a red edge, a ring), not with the graphics
// card: nothing extra is drawn in the town.
//
// Calm (Settings, "Reduce intense effects"): no splashes, a fainter red edge, no flash; the mark of where it came
// from stays, since it says something the player needs.

const smooth = (t) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };

// A splash of blood, drawn once: an uneven blot, runs down from it, spatter round it; its middle darker.
function splashPicture(seed, size = 384) {
  let s = seed * 9301 + 49297;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const g = c.getContext('2d');
  const cx = size * (0.38 + rand() * 0.24), cy = size * (0.32 + rand() * 0.2);
  const blob = (x, y, r, alpha) => { const grad = g.createRadialGradient(x, y, 0, x, y, r); grad.addColorStop(0, `rgba(92,0,8,${alpha})`); grad.addColorStop(0.7, `rgba(122,4,14,${alpha * 0.85})`); grad.addColorStop(1, 'rgba(140,8,18,0)'); g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  for (let i = 0; i < 26; i += 1) { const a = rand() * Math.PI * 2, d = rand() * size * 0.13; blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, size * (0.05 + rand() * 0.09), 0.55 + rand() * 0.3); }
  // runs
  for (let i = 0; i < 4 + Math.floor(rand() * 4); i += 1) {
    const x = cx + (rand() - 0.5) * size * 0.25, w = size * (0.008 + rand() * 0.014), len = size * (0.12 + rand() * 0.35);
    const grad = g.createLinearGradient(x, cy, x, cy + len); grad.addColorStop(0, 'rgba(100,0,10,0.85)'); grad.addColorStop(1, 'rgba(110,0,12,0.15)');
    g.fillStyle = grad; g.beginPath(); g.moveTo(x - w, cy); g.quadraticCurveTo(x - w * 0.6, cy + len * 0.7, x, cy + len); g.quadraticCurveTo(x + w * 0.6, cy + len * 0.7, x + w, cy); g.fill();
    blob(x, cy + len, w * 1.6, 0.7);
  }
  // spatter
  for (let i = 0; i < 70; i += 1) { const a = rand() * Math.PI * 2, d = size * (0.12 + rand() * 0.34); blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, size * (0.004 + rand() * 0.014), 0.5 + rand() * 0.4); }
  return c.toDataURL('image/png');
}

// Where the splashes are, by how bad it is (the fourth and fifth only when it is bad): [left, top, size, turn, share]
const SPLASHES = [[-6, -8, 46, 12, 0.08], [62, 58, 50, -20, 0.22], [-10, 52, 44, 160, 0.4], [70, -12, 42, 200, 0.58], [26, 76, 40, 90, 0.75]];

// (`before`: the layer it goes under, the screen's buttons and words: it is over the picture of the town only)
export function createBloodScreen(root, before = null) {
  const box = document.createElement('div');
  box.id = 'blood-screen';
  box.setAttribute('aria-hidden', 'true');
  const edge = document.createElement('div'); edge.className = 'edge';
  const flashEl = document.createElement('div'); flashEl.className = 'flash';
  const splashes = SPLASHES.map(([left, top, size, turn], k) => {
    const el = document.createElement('i');
    el.className = 'splash';
    Object.assign(el.style, { left: `${left}vw`, top: `${top}vh`, width: `${size}vmax`, height: `${size}vmax`, transform: `rotate(${turn}deg)`, opacity: '0' });
    el.dataset.k = String(k);
    return el;
  });
  const ring = document.createElement('div'); ring.className = 'from';
  ring.innerHTML = '<svg viewBox="-50 -50 100 100"><path d="M -14 -40 A 42 42 0 0 1 14 -40" /></svg>';
  box.append(edge, ...splashes, flashEl, ring);
  if (before && before.parentNode === root) root.insertBefore(box, before); else root.append(box);
  // (painted one a frame as they are first wanted, the first first, not all five in one frame: each is a picture drawn
  // and written out, a tenth of a second or more on a phone, the moment the player is first hit; 26 October 2026)
  let painted = 0;
  const paint = () => { if (painted >= splashes.length) return; const k = painted; painted += 1; splashes[k].style.backgroundImage = `url(${splashPicture(k + 3)})`; };

  const st = { base: 0, hit: 0, flash: 0, from: null, fromAge: 9, shown: -1, health: 100 };
  // A hit on the player: `amount` (life points lost), and the way it came from on the screen (radians, 0 ahead, turning
  // to the right; null if not known)
  function hit({ amount = 1, from = null } = {}) {
    st.hit = Math.min(1, st.hit + 0.28 + 0.05 * Math.min(4, amount));
    st.flash = 1;
    if (from !== null && Number.isFinite(from)) { st.from = from; st.fromAge = 0; }
  }
  // Each frame: how bad it is from the player's health (calm: the setting), and the hits dying away.
  function update(dt, { health = 100, calm = false, active = true } = {}) {
    st.health = health;
    // none at 100, all of it at 20
    const want = active ? smooth((100 - health) / 80) : 0;
    // (it comes quickly with a hit, and goes slowly as health comes back)
    st.base += (want - st.base) * Math.min(1, dt * (want > st.base ? 6 : 0.9));
    if (want === 0 && st.base < 0.004) st.base = 0;
    st.hit = Math.max(0, st.hit - dt * 0.9);
    st.flash = Math.max(0, st.flash - dt * 3.2);
    st.fromAge += dt;
    if (!active) { st.hit = 0; st.flash = 0; st.fromAge = 9; }
    const level = Math.min(1, st.base * 0.85 + st.hit * 0.6);
    const key = `${level.toFixed(3)}|${st.flash.toFixed(2)}|${calm ? 1 : 0}|${st.fromAge < 1.4 ? `${st.from.toFixed(2)}:${st.fromAge.toFixed(2)}` : ''}`;
    if (key === st.shownKey && !(painted < splashes.length && level > 0.02 && !calm)) return;
    st.shownKey = key;
    box.hidden = level <= 0.002 && st.flash <= 0.002 && st.fromAge >= 1.4;
    if (box.hidden) return;
    if (!calm && level > 0.02) paint();
    edge.style.opacity = String(calm ? Math.min(0.45, level * 0.5) : Math.min(0.92, level * 1.05));
    flashEl.style.opacity = String(calm ? 0 : st.flash * 0.35);
    for (const el of splashes) {
      const share = SPLASHES[Number(el.dataset.k)][4];
      // each splash comes in as it gets worse, the first after a few hits
      el.style.opacity = calm ? '0' : String(Math.min(0.82, smooth((level - share) / 0.22) * 0.82));
    }
    ring.style.opacity = st.fromAge < 1.4 ? String(1 - smooth(st.fromAge / 1.4)) : '0';
    if (st.fromAge < 1.4) ring.style.transform = `translate(-50%, -50%) rotate(${(st.from * 180) / Math.PI}deg)`;
  }
  function clear() { st.base = 0; st.hit = 0; st.flash = 0; st.fromAge = 9; st.shownKey = ''; box.hidden = true; }
  clear();
  return {
    hit, update, clear,
    // (for the tests: how much is shown)
    state: () => ({ base: +st.base.toFixed(3), hit: +st.hit.toFixed(3), shown: !box.hidden, edge: Number(edge.style.opacity || 0), splashes: splashes.filter((el) => Number(el.style.opacity) > 0.01).length, health: st.health }),
  };
}
