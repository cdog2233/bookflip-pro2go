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
