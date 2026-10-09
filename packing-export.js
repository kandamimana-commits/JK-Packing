(function(){
'use strict';
function flat(sessions){return sessions.flatMap(function(s){return (s.products||[]).map(function(p){
 var from=p.orderDateFrom||'',to=p.orderDateTo||from;
 return {date:s.date||'',packer:s.packer||'',product:p.product||'',qty:Number(p.qty)||0,from:from,to:to,range:from?(from===to?from:from+' ถึง '+to):'ไม่ทราบ'};
});}).sort(function(a,b){return a.date.localeCompare(b.date)||a.packer.localeCompare(b.packer);});}
function cell(v){var s=String(v==null?'':v);if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
function csv(sessions){
 var rows=[['วันที่แพ็ค','คนแพ็ค','ชื่อสินค้า','จำนวน','วันที่ออเดอร์เริ่มต้น','วันที่ออเดอร์สิ้นสุด','ช่วงวันที่ออเดอร์']];
 flat(sessions).forEach(function(r){rows.push([r.date,r.packer,r.product,r.qty,r.from||'ไม่ทราบ',r.to||'ไม่ทราบ',r.range]);});
 return '\uFEFF'+rows.map(function(r){return r.map(cell).join(',');}).join('\r\n');
}
function download(sessions,name){
 var url=URL.createObjectURL(new Blob([csv(sessions)],{type:'text/csv;charset=utf-8;'}));
 var old=document.getElementById('packingDownloadLink');if(old){URL.revokeObjectURL(old.href);old.remove();}
 var a=document.createElement('a');a.id='packingDownloadLink';a.href=url;a.download=name;
 a.textContent='หากไฟล์ยังไม่ดาวน์โหลด กดที่นี่: '+name;a.style.cssText='display:block;padding:14px;color:var(--tape-deep)';
 (document.querySelector('main')||document.body).appendChild(a);a.click();
}
window.PackingExport={flatten:flat,csv:csv,download:download};
})();
