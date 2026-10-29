// A relay for voice chat's test (test/voice-chat.mjs), on this machine: the least of a TURN server (RFC 5766) that a
// browser needs to send its voice through it, as Cloudflare's relay does on the website when two devices cannot reach
// each other. Over UDP on 127.0.0.1: Binding, Allocate (asked again with the user's name and the realm's nonce, and
// answered with a MESSAGE-INTEGRITY made with the password), Refresh, CreatePermission, ChannelBind, Send and Data
// indications, and ChannelData. Not for anything but the tests: requests' own integrity is not checked.
//
//   const relay = await startRelay({ username, password });   relay.url, relay.counts, relay.close()
import dgram from 'node:dgram';
import crypto from 'node:crypto';

const COOKIE = 0x2112a442;
const T = { binding: 0x0001, allocate: 0x0003, refresh: 0x0004, send: 0x0016, data: 0x0017, permission: 0x0008, channel: 0x0009 };
const A = { mapped: 0x0020, username: 0x0006, integrity: 0x0008, error: 0x0009, channel: 0x000c, lifetime: 0x000d, peer: 0x0012, data: 0x0013, realm: 0x0014, nonce: 0x0015, relayed: 0x0016, transport: 0x0019 };

function parse(buf) {
  if (buf.length < 20 || (buf[0] & 0xc0) !== 0 || buf.readUInt32BE(4) !== COOKIE) return null;
  const type = buf.readUInt16BE(0), length = buf.readUInt16BE(2), tid = buf.subarray(8, 20);
  const attrs = new Map();
  for (let at = 20; at + 4 <= 20 + length;) {
    const t = buf.readUInt16BE(at), l = buf.readUInt16BE(at + 2);
    if (!attrs.has(t)) attrs.set(t, buf.subarray(at + 4, at + 4 + l));
    at += 4 + l + ((4 - (l % 4)) % 4);
  }
  return { type, tid, attrs };
}
function xorAddress(ip, port, tid) {
  const out = Buffer.alloc(8);
  out[1] = 0x01; out.writeUInt16BE(port ^ (COOKIE >>> 16), 2);
  const parts = ip.split('.').map(Number);
  out.writeUInt32BE((((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) ^ COOKIE) >>> 0, 4);
  return out;
}
function readXor(value) {
  const port = value.readUInt16BE(2) ^ (COOKIE >>> 16);
  const n = (value.readUInt32BE(4) ^ COOKIE) >>> 0;
  return { ip: `${n >>> 24}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`, port };
}
function build(type, tid, attrs, key = null) {
  const parts = [];
  for (const [t, v] of attrs) { const head = Buffer.alloc(4); head.writeUInt16BE(t, 0); head.writeUInt16BE(v.length, 2); parts.push(head, v, Buffer.alloc((4 - (v.length % 4)) % 4)); }
  let body = Buffer.concat(parts);
  const header = Buffer.alloc(20);
  header.writeUInt16BE(type, 0); header.writeUInt32BE(COOKIE, 4); tid.copy(header, 8);
  if (key) {
    header.writeUInt16BE(body.length + 24, 2);
    const mac = crypto.createHmac('sha1', key).update(Buffer.concat([header, body])).digest();
    const head = Buffer.alloc(4); head.writeUInt16BE(A.integrity, 0); head.writeUInt16BE(20, 2);
    body = Buffer.concat([body, head, mac]);
  }
  header.writeUInt16BE(body.length, 2);
  return Buffer.concat([header, body]);
}
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0, 0); return b; };

