// The pictures the game paints for itself on a canvas, once and for good, on a phone (30 October 2026, the owner's
// brief: the game still hung, and then closed by itself, on his iPhone). Measured on a phone's settings, a page held
// some 240 canvases at the motor park when it began (42 MB of pixels) and 330 after a lap of the town (68 MB): the
// signs, the boards over the doors, the names, PowerBike's plates and name, the billboards' faces. The graphics card has
// each of them already; the page's copy is only wanted if the card's copy has to be made again.
//
// So, once the graphics card has such a picture, the canvas's own pixels are let go (it is made one pixel by one), and
// it is painted again, exactly as before, the moment anything reads the picture: three.js handing it to the card again
// (its copy there let go while it was out of sight, picture-keeper.js; or the drawing surface taken away by the browser
// and given back), the warm-up, a test. Painting one again takes a fraction of a millisecond to a few milliseconds.
//
// Only for a picture its maker never paints again by itself as the game goes on: a digital screen, a board whose words
// change, a picture taken in from a file, keep their canvas. `repaint(canvas)` paints it whole, at the size it had
// (the canvas is given back that size first, which also clears it and its drawing state).
//
//   letPaintedGo(texture, repaint)   on a phone (elsewhere nothing changes; `always` for the tests)
//   paintedState(texture)            { asleep, width, height } while it is one of these, or null
//   paintedStats()                   how many were let go, painted again, failed

import { deviceKind } from './budget.js';

const painted = new WeakMap();        // texture -> { canvas, width, height, asleep, repaint }
const stats = { kept: 0, letGo: 0, repainted: 0, failed: 0 };
let phone = null;
const onPhone = () => (phone === null ? (phone = deviceKind() === 'lite') : phone);

export function letPaintedGo(texture, repaint, { always = false } = {}) {
  if (!texture || typeof repaint !== 'function' || !(always || onPhone())) return texture;
  const source = texture.source;
  const canvas = source && source.data;
  if (!canvas || typeof canvas.getContext !== 'function' || painted.has(texture)) return texture;
  const p = { canvas, texture, width: canvas.width, height: canvas.height, asleep: false, repaint, gone: false, version: -1, timer: null };
  painted.set(texture, p);
  stats.kept += 1;
  // the picture as three.js, or anyone, reads it: painted again first if its pixels were let go
  Object.defineProperty(source, 'data', {
    configurable: true, enumerable: true,
    get() { if (p.asleep) wake(p); return canvas; },
    // (given another picture: no longer one of these)
    set(value) { Object.defineProperty(source, 'data', { value, writable: true, configurable: true, enumerable: true }); painted.delete(texture); p.gone = true; p.asleep = false; },
  });
  // once the card has it (three.js says so after handing it over): its pixels let go
  const before = texture.onUpdate;
  texture.onUpdate = function onUpdate(t) {
    if (typeof before === 'function') before.call(this, t);
    if (p.gone || p.asleep || canvas.width <= 1) return;
    p.version = texture.version;
    sleep(p);
  };
  return texture;
}

function sleep(p) {
  p.width = p.canvas.width; p.height = p.canvas.height;
  p.canvas.width = 1; p.canvas.height = 1;
  p.canvas.__letGo = true;
  p.asleep = true;
  stats.letGo += 1;
}
function wake(p) {
  p.asleep = false;
  p.canvas.__letGo = false;
  p.canvas.width = p.width; p.canvas.height = p.height;
  try { p.repaint(p.canvas); stats.repainted += 1; } catch (error) { stats.failed += 1; }
  // (painted again for something other than three.js handing it over, which lets it go again itself once the card has
  // it: a moment later, if the card's copy is still the picture as it is, it is let go again)
  if (!p.timer && typeof setTimeout === 'function') {
    p.timer = setTimeout(() => { p.timer = null; if (!p.gone && !p.asleep && p.version === p.texture.version && p.canvas.width > 1) sleep(p); }, 2000);
    if (p.timer && typeof p.timer.unref === 'function') p.timer.unref();
  }
}

export function paintedState(texture) {
  const p = texture && painted.get(texture);
  return p ? { asleep: p.asleep, width: p.width, height: p.height } : null;
}
export const paintedStats = () => ({ ...stats });
