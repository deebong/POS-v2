/** FreshMart POS — supplier & purchase management extension.
 * This file is intentionally separate from Code.gs. It extends the existing ACTIONS object.
 */
var PROCUREMENT_VERSION = '1.0.0';
var PROCUREMENT_SCHEMA = {
  Suppliers: [['id','n'],['name','s'],['phone','s'],['email','s'],['address','s'],['gstin','s'],['notes','s'],['active','b'],['createdAt','d'],['updatedAt','d']],
  Purchases: [['id','n'],['purchaseNo','s'],['supplierId','n'],['supplierName','s'],['invoiceNo','s'],['createdAt','d'],['receivedAt','d'],['status','s'],['subtotal','n'],['tax','n'],['total','n'],['notes','s']],
  PurchaseItems: [['id','n'],['purchaseId','n'],['productId','n'],['sku','s'],['name','s'],['unit','s'],['qty','n'],['unitCost','n'],['taxRate','n'],['lineSubtotal','n'],['lineTax','n']],
  ProcurementSyncLog: [['opId','s'],['appliedAt','d'],['ok','b'],['message','s']]
};

if (typeof ACTIONS !== 'undefined') {
  ACTIONS.procurementBootstrap = procurementBootstrap_;
  ACTIONS.procurementSync = function (r) { return withLock_(function () { return procurementSync_(r); }); };
}

function procurementSetupSheet_(name) {
  var ss = ss_();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var cols = PROCUREMENT_SCHEMA[name];
  if (sh.getLastRow() === 0) {
    sh.getRange(1,1,1,cols.length).setValues([cols.map(function(c){return c[0];})]).setFontWeight('bold').setBackground('#2563eb').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  } else {
    var have = sh.getRange(1,1,1,cols.length).getValues()[0];
    for (var i=0;i<cols.length;i++) if (!have[i]) sh.getRange(1,i+1).setValue(cols[i][0]).setFontWeight('bold').setBackground('#2563eb').setFontColor('#ffffff');
  }
  return sh;
}
function procurementRead_(name) {
  var sh = procurementSetupSheet_(name), cols = PROCUREMENT_SCHEMA[name], last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2,1,last-1,cols.length).getValues(), out=[];
  vals.forEach(function(row,i){ var o={_row:i+2}; cols.forEach(function(c,j){ var v=row[j]; if(c[1]==='n') v=Number(v)||0; else if(c[1]==='b') v=v===true||String(v).toLowerCase()==='true'; else if(c[1]==='d') v=v?new Date(v).toISOString():null; else v=v==null?'':String(v); o[c[0]]=v; }); if(name==='ProcurementSyncLog'||o.id>0) out.push(o); });
  return out;
}
function procurementAppend_(name, objs) { if(!objs.length)return; var sh=procurementSetupSheet_(name), cols=PROCUREMENT_SCHEMA[name]; sh.getRange(sh.getLastRow()+1,1,objs.length,cols.length).setValues(objs.map(function(o){return cols.map(function(c){var v=o[c[0]]; if(c[1]==='n')return Number(v)||0; if(c[1]==='b')return !!v; if(c[1]==='d')return v?new Date(v):''; return v==null?'':String(v);});})); }
function procurementWrite_(name,row,obj){var sh=procurementSetupSheet_(name),cols=PROCUREMENT_SCHEMA[name]; sh.getRange(row,1,1,cols.length).setValues([cols.map(function(c){var v=obj[c[0]]; if(c[1]==='n')return Number(v)||0; if(c[1]==='b')return !!v; if(c[1]==='d')return v?new Date(v):''; return v==null?'':String(v);})]);}
function procurementLastId_(name){return procurementRead_(name).reduce(function(m,r){return Math.max(m,Number(r.id)||0);},0);}
function procurementStr_(v,n){return String(v==null?'':v).trim().slice(0,n||200);}
function procurementNum_(v){var n=Number(v);return isFinite(n)?n:0;}
function procurementFind_(rows,id){return rows.find(function(r){return Number(r.id)===Number(id);})||null;}

function procurementBootstrap_(){
  return {version:PROCUREMENT_VERSION,suppliers:procurementRead_('Suppliers'),purchases:procurementRead_('Purchases'),purchaseItems:procurementRead_('PurchaseItems')};
}

