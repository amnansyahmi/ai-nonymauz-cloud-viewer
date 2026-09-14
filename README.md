# AI Nonymauz Console v3

A browser console for the current [`ai-nonymauz-cloud`](https://github.com/amnansyahmi/ai-nonymauz-cloud) backend.

This is no longer just a hard-coded model tester. The console reads backend capabilities dynamically and provides five focused tools:

- **Chat** — streaming chat with Markdown, stop/regenerate, RAG/tool controls, sources, and live runtime metadata.
- **Diagnostics** — backend health, memory, RAG state, model aliases, profiles, knowledge files, and image status.
- **RAG Inspector** — direct `/rag/search` testing without spending LLM tokens.
- **Benchmark** — run one prompt against up to four live model aliases and compare latency/tokens/answers.
- **Image Lab** — image status, generation, quota visibility, preview, and download.

## Stack

- React 19.3
- Vite 8.3
- TypeScript 7
- Vitest 5
- `react-markdown` + GFM rendering

Dependencies are pinned to exact versions rather than `latest` so a future install does not silently change the application.

## Local development

```bash
npm install
npm run dev
```

The first install will create `package-lock.json`. Commit that lockfile after installing so subsequent CI/Vercel builds are fully reproducible.

## Configuration

Copy `.env.example` to `.env.local` if you want a different default backend:

```env
VITE_BACKEND_URL=https://ai-nonymauz-cloud.onrender.com
```

### API key safety

Do **not** put `LITELLM_MASTER_KEY` in a `VITE_*` environment variable. Vite variables are compiled into public browser JavaScript.

Enter the bearer key in **Connection** inside the console instead. By default it is stored only for the browser session. Enable **Remember key on this device** only on a trusted device if you want local persistent storage.

When the viewer is confirmed to be sending the key correctly, the backend can safely use:

```env
REQUIRE_AUTH=true
```

## Backend endpoints used

| Endpoint | Console use |
| --- | --- |
| `GET /health` | backend/RAG/memory state |
| `GET /v1/models` | dynamic model discovery |
| `GET /profiles` | live mode routing configuration |
| `GET /knowledge` | knowledge-file inventory |
| `GET /rag/search` | retrieval inspection |
| `POST /chat` | native streaming chat + AI Nonymauz metadata |
| `POST /v1/chat/completions` | OpenAI-compatible model benchmark |
| `GET /image/status` | image provider/quota status |
| `POST /image/generate` | image generation |

No model alias is hard-coded in the UI. Provider/model changes in the backend appear after reconnect/refresh.

## Scripts

```bash
npm run dev        # local Vite dev server
npm run build      # strict TypeScript check + production build
npm test           # Vitest suite
npm run preview    # serve the production build locally
```

## Vercel

Import the repository as a Vite project. `vercel.json` already points Vercel at `npm run build` and the `dist` output directory.

Set `VITE_BACKEND_URL` in Vercel only if the backend URL differs from the default. Never put the backend master key in Vercel as a `VITE_*` variable.

## Repository hygiene

Generated `dist/` output and old packaged ZIP artifacts should not be committed. The old parallel vanilla-JS tester has also been removed; `src/main.tsx` is now the single application entry point.
