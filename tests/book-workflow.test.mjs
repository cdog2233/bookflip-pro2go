import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const html=await readFile(new URL("../index.html",import.meta.url),"utf8");
const a=html.indexOf("<script>")+8,b=html.lastIndexOf("</script>");
assert.ok(a>=8&&b>a);
const app=html.slice(a,b);
assert.doesNotThrow(()=>new Function(app));

function section(start,end){
  const x=app.indexOf(start),y=app.indexOf(end,x);
  assert.notEqual(x,-1,"missing source: "+start);
  assert.notEqual(y,-1,"missing boundary: "+end);
  return app.slice(x,y);
}
const fieldsOf=values=>Object.fromEntries(Object.entries(values).map(([k,v])=>[k,typeof v==="object"&&v!==null?v:{value:String(v)}]));
const money=n=>"$"+Number(n||0).toFixed(2);

test("camera scanner keeps ISBN barcode formats, rear camera, validation and optional flashlight",()=>{
  const scan=section("$('scanBtn').onclick=","$('saveBtn').onclick=");
  assert.match(html,/html5-qrcode/);
  assert.match(scan,/facingMode:'environment'/);
  assert.match(scan,/Html5QrcodeSupportedFormats\.EAN_13/);
  assert.match(scan,/Html5QrcodeSupportedFormats\.EAN_8/);
  assert.match(scan,/Html5QrcodeSupportedFormats\.UPC_A/);
  assert.match(scan,/caps&&caps\.torch/);
  assert.match(scan,/applyVideoConstraints\(\{advanced:\[\{torch:!flashOn\}\]\}\)/);
  assert.match(scan,/applyVideoConstraints\(\{advanced:\[\{torch:false\}\]\}\)/);
  assert.match(scan,/if\(isbnValid\(code\)\)/);
  assert.match(scan,/Scanning will continue normally/);
});

test("ISBN metadata lookup validates input and falls back from Google Books to Open Library",async()=>{
  const handler=section("$('lookupBtn').onclick=","$('amazonTitleBtn').onclick=");
  const fields=fieldsOf({
    isbn:"978-0-306-40615-7",title:"",author:"",lookupBtn:{},
    lookupStatus:{textContent:""},matches:{innerHTML:""},
    amazonSearch:{href:"",style:{display:"none"}}
  });
  const $=id=>fields[id];
  let googleCalls=[],libraryCalls=[],matches=[],amazonQueries=[];
  const run=new Function("$","isbnClean","isbnValid","googleBooks","openLibrary","renderBookMatch","showAmazon","currentBookQuery",handler+";return $('lookupBtn').onclick;")(
    $,v=>String(v||"").replace(/[^0-9Xx]/g,"").toUpperCase(),
    v=>v==="9780306406157",
    async(q,byIsbn)=>{googleCalls.push([q,byIsbn]);return []},
    async isbn=>{libraryCalls.push(isbn);return [{title:"Verified catalog candidate",authors:["Test Author"],source:"Open Library"}]},
    book=>matches.push(book),q=>amazonQueries.push(q),()=>"Verified catalog candidate"
  );
  await run();
  assert.deepEqual(googleCalls,[["9780306406157",true]]);
  assert.deepEqual(libraryCalls,["9780306406157"]);
  assert.equal(matches[0].title,"Verified catalog candidate");
  assert.match(fields.lookupStatus.textContent,/possible edition/);
  assert.equal(amazonQueries.length,1);

  fields.isbn.value="9780306406158";
  googleCalls=[];libraryCalls=[];
  await run();
  assert.equal(googleCalls.length,0);
  assert.equal(libraryCalls.length,0);
  assert.match(fields.lookupStatus.textContent,/valid ISBN/);
});

test("Amazon search remains scoped to Books and safely encodes title and author",()=>{
  const block=section("function amazonUrl(query)","async function googleBooks");
  const fields=fieldsOf({title:"A Good Girl's Guide to Murder",author:"Holly Jackson",isbn:"",amazonSearch:{href:"",style:{}}});
  const $=id=>fields[id];
  const f=new Function("$",block+";return {amazonUrl,currentBookQuery,showAmazon};")($);
  const query=f.currentBookQuery();
  assert.equal(query,"A Good Girl's Guide to Murder Holly Jackson");
  assert.equal(f.amazonUrl(query),"https://www.amazon.com/s?k=A%20Good%20Girl's%20Guide%20to%20Murder%20Holly%20Jackson&i=stripbooks");
  f.showAmazon(query);
  assert.equal(fields.amazonSearch.href,f.amazonUrl(query));
});

