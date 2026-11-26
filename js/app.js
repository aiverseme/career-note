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
      out.push({ src: 'events', id: e.id, title: e.title, start: e.date, end, time: e.time || '', cat: e.cat, done: !!e.done, status: e.status });
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
      out.push({ src: 'payments', id: p.id, title: `${p.name} ${won(p.amount)}`, start: d, end: d, time: '', cat: 'pay', month, done: isPaid(p.id, month) });
    });
  }
  return out.sort((a, b) => (a.start + (a.time || '99')).localeCompare(b.start + (b.time || '99')));
}
const onDay = (items, d) => items.filter(i => i.start <= d && i.end >= d);
const isPaid = (pid, month) => Store.list('expenses').some(x => x.payId === pid && x.payMonth === month);

function itemRow(i, showDate) {
  const c = catOf(i.cat);
  const lead = showDate ? md(i.start) : (i.time || (i.cat === 'pay' ? '결제' : '종일'));
  let ctl = '';
  if (i.cat === 'issue' && i.src === 'events') ctl = `<input type="checkbox" data-act="done" data-id="${esc(i.id)}" ${i.done ? 'checked' : ''} aria-label="완료">`;
  if (i.cat === 'pay') ctl = `<button class="btn sm ${i.done ? 'ghost' : 'pri'}" data-act="pay" data-id="${esc(i.id)}" data-month="${i.month}">${i.done ? '납부 완료' : '납부 처리'}</button>`;
  return `<li class="it" data-open="${i.src}" data-id="${esc(i.id)}">
    <span class="tm">${esc(lead)}</span><span class="tag" style="--c:${c.c}">${c.n}</span>
    <span class="tt ${i.done ? 'done' : ''}">${esc(i.title)}</span>${ctl || '<span></span>'}</li>`;
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
      <div class="card"><h2>결제 예정 <span class="n">10일 이내</span></h2>${listOr(pays, '다가오는 정기 결제가 없어요.', true)}</div>
    </div>
  </div>`;
}

/* ---------- 6. 일정 화면: 스프레드시트처럼 보는 주간 표 / 월간 표 ---------- */
// 공휴일 (우주항공청 월력요항 기준). 해마다 다음 해 목록을 여기에 추가하면 돼요.
const HOLIDAYS = {
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
const keyOf = t => (String(t || '').trim().split(/\s+/)[0] || '').replace(/[()[\],·]/g, '');
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
  Object.keys(first).sort((a, b) => first[a].localeCompare(first[b]) || a.localeCompare(b)).forEach((k, i) => { map[k] = PALETTE[i % PALETTE.length]; });
  return map;
}
function chip(i, colors) {
  const off = isOff(i) || (i.done && (i.cat === 'issue' || i.cat === 'pay'));
  const time = i.time ? i.time + (endOf(i.title) ? '-' + endOf(i.title) : '') : '';
  const attr = `data-open="${i.src}" data-id="${esc(i.id)}" title="${esc(i.title)}"`;
  if (i.cat === 'class') {
    const [bg, fg] = colors[keyOf(i.title)] || PALETTE[9];
    return `<span class="gc ${off ? 'off' : ''}" style="--bg:${bg};--fg:${fg}" ${attr}>${esc(cleanTitle(i.title))}${time ? `<small>${time}</small>` : ''}</span>`;
  }
  if (i.cat === 'issue' || i.cat === 'pay') return `<span class="gc hot ${off ? 'off' : ''}" ${attr}>${esc(i.title)}${i.cat === 'pay' && i.done ? ' · 납부' : ''}</span>`;
  return `<span class="gl ${off ? 'off' : ''}" ${attr}>${time ? `<b>${time}</b> ` : ''}${esc(cleanTitle(i.title))}</span>`;
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
      h += `<div class="wsp" style="grid-row:${rr};grid-column:${a + 2}/${b + 3}"><span class="bar ${isOff(i) ? 'off' : ''}" title="${esc(i.title)}" data-open="${i.src}" data-id="${esc(i.id)}">${esc(i.title)}</span></div>`;
    });
    const rr = row + spans.length;
    for (let k = 0; k < 7; k++) {
      let inner = onDay(singles, ds[k]).map(i => chip(i, colors)).join('');
      if (r.k === 'pay') inner += exps.filter(x => x.date === ds[k]).map(x => `<span class="gc hot" data-open="expenses" data-id="${esc(x.id)}">${esc(x.item)} ${won(x.amount)}</span>`).join('');
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

/* ---------- 8. 가계부 화면 ---------- */
function renderMoney() {
  const { mY: y, mM: m } = state, mon = `${y}-${pad(m + 1)}`;
  const ex = Store.list('expenses').filter(x => (x.date || '').startsWith(mon)).sort((a, b) => b.date.localeCompare(a.date));
  const total = ex.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const byCat = {}; ex.forEach(x => { byCat[x.cat || '기타'] = (byCat[x.cat || '기타'] || 0) + (Number(x.amount) || 0); });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]), max = cats[0]?.[1] || 1;
  const pays = Store.list('payments').slice().sort((a, b) => (a.day || 0) - (b.day || 0));
  const active = pays.filter(p => p.active !== false);
  const payTotal = active.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const paidN = active.filter(p => isPaid(p.id, mon)).length;

  $('#v-money').innerHTML = `
  <div class="head"><div><h1>가계부</h1><div class="sub">지출 기록과 매달 나가는 정기 결제</div></div>
    <div class="tools"><button class="btn pri" data-act="add" data-kind="expenses">+ 지출 입력</button>
    <button class="btn" data-act="add" data-kind="payments">+ 정기 결제 등록</button></div></div>
  <div class="calbar"><h2>${y}년 ${m + 1}월</h2>
    <button class="btn sm" data-act="mmonth" data-d="-1" aria-label="이전 달">‹</button>
    <button class="btn sm" data-act="mmonth" data-d="0">이번 달</button>
    <button class="btn sm" data-act="mmonth" data-d="1" aria-label="다음 달">›</button></div>
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

/* ---------- 9. 설정·데이터 화면 ---------- */
function renderData() {
  const p = Store.profile(), n = Store.count(), legacy = Store.legacy();
  const hasSample = ['events', 'careers', 'expenses', 'payments'].some(k => Store.list(k).some(x => x.sample));
  $('#v-data').innerHTML = `
  <div class="head"><div><h1>설정 · 데이터</h1><div class="sub">이력서 머리글과 데이터 보관</div></div></div>
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
    Store.saveProfile({ name: $('#p_name').value.trim(), title: $('#p_title').value.trim(), contact: $('#p_contact').value.trim(), intro: $('#p_intro').value.trim() });
    toast('저장했어요');
  };
  $('#imp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const text = await f.text();
      const replace = await ask('기존 데이터를 지우고 이 파일로 바꿀까요? (취소하면 기존 데이터에 합칩니다)');
      toast('가져오는 중…');
      const n = await Store.importAll(text, replace ? 'replace' : 'merge'); toast(`${n}건을 가져왔어요`);
    } catch (err) { console.error(err); toast('가져오지 못했어요. 파일을 확인해 주세요'); }
  };
}

/* ---------- 10. 입력창(팝업): 항목별 입력칸 정의 → 자동으로 폼 생성 ---------- */
// [키, 이름, 종류, 옵션]
const FORMS = {
  events: { t: '일정', f: [
    ['title', '제목', 'text', { req: 1, ph: '예: 3학년 2반 AI 수업' }],
    ['cat', '분류', 'select', { opts: EV_CATS.filter(c => c.k !== 'pay').map(c => [c.k, c.n]) }],
    ['time', '시간', 'time'],
    ['date', '날짜', 'date', { req: 1 }],
    ['end', '끝나는 날 (여러 날일 때)', 'date'],
    ['status', '상태', 'select', { opts: [['진행', '정상 진행'], ...OFF_WORDS.map(w => [w, w])] }],
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
    ['memo', '메모', 'text']] },
  payments: { t: '정기 결제', f: [
    ['name', '이름', 'text', { req: 1, ph: '예: 성빈 수학학원' }],
    ['day', '매월 결제일', 'number', { req: 1, min: 1, max: 31 }],
    ['amount', '금액(원)', 'number', { req: 1, min: 0 }],
    ['cat', '분류', 'select', { opts: EXP_CATS }],
    ['method', '결제수단', 'select', { opts: METHODS }],
    ['memo', '메모', 'text'],
    ['active', '사용 중 (끄면 달력에서 숨김)', 'check']] }
};
const DEFAULTS = {
  events: () => ({ cat: 'class', date: today() }),
  careers: () => ({ kind: 'lecture', start: today() }),
  expenses: () => ({ date: today(), cat: '식비', method: '카드' }),
  payments: () => ({ active: true, cat: '교육비(학원비)', method: '자동이체', day: 25 })
};
function field(k, label, type, o = {}, v) {
  const id = 'f_' + k; v = v ?? '';
  const lab = `${esc(label)}${o.req ? ' <b>*</b>' : ''}`;
  if (type === 'select') return `<label class="fl"><span>${lab}</span><select id="${id}">${o.opts.map(x => { const [val, name] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(val)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(name)}</option>`; }).join('')}</select></label>`;
  if (type === 'textarea') return `<label class="fl wide"><span>${lab}</span><textarea id="${id}" rows="3" placeholder="${esc(o.ph || '')}">${esc(v)}</textarea></label>`;
  if (type === 'check') return `<label class="ck wide"><input type="checkbox" id="${id}" ${v ? 'checked' : ''}><span>${lab}</span></label>`;
  const attrs = [o.req && 'required', o.ph && `placeholder="${esc(o.ph)}"`, o.list && `list="${o.list}"`, o.step && `step="${o.step}"`,
    o.min != null && `min="${o.min}"`, o.max != null && `max="${o.max}"`, type === 'number' && 'inputmode="decimal"'].filter(Boolean).join(' ');
  return `<label class="fl ${type === 'text' || type === 'url' ? 'wide' : ''}"><span>${lab}</span><input id="${id}" type="${type}" value="${esc(v)}" ${attrs}></label>`;
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
  $('#fm').onsubmit = e => {
    e.preventDefault();
    const out = { ...obj };
    F.f.forEach(([k, , t]) => {
      const el = $('#f_' + k);
      out[k] = t === 'check' ? el.checked : t === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value.trim();
    });
    if (out.end && out.end < (out.date || out.start)) out.end = '';
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
  if (act === 'sview') { state.sview = a.dataset.v; renderSchedule(); }
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
