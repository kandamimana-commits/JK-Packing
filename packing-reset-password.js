(function () {
  'use strict';
  var SUPABASE_URL = 'https://fmjjzhrunvgghevvhfyb.supabase.co';
  var PUBLIC_KEY = 'sb_publishable_yVPu0Ip5Mx82KUH0MhRUwA_Vybrl-Uc';
  var RESET_URL = 'https://kandamimana-commits.github.io/JK-Packing/packing-reset-password.html';
  var MARKER = 'packing-password-recovery-user';
  var byId = function (id) { return document.getElementById(id); };
  var fragment = new URLSearchParams(location.hash.slice(1));
  var query = new URLSearchParams(location.search);
  var callback = fragment.has('access_token') || fragment.has('error') || fragment.has('error_code') || query.has('code') || query.has('error');
  var recovery = fragment.get('type') === 'recovery';
  var linkError = fragment.has('error') || fragment.has('error_code') || query.has('error');
  var client, userId = null, busy = false, finished = false;

  function message(text, bad) {
    byId('message').textContent = text;
    byId('message').dataset.error = bad ? 'true' : 'false';
  }
  function scrubURL() {
    // Never leave recovery tokens in URLs, logs, links or business-data storage.
    if (location.hash || location.search) history.replaceState(null, '', location.pathname);
  }
  function requestView(text, bad) {
    userId = null;
    sessionStorage.removeItem(MARKER);
    byId('passwordForm').hidden = true;
    byId('requestForm').hidden = false;
    message(text || '', bad);
  }
  function errorText(error) {
    if (error && (error.status === 429 || /rate.limit|too many/i.test(error.message || ''))) return 'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองอีกครั้ง';
    if (error && error.code === 'same_password') return 'กรุณาเลือกรหัสใหม่ที่ไม่ซ้ำกับรหัสเดิม';
    if (error && error.code === 'weak_password') return 'รหัสยังไม่ผ่านเงื่อนไขของระบบ ลองเพิ่มความยาว ตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข และสัญลักษณ์';
    return 'ทำรายการไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง หากยังไม่ได้ให้ติดต่อผู้ดูแล (ไม่มีการเปลี่ยนข้อมูลแพ็ก)';
  }

  byId('requestForm').addEventListener('submit', async function (event) {
    event.preventDefault();
    if (busy || !client || !byId('requestForm').reportValidity()) return;
    busy = true;
    byId('requestButton').disabled = true;
    message('กำลังส่งคำขอ…');
    try {
      var result = await client.auth.resetPasswordForEmail(byId('email').value.trim(), { redirectTo: RESET_URL });
      if (result.error) throw result.error;
      message('หากอีเมลนี้มีบัญชีและระบบส่งอีเมลได้ จะได้รับลิงก์ตั้งรหัสใหม่ กรุณาตรวจกล่องจดหมายและสแปม แล้วใช้ลิงก์จากอีเมลฉบับล่าสุด');
    } catch (error) { message(errorText(error), true); }
    finally { busy = false; byId('requestButton').disabled = false; }
  });

  byId('passwordForm').addEventListener('submit', async function (event) {
    event.preventDefault();
    if (busy || finished || !userId || !byId('passwordForm').reportValidity()) return;
    var password = byId('password').value;
    if (password !== byId('confirmPassword').value) { message('รหัสผ่านทั้งสองช่องไม่ตรงกัน กรุณาตรวจอีกครั้ง', true); return; }
    busy = true;
    byId('saveButton').disabled = true;
    message('กำลังบันทึกรหัสใหม่…');
    try {
      // Revalidate the authenticated user immediately before changing the password.
      var current = await client.auth.getUser();
      if (current.error || !current.data.user || current.data.user.id !== userId) {
        requestView('ลิงก์หมดอายุหรือยืนยันบัญชีไม่ได้ กรุณาขอลิงก์ใหม่ด้านล่าง', true);
        return;
      }
      var result = await client.auth.updateUser({ password: password });
      if (result.error) throw result.error;
      finished = true;
      byId('password').value = '';
      byId('confirmPassword').value = '';
      byId('passwordForm').hidden = true;
      sessionStorage.removeItem(MARKER);
      byId('heading').textContent = 'ตั้งรหัสใหม่แล้ว';
      byId('intro').textContent = 'ครั้งต่อไปใช้อีเมลเดิมและรหัสผ่านใหม่เข้าสู่ Packing';
      // End recovery and other refresh sessions without changing business records.
      var signedOut;
      try { signedOut = await client.auth.signOut({ scope: 'global' }); }
      catch (_) { signedOut = { error: true }; }
      message(signedOut.error ? 'บันทึกรหัสใหม่สำเร็จ แต่ปิดเซสชันเดิมไม่สำเร็จ กรุณาออกจากระบบในหน้าที่เปิดค้างไว้ก่อนเข้าสู่ระบบใหม่' : 'บันทึกสำเร็จ กด “กลับไปเข้าสู่ระบบ Packing” ด้านล่างได้เลย');
    } catch (error) { message(errorText(error), true); }
    finally { busy = false; byId('saveButton').disabled = false; }
  });

  async function init() {
    if (!window.supabase) { scrubURL(); message('โหลดระบบเข้าสู่ระบบไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วเปิดลิงก์จากอีเมลใหม่อีกครั้ง', true); return; }
    try {
      // Isolate recovery from the app session. No packing data is read or synced here.
      // Implicit recovery links work even when opened in a different browser/device.
      if (callback) sessionStorage.removeItem(MARKER);
      scrubURL();
      client = window.supabase.createClient(SUPABASE_URL, PUBLIC_KEY, { auth: {
        flowType: 'implicit', detectSessionInUrl: false, persistSession: true,
        storage: sessionStorage, storageKey: 'jk888-packing-password-recovery'
      } });
      // Explicitly consume THIS link. Never fall back to an older session if it fails.
      if (linkError || (callback && (!recovery || !fragment.get('access_token') || !fragment.get('refresh_token')))) {
        requestView('ลิงก์หมดอายุหรือไม่สมบูรณ์ กรุณาขอลิงก์ใหม่ด้านล่าง', true); return;
      }
      var session = callback
        ? await client.auth.setSession({ access_token: fragment.get('access_token'), refresh_token: fragment.get('refresh_token') })
        : await client.auth.getSession();
      fragment = new URLSearchParams();
      if (linkError || session.error) { requestView('ลิงก์หมดอายุ ใช้ไปแล้ว หรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่ด้านล่าง', true); return; }
      if (session.data.session && (recovery || sessionStorage.getItem(MARKER))) {
        var verified = await client.auth.getUser();
        var user = verified.data && verified.data.user;
        if (verified.error || !user || (!recovery && sessionStorage.getItem(MARKER) !== user.id)) {
          requestView('ยืนยันบัญชีไม่ได้ กรุณาขอลิงก์ใหม่', true); return;
        }
        userId = user.id;
        sessionStorage.setItem(MARKER, user.id);
        byId('heading').textContent = 'ตั้งรหัสผ่านใหม่';
        byId('intro').textContent = 'กำหนดรหัสใหม่ให้บัญชีเดิม ข้อมูลแพ็กและสิทธิ์จะไม่ถูกลบ';
        byId('account').textContent = 'บัญชี: ' + (user.email || 'บัญชีที่ยืนยันแล้ว');
        byId('requestForm').hidden = true;
        byId('passwordForm').hidden = false;
        message('ยืนยันลิงก์แล้ว กรุณากรอกรหัสใหม่สองครั้ง');
      } else {
        requestView(callback ? 'ลิงก์ไม่สมบูรณ์หรือหมดอายุ กรุณาขอลิงก์ใหม่' : '', callback);
      }
    } catch (_) {
      scrubURL();
      byId('passwordForm').hidden = true;
      userId = null;
      message('เปิดระบบตั้งรหัสไม่ได้ กรุณาอนุญาตการเก็บข้อมูลเว็บไซต์และตรวจอินเทอร์เน็ต แล้วเปิดลิงก์จากอีเมลใหม่อีกครั้ง', true);
    }
  }
  init();
})();
