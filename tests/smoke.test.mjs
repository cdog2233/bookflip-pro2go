import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const scriptStart = html.indexOf("<script>") + 8;
const scriptEnd = html.lastIndexOf("</script>");
assert.ok(scriptStart >= 8 && scriptEnd > scriptStart, "main application script exists");
const appScript = html.slice(scriptStart, scriptEnd);
assert.doesNotThrow(() => new Function(appScript), "main application JavaScript parses");

function section(start, end) {
  const a = appScript.indexOf(start);
  const b = appScript.indexOf(end, a);
  assert.notEqual(a, -1, "missing source section: " + start);
  assert.notEqual(b, -1, "missing source boundary: " + end);
  return appScript.slice(a, b);
}

const localDate = section("function historyLocalDate", "function historyBook");
const escape = section("function historyEsc", "function refreshHistoryBooks");
const chart = section("function historyChart", "function historyTrend");
const trend = section("function historyTrend", "function parseKeepaOfferSnapshot");
const offerParser = section("function parseKeepaOfferSnapshot", "function renderKeepaOfferPanel");
const offerPanel = section("function renderKeepaOfferPanel", "function renderHistory");
const csvParser = section("function parseHistoryCSV", "$('importHistory').onclick");
const keepaParser = section("function parseKeepaProductJSON", "$('importKeepaJson').onclick");

const helpers = new Function("historyLocalDate", "historyEsc", "money", [
  localDate, escape, chart, trend, offerParser, offerPanel, csvParser, keepaParser,
  "return { historyLocalDate, historyChart, historyTrend, parseHistoryCSV, parseKeepaProductJSON, parseKeepaOfferSnapshot, renderKeepaOfferPanel };"
].join("\n"))(
  undefined,
  value => String(value ?? "").replace(/[&<>"]/g, ""),
  value => "$" + Number(value || 0).toFixed(2)
);

test("normalized CSV round-trips quoted sources and zero used offers", () => {
  const csv = [
    "date,used_price,sales_rank,used_offers,source",
    '"2026-11-05","10.50","50000","0","Manual, ""verified"""'
  ].join("\n");
  const rows = helpers.parseHistoryCSV(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].price, 10.5);
  assert.equal(rows[0].rank, 50000);
  assert.equal(rows[0].offers, 0);
  assert.equal(rows[0].source, 'Manual, "verified"');
});

test("normalized CSV rejects malformed dates and negative numeric values", () => {
  assert.throws(() => helpers.parseHistoryCSV(["date,used_price", "11/05/2026,10"].join("\n")), /Invalid date/);
  assert.throws(() => helpers.parseHistoryCSV(["date,used_price", "2026-11-05,-1"].join("\n")), /Invalid number/);
});

test("history charts exclude missing values but retain a real zero offer count", () => {
  const chartHtml = helpers.historyChart("Used offer count", [
    { date: "2026-11-04", offers: null },
    { date: "2026-11-05", offers: 0 }
  ], "offers", "#5476c9");
  assert.match(chartHtml, /1 observations/);
  assert.match(chartHtml, /latest 0/);
});

test("sales-rank trend treats a lower rank as improved and uses only saved observations", () => {
  const trendHtml = helpers.historyTrend("Sales rank", [
    { date: "2026-11-04", rank: 50000 },
    { date: "2026-11-05", rank: 40000 }
  ], "rank", "rank");
  assert.match(trendHtml, /improved/);
  assert.match(trendHtml, /saved observations/);
});

test("Keepa API JSON converts USD cents and Keepa Time, skips unavailable values, and preserves zero offers", () => {
  const raw = { products: [{
    asin: "B000000000", domainId: 1,
    csv: [[], [], [100000, 1250], [100000, 50000], [], [], [], [], [], [], [], [], [100000, 3, 100120, 0]]
  }] };
  const rows = helpers.parseKeepaProductJSON(raw, "B000000000");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].price, 12.5);
  assert.equal(rows[0].rank, 50000);
  assert.equal(rows[0].offers, 3);
  assert.equal(rows[1].offers, 0);
  assert.equal(rows[0].date, new Date((100000 + 21564000) * 60000).toISOString().slice(0, 10));
});

