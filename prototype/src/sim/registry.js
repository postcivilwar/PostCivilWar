// Land registry.
//
// One record per surveyed parcel: who owns it, how it is zoned, what it has
// been through. A sale is a ledger payment and a change of title in the same
// step; if the payment is refused the title does not move.
//
// Parcel ids carry country, state and local government codes
// (NG-AN-OGB-000101), so the same registry holds any state's land.

import { cowrieText } from './ledger.js';
import { ZONE, ZONE_PARCELS, ZONING, zoneParcel, zoneParcelByPlot } from './zone.js';

export const REGISTRY_FEE_RATE = 0.03;      // registration fee on the sale price
export const MAX_PARCELS_PER_PLAYER = 3;    // prototype allocation limit

export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GameError';
    this.code = code;
  }
}

export function createRegistry({ state, ledger, accounts, clock }) {
  if (!state.registry) {
    state.registry = { parcels: {}, titleCounter: 0, permitCounter: 0 };
    for (const p of ZONE_PARCELS) {
      state.registry.parcels[p.id] = {
        owner: { kind: 'government', id: ZONE.government.state.code, name: ZONE.government.state.name },
        status: 'available', titleNo: null, permit: null, site: null,
        history: [{ at: 0, type: 'survey', detail: `Surveyed and beaconed as Plot ${p.plot}, ${p.scheme}` }],
      };
    }
  }
  const book = state.registry;

  function record(parcelId) {
    const row = book.parcels[parcelId];
    if (!row) throw new GameError('NO_PARCEL', 'There is no such parcel in the register.');
    return row;
  }

  function quote(parcelId) {
    const p = zoneParcel(parcelId);
    if (!p) throw new GameError('NO_PARCEL', 'There is no such parcel in the register.');
    const fee = Math.round(p.price * REGISTRY_FEE_RATE);
    return { price: p.price, fee, total: p.price + fee };
  }

  function issueTitle(parcelId, owner, txn, detail) {
    const row = record(parcelId);
    book.titleCounter += 1;
    row.owner = owner;
    row.status = 'titled';
    row.titleNo = `${ZONE.state}/${ZONE.lgaCode}/${String(book.titleCounter).padStart(5, '0')}`;
    row.history.push({ at: clock(), type: 'sale', detail, txn });
    return row.titleNo;
  }

  // Used once at world creation for the parcels residents already hold.
  function allocate(plot, owner, detail) {
    const p = zoneParcelByPlot(plot);
    return issueTitle(p.id, owner, null, detail);
  }

  function purchase(player, parcelId) {
    const p = zoneParcel(parcelId);
    const row = record(parcelId);
    if (row.status !== 'available') throw new GameError('NOT_FOR_SALE', `Plot ${p.plot} is not for sale.`);
    const held = Object.values(book.parcels).filter((r) => r.owner.kind === 'player' && r.owner.id === player.id).length;
    if (held >= MAX_PARCELS_PER_PLAYER) throw new GameError('ALLOCATION_LIMIT', `One person may hold at most ${MAX_PARCELS_PER_PLAYER} plots in this scheme.`);
    const { price, fee, total } = quote(parcelId);
    // The key makes a double submission harmless: the same person cannot pay twice for the same plot.
    const result = ledger.post({
      key: `land:${parcelId}:${player.id}`, kind: 'land_purchase', initiator: 'svc:registry',
      reason: `Purchase of Plot ${p.plot}, ${p.scheme}`,
      legs: [{ account: player.wallet, amount: -total }, { account: accounts.government(ZONE.government.state.code), amount: total }],
      meta: { parcel: parcelId, price, registrationFee: fee },
    });
    const titleNo = issueTitle(parcelId, { kind: 'player', id: player.id, name: player.name }, result.id,
      `Sold by ${ZONE.government.state.name} to ${player.name} for ${cowrieText(price)}; registration fee ${cowrieText(fee)}`);
    return { titleNo, txn: result.id, price, fee, total, parcel: view(parcelId, player.id) };
  }

  function applyPermit(player, parcelId, design) {
    const p = zoneParcel(parcelId);
    const row = record(parcelId);
    if (row.owner.kind !== 'player' || row.owner.id !== player.id) throw new GameError('NOT_OWNER', 'A permit can only be issued to the registered owner of the plot.');
    if (row.permit) throw new GameError('HAS_PERMIT', `Plot ${p.plot} already has building permit ${row.permit.no}.`);
    if (!ZONING[p.zoning].uses.includes(design.id)) {
      throw new GameError('ZONING', `Plot ${p.plot} is zoned ${ZONING[p.zoning].name}. A ${design.name.toLowerCase()} is not a permitted use there.`);
    }
    const result = ledger.post({
      key: `permit:${parcelId}:${design.id}`, kind: 'government_fee', initiator: 'svc:secretariat',
      reason: `Building permit fee, Plot ${p.plot}`,
      legs: [{ account: player.wallet, amount: -design.permitFee }, { account: accounts.government(ZONE.government.local.code), amount: design.permitFee }],
      meta: { parcel: parcelId, design: design.id },
    });
    book.permitCounter += 1;
    row.permit = { no: `${ZONE.lgaCode}/BP/${String(book.permitCounter).padStart(4, '0')}`, design: design.id, issuedAt: clock(), txn: result.id };
    row.history.push({ at: clock(), type: 'permit', detail: `Building permit ${row.permit.no} issued for a ${design.name.toLowerCase()}`, txn: result.id });
    return { permitNo: row.permit.no, txn: result.id, fee: design.permitFee };
  }

  function view(parcelId, viewerId) {
    const p = zoneParcel(parcelId);
    const row = record(parcelId);
    const yours = row.owner.kind === 'player' && row.owner.id === viewerId;
    const zoning = ZONING[p.zoning];
    return {
      id: p.id, plot: p.plot, scheme: p.scheme, state: ZONE.stateName, lga: ZONE.lga,
      zoning: zoning.code, zoningName: zoning.name, permittedUses: zoning.uses.slice(),
      area: p.area, lat: p.lat, lon: p.lon, x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1, cx: p.cx, cz: p.cz,
      status: row.status, yours, ownerName: row.owner.name, ownerKind: row.owner.kind, titleNo: row.titleNo,
      ...quote(parcelId),
      permit: row.permit ? { ...row.permit } : null,
      development: row.site ? (row.site.complete ? 'developed' : 'under construction') : 'undeveloped',
      history: row.history.map((h) => ({ ...h })),
    };
  }

  return {
    quote, purchase, applyPermit, allocate, view, record,
    list: (viewerId) => ZONE_PARCELS.map((p) => view(p.id, viewerId)),
    ownedBy: (playerId) => ZONE_PARCELS.filter((p) => { const r = book.parcels[p.id]; return r.owner.kind === 'player' && r.owner.id === playerId; }).map((p) => p.id),
  };
}
