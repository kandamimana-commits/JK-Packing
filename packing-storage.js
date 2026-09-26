(function () {
  'use strict';
  var cache = Object.create(null), dbPromise, inflight = 0;
  var keys = ['pi_packing_manual', 'pi_packing_products'];
  function open() {
    if (!dbPromise) dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('เบราว์เซอร์ไม่รองรับ IndexedDB')); return; }
      var request = indexedDB.open('jk888-packing-storage-v1', 1);
      request.onupgradeneeded = function () { request.result.createObjectStore('values'); };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
      request.onblocked = function () { reject(new Error('กรุณาปิดแท็บ Packing อื่นแล้วลองใหม่')); };
    });
    return dbPromise;
  }
  async function get(key) {
    var db = await open();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('values', 'readonly'), request = tx.objectStore('values').get(key);
      tx.oncomplete = function () { resolve(request.result == null ? null : request.result); };
      tx.onabort = tx.onerror = function () { reject(tx.error || new Error('อ่านข้อมูลในเครื่องไม่สำเร็จ')); };
    });
  }
  async function put(entries) {
    var db = await open();
    inflight++;
    try { await new Promise(function (resolve, reject) {
      var tx = db.transaction('values', 'readwrite'), store = tx.objectStore('values');
      Object.keys(entries).forEach(function (key) { store.put(entries[key], key); });
      tx.oncomplete = resolve;
      tx.onabort = tx.onerror = function () { reject(tx.error || new Error('พื้นที่เก็บข้อมูลไม่พร้อม กรุณาอย่าปิดหน้านี้')); };
    }); } finally { inflight--; }
  }
  var ready = (async function () {
    for (var key of keys) {
      var saved = await get(key);
      if (saved === null) {
        var original = localStorage.getItem(key);
        var changes = {}; changes[key] = original || '[]';
        if (original !== null) changes['backup:original:' + key] = original;
        await put(changes);
        saved = changes[key];
      }
      cache[key] = saved;
    }
  })();
  // A rejected startup is handled by the login UI, never silently replaced with empty data.
  ready.catch(function () {});
  window.addEventListener('beforeunload', function (event) {
    if (inflight) { event.preventDefault(); event.returnValue = ''; }
  });
  window.PackingStore = {
    ready: ready,
    legacyData: async function () {
      await ready;
      var raw=[cache.pi_packing_manual,await get('backup:original:pi_packing_manual'),await get('backup:pending')];
      ((await get('recovery-copies'))||[]).forEach(function(x){raw.push(x.data);});
      var rows=[];raw.forEach(function(text){try{var data=JSON.parse(text||'[]');if(Array.isArray(data))rows=rows.concat(data);}catch(_){}});
      return rows;
    },
    saveDraft: function (draft) { var row={}; row['direct-draft:'+draft.id]=Object.assign({kind:'packing-direct-draft'},draft); return put(row); },
    finishDraft: function (id) { var row={}; row['direct-draft:'+id]=null; return put(row); },
    listDrafts: async function (userId) {
      var db=await open();
      return new Promise(function(resolve,reject){
        var tx=db.transaction('values','readonly'), request=tx.objectStore('values').getAll();
        tx.oncomplete=function(){resolve(request.result.filter(function(x){return x && x.kind==='packing-direct-draft' && x.userId===userId;}));};
        tx.onabort=tx.onerror=function(){reject(tx.error||new Error('อ่านฉบับร่างไม่สำเร็จ'));};
      });
    },
    getItem: function (key) { return cache[key] == null ? null : cache[key]; },
    setItem: async function (key, value, cloudConfirmed) {
      await ready;
      if (!keys.includes(key)) throw new Error('Unknown Packing storage key');
      value = String(value);
      if (!Array.isArray(JSON.parse(value))) throw new Error('รูปแบบข้อมูล Packing ไม่ถูกต้อง');
      var changes = {}; changes[key] = value;
      if (key === 'pi_packing_manual') {
        if (cloudConfirmed) changes['pending'] = false;
        else { changes['pending'] = true; changes['backup:pending'] = value; }
      }
      await put(changes); // Wait for transaction COMMIT before showing any success.
      cache[key] = value;
      if (key === 'pi_packing_manual' && !cloudConfirmed) window.dispatchEvent(new CustomEvent('packinglocalchanged'));
    },
    hasPending: async function () { await ready; return !!(await get('pending')); },
    preservePending: async function () {
      await ready;
      if (!(await get('pending'))) return;
      var copies = (await get('recovery-copies')) || [];
      copies.push({ savedAt: new Date().toISOString(), data: await get('backup:pending') });
      await put({ 'recovery-copies': copies });
    },
    downloadBackup: async function () {
      await ready;
      var content = { savedAt: new Date().toISOString(), original: await get('backup:original:pi_packing_manual'), recovered: await get('recovery-copies'), pending: await get('backup:pending'), current: cache.pi_packing_manual };
      var url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
      var a = document.createElement('a'); a.href = url; a.download = 'packing-recovery-backup.json'; a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    },
    // Auth uses its own namespace; no access-token writes to localStorage.
    // No fallback to legacy tokens: a logged-out session must not resurrect.
    auth: {
      getItem: function (key) { return get('auth:' + key); },
      setItem: function (key, value) { var row = {}; row['auth:' + key] = value; return put(row); },
      removeItem: function (key) { var row = {}; row['auth:' + key] = null; return put(row); }
    }
  };
})();
