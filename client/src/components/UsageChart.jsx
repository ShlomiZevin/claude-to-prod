import { useMemo, useState } from 'react';
import { money, money0, monthName, monthTick, num, SEVERITY, worstSeverity, yearOf } from '../format.js';

const W = 760;
const H = 300;
const M = { top: 34, right: 12, bottom: 44, left: 52 };

const METRICS = {
  daily: { label: 'צריכה יומית', unit: 'קוט״ש ליום', value: (b) => b.dailyKwh, fmt: (v) => num(v, 1), axis: (v) => num(v) },
  total: { label: 'סכום לתשלום', unit: '₪ לחשבון', value: (b) => b.extracted.total, fmt: money, axis: money0 },
};

const nextDay = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
// the month a slot stands for: the bill's period, or the first missing day of a gap
const slotIso = (s) => (s.bill ? s.bill.extracted.periodStart : nextDay(s.gap.from));

function niceMax(v) {
  const step = 10 ** Math.floor(Math.log10(v));
  return Math.ceil((v * 1.12) / step) * step;
}

// Rounded top corners only; the bar stays square on the baseline.
function barPath(x, y, w, h, r = 4) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export default function UsageChart({ bills, gaps, onSelect }) {
  const [metric, setMetric] = useState('daily');
  const [hover, setHover] = useState(null);
  const m = METRICS[metric];

  // One slot per comparable bill, with an empty slot wherever a month is missing.
  const slots = useMemo(() => {
    const out = [];
    for (const b of bills.filter((x) => x.comparable)) {
      for (const g of gaps.filter((x) => x.beforeBill === b.id)) out.push({ gap: g, key: `gap-${g.from}` });
      out.push({ bill: b, key: b.id });
    }
    return out;
  }, [bills, gaps]);

  if (!slots.length) return null;

  const values = slots.filter((s) => s.bill).map((s) => m.value(s.bill));
  const max = niceMax(Math.max(...values));
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const band = innerW / slots.length;
  const barW = Math.min(38, band * 0.62);
  const y = (v) => M.top + innerH - (v / max) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const lastBill = [...slots].reverse().find((s) => s.bill);
  const hovered = hover != null ? slots[hover] : null;

  return (
    <section className="card chart-card">
      <div className="card-head">
        <div>
          <h2>{m.label} לאורך זמן</h2>
          <p className="muted">{m.unit} · לחיצה על עמודה פותחת את החשבונית</p>
        </div>
        <div className="segmented" role="group" aria-label="מה להציג">
          {Object.entries(METRICS).map(([key, v]) => (
            <button key={key} type="button" aria-pressed={metric === key} onClick={() => setMetric(key)}>{v.label}</button>
          ))}
        </div>
      </div>

      <div className="chart-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="chart"
          dir="ltr"
          role="img"
          aria-label={`${m.label} ב-${values.length} חשבוניות. הפירוט המלא בטבלה למטה.`}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis' : 'grid'} />
              <text x={M.left - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">{m.axis(t)}</text>
            </g>
          ))}

          {slots.map((s, i) => {
            const cx = M.left + band * i + band / 2;
            const tickIso = slotIso(s);
            const showYear = i === 0 || yearOf(tickIso) !== yearOf(slotIso(slots[i - 1]));

            if (s.gap) {
              const gh = innerH * 0.35;
              return (
                <g key={s.key} onMouseEnter={() => setHover(i)}>
                  <rect x={cx - barW / 2} y={M.top + innerH - gh} width={barW} height={gh} rx="4" className="gap-bar" />
                  <text x={cx} y={M.top + innerH - gh - 8} className="gap-label" textAnchor="middle">חסר</text>
                  <text x={cx} y={H - M.bottom + 18} className="tick" textAnchor="middle">{monthTick(tickIso)}</text>
                  {showYear && <text x={cx} y={H - M.bottom + 34} className="tick year" textAnchor="middle">{yearOf(tickIso)}</text>}
                  <rect x={cx - band / 2} y={M.top} width={band} height={innerH} fill="transparent" />
                </g>
              );
            }

            const v = m.value(s.bill);
            const sev = worstSeverity(s.bill.anomalies);
            const top = y(v);
            return (
              <g
                key={s.key}
                className={`bar-group${hover === i ? ' is-hover' : ''}`}
                onMouseEnter={() => setHover(i)}
                onClick={() => onSelect(s.bill.id)}
              >
                <path d={barPath(cx - barW / 2, top, barW, M.top + innerH - top)} className="bar" />
                {sev && (
                  <g className={`marker sev-${sev}`} transform={`translate(${cx},${top - 14})`}>
                    <circle r="9" />
                    <text textAnchor="middle" dominantBaseline="central">{SEVERITY[sev].icon}</text>
                  </g>
                )}
                {s === lastBill && !sev && (
                  <text x={cx} y={top - 8} className="direct-label" textAnchor="middle">{m.fmt(v)}</text>
                )}
                <text x={cx} y={H - M.bottom + 18} className="tick" textAnchor="middle">{monthTick(tickIso)}</text>
                {showYear && <text x={cx} y={H - M.bottom + 34} className="tick year" textAnchor="middle">{yearOf(tickIso)}</text>}
                <rect x={cx - band / 2} y={M.top - 30} width={band} height={innerH + 30} fill="transparent" className="hit" />
              </g>
            );
          })}
        </svg>

        {hovered && (
          <div
            className="tooltip"
            style={{ left: `${((M.left + band * hover + band / 2) / W) * 100}%` }}
            role="status"
          >
            {hovered.gap ? (
              <>
                <strong>{monthName(slotIso(hovered))}: חשבונית חסרה</strong>
                <span>{hovered.gap.days} ימים ללא חשבונית</span>
              </>
            ) : (
              <>
                <strong>{monthName(hovered.bill.extracted.periodStart)}</strong>
                <span>{num(hovered.bill.dailyKwh, 1)} קוט״ש ליום · {num(hovered.bill.extracted.kwh)} בסה״כ</span>
                <span>לתשלום: {money(hovered.bill.extracted.total)}</span>
                {hovered.bill.anomalies.map((a) => (
                  <span key={a.type} className={`tip-flag sev-${a.severity}`}>
                    <i aria-hidden="true">{SEVERITY[a.severity].icon}</i>{a.title}
                  </span>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <div className="chart-key">
        <span><i className="key-dot sev-high">!</i> חריגה חמורה</span>
        <span><i className="key-dot sev-warning">?</i> כדאי לבדוק</span>
        <span><i className="key-gap" /> חשבונית חסרה</span>
      </div>
    </section>
  );
}
