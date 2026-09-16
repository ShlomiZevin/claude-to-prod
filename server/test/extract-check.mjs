// Live check of the extractor against the rendered bills' true values. Costs OpenAI calls.
// Run from server/: node test/extract-check.mjs [file ...]   (default: every rendered bill)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractBill } from '../lib/extract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('=');
  if (i > 0 && !process.env[line.slice(0, i)]) process.env[line.slice(0, i)] = line.slice(i + 1).trim();
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'testdata/bills/manifest.json'), 'utf8'));
const truth = Object.fromEntries(manifest.bills.map((b) => [b.file, b]));
// the photo continues the same account; its values are in make-photos.mjs
truth['photo-2026-08-spike.jpg'] = truth['photo-2026-08-spike-alt.jpg'] = {
  billNumber: 'NZ-202608-1407', periodStart: '2026-08-01', periodEnd: '2026-08-31', kwh: 1100,
  ratePerKwh: 0.5425, energyCharge: 596.75, fixedCharge: 29.9, subtotal: 584.88, vatRate: 0.18, vat: 105.28, total: 690.16,
};
const FIELDS = ['billNumber', 'periodStart', 'periodEnd', 'kwh', 'ratePerKwh', 'energyCharge', 'fixedCharge', 'subtotal', 'vatRate', 'vat', 'total'];

const files = process.argv.slice(2).length ? process.argv.slice(2) : manifest.bills.map((b) => b.file);
const results = await Promise.all(files.map(async (file) => {
  const full = file.startsWith('photo') ? path.join(ROOT, 'testdata/photos', file) : path.join(ROOT, 'testdata/bills', file);
  const t0 = Date.now();
  try {
    const { bill } = await extractBill({
      dataBase64: fs.readFileSync(full).toString('base64'),
      mimeType: file.endsWith('.png') ? 'image/png' : 'image/jpeg',
    });
    const wrong = FIELDS.filter((f) => bill[f] !== truth[file][f]).map((f) => `${f}: got ${bill[f]} want ${truth[file][f]}`);
    return { file, ms: Date.now() - t0, wrong };
  } catch (err) {
    return { file, ms: Date.now() - t0, wrong: [`ERROR ${err.message}`] };
  }
}));

let bad = 0;
for (const r of results) {
  if (r.wrong.length) bad++;
  console.log(`${r.wrong.length ? '✗' : '✓'} ${r.file} (${(r.ms / 1000).toFixed(1)}s)${r.wrong.length ? '\n    ' + r.wrong.join('\n    ') : ''}`);
}
console.log(`\n${results.length - bad}/${results.length} read exactly right`);
process.exitCode = bad ? 1 : 0;
