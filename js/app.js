/* ============================================================
   app.js — 화면 담당
   데이터는 Store(store.js)에서 꺼내고, 화면을 그리고,
   버튼을 누르면 Store에 저장한 뒤 다시 그립니다.
   목차: 1 설정  2 도우미  3 일정 계산  4 화면 전환
         5 오늘  6 일정  7 커리어  8 가계부  9 설정·데이터
         10 입력창  11 버튼 처리  12 예시 데이터  13 시작
   ============================================================ */
{

/* ---------- 1. 설정: 분류 이름과 색 ---------- */
const EV_CATS = [
  { k: 'class',    n: '수업',       c: '#1f7a55' },
  { k: 'study',    n: '학습',       c: '#2f6fb3' },
  { k: 'work',     n: '업무',       c: '#6b55b0' },
  { k: 'personal', n: '개인',       c: '#b5702c' },
  { k: 'son',      n: '성빈',       c: '#d0457a' },
  { k: 'issue',    n: '오늘의 이슈', c: '#c8371e' },
  { k: 'pay',      n: '결제일',     c: '#8a7a12' }
];
const CAREER_KINDS = [
  { k: 'lecture',  n: '강의·교육 진행' },
  { k: 'project',  n: '프로젝트·개발' },
  { k: 'award',    n: '수상·업적' },
  { k: 'training', n: '연수·자격' },
  { k: 'publish',  n: '집필·자료 제작' },
  { k: 'etc',      n: '기타 활동' }
];
const EXP_CATS = ['교육비(학원비)', '식비', '생활·장보기', '교통·차량', '공과금·통신', '의료·건강', '경조사·선물', '자기계발', '구독·서비스', '기타'];
const METHODS = ['카드', '현금', '계좌이체', '자동이체'];

/* ---------- 2. 도우미 함수 ---------- */
const $ = (s, el = document) => el.querySelector(s);
// 사용자가 입력한 글자는 반드시 esc()를 거쳐 화면에 넣습니다 (태그로 오해받지 않게)
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = () => ymd(new Date());
const won = n => (Number(n) || 0).toLocaleString('ko-KR') + '원';
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const md = s => { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; };
const dot = s => (s || '').replace(/-/g, '.');
const period = (a, b) => !a ? '' : (!b || b === a) ? dot(a) : `${dot(a)} – ${a.slice(0, 4) === b.slice(0, 4) ? dot(b.slice(5)) : dot(b)}`;
const catOf = k => EV_CATS.find(c => c.k === k) || EV_CATS[3];
const kindOf = k => CAREER_KINDS.find(c => c.k === k) || CAREER_KINDS[5];
const safeUrl = u => /^https:\/\//i.test(u || '') ? u : '';
const tags = s => String(s || '').split(',').map(t => t.trim()).filter(Boolean);
const uniq = a => [...new Set(a.filter(Boolean))];
const hoursOf = list => list.reduce((s, c) => s + (Number(c.hours) || 0), 0);

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 1800);
}
function ask(msg) {                      // 직접 만든 "확인" 창 (예/아니오)
  return new Promise(res => {
    const d = $('#ask'); $('#askMsg').textContent = msg; d.returnValue = '';
    d.onclose = () => res(d.returnValue === 'ok'); d.showModal();
  });
}
async function copyText(text) {          // 복사가 막힌 환경이면 직접 복사할 수 있게 보여 줌
  try { await navigator.clipboard.writeText(text); toast('복사했어요'); }
  catch (e) { $('#copyArea').value = text; $('#copyDlg').showModal(); $('#copyArea').select(); }
}

/* ---------- 3. 일정 계산: 일정 + 커리어(수업) + 정기결제를 한 목록으로 ---------- */
function itemsBetween(from, to) {
  const out = [];
  Store.list('events').forEach(e => {
    const end = e.end && e.end >= e.date ? e.end : e.date;
    if (e.date && end >= from && e.date <= to)
      out.push({ src: 'events', id: e.id, title: e.title, start: e.date, end, time: e.time || '', endTime: e.endTime || '', role: e.role || '', color: e.color ?? '', imp: !!e.important, cat: e.cat, done: !!e.done, status: e.status });
  });
  Store.list('careers').forEach(c => {
    if (!c.onCal || !c.start) return;
    const end = c.end && c.end >= c.start ? c.end : c.start;
    if (end >= from && c.start <= to)
      out.push({ src: 'careers', id: c.id, title: c.title + (c.org ? ' · ' + c.org : ''), start: c.start, end, time: '', cat: 'class' });
  });
  const f = parse(from), t = parse(to);
  for (let m = new Date(f.getFullYear(), f.getMonth(), 1); m <= t; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
    const last = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    Store.list('payments').forEach(p => {
      if (p.active === false) return;
      const d = ymd(new Date(m.getFullYear(), m.getMonth(), Math.min(Number(p.day) || 1, last)));
      if (d < from || d > to) return;
      const month = d.slice(0, 7);
      out.push({ src: 'payments', id: p.id, title: `${p.name} ${won(p.amount)}`, start: d, end: d, time: '', cat: 'pay', color: p.color ?? '', month, done: isPaid(p.id, month) });
    });
  }
  // 날짜 → 시작 시간 → 끝 시간 순 (시간 없는 일정은 그날 맨 뒤)
  return out.sort((a, b) => (a.start + (a.time || '99:99') + (a.endTime || '')).localeCompare(b.start + (b.time || '99:99') + (b.endTime || '')));
}
const onDay = (items, d) => items.filter(i => i.start <= d && i.end >= d);
const isPaid = (pid, month) => Store.list('expenses').some(x => x.payId === pid && x.payMonth === month);

function itemRow(i, showDate) {
  const c = catOf(i.cat);
  const lead = showDate ? md(i.start) : (i.time ? i.time + (i.endTime ? '-' + i.endTime : '') : (i.cat === 'pay' ? '결제' : '종일'));
  let ctl = '';
  if (i.cat === 'issue' && i.src === 'events') ctl = `<input type="checkbox" data-act="done" data-id="${esc(i.id)}" ${i.done ? 'checked' : ''} aria-label="완료">`;
  if (i.cat === 'pay') ctl = `<button class="btn sm ${i.done ? 'ghost' : 'pri'}" data-act="pay" data-id="${esc(i.id)}" data-month="${i.month}">${i.done ? '납부 완료' : '납부 처리'}</button>`;
  return `<li class="it" data-open="${i.src}" data-id="${esc(i.id)}">
    <span class="tm">${esc(lead)}</span><span class="tag" style="--c:${c.c}">${c.n}</span>
    <span class="tt ${i.done ? 'done' : ''}">${i.imp ? '<span class="star">★</span> ' : ''}${esc(i.title)}</span>${ctl || '<span></span>'}</li>`;
}
const listOr = (items, emptyMsg, showDate) => items.length
  ? `<ul class="list">${items.map(i => itemRow(i, showDate)).join('')}</ul>`
  : `<p class="empty">${emptyMsg}</p>`;

/* ---------- 4. 화면 전환: 주소 끝의 #이름을 보고 해당 화면만 보여 줌 ---------- */
const VIEWS = ['today', 'schedule', 'career', 'money', 'data'];
const now0 = new Date();
const state = {
  view: 'today', sel: today(), anchor: new Date(), sview: 'week',
  ctab: 'list', cq: '', ckind: '', cyear: '', group: 'project', onlyStar: false,
  mY: now0.getFullYear(), mM: now0.getMonth()
};
function route() {
  let v = location.hash.slice(1);
  if (!VIEWS.includes(v)) v = 'today';
  state.view = v;
  document.querySelectorAll('.view').forEach(s => { s.hidden = s.id !== 'v-' + v; });
  document.querySelectorAll('.nav a').forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === '#' + v ? 'page' : 'false'));
  render();
}
function render() {
  ({ today: renderToday, schedule: renderSchedule, career: renderCareer, money: renderMoney, data: renderData })[state.view]();
}

/* ---------- 5. 오늘 화면 ---------- */
function renderToday() {
  const t = today(), d = new Date();
  const items = itemsBetween(t, ymd(addDays(d, 14)));
  const todays = onDay(items, t);
  const issues = todays.filter(i => i.cat === 'issue');
  const sched = todays.filter(i => i.cat !== 'issue' && i.cat !== 'pay');
  const pays = items.filter(i => i.cat === 'pay' && i.start <= ymd(addDays(d, 10)));
  const next = items.filter(i => i.start > t && i.cat !== 'pay' && i.cat !== 'issue').slice(0, 8);
  const y = String(d.getFullYear());
  const careers = Store.list('careers');
  const lec = careers.filter(c => c.kind === 'lecture' && (c.start || '').startsWith(y));
  const orgs = uniq(careers.filter(c => (c.start || '').startsWith(y)).map(c => c.org));
  const ongoing = careers.filter(c => c.start && c.start <= t && (c.end || c.start) >= t);

  $('#v-today').innerHTML = `
  <div class="head">
    <div><div class="today-date">${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일</div>
    <div class="sub">${HOLIDAYS[t] ? `<b style="color:var(--danger)">${esc(HOLIDAYS[t])}</b> · ` : ''}오늘 일정 ${sched.length}개 · 이슈 ${issues.filter(i => !i.done).length}개 남음</div></div>
    <div class="tools">
      <button class="btn pri" data-act="add" data-kind="events">+ 일정</button>
      <button class="btn" data-act="add" data-kind="events" data-cat="issue">+ 오늘의 이슈</button>
      <button class="btn" data-act="add" data-kind="careers">+ 커리어</button>
      <button class="btn" data-act="add" data-kind="expenses">+ 지출</button>
    </div>
  </div>
  <div class="grid2">
    <div class="stackv">
      ${(() => { const imp = itemsBetween(t, ymd(addDays(d, 30))).filter(i => i.imp); return imp.length ? `<div class="card impcard"><h2><span class="star">★</span> 중요 일정 <span class="n">30일 이내</span></h2>${listOr(imp, '', true)}</div>` : ''; })()}
      <div class="card"><h2>오늘 일정</h2>${listOr(sched, '오늘은 등록된 일정이 없어요.')}</div>
      <div class="card"><h2>오늘의 이슈 <span class="n">잊지 말 것, 처리할 것</span></h2>${listOr(issues, '오늘 챙길 이슈가 없어요.')}</div>
      <div class="card"><h2>앞으로 2주</h2>${listOr(next, '2주 안에 예정된 일정이 없어요.', true)}</div>
    </div>
    <div class="stackv">
      <div class="card"><h2>${y}년 커리어</h2>
        <div class="stats">
          <div class="stat"><b>${lec.length}</b><span>강의·교육 건</span></div>
          <div class="stat"><b>${hoursOf(lec)}</b><span>강의 시간</span></div>
          <div class="stat"><b>${orgs.length}</b><span>함께한 기관</span></div>
        </div>
        ${ongoing.length ? `<h2 style="margin-top:16px">진행 중</h2><ul class="list">${ongoing.map(c => `<li class="it" data-open="careers" data-id="${esc(c.id)}"><span class="tm">~${esc(md(c.end || c.start))}</span><span class="tag">${esc(kindOf(c.kind).n)}</span><span class="tt">${esc(c.title)}</span><span></span></li>`).join('')}</ul>` : ''}
        <p style="margin:14px 0 0"><a href="#career" class="btn sm" style="display:inline-flex;align-items:center;text-decoration:none">커리어 전체 보기</a></p>
      </div>
      <div class="card"><h2>${d.getMonth() + 1}월 강의 수입</h2>${(() => { const inc = monthIncome(t.slice(0, 7)); return `<div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="stat"><b class="num">${inc.total.toLocaleString('ko-KR')}</b><span>원 · ${inc.live.length}회</span></div>${Store.profile().tax33 ? `<div class="stat"><b class="num">${net33(inc.total).toLocaleString('ko-KR')}</b><span>3.3% 공제 후</span></div>` : ''}</div>${inc.noRate ? `<p class="mute" style="font-size:14px;margin:10px 0 0">금액 미입력 ${inc.noRate}회 · <a href="#data">강사료표 입력</a></p>` : ''}<p style="margin:12px 0 0"><a href="#money" class="btn sm" style="display:inline-flex;align-items:center;text-decoration:none">수입·지출 보기</a></p>`; })()}</div>
      <div class="card"><h2>결제 예정 <span class="n">10일 이내</span></h2>${listOr(pays, '다가오는 정기 결제가 없어요.', true)}</div>
    </div>
  </div>`;
}

