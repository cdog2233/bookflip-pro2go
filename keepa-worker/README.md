# BookFlip Pro2Go — secure Keepa and AI book-photo Worker

This Worker provides secure server-side endpoints for optional Keepa research and the AI Book Photo Assistant. It keeps provider API keys on the server and requires a valid Cloudflare Access JWT before making a paid request. The photo feature will not work until this Worker is deployed, the OpenAI API key is configured, and the Worker endpoint is entered in the app.

## What it does

- Accepts `POST /api/keepa/product` with `{"asin":"B000000000"}`.
- Accepts `POST /api/book-assistant` with a question, up to four compressed book-photo data URLs, and a short text-only conversation history.
- Sends book images to OpenAI Responses API for visual reading and book-sourcing guidance; this Worker does not save photos or conversation data.
- Requests Amazon.com history from Keepa's Product API with history enabled.
- Optionally requests up to 20 marketplace offers when `"includeOffers":true` is explicitly sent. This can consume additional Keepa tokens.
- Returns the Keepa product JSON without returning the API key.
- Verifies the Cloudflare Access JWT signature, issuer, audience, and expiry using Cloudflare's published signing keys.
- Allows browser requests only from the configured BookFlip Pages origin.

The browser app does not call this Worker yet. Its manual Keepa API JSON file importer remains available without a backend.

## External requirements

1. A Cloudflare account and a Worker deployment target.
2. An OpenAI API account with billing enabled and an API key for image analysis. ChatGPT subscriptions do not include API credits.
3. (Optional) A Keepa API subscription and an API key with enough tokens for the requests you choose to make.
4. A Cloudflare Access application protecting the Worker hostname/path, with an allow policy for the intended user(s).
5. A Cloudflare Access team domain and the Access application's audience tag.
6. Cloudflare rate limiting for both `/api/book-assistant` and `/api/keepa/product` before regular use. The Access policy and rate limit are essential because this endpoint spends the owner's Keepa tokens.

Do not put OpenAI or Keepa API keys in browser JavaScript, localStorage, `wrangler.toml`, or a URL. Store them only as encrypted Cloudflare Worker secrets.

## Deploy

From this directory:

```sh
npx wrangler login
```

Edit `wrangler.toml` and add the non-secret Access settings under `[vars]`:

```toml
CF_ACCESS_TEAM_DOMAIN = "your-team.cloudflareaccess.com"
CF_ACCESS_AUD = "your-access-application-audience-tag"
```

Then set the Keepa key as an encrypted Worker secret and deploy:

```sh
npx wrangler secret put KEEPA_API_KEY
npx wrangler deploy
```

Configure Cloudflare Access to protect the deployed Worker hostname and route. The Access JWT must be present in the `Cf-Access-Jwt-Assertion` request header. Confirm that your chosen hostname and Safari's cross-site cookie/privacy behavior support the login flow. If not, use a custom domain arrangement that keeps the app and API under a compatible site boundary before connecting the browser UI.

Create conservative Cloudflare rate-limiting rules for `/api/book-assistant` and `/api/keepa/product`, and verify the Access policy before use. AI image requests incur OpenAI API charges; a ChatGPT plan does not pay for API usage. CORS is not authentication; the Worker independently verifies the Access JWT.

## Deploy from GitHub Actions (phone-friendly)

After creating the Cloudflare Worker and Access application, add these repository settings under GitHub **Settings → Secrets and variables → Actions**:

**Repository secrets**
- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token scoped to the target account with permission to edit Workers Scripts.
- `CLOUDFLARE_ACCOUNT_ID`: the target Cloudflare account ID.
- `OPENAI_API_KEY`: the OpenAI API key for image analysis. The workflow sends it directly to Wrangler as an encrypted Worker secret; it is never written into the repository.
- `KEEPA_API_KEY` (optional): the Keepa API key. The workflow sends it directly to Wrangler as an encrypted Worker secret; it is never written into the repository.

**Repository variables**
- `CF_ACCESS_TEAM_DOMAIN`: your Cloudflare Access team domain, such as `your-team.cloudflareaccess.com`.
- `CF_ACCESS_AUD`: the Access application's audience tag.

Then open **Actions → Deploy Keepa Worker → Run workflow**. The workflow is manual-only; ordinary app pushes do not attempt a Worker deployment. If `OPENAI_API_KEY` is absent, the photo assistant endpoint returns HTTP 503 until the encrypted Worker secret is added. If `KEEPA_API_KEY` is absent, the Keepa endpoint returns HTTP 503. Configure the Access application and rate limit described above before allowing requests.

## AI Book Photo Assistant request

`POST /api/book-assistant` accepts JSON with `question`, `images` (up to four JPEG, PNG or WebP base64 data URLs, each under 1.2 MB), and optional text-only `history` (up to eight messages). The Worker calls the OpenAI Responses API using `OPENAI_MODEL` (default `gpt-6-astra`) and returns `{ "answer": "..." }`. Photos are not stored by this Worker. OpenAI API data handling and billing terms still apply. The app keeps selected photos and conversation only in page memory; it does not save them in localStorage or backups.

The app's AI Photo Assistant tab has a per-device Worker endpoint field. Enter the deployed Worker base URL there. The browser calls `/api/book-assistant` with credentials included.

## Request contract

```http
POST /api/keepa/product
Content-Type: application/json
```

```json
{"asin":"B000000000"}
```

Optional offer retrieval:

```json
{"asin":"B000000000","includeOffers":true}
```

Offer retrieval is opt-in because it can cost additional tokens. The response includes the product's history arrays, including Keepa CSV history types, and marketplace offer details only when returned by Keepa. Do not infer seller identities or fulfillment status from a simple offer count.

## Status

Not deployed or connected to the public app. A Cloudflare account, Access configuration, Keepa subscription/key, and a tested endpoint are still required before this can be called live.

## Cloudflare Access and CORS notes

Access-protected cross-origin requests need a valid Access application cookie. Browsers send a preflight `OPTIONS` request for the JSON POST; Cloudflare Access blocks OPTIONS by default unless you configure the Access application's CORS settings. In Zero Trust > Access controls > Applications > your application > Advanced settings > Cross-Origin Resource Sharing, either bypass OPTIONS to the Worker origin (the Worker has a strict origin allowlist and returns the preflight headers) or configure Access to answer preflight with the matching headers.

The eventual browser request must include credentials. GitHub Pages and a separate Worker hostname are cross-site; Safari privacy controls may block third-party Access cookies. A custom domain arrangement that puts the app and API under a compatible same-site boundary may be required before the app can call this endpoint reliably. Test on the actual target iPhone Safari version before enabling it.

CORS is not authentication. Keep the Access JWT verification, restrict the Access allow policy, and configure a Cloudflare rate limit for the endpoint before use.