test("Keepa import rejects mismatched or missing ASINs and non-US marketplace data", () => {
  assert.throws(() => helpers.parseKeepaProductJSON({ products: [{ domainId: 1, csv: [] }] }, "B000000000"), /No matching/);
  assert.throws(() => helpers.parseKeepaProductJSON({ products: [{ asin: "B111111111", domainId: 1, csv: [] }] }, "B000000000"), /No matching/);
  assert.throws(() => helpers.parseKeepaProductJSON({ products: [{ asin: "B000000000", domainId: 3, csv: [] }] }, "B000000000"), /Amazon.com/);
});

test("Keepa offers show only used conditions and distinguish live order from unconfirmed records", () => {
  const raw = { timestamp: 1753747260000, products: [{
    asin: "B000000000", domainId: 1, liveOffersOrder: [0, 1],
    offers: [
      { offerId: 1, sellerId: "USEDSELLER", lastSeen: 7665120, condition: 3, isFBA: true, offerCSV: [7665120, 2079, 0] },
      { offerId: 2, sellerId: "NEWSELLER", lastSeen: 7665120, condition: 1, isFBA: false, offerCSV: [7665120, 2849, 0] }
    ]
  }] };
  const snapshot = helpers.parseKeepaOfferSnapshot(raw, "B000000000");
  const panel = helpers.renderKeepaOfferPanel({ keepaOfferSnapshot: snapshot });
  assert.match(panel, /USEDSELLER/);
  assert.doesNotMatch(panel, /NEWSELLER/);
  assert.match(panel, /FBA/);
  assert.ok(panel.includes("$20.79"));
  assert.match(panel, /liveOffersOrder/);

  const old = helpers.parseKeepaOfferSnapshot({ products: [{
    asin: "B000000000", domainId: 1,
    offers: [{ sellerId: "OLDSELLER", condition: 4, isFBA: false, offerCSV: [1, 1000, 200] }]
  }] }, "B000000000");
  assert.match(helpers.renderKeepaOfferPanel({ keepaOfferSnapshot: old }), /current listing status unconfirmed/);
});

test("Keepa offer-only JSON can be imported without history arrays", () => {
  const rows = helpers.parseKeepaProductJSON({ products: [{
    asin: "B000000000", domainId: 1,
    offers: [{ sellerId: "SELLER", condition: 3 }]
  }] }, "B000000000");
  assert.deepEqual(rows, []);
});

test("editing a saved book preserves history and Keepa offers", () => {
  const saveHandler = appScript.slice(appScript.indexOf("$('saveBtn').onclick"), appScript.indexOf("$('clearBtn').onclick"));
  assert.ok(saveHandler.includes("history:old?"));
  assert.ok(saveHandler.includes("keepaOfferSnapshot:old?"));
  assert.ok(saveHandler.includes("id:old?old.id"));
});

test("secure Worker source parses and rejects bad origin, missing key, and missing Access JWT", async () => {
  const source = await readFile(new URL("../keepa-worker/worker.js", import.meta.url), "utf8");
  const factory = new Function("Response", "URL", "fetch", source.replace("export default {", "return {"));
  const worker = factory(Response, URL, fetch);
  const request = (origin, method = "POST", path = "/api/keepa/product", body = '{"asin":"B000000000"}') => ({
    method,
    url: "https://proxy.test" + path,
    headers: { get: name => ({
      Origin: origin,
      "Content-Length": String(body.length),
      "Cf-Access-Jwt-Assertion": null
    }[name] ?? null) },
    text: async () => body
  });
  assert.equal((await worker.fetch(request("https://evil.example"), {})).status, 403);
  assert.equal((await worker.fetch(request("https://cdog2233.github.io", "OPTIONS"), {})).status, 204);
  assert.equal((await worker.fetch(request("https://cdog2233.github.io"), {})).status, 503);
  assert.equal((await worker.fetch(request("https://cdog2233.github.io"), { KEEPA_API_KEY: "not-a-real-key" })).status, 401);
});

