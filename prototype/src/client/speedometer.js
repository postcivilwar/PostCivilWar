// The speedometer: see-through, at the front of the screen while a motorcycle is ridden. It shows the bike's own
// speed in km/h (the speed the game moves it at, times 3.6), on a dial that ends a little above the bike's top
// speed, which its engine size sets (power-bikes.js, speedOfCc), with the engine size under it.
//
//   const speedo = createSpeedometer($('speedo'));
//   speedo.show({ topKmh, cc, name }) / speedo.hide()
//   speedo.update(dt, { kmh, braking })            every frame: the needle follows smoothly, never jumps

const NS = 'http://www.w3.org/2000/svg';
const SWEEP = 240;                 // degrees the dial covers
const START = 150;                 // where 0 is (degrees, clockwise from the right)
const R = 62, CX = 84, CY = 72;

const node = (tag, attrs) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return el; };
const polar = (deg, r) => [CX + r * Math.cos((deg * Math.PI) / 180), CY + r * Math.sin((deg * Math.PI) / 180)];
const arcPath = (from, to, r) => { const [x0, y0] = polar(from, r), [x1, y1] = polar(to, r); return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };

export function createSpeedometer(el) {
  const svg = node('svg', { viewBox: '0 0 168 104', 'aria-hidden': 'true' });
  const arc = node('path', { class: 'arc', d: arcPath(START, START + SWEEP, R) });
  const fill = node('path', { class: 'fill', d: '' });
  const ticks = node('g', {});
  const needle = node('line', { class: 'needle', x1: CX, y1: CY, x2: CX, y2: CY });
  const kmh = node('text', { class: 'kmh', x: CX, y: CY + 6 });
  const unit = node('text', { class: 'unit', x: CX, y: CY + 20 });
  const cc = node('text', { class: 'cc', x: CX, y: CY + 33 });
  unit.textContent = 'KM/H';
  svg.append(arc, ticks, fill, needle, kmh, unit, cc);
  el.append(svg);
  const st = { shown: false, max: 120, value: 0, drawn: -1 };

  function show({ topKmh, cc: size }) {
    // the dial ends at the next 20 above the top speed
    st.max = Math.max(60, Math.ceil((topKmh * 1.08) / 20) * 20);
    ticks.replaceChildren();
    const step = st.max > 200 ? 40 : 20;
    for (let v = 0; v <= st.max; v += step) {
      const deg = START + (v / st.max) * SWEEP;
      const [x0, y0] = polar(deg, R - 1), [x1, y1] = polar(deg, R - 7);
      ticks.append(node('line', { class: 'tick', x1: x0.toFixed(2), y1: y0.toFixed(2), x2: x1.toFixed(2), y2: y1.toFixed(2) }));
    }
    cc.textContent = size ? `${size} CC` : '';
    el.setAttribute('aria-valuemax', String(st.max));
    st.value = 0; st.drawn = -1;
    el.hidden = false; st.shown = true;
  }
  function hide() { if (!st.shown) return; el.hidden = true; st.shown = false; }

  function update(dt, { kmh: speed, braking = false }) {
    if (!st.shown) return;
    const want = Math.max(0, Math.min(st.max, speed));
    // the needle follows the speed closely, without a jump (a few hundredths of a second behind it)
    st.value += (want - st.value) * Math.min(1, dt * 12);
    const shown = Math.round(st.value);
    el.classList.toggle('braking', !!braking);
    if (shown === st.drawn) return;
    st.drawn = shown;
    const deg = START + (st.value / st.max) * SWEEP;
    fill.setAttribute('d', st.value > 0.5 ? arcPath(START, deg, R) : '');
    const [x0, y0] = polar(deg, 34), [x, y] = polar(deg, R - 10);
    needle.setAttribute('x1', x0.toFixed(2)); needle.setAttribute('y1', y0.toFixed(2)); needle.setAttribute('x2', x.toFixed(2)); needle.setAttribute('y2', y.toFixed(2));
    kmh.textContent = String(shown);
    el.setAttribute('aria-valuenow', String(shown));
  }

  return { show, hide, update, get shown() { return st.shown; }, get reading() { return st.drawn; }, get max() { return st.max; } };
}
