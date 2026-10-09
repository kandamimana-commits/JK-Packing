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
var select=document.getElementById('archiveSelect'),button=document.getElementById('archiveDownload');
if(!select)return;
var message=document.getElementById('archiveStatus'),listBusy=false;
async function list(){
 if(listBusy)return;listBusy=true;button.disabled=true;
 try{
  var result=await window.PackingCloud.client.rpc('packing_archive_list');if(result.error)throw result.error;
  if(!Array.isArray(result.data))throw Error('รายการแบ็กอัพไม่ครบ');
  var value=select.value;select.replaceChildren();
  result.data.forEach(function(b){var o=document.createElement('option');o.value=b.id;o.textContent=b.label;select.appendChild(o);});
  if(result.data.some(function(b){return b.id===value;}))select.value=value;
  button.disabled=!result.data.length;
  message.textContent=result.data.length?'เลือกสำเนาที่ต้องการ แต่ละสำเนาแยกกัน ไม่รวมยอดซ้ำ':'ยังไม่มีแบ็กอัพที่ปิดรอบ';
 }catch(e){message.textContent='โหลดแบ็กอัพไม่สำเร็จ: '+(e.code==='PGRST202'?'กรุณารัน packing-archive-upgrade.sql ใน JK-Packing':e.message);}
 finally{listBusy=false;}
}
button.onclick=async function(){
 if(button.disabled||!select.value)return;button.disabled=true;select.disabled=true;message.textContent='กำลังอ่านแบ็กอัพจาก Supabase…';
 try{
  var result=await window.PackingCloud.client.rpc('packing_archive_read',{p_id:select.value});if(result.error)throw result.error;
  if(!Array.isArray(result.data)||!result.data.length)throw Error('ไม่พบข้อมูลในสำเนาที่เลือก');
  var rows=flat(result.data),month=rows[0].date.slice(0,7);
  download(result.data,'คนแพ็ค_'+month+'_backup_'+(select.value.startsWith('csv:')?'CSVเดิม':'Cloud')+'.csv');
  message.textContent='เตรียมดาวน์โหลด '+rows.length.toLocaleString()+' แถว รวม '+rows.reduce(function(n,r){return n+r.qty;},0).toLocaleString()+' ชิ้น — ข้อมูลยังอยู่ในแบ็กอัพ';
 }catch(e){message.textContent='ดาวน์โหลดไม่สำเร็จ: '+e.message;}
 finally{button.disabled=false;select.disabled=false;}
};
document.getElementById('archiveRefresh').onclick=list;
window.addEventListener('packingcloudready',list);
})();