test("FBA and FBM calculator compare separate fulfillment costs and apply profit/ROI targets",()=>{
  const start=app.indexOf("function calc(){"),end=app.indexOf("\n['price','fees'",start);
  assert.ok(start>=0&&end>start);
  const block=app.slice(start,end);
  const fields=fieldsOf({
    price:"60",cost:"10",shipping:"2",other:"1",fees:"0.5",referralRate:"15",
    fbaFee:"4",closingFee:"1.8",fbmShip:"3.5",fulfillment:"FBA",
    eligibility:"yes",fba:"yes",net:"",roi:{textContent:""},margin:{textContent:""},
    maxBuy:{textContent:""},breakEven:{textContent:""},fbaCompare:{textContent:""},
    fbmCompare:{textContent:""},fbaFeesTotal:{textContent:""},fbmFeesTotal:{textContent:""},
    fbaMaxBuy:{textContent:""},fbmMaxBuy:{textContent:""},decision:{innerHTML:""}
  });
  const $=id=>fields[id],val=id=>Number(fields[id]?.value)||0;
  const calculate=new Function("$","val","money","settings",block+";return calc;")($,val,money,{minProfit:7,minRoi:100});
  const fba=calculate();
  assert.equal(fba.status,"BUY");
  assert.equal(fba.fulfillment,"FBA");
  assert.ok(Math.abs(fba.net-31.7)<1e-8);
  assert.ok(Math.abs(fba.fbm.net-32.2)<1e-8);
  assert.ok(fba.fba.fees>fba.fbm.fees);
  assert.match(fields.fbaCompare.textContent,/net/);
  assert.match(fields.fbmCompare.textContent,/ROI/);

  fields.fulfillment.value="FBM";
  const fbm=calculate();
  assert.equal(fbm.fulfillment,"FBM");
  assert.ok(Math.abs(fbm.net-32.2)<1e-8);
  fields.fulfillment.value="FBA";fields.fba.value="no";
  assert.notEqual(calculate().status,"BUY");
});

test("editing a purchased book preserves actual acquisition costs, purchase date, sale and research history",()=>{
  const handler=section("$('saveBtn').onclick=","$('clearBtn').onclick=");
  const fields=fieldsOf({
    saveBtn:{textContent:"Update book record"},title:"Edited title",isbn:"9780306406157",
    author:"Test Author",asin:"B000000000",edition:"Paperback",condition:"Very Good",
    eligibility:"yes",fba:"yes",fulfillment:"FBA",notes:"updated",tags:"test",location:"Shelf A"
  });
  const $=id=>fields[id]||(fields[id]={value:""});
  const old={id:"book-1",stage:"PURCHASED",purchased:true,actualPurchaseCost:15.25,actualInboundCosts:2.75,
    purchasedAt:"2026-11-01T12:00:00.000Z",sale:{price:40,fees:6,costs:3,profit:13},
    history:[{id:"history-1",date:"2026-11-01",price:20}],keepaOfferSnapshot:{offers:[{sellerId:"S1"}]},
    created:"2026-10-30T12:00:00.000Z"};
  const calc=()=>({price:30,fees:5,referralRate:15,fbaFee:4,closingFee:1.8,fbmShip:3.5,extraFees:0.5,
    cost:15.25,ship:1,other:1,net:3,roi:10,max:8,breakEven:25,status:"REVIEW",fba:{net:3},fbm:{net:4}});
  let saves=0;
  const factory=new Function("$","records","calc","isbnClean","isbnValid","stageOf","persist","alert","showTab","editingRecordId",
    handler+";return {click:$('saveBtn').onclick,getRecords:()=>records};");
  const api=factory($,[old],calc,v=>String(v).replace(/[^0-9Xx]/g,"").toUpperCase(),v=>v==="9780306406157",
    r=>r.stage,()=>saves++,()=>{},()=>"review","book-1");
  api.click();
  const saved=api.getRecords()[0];
  assert.equal(saved.title,"Edited title");
  assert.equal(saved.actualPurchaseCost,15.25);
  assert.equal(saved.actualInboundCosts,2.75);
  assert.equal(saved.purchasedAt,"2026-11-01T12:00:00.000Z");
  assert.deepEqual(saved.sale,old.sale);
  assert.deepEqual(saved.history,old.history);
  assert.deepEqual(saved.keepaOfferSnapshot,old.keepaOfferSnapshot);
  assert.equal(saved.purchased,true);
  assert.equal(saves,1);
  assert.equal(saved.reviewState,"NEEDS_REVIEW");
});

