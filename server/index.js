import express from 'express';
import { analyze } from './lib/anomalies.js';
import { extractBill } from './lib/extract.js';
import * as store from './lib/store.js';

const app = express();
app.use(express.json({ limit: '15mb' }));
const PORT = process.env.PORT || 8080;

// A bill still "processing" after this long lost its worker (instance restarted); show it as failed.
const STALE_MS = 3 * 60_000;

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'claude-to-prod-api' }));

// Reading a bill takes 5–10s per image, and Firebase Hosting cuts requests off at 60s,
// so uploads return at once and the image is read in the background. The client polls GET /api/bills.
// Deployed with --no-cpu-throttling so the instance keeps working after the response is sent.
async function processBill(bill, dataBase64) {
  const t0 = Date.now();
  try {
    const { bill: extracted, model } = await extractBill({ dataBase64, mimeType: bill.mimeType });
    if (!extracted.isElectricityBill) {
      await store.saveFailure(bill.id, 'התמונה לא נראית כמו חשבון חשמל');
      return;
    }
    await store.saveExtraction(bill.id, { bill: extracted, model, ms: Date.now() - t0 });
    console.log(JSON.stringify({ msg: 'bill read', id: bill.id, ms: Date.now() - t0 }));
  } catch (err) {
    console.error(JSON.stringify({ msg: 'bill read failed', id: bill.id, error: err.message }));
    await store.saveFailure(bill.id, 'לא הצלחנו לקרוא את החשבונית. נסו שוב או העלו תמונה ברורה יותר.').catch(() => {});
  }
}

app.post('/api/bills', async (req, res) => {
  const { fileName = 'bill', mimeType, dataBase64 } = req.body || {};
  if (!store.ACCEPTED_TYPES.includes(mimeType) || !dataBase64) {
    return res.status(400).json({ error: 'צריך להעלות תמונה (JPG, PNG או WEBP)' });
  }
  try {
    const bill = await store.createBill({ fileName, mimeType, buffer: Buffer.from(dataBase64, 'base64') });
    res.status(202).json({ id: bill.id, status: bill.status });
    processBill(bill, dataBase64);
  } catch (err) {
    console.error(JSON.stringify({ msg: 'upload failed', error: err.message }));
    res.status(500).json({ error: 'ההעלאה נכשלה' });
  }
});

app.get('/api/bills', async (req, res) => {
  try {
    const all = await store.listBills();
    const now = Date.now();
    for (const b of all) {
      if (b.status === 'processing' && now - Date.parse(b.createdAt) > STALE_MS) {
        b.status = 'failed';
        b.error = 'הקריאה נתקעה. נסו שוב.';
      }
    }
    const done = all.filter((b) => b.status === 'done');
    const pending = all
      .filter((b) => b.status !== 'done')
      .map(({ id, status, error, fileName, createdAt }) => ({ id, status, error, fileName, createdAt }));
    res.json({ ...analyze(done), pending });
  } catch (err) {
    console.error(JSON.stringify({ msg: 'list failed', error: err.message }));
    res.status(500).json({ error: 'טעינת החשבוניות נכשלה' });
  }
});

app.get('/api/bills/:id/image', async (req, res) => {
  const bill = await store.getBill(req.params.id);
  if (!bill) return res.status(404).end();
  const image = await store.readImage(bill.imagePath);
  res.set({ 'Content-Type': bill.mimeType, 'Cache-Control': 'private, max-age=3600' }).send(image);
});

app.post('/api/bills/:id/retry', async (req, res) => {
  const bill = await store.getBill(req.params.id);
  if (!bill) return res.status(404).json({ error: 'not found' });
  await store.markProcessing(bill.id);
  res.status(202).json({ id: bill.id, status: 'processing' });
  const image = await store.readImage(bill.imagePath);
  processBill(bill, image.toString('base64'));
});

app.delete('/api/bills/:id', async (req, res) => {
  const bill = await store.getBill(req.params.id);
  if (!bill) return res.status(404).json({ error: 'not found' });
  await store.deleteBill(bill);
  res.status(204).end();
});

app.listen(PORT, () => console.log(`listening on ${PORT}`));
