// یادآوری کارهای روزانه — منطق سمت کاربر (ذخیره محلی)
const LS_TASKS = 'reminder-tasks-v1';
const LS_FIRED = 'reminder-fired-v1';
const LS_HIST = 'reminder-history-v1';
const LS_STREAK = 'reminder-streak-v1';

const faNum = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const $ = id => document.getElementById(id);
const todayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const minutesOf = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const hm = mins => { const h = Math.floor(mins / 60) % 24, m = mins % 60; return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); };

let tasks = JSON.parse(localStorage.getItem(LS_TASKS) || '[]');
let fired = JSON.parse(localStorage.getItem(LS_FIRED) || '{}'); // key: date|taskId|slot
let history = JSON.parse(localStorage.getItem(LS_HIST) || '[]');
let kind = 'window';
let selectedDay = todayKey();
let snoozedUntil = {}; // taskId -> timestamp

const save = () => {
  localStorage.setItem(LS_TASKS, JSON.stringify(tasks));
  localStorage.setItem(LS_FIRED, JSON.stringify(fired));
  localStorage.setItem(LS_HIST, JSON.stringify(history.slice(0, 100)));
};

function dayTasks(dateKey) {
  return tasks.filter(t => {
    if (t.doneDate && t.doneDate !== dateKey && !t.repeat) return false;
    if (t.kind === 'once') return t.onceDate === dateKey;
    return t.repeat || (t.createdDate || todayKey()) === dateKey;
  });
}

function slotsFor(task, dateKey) {
  if (task.kind === 'once') return [minutesOf(task.onceTime)];
  const start = minutesOf(task.start), endRaw = minutesOf(task.end);
  const end = endRaw <= start ? endRaw + 1440 : endRaw;
  const out = [];
  for (let m = start; m <= end; m += task.interval) out.push(m % 1440);
  return out;
}

function render() {
  // تاریخ امروز
  $('todayDate').textContent = new Date().toLocaleDateString('fa-IR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const list = dayTasks(selectedDay);
  const q = ($('search').value || '').trim();
  const cat = $('filterCat').value;
  let shown = list.filter(t => (!q || t.title.includes(q)) && (!cat || t.category === cat));
  if ($('sortBy').value === 'priority') {
    const w = { 'بالا': 0, 'متوسط': 1, 'کم': 2 };
    shown.sort((a, b) => w[a.priority] - w[b.priority]);
  } else if ($('sortBy').value === 'title') shown.sort((a, b) => a.title.localeCompare(b.title, 'fa'));
  else shown.sort((a, b) => (a.kind === 'once' ? minutesOf(a.onceTime) : minutesOf(a.start)) - (b.kind === 'once' ? minutesOf(b.onceTime) : minutesOf(b.start)));

  const done = list.filter(t => t.done).length;
  $('taskCount').textContent = faNum(list.length);
  $('statDone').textContent = faNum(done);
  $('statLeft').textContent = faNum(list.length - done);
  $('statStreak').textContent = faNum(streakDays());
  const pct = list.length ? Math.round(done / list.length * 100) : 0;
  $('ringText').textContent = faNum(pct) + '٪';
  $('ringFg').style.strokeDasharray = (pct * 3.267) + ' 326.7';
  $('heroSub').textContent = list.length === 0 ? 'روزت را با یک کار کوچک شروع کن.'
    : done === list.length ? '🎉 همهٔ کارهای امروز انجام شد!' : `${faNum(list.length - done)} کار مانده تا روزت کامل شود.`;
  $('emptyMsg').style.display = shown.length ? 'none' : 'block';

  const ul = $('taskList');
  ul.innerHTML = '';
  shown.forEach(t => {
    const li = document.createElement('li');
    li.className = 'task' + (t.done ? ' done' : '');
    const meta = t.kind === 'once'
      ? `<span class="chip once">⏰ فقط یک‌بار ${t.onceDate === todayKey() ? 'امروز' : 'فردا'} ساعت ${faNum(t.onceTime)}</span>`
      : `<span class="chip">${faNum(t.start)} تا ${faNum(t.end)} · هر ${faNum(t.interval)} دقیقه</span>`;
    li.innerHTML = `
      <input type="checkbox" ${t.done ? 'checked' : ''} aria-label="انجام شد">
      <div class="t-body">
        <div class="t-title">${escapeHtml(t.title)}</div>
        <div class="t-meta">${meta}
          <span class="chip">${escapeHtml(t.category)}</span>
          <span class="chip">${t.priority === 'بالا' ? '🔴' : t.priority === 'متوسط' ? '🟡' : '🟢'} ${t.priority}</span>
          ${t.repeat ? '<span class="chip repeat">🔁 روزانه</span>' : ''}
        </div>
      </div>
      <div class="t-actions">
        <button title="تکرار روزانه" data-act="repeat">${t.repeat ? '🔁' : '➰'}</button>
        <button title="تکثیر" data-act="dup">📋</button>
        <button title="به فردا" data-act="tomorrow">➡️</button>
        <button title="حذف" data-act="del">🗑️</button>
      </div>`;
    li.querySelector('input').addEventListener('change', e => { t.done = e.target.checked; t.doneDate = t.done ? selectedDay : null; save(); render(); });
    li.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      const act = b.dataset.act;
      if (act === 'del') { if (confirm('این کار حذف شود؟')) { tasks = tasks.filter(x => x.id !== t.id); save(); render(); } }
      if (act === 'repeat') { t.repeat = !t.repeat; save(); render(); }
      if (act === 'dup') { tasks.push({ ...t, id: uid(), done: false, doneDate: null, createdDate: todayKey() }); save(); render(); }
      if (act === 'tomorrow') { t.kind = 'once'; t.onceDate = addDays(todayKey(), 1); t.onceTime = t.onceTime || t.start || '09:00'; t.repeat = false; save(); render(); }
    }));
    ul.appendChild(li);
  });

  renderWeek();
  renderHistory();
  updateNext();
}