test("Keepa API key is declared as a server secret and local secret files are ignored", async () => {
  const config = await readFile(new URL("../keepa-worker/wrangler.toml", import.meta.url), "utf8");
  const ignore = await readFile(new URL("../keepa-worker/.gitignore", import.meta.url), "utf8");
  assert.match(config, /KEEPA_API_KEY/);
  assert.ok(ignore.includes(".dev.vars*"));
  assert.ok(ignore.includes(".env*"));
});


test("manual snapshots save, persist, and retain a zero used-offer count", () => {
  const handler = section("$('addSnapshot').onclick=", "function parseHistoryCSV");
  const elements = {
    addSnapshot: {}, snapPrice: { value: "" }, snapRank: { value: "12345" },
    snapOffers: { value: "0" }, snapDate: { value: "2026-11-05" },
    snapSource: { value: "Manual check" }, snapshotStatus: { textContent: "" }
  };
  const book = { id: "book-1", title: "Test book", history: [] };
  let persisted = 0;
  let refreshed = 0;
  const $ = id => elements[id];
  new Function("$", "historyBook", "persist", "refreshHistoryBooks", handler)(
    $, () => book, () => persisted++, () => refreshed++
  );
  elements.addSnapshot.onclick();
  assert.equal(book.history.length, 1);
  assert.equal(book.history[0].offers, 0);
  assert.equal(book.history[0].rank, 12345);
  assert.equal(book.history[0].source, "Manual check");
  assert.equal(persisted, 1);
  assert.equal(refreshed, 1);
});

test("deleting a history snapshot removes only the selected observation and persists", () => {
  const handler = section("window.deleteHistorySnapshot=", "$('historyBook').addEventListener");
  const records = [{ id: "book-1", history: [{ id: "a" }, { id: "b" }] }];
  const target = {};
  let persisted = 0;
  let refreshed = 0;
  const remove = new Function("records", "persist", "refreshHistoryBooks", "window", handler + "return window.deleteHistorySnapshot;")(
    records, () => persisted++, () => refreshed++, target
  );
  remove("book-1", "a");
  assert.deepEqual(records[0].history, [{ id: "b" }]);
  assert.equal(persisted, 1);
  assert.equal(refreshed, 1);
});

test("history CSV export keeps the normalized headers and quoted source values", () => {
  const handler = section("$('exportHistory').onclick=", "function init()");
  const elements = { exportHistory: {}, snapshotStatus: { textContent: "" } };
  const book = { asin: "B000000000", history: [{ date: "2026-11-05", price: 10, rank: null, offers: 0, source: 'Manual, "checked"' }] };
  let downloaded = null;
  new Function("$", "historyBook", "download", handler)(
    id => elements[id],
    () => book,
    (...args) => { downloaded = args; }
  );
  elements.exportHistory.onclick();
  assert.equal(downloaded[0], "BookFlip_history_B000000000.csv");
  assert.match(downloaded[1], /date,used_price,sales_rank,used_offers,source/);
  assert.match(downloaded[1], /"0","Manual, ""checked"""/);
});

test("FBA and FBM calculator scenarios use their separate fulfillment costs", () => {
  const source = section("function calc(){", "['price','fees','cost'");
  const elements = {
    price: { value: "30" }, cost: { value: "5" }, shipping: { value: "1" },
    other: { value: "1" }, fees: { value: "0" }, referralRate: { value: "15" },
    fbaFee: { value: "4" }, closingFee: { value: "0" }, fbmShip: { value: "7" },
    fulfillment: { value: "FBA" }, eligibility: { value: "yes" }, fba: { value: "yes" },
    net: {}, roi: {}, margin: {}, maxBuy: {}, breakEven: {}, fbaCompare: {}, fbmCompare: {},
    fbaFeesTotal: {}, fbmFeesTotal: {}, fbaMaxBuy: {}, fbmMaxBuy: {}, decision: {}
  };
  const $ = id => elements[id];
  const val = id => Number(elements[id].value) || 0;
  const money = value => "$" + Number(value).toFixed(2);
  const settings = { minProfit: 7, minRoi: 100 };
  const calc = new Function("val", "$", "money", "settings", source + "return calc;")(val, $, money, settings);
  const fba = calc();
  assert.equal(fba.net, 14.5);
  assert.equal(fba.status, "REVIEW");
  elements.fulfillment.value = "FBM";
  const fbm = calc();
  assert.equal(fbm.net, 11.5);
  assert.equal(fbm.status, "REVIEW");
  settings.minRoi = 50;
  assert.equal(calc().status, "BUY");
});

