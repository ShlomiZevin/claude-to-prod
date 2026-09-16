import { useEffect, useState } from 'react';

// Same-origin: Firebase Hosting rewrites /api/** to the Cloud Run service,
// so there is no CORS and no hardcoded backend URL.
export default function App() {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    fetch('/api/hello')
      .then((r) => r.json())
      .then((data) => setState({ status: 'ok', data }))
      .catch((err) => setState({ status: 'error', error: String(err) }));
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem', lineHeight: 1.6 }}>
      <h1>Claude to Prod</h1>
      <p style={{ color: '#555' }}>React on Firebase Hosting → Node on Cloud Run → Firestore</p>

      {state.status === 'loading' && <p>Calling the API…</p>}

      {state.status === 'ok' && (
        <div style={{ background: '#f2f7ff', border: '1px solid #cfe0ff', borderRadius: 12, padding: '1.25rem' }}>
          <p style={{ margin: 0, fontSize: '1.2rem' }}>✅ {state.data.message}</p>
          <p style={{ margin: '.5rem 0 0', color: '#555' }}>
            Firestore visit count: <strong>{state.data.visits}</strong>
          </p>
        </div>
      )}

      {state.status === 'error' && (
        <p style={{ color: '#b00' }}>❌ {state.error}</p>
      )}
    </main>
  );
}
