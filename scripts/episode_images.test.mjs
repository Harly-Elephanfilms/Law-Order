import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { identifyImage, uniqueImages } from './episode_images.mjs';

const mapping = JSON.parse(await readFile(new URL('../src/data/episode-image-mapping.json', import.meta.url), 'utf8'));

test('les codes vérifiés corrigent les deux derniers épisodes de S13', () => {
  assert.equal(identifyImage('Ep23_LawOrder_E3322_REF.png', 13, mapping).episode, 24);
  assert.equal(identifyImage('Ep24_LawOrder_E3317_REF.png', 13, mapping).episode, 23);
  assert.throws(() => identifyImage('Ep01_LawOrder_E3322_REF.png', 13, mapping), /contradictoire/);
});

test('les codes de S15 suivent la diffusion, pas leur ordre numérique', () => {
  assert.equal(identifyImage('LawOrder_E5302_REF.png', 15, mapping).episode, 6);
  assert.equal(identifyImage('LawOrder_E5325_REF.png', 15, mapping).episode, 20);
  assert.equal(identifyImage('LawOrder_E5329_REF.png', 15, mapping).episode, 24);
  assert.equal(identifyImage('LawOrder_E5399_REF.png', 15, mapping).episode, undefined);
  assert.equal(identifyImage('LawOrder_E5302_REF.png', 14, mapping).episode, undefined);
});

test('les photos anonymes ne sont pas attribuées à partir du numéro TV_LAN', () => {
  assert.equal(identifyImage('@TV_LAN05_00004A-282656.jpg', 5, mapping).episode, undefined);
  assert.equal(identifyImage('@TV_LAN01_66203_0007-88198.jpg', 1, mapping).episode, 7);
});

test('les variantes de noms explicites sont reconnues', () => {
  assert.equal(identifyImage('@Ep2-Law3.jpg', 3, mapping).episode, 2);
  assert.equal(identifyImage('@Ep11-Law&O-1.jpg', 4, mapping).episode, 11);
  assert.equal(identifyImage('@Ep05_LawOrder_K0110_REF.jpg', 6, mapping).episode, 5);
});

test('un doublon PHOTOS/PNG ne prend pas les deux places d’un épisode', () => {
  const result = uniqueImages([
    'SAISON 11/PHOTOS/Ep01_LawOrder_E1304_REF.00_01_29_06.Still001.png',
    'SAISON 11/PNG/Ep01_LawOrder_E1304_REF.00_01_29_06.Still001.png',
    'SAISON 11/PNG/Ep01_LawOrder_E1304_REF.00_07_24_08.Still002.png',
  ], 11, mapping);
  assert.equal(result.length, 2);
  assert.ok(result[0].relative.includes('/PNG/'));
  assert.ok(result.every((image) => image.episode === 1));
});

test('les captures du crossover restent séparées de Police judiciaire', () => {
  assert.deepEqual(uniqueImages(['LawOrderTrialbyJury_E5716_REF.png'], 15, mapping), []);
  assert.deepEqual(uniqueImages(['Ep13BIS_HomicideLifeOntheStreets_A1Y49_REF.png'], 6, mapping), []);
  assert.deepEqual(uniqueImages(['Ep14_PART01_LawOrderSpecialVictimsUnit_E0918_REF.png'], 10, mapping), []);
});

test('chaque table de saison comprend 24 codes distincts', () => {
  for (const season of [11, 12, 13, 14, 15]) {
    const codes = mapping.seasons[season].orderedCodes;
    assert.equal(codes.length, 24);
    assert.equal(new Set(codes).size, 24);
  }
});