/* ---------- 6. 일정 화면: 스프레드시트처럼 보는 주간 표 / 월간 표 ---------- */
// 공휴일 (우주항공청 월력요항 기준). 해마다 다음 해 목록을 여기에 추가하면 돼요.
const HOLIDAYS = {
  '2024-01-01': '신정', '2024-02-09': '설날 연휴', '2024-02-10': '설날', '2024-02-11': '설날 연휴', '2024-02-12': '대체공휴일',
  '2024-03-01': '삼일절', '2024-04-10': '국회의원 선거', '2024-05-05': '어린이날', '2024-05-06': '대체공휴일', '2024-05-15': '부처님오신날',
  '2024-06-06': '현충일', '2024-08-15': '광복절', '2024-09-16': '추석 연휴', '2024-09-17': '추석', '2024-09-18': '추석 연휴',
  '2024-10-01': '국군의날', '2024-10-03': '개천절', '2024-10-09': '한글날', '2024-12-25': '성탄절',
  '2025-01-01': '신정', '2025-01-27': '임시공휴일', '2025-01-28': '설날 연휴', '2025-01-29': '설날', '2025-01-30': '설날 연휴',
  '2025-03-01': '삼일절', '2025-03-03': '대체공휴일', '2025-05-05': '어린이날·부처님오신날', '2025-05-06': '대체공휴일',
  '2025-06-03': '대통령 선거', '2025-06-06': '현충일', '2025-08-15': '광복절', '2025-10-03': '개천절',
  '2025-10-05': '추석 연휴', '2025-10-06': '추석', '2025-10-07': '추석 연휴', '2025-10-08': '대체공휴일', '2025-10-09': '한글날', '2025-12-25': '성탄절',
  '2026-01-01': '신정', '2026-02-16': '설날 연휴', '2026-02-17': '설날', '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절', '2026-03-02': '대체공휴일', '2026-05-01': '노동절', '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날', '2026-05-25': '대체공휴일', '2026-06-03': '지방선거', '2026-06-06': '현충일',
  '2026-07-17': '제헌절', '2026-08-15': '광복절', '2026-08-17': '대체공휴일',
  '2026-09-24': '추석 연휴', '2026-09-25': '추석', '2026-09-26': '추석 연휴',
  '2026-10-03': '개천절', '2026-10-05': '대체공휴일', '2026-10-09': '한글날', '2026-12-25': '성탄절',
  '2027-01-01': '신정', '2027-02-06': '설날 연휴', '2027-02-07': '설날', '2027-02-08': '설날 연휴', '2027-02-09': '대체공휴일',
  '2027-03-01': '삼일절', '2027-05-01': '노동절', '2027-05-03': '대체공휴일', '2027-05-05': '어린이날',
  '2027-05-13': '부처님오신날', '2027-06-06': '현충일', '2027-07-17': '제헌절', '2027-07-19': '대체공휴일',
  '2027-08-15': '광복절', '2027-08-16': '대체공휴일', '2027-09-14': '추석 연휴', '2027-09-15': '추석', '2027-09-16': '추석 연휴',
  '2027-10-03': '개천절', '2027-10-04': '대체공휴일', '2027-10-09': '한글날', '2027-10-11': '대체공휴일',
  '2027-12-25': '성탄절', '2027-12-27': '대체공휴일'
};
// 표의 행 = 분류 (시트와 같은 순서)
const ROWS = [
  { k: 'class', n: '수업' }, { k: 'study', n: '학습' }, { k: 'work', n: '업무' }, { k: 'personal', n: '개인' },
  { k: 'son', n: '성빈' }, { k: 'issue', n: '오늘의 이슈' }, { k: 'pay', n: '결제' }
];
// 수업 색: 제목 첫 단어(기관 이름)가 같으면 같은 색. 처음 나온 순서대로 팔레트에서 골라요.
const PALETTE = [['#e3f1d8', '#2b5713'], ['#dae8fa', '#123f73'], ['#fbe1eb', '#7a2443'], ['#fcefc4', '#664604'], ['#e8e5fd', '#3c3489'],
  ['#d6f2ea', '#0b5041'], ['#fde3d6', '#7a2f12'], ['#f2e0f6', '#5f2a6b'], ['#dff1f7', '#14536a'], ['#ececec', '#3a3a3a']];
const PALETTE_NAMES = ['초록', '파랑', '분홍', '노랑', '보라', '청록', '주황', '자주', '하늘', '회색'];
const swatch = c => c === 'none' ? 'background:transparent;border:1px dashed var(--mute)' : `background:${PALETTE[c][0]};border:1px solid ${PALETTE[c][1]}`;
const keyOf = t => (String(t || '').trim().split(/\s+/)[0] || '').replace(/\(.*$/, '').replace(/[()[\],·]/g, '');
// 휴강·취소 등: 입력창의 '상태'를 우선, 없으면 제목 끝의 (취소)(휴강) 같은 표시로 판단
const OFF_WORDS = ['휴강', '취소', '결석', '연기', '대체'];
const isOff = i => i.status ? OFF_WORDS.includes(i.status) : /(휴강|취소|결석|연기|대체)\)\s*(~\s*\d{1,2}:\d{2})?\s*$|모두 휴강/.test(i.title || '');
const endOf = t => (String(t).match(/~\s*(\d{1,2}:\d{2})/) || [])[1] || '';
const cleanTitle = t => String(t).replace(/\s*~\s*\d{1,2}:\d{2}/, '').trim();
function colorMap() {
  const first = {};
  Store.list('events').filter(e => e.cat === 'class').forEach(e => { const k = keyOf(e.title); if (!first[k] || e.date < first[k]) first[k] = e.date; });
  Store.list('careers').filter(c => c.onCal).forEach(c => { const k = keyOf(c.title); if (!first[k] || c.start < first[k]) first[k] = c.start; });
  const map = {};
  Object.keys(first).sort((a, b) => first[a].localeCompare(first[b]) || a.localeCompare(b)).forEach((k, i) => { map[k] = i % PALETTE.length; });
  const custom = Store.profile().colors || {};          // 설정에서 직접 고른 색이 우선
  Object.entries(custom).forEach(([k, v]) => { if (v === 'none' || PALETTE[v]) map[k] = v; });
  return map;   // 값: 팔레트 번호 또는 'none'
}
// 블록 색: 직접 고른 색 > (수업이면) 기관 색 > 분류 기본 모양
const colorStyle = c => c === 'none' ? '--bg:transparent;--fg:var(--ink)' : `--bg:${PALETTE[c][0]};--fg:${PALETTE[c][1]}`;
const hasColor = v => v !== '' && v != null;
function chip(i, colors) {
  const off = isOff(i) || (i.done && (i.cat === 'issue' || i.cat === 'pay'));
  const et = i.endTime || endOf(i.title), time = i.time ? i.time + (et ? '-' + et : '') : '';
  const attr = `data-open="${i.src}" data-id="${esc(i.id)}" title="${esc(i.title)}${i.imp ? ' (중요)' : ''}"`;
  const star = i.imp ? '<span class="star">★</span> ' : '', imp = i.imp ? ' imp' : '';
  const name = esc(cleanTitle(i.title)) + (i.cat === 'pay' && i.done ? ' · 납부' : '');
  const c = hasColor(i.color) ? i.color : i.cat === 'class' ? (colors[keyOf(i.title)] ?? 9) : null;
  if (c != null) return `<span class="gc ${c === 'none' ? 'plain' : ''}${off ? ' off' : ''}${imp}" style="${colorStyle(c)}" ${attr}>${star}${name}${time ? `<small>${time}</small>` : ''}</span>`;
  if (i.cat === 'issue' || i.cat === 'pay') return `<span class="gc hot${off ? ' off' : ''}${imp}" ${attr}>${star}${name}</span>`;
  return `<span class="gl${off ? ' off' : ''}${imp}" ${attr}>${star}${time ? `<b>${time}</b> ` : ''}${name}</span>`;
}
function weekBlock(start, month, colors) {
  const days = [...Array(7)].map((_, k) => addDays(start, k)), ds = days.map(ymd), t = today();
  const items = itemsBetween(ds[0], ds[6]);
  const exps = Store.list('expenses').filter(x => x.date >= ds[0] && x.date <= ds[6] && !x.payId);
  const out = k => month != null && days[k].getMonth() !== month ? ' out' : '';
  let row = 1;
  let h = `<div class="wh corner" style="grid-row:1;grid-column:1"></div>` + days.map((d, k) => {
    const hol = HOLIDAYS[ds[k]];
    return `<div class="wh${d.getDay() === 0 || hol ? ' red' : ''}${ds[k] === t ? ' now' : ''}${out(k)}" style="grid-row:1;grid-column:${k + 2}">
      <b>${d.getMonth() + 1}/${d.getDate()}</b> ${WD[d.getDay()]}${hol ? `<span class="hol">${esc(hol)}</span>` : ''}</div>`;
  }).join('');
  ROWS.forEach(r => {
    const its = items.filter(i => i.cat === r.k);
    const spans = its.filter(i => i.end > i.start), singles = its.filter(i => i.end === i.start);
    row++;
    const n = spans.length + 1;
    h += `<div class="wr" style="grid-row:${row}/span ${n};grid-column:1">${r.n}</div>`;
    const kind = r.k === 'pay' ? 'expenses' : 'events', catAttr = r.k === 'pay' ? '' : `data-cat="${r.k}"`;
    const cell = (k, rr, inner, extra = '') => `<div class="wc${ds[k] === t ? ' tc' : ''}${out(k)}${extra}" style="grid-row:${rr};grid-column:${k + 2}" data-act="add" data-kind="${kind}" ${catAttr} data-date="${ds[k]}">${inner}</div>`;
    spans.forEach((i, si) => {                          // 여러 날 일정은 가로 막대로
      const rr = row + si, a = Math.max(0, ds.indexOf(i.start) < 0 ? 0 : ds.indexOf(i.start)), b = ds.indexOf(i.end) < 0 ? 6 : ds.indexOf(i.end);
      for (let k = 0; k < 7; k++) if (k < a || k > b) h += cell(k, rr, '', ' thin');
      h += `<div class="wsp" style="grid-row:${rr};grid-column:${a + 2}/${b + 3}"><span class="spanbar ${isOff(i) ? 'off' : ''}${i.imp ? ' imp' : ''}" ${hasColor(i.color) ? `style="background:var(--bg);color:var(--fg);${colorStyle(i.color)}"` : ''} title="${esc(i.title)}" data-open="${i.src}" data-id="${esc(i.id)}">${i.imp ? '★ ' : ''}${esc(i.title)}</span></div>`;
    });
    const rr = row + spans.length;
    for (let k = 0; k < 7; k++) {
      let inner = onDay(singles, ds[k]).map(i => chip(i, colors)).join('');
      if (r.k === 'pay') inner += exps.filter(x => x.date === ds[k]).map(x => `<span class="gc ${hasColor(x.color) ? (x.color === 'none' ? 'plain' : '') : 'hot'}" ${hasColor(x.color) ? `style="${colorStyle(x.color)}"` : ''} data-open="expenses" data-id="${esc(x.id)}">${esc(x.item)} ${won(x.amount)}</span>`).join('');
      h += cell(k, rr, inner);
    }
    row = rr;
  });
  return `<div class="wscroll"><div class="wg">${h}</div></div>`;
}
function renderSchedule() {
  const a = state.anchor, colors = colorMap();
  let title, body;
  if (state.sview === 'week') {
    const start = addDays(a, -a.getDay()), end = addDays(start, 6);
    title = `${start.getFullYear()}.${start.getMonth() + 1}.${start.getDate()} – ${end.getMonth() + 1}.${end.getDate()}`;
    body = weekBlock(start, null, colors);
  } else {
    const first = new Date(a.getFullYear(), a.getMonth(), 1), last = new Date(a.getFullYear(), a.getMonth() + 1, 0);
    title = `${a.getFullYear()}년 ${a.getMonth() + 1}월`;
    body = '';
    for (let s = addDays(first, -first.getDay()); s <= last; s = addDays(s, 7)) body += weekBlock(s, a.getMonth(), colors);
  }
  $('#v-schedule').innerHTML = `
  <div class="head"><div><h1>일정</h1><div class="sub">빈칸을 누르면 그 날짜·분류로 바로 입력돼요</div></div>
    <div class="tools"><button class="btn pri" data-act="add" data-kind="events">+ 일정 추가</button>
    <button class="btn" data-act="add" data-kind="payments">+ 정기 결제</button></div></div>
  <div class="calbar"><h2>${title}</h2>
    <button class="btn sm" data-act="wnav" data-d="-1" aria-label="이전">‹</button>
    <button class="btn sm" data-act="wnav" data-d="0">오늘</button>
    <button class="btn sm" data-act="wnav" data-d="1" aria-label="다음">›</button>
    <span style="flex:1"></span>
    <div class="seg" role="group" aria-label="보기">${[['week', '주간 표'], ['month', '월간 표']].map(([k, n]) => `<button data-act="sview" data-v="${k}" aria-pressed="${state.sview === k}">${n}</button>`).join('')}</div>
  </div>
  ${body}`;
}

