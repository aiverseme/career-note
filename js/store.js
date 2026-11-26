/* ============================================================
   store.js — 데이터 저장 담당
   ------------------------------------------------------------
   지금은 이 브라우저(localStorage)에 저장합니다.
   다음 단계에서 이 파일만 Supabase 버전으로 바꾸면
   화면 코드(app.js)는 거의 그대로 쓸 수 있어요.

   저장하는 데이터 4종류 + 프로필
   - events   : 일정 (수업·학습·업무·개인·성빈·오늘의 이슈)
   - careers  : 커리어 기록 (강의, 프로젝트, 수상, 연수 등)
   - expenses : 지출 (가계부)
   - payments : 정기 결제 (학원비, 구독료 등 매월 나가는 돈)
   - profile  : 이력서 머리글 (이름, 직함, 소개)
   ============================================================ */
const Store = (() => {
  const KEY = 'career-note-v1';
  const KINDS = ['events', 'careers', 'expenses', 'payments'];
  const data = { events: [], careers: [], expenses: [], payments: [], profile: {} };
  let persistent = true;          // 저장이 안 되는 환경이면 false
  const listeners = [];

  // 1) 처음 열 때: 저장된 데이터 불러오기
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) load(JSON.parse(raw), 'replace');
  } catch (e) { persistent = false; }

  // 받은 데이터를 안전하게 옮겨 담기 (모양이 이상한 항목은 건너뜀)
  function load(d, mode) {
    if (!d || typeof d !== 'object') throw new Error('형식이 맞지 않아요');
    KINDS.forEach(k => {
      if (!Array.isArray(d[k])) return;
      const items = d[k].filter(x => x && typeof x === 'object' && typeof x.id === 'string');
      if (mode === 'replace') { data[k] = items; return; }
      items.forEach(x => {                      // 합치기: 같은 id는 새 것으로 교체
        const i = data[k].findIndex(y => y.id === x.id);
        if (i >= 0) data[k][i] = x; else data[k].push(x);
      });
    });
    if (d.profile && typeof d.profile === 'object') data.profile = { ...data.profile, ...d.profile };
  }

  // 2) 바뀔 때마다: 저장하고, 화면에 "다시 그려!" 알리기
  function commit() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { persistent = false; }
    listeners.forEach(fn => fn());
  }

  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // 3) 밖에서 쓰는 기능들
  return {
    get persistent() { return persistent; },
    list: kind => data[kind],
    get: (kind, id) => data[kind].find(x => x.id === id),
    save(kind, obj) {
      const item = { ...obj };
      if (!item.id) { item.id = newId(); item.created = Date.now(); data[kind].push(item); }
      else {
        const i = data[kind].findIndex(x => x.id === item.id);
        if (i >= 0) data[kind][i] = item; else data[kind].push(item);
      }
      item.updated = Date.now();
      commit();
      return item;
    },
    remove(kind, id) { data[kind] = data[kind].filter(x => x.id !== id); commit(); },
    removeWhere(fn) { KINDS.forEach(k => { data[k] = data[k].filter(x => !fn(x)); }); commit(); },
    profile: () => data.profile,
    saveProfile(p) { data.profile = { ...p }; commit(); },
    exportAll() {
      return JSON.stringify({ app: 'career-note', version: 1, exported: new Date().toISOString(), ...data }, null, 2);
    },
    importAll(text, mode) { load(JSON.parse(text), mode); commit(); },
    clear() { KINDS.forEach(k => { data[k] = []; }); commit(); },
    count: () => KINDS.reduce((o, k) => (o[k] = data[k].length, o), {}),
    onChange(fn) { listeners.push(fn); }
  };
})();
