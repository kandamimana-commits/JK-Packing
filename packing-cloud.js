(function(){
  'use strict';
  var store=window.PackingStore;
  var client=window.supabase.createClient('https://fmjjzhrunvgghevvhfyb.supabase.co','sb_publishable_yVPu0Ip5Mx82KUH0MhRUwA_Vybrl-Uc',{
    auth:{storage:store.auth,storageKey:'jk888-packing-auth-v2'},
    global:{fetch:function(url,options){
      options=options||{}; var controller=new AbortController();
      var abort=function(){controller.abort();};
      if(options.signal){if(options.signal.aborted)abort();else options.signal.addEventListener('abort',abort,{once:true});}
      var timer=setTimeout(abort,30000);
      return fetch(url,Object.assign({},options,{signal:controller.signal})).finally(function(){
        clearTimeout(timer);if(options.signal)options.signal.removeEventListener('abort',abort);
      });
    }}
  });
  var state={ready:false,busy:false,profile:null,userId:null,sessions:[],catalog:{names:[],revision:0},draft:null,lastLoad:0};
  var channel=typeof BroadcastChannel==='function'?new BroadcastChannel('jk888-packing-changes'):null;
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function lockWork(on){document.querySelectorAll('main,.wrap').forEach(function(el){el.inert=on;});}
  function notify(message,bad){if(typeof window.showToast==='function')window.showToast(message,!!bad);}
  function storageError(error){
    var text=error&&error.message||'เชื่อมต่อไม่สำเร็จ';
    if(error&&error.code==='PGRST202'||/Could not find the function.*packing_web_/.test(text))return 'กรุณารัน packing-supabase-direct.sql ในโปรเจ็กต์ JK-Packing ก่อนใช้เว็บรุ่นนี้';
    if(/DATA_CHANGED/.test(text))return 'ข้อมูลถูกเปลี่ยนจากอีกหน้าหรือไม่มีสิทธิ์แก้ กรุณาเก็บฉบับร่างและโหลดข้อมูลล่าสุดก่อนตรวจเทียบ';
    if(error&&error.name==='QuotaExceededError')return 'พื้นที่เก็บฉบับร่างในเครื่องไม่พอ ยังไม่ได้ส่งงาน กรุณาอย่าล้างข้อมูลเว็บไซต์';
    if(error&&error.name==='AbortError')return 'การเชื่อมต่อใช้เวลานานเกินไป ยังยืนยันผลไม่ได้ ใช้ปุ่มลองส่งคำขอเดิม ห้ามกรอกซ้ำ';
    return text;
  }
  function status(text,bad){
    var box=document.getElementById('packingDirectStatus');
    if(!box){box=document.createElement('div');box.id='packingDirectStatus';box.setAttribute('role','status');box.style.cssText='position:fixed;left:20px;bottom:14px;z-index:9400;max-width:min(540px,90vw);padding:10px 14px;border-radius:10px;color:white;font:14px system-ui';document.body.appendChild(box);}
    box.style.background=bad?'#773d3d':'#315b47';box.textContent=text;
  }
  function publish(){window.dispatchEvent(new CustomEvent('packingcloudready'));if(channel)channel.postMessage('changed');}
  async function snapshot(){
    var result=await client.rpc('packing_web_snapshot');
    if(result.error)throw result.error;
    if(!result.data||!Array.isArray(result.data.sessions)||!result.data.catalog)throw Error('ข้อมูลจากฐานข้อมูลไม่ครบ');
    state.sessions=result.data.sessions;state.catalog=result.data.catalog;state.lastLoad=Date.now();
  }
  async function refresh(){
    if(!state.ready||state.busy)return;
    state.busy=true;lockWork(true);
    try{await snapshot();window.dispatchEvent(new CustomEvent('packingcloudready'));status('อ่านข้อมูลล่าสุดจาก Supabase แล้ว');}
    catch(e){status('โหลดล่าสุดไม่สำเร็จ: '+storageError(e),true);}
    finally{state.busy=false;lockWork(!!state.draft);}
  }
  function download(value,name){
    var url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
    var a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(url);},10000);
  }
  function draftPanel(){
    var box=document.getElementById('packingDirectDraft');if(box)box.remove();
    if(!state.draft)return;
    box=document.createElement('aside');box.id='packingDirectDraft';
    box.style.cssText='position:fixed;right:16px;bottom:70px;z-index:9500;max-width:420px;padding:18px;border-radius:14px;background:#5b3030;color:white';
    var text=document.createElement('p');text.textContent='มีคำขอที่ยังไม่ได้ยืนยันผล กรุณาลองส่งคำขอเดิมก่อนทำงานต่อ เพื่อไม่ให้บันทึกซ้ำ';box.appendChild(text);
    var retry=document.createElement('button');retry.textContent='ลองส่งคำขอเดิม';
    retry.onclick=async function(){retry.disabled=true;try{await sendDraft(state.draft);location.reload();}catch(e){status(storageError(e),true);retry.disabled=false;}};
    var backup=document.createElement('button');backup.textContent='ดาวน์โหลดฉบับร่าง';backup.onclick=function(){download(state.draft,'packing-unsent-request.json');};
    var resolve=document.createElement('button');resolve.textContent='ตรวจผล / ยกเลิกฉบับร่าง';
    resolve.onclick=async function(){
      if(state.busy)return;resolve.disabled=true;
      try{
        if(!confirm('ตรวจผลคำขอนี้กับ Supabase: ถ้าบันทึกแล้วจะคงข้อมูลไว้ ถ้ายังไม่บันทึกจะยกเลิกคำขอเดิมและดาวน์โหลดฉบับร่างให้ตรวจแก้ ยืนยันหรือไม่?'))return;
        var result=await client.rpc('packing_web_cancel',{p_request_id:state.draft.id,p_changes:state.draft.changes});
        if(result.error)throw result.error;
        if(!result.data||(!result.data.cancelled&&!Array.isArray(result.data.saved)))throw Error('ยังตรวจผลไม่ได้ กรุณาเก็บฉบับร่างไว้');
        if(result.data.cancelled)download(state.draft,'packing-cancelled-draft.json');
        await store.finishDraft(state.draft.id);state.draft=null;location.reload();
      }catch(e){status(storageError(e),true);}finally{resolve.disabled=false;}
    };
    box.append(retry,backup,resolve);document.body.appendChild(box);
  }
  async function sendDraft(draft){
    if(state.busy)throw Error('กำลังทำรายการ กรุณารอ');
    state.busy=true;lockWork(true);status('กำลังบันทึกตรงเข้า Supabase…');
    try{
      var result=await client.rpc('packing_web_commit',{p_request_id:draft.id,p_changes:draft.changes});
      if(result.error)throw result.error;
      var data=result.data;
      if(data&&data.cancelled)throw Error('คำขอนี้ถูกยกเลิกแล้ว ใช้ปุ่มตรวจผลเพื่อปิดฉบับร่างก่อนแก้ไขใหม่');
      if(!data||!Array.isArray(data.saved)||!Array.isArray(data.deleted))throw Error('ยังไม่ได้รับการยืนยันครบ กรุณาลองส่งคำขอเดิม');
      var replaced=new Set(data.deleted.concat(data.saved.map(function(x){return x._cloudId;})));
      state.sessions=state.sessions.filter(function(x){return !replaced.has(x._cloudId);}).concat(data.saved).sort(function(a,b){return b.date.localeCompare(a.date)||a._cloudId.localeCompare(b._cloudId);});
      if(data.catalog)state.catalog=data.catalog;
      var draftClosed=true;
      try{await store.finishDraft(draft.id);}catch(e){draftClosed=false;}
      state.draft=draftClosed?null:draft;draftPanel();publish();
      status(draftClosed?'บันทึกสำเร็จ — Supabase ยืนยันแล้ว':'Supabase บันทึกแล้ว แต่ปิดฉบับร่างในเครื่องไม่ได้ คำขอเดิมสามารถตรวจผลซ้ำได้',!draftClosed);
      if(data.replayed){try{await snapshot();window.dispatchEvent(new CustomEvent('packingcloudready'));}catch(e){status('คำขอเดิมบันทึกสำเร็จแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ กรุณารีเฟรชก่อนแก้ต่อ',true);}}
      return data;
    }catch(e){draftPanel();status('ยังไม่ยืนยันการบันทึก: '+storageError(e),true);throw e;}
    finally{state.busy=false;lockWork(!!state.draft);}
  }
  async function commit(changes){
    if(!state.ready)throw Error('ยังโหลดข้อมูลไม่สำเร็จ');
    if(state.busy)throw Error('กำลังทำรายการ กรุณารอ');
    if(state.draft)throw Error('มีคำขอค้าง กรุณาใช้ปุ่มลองส่งคำขอเดิมก่อน');
    var draft={id:crypto.randomUUID(),userId:state.userId,createdAt:new Date().toISOString(),changes:clone(changes)};
    // Keep ONLY the operation as a recovery draft; never use it as the report/database.
    state.busy=true;lockWork(true);
    try{await store.saveDraft(draft);state.draft=draft;}finally{state.busy=false;lockWork(!!state.draft);}
    return sendDraft(draft);
  }
  function changeFor(session){
    var id=session._cloudId||null;
    if(id&&!session._version)throw Error('ไม่มีเวอร์ชันข้อมูล กรุณาโหลดล่าสุด');
    return {action:'save',id:id,expected:session._version||null,data:clone(session)};
  }
  window.PackingCloud={
    client:client,read:function(){return clone(state.sessions);},products:function(){return clone(state.catalog.names);},
    saveSession:function(session){return commit({sessions:[changeFor(session)]});},
    deleteSessions:function(sessions){return commit({sessions:sessions.map(function(s){if(!s._cloudId||!s._version)throw Error('ไม่มีรหัสหรือเวอร์ชันรายการ');return {action:'delete',id:s._cloudId,expected:s._version};})});},
    saveProducts:function(names){return commit({sessions:[],catalog:{names:names,expected:state.catalog.revision}});},
    refresh:refresh
  };
  function showLogin(){
    if(document.getElementById('packingLoginOverlay')) return;
    var el = document.createElement('div');
    el.id = 'packingLoginOverlay';
    el.innerHTML = '' +
      '<style>' +
        '#packingLoginOverlay{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:20px;background:rgba(28,19,12,.82);backdrop-filter:blur(5px)}' +
        '#packingLoginBox{width:min(410px,100%);padding:30px;border:1px solid #73583b;border-radius:18px;background:#2d2115;color:#fff7e9;box-shadow:0 24px 70px rgba(0,0,0,.45)}' +
        '#packingLoginBox h1{font-size:24px;margin:0 0 8px}#packingLoginBox p{color:#d8b991;font-size:14px;line-height:1.55}' +
        '#packingLoginBox label{display:block;margin:16px 0 6px;font-size:13px;color:#edcfaa}#packingLoginBox input{box-sizing:border-box;width:100%;height:44px;border:1px solid #795d3b;border-radius:9px;padding:0 12px;background:#21170e;color:#fff7e9}' +
        '#packingLoginButton{width:100%;margin-top:20px;height:45px;border:0;border-radius:9px;background:#ff8967;color:#29170f;font-weight:800;cursor:pointer}#packingLoginMessage{min-height:20px;margin:12px 0 0;font-size:13px;color:#ffb4a2}' +
      '</style>' +
      '<div id="packingLoginBox"><h1>JK888 Packing</h1><p>กรุณาเข้าสู่ระบบก่อนใช้งานข้อมูลแพ็ก</p>' +
      '<label for="packingLoginEmail">อีเมล</label><input id="packingLoginEmail" type="email" autocomplete="email" required>' +
      '<label for="packingLoginPassword">รหัสผ่าน</label><input id="packingLoginPassword" type="password" autocomplete="current-password" required>' +
      '<button id="packingLoginButton" type="button">เข้าสู่ระบบ</button><p id="packingLoginMessage" role="status"></p>' +
      '<a href="packing-reset-password.html" style="display:inline-block;padding:8px 0;color:#ffb49c">ลืมรหัสผ่าน / ตั้งรหัสใหม่</a></div>';
    document.body.appendChild(el);
    document.getElementById('packingLoginButton').addEventListener('click', async function(){
      var email = document.getElementById('packingLoginEmail').value.trim();
      var password = document.getElementById('packingLoginPassword').value;
      var msg = document.getElementById('packingLoginMessage');
      if(!email || !password){ msg.textContent = 'กรอกอีเมลและรหัสผ่านก่อน'; return; }
      var button = document.getElementById('packingLoginButton');
      if(button.disabled) return;
      button.disabled = true;
      msg.textContent = 'กำลังยืนยันบัญชี…';
      var waiting = setTimeout(function(){msg.textContent='ยังรอการเชื่อมต่ออยู่ กรุณาอย่ากดซ้ำ หากค้างให้ส่งข้อความผิดพลาดแก่ผู้ดูแล';},15000);
      try {
        await store.ready;
        var result = await client.auth.signInWithPassword({email:email, password:password});
        if(result.error) throw result.error;
        document.getElementById('packingLoginPassword').value = '';
        clearTimeout(waiting);
        msg.textContent = 'ยืนยันบัญชีแล้ว กำลังโหลดข้อมูลงานแพ็ก…';
        await bootstrap();
      } catch(error) {
        msg.textContent = 'เข้าสู่ระบบไม่สำเร็จ: ' + storageError(error);
      } finally { clearTimeout(waiting); button.disabled = false; }
    });
  }

  function renderAccountButton(){
    if(document.getElementById('packingAccountButton')) return;
    var button = document.createElement('button');
    button.id = 'packingAccountButton';
    button.type = 'button';
    button.title = 'ออกจากระบบ';
    button.textContent = (state.profile && state.profile.display_name ? state.profile.display_name : 'บัญชีผู้ใช้') + ' · ออกจากระบบ';
    button.style.cssText = 'position:fixed;right:18px;top:16px;z-index:9000;border:1px solid #765838;border-radius:999px;padding:9px 13px;background:#2d2115;color:#fff3df;font:600 12px system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 22px rgba(0,0,0,.2)';
    button.addEventListener('click', async function(){
      if(!confirm('ออกจากระบบใช่ไหม?')) return;
      await client.auth.signOut();
      location.reload();
    });
    document.body.appendChild(button);
  }


  function fingerprint(s){
    return JSON.stringify([s.date,s.packer,(s.products||[]).map(function(p){return [p.product,Number(p.qty),p.orderDateFrom||'',p.orderDateTo||''];}).sort(function(a,b){return JSON.stringify(a).localeCompare(JSON.stringify(b));})]);
  }
  async function recoveryPanel(){
    var legacy=await store.legacyData();
    var catalog=[];try{catalog=JSON.parse(store.getItem('pi_packing_products')||'[]');}catch(_){}
    var ids=new Set(state.sessions.map(function(s){return s._cloudId;})), signatures=new Set(state.sessions.map(fingerprint));
    var offered=new Set();
    var candidates=legacy.filter(function(s){var key=fingerprint(s);if(ids.has(s._cloudId)||signatures.has(key)||offered.has(key))return false;offered.add(key);return true;});
    var missing=catalog.filter(function(n){return !state.catalog.names.includes(n);});
    var previous=document.getElementById('packingLegacyReview');if(previous)previous.remove();
    if(!candidates.length&&!missing.length)return;
    var panel=document.createElement('details');panel.id='packingLegacyReview';panel.style.cssText='padding:18px;border:1px solid #b88562;border-radius:12px;margin:16px;background:#473222;color:#fff';
    var title=document.createElement('summary');title.textContent='ตรวจข้อมูลเก่าในเครื่อง: รอบงานอาจยังไม่มีบน Cloud '+candidates.length+' รอบ / ชื่อสินค้า '+missing.length+' ชื่อ';panel.appendChild(title);
    var note=document.createElement('p');note.textContent='ยังไม่ได้นำเข้าอัตโนมัติ ตรวจแต่ละรอบก่อนเลือก รายการที่มีรหัสหรือรายละเอียดตรงกับ Cloud จะไม่เสนอให้นำเข้าซ้ำ';panel.appendChild(note);
    var choices=[];
    candidates.forEach(function(s){
      var label=document.createElement('label');label.style.display='block';var checkbox=document.createElement('input');checkbox.type='checkbox';
      label.append(checkbox,document.createTextNode(' '+s.date+' · '+s.packer+' · '+(s.products||[]).map(function(p){return p.product+' × '+p.qty;}).join(', ')));panel.appendChild(label);choices.push({box:checkbox,row:s});
    });
    var importButton=document.createElement('button');importButton.textContent='นำเข้าเฉพาะรอบที่เลือก';
    importButton.onclick=async function(){
      var selected=choices.filter(function(x){return x.box.checked;});if(!selected.length)return;
      if(!confirm('ยืนยันสร้าง '+selected.length+' รอบจากข้อมูลเดิมที่ตรวจแล้วว่าไม่ซ้ำ?'))return;
      try{await commit({sessions:selected.map(function(x){var row=clone(x.row);delete row._cloudId;delete row._version;(row.products||[]).forEach(function(p){delete p._cloudId;});return changeFor(row);})});await recoveryPanel();}
      catch(e){notify(storageError(e),true);}
    };
    var namesButton=document.createElement('button');namesButton.textContent='นำเข้าชื่อสินค้าที่ขาด '+missing.length+' ชื่อ';namesButton.disabled=!missing.length;
    namesButton.onclick=async function(){if(!confirm('เพิ่มชื่อสินค้าที่ขาด '+missing.length+' ชื่อ โดยไม่ลบรายชื่อบน Cloud?'))return;try{await window.PackingCloud.saveProducts(Array.from(new Set(state.catalog.names.concat(missing))));await recoveryPanel();}catch(e){notify(storageError(e),true);}};
    var backup=document.createElement('button');backup.textContent='ดาวน์โหลดสำเนาข้อมูลเดิมทั้งหมด';backup.onclick=function(){store.downloadBackup().catch(function(e){notify(storageError(e),true);});};
    panel.append(importButton,namesButton,backup);var main=document.querySelector('main');if(main)main.prepend(panel);
  }
  async function bootstrap(){
    lockWork(true);state.ready=false;
    try{
      await store.ready;
      var session=await client.auth.getSession();if(session.error)throw session.error;
      if(!session.data.session){showLogin();return;}
      var current=await client.auth.getUser();if(current.error)throw current.error;if(!current.data.user)throw Error('กรุณาเข้าสู่ระบบใหม่');
      state.userId=current.data.user.id;
      var profile=await client.from('profiles').select('*').eq('id',state.userId).maybeSingle();if(profile.error)throw profile.error;
      state.profile=profile.data||{display_name:current.data.user.email,role:'worker'};
      await snapshot();
      var drafts=await store.listDrafts(state.userId);state.draft=drafts[0]||null;
      state.ready=true;window.PackingCloud.profile=state.profile;
      renderAccountButton();var overlay=document.getElementById('packingLoginOverlay');if(overlay)overlay.remove();
      status('ข้อมูลจาก Supabase · การบันทึกจะรอฐานข้อมูลยืนยัน');
      lockWork(!!state.draft);window.dispatchEvent(new CustomEvent('packingcloudready'));await recoveryPanel();draftPanel();
      var refreshButton=document.createElement('button');refreshButton.textContent='โหลดข้อมูลล่าสุด';refreshButton.onclick=refresh;refreshButton.style.cssText='position:fixed;right:18px;top:62px;z-index:9000';document.body.appendChild(refreshButton);
    }catch(e){showLogin();var message=document.getElementById('packingLoginMessage');if(message)message.textContent=storageError(e);}
  }
  if(channel)channel.onmessage=function(){if(state.ready&&!state.busy&&!state.draft&&!document.hidden){if(document.activeElement&&document.activeElement.matches('input,textarea,select,[contenteditable]'))status('มีข้อมูลใหม่บน Cloud — กดโหลดข้อมูลล่าสุดเมื่อกรอกเสร็จ');else refresh();}};
  // Do not replace in-progress form edits just because the browser regained focus.
  window.addEventListener('beforeunload',function(e){if(state.busy){e.preventDefault();e.returnValue='';}});
  bootstrap();
})();
