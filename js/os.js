import { t } from './i18n.js';
import { sfx } from './audio.js';

const $ = (s) => document.querySelector(s);
const osEl = $('#os');
let onClose = () => {};
const SYLL = {
  Prelims: ['History', 'Geography', 'Polity', 'Economy', 'Environment', 'Science & Tech', 'Current Affairs', 'CSAT'],
  Mains: ['GS-1', 'GS-2', 'GS-3', 'GS-4 Ethics', 'Essay', 'Optional Paper I', 'Optional Paper II']
};

export function initOS(closeCb) {
  onClose = closeCb;
  $('#osClose').onclick = () => { closeOS(); };
  document.querySelectorAll('.os-dock button').forEach(b => b.onclick = () => { showApp(b.dataset.app); sfx('click'); });
  osEl.addEventListener('keydown', () => sfx('key'));
  setInterval(tick, 1000); tick();
  buildChrome(); buildNotes(); buildSyll();
  window.addEventListener('langchange', () => { renderHome(); renderSyllCount(); });
}
function tick() {
  const d = new Date();
  $('#osClock').textContent = d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
export const isOpen = () => osEl.classList.contains('open');
export function openOS(app = 'chrome') {
  osEl.classList.add('open'); osEl.setAttribute('aria-hidden', 'false');
  showApp(app);
  if (app === 'chrome') setTimeout(() => $('#q').focus({ preventScroll: true }), 900);
}
export function closeOS() {
  if (!isOpen()) return;
  osEl.classList.remove('open'); osEl.setAttribute('aria-hidden', 'true');
  onClose();
}
export function showApp(name) {
  document.querySelectorAll('.app').forEach(a => a.classList.toggle('show', a.id === 'app-' + name));
  document.querySelectorAll('.os-dock button').forEach(b => b.classList.toggle('active', b.dataset.app === name));
}

// ---------- Chrome (search powered by the Wikipedia API) ----------
const view = () => $('#qView');
const CHIPS = ['Indian Constitution', 'Kesavananda Bharati case', 'Monsoon', 'Repo rate', 'Western Ghats', 'Quit India Movement', 'Article 370', 'Sustainable Development Goals'];
function renderHome() {
  const v = view(); if (!v) return;
  v.innerHTML = '';
  const h = el('div', 'home');
  h.append(el('div', 'logo', 'Aspirant Search'), el('p', '', t('os_home_p')));
  const chips = el('div', 'chips');
  CHIPS.forEach(c => { const b = el('button', 'chip', c); b.onclick = () => { $('#q').value = c; search(c); }; chips.append(b); });
  h.append(chips);
  v.append(h);
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
function strip(s) { return String(s).replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'"); }
function extLinks(q) {
  const box = el('div', 'ext');
  [['Google ↗', 'https://www.google.com/search?q='], ['The Hindu ↗', 'https://www.thehindu.com/search/?q='], ['PIB ↗', 'https://pib.gov.in/']].forEach(([n, u]) => {
    const a = el('a', '', n); a.href = u + (u.endsWith('=') ? encodeURIComponent(q) : ''); a.target = '_blank'; a.rel = 'noopener noreferrer'; box.append(a);
  });
  return box;
}
function buildChrome() {
  $('#qForm').onsubmit = (e) => { e.preventDefault(); const q = $('#q').value.trim(); if (q) search(q); };
  $('#qHome').onclick = () => { $('#q').value = ''; renderHome(); };
  renderHome();
}
async function search(q) {
  sfx('click');
  const v = view(); v.innerHTML = '';
  if (/^(https?:\/\/|www\.)\S+$/i.test(q)) {
    const url = q.startsWith('http') ? q : 'https://' + q;
    v.append(el('p', '', url)); const a = el('a', 'btn2', 'Open ↗'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; v.append(a); return;
  }
  v.append(extLinks(q), el('p', '', t('os_loading')));
  try {
    const r = await fetch('https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=10&format=json&origin=*&srsearch=' + encodeURIComponent(q));
    const j = await r.json();
    const list = (j.query && j.query.search) || [];
    v.innerHTML = ''; v.append(extLinks(q));
    if (!list.length) { v.append(el('p', '', t('os_none'))); return; }
    list.forEach(it => {
      const row = el('div', 'res'); row.append(el('b', '', it.title), el('div', '', strip(it.snippet) + '…'));
      row.onclick = () => openArticle(it.title, q);
      v.append(row);
    });
  } catch (err) {
    v.innerHTML = ''; v.append(extLinks(q), el('p', '', 'Offline? ' + err.message));
  }
}
async function openArticle(title, q) {
  sfx('click');
  const v = view(); v.innerHTML = '';
  const back = el('button', 'btn2', t('os_back')); back.onclick = () => search(q);
  v.append(back, el('h2', '', title), el('p', '', t('os_loading')));
  try {
    const r = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title));
    const j = await r.json();
    v.innerHTML = ''; v.append(back, el('h2', '', title));
    const s = el('div', 'sum');
    if (j.thumbnail && j.thumbnail.source) { const im = document.createElement('img'); im.src = j.thumbnail.source; im.alt = title; s.append(im); }
    const d = el('div'); d.append(el('p', '', j.extract || ''));
    const a = el('a', 'btn2', t('os_read')); a.href = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_')); a.target = '_blank'; a.rel = 'noopener noreferrer';
    d.append(a); s.append(d); v.append(s);
  } catch (err) { v.append(el('p', '', 'Offline? ' + err.message)); }
}

// ---------- Notes ----------
function buildNotes() {
  const ta = $('#notesTa');
  try { ta.value = localStorage.getItem('notes') || ''; } catch (e) {}
  ta.oninput = () => { try { localStorage.setItem('notes', ta.value); } catch (e) {} };
}

// ---------- Syllabus ----------
let done = {};
function buildSyll() {
  try { done = JSON.parse(localStorage.getItem('syll') || '{}'); } catch (e) { done = {}; }
  const box = $('#syllList'); box.innerHTML = '';
  Object.entries(SYLL).forEach(([g, items]) => {
    box.append(el('h4', '', g));
    items.forEach(n => {
      const lab = document.createElement('label'), cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = !!done[g + n];
      cb.onchange = () => { done[g + n] = cb.checked; try { localStorage.setItem('syll', JSON.stringify(done)); } catch (e) {} renderSyllCount(); sfx(cb.checked ? 'ding' : 'click'); };
      lab.append(cb, el('span', '', n)); box.append(lab);
    });
  });
  renderSyllCount();
}
function renderSyllCount() {
  const total = Object.values(SYLL).flat().length;
  const n = Object.values(done).filter(Boolean).length;
  $('#progBar').style.width = (n / total * 100) + '%';
  $('#progT').textContent = `${n} / ${total} ${t('os_prog')}`;
}
