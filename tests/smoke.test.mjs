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