function renderWeek() {
  const strip = $('weekStrip'); strip.innerHTML = '';
  const names = ['یک', 'دو', 'سه', 'چهار', 'پنج', 'جمعه', 'شنبه'];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const n = dayTasks(key).length;
    const b = document.createElement('button');
    b.className = key === selectedDay ? 'active' : '';
    b.innerHTML = `<span>${i === 0 ? 'امروز' : names[d.getDay()]}</span><b>${faNum(d.getDate())}</b><span>${faNum(n)} کار</span>`;
    b.addEventListener('click', () => { selectedDay = key; render(); });
    strip.appendChild(b);
  }
}

function renderHistory() {
  const ul = $('historyList'); ul.innerHTML = '';
  history.slice(0, 12).forEach(h => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(h.title)}</span><span class="${h.status === 'missed' ? 'missed' : 'seen'}">${h.status === 'missed' ? 'از دست رفت' : 'دیده شد'} · ${faNum(h.time)}</span>`;
    ul.appendChild(li);
  });
  if (!history.length) ul.innerHTML = '<li><span>هنوز یادآوری‌ای ثبت نشده است.</span></li>';
}

function streakDays() {
  const s = JSON.parse(localStorage.getItem(LS_STREAK) || '{"days":[]}');
  return s.days.length;
}

function updateNext() {
  const now = new Date(); const nowMin = now.getHours() * 60 + now.getMinutes();
  let best = null;
  dayTasks(todayKey()).filter(t => !t.done).forEach(t => {
    slotsFor(t, todayKey()).forEach(m => {
      if (m >= nowMin && (!best || m < best.min)) best = { min: m, task: t };
    });
  });
  if (!best) { $('nextReminder').textContent = 'کاری برای یادآوری نیست'; $('nextCountdown').textContent = ''; return; }
  $('nextReminder').textContent = `${best.task.title} — ساعت ${faNum(hm(best.min))}`;
  const diff = best.min - nowMin;
  $('nextCountdown').textContent = diff === 0 ? 'الان!' : `تا ${faNum(diff)} دقیقه دیگر`;
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function addDays(key, n) { const d = new Date(key + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ——— افزودن کار ———
document.querySelectorAll('.seg-btn').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.seg-btn').forEach(x => x.classList.remove('active'));
  b.classList.add('active'); kind = b.dataset.kind;
  $('windowFields').classList.toggle('hidden', kind !== 'window');
  $('onceFields').classList.toggle('hidden', kind !== 'once');
}));

$('taskForm').addEventListener('submit', e => {
  e.preventDefault();
  const title = $('fTitle').value.trim();
  if (!title) return;
  const t = {
    id: uid(), title, category: $('fCategory').value, priority: $('fPriority').value,
    kind, repeat: $('fRepeat').checked, done: false, doneDate: null, createdDate: todayKey()
  };
  if (kind === 'once') { t.onceDate = addDays(todayKey(), Number($('fOnceDay').value)); t.onceTime = $('fOnceTime').value; }
  else { t.start = $('fStart').value; t.end = $('fEnd').value; t.interval = Number($('fInterval').value); }
  tasks.push(t); save(); render();
  $('formMsg').textContent = '✅ «' + title + '» اضافه شد.';
  e.target.reset(); $('fStart').value = '14:00'; $('fEnd').value = '00:00'; $('fOnceTime').value = '15:00';
  setTimeout(() => $('formMsg').textContent = '', 3000);
});

['search', 'filterCat', 'sortBy'].forEach(id => $(id).addEventListener('input', render));

// ——— دستیار هوشمند (قانونی، بدون اینترنت) ———
function parsePersian(text) {
  const t = text.replace(/ي/g, 'ی').replace(/ك/g, 'ک');
  const out = { title: null, kind: 'window', start: '14:00', end: '00:00', interval: 30, onceTime: '15:00', onceDay: 0, repeat: false };
  const timeMatch = t.match(/ساعت\s*([۰-۹0-9]{1,2})(?::([۰-۹0-9]{1,2}))?/);
  const toEn = s => s.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  if (t.includes('فقط امروز') || t.includes('فقط یک بار') || t.includes('فقط یک‌بار') || t.includes('فقط امروز ساعت')) out.kind = 'once';
  if (t.includes('هر روز') || t.includes('روزانه')) out.repeat = true;
  const iv = t.match(/هر\s*([۰-۹0-9]+)\s*(دقیقه|ساعت)/);
  if (iv) out.interval = iv[2] === 'ساعت' ? Number(toEn(iv[1])) * 60 : Number(toEn(iv[1]));
  const range = t.match(/از\s*([۰-۹0-9]{1,2})\s*تا\s*([۰-۹0-9]{1,2})/);
  if (range) { out.start = String(Number(toEn(range[1]))).padStart(2, '0') + ':00'; out.end = String(Number(toEn(range[2]))).padStart(2, '0') + ':00'; }
  if (timeMatch) {
    const h = String(Number(toEn(timeMatch[1]))).padStart(2, '0');
    const m = timeMatch[2] ? String(Number(toEn(timeMatch[2]))).padStart(2, '0') : '00';
    out.onceTime = h + ':' + m;
    if (t.includes('فردا')) out.onceDay = 1;
  }
  let title = t.replace(/یادم بنداز|یادآوری کن|یادآوری|ثبت کن|اضافه کن|فقط امروز|فردا|هر روز|روزانه|ساعت\s*[۰-۹0-9:]+|از\s*[۰-۹0-9]+\s*تا\s*[۰-۹0-9]+|هر\s*[۰-۹0-9]+\s*(دقیقه|ساعت)|فقط یک ?بار|فقط یک‌بار/g, '').trim();
  title = title.replace(/^را\s*/, '').replace(/\s+/g, ' ').trim();
  out.title = title || null;
  return out;
}

function chatReply(text) {
  const p = parsePersian(text);
  const log = $('chatLog');
  const me = document.createElement('div'); me.className = 'msg me'; me.textContent = text; log.appendChild(me);
  const ai = document.createElement('div'); ai.className = 'msg ai';
  if (!p.title) {
    ai.textContent = 'می‌خواهی چه کاری را یادآوری کنم؟ نام کار و زمانش را بگو؛ مثلاً «فقط امروز ساعت سه قرصم را بخورم».';
  } else {
    const desc = p.kind === 'once'
      ? `فقط ${p.onceDay ? 'فردا' : 'امروز'} ساعت ${faNum(p.onceTime)}`
      : `از ${faNum(p.start)} تا ${faNum(p.end)} هر ${faNum(p.interval)} دقیقه${p.repeat ? '، تکرار روزانه' : ''}`;
    ai.textContent = `می‌سازمش: «${p.title}» — ${desc}. اگر درست است، دکمهٔ زیر را بزن.`;
    const box = $('draftBox'); box.classList.remove('hidden');
    box.innerHTML = `<b>پیش‌نویس:</b> ${escapeHtml(p.title)} — ${desc}<br><button class="btn-primary" id="draftAdd">بررسی و افزودن</button>`;
    box.querySelector('#draftAdd').addEventListener('click', () => {
      const t = { id: uid(), title: p.title, category: 'دیگر', priority: 'متوسط', kind: p.kind, repeat: p.repeat, done: false, doneDate: null, createdDate: todayKey() };
      if (p.kind === 'once') { t.onceDate = addDays(todayKey(), p.onceDay); t.onceTime = p.onceTime; }
      else { t.start = p.start; t.end = p.end; t.interval = p.interval; }
      tasks.push(t); save(); render(); box.classList.add('hidden');
      const ok = document.createElement('div'); ok.className = 'msg ai'; ok.textContent = '✅ اضافه شد!'; log.appendChild(ok);
    });
  }
  log.appendChild(ai); log.scrollTop = log.scrollHeight;
}

$('chatForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('chatInput').value.trim(); if (!v) return;
  $('chatInput').value = '';
  chatReply(v);
});

// ——— موتور یادآوری ———
let audioCtx = null;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach(d => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.frequency.value = 880; g.gain.setValueAtTime(0.15, audioCtx.currentTime + d);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + d + 0.2);
      o.start(audioCtx.currentTime + d); o.stop(audioCtx.currentTime + d + 0.22);
    });
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  } catch (_) {}
}

let currentAlarm = null;
function fireAlarm(task, slotMin) {
  currentAlarm = { task, slotMin };
  $('alarmTitle').textContent = task.title;
  $('alarmTime').textContent = 'ساعت ' + faNum(hm(slotMin));
  $('alarmOverlay').classList.remove('hidden');
  beep();
  history.unshift({ title: task.title, time: hm(slotMin), status: 'seen' });
  save(); renderHistory();
}

function closeAlarm() { $('alarmOverlay').classList.add('hidden'); currentAlarm = null; }
$('alarmDone').addEventListener('click', () => {
  if (currentAlarm) { currentAlarm.task.done = true; currentAlarm.task.doneDate = todayKey(); save(); render(); }
  closeAlarm();
});
$('alarmSnooze').addEventListener('click', () => {
  if (currentAlarm) snoozedUntil[currentAlarm.task.id] = Date.now() + 10 * 60 * 1000;
  closeAlarm();
});
$('alarmSkip').addEventListener('click', closeAlarm);

function checkReminders() {
  const now = new Date(); const nowMin = now.getHours() * 60 + now.getMinutes();
  const key = todayKey();
  dayTasks(key).filter(t => !t.done).forEach(t => {
    if (snoozedUntil[t.id] && Date.now() < snoozedUntil[t.id]) return;
    if (snoozedUntil[t.id] && Date.now() >= snoozedUntil[t.id]) { delete snoozedUntil[t.id]; }
    slotsFor(t, key).forEach(m => {
      const fk = key + '|' + t.id + '|' + m;
      if (m === nowMin && !fired[fk]) { fired[fk] = 1; save(); fireAlarm(t, m); }
      if (m < nowMin && !fired[fk]) {
        fired[fk] = 1;
        history.unshift({ title: t.title, time: hm(m), status: 'missed' });
        save();
      }
    });
  });
  updateNext();
}

setInterval(checkReminders, 15000);
render();
checkReminders();
