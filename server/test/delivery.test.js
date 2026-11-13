import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feeFor, haversineKm, DEFAULT_RULES } from '../lib/delivery.js';

const D = { ...DEFAULT_RULES, enabled: true, freeOver: 1500000, defaultFee: 9900, storePin: '600001', bands: [{ upToKm: 5, fee: 8000 }, { upToKm: 10, fee: 12000 }, { upToKm: 20, fee: 18000 }] };
const fee = (rules, km, sub = 500000, pin = '600028') => feeFor(rules, sub, pin, km)?.amount;

test('delivery fee follows distance bands, free threshold, order tiers and the max distance', () => {
  assert.equal(fee(D, 3), 8000);
  assert.equal(fee(D, 7), 12000);
  assert.equal(fee(D, 18), 18000);
  assert.equal(fee(D, 3, 1500000), 0, 'free over the threshold');
  assert.equal(fee({ ...D, perKmBeyond: 10000 }, 25), 18000 + 50000, 'per-km beyond the last band');
  assert.throws(() => feeFor({ ...D, maxKm: 30 }, 500000, '600028', 40), /do not deliver beyond 30 km/, 'out of range');
  assert.equal(fee({ ...D, orderTiers: [{ minOrder: 1000000, fee: 5000 }] }, 18, 1200000), 5000, 'a bigger order ships cheaper');
  assert.equal(fee(D, null), 8000, 'unknown distance uses the first band');
  assert.equal(feeFor({ ...D, enabled: false }, 500000, '600028', 3), null, 'switched off = the shipping method applies');
});

test('PIN zones override the bands, blocked prefixes are refused, no bands = the default fee', () => {
  assert.equal(fee({ ...D, zones: [{ name: 'Chennai', prefixes: ['600'], fee: 4000 }] }, 18), 4000);
  assert.throws(() => feeFor({ ...D, blockedPrefixes: ['194'] }, 500000, '194101', null), /do not deliver/);
  assert.equal(fee({ ...D, bands: [] }, 3), 9900);
});

test('haversine distance and the shipping note default', () => {
  const km = haversineKm({ lat: 13.0827, lng: 80.2707 }, { lat: 12.9716, lng: 77.5946 }); // Chennai - Bengaluru
  assert.ok(km > 280 && km < 300, String(km));
  assert.ok(DEFAULT_RULES.note.length > 10);
});

import { weightFee, regionFor } from '../lib/delivery.js';
const W = { ...DEFAULT_RULES, enabled: true, weightMode: true, freeOver: 1000000, weightRegions: [
  { name: 'Tamil Nadu', active: true, prefixes: ['6'], tiers: [{ minGrams: 0, maxGrams: 500, fee: 4000 }, { minGrams: 500, maxGrams: 2000, fee: 6000 }, { minGrams: 2000, maxGrams: null, fee: 9000 }] },
  { name: 'All India', active: true, prefixes: [], tiers: [{ minGrams: 0, maxGrams: 1000, fee: 8000 }, { minGrams: 1000, maxGrams: null, fee: 14000 }] },
  { name: 'Island', active: false, prefixes: ['744'], tiers: [] }] };

test('weight tiers: min inclusive, max exclusive, open-ended last tier, region by PIN prefix with an all-India default', () => {
  assert.equal(weightFee(W.weightRegions[0], 0), 4000);
  assert.equal(weightFee(W.weightRegions[0], 499), 4000);
  assert.equal(weightFee(W.weightRegions[0], 500), 6000, 'the boundary starts the next tier');
  assert.equal(weightFee(W.weightRegions[0], 5000), 9000, 'no upper limit');
  assert.equal(weightFee({ tiers: [] }, 900), 0, 'no tiers = free');
  assert.equal(regionFor(W, '600028').name, 'Tamil Nadu');
  assert.equal(regionFor(W, '110001').name, 'All India');
  assert.equal(regionFor(W, '744101').name, 'All India', 'an inactive region is ignored');
});

test('delivery by weight: bag weight, region, free-over and order tiers still apply', () => {
  assert.equal(feeFor(W, 500000, '600028', null, 1200).amount, 6000);
  assert.equal(feeFor(W, 500000, '110001', null, 1200).amount, 14000);
  assert.equal(feeFor(W, 1000000, '110001', null, 1200).amount, 0, 'free over the order value');
  assert.equal(feeFor({ ...W, orderTiers: [{ minOrder: 400000, fee: 3000 }] }, 500000, '110001', null, 1200).amount, 3000, 'a bigger order caps the fee');
  assert.equal(feeFor({ ...W, weightMode: false, bands: [{ upToKm: 5, fee: 8000 }] }, 500000, '600028', 3, 1200).amount, 8000, 'weight mode off = the distance rules, unchanged');
});
