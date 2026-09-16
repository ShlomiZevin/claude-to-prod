import { dateText, money, monthName, num, pct, SEVERITY, worstSeverity } from '../format.js';

export default function BillsTable({ bills, onSelect }) {
  const rows = [...bills].reverse();
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>כל החשבוניות</h2>
          <p className="muted">{bills.length} חשבוניות, מהחדשה לישנה</p>
        </div>
      </div>
      <div className="table-scroll">
        <table className="bills">
          <thead>
            <tr>
              <th>תקופה</th>
              <th className="n">קוט״ש</th>
              <th className="n opt">ליום</th>
              <th className="n opt">לעומת שנה שעברה</th>
              <th className="n">לתשלום</th>
              <th>מצב</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const e = b.extracted;
              const sev = worstSeverity(b.anomalies);
              return (
                <tr key={b.id} onClick={() => onSelect(b.id)} className={b.duplicate ? 'is-dup' : ''}>
                  <td>
                    <strong className="period-name">{monthName(e.periodStart)}</strong>
                    <span className="period-dates muted"><bdi>{dateText(e.periodStart)} – {dateText(e.periodEnd)}</bdi></span>
                  </td>
                  <td className="n">{num(e.kwh)}</td>
                  <td className="n opt">{num(b.dailyKwh, 1)}</td>
                  <td className="n opt">{b.yoyChange == null ? '—' : <bdi>{pct(b.yoyChange)}</bdi>}</td>
                  <td className="n">{money(e.total)}</td>
                  <td>
                    {sev ? (
                      <span className={`sev-badge sev-${sev}`}>
                        <i aria-hidden="true">{SEVERITY[sev].icon}</i>
                        {b.anomalies.length === 1 ? b.anomalies[0].title : `${b.anomalies.length} חריגות`}
                      </span>
                    ) : <span className="ok-badge">✓ תקין</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