test("actual purchase and sale records preserve user-entered costs", () => {
  const purchaseHandler = section("window.markPurchased=", "window.removeRecord=");
  const purchaseRecords = [{ id: "book-1", cost: 5 }];
  const purchaseWindow = {};
  let purchaseSaves = 0;
  const mark = new Function("records", "persist", "window", "prompt", "alert", purchaseHandler + "return window.markPurchased;")(
    purchaseRecords, () => purchaseSaves++, purchaseWindow, () => "6.75", () => {}
  );
  mark("book-1");
  assert.equal(purchaseRecords[0].actualPurchaseCost, 6.75);
  assert.equal(purchaseRecords[0].stage, "PURCHASED");
  assert.equal(purchaseSaves, 1);

  const saleHandler = section("$('recordSale').onclick=", "$('saveSettings').onclick");
  const saleRecords = [{ id: "book-1", actualPurchaseCost: 6.75, shipping: 1, other: 1 }];
  const elements = {
    recordSale: {}, saleBook: { value: "book-1" }, salePrice: { value: "30" },
    saleFees: { value: "5" }, saleCosts: { value: "2" }, saleStatus: { textContent: "" }
  };
  let saleSaves = 0;
  new Function("$", "records", "val", "persist", saleHandler)(
    id => elements[id], saleRecords, id => Number(elements[id].value) || 0, () => saleSaves++
  );
  elements.recordSale.onclick();
  assert.equal(saleRecords[0].sale.profit, 14.25);
  assert.equal(saleRecords[0].stage, "SOLD");
  assert.equal(saleSaves, 1);
});

test("responsive layout, scanner, flashlight, metadata lookup, and backup controls remain present", () => {
  assert.ok(html.includes("@media(max-width:700px)"));
  assert.ok(html.includes(".tablewrap{overflow-x:auto}"));
  assert.match(html, /id="scanBtn"/);
  assert.match(appScript, /Html5Qrcode/);
  assert.match(appScript, /flashToggle/);
  assert.match(appScript, /googleBooks/);
  assert.match(appScript, /openLibrary/);
  assert.match(appScript, /amazonUrl/);
  assert.match(html, /id="backupBtn"/);
  assert.match(html, /id="restoreFile"/);
});


test("Keepa Worker verifies a signed Cloudflare Access JWT before requesting Keepa", async () => {
  const { webcrypto } = await import("node:crypto");
  const source = await readFile(new URL("../keepa-worker/worker.js", import.meta.url), "utf8");
  const factory = new Function("Response", "URL", "fetch", source.replace("export default {", "return {"));
  const calls = [];
  const privateKeys = await webcrypto.subtle.generateKey({
    name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"
  }, true, ["sign", "verify"]);
  const jwk = await webcrypto.subtle.exportKey("jwk", privateKeys.publicKey);
  jwk.kid = "test-key";
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "RS256", kid: "test-key", typ: "JWT" });
  const payload = encode({
    iss: "https://test.cloudflareaccess.com",
    aud: ["allowed-app-audience"],
    sub: "test-user",
    exp: Math.floor(Date.now() / 1000) + 300,
    nbf: Math.floor(Date.now() / 1000) - 30
  });
  const signed = header + "." + payload;
  const signature = Buffer.from(await webcrypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", privateKeys.privateKey, new TextEncoder().encode(signed)
  )).toString("base64url");
  const token = signed + "." + signature;
  const mockFetch = async url => {
    calls.push(String(url));
    if (String(url).includes("/cdn-cgi/access/certs")) {
      return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
    }
    return new Response(JSON.stringify({
      products: [{ asin: "B000000000", domainId: 1, csv: [[], [], [100000, 1250]] }]
    }), { status: 200 });
  };
  const worker = factory(Response, URL, mockFetch);
  const request = {
    method: "POST",
    url: "https://proxy.test/api/keepa/product",
    headers: { get: name => ({
      Origin: "https://cdog2233.github.io",
      "Content-Length": "22",
      "Cf-Access-Jwt-Assertion": token
    }[name] ?? null) },
    text: async () => '{"asin":"B000000000"}'
  };
  const response = await worker.fetch(request, {
    ALLOWED_ORIGIN: "https://cdog2233.github.io",
    KEEPA_API_KEY: "server-only-secret",
    CF_ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
    CF_ACCESS_AUD: "allowed-app-audience"
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.products[0].asin, "B000000000");
  assert.equal(calls.length, 2);
  const upstreamUrl = new URL(calls[1]);
  assert.equal(upstreamUrl.searchParams.get("key"), "server-only-secret");
  assert.equal(upstreamUrl.searchParams.get("asin"), "B000000000");
  assert.equal(upstreamUrl.searchParams.get("domain"), "1");
  assert.equal(upstreamUrl.searchParams.get("history"), "1");
});

