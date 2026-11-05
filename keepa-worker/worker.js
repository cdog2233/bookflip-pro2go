const json = (body, status = 200, origin = "") => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...(origin ? {
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true",
      "vary": "Origin"
    } : {})
  }
});

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function decodeJwtPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

let cachedJwks = null;
let cachedJwksAt = 0;

async function getJwks(teamDomain) {
  if (cachedJwks && Date.now() - cachedJwksAt < 10 * 60 * 1000) return cachedJwks;
  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error("Could not retrieve Access signing keys.");
  cachedJwks = await response.json();
  cachedJwksAt = Date.now();
  return cachedJwks;
}

async function verifyAccessJwt(token, env) {
  const rawTeamDomain = String(env.CF_ACCESS_TEAM_DOMAIN || "");
  const teamDomain = rawTeamDomain.replace("https://", "").replace("http://", "").split("/")[0];
  const audience = String(env.CF_ACCESS_AUD || "");
  if (!teamDomain || !audience) throw new Error("Cloudflare Access is not configured.");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid access token.");
  const header = decodeJwtPart(parts[0]);
  const claims = decodeJwtPart(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported access token.");
  const issuer = `https://${teamDomain}`;
  const now = Math.floor(Date.now() / 1000);
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== issuer || !aud.includes(audience) || !claims.exp || claims.exp <= now ||
      (claims.nbf && claims.nbf > now)) throw new Error("Access token is expired or not authorized.");
  const jwks = await getJwks(teamDomain);
  const jwk = (jwks.keys || []).find(key => key.kid === header.kid);
  if (!jwk) throw new Error("Access signing key was not found.");
  const key = await crypto.subtle.importKey("jwk", jwk, {
    name: "RSASSA-PKCS1-v1_5",
    hash: "SHA-256"
  }, false, ["verify"]);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeBase64Url(parts[2]),
    new TextEncoder().encode(parts[0] + "." + parts[1])
  );
  if (!valid) throw new Error("Access token signature is invalid.");
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = env.ALLOWED_ORIGIN || "https://cdog2233.github.io";
    if (origin !== allowedOrigin) return json({ error: "Origin not allowed." }, 403);

    const cors = {
      "access-control-allow-origin": allowedOrigin,
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Content-Type",
      "access-control-max-age": "600",
      "vary": "Origin"
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    const isBookAssistant = url.pathname === "/api/book-assistant";
    const isKeepa = url.pathname === "/api/keepa/product";
    if ((!isBookAssistant && !isKeepa) || request.method !== "POST") {
      return json({ error: "Not found." }, 404, allowedOrigin);
    }
    if (isBookAssistant && !env.OPENAI_API_KEY) {
      return json({ error: "The AI book assistant is not configured on the server yet." }, 503, allowedOrigin);
    }
    if (isKeepa && !env.KEEPA_API_KEY) {
      return json({ error: "Keepa API key is not configured on the server." }, 503, allowedOrigin);
    }
    const maxBody = isBookAssistant ? 5_500_000 : 2048;
    if (Number(request.headers.get("Content-Length") || 0) > maxBody) {
      return json({ error: "Request is too large." }, 413, allowedOrigin);
    }

    try {
      const accessToken = request.headers.get("Cf-Access-Jwt-Assertion");
      if (!accessToken) return json({ error: "Sign in through the protected Cloudflare Access application." }, 401, allowedOrigin);
      await verifyAccessJwt(accessToken, env);

      let body;
      try {
        const rawBody = await request.text();
        if (rawBody.length > maxBody) return json({ error: "Request is too large." }, 413, allowedOrigin);
        body = JSON.parse(rawBody);
      } catch { return json({ error: "Send a valid JSON request." }, 400, allowedOrigin); }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return json({ error: "Send a JSON object." }, 400, allowedOrigin);
      }

      if (isBookAssistant) {
        const question = String(body.question || "").trim().slice(0, 1200);
        const images = Array.isArray(body.images) ? body.images : [];
        const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
        if (!question) return json({ error: "Enter a question for the book assistant." }, 400, allowedOrigin);
        if (images.length > 4) return json({ error: "Use up to four book photos at a time." }, 400, allowedOrigin);
        const imagePattern = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
        if (images.some(image => typeof image !== "string" || image.length > 1_200_000 || !imagePattern.test(image))) {
          return json({ error: "One of the photos is invalid or too large. Use JPEG, PNG or WebP images under 1.2 MB each." }, 400, allowedOrigin);
        }
        const priorMessages = history.filter(item =>
          item && (item.role === "user" || item.role === "assistant") &&
          typeof item.content === "string" && item.content.trim()
        ).map(item => ({ role: item.role, content: item.content.slice(0, 1600) }));
        const content = [{ type: "input_text", text: question }];
        images.forEach(image_url => content.push({
          type: "input_image",
          image_url,
          detail: "high"
        }));
        const upstream = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "authorization": "Bearer " + env.OPENAI_API_KEY,
            "content-type": "application/json",
            "accept": "application/json"
          },
          body: JSON.stringify({
            model: env.OPENAI_MODEL || "gpt-6-astra",
            store: false,
            max_output_tokens: 1000,
            instructions: "You are BookFlip Pro2Go's careful Amazon book-sourcing assistant. Analyze the user's book photos and question. Read visible cover text, ISBNs and edition clues. Separate what is directly visible from what is inferred. Never invent an ISBN, ASIN, edition, Amazon price, sales rank, demand, eligibility, fees or profit. If a barcode or copyright page is unclear, say so and ask for a sharper photo of that area. Help distinguish hardcover, paperback, textbook, revised editions, international editions, instructor editions and other variants when evidence allows. Give practical next steps for matching the exact Amazon listing and checking condition and Seller Central eligibility. You may estimate only when clearly labeled as an estimate; do not claim to have checked live Amazon data. Keep advice concise and useful while sourcing in a store.",
            input: [
              ...priorMessages,
              { role: "user", content }
            ]
          })
        });
        if (!upstream.ok) {
          const status = upstream.status === 429 ? 429 : 502;
          return json({ error: upstream.status === 429
            ? "The AI service is busy or its usage limit has been reached. Try again later."
            : "The AI book analysis could not be completed. Check the server API configuration and try again." }, status, allowedOrigin);
        }
        const data = await upstream.json();
        const output = data.output_text || (Array.isArray(data.output)
          ? data.output.flatMap(item => Array.isArray(item.content) ? item.content : [])
              .filter(item => item.type === "output_text").map(item => item.text || "").join("\n")
          : "");
        if (!output) return json({ error: "The AI service returned no readable answer. Try a clearer photo or a shorter question." }, 502, allowedOrigin);
        return json({ answer: String(output).slice(0, 12000) }, 200, allowedOrigin);
      }

      if (Number(request.headers.get("Content-Length") || 0) > 2048) {
        return json({ error: "Request is too large." }, 413, allowedOrigin);
      }
      const asin = String(body.asin || "").trim().toUpperCase();
      if (!/^[A-Z0-9]{10}$/.test(asin)) return json({ error: "Enter a valid 10-character ASIN." }, 400, allowedOrigin);
      const includeOffers = body.includeOffers === true;
      const keepaUrl = new URL("https://api.keepa.com/product");
      keepaUrl.searchParams.set("key", env.KEEPA_API_KEY);
      keepaUrl.searchParams.set("domain", "1");
      keepaUrl.searchParams.set("asin", asin);
      keepaUrl.searchParams.set("history", "1");
      keepaUrl.searchParams.set("update", "1");
      if (includeOffers) keepaUrl.searchParams.set("offers", "20");

      const upstream = await fetch(keepaUrl.toString(), { headers: { "accept": "application/json" } });
      if (!upstream.ok) return json({ error: "Keepa could not complete the product request.", upstreamStatus: upstream.status }, 502, allowedOrigin);
      const data = await upstream.json();
      if (data.error) return json({ error: "Keepa returned an API error.", detail: String(data.error.message || data.error).slice(0, 240) }, 502, allowedOrigin);
      const product = Array.isArray(data.products) ? data.products.find(item => item.asin === asin) : null;
      if (!product) return json({ error: "Keepa returned no matching product." }, 404, allowedOrigin);
      return json({ products: [product], offersRequested: includeOffers }, 200, allowedOrigin);
    } catch (error) {
      const message = String(error && error.message || "");
      const status = /Access token|Sign in|not configured|not authorized|signature|signing key|Invalid access/i.test(message) ? 401 : 502;
      return json({ error: status === 401 ? message : "The request could not be completed." }, status, allowedOrigin);
    }
  }
};
