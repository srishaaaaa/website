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
