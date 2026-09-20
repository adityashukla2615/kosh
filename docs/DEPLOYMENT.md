# Deployment guide

Four ways to run Kosh, from least to most setup.

## 1. Local (no cloud, no keys)

Needs Node 20+.

```bash
npm install
npm run dev:api      # http://localhost:8787
npm run dev:web      # http://localhost:5173 (proxies /api to 8787)
npm test
```

The advisor runs in offline mode. To use Claude locally, copy `.env.example` to `.env` and set either `ANTHROPIC_API_KEY`, or `USE_BEDROCK=1` + `AWS_REGION` with AWS credentials in your shell. `npm run dev:api` loads `.env` automatically. `GET /api/health` tells you which mode is active.

## 2. Docker (one container)

```bash
docker build -t kosh .
docker run -p 8787:8787 kosh
# with Claude:
docker run -p 8787:8787 -e ANTHROPIC_API_KEY=sk-ant-... kosh
```

Open http://localhost:8787 - Express serves both the API and the built app.

## 3. Hugging Face Spaces (what the live demo runs on)

A Space is a Docker host: it builds the `Dockerfile` at the repo root and routes traffic to
the port named in the Space README's YAML header. Free, no card, and it runs the same
container as section 2 - API and built web app on one origin.

The Space is a **mirror** of this repo, not a branch of it. A Space needs its config header
at the top of the root `README.md`, and this repo's README is written for GitHub, so
`scripts/deploy-hf.sh` copies the tracked files of `HEAD`, swaps in
[`deploy/hf/README.md`](../deploy/hf/README.md), and force-pushes that.

**One-time setup**

1. Create the Space at <https://huggingface.co/new-space> - SDK **Docker**, template **Blank**,
   visibility **Public**. Note the `<user>/<space>` name.
2. Create a write token at <https://huggingface.co/settings/tokens>.
3. In the Space, **Settings -> Variables and secrets**, add:
   - secret `ANTHROPIC_API_KEY` = your Claude API key
   - variable `LLM_PROVIDER` = `anthropic`

   Skip both to run the demo on the offline planner instead. Never commit the key - Space
   secrets are injected as environment variables at runtime.

**Deploy**

```bash
export HF_TOKEN=hf_...            # or omit it and let git prompt
npm run deploy:hf -- <user>/<space>
```

First build takes ~3-5 minutes (`npm ci` plus the Vite build). Watch it at
`https://huggingface.co/spaces/<user>/<space>?logs=build`. Re-run the same command after any
commit to redeploy.

**Check it**

```bash
curl -fsS https://<user>-<space>.hf.space/api/health
# {"ok":true,"llm":{"provider":"anthropic","model":"claude-opus-5"},"store":"memory",...}
```

`"store":"memory"` is expected: there is no DynamoDB here, so custom profiles live in the
container's memory and are lost on restart. The three sample households are code, not data,
so they always work.

Notes:

- `app_port: 8787` in the Space header must match the `PORT` the container listens on.
- A free Space sleeps after ~48 hours idle. Open it once before recording or presenting.
- The container runs as uid 1000 (`USER node`), which is what Spaces expects.

## 4. AWS (the architecture this was designed for)

`infra/template.yaml` is the production target and CI lints it on every push. The live
demo runs on a Space (section 3) because our AWS account was suspended during the build;
nothing in the app is AWS-specific - the store falls back to memory when `TABLE_NAME` is
unset, and the advisor takes either Bedrock or the Claude API.

### What gets created

One CloudFormation stack from `infra/template.yaml`:

- Lambda `kosh-api-<stage>` (Node 22, arm64, 1 GB, 120 s) with a Function URL
- DynamoDB table `kosh-<stage>` (on-demand, TTL on `expiresAt`)
- Private S3 bucket for the web build + CloudFront distribution (`/api/*` → Lambda, everything else → S3)
- Log group (14 days), X-Ray tracing, a CloudWatch alarm on Lambda errors

Cost at hackathon traffic is effectively zero apart from Bedrock tokens.

### Before you start

1. AWS CLI configured (`aws sts get-caller-identity` works) and [SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) installed.
2. **Bedrock model access**: in the Bedrock console, in the region you'll call it from (`BedrockRegion`, default `us-east-1`), enable access to the Claude model you plan to use. The default model id is `anthropic.claude-opus-5`; override with `BedrockModelId` if your account has a different one enabled.
   If access isn't approved yet, deploy with `LlmProvider=offline` - everything works, the advisor just uses the offline planner.
