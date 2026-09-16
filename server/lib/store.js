// Firestore holds bill records; Cloud Storage holds the uploaded images (private bucket).
// On Cloud Run both clients pick up credentials automatically.
import crypto from 'node:crypto';
import { Firestore, FieldValue } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';

const db = new Firestore();
const bucket = new Storage().bucket(process.env.BILLS_BUCKET || 'claude-to-prod-bills');
const bills = db.collection('bills');

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const ACCEPTED_TYPES = Object.keys(EXT);

export async function createBill({ fileName, mimeType, buffer }) {
  const ref = bills.doc();
  const imagePath = `bills/${ref.id}.${EXT[mimeType]}`;
  await bucket.file(imagePath).save(buffer, { contentType: mimeType, resumable: false });
  const record = {
    status: 'processing',
    fileName,
    mimeType,
    size: buffer.length,
    fileHash: crypto.createHash('sha256').update(buffer).digest('hex'),
    imagePath,
    createdAt: new Date().toISOString(),
  };
  await ref.set(record);
  return { id: ref.id, ...record };
}

export async function listBills() {
  const snap = await bills.orderBy('createdAt').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getBill(id) {
  const doc = await bills.doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

export async function markProcessing(id) {
  await bills.doc(id).update({ status: 'processing', error: FieldValue.delete(), createdAt: new Date().toISOString() });
}

export async function saveExtraction(id, { bill, model, ms }) {
  await bills.doc(id).update({ status: 'done', extracted: bill, model, extractMs: ms, processedAt: new Date().toISOString() });
}

export async function saveFailure(id, error) {
  await bills.doc(id).update({ status: 'failed', error, processedAt: new Date().toISOString() });
}

export async function readImage(imagePath) {
  const [buffer] = await bucket.file(imagePath).download();
  return buffer;
}

export async function deleteBill(bill) {
  await bucket.file(bill.imagePath).delete({ ignoreNotFound: true });
  await bills.doc(bill.id).delete();
}
