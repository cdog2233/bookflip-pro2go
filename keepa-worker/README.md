# BookFlip Pro2Go — optional Keepa Worker

This optional Cloudflare Worker provides a secure server-side endpoint for Keepa research. It is not required for the core BookFlip app or its free Book Photo Scanner.

## What it does

- Accepts `POST /api/keepa/product` with `{"asin":"B000000000"}`.
- Requests Amazon.com history from Keepa's Product API with history enabled.
- Optionally requests up to 20 marketplace offers when `"includeOffers":true` is explicitly sent. This can consume additional Keepa tokens.
- Returns Keepa product JSON without returning the API key.
- Verifies the Cloudflare Access JWT signature, issuer, audience, and expiry using Cloudflare's published signing keys.
- Allows browser requests only from the configured BookFlip Pages origin.

The browser app's manual Keepa API JSON importer remains available without this backend. Keepa integration is optional and can involve subscription/API costs; the free Book Photo Scanner does not use this Worker.

## External requirements

1. A Cloudflare account and a Worker deployment target.
2. (Optional) A Keepa API subscription and API key with enough tokens for the requests you choose to make.
3. A Cloudflare Access application protecting the Worker hostname/path, with an allow policy for intended users.
4. A Cloudflare Access team domain and the Access application's audience tag.
5. Cloudflare rate limiting for `/api/keepa/product` before regular use.

Do not put Keepa API keys in browser JavaScript, localStorage, `wrangler.toml`, or a URL. Store the key only as an encrypted Cloudflare Worker secret.

## Deploy

From this directory:

```sh
npx wrangler login
npx wrangler secret put KEEPA_API_KEY
npx wrangler deploy
```

Add the non-secret Access settings under `[vars]` in `wrangler.toml`:

```toml
CF_ACCESS_TEAM_DOMAIN = "your-team.cloudflareaccess.com"
CF_ACCESS_AUD = "your-access-application-audience-tag"
```

Configure Cloudflare Access to protect the deployed Worker hostname and route. The Access JWT must be present in the `Cf-Access-Jwt-Assertion` request header. Confirm that your chosen hostname and Safari's cross-site cookie/privacy behavior support the login flow. A custom domain arrangement may be needed if third-party Access cookies are blocked.

Create a conservative Cloudflare rate-limiting rule for `/api/keepa/product`, and verify the Access policy before use. CORS is not authentication; the Worker independently verifies the Access JWT.

## Deploy from GitHub Actions

Add these repository settings under GitHub **Settings → Secrets and variables → Actions**:

**Repository secrets**
- `CLOUDFLARE_API_TOKEN`: Cloudflare API token scoped to the target account with permission to edit Workers Scripts.
- `CLOUDFLARE_ACCOUNT_ID`: target Cloudflare account ID.
- `KEEPA_API_KEY` (optional): Keepa API key; uploaded as an encrypted Worker secret if present.

**Repository variables**
- `CF_ACCESS_TEAM_DOMAIN`: Cloudflare Access team domain.
- `CF_ACCESS_AUD`: Access application's audience tag.

Then open **Actions → Deploy Keepa Worker → Run workflow**. The workflow is manual-only. If `KEEPA_API_KEY` is absent, the Keepa endpoint safely returns HTTP 503.

## Request contract

```http
POST /api/keepa/product
Content-Type: application/json
```

```json
{"asin":"B000000000"}
```

Offer retrieval is opt-in because it can cost additional tokens. Do not infer seller identities or fulfillment status from a simple offer count.

## Free Book Photo Scanner

The app's Photo Scanner runs OCR locally in the browser using the open-source Tesseract.js library. It does not call this Worker, OpenAI, or another paid AI API. The app can copy extracted text into a prepared prompt and open ChatGPT; the user attaches the original book photos there and uses whatever ChatGPT access/usage is available. ChatGPT may have usage limits, but there is no BookFlip API key or API billing requirement.

## Status

The Keepa Worker is optional. The free Photo Scanner is part of the GitHub Pages app and does not require a Worker deployment, Cloudflare Access, Keepa, or an OpenAI API key.
