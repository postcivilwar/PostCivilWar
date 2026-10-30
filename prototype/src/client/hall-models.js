// The vehicles on show in a hall (PostCivilWar PowerBike's motorcycles, the car showroom's cars), each drawn from its
// own model with the set of pictures its distance from the player asks for (18 October 2026, the owner's brief: every
// car and motorcycle in a showroom at a good quality whenever it is in view, made ready before it is looked at, no long
// low-detail stand-ins, the far ones drawn with less, and the memory within what the device has):
//   - on a computer every one of them is its model: the one the player stands at with its 4096 pictures, the next
//     nearest with the 2048, those across the hall with the 1024, the far end of the hall with the 512 (budget.js, HALL);
//   - on a phone the ones near the player are models (1024 pictures, then 512) and the far ones are pictures of
//     themselves (their impostors, drawn by the hall), which on its screen are as sharp as the models would be;
//   - they are made ready before the player is in: the ones nearest the doors, as the player comes up to them;
//   - a model with another set of pictures takes the place of the one shown only once it is here, so nothing goes
//     blank, and only one comes in a frame (its pictures go to the graphics card then, not all at once);
//   - one goes down to a smaller set only after the player has been further from it for a while, and with room to
//     spare, so that walking along the edge of a distance does not swap it back and forth;
//   - all of them are let go once the player has left the hall and gone away from its doors;
//   - only the ones near the player cast the sun's shadow (`castShadows`); the rest have a soft shadow under them, as
//     their pictures do. Every model in the hall casting its own was most of what a frame there cost: the sun's
//     shadow is drawn from all of the hall at once, every vehicle in it whole, wherever the player looks.
//
//   const models = hallModels({ items, load, lite, ranges });
//   each frame: models.update({ gaps, now, mode })      gaps: metres from the player (inside) or the doors (outside)
//   models.modelOf(k), models.tierOf(k)                   what item k is drawn as now (null: its picture)
//   castShadows(model, on)                                whether a model's pieces cast the sun's shadow
import { HALL } from './budget.js';

const ORDER = ['512', '1k', '2k', '4k'];
const rankOf = (tier) => (tier ? ORDER.indexOf(tier) : -1);

// whether a model's pieces cast the sun's shadow (set only when it changes: `model.casts`)
export function castShadows(model, on) {
  if (!model || model.casts === on) return;
  model.casts = on;
  model.group.traverse((o) => { if (o.isMesh) o.castShadow = on; });
}

