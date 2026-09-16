import { monthName, SEVERITY } from '../format.js';

const RANK = { high: 0, warning: 1, info: 2 };

export default function Findings({ bills, onSelect }) {
  const items = bills
    .flatMap((b) => b.anomalies.map((a) => ({ ...a, bill: b })))
    .sort((x, y) => RANK[x.severity] - RANK[y.severity]
      || (y.bill.extracted.periodStart || '').localeCompare(x.bill.extracted.periodStart || ''));

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>מה מצאנו</h2>
          <p className="muted">{items.length ? 'החמורות קודם. לחיצה פותחת את החשבונית.' : 'לא נמצאו חריגות.'}</p>
        </div>
      </div>
      {items.length > 0 && (
        <ul className="findings findings-scroll">
          {items.map((a, i) => (
            <li key={`${a.bill.id}-${a.type}-${i}`}>
              <button type="button" className={`finding sev-${a.severity}`} onClick={() => onSelect(a.bill.id)}>
                <span className="sev-badge"><i aria-hidden="true">{SEVERITY[a.severity].icon}</i>{SEVERITY[a.severity].label}</span>
                <span className="finding-body">
                  <strong>{a.title} · {monthName(a.bill.extracted.periodStart)}</strong>
                  <span>{a.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
