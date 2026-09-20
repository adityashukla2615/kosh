# Deployment guide

Three ways to run Kosh, from least to most setup.

## 1. Local (no cloud, no keys)

Needs Node 20+.

```bash
npm install
npm run dev:api      # http://localhost:8787
npm run dev:web      # http://localhost:5173 (proxies /api to 8787)
npm test
```

The advisor runs in offline mode. To use Claude locally, copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`. `npm run dev:api` loads `.env` automatically, and `GET /api/health` reports which mode is active.

## 2. Docker (one container)

```bash
docker build -t kosh .
docker run -p 8787:8787 kosh
# with Claude:
docker run -p 8787:8787 -e ANTHROPIC_API_KEY=sk-ant-... kosh
```

Open http://localhost:8787 - Express serves both the API and the built app.

## 3. Render (what the live demo runs on)

Render runs the same container as section 2: Express serving the API and the built React app
on one origin. Free plan, no card. [`render.yaml`](../render.yaml) at the repo root is the
blueprint - it names the Dockerfile, the health check and the environment.

**Setup**

1. <https://render.com> -> sign in with GitHub -> **New** -> **Blueprint** -> pick this repo.
2. Render reads `render.yaml` and shows one service, `kosh`. Nothing to fill in.
3. **Apply**. First build takes ~5 minutes (`npm ci` plus the Vite build).

The blueprint sets `LLM_PROVIDER=offline`, so the deployed demo costs nothing to run: the
advisor answers through the offline planner, which calls the same tools and quotes the same
engine numbers in plainer wording. Every other feature - simulations, goals, what-if, next
best actions, the monthly review - is deterministic engine code and is identical either way.

**Putting Claude behind it later**

In the Render dashboard, **Environment** -> add secret `ANTHROPIC_API_KEY` (a key from
<https://console.anthropic.com>, prepaid credits, roughly $0.15 an advisor question and
$1 a monthly review on Opus) and change `LLM_PROVIDER` to `anthropic`. Render restarts the
service; no rebuild, no code change. Add `KOSH_MODEL=claude-sonnet-5` alongside it to cut
that bill by about 60%. Never put the key in git - `/api/health` will report
`"provider":"anthropic"` once it is live.

Every push to `main` redeploys (`autoDeployTrigger: commit`).

**Check it**

```bash
curl -fsS https://kosh.onrender.com/api/health
# {"ok":true,"llm":{"provider":"offline","model":null},"store":"memory",...}
```

`"store":"memory"` is expected: custom profiles live in the
container and are lost on restart. The three sample households are code, not data, so they
always work.

Notes:

- **A free service sleeps after 15 minutes idle** and takes ~50 s to wake. Open the site or
  curl `/api/health` a minute before demoing or recording. A free cron ping every 10 minutes
  keeps it warm if you'd rather not think about it.
- Free instances get 512 MB RAM. A 500-path simulation fits comfortably; if you raise
  `simulations` a long way past that, watch for restarts in the Render logs.
- The service name in `render.yaml` decides the URL (`kosh` -> `kosh.onrender.com`). Rename it
  there if that host is taken.

## Configuration reference

| Variable | Where | Meaning |
|---|---|---|
| `LLM_PROVIDER` | api | `auto` (default), `anthropic`, `offline` |
| `ANTHROPIC_API_KEY` | api | Claude API key (anthropic mode) |
| `KOSH_MODEL` | api | Claude API model id, default `claude-opus-5` |
| `STATIC_DIR` | api | serve a built web app from this folder (Docker) |
| `PORT` | api | default 8787; set in `render.yaml`, and must match `app_port` on a Space |
| `VITE_API_BASE` | web (build time) | API base URL if not same-origin `/api` |

## Troubleshooting

- **Advisor says "Couldn't reach the model"** - check `/api/health` for the provider, then the service logs for `[advisor]`. Usually a missing or rejected `ANTHROPIC_API_KEY`. The app keeps working in offline mode meanwhile.
- **Slow first request** - a sleeping free Render service waking up (~50 s). Hit `/api/health` once before a demo.
- **Build stuck or failing on the host** - open the build logs; the usual cause is `npm ci` failing on a stale `package-lock.json`. Run `npm install` locally, commit the lockfile, redeploy.
- **Blank page but `/api/health` works** - the Vite build output did not land in `STATIC_DIR`. Both are set in the `Dockerfile` and should not need changing.
