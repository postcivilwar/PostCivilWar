// The 36 states and the Federal Capital Territory.
//
// Codes are the ISO 3166-2:NG subdivision codes. Capital coordinates are
// approximate (to about 0.05 of a degree) and are placeholders until the
// geodata pipeline supplies surveyed boundaries and settlement positions.
// `zone` is the geopolitical zone, which selects the regional building kit.

export const NIGERIA_STATES = Object.freeze([
  ['AB', 'Abia', 'Umuahia', 'SE', 5.53, 7.49],
  ['AD', 'Adamawa', 'Yola', 'NE', 9.21, 12.48],
  ['AK', 'Akwa Ibom', 'Uyo', 'SS', 5.04, 7.91],
  ['AN', 'Anambra', 'Awka', 'SE', 6.21, 7.07],
  ['BA', 'Bauchi', 'Bauchi', 'NE', 10.31, 9.84],
  ['BY', 'Bayelsa', 'Yenagoa', 'SS', 4.92, 6.26],
  ['BE', 'Benue', 'Makurdi', 'NC', 7.73, 8.52],
  ['BO', 'Borno', 'Maiduguri', 'NE', 11.83, 13.15],
  ['CR', 'Cross River', 'Calabar', 'SS', 4.96, 8.33],
  ['DE', 'Delta', 'Asaba', 'SS', 6.2, 6.73],
  ['EB', 'Ebonyi', 'Abakaliki', 'SE', 6.32, 8.11],
  ['ED', 'Edo', 'Benin City', 'SS', 6.34, 5.62],
  ['EK', 'Ekiti', 'Ado-Ekiti', 'SW', 7.62, 5.22],
  ['EN', 'Enugu', 'Enugu', 'SE', 6.44, 7.5],
  ['FC', 'Federal Capital Territory', 'Abuja', 'NC', 9.08, 7.4],
  ['GO', 'Gombe', 'Gombe', 'NE', 10.29, 11.17],
  ['IM', 'Imo', 'Owerri', 'SE', 5.48, 7.03],
  ['JI', 'Jigawa', 'Dutse', 'NW', 11.76, 9.34],
  ['KD', 'Kaduna', 'Kaduna', 'NW', 10.52, 7.44],
  ['KN', 'Kano', 'Kano', 'NW', 12.0, 8.52],
  ['KT', 'Katsina', 'Katsina', 'NW', 12.99, 7.6],
  ['KE', 'Kebbi', 'Birnin Kebbi', 'NW', 12.45, 4.2],
  ['KO', 'Kogi', 'Lokoja', 'NC', 7.8, 6.74],
  ['KW', 'Kwara', 'Ilorin', 'NC', 8.5, 4.55],
  ['LA', 'Lagos', 'Ikeja', 'SW', 6.6, 3.35],
  ['NA', 'Nasarawa', 'Lafia', 'NC', 8.49, 8.52],
  ['NI', 'Niger', 'Minna', 'NC', 9.61, 6.56],
  ['OG', 'Ogun', 'Abeokuta', 'SW', 7.16, 3.35],
  ['ON', 'Ondo', 'Akure', 'SW', 7.25, 5.2],
  ['OS', 'Osun', 'Osogbo', 'SW', 7.77, 4.56],
  ['OY', 'Oyo', 'Ibadan', 'SW', 7.38, 3.95],
  ['PL', 'Plateau', 'Jos', 'NC', 9.9, 8.86],
  ['RI', 'Rivers', 'Port Harcourt', 'SS', 4.82, 7.05],
  ['SO', 'Sokoto', 'Sokoto', 'NW', 13.06, 5.24],
  ['TA', 'Taraba', 'Jalingo', 'NE', 8.89, 11.37],
  ['YO', 'Yobe', 'Damaturu', 'NE', 11.75, 11.96],
  ['ZA', 'Zamfara', 'Gusau', 'NW', 12.17, 6.66],
].map(([code, name, capital, zone, lat, lon]) => Object.freeze({ code, name, capital, zone, lat, lon, kind: code === 'FC' ? 'territory' : 'state' })));

export const NIGERIA_ZONES = Object.freeze({
  NW: 'North West', NE: 'North East', NC: 'North Central', SW: 'South West', SE: 'South East', SS: 'South South',
});

export function stateByCode(code) {
  return NIGERIA_STATES.find((state) => state.code === code) || null;
}
