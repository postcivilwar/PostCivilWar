// Taking a character from one place to another.
//
// There are no accounts yet: a character, and the town as that player has left it, live in one browser's
// storage on one device. Two places that look like the same game to a player do not share that storage:
// another browser, another phone, and, on an iPhone or iPad, the game installed on the home screen, which is
// kept apart from Safari by the phone itself. So a character made in Safari is not in the installed game.
//
// Until there are accounts, this is how a character moves: the place that has it writes it out as a code (the
// whole save, packed small), the player copies it, and the place that wants it reads it back. Nothing leaves
// the device unless the player sends the code somewhere themselves.
//
// A code is something a stranger could hand a player, so reading one trusts nothing: it must unpack, be the
// right kind of thing for this town and this version, stay within a size, and load into a simulation that then
// really has that player. Only then is it kept.

const KIND = 'pcw-character';
const PACKED = 'PCW1.';        // the save as JSON, gzipped, in base64 for addresses
const PLAIN = 'PCW0.';         // the same, not gzipped: for a browser that cannot gzip
const MOST_TEXT = 6 * 1024 * 1024;       // the longest code that is looked at at all (characters)
const MOST_JSON = 4 * 1024 * 1024;       // the most a code may unpack to (bytes): what one browser's storage will hold

export class CarryError extends Error {}

const toBase64 = (bytes) => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64 = (text) => {
  const raw = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
};
const canGzip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function' && typeof Response === 'function';

// Everything that comes out of a stream, but never more than `most` bytes of it.
async function drain(stream, most) {
  const reader = stream.getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > most) { reader.cancel().catch(() => {}); throw new CarryError('That code is too large to be a character.'); }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}

// A character as a code. `save` is what the game keeps ({ host, playerId }); `prefs` is what goes with it
// (which figure and colours, and the answer to the opening's question).
export async function packCharacter({ zone, save, prefs = {} }) {
  const json = JSON.stringify({ kind: KIND, v: 1, zone, save, prefs: { look: prefs.look || null, path: prefs.path || null } });
  const bytes = new TextEncoder().encode(json);
  if (!canGzip()) return PLAIN + toBase64(bytes);
  const packed = await drain(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')), MOST_JSON * 2);
  return PACKED + toBase64(packed);
}

// A code as a character, or a CarryError that says in plain words why not.
export async function unpackCharacter(text) {
  // a message app may have broken it over lines or put spaces round it
  const code = String(text || '').replace(/\s+/g, '');
  if (!code) throw new CarryError('There is no code there yet.');
  if (code.length > MOST_TEXT) throw new CarryError('That code is too large to be a character.');
  const packed = code.startsWith(PACKED);
  if (!packed && !code.startsWith(PLAIN)) throw new CarryError('That is not a character code. Copy it again from Settings in the place that has your character.');
  const body = code.slice(PACKED.length);
  if (!/^[A-Za-z0-9_-]+$/.test(body)) throw new CarryError('That code is damaged. Copy it again, all of it.');
  let bytes;
  try {
    bytes = fromBase64(body);
    if (packed) {
      if (!canGzip()) throw new CarryError('This browser cannot read that code. Try a newer browser.');
      bytes = await drain(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')), MOST_JSON);
    }
  } catch (error) {
    if (error instanceof CarryError) throw error;
    throw new CarryError('That code is damaged. Copy it again, all of it.');
  }
  if (bytes.length > MOST_JSON) throw new CarryError('That code is too large to be a character.');
  let data;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch (error) { throw new CarryError('That code is damaged. Copy it again, all of it.'); }
  if (!data || typeof data !== 'object' || data.kind !== KIND || data.v !== 1) throw new CarryError('That is not a character code.');
  return data;
}

// Is what a code held really a character that this game can carry on with? It is loaded into a simulation of
// its own and asked. { ok: true, name, save, prefs } or { ok: false, why }.
export function checkCharacter(data, { zone, version, createHost }) {
  const no = (why) => ({ ok: false, why });
  if (!data || typeof data !== 'object' || !data.save || typeof data.save !== 'object') return no('That is not a character code.');
  if (data.zone !== zone) return no('That character is from a different town, and cannot come here yet.');
  const { host, playerId } = data.save;
  if (!host || typeof host !== 'object' || typeof playerId !== 'string' || !playerId) return no('That is not a character code.');
  if (host.version !== version) return no('That character was saved by a different version of the game, and cannot be read by this one.');
  let name;
  try {
    const trial = createHost({ saved: JSON.parse(JSON.stringify(host)) });      // a copy: the one that is kept is not played with
    if (!trial.game.hasPlayer(playerId)) return no('That code has a town in it but no character.');
    name = trial.game.view(playerId).self.name;
    trial.tick(0.1);          // and the town it came with can carry on
  } catch (error) {
    return no('That code is damaged: the character in it cannot be read.');
  }
  if (typeof name !== 'string' || !name) return no('That code is damaged: the character in it cannot be read.');
  // what goes with the character is taken only if it is what it should be
  const prefs = {};
  const given = data.prefs && typeof data.prefs === 'object' ? data.prefs : {};
  if (given.path === 'hero' || given.path === 'villain') prefs.path = given.path;
  if (given.look && typeof given.look === 'object' && !Array.isArray(given.look) && JSON.stringify(given.look).length < 4000) prefs.look = given.look;
  return { ok: true, name, save: { host, playerId }, prefs };
}
