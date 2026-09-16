import express from 'express';
import { Firestore } from '@google-cloud/firestore';

const app = express();
const db = new Firestore();          // on Cloud Run, credentials are injected automatically
const PORT = process.env.PORT || 8080;

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'claude-to-prod-api' });
});

// Proves the full path: Cloud Run -> Firestore -> back to the browser.
app.get('/api/hello', async (req, res) => {
  try {
    const doc = db.collection('visits').doc();
    await doc.set({ at: new Date().toISOString(), ua: req.get('user-agent') || '' });
    const total = (await db.collection('visits').count().get()).data().count;
    res.json({ message: 'Hello from Cloud Run + Firestore', visits: total, wrote: doc.id });
  } catch (err) {
    console.error('firestore failed', err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.listen(PORT, () => console.log(`listening on ${PORT}`));