/* ---------- 7. 커리어 화면: 기록 목록 / 이력서 / 포트폴리오 ---------- */
function renderCareer() {
  const all = Store.list('careers');
  const years = uniq(all.map(c => (c.start || '').slice(0, 4))).sort().reverse();
  $('#v-career').innerHTML = `
  <div class="head"><div><h1>커리어</h1><div class="sub">한 번 기록하면 이력서와 포트폴리오로 바로 정리돼요</div></div>
    <div class="tools"><button class="btn pri" data-act="add" data-kind="careers">+ 커리어 기록</button></div></div>
  <div class="toolbar">
    <div class="seg" role="group" aria-label="보기 방식">
      ${[['list', '기록 목록'], ['resume', '이력서'], ['portfolio', '포트폴리오']].map(([k, n]) => `<button data-act="ctab" data-v="${k}" aria-pressed="${state.ctab === k}">${n}</button>`).join('')}
    </div>
    <input type="search" id="cq" placeholder="교육명, 기관, 키워드 검색" value="${esc(state.cq)}" aria-label="검색">
    <select id="ckind" aria-label="구분"><option value="">모든 구분</option>${CAREER_KINDS.map(c => `<option value="${c.k}" ${state.ckind === c.k ? 'selected' : ''}>${c.n}</option>`).join('')}</select>
    <select id="cyear" aria-label="연도"><option value="">전체 연도</option>${years.map(y => `<option ${state.cyear === y ? 'selected' : ''}>${y}</option>`).join('')}</select>
    <label class="ck"><input type="checkbox" id="cstar" ${state.onlyStar ? 'checked' : ''}><span>대표 이력만</span></label>
  </div>
  <div id="cbody"></div>`;
  $('#cq').oninput = e => { state.cq = e.target.value; renderCareerBody(); };
  $('#ckind').onchange = e => { state.ckind = e.target.value; renderCareerBody(); };
  $('#cyear').onchange = e => { state.cyear = e.target.value; renderCareerBody(); };
  $('#cstar').onchange = e => { state.onlyStar = e.target.checked; renderCareerBody(); };
  renderCareerBody();
}
function filteredCareers() {
  const q = state.cq.trim().toLowerCase();
  return Store.list('careers').filter(c =>
    (!state.ckind || c.kind === state.ckind) &&
    (!state.cyear || (c.start || '').startsWith(state.cyear)) &&
    (!state.onlyStar || c.featured) &&
    (!q || [c.title, c.org, c.target, c.role, c.project, c.tags, c.result].join(' ').toLowerCase().includes(q))
  ).sort((a, b) => (b.start || '').localeCompare(a.start || ''));
}
function renderCareerBody() {
  const list = filteredCareers(), box = $('#cbody');
  if (!Store.list('careers').length) {
    box.innerHTML = `<div class="card"><p class="empty">아직 커리어 기록이 없어요. 강의 하나부터 적어 보세요.<br>
      <button class="btn pri" data-act="add" data-kind="careers">+ 첫 기록 추가</button>
      <button class="btn" data-act="sample">예시 데이터로 둘러보기</button></p></div>`;
    return;
  }
  if (!list.length) { box.innerHTML = `<div class="card"><p class="empty">조건에 맞는 기록이 없어요.</p></div>`; return; }
  if (state.ctab === 'list') box.innerHTML = careerList(list);
  if (state.ctab === 'resume') box.innerHTML = resume(list);
  if (state.ctab === 'portfolio') box.innerHTML = portfolio(list);
}
function careerList(list) {
  return `<div class="card"><h2>기록 <span class="n">${list.length}건 · ${hoursOf(list)}시간</span></h2>${list.map(c => `
    <div class="rec" data-open="careers" data-id="${esc(c.id)}">
      <div class="when">${esc(period(c.start, c.end))}</div>
      <div class="what"><b>${c.featured ? '<span class="star" title="대표 이력">★</span> ' : ''}${esc(c.title)}</b>
        <div class="meta">${esc([c.org, c.target, c.role].filter(Boolean).join(' · '))}</div></div>
      <div class="side"><span class="tag">${esc(kindOf(c.kind).n)}</span>${c.hours ? `<div class="mute num">${esc(c.hours)}시간</div>` : ''}</div>
    </div>`).join('')}</div>`;
}
function resumeRows(list) {           // 이력서 표 한 묶음
  let lastY = '';
  return `<table class="stack"><thead><tr><th>기간</th><th>내용</th><th>기관</th><th class="r">시수</th></tr></thead><tbody>${list.map(c => {
    const y = (c.start || '').slice(0, 4), showY = y !== lastY; lastY = y;
    return `<tr data-open="careers" data-id="${esc(c.id)}"><td class="num">${showY ? `<span class="yr">${y}</span><br>` : ''}${esc(period(c.start, c.end).slice(5) || period(c.start, c.end))}</td>
      <td><b>${esc(c.title)}</b>${c.target || c.role ? `<div class="mute">${esc([c.target, c.role].filter(Boolean).join(' · '))}</div>` : ''}${c.result ? `<div>${esc(c.result)}</div>` : ''}</td>
      <td>${esc(c.org)}</td><td class="r num">${c.hours ? esc(c.hours) + 'h' : ''}</td></tr>`;
  }).join('')}</tbody></table>`;
}
function resume(list) {
  const p = Store.profile(), lec = list.filter(c => c.kind === 'lecture');
  const ys = list.map(c => (c.start || '').slice(0, 4)).filter(Boolean).sort();
  const secs = CAREER_KINDS.map(k => [k, list.filter(c => c.kind === k.k)]).filter(([, l]) => l.length);
  return `<div class="toolbar noprint"><span class="mute" style="flex:1">위 검색·필터 조건이 그대로 반영돼요. 행을 누르면 수정할 수 있어요.</span>
      <button class="btn" data-act="copyResume">텍스트로 복사</button><button class="btn" data-act="print">인쇄 · PDF</button></div>
    <article class="resume">
      <div class="rh"><h2>${esc(p.name || '이름')}</h2><p>${esc([p.title, p.contact].filter(Boolean).join(' · '))}</p>${p.intro ? `<p style="color:var(--ink);margin-top:10px">${esc(p.intro)}</p>` : ''}</div>
      <div class="sum"><span>기간 <b>${ys.length ? ys[0] + (ys.at(-1) !== ys[0] ? '–' + ys.at(-1) : '') : '-'}</b></span>
        <span>강의·교육 <b>${lec.length}건</b></span><span>누적 강의 <b>${hoursOf(lec)}시간</b></span>
        <span>협력 기관 <b>${uniq(list.map(c => c.org)).length}곳</b></span></div>
      ${secs.map(([k, l]) => `<h3>${k.n}</h3>${resumeRows(l)}`).join('')}
    </article>`;
}
function resumeText(list) {
  const p = Store.profile();
  let s = `${p.name || ''}${p.title ? ' | ' + p.title : ''}\n${p.contact || ''}\n${p.intro ? '\n' + p.intro + '\n' : ''}`;
  CAREER_KINDS.forEach(k => {
    const l = list.filter(c => c.kind === k.k); if (!l.length) return;
    s += `\n[${k.n}]\n` + l.map(c => `- ${period(c.start, c.end)}  ${c.title}${c.org ? ' / ' + c.org : ''}${c.target ? ' / ' + c.target : ''}${c.hours ? ' / ' + c.hours + '시간' : ''}${c.result ? '\n    ' + c.result : ''}`).join('\n') + '\n';
  });
  return s.trim();
}
function portfolio(list) {
  const by = {
    project: c => c.project || '개별 활동',
    kind: c => kindOf(c.kind).n,
    org: c => c.org || '기관 미기재',
    year: c => (c.start || '연도 미기재').slice(0, 4)
  }[state.group];
  const groups = {};
  list.forEach(c => { (groups[by(c)] ||= []).push(c); });
  const order = Object.entries(groups).sort((a, b) => state.group === 'year' ? b[0].localeCompare(a[0]) : b[1].length - a[1].length);
  return `<div class="toolbar"><span class="mute">묶는 기준</span><div class="seg" role="group" aria-label="묶는 기준">
      ${[['project', '프로젝트별'], ['kind', '업적 종류별'], ['org', '기관별'], ['year', '연도별']].map(([k, n]) => `<button data-act="group" data-v="${k}" aria-pressed="${state.group === k}">${n}</button>`).join('')}</div></div>
    <div class="groups">${order.map(([name, l]) => `<section class="group">
      <h3>${esc(name)} <span>${l.length}건${hoursOf(l) ? ' · ' + hoursOf(l) + '시간' : ''} · ${esc(period(l.at(-1).start, (l[0].end || l[0].start)))}</span></h3>
      <div class="cards">${l.map(c => `<div class="pf" data-open="careers" data-id="${esc(c.id)}">
        <div class="pd">${esc(period(c.start, c.end))} · ${esc(kindOf(c.kind).n)}</div>
        <h4>${c.featured ? '<span class="star">★</span> ' : ''}${esc(c.title)}</h4>
        ${c.org || c.target ? `<p class="mute">${esc([c.org, c.target, c.role].filter(Boolean).join(' · '))}</p>` : ''}
        ${c.result ? `<p>${esc(c.result)}</p>` : ''}
        ${safeUrl(c.link) ? `<a href="${esc(c.link)}" target="_blank" rel="noopener" data-stop>관련 링크 열기</a>` : ''}
        ${tags(c.tags).length ? `<div class="kw">${tags(c.tags).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
      </div>`).join('')}</div></section>`).join('')}</div>`;
}

/* ---------- 8-1. 강의 수입 계산 ---------- */
// 수업 그룹: 제목 첫 단어(기관) + 주강/보조강 구분. 강사료표는 이 이름으로 저장돼요.
const roleOf = e => e.role || (/보조강/.test(e.title || '') ? '보조강' : /주강/.test(e.title || '') ? '주강' : '');
const groupOf = e => { const k = keyOf(e.title), r = roleOf(e); return k + (r ? ' · ' + r : ''); };
// 강사료표에 없는 그룹에 쓰는 기본 규칙 (블록 1개당 금액)
function defaultRate(g) {
  if (/도서관/.test(g)) return { mode: 'session', amount: 120000, rule: '그외 도서관' };
  if (/보조강/.test(g)) return { mode: 'session', amount: 60000, rule: '학교 보조강' };
  if (/주강/.test(g) || /(초|중|고|학교|직업계)(\s|$)/.test(g)) return { mode: 'session', amount: 100000, rule: '학교 주강' };
  return null;
}
const toMin = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const rates = () => Store.profile().rates || {};
// 사업별·연도별 금액 (예: 2025년 SW미래채움 블록당 60,000원)
const PROGRAMS = ['SW미래채움'];
const progRates = () => Store.profile().progRates || {};
// 수업 블록 1개의 수입: 수동 금액 > 사업·연도 금액 > 강사료표 > 기본 규칙
function incomeOf(e) {
  const g = groupOf(e), pk = e.program ? `${e.program}|${(e.date || '').slice(0, 4)}` : '';
  const r = pk && progRates()[pk] ? { amount: progRates()[pk], rule: `${e.program} ${pk.slice(-4)}년` } : (rates()[g]?.amount ?? '') !== '' ? rates()[g] : (defaultRate(g) || {});
  const periods = e.periods !== '' && e.periods != null ? Number(e.periods) : 2;   // 수업 1회 = 기본 2차시
  const off = isOff({ title: e.title, status: e.status });
  const auto = r.amount == null || r.amount === '' ? null : Number(r.amount);   // 블록 1개 = 강사료 1회 (시간과 무관)
  const manual = e.pay !== '' && e.pay != null;
  return { g, periods, off, manual, rule: r.rule, noRate: !manual && auto == null, amount: off ? 0 : manual ? Number(e.pay) : (auto || 0), autoAmount: auto };
}
function monthIncome(mon) {
  const rows = Store.list('events').filter(e => e.cat === 'class' && (e.date || '').startsWith(mon)).map(e => ({ e, ...incomeOf(e) }));
  const live = rows.filter(r => !r.off);
  const total = live.reduce((s, r) => s + r.amount, 0);
  const groups = {};
  live.forEach(r => { const g = groups[r.g] ||= { n: 0, periods: 0, amount: 0, noRate: 0 }; g.n++; g.periods += r.periods; g.amount += r.amount; if (r.noRate) g.noRate++; });
  const other = Store.list('incomes').filter(x => (x.date || '').startsWith(mon)).sort((a, b) => a.date.localeCompare(b.date));
  const otherTotal = other.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const otherNet = other.reduce((s, x) => s + netOf(x), 0);
  return { rows, live, total, groups, noRate: live.filter(r => r.noRate).length, other, otherTotal, otherNet };
}
// 수업 외 수입의 공제 후 금액 (8.8% 등)
const netOf = x => Math.round((Number(x.amount) || 0) * (1 - (Number(x.tax) || 0) / 100));
const net33 = n => Math.round(n * 0.967);
function yearSummary(y) {
  return [...Array(12)].map((_, i) => {
    const mon = `${y}-${pad(i + 1)}`, inc = monthIncome(mon);
    const spend = Store.list('expenses').filter(x => (x.date || '').startsWith(mon)).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    return { m: i + 1, mon, n: inc.live.length, income: inc.total, other: inc.otherTotal, otherNet: inc.otherNet, all: inc.total + inc.otherTotal, noRate: inc.noRate, spend };
  });
}

const mviewSeg = () => `<div class="seg" role="group" aria-label="보기">${[['month', '월별'], ['year', '연간 · 연봉']].map(([k, n]) => `<button data-act="mview" data-v="${k}" aria-pressed="${(state.mview || 'month') === k}">${n}</button>`).join('')}</div>`;
function renderYear() {
  const y = state.mY, tax = !!Store.profile().tax33, rows = yearSummary(y);
  const tot = rows.reduce((a, r) => ({ n: a.n + r.n, income: a.income + r.income, other: a.other + r.other, otherNet: a.otherNet + r.otherNet, all: a.all + r.all, spend: a.spend + r.spend, noRate: a.noRate + r.noRate }), { n: 0, income: 0, other: 0, otherNet: 0, all: 0, spend: 0, noRate: 0 });
  const max = Math.max(1, ...rows.map(r => r.all));
  const netAll = r => (tax ? net33(r.income) : r.income) + r.otherNet;
  const years = uniq(Store.list('events').filter(e => e.cat === 'class').map(e => (e.date || '').slice(0, 4))).filter(Boolean).sort();
  Store.list('incomes').forEach(x => { const yy = (x.date || '').slice(0, 4); if (yy && !years.includes(yy)) years.push(yy); }); years.sort();
  const yearTotals = years.map(yy => ({ y: yy, ...yearSummary(+yy).reduce((a, r) => ({ n: a.n + r.n, income: a.income + r.income, other: a.other + r.other, all: a.all + r.all }), { n: 0, income: 0, other: 0, all: 0 }) }));
  const best = rows.reduce((b, r) => r.all > b.all ? r : b, rows[0]);
  const activeMonths = rows.filter(r => r.all > 0).length || 1;
  $('#v-money').innerHTML = `
  <div class="head"><div><h1>수입 · 지출</h1><div class="sub">${y}년 월별 수입과 연봉</div></div></div>
  <div class="calbar"><h2>${y}년</h2>
    <button class="btn sm" data-act="ynav" data-d="-1" aria-label="이전 해">‹</button>
    <button class="btn sm" data-act="ynav" data-d="0">올해</button>
    <button class="btn sm" data-act="ynav" data-d="1" aria-label="다음 해">›</button>
    <span style="flex:1"></span>${mviewSeg()}</div>
  <div class="card income">
    <div class="stats">
      <div class="stat"><b class="num">${tot.all.toLocaleString('ko-KR')}</b><span>${y}년 연봉 · 총수입(원)</span></div>
      <div class="stat"><b class="num">${netAll(tot).toLocaleString('ko-KR')}</b><span>공제 후 실수령(원)</span></div>
      <div class="stat"><b class="num">${tot.income.toLocaleString('ko-KR')}</b><span>강의 수입 · 기타 ${tot.other.toLocaleString('ko-KR')}</span></div>
      <div class="stat"><b class="num">${Math.round(tot.all / activeMonths).toLocaleString('ko-KR')}</b><span>월평균 (수입 있는 ${activeMonths}개월)</span></div>
      <div class="stat"><b class="num">${tot.n.toLocaleString('ko-KR')}</b><span>수업 횟수 · ${(tot.n * 2).toLocaleString('ko-KR')}차시</span></div>
    </div>
    ${tot.noRate ? `<p class="note warn" style="margin:14px 0 0">강사료가 정해지지 않은 수업이 ${tot.noRate}회 있어서 연봉에 빠져 있어요. <a href="#data">설정 → 수업별 강사료표</a>에서 입력하세요.</p>` : ''}
    <h2 style="margin-top:18px">월별 수입 ${best.all ? `<span class="n">최고 ${best.m}월 ${won(best.all)}</span>` : ''}</h2>
    <table class="stack ytable"><thead><tr><th>월</th><th class="r">수업</th><th>총수입</th><th class="r">강의</th><th class="r">기타</th><th class="r">합계</th><th class="r">실수령</th><th class="r">지출</th></tr></thead><tbody>
    ${rows.map(r => `<tr data-act="gomonth" data-y="${y}" data-m="${r.m - 1}"><td><b>${r.m}월</b>${r.noRate ? ' <span class="tag" style="--c:#c8371e">미입력 ' + r.noRate + '</span>' : ''}</td><td class="r num">${r.n}회</td>
      <td><span class="ybar"><i style="width:${r.income / max * 100}%"></i><i class="o" style="width:${r.other / max * 100}%"></i></span></td><td class="r num">${won(r.income)}</td><td class="r num">${r.other ? won(r.other) : '-'}</td><td class="r num"><b>${won(r.all)}</b></td><td class="r num">${won(netAll(r))}</td><td class="r num">${r.spend ? won(r.spend) : '-'}</td></tr>`).join('')}
    <tr class="ytot"><td><b>합계</b></td><td class="r num">${tot.n}회</td><td></td><td class="r num">${won(tot.income)}</td><td class="r num">${won(tot.other)}</td><td class="r num"><b>${won(tot.all)}</b></td><td class="r num"><b>${won(netAll(tot))}</b></td><td class="r num">${won(tot.spend)}</td></tr>
    </tbody></table>
    <p class="mute" style="font-size:14px;margin:8px 0 0">막대: 진한 색 강의 수입, 연한 색 기타 수입(사업비·상금 등). 실수령은 ${tax ? '강의 3.3% 공제, ' : ''}기타 수입의 공제율을 반영한 금액이에요. 월을 누르면 그 달 상세로 이동해요.</p>
  </div>
  ${yearTotals.length > 1 ? `<div class="card"><h2>연도별 연봉</h2><table class="stack"><thead><tr><th>연도</th><th class="r">수업</th><th class="r">강의 수입</th><th class="r">기타 수입</th><th class="r">연봉(총수입)</th></tr></thead><tbody>
    ${yearTotals.map(t => `<tr data-act="goyear" data-y="${t.y}"><td><b>${t.y}년</b>${+t.y === y ? ' <span class="tag">보는 중</span>' : ''}</td><td class="r num">${t.n}회</td><td class="r num">${won(t.income)}</td><td class="r num">${t.other ? won(t.other) : '-'}</td><td class="r num"><b>${won(t.all)}</b></td></tr>`).join('')}
    </tbody></table></div>` : ''}`;
}

/* ---------- 8. 수입·지출 화면 ---------- */
function renderMoney() {
  if (state.mview === 'year') return renderYear();
  const { mY: y, mM: m } = state, mon = `${y}-${pad(m + 1)}`;
  const ex = Store.list('expenses').filter(x => (x.date || '').startsWith(mon)).sort((a, b) => b.date.localeCompare(a.date));
  const total = ex.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const byCat = {}; ex.forEach(x => { byCat[x.cat || '기타'] = (byCat[x.cat || '기타'] || 0) + (Number(x.amount) || 0); });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]), max = cats[0]?.[1] || 1;
  const pays = Store.list('payments').slice().sort((a, b) => (a.day || 0) - (b.day || 0));
  const active = pays.filter(p => p.active !== false);
  const payTotal = active.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const paidN = active.filter(p => isPaid(p.id, mon)).length;

  const inc = monthIncome(mon), tax = !!Store.profile().tax33;
  const gl = Object.entries(inc.groups).sort((a, b) => b[1].amount - a[1].amount);
  $('#v-money').innerHTML = `
  <div class="head"><div><h1>수입 · 지출</h1><div class="sub">수업 블록마다 강사료를 계산한 강의 수입과 지출 기록</div></div>
    <div class="tools"><button class="btn pri" data-act="add" data-kind="expenses">+ 지출 입력</button>
    <button class="btn" data-act="add" data-kind="incomes">+ 수업 외 수입</button>
    <button class="btn" data-act="add" data-kind="payments">+ 정기 결제 등록</button></div></div>
  <div class="calbar"><h2>${y}년 ${m + 1}월</h2>
    <button class="btn sm" data-act="mmonth" data-d="-1" aria-label="이전 달">‹</button>
    <button class="btn sm" data-act="mmonth" data-d="0">이번 달</button>
    <button class="btn sm" data-act="mmonth" data-d="1" aria-label="다음 달">›</button>
    <span style="flex:1"></span>${mviewSeg()}</div>
  <div class="card income">
    <div class="stats">
      <div class="stat"><b class="num">${(inc.total + inc.otherTotal).toLocaleString('ko-KR')}</b><span>총수입(원) · 강의 ${inc.live.length}회${inc.otherTotal ? ' + 기타' : ''}</span></div>
      <div class="stat"><b class="num">${((tax ? net33(inc.total) : inc.total) + inc.otherNet).toLocaleString('ko-KR')}</b><span>공제 후 실수령(원)</span></div>
      <div class="stat"><b class="num">${total.toLocaleString('ko-KR')}</b><span>지출(원)</span></div>
      <div class="stat"><b class="num ${(tax ? net33(inc.total) : inc.total) + inc.otherNet - total < 0 ? 'neg' : ''}">${((tax ? net33(inc.total) : inc.total) + inc.otherNet - total).toLocaleString('ko-KR')}</b><span>실수령 − 지출(원)</span></div>
    </div>
    ${inc.noRate ? `<p class="note warn" style="margin:14px 0 0">강사료가 정해지지 않은 수업이 ${inc.noRate}회 있어요. <a href="#data">설정 → 수업별 강사료표</a>에서 입력하면 자동 계산돼요.</p>` : ''}
    ${inc.other.length ? `<h2 style="margin-top:18px">수업 외 수입</h2><table class="stack"><thead><tr><th>날짜</th><th>내용</th><th>구분</th><th class="r">금액</th><th class="r">공제 후</th></tr></thead><tbody>
      ${inc.other.map(x => `<tr data-open="incomes" data-id="${esc(x.id)}"><td class="num">${esc(md(x.date))}</td><td>${esc(x.item)}</td><td>${esc(x.cat)}${Number(x.tax) ? ` <span class="tag">${esc(x.tax)}% 공제</span>` : ''}</td><td class="r num">${won(x.amount)}</td><td class="r num">${won(netOf(x))}</td></tr>`).join('')}
      </tbody></table>` : ''}
    <h2 style="margin-top:18px">기관별 강의 수입 <span class="n">${won(inc.total)}</span></h2>
    ${gl.length ? `<table class="stack"><thead><tr><th>수업 그룹</th><th class="r">횟수</th><th class="r">차시</th><th class="r">금액</th></tr></thead><tbody>
      ${gl.map(([g, v]) => `<tr data-act="rate" data-g="${esc(g)}"><td>${esc(g)}${v.noRate ? ' <span class="tag" style="--c:#c8371e">금액 미입력</span>' : ''}</td><td class="r num">${v.n}</td><td class="r num">${v.periods}</td><td class="r num">${won(v.amount)}</td></tr>`).join('')}
      </tbody></table>` : '<p class="empty">이 달에 진행한 수업이 없어요.</p>'}
    <details style="margin-top:14px"><summary>수업별 내역 보기 (${inc.rows.length}건)</summary>
      <table class="stack" style="margin-top:8px"><thead><tr><th>날짜</th><th>수업</th><th class="r">차시</th><th class="r">금액</th></tr></thead><tbody>
      ${inc.rows.sort((a, b) => (a.e.date + (a.e.time || '')).localeCompare(b.e.date + (b.e.time || ''))).map(r => `<tr data-open="events" data-id="${esc(r.e.id)}" class="${r.off ? 'off' : ''}"><td class="num">${esc(md(r.e.date))}</td><td>${esc(cleanTitle(r.e.title))}${r.manual ? ' <span class="tag">수동</span>' : ''}${r.off ? ` <span class="tag" style="--c:#888">${esc(r.e.status || '제외')}</span>` : ''}</td><td class="r num">${r.periods}</td><td class="r num">${r.off ? '-' : r.noRate ? '금액 미입력' : won(r.amount)}</td></tr>`).join('')}
      </tbody></table></details>
  </div>
  <div class="grid2">
    <div class="stackv">
      <div class="card"><div class="stats">
        <div class="stat"><b class="num">${total.toLocaleString('ko-KR')}</b><span>이번 달 지출(원)</span></div>
        <div class="stat"><b class="num">${payTotal.toLocaleString('ko-KR')}</b><span>정기 결제 월 합계(원)</span></div>
        <div class="stat"><b>${paidN}/${active.length}</b><span>정기 결제 납부</span></div></div>
        <h2 style="margin-top:18px">분류별 지출</h2>
        ${cats.length ? `<div class="bars">${cats.map(([k, v]) => `<div class="bar"><span>${esc(k)}</span><span class="tr"><i style="width:${Math.max(2, v / max * 100)}%"></i></span><span class="v">${won(v)}</span></div>`).join('')}</div>` : '<p class="empty">이 달의 지출 기록이 없어요.</p>'}
      </div>
      <div class="card"><h2>지출 내역 <span class="n">${ex.length}건</span></h2>
        ${ex.length ? `<table class="stack"><thead><tr><th>날짜</th><th>내용</th><th>분류</th><th>수단</th><th class="r">금액</th></tr></thead><tbody>
        ${ex.map(x => `<tr data-open="expenses" data-id="${esc(x.id)}"><td class="num">${esc(md(x.date))}</td><td>${esc(x.item)}${x.payId ? ' <span class="tag" style="--c:#8a7a12">정기</span>' : ''}</td><td>${esc(x.cat)}</td><td>${esc(x.method)}</td><td class="r num">${won(x.amount)}</td></tr>`).join('')}
        </tbody></table>` : '<p class="empty">아직 기록이 없어요. 위의 "+ 지출 입력"으로 시작하세요.</p>'}
      </div>
    </div>
    <div class="card"><h2>정기 결제 <span class="n">매달 자동으로 달력에 표시</span></h2>
      ${pays.length ? pays.map(p => { const paid = isPaid(p.id, mon); return `<div class="pay ${p.active === false ? 'off' : ''}">
        <span class="d">${esc(p.day)}일</span>
        <span class="nm" data-open="payments" data-id="${esc(p.id)}"><b>${esc(p.name)}</b><br><span class="mute">${esc(p.cat)} · ${esc(p.method)}</span></span>
        <span class="num">${won(p.amount)}</span>
        ${p.active === false ? '<span class="mute">중지</span>' : `<button class="btn sm ${paid ? 'ghost' : 'pri'}" data-act="pay" data-id="${esc(p.id)}" data-month="${mon}">${paid ? '납부 완료' : '납부 처리'}</button>`}
      </div>`; }).join('') : '<p class="empty">학원비, 보험료, 구독료처럼 매달 나가는 돈을 등록하면 결제일에 달력과 오늘 화면에 나타나요.</p>'}
    </div>
  </div>`;
}

function colorTable() {
  const map = colorMap(), custom = Store.profile().colors || {};
  const keys = Object.keys(map).sort((a, b) => a.localeCompare(b, 'ko'));
  if (!keys.length) return '';
  return `<div class="card"><h2>수업 블록 색 <span class="n">기관별로 바로 저장돼요</span></h2><div class="rates">${keys.map(k => `<div class="rate crow">
      <span class="sw" style="${swatch(map[k])}"></span><b>${esc(k)}</b>
      <select data-color="${esc(k)}" aria-label="${esc(k)} 블록 색">
        <option value="" ${custom[k] == null ? 'selected' : ''}>자동</option>
        <option value="none" ${custom[k] === 'none' ? 'selected' : ''}>색 없음</option>
        ${PALETTE_NAMES.map((n, i) => `<option value="${i}" ${custom[k] === i ? 'selected' : ''}>${n}</option>`).join('')}
      </select></div>`).join('')}</div></div>`;
}

function programRows() {
  const pr = progRates(), keys = new Set(Object.keys(pr));
  Store.list('events').filter(e => e.program).forEach(e => keys.add(`${e.program}|${(e.date || '').slice(0, 4)}`));
  if (!keys.size) return '';
  return `<h2 style="margin-top:16px;font-size:15px">사업별 금액 <span class="n">해당 사업으로 표시한 수업에 우선 적용</span></h2><div class="rates">${[...keys].sort().map(k => {
    const [p, y] = k.split('|'), n = Store.list('events').filter(e => e.program === p && (e.date || '').startsWith(y)).length;
    return `<div class="rate" data-pk="${esc(k)}"><span><b>${esc(p)} · ${esc(y)}년</b><br><span class="mute">수업 ${n}회</span></span><span class="mute" style="font-size:14px;text-align:right">블록 1개</span><input type="number" inputmode="numeric" min="0" step="1000" value="${pr[k] ?? ''}" placeholder="금액(원)" aria-label="${esc(p)} ${esc(y)}년 금액"></div>`;
  }).join('')}</div>`;
}

function rateTable() {
  const cnt = {};
  Store.list('events').filter(e => e.cat === 'class').forEach(e => { const g = groupOf(e); if (g) cnt[g] = (cnt[g] || 0) + 1; });
  const r = rates(); Object.keys(r).forEach(g => { cnt[g] ||= 0; });
  const list = Object.entries(cnt).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return `<form class="card" id="rform"><h2>수업별 강사료표 <span class="n">일정 블록 1개 = 강사료 1회</span></h2>
    ${list.length ? `<div class="rates">${list.map(([g, n]) => `<div class="rate" data-g="${esc(g)}">
      <span><b>${esc(g)}</b><br><span class="mute">수업 ${n}회</span></span>
      <span class="mute" style="font-size:14px;text-align:right">블록 1개</span>
      <input type="number" inputmode="numeric" min="0" step="1000" placeholder="${defaultRate(g) ? '기본 ' + defaultRate(g).amount.toLocaleString('ko-KR') : '금액(원)'}" value="${r[g]?.amount ?? ''}" aria-label="${esc(g)} 금액"></div>`).join('')}</div>` : '<p class="empty">수업 일정을 입력하면 기관별로 여기에 나타나요.</p>'}
    ${programRows()}
    <label class="ck" style="margin-top:10px"><input type="checkbox" id="r_tax" ${Store.profile().tax33 ? 'checked' : ''}><span>수입 화면에 3.3% 원천징수 후 금액도 보기</span></label>
    <p class="mute" style="font-size:14px;margin:6px 0 0">빈칸은 기본 규칙으로 계산돼요: 그외 도서관 120,000 · 학교 주강 100,000 · 학교 보조강 60,000 (블록 1개당).<br>특정 수업만 금액이 다르면 그 일정을 눌러 "강사료"를 직접 입력하세요. 그 값이 우선 적용돼요.</p>
    <div class="acts"><span class="sp"></span><button class="btn pri">강사료표 저장</button></div></form>`;
}

/* ---------- 9. 설정·데이터 화면 ---------- */
function renderData() {
  const p = Store.profile(), n = Store.count(), legacy = Store.legacy();
  const hasSample = ['events', 'careers', 'expenses', 'payments'].some(k => Store.list(k).some(x => x.sample));
  $('#v-data').innerHTML = `
  <div class="head"><div><h1>설정 · 데이터</h1><div class="sub">수업별 강사료, 블록 색, 이력서 머리글, 데이터 보관</div></div></div>
  ${legacy ? `<p class="note">이 브라우저에 1단계 때 입력한 기록 ${legacy.n}건이 남아 있어요.
    <button class="btn sm pri" data-act="legacy" style="margin-left:8px">내 계정으로 옮기기</button>
    <button class="btn sm ghost" data-act="legacyNo">무시하기</button></p>` : ''}
  <div class="grid2">
    <form class="card" id="pform"><h2>이력서 머리글</h2>
      <div class="fields">
        <label class="fl"><span>이름</span><input id="p_name" value="${esc(p.name)}"></label>
        <label class="fl"><span>직함</span><input id="p_title" value="${esc(p.title)}" placeholder="예: SW·AI 교육 강사"></label>
        <label class="fl wide"><span>연락처</span><input id="p_contact" value="${esc(p.contact)}" placeholder="이메일 또는 전화"></label>
        <label class="fl wide"><span>한 줄 소개</span><textarea id="p_intro" rows="3">${esc(p.intro)}</textarea></label>
      </div>
      <div class="acts"><span class="sp"></span><button class="btn pri">저장</button></div>
    </form>
    <div class="stackv">
      ${rateTable()}
      ${colorTable()}
      <div class="card"><h2>계정</h2>
        <p style="margin:0 0 12px"><b>${esc(Store.user?.email)}</b> 으로 로그인 중</p>
        <p class="note">데이터는 Supabase에 저장돼요. 휴대폰, 학교 컴퓨터 어디서든 같은 계정으로 로그인하면 똑같이 보여요.</p>
        <div class="acts" style="margin-top:0"><button class="btn" data-act="reload">새로 불러오기</button><button class="btn ghost" data-act="logout">로그아웃</button></div>
      </div>
      <div class="card"><h2>저장된 데이터</h2>
        <div class="stats"><div class="stat"><b>${n.careers}</b><span>커리어</span></div><div class="stat"><b>${n.events}</b><span>일정</span></div><div class="stat"><b>${n.expenses + n.payments}</b><span>지출·정기결제</span></div></div>
      </div>
      <div class="card"><h2>백업 · 옮기기</h2>
        <div class="acts" style="margin-top:0">
          <button class="btn" data-act="export">내보내기(복사)</button>
          <button class="btn" data-act="download">파일로 저장</button>
          <label class="btn" style="display:inline-flex;align-items:center">가져오기<input type="file" id="imp" accept=".json,application/json" hidden></label>
        </div>
        <h2 style="margin-top:20px">둘러보기용 예시</h2>
        <div class="acts" style="margin-top:0">
          ${hasSample ? '<button class="btn" data-act="unsample">예시 데이터만 지우기</button>' : '<button class="btn" data-act="sample">예시 데이터 넣기</button>'}
          <button class="btn ghost danger" data-act="clear">전체 삭제</button>
        </div>
      </div>
    </div>
  </div>`;
  $('#pform').onsubmit = e => {
    e.preventDefault();
    Store.saveProfile({ ...Store.profile(), name: $('#p_name').value.trim(), title: $('#p_title').value.trim(), contact: $('#p_contact').value.trim(), intro: $('#p_intro').value.trim() });
    toast('저장했어요');
  };
  document.querySelectorAll('[data-color]').forEach(sel => sel.onchange = () => {
    const colors = { ...(Store.profile().colors || {}) }, v = sel.value;
    if (v === '') delete colors[sel.dataset.color]; else colors[sel.dataset.color] = v === 'none' ? 'none' : Number(v);
    Store.saveProfile({ ...Store.profile(), colors }); toast('색을 바꿨어요');
  });
  $('#rform').onsubmit = e => {
    e.preventDefault();
    const r = {};
    document.querySelectorAll('#rform [data-g]').forEach(row => {
      const amount = row.querySelector('input').value;
      if (amount !== '') r[row.dataset.g] = { mode: 'session', amount: Number(amount) };
    });
    const pr = {};
    document.querySelectorAll('#rform [data-pk]').forEach(row => { const v = row.querySelector('input').value; if (v !== '') pr[row.dataset.pk] = Number(v); });
    Store.saveProfile({ ...Store.profile(), rates: r, progRates: pr, tax33: $('#r_tax').checked });
    toast('강사료표를 저장했어요');
  };
  if (state.focusRate) { const row = document.querySelector(`#rform [data-g="${CSS.escape(state.focusRate)}"]`); state.focusRate = null; if (row) { row.scrollIntoView({ block: 'center' }); row.querySelector('input').focus(); } }
  $('#imp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const text = await f.text();
      let cnt = 0; try { const j = JSON.parse(text); cnt = (j.events || []).length + (j.expenses || []).length + (j.careers || []).length + (j.payments || []).length; } catch (e) { throw e; }
      if (!(await ask(`이 파일의 기록 ${cnt.toLocaleString('ko-KR')}건을 지금 데이터에 더할까요? 기존 기록은 그대로 남아요.`))) { e.target.value = ''; return; }
      toast('가져오는 중… 잠시만 기다려 주세요');
      const n = await Store.importAll(text, 'merge'); toast(`${n.toLocaleString('ko-KR')}건을 가져왔어요`); e.target.value = '';
    } catch (err) { console.error(err); toast('가져오지 못했어요. 파일을 확인해 주세요'); }
  };
}

