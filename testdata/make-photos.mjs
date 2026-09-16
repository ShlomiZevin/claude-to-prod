// Generates phone-photo-style bills with Leonardo (gpt-image-2) for the live demo.
// Image models can garble Hebrew and digits, so every candidate is kept and checked
// by eye / by the extractor before being used.
// Usage: node testdata/make-photos.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'photos');
const ENV = Object.fromEntries(
  fs.readFileSync(path.join(HERE, '..', '.env'), 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const KEY = ENV.LEONARDO_API_KEY;
const auth = { Authorization: `Bearer ${KEY}`, accept: 'application/json' };

// August 2026: the bill that "just arrived". 1,100 kWh is a planted spike (+53%/day vs July).
const PHOTOS = [
  {
    name: 'photo-2026-08-spike',
    prompt: `A realistic smartphone photo of a printed A4 Hebrew electricity bill lying on a wooden kitchen table,
shot from slightly above at a small angle, soft daylight, a coffee mug partly in frame. The paper is flat and fully legible.
The bill is right-to-left Hebrew. Header: "ניצוץ אנרגיה בע״מ" in dark blue with a yellow lightning icon. Title: "חשבונית חשמל".
Clearly printed fields:
תקופה: 01/08/2026 – 31/08/2026 (31 ימים)
מספר חשבונית: NZ-202608-1407
מספר חשבון לקוח: 7310-44829
תאריך הפקה: 06/09/2026
צריכה בתקופה: 1100 קוט״ש
תעריף לקוט״ש (לפני מע״מ): ₪0.5425
Charges table:
צריכת חשמל (1100 קוט״ש) ₪596.75
תשלום קבוע ₪29.90
הנחת ספק 7% על רכיב האנרגיה ₪-41.77
סה״כ לפני מע״מ ₪584.88
מע״מ 18% ₪105.28
סה״כ לתשלום ₪690.16 (bold, highlighted)
All numbers must be printed exactly as written.`,
  },
];

async function generate(prompt) {
  const res = await fetch('https://cloud.leonardo.ai/api/rest/v2/generations', {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-2', public: false, parameters: { prompt } }),
  });
  const json = await res.json();
  const id = json?.generate?.generationId;
  if (!id) throw new Error(`create failed: ${JSON.stringify(json).slice(0, 300)}`);
  console.log('  generation', id, 'cost', json.generate.cost);
  return id;
}

async function waitFor(id) {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const res = await fetch(`https://cloud.leonardo.ai/api/rest/v1/generations/${id}`, { headers: auth });
    const gen = (await res.json()).generations_by_pk;
    if (gen?.status === 'COMPLETE') return gen.generated_images.map((g) => g.url);
    if (gen?.status === 'FAILED') throw new Error('generation failed');
  }
  throw new Error('timed out');
}

fs.mkdirSync(OUT, { recursive: true });
for (const p of PHOTOS) {
  console.log('generating', p.name);
  const urls = await waitFor(await generate(p.prompt));
  for (const [i, url] of urls.entries()) {
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    const file = path.join(OUT, `${p.name}-candidate-${i + 1}.jpg`);
    fs.writeFileSync(file, buf);
    console.log('  saved', path.basename(file), buf.length, 'bytes');
  }
}
