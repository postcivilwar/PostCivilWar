// Transports: how one copy of the world reaches the others.
//
// A transport does one small thing. It publishes this player's public state
// and reports everyone else's. Everything above it (who is near, who may
// speak, what is heard) is decided by the simulation, so a transport can be
// swapped without touching the game:
//
//   loopback   several players in one process; used by the tests
//   room       people who have this page open at the same time
//   (later)    a socket to the zone server, which then owns the world
//
// The interface:
//   kind                      a name, for the status line
//   publish(state)            this player's state, whole, each time
//   subscribe(handler)        handler(peers) with [{ id, state }], on change
//   close()

export function createLoopbackHub() {
  const members = new Map();
  const tell = () => {
    for (const [id, member] of members) {
      const others = [];
      for (const [otherId, other] of members) if (otherId !== id && other.state) others.push({ id: otherId, state: other.state });
      for (const handler of member.handlers) handler(others);
    }
  };
  return {
    size: () => members.size,
    join(id) {
      const member = { state: null, handlers: new Set() };
      members.set(id, member);
      return {
        kind: 'loopback',
        publish(state) { member.state = JSON.parse(JSON.stringify(state)); tell(); },
        subscribe(handler) { member.handlers.add(handler); tell(); return () => member.handlers.delete(handler); },
        close() { members.delete(id); tell(); },
      };
    },
  };
}

// The page's live room: everyone who has it open now. Each person's state
// travels as their presence, under one key. A second tab or a second device
// of the same person is another player, as it would be in the game.
export function createRoomTransport(room) {
  let off = null;
  let failed = false;
  return {
    kind: 'room',
    get failed() { return failed; },
    publish(state) { room.presence({ nlw: state }).catch(() => { failed = true; }); },
    subscribe(handler) {
      off = room.onPeers((change) => {
        const others = [];
        for (const peer of change.peers) {
          if (peer.sameTab || peer.kind !== 'viewer' || !peer.presence || typeof peer.presence.nlw !== 'object' || !peer.presence.nlw) continue;
          others.push({ id: peer.peer, state: peer.presence.nlw });
        }
        handler(others);
      }, () => { failed = true; });
      return off;
    },
    close() { if (off) off(); room.presence({ nlw: null }).catch(() => {}); },
  };
}
