# BookFlip Pro2Go — optional Keepa proxy

This Worker is an **optional backend foundation**, not a live integration. It keeps the Keepa API key on the server and requires a Cloudflare Access JWT before making a paid Keepa request.

## What it does

- Accepts `POST /api/keepa/product` with `{"asin":"B000000000"}`.
- Requests Amazon.com history from Keepa's Product API with history enabled.
- Optionally requests up to 20 marketplace offers when `"includeOffers":true` is explicitly sent. This can consume additional Keepa tokens.
- Returns the Keepa product JSON without returning the API key.
- Verifies the Cloudflare Access JWT signature, issuer, audience, and expiry using Cloudflare's published signing keys.
- Allows browser requests only from the configured BookFlip Pages origin.

The browser app does not call this Worker yet. Its manual Keepa API JSON file importer remains available without a backend.

## External requirements

1. A Cloudflare account and a Worker deployment target.
2. A Keepa API subscription and an API key with enough tokens for the requests you choose to make.
3. A Cloudflare Access application protecting the Worker hostname/path, with an allow policy for the intended user(s).
4. A Cloudflare Access team domain and the Access application's audience tag.
5. A Cloudflare rate-limiting rule for `/api/keepa/product` before enabling the endpoint for regular use. The Access policy and rate limit are essential because this endpoint spends the owner's Keepa tokens.

Do not put the Keepa key in GitHub, `wrangler.toml`, browser JavaScript, localStorage, or a URL shared with anyone.

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

Create a Cloudflare rate-limiting rule for the API route (for example, a conservative per-IP limit) and verify the Access policy before sharing the endpoint. CORS is not authentication; the Worker independently verifies the Access JWT.

## Deploy from GitHub Actions (phone-friendly)

After creating the Cloudflare Worker and Access application, add these repository settings under GitHub **Settings → Secrets and variables → Actions**:

**Repository secrets**
- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token scoped to the target account with permission to edit Workers Scripts.
- `CLOUDFLARE_ACCOUNT_ID`: the target Cloudflare account ID.
- `KEEPA_API_KEY` (optional until you have a Keepa subscription): the Keepa API key. The workflow sends it directly to Wrangler as an encrypted Worker secret; it is never written into the repository.

**Repository variables**
- `CF_ACCESS_TEAM_DOMAIN`: your Cloudflare Access team domain, such as `your-team.cloudflareaccess.com`.
- `CF_ACCESS_AUD`: the Access application's audience tag.

Then open **Actions → Deploy Keepa Worker → Run workflow**. The workflow is manual-only; ordinary app pushes do not attempt a Worker deployment. If the optional Keepa key is absent, the Worker can deploy but will return a clear 503 until the encrypted Worker secret is added. Configure the Access application and rate limit described above before allowing requests.

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