// items: [{ id }] in the hall's order; load(k, tier) → a promise of a model ({ group, dispose }); put(k, model) puts it
// in the hall (and takes away the one it replaces, if any); ranges: { inspect, near, mid } metres; lite: a phone.
// (`plan`: the sets by distance, budget.js HALL by default; the sports mall gives its own, its things having no 4096 set
// and no pictures of themselves)
export function hallModels({ items, load, put, lite = false, ranges, renderer = null, most = lite ? 1 : 2, settle = 2.5, plan: given = null }) {
  const plan = given || HALL[lite ? 'lite' : 'full'];
  const slots = items.map(() => ({ model: null, tier: null, loading: null, loadingTier: null, lowerSince: 0, failedAt: 0, ticket: 0 }));
  const ready = [];                 // [{ k, model, tier }] fetched, waiting their turn to be put in
  let running = 0, ticket = 1, dropped = 0;

  // the set item k should have, `gap` metres away and `rank` among the nearest (0 the nearest); the same with the
  // distances a quarter longer, for keeping what it has
  // (`level`: how much the device is struggling, the governor's (monitor.js): the largest sets are given up first)
  const CAP = ['4k', '2k', '1k', '512'];
  function wanted(gap, rank, level = 0) {
    if (!Number.isFinite(gap)) return null;
    const tier = rank === 0 && gap < ranges.inspect ? plan.inspect : rank < plan.nearRanks && gap < ranges.near ? plan.near : gap < ranges.mid ? plan.mid : plan.far;
    const cap = CAP[Math.max(0, Math.min(3, level))];
    return tier && rankOf(tier) > rankOf(cap) ? cap : tier;
  }

  function release(slot) {
    if (slot.model) { slot.model.dispose(); slot.model = null; slot.tier = null; }
    slot.ticket = 0; slot.loading = null; slot.loadingTier = null;
  }

  function start(k, tier, now) {
    const slot = slots[k];
    const mine = ticket++;
    slot.ticket = mine; slot.loadingTier = tier; running += 1;
    slot.loading = Promise.resolve().then(() => load(k, tier))
      .then((model) => {
        running -= 1;
        // (asked for no longer: the player left, or another set was asked for since)
        if (slot.ticket !== mine) { model.dispose(); return; }
        ready.push({ k, model, tier, mine });
      })
      .catch(() => { running -= 1; if (slot.ticket === mine) { slot.loading = null; slot.loadingTier = null; slot.failedAt = now; } });
  }

  // Each frame. `gaps[k]`: metres from the player to item k (from the doors, outside); `mode`: 'inside' (tiers by
  // distance), 'near' (outside, coming up to the doors: the low set for those nearest them, `ahead` metres in) or 'far'
  // (all let go); `level`: the device's struggle, 0 to 3.
  function update({ gaps, now = performance.now() / 1000, mode = 'inside', ahead = Infinity, level = 0 }) {
    if (mode === 'far') {
      if (slots.some((s) => s.model || s.loading) || ready.length) {
        for (const s of slots) release(s);
        for (const r of ready.splice(0)) r.model.dispose();
        dropped += 1;
      }
      return;
    }
    // one model put in a frame, its pictures handed to the graphics card as it is
    const next = ready.shift();
    if (next) {
      const slot = slots[next.k];
      if (slot.ticket !== next.mine) next.model.dispose();
      else {
        const old = slot.model;
        slot.model = next.model; slot.tier = next.tier; slot.loading = null; slot.loadingTier = null; slot.lowerSince = 0;
        put(next.k, next.model, old);
        if (old) old.dispose();
        if (renderer && typeof renderer.initTexture === 'function') next.model.group.traverse((o) => { const m = o.material; if (o.isMesh && m) for (const t of [m.map, m.normalMap, m.roughnessMap]) if (t && t.image) renderer.initTexture(t); });
      }
    }
    const order = gaps.map((gap, k) => ({ gap, k })).sort((a, b) => a.gap - b.gap);
    const wants = [];
    order.forEach(({ gap, k }, rank) => {
      const slot = slots[k];
      // (outside, coming up to the doors: the smallest set for those nearest them, if they have nothing yet; what
      // they have is kept as it is, for the player stepping back in)
      if (mode === 'near') {
        if (!slot.model && !slot.loadingTier && gap < ahead) wants.push({ k, tier: plan.far || plan.mid, gap, up: true });
        return;
      }
      const want = wanted(gap, rank, level), keep = wanted(gap / 1.25, rank, level);
      const have = slot.loadingTier || slot.tier;
      if (rankOf(want) > rankOf(have)) wants.push({ k, tier: want, gap, up: !slot.model });
      else if (rankOf(keep) < rankOf(slot.tier) && !slot.loadingTier) {
        // further than it was for long enough: a smaller set (or its picture, on a phone)
        if (!slot.lowerSince) slot.lowerSince = now;
        else if (now - slot.lowerSince > settle) {
          slot.lowerSince = 0;
          if (keep) wants.push({ k, tier: keep, gap, up: false, down: true });
          else if (mode === 'inside') release(slot);
        }
      } else slot.lowerSince = 0;
    });
    // what is fetched first: one with nothing yet, nearest first; then the larger sets, nearest first; then the smaller
    wants.sort((a, b) => (b.up - a.up) || ((a.down ? 1 : 0) - (b.down ? 1 : 0)) || a.gap - b.gap);
    for (const w of wants) {
      if (running >= most) break;
      const slot = slots[w.k];
      if (slot.failedAt && now - slot.failedAt < 15) continue;
      start(w.k, w.tier, now);
    }
  }

  return {
    update,
    modelOf: (k) => slots[k].model,
    tierOf: (k) => slots[k].tier,
    // for the checks
    state: () => ({ running, waiting: ready.length, dropped, tiers: slots.map((s) => s.tier), loading: slots.map((s) => s.loadingTier) }),
    drop() { for (const s of slots) release(s); for (const r of ready.splice(0)) r.model.dispose(); },
  };
}
