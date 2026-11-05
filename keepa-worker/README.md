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
