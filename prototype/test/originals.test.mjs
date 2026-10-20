// The owner's own model files stay exactly as he supplied them (20 October 2026, the owner's brief: "My original GLB
// files stay in the repository exactly as supplied, byte for byte, untouched. What the phone downloads may be a lighter
// copy MADE FROM each original by the build"). What a device downloads are copies the build makes from them (the
// figures: tools/characters/light.py; his buildings, the town's vehicles and the watch: tools/models/lighter.py; the
// motorcycles and cars: tools/vehicles/). This compares the files themselves, in prototype/assets/, with the MD5 each
// had when it was supplied (each was added to the repository in one commit and never changed since: `git log` of any of
// them shows one commit), and checks that the copies the website sends were made from them as they are.
//
//   node --test test/originals.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const here = (path) => new URL(`../${path}`, import.meta.url);
const md5 = (path) => createHash('md5').update(readFileSync(here(path))).digest('hex');

const SUPPLIED = {
  // the thirty figures (the MD5 of each as recorded when it was supplied: test/figures.test.mjs)
  'assets/characters/figures/animated/athlete.glb': '0cd1ed9f2a89e026ef142f956a17423b',
  'assets/characters/figures/animated/athletic_outfit.glb': '39a99defd263d62da1c9a39ce85bb9e9',
  'assets/characters/figures/animated/camouflage_bikini.glb': 'ae932d015787db7a79eb26b5b0db6d55',
  'assets/characters/figures/animated/fashion_model_1.glb': '4b7bfb20bafa2d4e36811cb08c8c3c82',
  'assets/characters/figures/animated/fashion_model_2.glb': '1774dfb2ee13c401bb5cd3e2e0025f97',
  'assets/characters/figures/animated/fashion_model_3.glb': 'a625ebbdff017179f4800a881e6f800f',
  'assets/characters/figures/animated/fashion_model_5.glb': '3b85fd9813e6438d2d33b44bf3d301fb',
  'assets/characters/figures/animated/fashion_model_6.glb': '6ab16a5c6900f06619f550bfacb1161d',
  'assets/characters/figures/animated/fashion_model_7.glb': '5df25c6f19873fe6149b6c769a8be7f2',
  'assets/characters/figures/animated/female_character_2.glb': '18f21504e75078151633b60aecabdf01',
  'assets/characters/figures/animated/female_figure.glb': '704224bcbfca52bec3313d7f68b6845c',
  'assets/characters/figures/animated/hobo_character.glb': 'b9f0f14679183e9e0c202b748a92adc5',
  'assets/characters/figures/animated/horror_character.glb': '8d0f497ef08709b97970744cdd50e650',
  'assets/characters/figures/animated/horror_nurse.glb': '9ec2b92e0944108a8396163e8b58d7b5',
  'assets/characters/figures/animated/human_character.glb': 'c510cb7e8f781e336c6bb432fc9a36d1',
  'assets/characters/figures/animated/male_figure.glb': '3a7aa49293940b7c11a5fc8f61711add',
  'assets/characters/figures/animated/muscular_male.glb': '36cc552a8a95352f60266797de804403',
  'assets/characters/figures/animated/nigerian_traditional.glb': '478589e4762c608113bfb84eedb27aa2',
  'assets/characters/figures/animated/ninja_armor.glb': '7bfb69491e40c80877b094ae1155d65a',
  'assets/characters/figures/animated/ninja_warrior.glb': 'c7a13d9945a3c46ebbc6f502955329bf',
  'assets/characters/figures/animated/patchwork_shirt.glb': '934edcdbc343d9d5c16a5b2839c94af9',
  'assets/characters/figures/animated/police.glb': 'd7f5ddcf60e8e56583ed93db5ef2ed36',
  'assets/characters/figures/animated/priest.glb': 'cb27d9d600e3a46a67c509fc58854d65',
  'assets/characters/figures/animated/swimwear_model.glb': 'abe7b532432707b1c28ed437237fb512',
  'assets/characters/figures/animated/urban_streetwear.glb': '4c7f8f5e2c48bd17609219a0ce51b59e',
  'assets/characters/figures/animated/warrior.glb': '230877a24a149d161f015fc06706e3b8',
  'assets/characters/figures/animated/woman.glb': '86cbd1e74c05c1adc5abd7c9f7d4d0a6',
  'assets/characters/figures/animated/zombie.glb': 'a5a3a1561d549d934b0aa60dc296a4e7',
  'assets/characters/figures/animated/zombie_character.glb': '73312db769b15a5f9851aa3d69e96445',
  'assets/characters/figures/animated/zombie_survivor.glb': '224c67af76e9f7f77491ea1fedab6a86',
  // his houses and towers in town
  'assets/buildings/town/curvedglassbuilding3dmodel.glb': 'd7725f0ddf67206a1adc97fc4f4c23ee',
  'assets/buildings/town/curvedmodernhouse3dmodel.glb': 'b87ecfaaa41fc5f9392cb434806e584c',
  'assets/buildings/town/futuristic_curved_skyscraper_3d_model.glb': 'd416a476f88915ae2cebb7ba3b041141',
  'assets/buildings/town/futuristic_tower_3d_model.glb': '8241384b6637976ce5a89b22b1a4d06b',
  'assets/buildings/town/futuristicarchitecture3dmodel.glb': 'cd8ba0e9cb4f50bbda769ca67dd60991',
  'assets/buildings/town/futuristicbuilding3dmodel.glb': 'dfa4d1b1ce6043319134dc355b56092d',
  'assets/buildings/town/futuristicbuilding3dmodel_1.glb': 'eaaddf9bdd66fa8bb2c71d041c2d36f5',
  'assets/buildings/town/futuristicspeaker3dmodel.glb': 'b697e20c876a8c02c869bf6deaa2ae42',
  'assets/buildings/town/futuristictower3dmodel.glb': 'ec38388c70fa067151105db859648dfc',
  'assets/buildings/town/luxury_hotel_3d_model.glb': '0b4931dff91c0d1dc341140426d79465',
  'assets/buildings/town/modern_glass_building_3d_model.glb': '49c36d9c4389faf23482183bfc96b8bb',
  'assets/buildings/town/modern_skyscraper_3d_model.glb': 'd71cb66bbe11951ca07134812327bd9c',
  'assets/buildings/town/modern_skyscraper_3d_model_2.glb': '5d1382e3fef22f41df7ae16d1ac938bb',
  'assets/buildings/town/modern_skyscraper_3d_model_3.glb': '90c2918112614495ec3f4edb2723b86d',
  'assets/buildings/town/modern_stacked_building_3d_model.glb': '373a3ba626de163f3a54588875e3e90b',
  'assets/buildings/town/modernhouse3dmodel.glb': 'ff8796f20f1ef2a0926338fd2ee476e2',
  'assets/buildings/town/modernvilla3dmodel.glb': 'aae85e18f900406218c98b1aff1d1d45',
  'assets/buildings/town/modernvilla3dmodel_1.glb': '0c2120bc8eb1a78c16b144328987b95a',
  'assets/buildings/town/pink_angular_building_3d_model.glb': 'e8df16ef62214d8d781105537faba1fd',
  // the car showroom's five buildings
  'assets/buildings/carshow/architectural_3d_model_1.glb': '935e54e1b4c0aba5c213e1140c5750e9',
  'assets/buildings/carshow/modern_skyscraper_3d_model_4.glb': 'bfc1d7a3c416ee1103578d392e448ca4',
  'assets/buildings/carshow/modern_villa_3d_model.glb': '886fbdac4cbc0bfcf29e45203c93d630',
  'assets/buildings/carshow/tall_glass_skyscraper_3d_model.glb': '53864f0d728a7c47ac301066866907c8',
  'assets/buildings/carshow/twisting_skyscraper_3d_model.glb': '5c6a9d50f2be512fac47878248fd36b1',
  // PowerBike's tower
  'assets/buildings/powerbike/skyscraper.glb': 'd71cb66bbe11951ca07134812327bd9c',
  // the town's ambulance, jet and trucks
  'assets/vehicles/town/ambulance3dmodel.glb': '397484007f64408bf3f7ad15c27570a2',
  'assets/vehicles/town/heavytruck3dmodel.glb': 'c6cea3d44f37c371ffe0a1417eabfd12',
  'assets/vehicles/town/privatejet3dmodel.glb': '318a01478bab931fc23283c37fa913ff',
  'assets/vehicles/town/red_box_truck_3d_model.glb': 'a27530ee381ea3a7e66acefafe24fb31',
  // the motorcycles
  'assets/vehicles/bikes/black-bobber.glb': '95b98e09dfb81e0e823286ff6546edf2',
  'assets/vehicles/bikes/black-cruiser.glb': '86f6129e14474c98a3c0d717c853fbf7',
  'assets/vehicles/bikes/black-gold-superbike.glb': 'd3f66ed4c6be1c81c99220f1150687da',
  'assets/vehicles/bikes/cafe-racer.glb': 'e1acce80078bca51144c3e176e1fd01a',
  'assets/vehicles/bikes/chopper.glb': 'c2484bce605afda0f190dfc2beee69a3',
  'assets/vehicles/bikes/chrome-concept.glb': '6758851c5c75f293267ebc7184b1a3fe',
  'assets/vehicles/bikes/civil-war-tourer.glb': 'c378f0bdcd0017f1c9ad2556d19b67ef',
  'assets/vehicles/bikes/gold-roadster.glb': 'd53c9a962eda2e311016608bd84b131c',
  'assets/vehicles/bikes/gold-tourer.glb': 'c4ca4284eb019448631bc391e747001e',
  'assets/vehicles/bikes/midnight-cruiser.glb': '202c0b11532b81b0c2c4eeeb2fb0e85a',
  'assets/vehicles/bikes/olive-cruiser.glb': 'a25bebd2d44999ca9a2e778ef7cccb8c',
  'assets/vehicles/bikes/power-cruiser.glb': '8263b5718d451555e18ac8374671ea25',
  'assets/vehicles/bikes/purple-sport.glb': '7980922077079a16125bb50e32429243',
  'assets/vehicles/bikes/red-superbike.glb': '68ff375f779e4c60a88d47df87fd83be',
  'assets/vehicles/bikes/streetfighter.glb': '644ba7427d9e1cf6b689e0e572d301a7',
  'assets/vehicles/bikes/white-sport.glb': 'eb60bb99fbec302fd86229c3a9a506c1',
  'assets/vehicles/bikes/yellow-adventure.glb': 'd736260e7fc5501b394a20965de64c71',
  // the cars
  'assets/vehicles/cars/black-grand-convertible.glb': '8b825b81e9e674bffe4ee3417097b88f',
  'assets/vehicles/cars/black-luxury-suv.glb': 'aa1de56b67625a7519c2ef4d8890ab87',
  'assets/vehicles/cars/black-pickup.glb': 'dd49bae1b72743877330f7a86e8cae41',
  'assets/vehicles/cars/black-square-suv.glb': '6c0f722a6b7500ecc44e31020344605c',
  'assets/vehicles/cars/blue-off-roader.glb': 'c06963e5d19fe6e6157a0dbd0dab6428',
  'assets/vehicles/cars/bronze-spyder.glb': '83dc0aa9000e6c2feacddebbbd5404f5',
  'assets/vehicles/cars/camo-expedition.glb': '00a6190d63ef2e7a16b74710be49d1e2',
  'assets/vehicles/cars/classic-two-tone.glb': '548efaf04d2406362e574d6313f1beeb',
  'assets/vehicles/cars/gold-hypercar.glb': '55caa9f19cd4e4f281d28c4931b32ec1',
  'assets/vehicles/cars/grey-grand-tourer.glb': '4bc46696a5a8403002612d5e9b0d2f99',
  'assets/vehicles/cars/grey-saloon.glb': 'af20455910b13c5937a1f6c92c753b50',
  'assets/vehicles/cars/midnight-saloon.glb': '75935e3fb8d2fe618b7257600777cf44',
  'assets/vehicles/cars/mint-sports-coupe.glb': '2b9eb06b5dd291c677680d1c88a27dd8',
  'assets/vehicles/cars/peach-suv.glb': 'b61c8eab568824f0763c42b0c92dab7d',
  'assets/vehicles/cars/pearl-convertible.glb': '88843a96023f41b263f0e6ca803474fd',
  'assets/vehicles/cars/red-winged-supercar.glb': '328bbfd66b29e1d26b8fa940bfd67085',
  'assets/vehicles/cars/state-limousine.glb': '6158b3c4f3b9f81b5e99c3121cbd348c',
  'assets/vehicles/cars/white-roadster.glb': 'd492b079989b1a38d3d6f8a83f72d727',
  'assets/vehicles/cars/white-square-suv.glb': '58ba1e906fbbe0eb5619f6bbd88dc467',
  'assets/vehicles/cars/yellow-classic-roadster.glb': 'b120cd2b4b90cdb2104f8b88db7a9bf9',
  // the wristwatch
  'assets/market/watch.glb': '440b261d3d721b0a14a76e3e8e67b57f',
};

