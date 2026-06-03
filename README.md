# AI Nonymauz Model Tester

A lightweight browser UI for testing a LiteLLM proxy or any OpenAI-compatible `/v1/chat/completions` endpoint.

It started from `ai_nonymauz_model_tester.html` and has been converted into a GitHub-ready Vite project.

## Features

- Test `/v1/chat/completions`
- Streaming and non-streaming mode
- Custom LiteLLM model aliases
- System prompt support
- Temperature and max token controls
- `/v1/models` loader
- Latency, model-used, and token stats
- Copy cURL for the latest request
- Local browser storage for tester settings

## Folder structure

```txt
ai-nonymauz-model-tester/
├─ index.html
├─ package.json
├─ vercel.json
├─ .env.example
├─ .gitignore
├─ README.md
├─ src/
│  ├─ main.js
│  └─ style.css
└─ .github/
   └─ workflows/
      └─ pages.yml
```

## Run locally

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal.

## Configure default LiteLLM URL

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Then edit:

```env
VITE_LITELLM_BASE_URL=https://ai-nonymauz-cloud.onrender.com
```

You can still override the Base URL in the UI.

## Push to GitHub

Create a new empty GitHub repo first, then run:

```bash
git init
git add .
git commit -m "Initial LiteLLM model tester"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/ai-nonymauz-model-tester.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

## Deploy to Vercel

Option 1: Import from GitHub in Vercel.

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`

Option 2: Deploy from terminal:

```bash
npm install -g vercel
vercel
```

## Deploy to GitHub Pages

This repo includes `.github/workflows/pages.yml`.

In GitHub:

1. Go to **Settings** → **Pages**
2. Under **Build and deployment**, choose **GitHub Actions**
3. Push to `main`

The workflow will build and publish the Vite app.

## LiteLLM CORS reminder

Because this UI runs in the browser, your LiteLLM proxy must allow browser requests from your local/dev/deployed origin. If you get a browser CORS error, configure your LiteLLM/proxy host to allow that origin.

Example local/test origins:

```txt
http://localhost:5173
https://your-vercel-app.vercel.app
https://YOUR_USERNAME.github.io
```

## Security note

Do not put your LiteLLM master key inside GitHub, `.env`, or public frontend code. This app stores the key only in your browser local storage when you enter it manually.

For public deployments, use a temporary limited key, a test-only key, or run this locally.