export async function startRelay({ username = 'pcw-test', password = 'pcw-test-password', realm = 'pcw.test' } = {}) {
  const key = crypto.createHash('md5').update(`${username}:${realm}:${password}`).digest();
  const nonce = Buffer.from(crypto.randomBytes(8).toString('hex'));
  const sock = dgram.createSocket('udp4');
  const allocations = new Map();          // client "ip:port" -> { relay, port, perms: Set(ip), channels: Map(number -> "ip:port"), byPeer: Map("ip:port" -> number) }
  const counts = { allocations: 0, relayedPackets: 0, relayedBytes: 0 };
  const reply = (buf, rinfo) => sock.send(buf, rinfo.port, rinfo.address);

  async function allocate(client, rinfo) {
    const relay = dgram.createSocket('udp4');
    await new Promise((done) => relay.bind(0, '127.0.0.1', done));
    const a = { relay, port: relay.address().port, perms: new Set(), channels: new Map(), byPeer: new Map(), rinfo };
    relay.on('message', (data, from) => {
      if (!a.perms.has(from.address)) return;
      counts.relayedPackets += 1; counts.relayedBytes += data.length;
      const number = a.byPeer.get(`${from.address}:${from.port}`);
      if (number) {
        const head = Buffer.alloc(4); head.writeUInt16BE(number, 0); head.writeUInt16BE(data.length, 2);
        reply(Buffer.concat([head, data, Buffer.alloc((4 - (data.length % 4)) % 4)]), a.rinfo);
      } else reply(build(T.data, crypto.randomBytes(12), [[A.peer, xorAddress(from.address, from.port)], [A.data, data]]), a.rinfo);
    });
    allocations.set(client, a);
    counts.allocations += 1;
    return a;
  }

  sock.on('message', async (buf, rinfo) => {
    const client = `${rinfo.address}:${rinfo.port}`;
    // ChannelData: to the peer bound to that channel
    if (buf.length >= 4 && buf[0] >= 0x40 && buf[0] <= 0x7f) {
      const a = allocations.get(client); if (!a) return;
      const peer = a.channels.get(buf.readUInt16BE(0)); if (!peer) return;
      const [ip, port] = peer.split(':');
      counts.relayedPackets += 1;
      a.relay.send(buf.subarray(4, 4 + buf.readUInt16BE(2)), Number(port), ip);
      return;
    }
    const m = parse(buf);
    if (!m) return;
    const signed = m.attrs.has(A.integrity);
    const fail = (code, reason) => reply(build(m.type | 0x0110, m.tid, [[A.error, Buffer.concat([Buffer.from([0, 0, Math.floor(code / 100), code % 100]), Buffer.from(reason)])], [A.realm, Buffer.from(realm)], [A.nonce, nonce]]), rinfo);
    if (m.type === T.binding) { reply(build(0x0101, m.tid, [[A.mapped, xorAddress(rinfo.address, rinfo.port)]]), rinfo); return; }
    if (m.type === T.send) {
      const a = allocations.get(client); if (!a || !m.attrs.has(A.peer) || !m.attrs.has(A.data)) return;
      const peer = readXor(m.attrs.get(A.peer));
      if (!a.perms.has(peer.ip)) return;
      counts.relayedPackets += 1;
      a.relay.send(m.attrs.get(A.data), peer.port, peer.ip);
      return;
    }
    if ([T.allocate, T.refresh, T.permission, T.channel].includes(m.type) && !signed) { fail(401, 'Unauthorized'); return; }
    if (m.type === T.allocate) {
      const a = allocations.get(client) || await allocate(client, rinfo);
      reply(build(0x0103, m.tid, [[A.relayed, xorAddress('127.0.0.1', a.port)], [A.mapped, xorAddress(rinfo.address, rinfo.port)], [A.lifetime, u32(600)]], key), rinfo);
      return;
    }
    const a = allocations.get(client);
    if (!a) { fail(437, 'Allocation Mismatch'); return; }
    if (m.type === T.refresh) {
      const life = m.attrs.has(A.lifetime) ? m.attrs.get(A.lifetime).readUInt32BE(0) : 600;
      if (life === 0) { a.relay.close(); allocations.delete(client); }
      reply(build(0x0104, m.tid, [[A.lifetime, u32(life)]], key), rinfo);
      return;
    }
    if (m.type === T.permission) {
      for (const [t, v] of [...m.attrs]) if (t === A.peer) a.perms.add(readXor(v).ip);
      // (more than one XOR-PEER-ADDRESS may come: parse keeps the first, so every one is read from the message itself)
      for (let at = 20; at + 4 <= buf.length;) { const t = buf.readUInt16BE(at), l = buf.readUInt16BE(at + 2); if (t === A.peer) a.perms.add(readXor(buf.subarray(at + 4, at + 4 + l)).ip); at += 4 + l + ((4 - (l % 4)) % 4); }
      reply(build(0x0108, m.tid, [], key), rinfo);
      return;
    }
    if (m.type === T.channel) {
      const number = m.attrs.get(A.channel).readUInt16BE(0), peer = readXor(m.attrs.get(A.peer));
      a.channels.set(number, `${peer.ip}:${peer.port}`); a.byPeer.set(`${peer.ip}:${peer.port}`, number); a.perms.add(peer.ip);
      reply(build(0x0109, m.tid, [], key), rinfo);
    }
  });
  await new Promise((done) => sock.bind(0, '127.0.0.1', done));
  const port = sock.address().port;
  return {
    port, counts,
    iceServers: [{ urls: [`turn:127.0.0.1:${port}?transport=udp`], username, credential: password }],
    close() { for (const a of allocations.values()) { try { a.relay.close(); } catch (error) { /* closed */ } } try { sock.close(); } catch (error) { /* closed */ } },
  };
}
