// Renders fictional Israeli electricity bills to PNG, with planted anomalies,
// plus manifest.json holding the true values so extraction and detection can be checked.
// Usage: node testdata/make-bills.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'bills');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const RATE = 0.5425;        // ₪ per kWh before VAT
const FIXED = 29.9;         // fixed monthly charge
const DISCOUNT = 0.07;      // supplier discount on the energy component
const VAT = 0.18;
const r2 = (n) => Math.round(n * 100) / 100;

// month, kWh, and what (if anything) is deliberately wrong with it.
// October 2025 is left out on purpose: that is the "missing month".
// Values are tuned so that, per day, only the planted spike crosses the detection thresholds.
// August 2026 is not here: it is the photo-style bill uploaded live on stage (see make-photos.mjs).
const MONTHS = [
  { ym: '2025-08', kwh: 610 },
  { ym: '2025-09', kwh: 420 },
  { ym: '2025-11', kwh: 460 },
  { ym: '2025-12', kwh: 520, plant: 'total_mismatch' },
  { ym: '2026-01', kwh: 490 },
  { ym: '2026-02', kwh: 850, plant: 'usage_spike' },
  { ym: '2026-03', kwh: 400, plant: 'duplicate' },
  { ym: '2026-04', kwh: 470, plant: 'vat_mismatch' },
  { ym: '2026-05', kwh: 560 },
  { ym: '2026-06', kwh: 660 },
  { ym: '2026-07', kwh: 720, plant: 'rate_mismatch' },
];

function periodOf(ym) {
  const [y, m] = ym.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  const issue = new Date(Date.UTC(y, m, 6));
  const iso = (d) => d.toISOString().slice(0, 10);
  return { periodStart: iso(start), periodEnd: iso(end), issueDate: iso(issue), days: end.getUTCDate() };
}

function billFor({ ym, kwh, plant }, i) {
  const p = periodOf(ym);
  const chargedRate = plant === 'rate_mismatch' ? 0.6125 : RATE;
  const energy = r2(kwh * chargedRate);
  const discount = -r2(energy * DISCOUNT);
  const subtotal = r2(energy + FIXED + discount);
  const vat = plant === 'vat_mismatch' ? r2(subtotal * VAT + 38.2) : r2(subtotal * VAT);
  const total = plant === 'total_mismatch' ? r2(subtotal + vat + 45) : r2(subtotal + vat);
  return {
    file: `bill-${ym}.png`,
    supplier: 'ניצוץ אנרגיה בע״מ',
    accountNumber: '7310-44829',
    billNumber: `NZ-${ym.replace('-', '')}-${String(1000 + i * 37)}`,
    ...p,
    kwh,
    ratePerKwh: RATE,               // the printed rate is always the regular one
    energyCharge: energy,
    fixedCharge: FIXED,
    otherCharges: [{ label: 'הנחת ספק 7% על רכיב האנרגיה', amount: discount }],
    subtotal,
    vatRate: VAT,
    vat,
    total,
    currency: 'ILS',
    planted: plant || null,
  };
}

