// Checks the anomaly rules against the rendered test bills, whose true values
// and planted problems are recorded in testdata/bills/manifest.json.
// Run: npm test  (from server/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analyze } from '../lib/anomalies.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../../testdata/bills/manifest.json', import.meta.url)));

function items() {
  const list = manifest.bills.map((b, i) => ({
    id: b.file,
    createdAt: `2026-09-16T10:00:${String(i).padStart(2, '0')}Z`,
    fileHash: `hash-${b.file}`,
    extracted: b,
  }));
  // the byte-identical re-upload of March, uploaded last
  const march = list.find((it) => it.id === 'bill-2026-03.png');
  list.push({ ...march, id: 'bill-2026-03-again.png', createdAt: '2026-09-16T11:00:00Z' });
  return list;
}

const typesFor = (result, id) => result.bills.find((b) => b.id === id).anomalies.map((a) => a.type).sort();

test('flags exactly the planted problems and nothing else', () => {
  const result = analyze(items());
  const expected = {
    'bill-2025-08.png': [],
    'bill-2025-09.png': [],
    'bill-2025-11.png': ['gap'],
    'bill-2025-12.png': ['total_mismatch'],
    'bill-2026-01.png': [],
    'bill-2026-02.png': ['above_average', 'usage_spike'],
    'bill-2026-03.png': [],
    'bill-2026-03-again.png': ['duplicate'],
    // the extra ₪38.20 of VAT also makes April's cost jump while usage barely moved
    'bill-2026-04.png': ['cost_spike', 'vat_mismatch'],
    'bill-2026-05.png': [],
    'bill-2026-06.png': [],
    'bill-2026-07.png': ['rate_mismatch'],
  };
  for (const [id, types] of Object.entries(expected)) {
    assert.deepEqual(typesFor(result, id), types, id);
  }
});

test('usage spike in February is high severity', () => {
  const feb = analyze(items()).bills.find((b) => b.id === 'bill-2026-02.png');
  assert.equal(feb.anomalies.find((a) => a.type === 'usage_spike').severity, 'high');
});

test('reports the single missing month', () => {
  const { gaps } = analyze(items());
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].from, '2025-09-30');
  assert.equal(gaps[0].to, '2025-11-01');
  assert.equal(gaps[0].days, 31);
});

test('the duplicate is kept out of the comparisons', () => {
  const { summary } = analyze(items());
  assert.equal(summary.billCount, 11);
});

test('possible overcharge adds up the planted money errors', () => {
  const { summary } = analyze(items());
  // ₪45 on the total, ₪38.20 of VAT, and July's energy at 0.6125 instead of 0.5425 (720 kWh)
  assert.equal(summary.possibleOvercharge, 45 + 38.2 + 50.4);
});

test('a bill with unreadable fields is excluded from comparisons, not dropped', () => {
  const list = items();
  list[4] = { ...list[4], extracted: { ...list[4].extracted, kwh: null } };
  const result = analyze(list);
  const bill = result.bills.find((b) => b.id === list[4].id);
  assert.ok(bill.anomalies.some((a) => a.type === 'incomplete'));
  assert.equal(bill.comparable, false);
  assert.equal(result.summary.billCount, 10);
});
