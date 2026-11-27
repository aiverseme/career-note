/* ============================================================
   store.js — 데이터 저장 담당 (Supabase 버전)
   ------------------------------------------------------------
   작동 방식
   1) 로그인하면 내 데이터를 Supabase에서 한 번에 불러와 메모리에 둡니다.
   2) 화면은 메모리의 데이터로 바로 그립니다 (빠름).
   3) 저장·삭제하면 메모리를 먼저 바꾸고, 뒤에서 Supabase에 보냅니다.
   4) 다른 기기에서 바꾼 내용은 이 창으로 돌아올 때 다시 불러옵니다.

   Supabase의 표
   - records  : id, kind(종류), data(내용 전체), user_id(주인)
                kind = events(일정) / careers(커리어) / expenses(지출) / payments(정기결제)
   - profiles : 이력서 머리글(이름·직함·소개)
   ============================================================ */
const Store = (() => {
  const KINDS = ['events', 'careers', 'expenses', 'payments', 'incomes'];
  const LEGACY_KEY = 'career-note-v1';             // 1단계(브라우저 저장) 때 쓰던 이름
  // flowType 'pkce': Google 로그인 후 돌아올 때 주소에 ?code=... 를 붙여 안전하게 로그인 처리
  const sb = supabase.createClient(CONFIG.url, CONFIG.key, { auth: { flowType: 'pkce', detectSessionInUrl: true } });
  const appUrl = () => location.origin + location.pathname;
  const data = { events: [], careers: [], expenses: [], payments: [], incomes: [], profile: {} };
  let user = null, lastLoad = 0, pending = 0;
  const listeners = [], statusListeners = [], errorListeners = [];

  const notify = () => listeners.forEach(fn => fn());
  const status = () => statusListeners.forEach(fn => fn(pending ? 'saving' : 'saved'));
  const fail = msg => errorListeners.forEach(fn => fn(msg));
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const valid = x => x && typeof x === 'object' && typeof x.id === 'string';

  // 뒤에서 Supabase에 보내는 일: 실패하면 알려 주고 다시 불러와 화면을 맞춥니다
  async function send(job) {
    pending++; status();
    try { const { error } = await job(); if (error) throw error; }
    catch (e) { console.error(e); fail('저장하지 못했어요. 인터넷 연결을 확인해 주세요.'); await load(); }
    finally { pending--; status(); }
  }

  // 내 데이터 전부 불러오기
  async function load() {
    if (!user) return;
    // Supabase는 한 번에 1,000줄까지만 보내 줘서, 1,000줄씩 나눠 받아요
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data: part, error } = await sb.from('records').select('id, kind, data').order('id').range(from, from + 999);
      if (error) { fail('데이터를 불러오지 못했어요.'); return; }
      rows.push(...part);
      if (part.length < 1000) break;
    }
    const prof = await sb.from('profiles').select('data').maybeSingle();
    KINDS.forEach(k => { data[k] = []; });
    rows.forEach(r => { if (data[r.kind]) data[r.kind].push({ ...r.data, id: r.id }); });
    data.profile = prof.data?.data || {};
    lastLoad = Date.now();
    notify();
  }

  // 여러 개를 한꺼번에 보내기 (가져오기용)
  async function upsertMany(rows) {
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb.from('records').upsert(rows.slice(i, i + 200));
      if (error) throw error;
    }
  }

  // 다른 기기에서 바꾼 내용 반영: 이 창으로 돌아오면 1분마다 한 번 새로 불러옴
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && user && !pending && Date.now() - lastLoad > 60000) load();
  });

  return {
    /* ----- 로그인 ----- */
    async init() {
      const { data: s } = await sb.auth.getSession();   // Google에서 돌아온 경우 여기서 로그인 완료
      const q = new URLSearchParams(location.search);
      const oauthError = q.get('error_description');
      if (q.has('code') || q.has('error')) history.replaceState(null, '', appUrl() + location.hash);  // 주소창 정리
      if (oauthError) throw new Error(oauthError);
      user = s.session?.user || null;
      sb.auth.onAuthStateChange((_e, session) => { user = session?.user || null; });
      if (user) await load();
      return user;
    },
    get user() { return user; },
    async signIn(email, password) {
      const { data: d, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      user = d.user; await load(); return user;
    },
    // Google 계정으로 로그인·가입 (처음이면 자동으로 가입돼요)
    async signInWithGoogle() {
      const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: appUrl() } });
      if (error) throw error;               // 성공하면 Google 화면으로 이동합니다
    },
    async signUp(email, password) {
      const redirect = /^https?:/.test(location.protocol) ? appUrl() : undefined;
      const { data: d, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirect } });
      if (error) throw error;
      if (d.session) { user = d.user; await load(); }
      return !!d.session;                    // false면 메일 확인이 필요해요
    },
    async changePassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
    },
    async signOut() {
      await sb.auth.signOut(); user = null;
      KINDS.forEach(k => { data[k] = []; }); data.profile = {};
    },
    reload: load,

    /* ----- 읽기 ----- */
    list: kind => data[kind],
    get: (kind, id) => data[kind].find(x => x.id === id),
    profile: () => data.profile,
    count: () => KINDS.reduce((o, k) => (o[k] = data[k].length, o), {}),

    /* ----- 쓰기 ----- */
    save(kind, obj) {
      const item = { ...obj, updated: Date.now() };
      if (!item.id) { item.id = newId(); item.created = Date.now(); data[kind].push(item); }
      else {
        const i = data[kind].findIndex(x => x.id === item.id);
        if (i >= 0) data[kind][i] = item; else data[kind].push(item);
      }
      notify();
      const { id, ...body } = item;
      send(() => sb.from('records').upsert({ id, kind, data: body, user_id: user.id }));
      return item;
    },
    remove(kind, id) {
      data[kind] = data[kind].filter(x => x.id !== id); notify();
      send(() => sb.from('records').delete().eq('id', id));
    },
    removeWhere(fn) {
      const ids = KINDS.flatMap(k => data[k].filter(fn).map(x => x.id));
      KINDS.forEach(k => { data[k] = data[k].filter(x => !fn(x)); }); notify();
      if (ids.length) send(() => sb.from('records').delete().in('id', ids));
    },
    saveProfile(p) {
      data.profile = { ...p }; notify();
      send(() => sb.from('profiles').upsert({ user_id: user.id, data: data.profile }));
    },
    async clear() {
      KINDS.forEach(k => { data[k] = []; }); notify();
      await send(() => sb.from('records').delete().eq('user_id', user.id));
    },

    /* ----- 백업·옮기기 ----- */
    exportAll() {
      return JSON.stringify({ app: 'teaching-log', version: 2, exported: new Date().toISOString(), ...data }, null, 2);
    },
    async importAll(text, mode) {
      const d = JSON.parse(text);
      if (!d || typeof d !== 'object') throw new Error('형식이 맞지 않아요');
      if (mode === 'replace') { const { error } = await sb.from('records').delete().eq('user_id', user.id); if (error) throw error; }
      const rows = KINDS.flatMap(k => (Array.isArray(d[k]) ? d[k] : []).filter(valid)
        .map(({ id, ...body }) => ({ id, kind: k, data: body, user_id: user.id })));
      await upsertMany(rows);
      if (d.profile && typeof d.profile === 'object' && Object.keys(d.profile).length && (mode === 'replace' || !Object.keys(data.profile).length))
        await sb.from('profiles').upsert({ user_id: user.id, data: d.profile });
      await load();
      return rows.length;
    },
    // 1단계 때 이 브라우저에 저장해 둔 데이터가 있으면 그 내용을 돌려줌
    legacy() {
      try { const raw = localStorage.getItem(LEGACY_KEY); if (!raw) return null; const d = JSON.parse(raw);
        const n = KINDS.reduce((s, k) => s + (Array.isArray(d[k]) ? d[k].filter(x => !x.sample).length : 0), 0);
        return n ? { raw, n } : null; } catch (e) { return null; }
    },
    forgetLegacy() { try { localStorage.removeItem(LEGACY_KEY); } catch (e) {} },

    /* ----- 알림 받기 ----- */
    onChange(fn) { listeners.push(fn); },
    onStatus(fn) { statusListeners.push(fn); },
    onError(fn) { errorListeners.push(fn); }
  };
})();
