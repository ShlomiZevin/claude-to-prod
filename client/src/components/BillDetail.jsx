import { useEffect } from 'react';
import { imageUrl } from '../api.js';
import { dateText, money, monthName, num, SEVERITY } from '../format.js';

export default function BillDetail({ bill, onClose, onDelete }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const e = bill.extracted;
  const lines = [
    [`צריכת חשמל (${num(e.kwh)} קוט״ש × ₪${e.ratePerKwh ?? '—'})`, e.energyCharge],
    ['תשלום קבוע', e.fixedCharge],
    ...(e.otherCharges || []).map((c) => [c.label, c.amount]),
  ];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`חשבונית ${monthName(e.periodStart)}`} onClick={(ev) => ev.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <h2>חשבונית {monthName(e.periodStart)}</h2>
            <p className="muted">
              {e.supplier} · <bdi>{e.billNumber || 'ללא מספר'}</bdi> · <bdi>{dateText(e.periodStart)} – {dateText(e.periodEnd)}</bdi> ({bill.days} ימים)
            </p>
          </div>
          <button type="button" className="btn ghost" onClick={onClose} aria-label="סגירה">✕</button>
        </div>

        <div className="sheet-body">
          <div className="sheet-col">
            {bill.anomalies.length ? (
              <ul className="findings">
                {bill.anomalies.map((a) => (
                  <li key={a.type} className={`finding static sev-${a.severity}`}>
                    <span className="sev-badge"><i aria-hidden="true">{SEVERITY[a.severity].icon}</i>{SEVERITY[a.severity].label}</span>
                    <span className="finding-body"><strong>{a.title}</strong><span>{a.detail}</span></span>
                  </li>
                ))}
              </ul>
            ) : <p className="all-good">✓ לא נמצאו חריגות בחשבונית הזו</p>}

            <h3>מה קראנו מהחשבונית</h3>
            <table className="lines">
              <tbody>
                {lines.map(([label, amount]) => (
                  <tr key={label}><td>{label}</td><td className="n">{money(amount)}</td></tr>
                ))}
                <tr className="sum"><td>סה״כ לפני מע״מ</td><td className="n">{money(e.subtotal)}</td></tr>
                <tr><td>מע״מ {e.vatRate == null ? '' : `${Math.round(e.vatRate * 100)}%`}</td><td className="n">{money(e.vat)}</td></tr>
                <tr className="total"><td>סה״כ לתשלום</td><td className="n">{money(e.total)}</td></tr>
              </tbody>
            </table>
            {e.notes && <p className="muted small">הערת הקורא: {e.notes}</p>}
            <p className="muted small">
              נקרא ב-{((bill.extractMs || 0) / 1000).toFixed(1)} שניות · {bill.fileName}
            </p>
            <button type="button" className="btn danger" onClick={() => onDelete(bill.id)}>מחיקת החשבונית</button>
          </div>
          <a className="sheet-image" href={imageUrl(bill.id)} target="_blank" rel="noreferrer">
            <img src={imageUrl(bill.id)} alt="התמונה שהועלתה" />
          </a>
        </div>
      </div>
    </div>
  );
}
