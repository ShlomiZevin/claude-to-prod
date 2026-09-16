// Anomaly detection for a history of electricity bills.
// Pure functions: no I/O, so the rules can be tested against the known test bills.
//
// Usage is compared per day (kWh / days in period), because billing periods differ in length.
// Everything user-facing is Hebrew; every flag says exactly which numbers triggered it.

export const THRESHOLDS = {
  prevWarn: 0.25,       // daily usage or cost up 25%+ vs the previous bill
  prevHigh: 0.5,        // ...50%+ is high severity
  avgRatio: 1.4,        // daily usage 1.4x the average of recent bills
  avgWindow: 6,         // how many previous bills make the average
  avgMinBills: 3,       // don't judge against an average of fewer bills
  yoyWarn: 0.3,         // daily usage up 30%+ vs the same period last year
  money: 1,             // ₪ tolerance for rounding on the bill
  rateRel: 0.01,        // 1% tolerance on kWh x rate
  gapDays: 3,           // allowed days between one period's end and the next one's start
  vat: 0.18,            // Israeli VAT
};

const DAY = 86_400_000;
const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
const pct = (ratio) => Math.round(ratio * 100);
const ils = (n) => `₪${round2(n).toFixed(2)}`;
const dmy = (iso) => iso.split('-').reverse().join('/');
const toTime = (iso) => Date.parse(`${iso}T00:00:00Z`);
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

export function periodDays(b) {
  if (!b.periodStart || !b.periodEnd) return null;
  return Math.round((toTime(b.periodEnd) - toTime(b.periodStart)) / DAY) + 1;
}

const REQUIRED = {
  periodStart: 'תחילת תקופה', periodEnd: 'סוף תקופה', kwh: 'צריכה בקוט״ש', total: 'סכום לתשלום',
};

function mathChecks(b) {
  const out = [];
  const T = THRESHOLDS;
  const extras = (b.otherCharges || []).reduce((s, c) => s + (isNum(c.amount) ? c.amount : 0), 0);

  if (isNum(b.energyCharge) && isNum(b.fixedCharge) && isNum(b.subtotal)) {
    const sum = b.energyCharge + b.fixedCharge + extras;
    if (Math.abs(sum - b.subtotal) > T.money) {
      out.push({
        type: 'sum_mismatch', severity: 'high', title: 'סכום השורות לא מסתדר',
        detail: `צריכה + תשלום קבוע + חיובים נוספים = ${ils(sum)}, אבל בחשבונית "לפני מע״מ" כתוב ${ils(b.subtotal)}.`,
        amount: round2(b.subtotal - sum),
      });
    }
  }

  if (isNum(b.vatRate) && Math.abs(b.vatRate - T.vat) > 0.001) {
    out.push({
      type: 'vat_rate', severity: 'warning', title: 'שיעור מע״מ לא צפוי',
      detail: `בחשבונית מופיע מע״מ של ${pct(b.vatRate)}%, ובישראל השיעור הוא ${pct(T.vat)}%.`,
    });
  }

  if (isNum(b.subtotal) && isNum(b.vat)) {
    const expected = b.subtotal * T.vat;
    if (Math.abs(expected - b.vat) > T.money) {
      out.push({
        type: 'vat_mismatch', severity: 'high', title: 'חישוב מע״מ שגוי',
        detail: `מע״מ של ${pct(T.vat)}% על ${ils(b.subtotal)} צריך להיות ${ils(expected)}, אבל חויבת ${ils(b.vat)} (הפרש ${ils(b.vat - expected)}).`,
        amount: round2(b.vat - expected),
      });
    }
  }

  if (isNum(b.subtotal) && isNum(b.vat) && isNum(b.total)) {
    const expected = b.subtotal + b.vat;
    if (Math.abs(expected - b.total) > T.money) {
      out.push({
        type: 'total_mismatch', severity: 'high', title: 'הסכום לתשלום לא תואם',
        detail: `לפני מע״מ ${ils(b.subtotal)} + מע״מ ${ils(b.vat)} = ${ils(expected)}, אבל הסכום לתשלום הוא ${ils(b.total)} (הפרש ${ils(b.total - expected)}).`,
        amount: round2(b.total - expected),
      });
    }
  }

  if (isNum(b.kwh) && isNum(b.ratePerKwh) && isNum(b.energyCharge)) {
    const expected = b.kwh * b.ratePerKwh;
    const diff = b.energyCharge - expected;
    if (Math.abs(diff) > Math.max(T.money, expected * T.rateRel)) {
      out.push({
        type: 'rate_mismatch', severity: 'high', title: 'חיוב הצריכה לא תואם לתעריף',
        detail: `${b.kwh} קוט״ש × ₪${b.ratePerKwh} = ${ils(expected)}, אבל חויבת ${ils(b.energyCharge)} על הצריכה (הפרש ${ils(diff)}, תעריף בפועל ₪${(b.energyCharge / b.kwh).toFixed(4)}).`,
        amount: round2(diff),
      });
    }
  }
  return out;
}

