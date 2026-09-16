// Uploads the rendered test bills to a running site, the same way the page does,
// waits until they are all read, and prints what the app found.
// Usage: node testdata/upload.mjs [baseUrl]   (default https://claude-to-prod.web.app)
//        add --photo to also upload the August photo (the live-demo bill)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith('http')) || 'https://claude-to-prod.web.app';
const withPhoto = args.includes('--photo');

const files = fs.readdirSync(path.join(HERE, 'bills')).filter((f) => f.endsWith('.png')).sort()
  .map((f) => path.join(HERE, 'bills', f));
if (withPhoto) files.push(path.join(HERE, 'photos', 'photo-2026-08-spike.jpg'));

async function upload(file) {
  const res = await fetch(`${BASE}/api/bills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: path.basename(file),
      mimeType: file.endsWith('.png') ? 'image/png' : 'image/jpeg',
      dataBase64: fs.readFileSync(file).toString('base64'),
    }),
  });
  if (res.status !== 202) throw new Error(`${path.basename(file)}: HTTP ${res.status} ${await res.text()}`);
}

const t0 = Date.now();
// the duplicate goes last, so it is the later upload
const ordered = [...files.filter((f) => !f.includes('again')), ...files.filter((f) => f.includes('again'))];
for (let i = 0; i < ordered.length; i += 4) await Promise.all(ordered.slice(i, i + 4).map(upload));
console.log(`uploaded ${ordered.length} files in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

let data;
for (;;) {
  data = await (await fetch(`${BASE}/api/bills`)).json();
  const busy = data.pending.filter((p) => p.status === 'processing').length;
  if (!busy) break;
  process.stdout.write(`  reading… ${busy} left\r`);
  await new Promise((r) => setTimeout(r, 3000));
}
console.log(`all read after ${((Date.now() - t0) / 1000).toFixed(1)}s                `);

for (const p of data.pending) console.log(`✗ ${p.fileName}: ${p.status} ${p.error || ''}`);
for (const b of data.bills) {
  const flags = b.anomalies.map((a) => a.type).join(', ') || 'ok';
  console.log(`${b.extracted.periodStart}  ${String(b.extracted.kwh).padStart(5)} kWh  ₪${String(b.extracted.total).padStart(7)}  ${b.fileName.padEnd(28)} ${flags}`);
}
console.log('summary:', data.summary);