const money = (n) => `₪${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dmy = (iso) => iso.split('-').reverse().join('/');

function html(b) {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700;800&display=block" rel="stylesheet">
<style>
  *{box-sizing:border-box} body{margin:0;background:#fff;font-family:Assistant,Arial,sans-serif;color:#1d2433;width:1000px}
  .page{padding:48px 56px}
  header{display:flex;justify-content:space-between;align-items:center;border-bottom:4px solid #f2a900;padding-bottom:18px}
  .brand{font-size:34px;font-weight:800;color:#0f3d6e} .brand small{display:block;font-size:15px;font-weight:600;color:#5b6b82}
  .spark{width:64px;height:64px;border-radius:16px;background:#0f3d6e;color:#f2a900;display:grid;place-items:center;font-size:40px;font-weight:800}
  h1{font-size:26px;margin:26px 0 6px} .sub{color:#5b6b82;font-size:16px}
  .meta{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:22px 0}
  .meta div{background:#f4f6fa;border-radius:10px;padding:12px 14px} .meta b{display:block;font-size:13px;color:#5b6b82;font-weight:600} .meta span{font-size:19px;font-weight:700}
  .ltr{direction:ltr;unicode-bidi:isolate}
  table{width:100%;border-collapse:collapse;font-size:18px;margin-top:8px}
  th{background:#0f3d6e;color:#fff;text-align:right;padding:10px 12px;font-weight:600}
  td{padding:11px 12px;border-bottom:1px solid #e3e8f0} td.n{text-align:left;direction:ltr}
  tr.sum td{font-weight:700;background:#f4f6fa} tr.total td{font-weight:800;font-size:22px;background:#fff4d6;border-bottom:none}
  .usage{display:flex;gap:16px;margin-top:22px} .usage div{flex:1;border:2px solid #e3e8f0;border-radius:12px;padding:14px}
  .usage b{font-size:14px;color:#5b6b82} .usage>div>span{display:block;font-size:30px;font-weight:800;color:#0f3d6e}
  footer{margin-top:28px;font-size:13px;color:#8391a7;border-top:1px solid #e3e8f0;padding-top:12px}
</style></head><body><div class="page">
<header><div class="brand">${b.supplier}<small>ספק חשמל פרטי · מספר עוסק 51-000000-0</small></div><div class="spark">⚡</div></header>
<h1>חשבונית חשמל</h1><div class="sub">לתקופה <span class="ltr">${dmy(b.periodStart)} – ${dmy(b.periodEnd)}</span> (${b.days} ימים)</div>
<div class="meta">
  <div><b>מספר חשבונית</b><span class="ltr">${b.billNumber}</span></div>
  <div><b>מספר חשבון לקוח</b><span class="ltr">${b.accountNumber}</span></div>
  <div><b>תאריך הפקה</b><span class="ltr">${dmy(b.issueDate)}</span></div>
</div>
<div class="usage">
  <div><b>צריכה בתקופה</b><span><span class="ltr">${b.kwh}</span> קוט״ש</span></div>
  <div><b>תעריף לקוט״ש (לפני מע״מ)</b><span class="ltr">₪${b.ratePerKwh.toFixed(4)}</span></div>
  <div><b>ממוצע יומי</b><span><span class="ltr">${(b.kwh / b.days).toFixed(1)}</span> קוט״ש</span></div>
</div>
<table>
  <tr><th>פירוט החיובים</th><th style="text-align:left">סכום</th></tr>
  <tr><td>צריכת חשמל (<span class="ltr">${b.kwh}</span> קוט״ש)</td><td class="n">${money(b.energyCharge)}</td></tr>
  <tr><td>תשלום קבוע</td><td class="n">${money(b.fixedCharge)}</td></tr>
  ${b.otherCharges.map((c) => `<tr><td>${c.label}</td><td class="n">${money(c.amount)}</td></tr>`).join('')}
  <tr class="sum"><td>סה״כ לפני מע״מ</td><td class="n">${money(b.subtotal)}</td></tr>
  <tr><td>מע״מ <span class="ltr">${Math.round(b.vatRate * 100)}%</span></td><td class="n">${money(b.vat)}</td></tr>
  <tr class="total"><td>סה״כ לתשלום</td><td class="n">${money(b.total)}</td></tr>
</table>
<footer>מסמך לדוגמה בלבד, נוצר לצורכי הדגמה. "ניצוץ אנרגיה" היא חברה בדויה.</footer>
</div></body></html>`;
}

function render(htmlPath, pngPath) {
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--virtual-time-budget=5000', '--window-size=1000,880',
    `--screenshot=${pngPath}`, `file:///${htmlPath.split(path.sep).join('/')}`,
  ], { stdio: 'ignore' });
}

fs.mkdirSync(OUT, { recursive: true });
const bills = MONTHS.map(billFor);
for (const b of bills) {
  const h = path.join(OUT, b.file.replace('.png', '.html'));
  fs.writeFileSync(h, html(b));
  render(h, path.join(OUT, b.file));
  fs.rmSync(h);
  console.log('rendered', b.file, b.planted ? `(planted: ${b.planted})` : '');
}
// The duplicate: byte-identical copy of April under another name.
fs.copyFileSync(path.join(OUT, 'bill-2026-03.png'), path.join(OUT, 'bill-2026-03-again.png'));

const manifest = {
  note: 'Ground truth for the rendered test bills. October 2025 is intentionally missing; bill-2026-03-again.png is a byte-identical duplicate.',
  expectedAnomalies: {
    gap: 'between 2025-09 and 2025-11',
    usage_spike: '2026-02',
    total_mismatch: '2025-12',
    vat_mismatch: '2026-04',
    rate_mismatch: '2026-07',
    duplicate: '2026-03 (bill-2026-03-again.png)',
  },
  bills,
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('done:', bills.length, 'bills + 1 duplicate');
