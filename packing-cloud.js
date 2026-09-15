(function(){
  'use strict';

  var SUPABASE_URL = 'https://fmjjzhrunvgghevvhfyb.supabase.co';
  var SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_yVPu0Ip5Mx82KUH0MhRUwA_Vybrl-Uc';
  var STORAGE_KEY = 'pi_packing_manual';
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  var state = { ready:false, hydrating:false, syncing:false, syncQueued:false, profile:null };

  function readLocal(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch(e) { return []; }
  }
  function writeLocal(data){
    state.hydrating = true;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    finally { state.hydrating = false; }
  }
  function notify(message, isError){
    if (typeof window.showToast === 'function') window.showToast(message, !!isError);
  }
  function escapeHtml(value){
    return String(value || '').replace(/[&<>'"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'})[c]; });
  }

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
      '<button id="packingLoginButton" type="button">เข้าสู่ระบบ</button><p id="packingLoginMessage"></p></div>';
    document.body.appendChild(el);
    document.getElementById('packingLoginButton').addEventListener('click', async function(){
      var email = document.getElementById('packingLoginEmail').value.trim();
      var password = document.getElementById('packingLoginPassword').value;
      var msg = document.getElementById('packingLoginMessage');
      if(!email || !password){ msg.textContent = 'กรอกอีเมลและรหัสผ่านก่อน'; return; }
      msg.textContent = 'กำลังเข้าสู่ระบบ…';
      var result = await client.auth.signInWithPassword({email:email, password:password});
      if(result.error){ msg.textContent = 'เข้าสู่ระบบไม่สำเร็จ: ' + result.error.message; return; }
      location.reload();
    });
  }

  async function loadProfile(){
    var userResult = await client.auth.getUser();
    if(!userResult.data.user) return null;
    var profileResult = await client.from('profiles').select('*').eq('id', userResult.data.user.id).maybeSingle();
    state.profile = profileResult.data || {display_name:userResult.data.user.email, role:'worker'};
    return state.profile;
  }

  function toLocalSession(row){
    var items = (row.packing_items || []).sort(function(a,b){ return String(a.created_at).localeCompare(String(b.created_at)); });
    return {
      _cloudId: row.id,
      _createdBy: row.created_by,
      date: row.packing_date,
      packer: row.packer_name,
      products: items.map(function(item){
        return { _cloudId:item.id, product:item.product, qty:Number(item.qty), orderDateFrom:item.order_date_from || '', orderDateTo:item.order_date_to || '' };
      }),
      totalQty: items.reduce(function(sum,item){ return sum + Number(item.qty || 0); }, 0),
      photo: row.photo_path ? {path:row.photo_path} : null,
      savedAt: row.created_at
    };
  }

  async function fetchCloudSessions(){
    var result = await client.from('packing_sessions')
      .select('id,packing_date,packer_name,photo_path,created_by,created_at,packing_items(id,product,qty,order_date_from,order_date_to,created_at)')
      .order('packing_date', {ascending:false});
    if(result.error) throw result.error;
    return (result.data || []).map(toLocalSession);
  }

  async function persistSession(session){
    var payload = { packing_date:session.date, packer_name:session.packer, photo_path:session.photo && session.photo.path ? session.photo.path : null };
    var id = session._cloudId;
    if(id){
      var updated = await client.from('packing_sessions').update(payload).eq('id', id).select('id').single();
      if(updated.error) throw updated.error;
      var deleted = await client.from('packing_items').delete().eq('session_id', id);
      if(deleted.error) throw deleted.error;
    } else {
      var inserted = await client.from('packing_sessions').insert(payload).select('id,created_by').single();
      if(inserted.error) throw inserted.error;
      id = inserted.data.id;
      session._cloudId = id;
      session._createdBy = inserted.data.created_by;
    }
    var itemRows = (session.products || []).map(function(item){
      return { session_id:id, product:item.product, qty:item.qty, order_date_from:item.orderDateFrom || null, order_date_to:item.orderDateTo || null };
    });
    if(itemRows.length){
      var itemsInserted = await client.from('packing_items').insert(itemRows).select('id');
      if(itemsInserted.error) throw itemsInserted.error;
      (session.products || []).forEach(function(item, index){ item._cloudId = itemsInserted.data[index].id; });
    }
  }

  function sessionChanged(local, cloud){
    if(!cloud || local.date !== cloud.date || local.packer !== cloud.packer) return true;
    var localPhoto = local.photo && local.photo.path ? local.photo.path : '';
    var cloudPhoto = cloud.photo && cloud.photo.path ? cloud.photo.path : '';
    if(localPhoto !== cloudPhoto || (local.products || []).length !== (cloud.products || []).length) return true;
    return (local.products || []).some(function(item, index){
      var other = cloud.products[index] || {};
      return item.product !== other.product || Number(item.qty) !== Number(other.qty) ||
        (item.orderDateFrom || '') !== (other.orderDateFrom || '') ||
        (item.orderDateTo || '') !== (other.orderDateTo || '');
    });
  }

  async function sync(){
    if(!state.ready || state.hydrating || state.syncing) return;
    state.syncing = true;
    try {
      var local = readLocal();
      var cloud = await fetchCloudSessions();
      var cloudById = {};
      cloud.forEach(function(s){ cloudById[s._cloudId] = s; });
      for(var i=0; i<local.length; i++){
        if(sessionChanged(local[i], cloudById[local[i]._cloudId])) await persistSession(local[i]);
      }
      if(state.profile && state.profile.role === 'admin'){
        var localIds = {};
        local.forEach(function(s){ if(s._cloudId) localIds[s._cloudId] = true; });
        for(var j=0; j<cloud.length; j++){
          if(!localIds[cloud[j]._cloudId]){
            var removed = await client.from('packing_sessions').delete().eq('id', cloud[j]._cloudId);
            if(removed.error) throw removed.error;
          }
        }
      }
      writeLocal(local);
      window.dispatchEvent(new CustomEvent('packingcloudsaved'));
    } catch(error) {
      console.error('Packing cloud sync error', error);
      notify('บันทึกขึ้นคลาวด์ไม่สำเร็จ: ' + error.message, true);
    } finally {
      state.syncing = false;
      if(state.syncQueued){ state.syncQueued = false; sync(); }
    }
  }

  function queueSync(){
    if(!state.ready || state.hydrating) return;
    if(state.syncing){ state.syncQueued = true; return; }
    window.setTimeout(sync, 150);
  }

  var nativeSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value){
    nativeSetItem.call(this, key, value);
    if(this === localStorage && key === STORAGE_KEY) queueSync();
  };

  async function bootstrap(){
    var sessionResult = await client.auth.getSession();
    if(!sessionResult.data.session){ showLogin(); return; }
    try {
      await loadProfile();
      var local = readLocal();
      var cloud = await fetchCloudSessions();
      if(local.some(function(s){ return !s._cloudId; })){
        state.ready = true;
        await sync();
        cloud = await fetchCloudSessions();
      }
      writeLocal(cloud);
      state.ready = true;
      window.PackingCloud = { client:client, profile:state.profile, sync:queueSync, signOut:async function(){ await client.auth.signOut(); location.reload(); } };
      window.dispatchEvent(new CustomEvent('packingcloudready', {detail:{profile:state.profile}}));
    } catch(error) {
      console.error('Packing cloud bootstrap error', error);
      showLogin();
      var box = document.getElementById('packingLoginMessage');
      if(box) box.textContent = 'เชื่อมข้อมูลไม่สำเร็จ: ' + escapeHtml(error.message);
    }
  }

  bootstrap();
})();
