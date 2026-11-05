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
const offerPanel = section("function renderKeepaOfferPanel", "window.exportKeepaOffers=");
const csvParser = section("function parseHistoryCSV", "$('importHistory').onclick");
const keepaParser = section("function parseKeepaProductJSON", "$('importKeepaJson').onclick");
const salesSignalParser = section("function extractKeepaLastSalesSignal", "function scoutNormalizeMatch");

const helpers = new Function("historyLocalDate", "historyEsc", "money", [
  localDate, escape, chart, trend, offerParser, offerPanel, csvParser, keepaParser, salesSignalParser,
  "return { historyLocalDate, historyChart, historyTrend, parseHistoryCSV, parseKeepaProductJSON, parseKeepaOfferSnapshot, renderKeepaOfferPanel, extractKeepaLastSalesSignal };"
].join("\n"))(
  undefined,
  value => String(value ?? "").replace(/[&<>"]/g, ""),
  value => "$" + Number(value || 0).toFixed(2)
);

test("ISBN validation accepts valid ISBN-10 and ISBN-13 and rejects bad check digits", () => {
  const isbn = new Function(section("function isbnClean", "function calc") + "return { isbnClean, isbnValid };")();
  assert.equal(isbn.isbnClean("978-0-306-40615-7"), "9780306406157");
  assert.equal(isbn.isbnValid("978-0-306-40615-7"), true);
  assert.equal(isbn.isbnValid("0-306-40615-2"), true);
  assert.equal(isbn.isbnValid("9780306406158"), false);
  assert.equal(isbn.isbnValid("0306406153"), false);
  assert.equal(isbn.isbnValid("1234567890123"), false);
});

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

test("Free Book Photo Scanner uses local OCR and has no paid AI endpoint dependency", () => {
  assert.ok(html.includes('data-tab="photoai"'));
  assert.ok(html.includes('id="aiPhotoInput"'));
  assert.ok(html.includes('capture="environment"'));
  assert.ok(html.includes('id="scanBookPhotos"'));
  assert.ok(html.includes('id="askChatGPT"'));
  assert.ok(html.includes('tesseract.js@5'));
  assert.ok(appScript.includes('Tesseract.recognize'));
  assert.ok(appScript.includes('function findISBNInText'));
  assert.ok(appScript.includes('function makeBookPrompt'));
  assert.ok(appScript.includes('https://chatgpt.com/'));
  assert.ok(!appScript.includes('api/book-assistant'));
  assert.ok(!appScript.includes('OPENAI_API_KEY'));
  assert.ok(!appScript.includes('aiEndpoint'));
  assert.ok(!appScript.includes('localStorage.setItem(\'aiPhotos'));
});

test("Photo OCR accepts valid ISBNs and rejects bad check digits", () => {
  const isbnFns = new Function(section("function isbnClean", "function calc") + "return {isbnClean,isbnValid};")();
  const find = new Function("isbnClean", "isbnValid", section("function findISBNInText", "function makeBookPrompt") + "return findISBNInText;")(isbnFns.isbnClean, isbnFns.isbnValid);
  assert.equal(find("ISBN 978-0-306-40615-7"), "9780306406157");
  assert.equal(find("ISBN 0-306-40615-2"), "0306406152");
  assert.equal(find("ISBN 978-0-306-40615-8"), "");
});

test("Free photo scanner prepares a clear ChatGPT prompt from OCR notes", () => {
  const promptFn = new Function("$", section("function makeBookPrompt", "$('scanBookPhotos').onclick=") + "return makeBookPrompt;")(
    id => ({ value: id === "aiOcrText" ? "Sample title\nISBN 9780306406157" : "" })
  );
  const prompt = promptFn();
  assert.match(prompt, /Amazon resale/);
  assert.match(prompt, /9780306406157/);
  assert.match(prompt, /attach photos/);
  assert.match(prompt, /Do not invent/);
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


test("seller-offer CSV export quotes values, exports used offers only, and marks snapshot status", () => {
  const handler = section("window.exportKeepaOffers=", "function renderHistory");
  const records = [{
    id: "book-1", asin: "B000000000",
    keepaOfferSnapshot: {
      retrievedAt: 1760000000000, liveOffersOrder: [0, 1],
      offers: [
        { offerId: 1, sellerId: 'SELLER,"A"', condition: 3, isFBA: true, lastSeen: 7665120, offerCSV: [7665120, 2079, 500] },
        { offerId: 2, sellerId: "NEWSELLER", condition: 1, isFBA: false, offerCSV: [7665120, 2999, 0] }
      ]
    }
  }];
  let exported;
  const target = {};
  const fn = new Function("records", "download", "window", handler + "return window.exportKeepaOffers;")(
    records, (...args) => { exported = args; }, target
  );
  fn("book-1");
  assert.equal(exported[0], "BookFlip_offers_B000000000.csv");
  assert.match(exported[1], /snapshot_status/);
  assert.match(exported[1], /Active in Keepa response/);
  assert.match(exported[1], /"SELLER,""A"""/);
  assert.ok(exported[1].includes('"20.79","5.00","25.79"'));
  assert.doesNotMatch(exported[1], /NEWSELLER/);
  assert.equal(exported[2], "text/csv");
});

test("appearance presets, custom color controls, and layout preferences are wired without touching book records", () => {
  assert.match(html, /id="appearancePreset"/);
  for (const id of ["appearanceAccent","appearanceBackground","appearanceSurface","appearanceText","appearanceHeader","appearanceFont","appearanceSize","appearanceDensity","appearanceCorners","appearanceCards","resetAppearance"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(appScript, /const APPEARANCE_THEMES=/);
  assert.match(appScript, /function applyAppearance\(/);
  assert.match(appScript, /function saveAppearance\(/);
  assert.match(appScript, /settings\.appearance=\{\.\.\.appearance\}/);
  assert.match(appScript, /function bindAppearanceControls\(/);
  assert.match(appScript, /applyAppearance\(\);bindAppearanceControls\(\)/);
  assert.match(html, /body\[data-density="compact"\]/);
  assert.match(html, /body\[data-corners="round"\]/);
  assert.match(html, /body\[data-card-style="flat"\]/);
});
test("appearance theme selection applies preset colors and custom edits switch to Custom", () => {
  const block=section("function bindAppearanceControls()", "function isbnClean");
  assert.match(block, /appearance\.preset='custom'/);
  assert.match(block, /APPEARANCE_THEMES\[preset\]/);
  assert.match(block, /saveAppearance\(\)/);
  assert.match(block, /appearance=\{\.\.\.APPEARANCE_DEFAULTS\}/);
});


test("settings load before appearance initialization so app startup cannot hit a settings temporal-dead-zone error", () => {
  const settingsDeclaration = appScript.indexOf("let settings={minProfit:7,minRoi:100}");
  const settingsLoad = appScript.indexOf("settings={...settings,...JSON.parse(localStorage.getItem(SETKEY)||'{}')}");
  const appearanceInit = appScript.indexOf("let appearance={...APPEARANCE_DEFAULTS,...(settings.appearance||{})}");
  assert.ok(settingsDeclaration >= 0 && settingsLoad > settingsDeclaration && appearanceInit > settingsLoad);
  assert.equal((appScript.match(/let settings=/g)||[]).length, 1);
});

test("Book Sourcing is book-only and keeps retailer research separate from Inventory", () => {
  assert.match(html, /data-tab="sourcing">Book Sourcing/);
  for (const id of ["srcTitle","srcIsbn","srcAsin","srcSupplier","srcUrl","srcCost","srcSalePrice","srcReferral","srcClosing","srcFulfillment","srcFulfillmentFee","srcList","srcSave"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(appScript, /const SOURCEKEY='bookflip_pro2go_v1_book_sources'/);
  assert.match(appScript, /window\.sourceToInventory=/);
  assert.match(appScript, /purchased:false/);
  assert.match(appScript, /No purchase or Amazon listing was made/);
  assert.match(html, /Walmart/);
  assert.match(html, /Sam’s Club/);
  assert.match(html, /BJ’s Wholesale/);
  assert.match(html, /does not fetch live retailer or Amazon prices/);
});

test("Book sourcing calculator uses entered fees, landed cost, profit, ROI and max buy", () => {
  const block = section("function sourceNumber", "function sourceFormData");
  const fields = {
    srcCost:"8", srcInbound:"1", srcOther:"0.5", srcSalePrice:"30",
    srcReferral:"15", srcClosing:"1.80", srcFulfillmentFee:"3",
    srcExtraFees:"0", srcFulfillment:{value:"FBA"}
  };
  const outputs = {};
  const $ = id => ({value:fields[id]??"",textContent:""});
  const fn = new Function("$","money","settings",block+"return sourceCalculate;")($,n=>"$"+Number(n||0).toFixed(2),{minProfit:7});
  const result = fn();
  assert.equal(result.landed, 9.5);
  assert.equal(result.amazonFees, 9.3);
  assert.equal(result.net, 11.2);
  assert.ok(Math.abs(result.roi - 117.8947368421) < 0.0001);
  assert.equal(result.maxBuy, 12.2);
  assert.equal(result.breakEven, 18.8);
  assert.equal(result.status, "BUY");
  fields.srcFulfillmentFee = "";
  assert.equal(fn(), null);
});

test("Book sourcing validates ISBN, ASIN and safe retailer URLs before saving", () => {
  const block = section("function sourceNumber", "function persistSources");
  const values = {
    srcTitle:"Sample book",srcAuthor:"Author",srcIsbn:"9780306406157",srcAsin:"B000000000",
    srcUrl:"https://www.walmart.com/item/123",srcNotes:"Hardcover",
    srcCost:"8",srcInbound:"1",srcOther:"0",srcSalePrice:"30",srcReferral:"15",
    srcClosing:"1.80",srcFulfillmentFee:"3",srcExtraFees:"0",
    srcSupplier:"Walmart",srcFulfillment:"FBA"
  };
  const outputs={};
  const $ = id => ({value:values[id]??"",textContent:""});
  const money=n=>"$"+Number(n||0).toFixed(2);
  const isbnClean=s=>String(s||"").replace(/[^0-9Xx]/g,"").toUpperCase();
  const isbnValid=s=>s==="9780306406157";
  const fn = new Function("$","money","settings","isbnClean","isbnValid","URL",block+"return sourceFormData;")($,money,{minProfit:7},isbnClean,isbnValid,URL);
  const record=fn();
  assert.equal(record.supplier,"Walmart");
  assert.equal(record.isbn,"9780306406157");
  assert.equal(record.estimatedNet,11.7);
  values.srcIsbn="9780306406158";
  assert.throws(()=>fn(),/ISBN digits/);
  values.srcIsbn="9780306406157";
  values.srcUrl="javascript:alert(1)";
  assert.throws(()=>fn(),/must start with https/);
});


test("manual research snapshots persist valid zero offers and reject invalid ranks or fractional counts", () => {
  const handler = section("$('addSnapshot').onclick=", "function parseHistoryCSV");
  const fields = {
    snapPrice:{value:""}, snapRank:{value:""}, snapOffers:{value:"0"},
    snapDate:{value:"2026-11-05"}, snapSource:{value:""},
    snapshotStatus:{textContent:""}
  };
  const book = { id:"book-1", title:"History Test", history:[] };
  let saves = 0;
  const $ = id => fields[id] || (fields[id] = {value:""});
  const run = new Function("$","historyBook","historyLocalDate","persist",handler+";return $('addSnapshot').onclick;")($,()=>book,()=>"2026-11-05",()=>saves++);
  run();
  assert.equal(book.history.length,1);
  assert.equal(book.history[0].offers,0);
  assert.equal(book.history[0].source,"Manual observation");
  assert.equal(saves,1);

  fields.snapRank.value="0"; fields.snapOffers.value="";
  run();
  assert.equal(book.history.length,1);
  assert.match(fields.snapshotStatus.textContent,/positive whole number/);

  fields.snapRank.value=""; fields.snapOffers.value="1.5";
  run();
  assert.equal(book.history.length,1);
  assert.match(fields.snapshotStatus.textContent,/whole number of zero or more/);
});

test("history CSV requires real dates and whole-number rank and offer counts", () => {
  assert.throws(()=>helpers.parseHistoryCSV(["date,used_offers"," ,0"].join("\n")),/Missing date/);
  assert.throws(()=>helpers.parseHistoryCSV(["date,sales_rank","2026-11-05,12.5"].join("\n")),/positive whole number/);
  assert.throws(()=>helpers.parseHistoryCSV(["date,used_offers","2026-11-05,1.5"].join("\n")),/whole number/);
  const rows=helpers.parseHistoryCSV(["date,used_price,sales_rank,used_offers","2026-11-05,0,1,0"].join("\n"));
  assert.equal(rows[0].offers,0);
  assert.equal(rows[0].rank,1);
  assert.equal(rows[0].price,0);
});

test("price and sales-rank charts include date boundaries and explain rank direction", () => {
  const price=helpers.historyChart("Used price",[
    {date:"2026-11-01",price:12.5},{date:"2026-11-05",price:14}
  ],"price","#087e78");
  const rank=helpers.historyChart("Sales rank",[
    {date:"2026-11-01",rank:50000},{date:"2026-11-05",rank:40000}
  ],"rank","#bd8a32");
  assert.match(price,/From 2026-11-01 to 2026-11-05/);
  assert.match(price,/latest \$14\.00/);
  assert.match(rank,/Lower rank is better/);
  assert.match(rank,/From 2026-11-01 to 2026-11-05/);
});

test("history CSV export round-trips source text and zero offers", () => {
  const handler=section("$('exportHistory').onclick=","// Free Book Photo Scanner");
  const book={asin:"B000000000",history:[{date:"2026-11-05",price:10.25,rank:12345,offers:0,source:'Amazon, "used" page'}]};
  let saved=null;
  const elements={exportHistory:{},snapshotStatus:{textContent:""}};
  const $=id=>elements[id]||(elements[id]={textContent:""});
  new Function("$","historyBook","download",handler)($,()=>book,(...args)=>saved=args);
  elements.exportHistory.onclick();
  assert.equal(saved[0],"BookFlip_history_B000000000.csv");
  assert.equal(saved[2],"text/csv");
  const rows=helpers.parseHistoryCSV(saved[1]);
  assert.equal(rows[0].offers,0);
  assert.equal(rows[0].source,'Amazon, "used" page');
});

test("deleting a research snapshot removes only the selected observation and persists", () => {
  const handler=section("window.deleteHistorySnapshot=","$('historyBook').addEventListener");
  const records=[{id:"book-1",history:[{id:"keep"},{id:"delete"}]}];
  let saves=0;
  const win={};
  const remove=new Function("records","persist","window",handler+";return window.deleteHistorySnapshot;")(records,()=>saves++,win);
  remove("book-1","delete");
  assert.deepEqual(records[0].history,[{id:"keep"}]);
  assert.equal(saves,1);
});

test("record persistence writes saved history and refreshes dependent views", () => {
  const block=section("function persist(){","function showTab");
  const records=[{id:"book-1",history:[{date:"2026-11-05",offers:0}]}];
  let stored=null,renders=0,refreshes=0;
  const storage={setItem:(key,value)=>{stored={key,value}}};
  const persist=new Function("localStorage","KEY","records","render","refreshHistoryBooks",block+";return persist;")(
    storage,"bookflip_records",records,()=>renders++,()=>refreshes++
  );
  persist();
  assert.equal(stored.key,"bookflip_records");
  assert.deepEqual(JSON.parse(stored.value),records);
  assert.equal(renders,1);
  assert.equal(refreshes,1);
});

test("Research History remains usable on narrow screens with horizontally scrollable tables", () => {
  assert.match(html,/\.tablewrap\{overflow-x:auto\}/);
  assert.match(html,/@media\(max-width:700px\)[\s\S]*?\.two\{grid-template-columns:1fr\}/);
  assert.match(html,/svg[^>]*style="width:100%;min-width:280px;height:auto"/);
  assert.match(html,/id="historyBook"/);
  assert.match(html,/id="historyCsv"/);
  assert.match(html,/id="keepaJson"/);
});

test("Keepa API imports require explicit Amazon.com domain IDs for both history and offer snapshots", () => {
  assert.throws(()=>helpers.parseKeepaProductJSON({products:[{
    asin:"B000000000",csv:[[],[],[100000,1200]]
  }]},"B000000000"),/domainId 1/);
  assert.throws(()=>helpers.parseKeepaOfferSnapshot({products:[{
    asin:"B000000000",offers:[]
  }]},"B000000000"),/domainId 1/);
});

test("browser app never contains or stores a shared Keepa API key", () => {
  assert.doesNotMatch(appScript,/KEEPA_API_KEY|api\.keepa\.com/);
  assert.match(html,/Official Keepa Product Object format/);
});
test("Book Scout shows last estimated Amazon sale activity only for exact saved title, author, edition and ASIN",()=>{
  for(const id of ["lastSaleCard","lastSaleResult","checkLastSaleBtn","openLastSaleHistoryBtn"])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/Most recent estimated sale activity/);
  assert.match(appScript,/function renderScoutLastSale\\(/);
  assert.match(appScript,/lastSalesSignal:old\\?\\(old\\.lastSalesSignal\\|\\|null\\):null/);
  assert.match(appScript,/r\\.lastSalesSignal=lastSalesSignal/);
  assert.match(html,/not Amazon.s actual order timestamp/i);
});

test("Keepa sales-rank history extracts the most recent rank drop timestamp for the matching Amazon ASIN",()=>{
  const fn=helpers.extractKeepaLastSalesSignal;
  const data={products:[{asin:"B000000000",domainId:1,csv:[[],[],[],[100000,120000,100100,80000,100200,90000,100300,45000]]}]};
  const result=fn(data,"B000000000");
  assert.equal(result.detected,true);
  assert.equal(result.rank,45000);
  assert.equal(result.previousRank,90000);
  assert.equal(result.dropPercent,50);
  assert.equal(result.timestamp,new Date((100300+21564000)*60000).toISOString());
  assert.throws(()=>fn(data,"B000000001"),/No matching/);
  assert.throws(()=>fn({products:[{asin:"B000000000",domainId:2,csv:[[],[],[],[100000,50000]]}]},"B000000000"),/domainId 1/);
});

test("Keepa sales-rank helper reports no signal instead of inventing a sale",()=>{
  const result=helpers.extractKeepaLastSalesSignal({products:[{asin:"B000000000",domainId:1,csv:[[],[],[],[100000,50000,100100,60000]]}]},"B000000000");
  assert.equal(result.detected,false);
  assert.match(result.reason,/No downward sales-rank movement/);
});