/* ---------- 10. 입력창(팝업): 항목별 입력칸 정의 → 자동으로 폼 생성 ---------- */
// [키, 이름, 종류, 옵션]
const FORMS = {
  events: { t: '일정', f: [
    ['title', '제목', 'text', { req: 1, ph: '예: 3학년 2반 AI 수업' }],
    ['cat', '분류', 'select', { opts: EV_CATS.filter(c => c.k !== 'pay').map(c => [c.k, c.n]) }],
    ['time', '시작 시간', 'time'],
    ['endTime', '끝 시간', 'time'],
    ['date', '날짜', 'date', { req: 1 }],
    ['end', '끝나는 날 (여러 날일 때)', 'date'],
    ['status', '상태', 'select', { opts: [['진행', '정상 진행'], ...OFF_WORDS.map(w => [w, w])] }],
    ['role', '역할', 'select', { opts: [['', '해당 없음'], ['주강', '주강'], ['보조강', '보조강']], only: 'class' }],
    ['program', '사업', 'select', { opts: [['', '해당 없음'], ...PROGRAMS.map(p => [p, p])], only: 'class' }],
    ['color', '블록 색', 'select', { opts: [['', '기본'], ['none', '색 없음'], ...PALETTE_NAMES.map((n, i) => [String(i), n])] }],
    ['important', '★ 중요 일정으로 표시', 'check'],
    ['periods', '차시 — 비우면 2차시', 'number', { step: '1', min: 0, only: 'class' }],
    ['pay', '강사료(원) — 비우면 강사료표로 자동', 'number', { step: '1000', min: 0, only: 'class' }],
    ['memo', '메모', 'textarea']] },
  careers: { t: '커리어 기록', f: [
    ['kind', '구분', 'select', { opts: CAREER_KINDS.map(c => [c.k, c.n]) }],
    ['hours', '시수(시간)', 'number', { step: '0.5', min: 0 }],
    ['title', '교육명 · 활동명', 'text', { req: 1, ph: '예: 생성형 AI 실전 활용' }],
    ['org', '교육기관 · 주관', 'text', { list: 'orgs', ph: '예: 울산과학관' }],
    ['start', '시작일', 'date', { req: 1 }],
    ['end', '종료일', 'date'],
    ['target', '대상', 'text', { ph: '예: 중학교 1학년 25명' }],
    ['role', '역할', 'text', { ph: '예: 주강사, 기획·운영' }],
    ['project', '프로젝트 묶음', 'text', { list: 'projects', ph: '포트폴리오에서 이 이름으로 묶여요' }],
    ['tags', '키워드', 'text', { ph: '쉼표로 구분: 생성형AI, PBL' }],
    ['result', '성과 · 업적', 'textarea', { ph: '만족도, 산출물, 수상, 언론 보도 등' }],
    ['link', '관련 링크 (https://로 시작)', 'url'],
    ['featured', '대표 이력으로 표시 (★)', 'check'],
    ['onCal', '이 기간을 달력에 "수업"으로 표시', 'check']] },
  expenses: { t: '지출', f: [
    ['date', '날짜', 'date', { req: 1 }],
    ['amount', '금액(원)', 'number', { req: 1, min: 0 }],
    ['item', '내용', 'text', { req: 1, ph: '예: 점심, 교재 구입' }],
    ['cat', '분류', 'select', { opts: EXP_CATS }],
    ['method', '결제수단', 'select', { opts: METHODS }],
    ['color', '블록 색', 'select', { opts: [['', '기본'], ['none', '색 없음'], ...PALETTE_NAMES.map((n, i) => [String(i), n])] }],
    ['memo', '메모', 'text']] },
  incomes: { t: '수업 외 수입', f: [
    ['date', '날짜', 'date', { req: 1 }],
    ['amount', '금액(원, 세전)', 'number', { req: 1, min: 0 }],
    ['item', '내용', 'text', { req: 1, ph: '예: 교안공모전 상금' }],
    ['cat', '구분', 'select', { opts: ['강의료(실입금)', '사업비', '상금', '교안·원고료', '기타 수입'] }],
    ['tax', '공제', 'select', { opts: [['0', '공제 없음'], ['3.3', '3.3% (사업소득)'], ['8.8', '8.8% (기타소득)']] }],
    ['memo', '메모', 'text']] },
  payments: { t: '정기 결제', f: [
    ['name', '이름', 'text', { req: 1, ph: '예: 성빈 수학학원' }],
    ['day', '매월 결제일', 'number', { req: 1, min: 1, max: 31 }],
    ['amount', '금액(원)', 'number', { req: 1, min: 0 }],
    ['cat', '분류', 'select', { opts: EXP_CATS }],
    ['method', '결제수단', 'select', { opts: METHODS }],
    ['color', '블록 색', 'select', { opts: [['', '기본'], ['none', '색 없음'], ...PALETTE_NAMES.map((n, i) => [String(i), n])] }],
    ['memo', '메모', 'text'],
    ['active', '사용 중 (끄면 달력에서 숨김)', 'check']] }
};
const DEFAULTS = {
  events: () => ({ cat: 'class', date: today() }),
  careers: () => ({ kind: 'lecture', start: today() }),
  expenses: () => ({ date: today(), cat: '식비', method: '카드' }),
  incomes: () => ({ date: today(), cat: '기타 수입', tax: '0' }),
  payments: () => ({ active: true, cat: '교육비(학원비)', method: '자동이체', day: 25 })
};
function field(k, label, type, o = {}, v) {
  const id = 'f_' + k; v = v ?? '';
  const lab = `${esc(label)}${o.req ? ' <b>*</b>' : ''}`;
  if (type === 'select') return `<label class="fl" ${o.only ? `data-only="${o.only}"` : ''}><span>${lab}</span><select id="${id}">${o.opts.map(x => { const [val, name] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(val)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(name)}</option>`; }).join('')}</select></label>`;
  if (type === 'textarea') return `<label class="fl wide"><span>${lab}</span><textarea id="${id}" rows="3" placeholder="${esc(o.ph || '')}">${esc(v)}</textarea></label>`;
  if (type === 'check') return `<label class="ck wide"><input type="checkbox" id="${id}" ${v ? 'checked' : ''}><span>${lab}</span></label>`;
  const attrs = [o.req && 'required', o.ph && `placeholder="${esc(o.ph)}"`, o.list && `list="${o.list}"`, o.step && `step="${o.step}"`,
    o.min != null && `min="${o.min}"`, o.max != null && `max="${o.max}"`, type === 'number' && 'inputmode="decimal"'].filter(Boolean).join(' ');
  return `<label class="fl ${type === 'text' || type === 'url' ? 'wide' : ''}" ${o.only ? `data-only="${o.only}"` : ''}><span>${lab}</span><input id="${id}" type="${type}" value="${esc(v)}" ${attrs}></label>`;
}
function openForm(kind, obj) {
  const F = FORMS[kind], isNew = !obj.id, dlg = $('#dlg');
  const opts = arr => uniq(arr).map(x => `<option value="${esc(x)}">`).join('');
  dlg.innerHTML = `<form id="fm"><h2>${F.t} ${isNew ? '추가' : '수정'}</h2>
    <div class="fields">${F.f.map(([k, l, t, o]) => field(k, l, t, o, obj[k])).join('')}</div>
    <datalist id="orgs">${opts(Store.list('careers').map(c => c.org))}</datalist>
    <datalist id="projects">${opts(Store.list('careers').map(c => c.project))}</datalist>
    <div class="acts">${isNew ? '' : '<button type="button" class="btn ghost danger" id="fdel">삭제</button>'}<span class="sp"></span>
      <button type="button" class="btn ghost" id="fclose">취소</button><button class="btn pri">저장</button></div></form>`;
  dlg.showModal();
  if (kind === 'events') {                       // 수업일 때만 시간·강사료 칸 보이기, 자동 계산값을 회색 글씨로 안내
    const sync = () => {
      const cat = $('#f_cat').value, cur = { ...obj, title: $('#f_title').value, time: $('#f_time').value, endTime: $('#f_endTime').value, role: $('#f_role').value, program: $('#f_program').value, status: $('#f_status').value, periods: $('#f_periods').value, pay: '' };
      dlg.querySelectorAll('[data-only]').forEach(l => { l.hidden = l.dataset.only !== cat; });
      const ic = incomeOf(cur);
      $('#f_periods').placeholder = '2차시 (기본)';
      $('#f_pay').placeholder = ic.autoAmount == null ? `「${ic.g}」 금액 미입력 (설정 → 강사료표)` : `자동: ${ic.autoAmount.toLocaleString('ko-KR')}원 (${ic.rule || '강사료표'} · ${ic.g})`;
    };
    ['#f_cat', '#f_title', '#f_time', '#f_endTime', '#f_role', '#f_program', '#f_periods', '#f_status'].forEach(sel => $(sel).addEventListener('input', sync));
    $('#f_cat').addEventListener('change', sync); sync();
  }
  $('#fm').onsubmit = e => {
    e.preventDefault();
    const out = { ...obj };
    F.f.forEach(([k, , t]) => {
      const el = $('#f_' + k);
      out[k] = t === 'check' ? el.checked : t === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value.trim();
    });
    if (out.end && out.end < (out.date || out.start)) out.end = '';
    if (out.color !== '' && out.color !== 'none' && out.color != null) out.color = Number(out.color);
    if (out.link && !safeUrl(out.link)) { toast('링크는 https://로 시작해야 해요'); return; }
    Store.save(kind, out); dlg.close(); toast('저장했어요');
  };
  $('#fclose').onclick = () => dlg.close();
  if (!isNew) $('#fdel').onclick = async () => {
    if (await ask('이 항목을 삭제할까요? 되돌릴 수 없어요.')) { Store.remove(kind, obj.id); dlg.close(); toast('삭제했어요'); }
  };
}

/* ---------- 11. 버튼 처리: 화면 어디를 누르든 여기서 한 번에 받습니다 ---------- */
document.addEventListener('click', async e => {
  if (e.target.closest('[data-stop]')) return;
  const a = e.target.closest('[data-act]'), row = e.target.closest('[data-open]');
  if (row && (!a || a.contains(row))) {             // 항목을 누르면 수정창 열기 (칸 안의 항목 포함)
    const item = Store.get(row.dataset.open, row.dataset.id); if (item) openForm(row.dataset.open, item);
    return;
  }
  if (!a) return;
  const act = a.dataset.act;
  if (act === 'add') {
    const o = DEFAULTS[a.dataset.kind]();
    if (a.dataset.cat) o.cat = a.dataset.cat;
    if (a.dataset.date) o.date = a.dataset.date;
    openForm(a.dataset.kind, o);
  }
  if (act === 'wnav') { const d = +a.dataset.d, x = state.anchor; state.anchor = !d ? new Date() : state.sview === 'week' ? addDays(x, 7 * d) : new Date(x.getFullYear(), x.getMonth() + d, 1); renderSchedule(); }
  if (act === 'rate') { state.focusRate = a.dataset.g; location.hash = 'data'; }
  if (act === 'sview') { state.sview = a.dataset.v; renderSchedule(); }
  if (act === 'mview') { state.mview = a.dataset.v; renderMoney(); }
  if (act === 'ynav') { state.mY = +a.dataset.d ? state.mY + +a.dataset.d : new Date().getFullYear(); renderMoney(); }
  if (act === 'gomonth') { state.mY = +a.dataset.y; state.mM = +a.dataset.m; state.mview = 'month'; renderMoney(); window.scrollTo(0, 0); }
  if (act === 'goyear') { state.mY = +a.dataset.y; renderMoney(); }
  if (act === 'mmonth') { const d = +a.dataset.d; const n = d ? new Date(state.mY, state.mM + d, 1) : new Date(); state.mY = n.getFullYear(); state.mM = n.getMonth(); renderMoney(); }
  if (act === 'done') { const ev = Store.get('events', a.dataset.id); if (ev) Store.save('events', { ...ev, done: a.checked }); }
  if (act === 'pay') {
    const p = Store.get('payments', a.dataset.id), mon = a.dataset.month; if (!p) return;
    const paid = Store.list('expenses').find(x => x.payId === p.id && x.payMonth === mon);
    if (paid) { if (await ask(`${p.name} ${mon.replace('-', '년 ')}월 납부 기록을 취소할까요?`)) Store.remove('expenses', paid.id); }
    else {
      const [y, m] = mon.split('-').map(Number), last = new Date(y, m, 0).getDate();
      Store.save('expenses', { date: `${mon}-${pad(Math.min(Number(p.day) || 1, last))}`, item: p.name, amount: p.amount, cat: p.cat, method: p.method, memo: '정기 결제', payId: p.id, payMonth: mon });
      toast('가계부에 기록했어요');
    }
  }
  if (act === 'ctab') { state.ctab = a.dataset.v; document.querySelectorAll('[data-act=ctab]').forEach(b => b.setAttribute('aria-pressed', b === a)); renderCareerBody(); }
  if (act === 'group') { state.group = a.dataset.v; renderCareerBody(); }
  if (act === 'copyResume') copyText(resumeText(filteredCareers()));
  if (act === 'print') { try { window.print(); } catch (err) { toast('이 화면에서는 인쇄가 막혀 있어요'); } }
  if (act === 'export') copyText(Store.exportAll());
  if (act === 'download') {
    try {
      const url = URL.createObjectURL(new Blob([Store.exportAll()], { type: 'application/json' }));
      const l = document.createElement('a'); l.href = url; l.download = `티칭로그-백업-${today()}.json`; l.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { copyText(Store.exportAll()); }
  }
  if (act === 'sample') { loadSample(); toast('예시 데이터를 넣었어요'); }
  if (act === 'unsample') { if (await ask('예시 데이터만 지울까요? 직접 입력한 내용은 그대로 남아요.')) { Store.removeWhere(x => x.sample); toast('예시 데이터를 지웠어요'); } }
  if (act === 'clear') { if (await ask('모든 일정·커리어·지출 기록을 지울까요? 먼저 내보내기로 백업해 두세요.')) { await Store.clear(); toast('모두 지웠어요'); } }
  if (act === 'reload') { await Store.reload(); toast('새로 불러왔어요'); }
  if (act === 'logout') { if (await ask('로그아웃할까요?')) { await Store.signOut(); showAuth(); } }
  if (act === 'legacyNo') { if (await ask('이 브라우저에 남은 1단계 기록을 지울까요? 계정 데이터에는 영향이 없어요.')) { Store.forgetLegacy(); render(); } }
  if (act === 'legacy') {
    const lg = Store.legacy(); if (!lg) return;
    try {
      const d = JSON.parse(lg.raw);
      ['events', 'careers', 'expenses', 'payments'].forEach(k => { if (Array.isArray(d[k])) d[k] = d[k].filter(x => !x.sample); });
      toast('옮기는 중…');
      const n = await Store.importAll(JSON.stringify(d), 'merge');
      Store.forgetLegacy(); render(); toast(`${n}건을 계정으로 옮겼어요`);
    } catch (err) { console.error(err); toast('옮기지 못했어요. 잠시 뒤 다시 해 주세요'); }
  }
});

/* ---------- 12. 예시 데이터 (둘러보기용, "예시 데이터만 지우기"로 한 번에 삭제) ---------- */
function loadSample() {
  const d = n => ymd(addDays(new Date(), n));
  const S = (kind, o) => Store.save(kind, { ...o, sample: true });
  if (!Store.profile().name) Store.saveProfile({ name: '박수빈', title: 'SW·AI 교육 강사', contact: '', intro: 'AI 도구를 수업에 녹여 학생이 직접 만들어 보는 SW·AI 교육을 설계하고 가르칩니다.' });
  [
    { kind: 'lecture', title: '생성형 AI 실전 활용 (시니어 과정)', org: '예시 평생학습관', start: d(-40), end: d(-12), hours: 16, target: '시니어 학습자 20명', role: '주강사', project: '시니어 생성형 AI 교육', tags: 'Gemini, 이미지 생성', result: '수강생이 직접 만든 가족 사진첩 결과물 발표', featured: true },
    { kind: 'lecture', title: '생성형 AI, 내 손으로 만들어 보자!', org: '예시 직업계고', start: d(5), end: d(6), hours: 4, target: '고등학교 3학년', role: '주강사', project: '직업계고 생성형 AI 수업', tags: 'Gemini Canvas, 웹앱', onCal: true },
    { kind: 'lecture', title: 'AI 콘텐츠 기획 제작 체험', org: '예시 진로체험센터', start: d(-75), hours: 3, target: '중학생', role: '주강사', project: '진로체험', tags: 'AI 콘텐츠, 진로' },
    { kind: 'project', title: '2040 미래 울산 프로젝트 수업 설계', org: '예시 중학교', start: d(-150), end: d(-90), target: '중학교 2학년', role: '기획·수업 설계', project: '2040 미래 울산 프로젝트', tags: 'PBL, 지역 문제, Gemini', result: '학생들이 시장 후보가 되어 울산 도시 문제 해결 공약 발표', featured: true },
    { kind: 'publish', title: '『와일드 로봇』 연계 AI 상상 프로젝트 차시 자료', org: '', start: d(-30), end: d(-8), target: '초등 고학년', role: '집필', project: '와일드 로봇 AI 상상 프로젝트', tags: 'AI 리터러시, 독서' },
    { kind: 'award', title: 'SW미래채움 교안공모전 응모', org: '예시 주관기관', start: d(-60), role: '개인 응모', project: '2040 미래 울산 프로젝트', result: '결과 입력 예시' },
    { kind: 'training', title: '특수교육 대상 AI 교수법 연수 이수', org: '예시 교육연수원', start: d(-200), end: d(-196), hours: 15, role: '수강', tags: '특수교육, AI' }
  ].forEach(o => S('careers', o));
  [
    { title: '1학년 바이브 코딩 수업', cat: 'class', date: d(0), time: '10:00' },
    { title: '강의 자료 최종 점검', cat: 'work', date: d(0), time: '15:00' },
    { title: '출강 기관에 강사 서류 보내기', cat: 'issue', date: d(0) },
    { title: '성빈 준비물: 미술 도구', cat: 'son', date: d(0) },
    { title: '성빈 치과 정기검진', cat: 'son', date: d(3), time: '16:30' },
    { title: 'Supabase 기초 공부', cat: 'study', date: d(2), time: '20:00' },
    { title: '교안공모전 서류 마감', cat: 'work', date: d(9) },
    { title: '가족 저녁 약속', cat: 'personal', date: d(4), time: '18:30' },
    { title: '성빈 학원 상담', cat: 'son', date: d(8), time: '17:00' }
  ].forEach(o => S('events', o));
  [
    { name: '성빈 수학학원', day: new Date().getDate() + 3 > 28 ? 28 : new Date().getDate() + 3, amount: 320000, cat: '교육비(학원비)', method: '자동이체', active: true },
    { name: '성빈 영어학원', day: 10, amount: 280000, cat: '교육비(학원비)', method: '카드', active: true },
    { name: '휴대폰 요금', day: 25, amount: 68000, cat: '공과금·통신', method: '자동이체', active: true }
  ].forEach(o => S('payments', o));
  [
    { date: d(0), item: '점심', amount: 9500, cat: '식비', method: '카드' },
    { date: d(-1), item: '수업용 키트 소모품', amount: 42000, cat: '자기계발', method: '카드' },
    { date: d(-2), item: '장보기', amount: 76300, cat: '생활·장보기', method: '카드' },
    { date: d(-3), item: '주유', amount: 60000, cat: '교통·차량', method: '카드' },
    { date: d(-5), item: '성빈 문제집', amount: 18000, cat: '교육비(학원비)', method: '현금' }
  ].forEach(o => S('expenses', o));
}

/* ---------- 13. 로그인 화면 ---------- */
function showAuth() {
  document.body.classList.add('signed-out');
  $('#app').hidden = true; $('#auth').hidden = false;
  $('#authMsg').textContent = '';
}
function showApp() {
  document.body.classList.remove('signed-out');
  $('#auth').hidden = true; $('#app').hidden = false; $('#sync').hidden = false; $('#sync').className = 'sync'; $('#sync').textContent = '저장됨';
  route();
}
const EMAIL_MSG = '이메일 주소 전체를 입력해 주세요 (예: name@gmail.com)';
const KO_ERR = m => /email address|invalid format|valid email/i.test(m) ? EMAIL_MSG
  : /invalid login/i.test(m) ? '이메일 또는 비밀번호가 맞지 않아요.'
  : /not confirmed/i.test(m) ? '메일함에서 가입 확인 링크를 먼저 눌러 주세요.'
  : /already registered/i.test(m) ? '이미 가입된 이메일이에요. 로그인해 주세요.'
  : /password/i.test(m) ? '비밀번호는 6자 이상으로 해 주세요.'
  : /rate limit/i.test(m) ? '잠시 뒤에 다시 시도해 주세요.' : '문제가 생겼어요: ' + m;
async function authDo(kind) {
  const email = $('#authEmail').value.trim(), pw = $('#authPw').value, msg = $('#authMsg');
  msg.className = 'auth-msg';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = EMAIL_MSG; $('#authEmail').focus(); return; }
  if (pw.length < 6) { msg.textContent = '비밀번호는 6자 이상으로 해 주세요.'; $('#authPw').focus(); return; }
  msg.className = 'auth-msg ok'; msg.textContent = kind === 'in' ? '로그인 중…' : '가입 중…';
  try {
    if (kind === 'in') { await Store.signIn(email, pw); showApp(); }
    else if (await Store.signUp(email, pw)) showApp();
    else { msg.className = 'auth-msg ok'; msg.textContent = '가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 여기서 로그인하세요.'; }
  } catch (err) { msg.className = 'auth-msg'; msg.textContent = KO_ERR(err.message || ''); }
}
$('#authForm').onsubmit = e => { e.preventDefault(); authDo('in'); };
$('#btnUp').onclick = () => authDo('up');
if (!CONFIG.googleLogin) { $('#btnGoogle').hidden = true; $('.or').hidden = true; }
$('#btnGoogle').onclick = async () => {
  const msg = $('#authMsg'); msg.className = 'auth-msg ok'; msg.textContent = 'Google 로그인 화면으로 이동 중…';
  try { await Store.signInWithGoogle(); }
  catch (err) { msg.className = 'auth-msg'; msg.textContent = /not enabled|unsupported provider/i.test(err.message) ? 'Google 로그인이 아직 켜져 있지 않아요. Supabase 설정을 확인해 주세요.' : KO_ERR(err.message || ''); }
};

/* ---------- 14. 시작: 로그인 확인 → 데이터 불러오기 → 화면 그리기 ---------- */
Store.onChange(() => { if (!$('#app').hidden) render(); });
Store.onError(toast);
Store.onStatus(s => { const el = $('#sync'); el.className = 'sync ' + s; el.textContent = s === 'saving' ? '저장 중…' : '저장됨'; });
window.addEventListener('hashchange', () => { if (!$('#app').hidden) route(); });
document.body.classList.add('signed-out');
Store.init().then(u => u ? showApp() : showAuth()).catch(err => {
  console.error(err); showAuth();
  $('#authMsg').textContent = /fetch|network/i.test(err.message) ? 'Supabase에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.' : '로그인하지 못했어요: ' + err.message;
});
}
