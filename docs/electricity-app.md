# מבקר החשמל: electricity bill tracker (v0)

Live: https://claude-to-prod.web.app · owner unit: 🎤 Mainstage (`claude-to-prod-live`)

Upload photos of electricity bills; the app reads them, tracks them over time,
and flags usage spikes, billing math errors, duplicates and missing months.

## Architecture
```
React (client/) ──/api/**──▶ Firebase Hosting rewrite ──▶ Cloud Run "api" (server/, me-west1)
                                                           ├─ OpenAI gpt-5.6-sol vision → reads the bill
                                                           ├─ Firestore  bills/{id}     → record + extracted fields
                                                           └─ GCS gs://claude-to-prod-bills (private) → the image
```
- `server/lib/extract.js`: image → JSON (strict JSON schema).
- `server/lib/anomalies.js`: **pure** rules over the whole history, no I/O. Unit-tested.
- `server/lib/store.js`: Firestore + Storage.
- `GET /api/bills` recomputes anomalies over all bills on every call. That's cheap at this size,
  and a gap or duplicate can only be judged against the whole history anyway.

## Decisions
- **Upload returns 202 immediately; the image is read in the background; the client polls.**
  Hosting kills requests at 60s, and a batch of 12 bills takes about 16s of model time.
- **Cloud Run runs with `--no-cpu-throttling`.** Without it, CPU is throttled once the response
  is sent and background reads stall. Bills stuck in `processing` for more than 3 minutes are shown as failed, with a retry option.
- **The extractor transcribes and never corrects.** If it "fixed" a wrong VAT line, the anomaly would disappear.
  Verified: it copies the planted errors as printed.
- **Anomaly detection is fixed rules, not AI** (Shlomi's call for v0). Every flag names the exact numbers.
- **Usage is compared per day** (kWh / days), because billing periods differ in length.
- **One shared account, no login** (v0). Anyone with the link sees and edits the same history.
- **OpenAI key lives in Secret Manager** (`openai-api-key`), mounted as `OPENAI_API_KEY`.
- **Small images are uploaded byte-for-byte**, so re-uploading the same file hashes identically → duplicate.

## Rules (`THRESHOLDS` in anomalies.js)
| type | fires when | severity |
|---|---|---|
| usage_spike | daily kWh ≥ +25% vs previous bill (≥ +50% = high) | warning / high |
| cost_spike | daily ₪ ≥ +25% vs previous while usage didn't spike | warning / high |
| above_average | daily kWh ≥ 1.4× the average of the previous ≤6 bills (needs 3) | warning |
| yoy_spike | daily kWh ≥ +30% vs the same period last year (±20 days) | warning |
| sum_mismatch / vat_mismatch / total_mismatch / rate_mismatch | bill arithmetic off by more than ₪1 (rate: 1%) | high |
| vat_rate | printed VAT rate isn't 18% | warning |
| duplicate | same file hash, bill number, or account+period as an earlier upload | warning |
| gap | more than 3 days between one period's end and the next one's start | warning |
| incomplete | period, kWh or total unreadable → excluded from comparisons | warning |

Duplicates and incomplete bills are excluded from every comparison.

## Test data (`testdata/`)
- `make-bills.mjs` renders 11 fictional bills (Aug 2025 – Jul 2026, brand "ניצוץ אנרגיה", clearly marked as samples)
  plus a byte-identical duplicate. `bills/manifest.json` holds the true values and the planted problems:
  gap Oct 2025 · total +₪45 Dec 2025 · usage spike Feb 2026 · duplicate Mar 2026 · VAT +₪38.20 Apr 2026 · rate 0.6125 vs 0.5425 Jul 2026.
- `photos/photo-2026-08-spike.jpg`: a phone-style photo of the **August 2026 bill, the live-demo upload**
  (1,100 kWh → high spike, 1.7× average, +80% vs last August). Made with Leonardo gpt-image-2; every number checked.
- `upload.mjs [url] [--photo]` uploads the set through the real site and prints what was found.

## Verified (2026-09-16)
- `npm test` (server): 6/6. Detection flags exactly the planted problems and nothing else.
- `node test/extract-check.mjs`: rendered bills and the photo are read field-for-field correctly (5–9s each).
- Production: 12 uploads read in 15.7s, results identical to the manifest. Photo read in 6.3s with 3 correct flags.
- Phone width (390px): no horizontal overflow.

## Deploy
```bash
cd server && gcloud run deploy api --source . --project claude-to-prod --region me-west1 \
  --allow-unauthenticated --no-cpu-throttling --memory 1Gi --timeout 300 \
  --set-secrets OPENAI_API_KEY=openai-api-key:latest --set-env-vars BILLS_BUCKET=claude-to-prod-bills
cd client && npm run build && cd .. && firebase deploy --only hosting --project claude-to-prod
```
Reset demo data: open each bill → "מחיקת החשבונית", or `DELETE /api/bills/:id`.

## Gotchas
- Headless Chrome won't lay out narrower than ~504px even with `--window-size=400`. For phone screenshots,
  use DevTools `Emulation.setDeviceMetricsOverride`.
- The old `/api/hello` + `visits` collection from the hello-world are gone from the code; the `visits` docs remain in Firestore.