test("Keepa Worker requests offers only when explicitly enabled and never returns the API key", async () => {
  const { webcrypto } = await import("node:crypto");
  const source = await readFile(new URL("../keepa-worker/worker.js", import.meta.url), "utf8");
  const factory = new Function("Response", "URL", "fetch", source.replace("export default {", "return {"));
  const pair = await webcrypto.subtle.generateKey({
    name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"
  }, true, ["sign", "verify"]);
  const jwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  jwk.kid = "offers-key";
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const h = encode({ alg: "RS256", kid: "offers-key" });
  const p = encode({
    iss: "https://offers.cloudflareaccess.com", aud: "offers-audience",
    exp: Math.floor(Date.now() / 1000) + 300
  });
  const input = h + "." + p;
  const sig = Buffer.from(await webcrypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(input)
  )).toString("base64url");
  const token = input + "." + sig;
  const urls = [];
  const mockFetch = async url => {
    urls.push(String(url));
    if (String(url).includes("/cdn-cgi/access/certs")) return new Response(JSON.stringify({ keys: [jwk] }));
    return new Response(JSON.stringify({ products: [{ asin: "B000000000", domainId: 1 }] }));
  };
  const worker = factory(Response, URL, mockFetch);
  const request = {
    method: "POST", url: "https://proxy.test/api/keepa/product",
    headers: { get: name => ({
      Origin: "https://cdog2233.github.io",
      "Cf-Access-Jwt-Assertion": token,
      "Content-Length": "40"
    }[name] ?? null) },
    text: async () => '{"asin":"B000000000","includeOffers":true}'
  };
  const response = await worker.fetch(request, {
    ALLOWED_ORIGIN: "https://cdog2233.github.io",
    KEEPA_API_KEY: "private-secret",
    CF_ACCESS_TEAM_DOMAIN: "offers.cloudflareaccess.com",
    CF_ACCESS_AUD: "offers-audience"
  });
  assert.equal(response.status, 200);
  const upstream = new URL(urls[1]);
  assert.equal(upstream.searchParams.get("offers"), "20");
  const responseText = JSON.stringify(await response.json());
  assert.ok(!responseText.includes("private-secret"));
});


test("Keepa import requires a verified ASIN and skips duplicate dated snapshots", () => {
  const handler = section("$('importKeepaJson').onclick=", "$('exportHistory').onclick=");
  assert.match(handler, /verified 10-character ASIN/);
  assert.ok(handler.includes("file.size>20*1024*1024"));
  assert.ok(handler.includes("duplicates++"));
  assert.ok(handler.includes("old.date===p.date&&old.price===p.price&&old.rank===p.rank&&old.offers===p.offers&&old.source===p.source"));
  assert.ok(handler.includes("skipped '+duplicates+' duplicates"));
});
