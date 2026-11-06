import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
const html = await readFile(new URL("../booksource-pro/index.html", import.meta.url), "utf8");
const start = html.indexOf("<script>") + 8, end = html.lastIndexOf("</script>");
assert.ok(start >= 8 && end > start);
const js = html.slice(start,end);
assert.doesNotThrow(() => new Function(js));
test("standalone sourcing app has independent navigation and retailer research",()=>{
  for(const s of ['BookSource Pro','data-tab="finder"','data-tab="compare"','data-tab="watchlist"','Walmart','Barnes & Noble','ThriftBooks','amazon.com/s?k=','function calcSaved','function validIsbn']) assert.ok(html.includes(s),s);
});
test("no paid API, purchase automation, or false live-price claims",()=>{
  assert.doesNotMatch(js,/OPENAI_API_KEY|api\/book-assistant|fetch\([^)]*walmart\.com|fetch\([^)]*amazon\.com/i);
  assert.match(html,/does not pretend to scrape prices/i);
  assert.match(html,/No purchase or listing is automated/);
});
test("ISBN checksum validates both ISBN formats",()=>{
  const f=new Function(js.slice(js.indexOf("function cleanIsbn"),js.indexOf("function esc"))+"return {cleanIsbn,validIsbn}")();
  assert.equal(f.validIsbn("978-0-306-40615-7"),true);
  assert.equal(f.validIsbn("0-306-40615-2"),true);
  assert.equal(f.validIsbn("9780306406158"),false);
});
test("calculator includes retailer landed costs, Amazon fees, ROI and max buy",()=>{
  for(const s of ["function calcOffer","shipping","tax","referral","closing","maxCost","minProfit","minRoi"]) assert.ok(js.includes(s),s);
});
test("saved sourcing records support CSV export and JSON backup/restore",()=>{
  for(const s of ["exportCsv","backupJson","importJson","localStorage","booksource_pro_records_v1"]) assert.ok(html.includes(s),s);
});

test("Amazon market research captures ASIN, condition, sales history, offers and eligibility",()=>{
  for(const id of ["asin","sellCondition","salesRank","avgRank90","soldDays90","usedOffers","usedFbaPrice","usedFbmPrice","eligibility","marketDate","openAmazonListing","openKeepa","openSellerEligibility"]) assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(html,/manual snapshots—not live data pulled by BookSource Pro/i);
  assert.match(html,/A sales-rank number alone does not guarantee sales/i);
});
test("retailer research includes more book sources without scraping their sites",()=>{
  for(const name of ["Better World Books","BooksRun","Book Outlet","Alibris","Powell’s Books","Sam’s Club","BJ’s Wholesale"]) assert.ok(html.includes(name),name);
  assert.match(html,/Automated retailer scraping is intentionally not used/i);
});
test("Amazon ISBN lookup selects an exact identifier rather than the first title result",()=>{
  assert.match(js,/items\.find\(x=>\(x\.volumeInfo\?\.industryIdentifiers\|\|\[\]\)\.some\(v=>cleanIsbn\(v\.identifier\)===isbn\)\)/);
  assert.match(js,/No exact ISBN catalog match found/i);
});
test("profit calculator includes seller plan, inbound prep, extra fees and safety reserve",()=>{
  const block=js.slice(js.indexOf("function feeConfig"),js.indexOf("function retailerHtml"));
  const fields={salePrice:"30",referral:"15",closing:"1.80",fulfillment:{value:"FBA"},sellerPlan:{value:"Individual"},fbaFee:"5",fbmCost:"4",prepInbound:"1.5",extraFees:"0.25",reserve:"1"};
  const $=id=>typeof fields[id]==="object"?fields[id]:({value:fields[id]??""});
  const num=id=>Number(fields[id]?.value??fields[id]??0);
  const fns=new Function("$","num","settings",block+"return {feeConfig,calcOffer};")($,num,{minProfit:5,minRoi:50});
  const result=fns.calcOffer({price:8,shipping:.5,tax:.4,other:.1});
  assert.equal(result.valid,true);
  assert.equal(result.total,10.5);
  assert.equal(result.fee,12.54);
  assert.ok(Math.abs(result.profit-5.96)<1e-9);
  assert.ok(Math.abs(result.roi-56.7619047619)<1e-8);
  assert.ok(Math.abs(result.maxCost-7.64)<1e-9);
  assert.equal(result.decision,"MEETS TARGET");
  fields.fbaFee="";
  assert.equal(fns.calcOffer({price:8}).valid,false);
  fields.fbaFee="5";
  assert.equal(fns.calcOffer({price:-8}).valid,false);
});
test("saved deal math preserves legacy records and applies the Individual per-item fee",()=>{
  const block=js.slice(js.indexOf("function calcSaved"),js.indexOf("function offerRows"));
  const fn=new Function("settings",block+"return calcSaved;")({minProfit:5,minRoi:50});
  const oldRecord={salePrice:30,referral:15,closing:1.8,fulfillment:"FBA",fbaFee:3.5};
  const result=fn(oldRecord,{price:8,shipping:1,tax:.56,other:.2});
  assert.equal(result.valid,true);
  assert.equal(result.fee,10.79);
  assert.equal(result.total,9.76);
  assert.ok(Math.abs(result.profit-9.45)<1e-9);
  const incomplete=fn({...oldRecord,fbaFee:""},{price:8});
  assert.equal(incomplete.valid,false);
  assert.equal(incomplete.decision,"NEEDS DATA");
});
test("sales CSV exports Amazon market evidence and expanded per-unit costs",()=>{
  for(const s of ["ASIN","Sales rank","90-day average rank","Sales days (90d)","Eligibility","Inbound/prep","Reserve"]) assert.ok(html.includes(s),s);
  assert.match(js,/b\.market\?\.soldDays90/);
  assert.match(js,/b\.market\?\.eligibility/);
});