test("review checklist persists each check and only approves a fully eligible BUY record",()=>{
  const handler=section("window.updateReviewCheck=","window.editResearch=");
  const records=[{id:"book-1",status:"BUY",eligibility:"yes",fulfillment:"FBA",fba:"yes",
    reviewChecks:{edition:false,amazonMatch:false,eligibility:false,price:false,condition:false,fulfillment:false},
    reviewState:"NEEDS_REVIEW",stage:"RESEARCH"}];
  let saves=0,alerts=0;
  const win={};
  const api=new Function("records","persist","alert","window",handler+";return window;")(
    records,()=>saves++,()=>alerts++,win
  );
  for(const key of ["edition","amazonMatch","eligibility","price","condition","fulfillment"])api.updateReviewCheck("book-1",key,true);
  api.approveForBuy("book-1");
  assert.equal(records[0].reviewState,"APPROVED");
  assert.equal(records[0].stage,"TO BUY");
  assert.ok(records[0].reviewedAt);
  assert.equal(saves,7);
  assert.equal(alerts,0);

  records[0].reviewChecks.price=false;records[0].stage="RESEARCH";records[0].reviewState="NEEDS_REVIEW";
  api.approveForBuy("book-1");
  assert.equal(records[0].stage,"RESEARCH");
  assert.equal(alerts,1);
});

test("actual purchase receipt and sale workflow use confirmed costs, never estimates",()=>{
  const purchase=section("window.markPurchased=","window.editSale=");
  const records=[{id:"book-1",cost:12,shipping:1,other:1,purchased:false,stage:"RESEARCH",sale:null}];
  const prompts=["12.50","2.50"];
  let saves=0,alerts=0;
  const win={};
  const mark=new Function("records","prompt","alert","persist","window",purchase+";return window.markPurchased;")(
    records,()=>prompts.shift(),()=>alerts++,()=>saves++,win
  );
  mark("book-1");
  assert.equal(records[0].purchased,true);
  assert.equal(records[0].stage,"PURCHASED");
  assert.equal(records[0].actualPurchaseCost,12.5);
  assert.equal(records[0].actualInboundCosts,2.5);
  assert.ok(records[0].purchasedAt);

  const sale=section("$('recordSale').onclick=","$('saveSettings').onclick=");
  const fields=fieldsOf({recordSale:{},saleBook:"book-1",salePrice:"40",saleFees:"6",saleCosts:"3",saleStatus:{textContent:""}});
  const $=id=>fields[id];
  const sell=new Function("$","records","persist","Date",sale+";return $('recordSale').onclick;")($,records,()=>saves++,Date);
  sell();
  assert.equal(records[0].stage,"SOLD");
  assert.equal(records[0].sale.profit,16);
  assert.equal(records[0].sale.acquisitionExtrasSource,"actual");
  assert.match(fields.saleStatus.textContent,/actual sale fees/);
  assert.equal(saves,2);
  assert.equal(alerts,0);
});

test("inventory search, stage filtering, sorting and purchase/sale actions remain wired",()=>{
  const render=section("function render(){","function renderReview(){");
  assert.match(render,/inventorySearch/);
  assert.match(render,/stageFilter/);
  assert.match(render,/inventorySort/);
  assert.match(render,/visible\.sort/);
  assert.match(render,/Mark purchased/);
  assert.match(render,/Edit sale/);
  assert.match(render,/Undo sale/);
  assert.match(app,/window\.setStage=/);
  assert.match(app,/window\.markPurchased=/);
  assert.match(app,/window\.removeRecord=/);
  assert.match(app,/\.forEach\(id=>\$\(id\)\.addEventListener\('input',render\)\)/);
});

test("backup JSON includes records and settings, and restore reapplies saved appearance preferences",async()=>{
  const backup=section("$('backupBtn').onclick=","$('restoreFile').onchange=");
  const records=[{id:"book-1",history:[{id:"h1",offers:0}],actualInboundCosts:2.5}];
  const settings={minProfit:9,minRoi:125,appearance:{preset:"midnight",accent:"#55c7b5"}};
  const backupElements={backupBtn:{}};
  const $backup=id=>backupElements[id];
  let downloaded=null;
  const makeBackup=new Function("$","records","settings","download",backup+";return $('backupBtn').onclick;")(
    $backup,records,settings,(...args)=>downloaded=args
  );
  makeBackup();
  assert.equal(downloaded[0],"BookFlip_backup.json");
  const payload=JSON.parse(downloaded[1]);
  assert.deepEqual(payload.records,records);
  assert.deepEqual(payload.settings,settings);

  const restore=section("$('restoreFile').onchange=","let historySelectedId");
  const elements={restoreFile:{},backupStatus:{textContent:""}};
  const $=id=>elements[id]||(elements[id]={value:""});
  const storage={setItem:(key,value)=>{storage.saved={key,value}}};
  let saves=0,applied=0,synced=0;
  const factory=new Function("$","initialRecords","initialSettings","localStorage","persist","confirm",
    "applyAppearance","syncAppearanceControls","APPEARANCE_DEFAULTS","SETKEY",
    "let records=initialRecords;let settings=initialSettings;let appearance={...APPEARANCE_DEFAULTS,...(settings.appearance||{})};"+
    restore+";return {restore:$('restoreFile').onchange,get:()=>({records,settings,appearance})};");
  const api=factory($,[{id:"old"}],{minProfit:7},storage,()=>saves++,()=>true,
    ()=>applied++,()=>synced++,{preset:"evergreen",accent:"#087e78"},"settings-key");
  await api.restore({target:{files:[{text:async()=>JSON.stringify({records,settings})}]}});
  const state=api.get();
  assert.deepEqual(state.records,records);
  assert.deepEqual(state.settings,settings);
  assert.deepEqual(state.appearance,{preset:"midnight",accent:"#55c7b5"});
  assert.deepEqual(storage.saved,{key:"settings-key",value:JSON.stringify(settings)});
  assert.equal(saves,1);
  assert.equal(applied,1);
  assert.equal(synced,1);
  assert.match(elements.backupStatus.textContent,/Backup restored/);
});

