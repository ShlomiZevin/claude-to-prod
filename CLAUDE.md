# Claude to Prod — live lecture build

Idea → Architecture → Build → Git → Cloud → Production, built live on stage.

## ⚠️ This repo is PUBLIC
Never commit secrets. `.env` is gitignored — keep it that way.
Keys live in `.env` locally and in Cloud Run env vars in production.
The client never holds an API key; all provider calls go through the server.

## Stack (defaults — see slide s14: "defaults are decisions too")
- Client: React + Vite → Firebase Hosting
- Server: Node (Express) → Cloud Run
- DB: Firestore (simple). Cloud SQL only if the data model actually needs it.

## Cloud targets
- GCP / Firebase project: `claude-to-prod` (project number 466094823127)
- Hosting URL: https://claude-to-prod.web.app
- Billing account: Boostart.io `0105FF-52C389-C813D9`
- Do NOT touch `claude-to-prod-il` — that project serves the lecture deck.

## Commands
```bash
# client
npm run build && firebase deploy --only hosting --project claude-to-prod

# server
gcloud run deploy api --source . --project claude-to-prod --region europe-west1 --allow-unauthenticated

# logs (slide s29 — let Claude see the failure)
gcloud run services logs read api --project claude-to-prod --region europe-west1 --limit 50
```

## Providers
`OPENAI_API_KEY`, `LEONARDO_API_KEY`, `ANTHROPIC_API_KEY` — all verified working.
Claude orchestrates the others (slide s19): Claude writes the prompt → OpenAI/Leonardo execute → Claude assembles the result.

## How we work (slide s10a)
Conversation, not prompts. Explain context generously up front; save what worked
into markdown so it isn't re-explained next session.
