# Claude to Prod — live lecture build

Idea → Architecture → Build → Git → Cloud → Production, built live on stage.

## ⚠️ This repo is PUBLIC
Never commit secrets. `.env` is gitignored — keep it that way.
Keys live in `.env` locally and in Cloud Run env vars in production.
The client never holds an API key; all provider calls go through the server.

## Stack (defaults — see slide s14: "defaults are decisions too")
- Client: React + Vite → Firebase Hosting
- Server: Node (Express) → Cloud Run
- DB: Firestore Native, region `me-west1` (Tel Aviv) — already created. Cloud SQL only if the data model actually needs it.

## Cloud targets
- GCP / Firebase project: `claude-to-prod` (project number 466094823127)
- Hosting URL: https://claude-to-prod.web.app
- Cloud Run service: `api` in `me-west1` → https://api-ygzflpbkoa-zf.a.run.app
- Hosting rewrites `/api/**` → the Cloud Run service, so the client is same-origin
  (no CORS, no backend URL in client code). See firebase.json.
- Full path verified working end to end: Hosting → Cloud Run → Firestore.
- Billing account: Boostart.io `0105FF-52C389-C813D9`
- Do NOT touch `claude-to-prod-il` — that project serves the lecture deck.

## Commands
```bash
# client
npm run build && firebase deploy --only hosting --project claude-to-prod

# server
gcloud run deploy api --source . --project claude-to-prod --region me-west1 --allow-unauthenticated

# logs (slide s29 — let Claude see the failure)
gcloud run services logs read api --project claude-to-prod --region me-west1 --limit 50
```

## Providers
`OPENAI_API_KEY`, `LEONARDO_API_KEY`, `ANTHROPIC_API_KEY` — all verified working.
Claude orchestrates the others (slide s19): Claude writes the prompt → OpenAI/Leonardo execute → Claude assembles the result.

## How we work (slide s10a)
Conversation, not prompts. Explain context generously up front; save what worked
into markdown so it isn't re-explained next session.

## Verified provider details (tested 2026-09-16 — all working)

### OpenAI
- Text: `gpt-5.6-sol` (also available: gpt-5.6-luna, gpt-5.6-terra, gpt-5.5, gpt-5.4-*)
- Images: `gpt-image-2`, `gpt-image-2.5-flare`, `gpt-image-2.5-sunburst`
- ⚠️ Gotcha: use `max_completion_tokens`, NOT `max_tokens` (the old param is rejected).

### Leonardo — gpt-image-2 (⚠️ read before coding, these cost us time)
The API is split across two versions:
- **CREATE → v2**: `POST https://cloud.leonardo.ai/api/rest/v2/generations`
- **READ → v1**: `GET  https://cloud.leonardo.ai/api/rest/v1/generations/{id}`
  (there is no GET on v2 — it returns `Endpoint not found`)

Working request body:
```json
{ "model": "gpt-image-2", "public": false,
  "parameters": { "prompt": "..." } }
```
- `public` is **required** and must be a boolean, or you get `VALIDATION_ERROR`.
- `model` is rejected by the **v1** create endpoint — v2 only.
- Response is nested: `{"generate": {"generationId": "...", "cost": {...}}}`
- One call returns **4 images**; read them from `generations_by_pk.generated_images[].url`.

### Budget (checked before the lecture)
- Leonardo: **27,830 API credits** left. One gpt-image-2 batch of 4 = ~260 credits ≈ $0.39.
  That is ~100 more batches — far above the $10 needed. Check via `GET /api/rest/v1/me`.

### Proven reference implementation
`C:\workspace\aba\aba-boards\server\services\leonardo.js` (163 lines) is a working
Leonardo client already in use: v2 create + v1 poll, COMPLETE/FAILED handling,
reference-image upload. Lift from it rather than writing a client from scratch.

## Deploying (both halves)
```bash
# server
cd server && gcloud run deploy api --source . --project claude-to-prod   --region me-west1 --allow-unauthenticated

# client
cd client && npm run build && cd .. && firebase deploy --only hosting
```
Local runs need `gcloud auth application-default login` for Firestore.
Cloud Run does NOT — it injects credentials automatically, which is why
`new Firestore()` takes no arguments.

## Infra access audit (verified 2026-09-16)
IAM on `claude-to-prod`: **roles/owner** — full create/delete on everything.

Tested for real against Firestore, not assumed:
- Create collection + document, subcollection, read, patch, delete → all HTTP 200
- Queries: equality, range, orderBy + limit → all work
- Composite index created via gcloud → state READY (took ~7 min to build)

⚠️ **Composite-index gotcha, costs time if unknown:** a query combining
`where(a == x)` with `orderBy(b)` needs a composite index. The REST API returns
that error as `[{"error": {...FAILED_PRECONDITION...}}]` — an **array**, so naive
parsing reads it as "0 results" instead of an error. The message carries a
console link that creates the index. Building one takes minutes, so declare
indexes in `firestore.indexes.json` ahead of time rather than mid-demo.

### ElevenLabs (voice) — key copied, works, but scope-limited
- ✅ Text-to-speech works: returned a valid 51KB MP3 (`eleven_multilingual_v2`).
- ❌ The key lacks `user_read`, so `/v1/user`, `/v1/voices` and quota endpoints 401.
  Consequence: **we cannot list voices or check remaining characters** — hardcode a
  known voice id (e.g. `21m00Tcm4TlvDq8ikWAM`) and don't build a voice picker.
  If a voice picker is wanted, issue a new key with wider scope first.
