(function(){
  'use strict';
  var client = window.supabase.createClient(
    'https://fmjjzhrunvgghevvhfyb.supabase.co',
    'sb_publishable_yVPu0Ip5Mx82KUH0MhRUwA_Vybrl-Uc',
    {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'packing-public-report'}}
  );

  var busy=false,lastLoad=0;
  var status=document.createElement('div');status.setAttribute('role','status');status.style.cssText='padding:12px;color:inherit';
  var message=document.createElement('span'),retry=document.createElement('button');retry.textContent='โหลดข้อมูลล่าสุด';retry.onclick=loadPublicReport;
  status.append(message,retry);(document.querySelector('main')||document.body).prepend(status);

  async function loadPublicReport(){
    if(busy)return;busy=true;retry.disabled=true;message.textContent='กำลังโหลดรายงานจาก Supabase… ';
    try {
      var result = await client.rpc('packing_web_snapshot');
      if(result.error) throw result.error;
      if(!result.data||!Array.isArray(result.data.sessions))throw Error('ข้อมูลรายงานไม่ครบ');
      window.PackingPublicRows = result.data.sessions;lastLoad=Date.now();
      window.dispatchEvent(new CustomEvent('packingpublicready'));
      message.textContent='ข้อมูลจาก Supabase อัปเดตแล้ว '+new Date().toLocaleTimeString('th-TH')+' ';
    } catch(error) {
      message.textContent='โหลดรายงานไม่สำเร็จ — '+(/Could not find the function.*packing_web_/.test(error.message)||error.code==='PGRST202'?'กรุณารัน packing-supabase-direct.sql ในโปรเจ็กต์ Packing':error.message)+' (อย่าใช้ยอดเดิมเป็นยอดล่าสุด) ';
    } finally {busy=false;retry.disabled=false;}
  }
  if(typeof BroadcastChannel==='function'){var channel=new BroadcastChannel('jk888-packing-changes');channel.onmessage=loadPublicReport;}
  window.addEventListener('focus',function(){if(Date.now()-lastLoad>15000)loadPublicReport();});
  loadPublicReport();
})();
