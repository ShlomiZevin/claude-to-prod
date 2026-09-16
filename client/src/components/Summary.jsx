import { money, money0, monthName, num } from '../format.js';

export default function Summary({ summary }) {
  return (
    <section className="tiles" aria-label="סיכום">
      <div className="tile">
        <span className="tile-label">חשבון אחרון</span>
        <span className="tile-value">{money(summary.lastTotal)}</span>
        <span className="tile-note">{monthName(summary.lastPeriodEnd)}</span>
      </div>
      <div className="tile">
        <span className="tile-label">ממוצע לחודש</span>
        <span className="tile-value">{money0(summary.avgMonthlyCost)}</span>
        <span className="tile-note">לפי {summary.billCount} חשבוניות</span>
      </div>
      <div className="tile">
        <span className="tile-label">צריכה יומית ממוצעת</span>
        <span className="tile-value">{num(summary.avgDailyKwh, 1)} <small>קוט״ש</small></span>
        <span className="tile-note">מנורמל לאורך התקופה</span>
      </div>
      <div className={`tile${summary.anomalyCount ? ' tile-alert' : ''}`}>
        <span className="tile-label">חריגות שנמצאו</span>
        <span className="tile-value">{summary.anomalyCount}</span>
        <span className="tile-note">
          {summary.possibleOvercharge > 0
            ? `כולל ${money(summary.possibleOvercharge)} שייתכן שחויבו ביותר`
            : `ב-${summary.billsWithAnomalies} חשבוניות`}
        </span>
      </div>
    </section>
  );
}