// Later uploads of the same bill are duplicates of the earliest one.
function findDuplicates(items) {
  const seen = { hash: new Map(), number: new Map(), period: new Map() };
  const dupOf = new Map();
  const ordered = [...items].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  for (const it of ordered) {
    const b = it.extracted;
    const keys = [
      ['hash', it.fileHash, 'קובץ זהה'],
      ['number', b.billNumber, `אותו מספר חשבונית (${b.billNumber})`],
      ['period', b.periodStart && b.periodEnd && `${b.accountNumber || ''}|${b.periodStart}|${b.periodEnd}`, 'אותה תקופת חיוב'],
    ];
    const hit = keys.find(([k, v]) => v && seen[k].has(v));
    if (hit) {
      dupOf.set(it.id, { of: seen[hit[0]].get(hit[1]), reason: hit[2] });
      continue;
    }
    for (const [k, v] of keys) if (v) seen[k].set(v, it.id);
  }
  return dupOf;
}

/**
 * @param items [{ id, createdAt, fileHash, extracted: {...bill fields} }] — successfully read bills only
 * @returns { bills, gaps, summary } — bills sorted by period, each with metrics and anomalies
 */
export function analyze(items) {
  const T = THRESHOLDS;
  const dupOf = findDuplicates(items);

  const bills = items.map((it) => {
    const b = it.extracted;
    const days = periodDays(b);
    const anomalies = [];
    const missing = Object.entries(REQUIRED).filter(([k]) => b[k] == null).map(([, label]) => label);
    if (missing.length) {
      anomalies.push({
        type: 'incomplete', severity: 'warning', title: 'לא הצלחנו לקרוא את כל הפרטים',
        detail: `חסר: ${missing.join(', ')}. החשבונית לא נכללת בהשוואות.`,
      });
    }
    anomalies.push(...mathChecks(b));
    const dup = dupOf.get(it.id);
    if (dup) {
      anomalies.push({
        type: 'duplicate', severity: 'warning', title: 'חשבונית כפולה', duplicateOf: dup.of,
        detail: `החשבונית הזו כבר הועלתה (${dup.reason}). היא לא נכללת בגרף ובהשוואות.`,
      });
    }
    return {
      ...it,
      days,
      dailyKwh: days && isNum(b.kwh) ? b.kwh / days : null,
      dailyCost: days && isNum(b.total) ? b.total / days : null,
      duplicate: Boolean(dup),
      comparable: !dup && !missing.length && days > 0,
      anomalies,
    };
  }).sort((a, b) => (a.extracted.periodStart || '').localeCompare(b.extracted.periodStart || ''));

  // Comparisons across time only use comparable bills (no duplicates, nothing missing).
  const series = bills.filter((b) => b.comparable);
  const gaps = [];
  series.forEach((cur, i) => {
    const prev = series[i - 1];
    const e = cur.extracted;

    if (prev) {
      const gap = Math.round((toTime(e.periodStart) - toTime(prev.extracted.periodEnd)) / DAY) - 1;
      if (gap > T.gapDays) {
        const g = { from: prev.extracted.periodEnd, to: e.periodStart, days: gap, beforeBill: cur.id };
        gaps.push(g);
        cur.anomalies.push({
          type: 'gap', severity: 'warning', title: 'חסרה חשבונית',
          detail: `אין חשבונית בין ${dmy(g.from)} ל-${dmy(g.to)} (${gap} ימים). כדאי לבדוק שהיא לא אבדה או לא שולמה.`,
        });
      }

      const usage = cur.dailyKwh / prev.dailyKwh - 1;
      const cost = cur.dailyCost / prev.dailyCost - 1;
      if (usage >= T.prevWarn) {
        cur.anomalies.push({
          type: 'usage_spike', severity: usage >= T.prevHigh ? 'high' : 'warning', title: 'קפיצה בצריכה',
          detail: `הצריכה היומית עלתה ב-${pct(usage)}% לעומת החשבון הקודם (${round1(cur.dailyKwh)} לעומת ${round1(prev.dailyKwh)} קוט״ש ליום). ייתכן שמכשיר נשאר דלוק או שנוסף מכשיר צורך.`,
          change: round2(usage),
        });
      } else if (cost >= T.prevWarn) {
        cur.anomalies.push({
          type: 'cost_spike', severity: cost >= T.prevHigh ? 'high' : 'warning', title: 'קפיצה בעלות',
          detail: `העלות היומית עלתה ב-${pct(cost)}% לעומת החשבון הקודם, בזמן שהצריכה השתנתה רק ב-${pct(usage)}%. הפער מגיע מהחיוב עצמו, לא מהצריכה.`,
          change: round2(cost),
        });
      }
    }

    const window = series.slice(Math.max(0, i - T.avgWindow), i);
    if (window.length >= T.avgMinBills) {
      const avg = window.reduce((s, b) => s + b.dailyKwh, 0) / window.length;
      const ratio = cur.dailyKwh / avg;
      if (ratio >= T.avgRatio) {
        cur.anomalies.push({
          type: 'above_average', severity: 'warning', title: 'צריכה גבוהה מהממוצע',
          detail: `הצריכה היומית (${round1(cur.dailyKwh)} קוט״ש) גבוהה פי ${ratio.toFixed(1)} מהממוצע של ${window.length} החשבונות הקודמים (${round1(avg)} קוט״ש).`,
          change: round2(ratio - 1),
        });
      }
    }

    const mid = (toTime(e.periodStart) + toTime(e.periodEnd)) / 2;
    const lastYear = series.find((b) => {
      const m = (toTime(b.extracted.periodStart) + toTime(b.extracted.periodEnd)) / 2;
      return Math.abs(mid - m - 365 * DAY) <= 20 * DAY;
    });
    if (lastYear) {
      const yoy = cur.dailyKwh / lastYear.dailyKwh - 1;
      cur.yoyChange = round2(yoy);
      if (yoy >= T.yoyWarn) {
        cur.anomalies.push({
          type: 'yoy_spike', severity: 'warning', title: 'עלייה לעומת אשתקד',
          detail: `הצריכה היומית גבוהה ב-${pct(yoy)}% לעומת אותה תקופה בשנה שעברה (${round1(cur.dailyKwh)} לעומת ${round1(lastYear.dailyKwh)} קוט״ש ליום).`,
          change: round2(yoy),
        });
      }
    }
  });

  const rank = { high: 0, warning: 1, info: 2 };
  for (const b of bills) b.anomalies.sort((x, y) => rank[x.severity] - rank[y.severity]);

  const overcharged = bills
    .flatMap((b) => b.anomalies)
    .filter((a) => ['vat_mismatch', 'total_mismatch', 'rate_mismatch', 'sum_mismatch'].includes(a.type) && a.amount > 0)
    .reduce((s, a) => s + a.amount, 0);
  const last = series.at(-1);
  const recent = series.slice(-12);

  return {
    bills,
    gaps,
    summary: {
      billCount: series.length,
      anomalyCount: bills.reduce((s, b) => s + b.anomalies.length, 0),
      billsWithAnomalies: bills.filter((b) => b.anomalies.length).length,
      possibleOvercharge: round2(overcharged),
      lastTotal: last ? last.extracted.total : null,
      lastPeriodEnd: last ? last.extracted.periodEnd : null,
      avgMonthlyCost: recent.length ? round2(recent.reduce((s, b) => s + b.dailyCost, 0) / recent.length * 30.4) : null,
      avgDailyKwh: recent.length ? round1(recent.reduce((s, b) => s + b.dailyKwh, 0) / recent.length) : null,
    },
  };
}