3. The IAM policy in the template grants `bedrock:InvokeModel*` and `bedrock-mantle:*`. If your org restricts Bedrock actions differently, adjust that statement.

### Deploy by hand

```bash
cd infra
sam build
sam deploy --guided          # first time: stack name e.g. kosh-demo, region e.g. ap-south-1, allow IAM role creation
```

Note the outputs: `SiteUrl`, `WebBucketName`, `DistributionId`.

Then the frontend:

```bash
cd ..
npm run build
aws s3 sync web/dist s3://<WebBucketName> --delete
aws cloudfront create-invalidation --distribution-id <DistributionId> --paths "/*"
```

Open `SiteUrl`. First load after creating the distribution can take a few minutes while CloudFront propagates.

Check it:

```bash
curl https://<SiteUrl>/api/health
# {"ok":true,"llm":{"provider":"bedrock","model":"anthropic.claude-opus-5"},"store":"dynamodb",...}
```

### Deploy from GitHub (CI/CD)

`.github/workflows/ci.yml` runs on every PR and push: install, 27 tests, web build, `sam validate --lint`.

`.github/workflows/deploy.yml` runs after CI succeeds on `main` (or manually): SAM build/deploy, web build, S3 sync with long-cache headers for hashed assets and no-cache for `index.html`, CloudFront invalidation, then a smoke test against `/api/health` and an overview call.

One-time setup:

1. Create an IAM OIDC identity provider for `token.actions.githubusercontent.com` (if your account doesn't have one).
2. Create a role that trusts it, scoped to your repo:
   ```json
   {
     "Effect": "Allow",
     "Principal": { "Federated": "arn:aws:iam::<ACCOUNT>:oidc-provider/token.actions.githubusercontent.com" },
     "Action": "sts:AssumeRoleWithWebIdentity",
     "Condition": {
       "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
       "StringLike": { "token.actions.githubusercontent.com:sub": "repo:<OWNER>/<REPO>:*" }
     }
   }
   ```
   Give it permissions for CloudFormation, Lambda, IAM (role creation for the function), DynamoDB, S3, CloudFront and CloudWatch. For a hackathon account, `PowerUserAccess` + `IAMFullAccess` is the pragmatic choice; tighten later.
3. In the repo: secret `AWS_DEPLOY_ROLE_ARN`, variable `DEPLOY_ENABLED=true` (the job is skipped without it); optional variables `AWS_REGION`, `BEDROCK_REGION`, `STAGE`.

### Tearing down

```bash
aws s3 rm s3://<WebBucketName> --recursive
sam delete --stack-name kosh-demo
```

## Configuration reference

| Variable | Where | Meaning |
|---|---|---|
| `LLM_PROVIDER` | api | `auto` (default), `anthropic`, `bedrock`, `offline` |
| `ANTHROPIC_API_KEY` | api | Claude API key (anthropic mode) |
| `KOSH_MODEL` | api | Claude API model id, default `claude-opus-5` |
| `USE_BEDROCK` | api | `1` to pick Bedrock in `auto` mode |
| `BEDROCK_MODEL_ID` | api | default `anthropic.claude-opus-5` |
| `KOSH_BEDROCK_REGION` / `AWS_REGION` | api | region for Bedrock calls |
| `TABLE_NAME` | api | DynamoDB table; unset = in-memory store |
| `STATIC_DIR` | api | serve a built web app from this folder (Docker) |
| `PORT` | api | default 8787; must match `app_port` in the Space header |
| `VITE_API_BASE` | web (build time) | API base URL if not same-origin `/api` |

## Troubleshooting

- **Advisor says "Couldn't reach the model"** - check `/api/health` for the provider, then CloudWatch logs for `[advisor]`. Usually model access not enabled in `BedrockRegion`, or a region/model-id mismatch. The app keeps working in offline mode meanwhile.
- **403 / blank page on CloudFront** - the web build isn't in the bucket yet, or the invalidation hasn't finished.
- **`sam build` fails on esbuild** - run `npm install` at the repo root first; esbuild is a dev dependency of `api`.
- **Slow first request** - Lambda cold start (~1 s), or a sleeping Space waking up. Hit `/api/health` once before a demo.
- **Space stuck on "Building"** - open the build logs; the usual cause is `npm ci` failing on a stale `package-lock.json`. Run `npm install` locally, commit the lockfile, redeploy.
- **Space serves a blank page but `/api/health` works** - the Vite build output did not land in `STATIC_DIR`. Both are set in the `Dockerfile` and should not need changing.