function procurementSync_(req){
  var ops=Array.isArray(req.ops)?req.ops.slice(0,50):[], log=procurementRead_('ProcurementSyncLog'), seen={};
  log.forEach(function(x){seen[x.opId]=x;});
  var results=[];
  ops.forEach(function(op){
    var id=procurementStr_(op&&op.opId,64);
    if(!id){results.push({opId:'',ok:false,error:'Missing opId'});return;}
    if(seen[id]){results.push({opId:id,ok:seen[id].ok,duplicate:true,error:seen[id].message||undefined});return;}
    var res;
    try{res=procurementApply_(op)||{};res.ok=true;}catch(e){res={ok:false,error:String(e&&e.message||e)};}
    res.opId=id; procurementAppend_('ProcurementSyncLog',[{opId:id,appliedAt:new Date().toISOString(),ok:res.ok,message:res.error||''}]); seen[id]={ok:res.ok,message:res.error||''}; results.push(res);
  });
  SpreadsheetApp.flush();
  return {results:results, ...procurementBootstrap_()};
}

function procurementApply_(op){
  var p=op.payload||{}, now=new Date().toISOString();
  if(op.type==='supplier.save'){
    var rows=procurementRead_('Suppliers'), data={id:Number(p.supplier.id)||0,name:procurementStr_(p.supplier.name,120),phone:procurementStr_(p.supplier.phone,40),email:procurementStr_(p.supplier.email,120),address:procurementStr_(p.supplier.address,300),gstin:procurementStr_(p.supplier.gstin,40),notes:procurementStr_(p.supplier.notes,300),active:p.supplier.active!==false,createdAt:p.supplier.createdAt||now,updatedAt:now};
    var target=procurementFind_(rows,data.id);
    if(target){data.id=target.id;data.createdAt=target.createdAt;procurementWrite_('Suppliers',target._row,data);} else {data.id=procurementLastId_('Suppliers')+1;procurementAppend_('Suppliers',[data]);}
    return {id:data.id};
  }
  if(op.type==='supplier.delete'){
    var rows2=procurementRead_('Suppliers'),t=procurementFind_(rows2,p.id); if(t) procurementWrite_('Suppliers',t._row,{...t,active:false,updatedAt:now}); return {};
  }
  if(op.type==='purchase.save'){
    var pr=procurementRead_('Purchases'), x=p.purchase||{}, pid=Number(x.id)||0, targetP=procurementFind_(pr,pid);
    if(targetP) throw new Error('Purchase records cannot be edited after receipt');
    var nextPurchaseId=procurementLastId_('Purchases')+1;
    var purchase={id:nextPurchaseId,purchaseNo:procurementStr_(x.purchaseNo,40)||('PUR-'+Utilities.formatDate(new Date(),tz_(),'yyyyMMdd')+'-'+String(nextPurchaseId).padStart(5,'0')),supplierId:Number(x.supplierId)||0,supplierName:procurementStr_(x.supplierName,120),invoiceNo:procurementStr_(x.invoiceNo,60),createdAt:x.createdAt||now,receivedAt:x.receivedAt||now,status:'received',subtotal:procurementNum_(x.subtotal),tax:procurementNum_(x.tax),total:procurementNum_(x.total),notes:procurementStr_(x.notes,300)};
    procurementAppend_('Purchases',[purchase]);
    var next=procurementLastId_('PurchaseItems'), rows=[]; (p.items||[]).forEach(function(q){rows.push({id:++next,purchaseId:purchase.id,productId:Number(q.productId)||0,sku:procurementStr_(q.sku,40),name:procurementStr_(q.name,120),unit:procurementStr_(q.unit,12),qty:procurementNum_(q.qty),unitCost:procurementNum_(q.unitCost),taxRate:procurementNum_(q.taxRate),lineSubtotal:procurementNum_(q.lineSubtotal),lineTax:procurementNum_(q.lineTax)});}); procurementAppend_('PurchaseItems',rows); return {purchaseId:purchase.id,purchaseNo:purchase.purchaseNo};
  }
  throw new Error('Unknown procurement operation: '+op.type);
}
