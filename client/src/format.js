const ils = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' });
const ils0 = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });
const month = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthShort = new Intl.DateTimeFormat('he-IL', { month: 'short', timeZone: 'UTC' });
const day = new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

const date = (iso) => new Date(`${iso}T00:00:00Z`);

export const money = (n) => (n == null ? '—' : ils.format(n));
export const money0 = (n) => (n == null ? '—' : ils0.format(n));
export const num = (n, digits = 0) => (n == null ? '—' : n.toLocaleString('he-IL', { maximumFractionDigits: digits }));
export const pct = (ratio) => `${ratio > 0 ? '+' : ''}${Math.round(ratio * 100)}%`;
export const dateText = (iso) => (iso ? day.format(date(iso)) : '—');
export const monthName = (iso) => (iso ? month.format(date(iso)) : '—');
export const monthTick = (iso) => monthShort.format(date(iso));
export const yearOf = (iso) => date(iso).getUTCFullYear();

export const SEVERITY = {
  high: { label: 'חמור', icon: '!' },
  warning: { label: 'לבדיקה', icon: '?' },
  info: { label: 'לידיעה', icon: 'i' },
};

export const worstSeverity = (anomalies) =>
  anomalies.find((a) => a.severity === 'high') ? 'high'
    : anomalies.find((a) => a.severity === 'warning') ? 'warning'
      : anomalies.length ? 'info' : null;