test("backup restore rejects malformed data without replacing saved records",async()=>{
  const restore=section("$('restoreFile').onchange=","let historySelectedId");
  const elements={restoreFile:{},backupStatus:{textContent:""}};
  const $=id=>elements[id]||(elements[id]={value:""});
  const original=[{id:"keep"}];
  let saves=0;
  const factory=new Function("$","initialRecords","localStorage","persist","confirm","applyAppearance","syncAppearanceControls",
    "APPEARANCE_DEFAULTS","SETKEY",
    "let records=initialRecords;let settings={minProfit:7};let appearance={...APPEARANCE_DEFAULTS};"+
    restore+";return {restore:$('restoreFile').onchange,get:()=>records};");
  const api=factory($,original,{setItem:()=>{}},()=>saves++,()=>true,()=>{},()=>{},{preset:"evergreen"},"settings-key");
  await api.restore({target:{files:[{text:async()=>JSON.stringify({records:"bad"})}]}});
  assert.deepEqual(api.get(),original);
  assert.equal(saves,0);
  assert.match(elements.backupStatus.textContent,/Could not read/);
});

test("Review History and inventory tables remain responsive on iPhone widths",()=>{
  assert.match(html,/\.tablewrap\{overflow-x:auto\}/);
  assert.match(html,/@media\(max-width:700px\)[\s\S]*?\.two\{grid-template-columns:1fr\}/);
  assert.match(html,/id="inventorySearch"/);
  assert.match(html,/id="stageFilter"/);
  assert.match(html,/id="inventorySort"/);
  assert.match(html,/id="reviewList"/);
  assert.match(html,/id="backupBtn"/);
  assert.match(html,/id="restoreFile"/);
});

test("dashboard separates total acquisition spend, unsold inventory cost, gross sales and realized profit",()=>{
  assert.match(html,/id="mInvested"/);
  assert.match(html,/id="mInventoryCost"/);
  assert.match(html,/id="mRevenue"/);
  assert.match(html,/id="mProfit"/);
  const render=section("function render(){","function renderReview(){");
  assert.match(render,/const purchased=records\.filter\(r=>r\.purchased\)/);
  assert.match(render,/purchased\.filter\(r=>!r\.sale\)/);
  assert.match(render,/sold\.reduce\(\(s,r\)=>s\+\(\+r\.sale\.price\|\|0\),0\)/);
  assert.match(render,/\$\('mInventoryCost'\)/);
  assert.match(render,/\$\('mRevenue'\)/);
});

test("sales CSV exports only recorded sales and labels estimated acquisition costs",()=>{
  const handler=section("$('exportSalesBtn').onclick=","$('backupBtn').onclick=");
  const records=[
    {title:"Sold book",author:"A",isbn:"9780306406157",asin:"B000000001",purchased:true,cost:10,shipping:1,other:0,actualPurchaseCost:10.5,actualInboundCosts:1.25,sale:{date:"2026-11-05T10:00:00.000Z",price:30,fees:5,costs:2,profit:11.25}},
    {title:"Unsold book",purchased:true,cost:8,shipping:1,other:0,sale:null},
    {title:"Legacy sale",purchased:true,cost:4,shipping:1,other:0,sale:{price:15,fees:3,costs:1,profit:6}}
  ];
  const fields={exportSalesBtn:{}};
  const $=id=>fields[id];
  let downloaded=null;
  const run=new Function("$","records","download",handler+";return $('exportSalesBtn').onclick;")($,records,(...args)=>downloaded=args);
  run();
  assert.equal(downloaded[0],"BookFlip_sales.csv");
  assert.equal(downloaded[2],"text/csv");
  const rows=downloaded[1].split("\\n");
  assert.equal(rows.length,3);
  assert.match(rows[1],/Sold book/);
  assert.match(rows[1],/Actual/);
  assert.match(rows[2],/Legacy sale/);
  assert.match(rows[2],/Contains estimated acquisition costs/);
  assert.ok(!downloaded[1].includes("Unsold book"));
});
