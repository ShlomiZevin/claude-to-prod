import { useCallback, useEffect, useState } from 'react';
import * as api from './api.js';
import BillDetail from './components/BillDetail.jsx';
import BillsTable from './components/BillsTable.jsx';
import Findings from './components/Findings.jsx';
import Summary from './components/Summary.jsx';
import Upload from './components/Upload.jsx';
import UsageChart from './components/UsageChart.jsx';

const POLL_MS = 2500;
const PARALLEL_UPLOADS = 3;

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(0);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await api.fetchBills());
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Bills are read in the background; keep refreshing while any are still being read.
  const processing = data?.pending.filter((p) => p.status === 'processing').length || 0;
  useEffect(() => {
    if (!processing && !uploading) return undefined;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [processing, uploading, load]);

  const upload = async (files) => {
    setUploading((n) => n + files.length);
    const queue = [...files];
    const failures = [];
    const worker = async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        try {
          await api.uploadBill(f);
        } catch (err) {
          failures.push(`${f.name}: ${err.message}`);
        } finally {
          setUploading((n) => n - 1);
          load();
        }
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_UPLOADS }, worker));
    if (failures.length) setError(failures.join(' · '));
  };

  const remove = async (id) => {
    setSelected(null);
    await api.deleteBill(id).catch((err) => setError(err.message));
    load();
  };

  const retry = async (id) => {
    await api.retryBill(id).catch((err) => setError(err.message));
    load();
  };

  const bills = data?.bills || [];
  const selectedBill = bills.find((b) => b.id === selected);

  return (
    <div className="page">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden="true">⚡</span>
          <div>
            <h1>מבקר החשמל</h1>
            <p className="muted">מעלים חשבוניות, ורואים איפה הצריכה קפצה ואיפה החיוב לא מסתדר</p>
          </div>
        </div>
      </header>

      <Upload onFiles={upload} busy={uploading > 0} />

      {error && <div className="banner error" role="alert">{error}</div>}

      {(uploading > 0 || data?.pending.length > 0) && (
        <section className="pending" aria-live="polite">
          {uploading > 0 && <div className="pending-item"><span className="spinner" /> מעלה {uploading} קבצים…</div>}
          {data?.pending.map((p) => (
            <div key={p.id} className={`pending-item ${p.status}`}>
              {p.status === 'processing' ? <span className="spinner" /> : <span className="fail-dot">!</span>}
              <bdi>{p.fileName}</bdi>
              <span className="muted">{p.status === 'processing' ? 'קורא את החשבונית…' : p.error}</span>
              {p.status === 'failed' && (
                <span className="pending-actions">
                  <button type="button" className="btn small" onClick={() => retry(p.id)}>לנסות שוב</button>
                  <button type="button" className="btn small ghost" onClick={() => remove(p.id)}>הסרה</button>
                </span>
              )}
            </div>
          ))}
        </section>
      )}

      {!data && !error && <p className="muted center">טוען…</p>}

      {data && bills.length === 0 && !data.pending.length && (
        <div className="empty">
          <h2>עוד אין חשבוניות</h2>
          <p>העלו כמה חשבונות חשמל, רצוי כמה חודשים ברצף, כדי שנוכל להשוות ביניהם.</p>
        </div>
      )}

      {bills.length > 0 && (
        <>
          <Summary summary={data.summary} />
          <div className="grid">
            <UsageChart bills={bills} gaps={data.gaps} onSelect={setSelected} />
            <Findings bills={bills} onSelect={setSelected} />
          </div>
          <BillsTable bills={bills} onSelect={setSelected} />
        </>
      )}

      <footer className="foot muted small">
        גרסה 0 · נבנה בהרצאה "מקלוד לפרוד" · הבדיקות הן כללים קבועים: השוואת צריכה יומית לחשבון הקודם, לממוצע ולשנה שעברה, ובדיקת החשבון עצמו
      </footer>

      {selectedBill && <BillDetail bill={selectedBill} onClose={() => setSelected(null)} onDelete={remove} />}
    </div>
  );
}
