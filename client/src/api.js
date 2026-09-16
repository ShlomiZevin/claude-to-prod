// Talks to the server through the Hosting rewrite (/api/** -> Cloud Run), so no backend URL here.

async function request(path, options) {
  const res = await fetch(path, options);
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `שגיאה ${res.status}`);
  return body;
}

export const fetchBills = () => request('/api/bills');
export const deleteBill = (id) => request(`/api/bills/${id}`, { method: 'DELETE' });
export const retryBill = (id) => request(`/api/bills/${id}/retry`, { method: 'POST' });
export const imageUrl = (id) => `/api/bills/${id}/image`;

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_SIDE = 2400;

const readAsBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

// Small images go up untouched, so re-uploading the same file is recognised as a duplicate.
// Large phone photos are scaled down to keep the upload fast.
async function prepare(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (file.size <= MAX_BYTES && scale === 1) return { blob: file, mimeType: file.type };
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
  return { blob, mimeType: 'image/jpeg' };
}

export async function uploadBill(file) {
  const { blob, mimeType } = await prepare(file);
  return request('/api/bills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, mimeType, dataBase64: await readAsBase64(blob) }),
  });
}