test('every one of the owner\'s model files is byte for byte as he supplied it', () => {
  assert.equal(Object.keys(SUPPLIED).length, 97);
  for (const [path, sum] of Object.entries(SUPPLIED)) assert.equal(md5(path), sum, `${path} is not as it was supplied`);
});

test('and none is missing or added unannounced: each folder holds just these models', () => {
  for (const folder of ['assets/characters/figures/animated/', 'assets/buildings/town/', 'assets/buildings/carshow/', 'assets/buildings/powerbike/', 'assets/vehicles/town/', 'assets/vehicles/bikes/', 'assets/vehicles/cars/']) {
    const there = readdirSync(here(folder)).filter((name) => name.endsWith('.glb')).map((name) => folder + name).sort();
    assert.deepEqual(there, Object.keys(SUPPLIED).filter((path) => path.startsWith(folder)).sort(), folder);
  }
});

test('the copies the website sends were made from these very files', () => {
  // the figures' light copies
  const figures = JSON.parse(readFileSync(here('assets/characters/figures/light/made.json'), 'utf8')).figures;
  assert.equal(Object.keys(figures).length, 30);
  for (const [file, made] of Object.entries(figures)) assert.equal(made.md5, SUPPLIED[`assets/characters/figures/animated/${file}`], `the light copy of ${file}`);
  // the lighter copies of his buildings, the town's vehicles and the watch
  const copies = JSON.parse(readFileSync(here('assets/models-light/made.json'), 'utf8')).copies;
  assert.ok(Object.keys(copies).length >= 55);
  for (const [name, made] of Object.entries(copies)) {
    assert.equal(made.md5, SUPPLIED[made.from], `${name} was made from ${made.from} as it is`);
    assert.ok(existsSync(here(`assets/models-light/${name}`)), name);
    assert.equal(createHash('sha256').update(readFileSync(here(`assets/models-light/${name}`))).digest('hex'), made.sha256, `${name} is the copy that was made`);
  }
});
