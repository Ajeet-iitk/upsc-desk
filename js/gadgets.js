// Smartphone UI (lock screen, calculator, quiz, music) and the evergreen newspaper.
import * as A from './audio.js';
const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const fire = (n) => window.dispatchEvent(new CustomEvent(n));

const QUIZ = [
  ['Who chaired the Drafting Committee of the Constituent Assembly?', ['Jawaharlal Nehru', 'B. R. Ambedkar', 'Sardar Patel', 'Rajendra Prasad'], 1],
  ['Article 21 of the Constitution protects…', ['Freedom of speech', 'Right to property', 'Life and personal liberty', 'Right to education only'], 2],
  ['The Quit India Movement was launched in…', ['1930', '1942', '1919', '1947'], 1],
  ['Who sets the repo rate in India?', ['Finance Ministry', 'SEBI', 'RBI', 'NITI Aayog'], 2],
  ['The Battle of Plassey was fought in…', ['1757', '1764', '1857', '1707'], 0],
  ['Maximum strength of the Rajya Sabha is…', ['245', '250', '238', '552'], 1],
  ['Which is the largest Indian state by area?', ['Madhya Pradesh', 'Maharashtra', 'Rajasthan', 'Uttar Pradesh'], 2],
  ['Fundamental Duties were added by the…', ['42nd Amendment', '44th Amendment', '1st Amendment', '73rd Amendment'], 0],
  ['The longest peninsular river of India is…', ['Krishna', 'Godavari', 'Kaveri', 'Narmada'], 1],
  ['The first President of India was…', ['S. Radhakrishnan', 'Zakir Husain', 'Rajendra Prasad', 'V. V. Giri'], 2],
  ['Article 32 is called the "heart and soul" of the Constitution because it gives…', ['Right to vote', 'Right to Constitutional Remedies', 'Right to equality', 'Right to work'], 1],
  ['The Kesavananda Bharati case (1973) gave us the…', ['Right to privacy', 'Basic structure doctrine', 'Mandal reservation', 'Anti-defection law'], 1]
];
const TERMS = [
  ['Cooperative federalism', 'Centre and states work together as partners on shared goals, instead of competing for power.'],
  ['Judicial review', 'The power of courts to examine laws and executive actions and strike down those that violate the Constitution.'],
  ['Basic structure', 'Core features of the Constitution that Parliament cannot amend away (Kesavananda Bharati, 1973).'],
  ['Fiscal deficit', 'Total expenditure minus total receipts excluding borrowings: how much the government must borrow in a year.'],
  ['Demographic dividend', 'Growth potential when the working-age population is larger than the dependent population.'],
  ['Ombudsman', 'An independent officer who investigates citizens\' complaints against public authorities (Lokpal / Lokayukta in India).'],
  ['Carbon sink', 'A natural or artificial reservoir, such as forests and oceans, that absorbs more carbon than it releases.'],
  ['Biodiversity hotspot', 'A region with exceptional species richness that is also under serious threat. India has four of them.'],
  ['Doctrine of pith and substance', 'Courts look at the true nature of a law to decide which list (Union, State) it falls under.'],
  ['Social capital', 'Networks, trust and shared norms that help communities act together.'],
  ['Gig economy', 'Short-term, flexible, platform-based work, such as delivery and ride-hailing.'],
  ['Subsidiarity', 'Decisions should be taken at the lowest level capable of handling them effectively.'],
  ['Directive Principles', 'Guidelines in Part IV for the State to build a welfare society. They are non-justiciable but fundamental in governance.']
];
const PROMPTS = [
  'Discuss the role of the Governor in Centre–State relations. (150 words)',
  '"Ethics is the compass of public service." Elaborate. (150 words)',
  'Examine the challenges of urban flooding and suggest a way forward. (150 words)',
  'How does the monsoon shape the Indian economy? (150 words)',
  'Why is the basic structure doctrine important for democracy? (150 words)',
  'Critically analyse the impact of social media on public opinion. (150 words)',
  'Explain the significance of the Western Ghats for India\'s ecology. (150 words)',
  'What is the role of civil servants in disaster management? (150 words)',
  'Women\'s participation in the workforce: barriers and solutions. (150 words)'
];

/* ---------------- phone ---------------- */
const views = ['lock', 'home', 'calc', 'quiz', 'music'];
function show(v) { views.forEach(n => $('#ph-' + n).classList.toggle('show', n === v)); $('#phBar').classList.toggle('on', v !== 'lock'); }
function clockTick() {
  const d = new Date();
  $('#phTime').textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  $('#phDate').textContent = d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}
export function resetPhone() { show('lock'); clockTick(); }

function buildHome() {
  const apps = [['🧮', 'Calculator', () => show('calc')], ['🎯', 'Quiz', () => { startQuiz(); show('quiz'); }], ['🎧', 'Music', () => { syncMusic(); show('music'); }],
    ['📰', 'Newspaper', () => fire('desk:news')], ['⏱️', 'Timer', () => fire('desk:pomo')], ['💡', 'Lamp', () => fire('desk:lamp')], ['💻', 'Laptop', () => fire('desk:laptop')], ['🪟', 'Window', () => fire('desk:window')]];
  const g = $('#phApps'); g.innerHTML = '';
  apps.forEach(([ic, name, fn]) => { const b = el('button', 'ph-app'); b.append(el('i', '', ic), el('span', '', name)); b.onclick = () => { A.sfx('click'); fn(); }; g.append(b); });
}
// calculator
function buildCalc() {
  let expr = ''; const out = $('#calcOut'), hist = $('#calcExpr');
  const keys = ['C', '⌫', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', '(', ')', '='];
  const g = $('#calcKeys'); g.innerHTML = '';
  const render = () => { out.textContent = expr || '0'; };
  const evalExpr = () => {
    const s = expr.replace(/÷/g, '/').replace(/×/g, '*').replace(/−/g, '-').replace(/%/g, '/100');
    if (!/^[0-9+\-*/().\s]+$/.test(s)) return null;
    try { const r = Function('"use strict";return (' + s + ')')(); return Number.isFinite(r) ? String(Math.round(r * 1e10) / 1e10) : null; } catch (e) { return null; }
  };
  keys.forEach(k => {
    const b = el('button', 'ck' + (/[÷×−+=]/.test(k) ? ' op' : k === 'C' || k === '⌫' ? ' fn' : '') + (k === '=' ? ' eq' : ''), k);
    b.onclick = () => {
      A.sfx('key');
      if (k === 'C') { expr = ''; hist.textContent = ''; } else if (k === '⌫') expr = expr.slice(0, -1);
      else if (k === '=') { const r = evalExpr(); hist.textContent = expr + ' ='; expr = r == null ? 'Error' : r; if (expr === 'Error') setTimeout(() => { expr = ''; render(); }, 900); }
      else { if (expr === 'Error') expr = ''; expr += k; }
      render();
    };
    g.append(b);
  });
  render();
}
// quiz
let qi = 0, score = 0, order = [];
function startQuiz() { order = QUIZ.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, 8); qi = 0; score = 0; renderQ(); }
function renderQ() {
  const box = $('#quizBox'); box.innerHTML = '';
  if (qi >= order.length) {
    box.append(el('div', 'qz-end', `${score} / ${order.length}`), el('p', 'qz-msg', score >= 6 ? 'Excellent! Prelims-ready 🔥' : score >= 4 ? 'Good going. Revise a little more 📚' : 'Keep practising. You will get there 💪'));
    const b = el('button', 'qz-opt', 'Play again'); b.onclick = startQuiz; box.append(b); return;
  }
  const [q, opts, ans] = QUIZ[order[qi]];
  box.append(el('div', 'qz-n', `Question ${qi + 1} of ${order.length} · Score ${score}`), el('div', 'qz-q', q));
  opts.forEach((o, i) => {
    const b = el('button', 'qz-opt', o);
    b.onclick = () => {
      box.querySelectorAll('.qz-opt').forEach(x => { x.disabled = true; });
      const right = i === ans; if (right) score++;
      b.classList.add(right ? 'ok' : 'bad'); box.querySelectorAll('.qz-opt')[ans].classList.add('ok');
      A.sfx(right ? 'ding' : 'wood', 0.6); setTimeout(() => { qi++; renderQ(); }, 1100);
    };
    box.append(b);
  });
}
// music app
function syncMusic() {
  $('#pmPlay').textContent = A.isMusic() ? '❚❚ Pause lo-fi' : '▶ Play lo-fi'; $('#pmPlay').classList.toggle('on', A.isMusic());
  $('#pmRain').textContent = A.isRain() ? '🌧 Rain: on' : '🌧 Rain: off'; $('#pmRain').classList.toggle('on', A.isRain());
  $('#phDisc').classList.toggle('spin', A.isMusic());
}
export function initGadgets() {
  buildHome(); buildCalc(); startQuiz(); clockTick(); setInterval(clockTick, 10000);
  $('#ph-lock').onclick = () => { A.sfx('click'); show('home'); };
  $('#phBar').onclick = () => { A.sfx('click'); show('home'); };
  $('#pmPlay').onclick = () => { A.init(); A.setMusic(!A.isMusic()); syncMusic(); fire('audiochange'); };
  $('#pmRain').onclick = () => { A.init(); A.setRain(!A.isRain()); syncMusic(); fire('audiochange'); };
  window.addEventListener('audiochange', syncMusic);
  resetPhone();
}

/* ---------------- newspaper ---------------- */
export function buildNews() {
  const d = new Date(), doy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
  const [term, def] = TERMS[doy % TERMS.length];
  const b = $('#newsBody'); b.innerHTML = '';
  b.append(el('div', 'np-date', d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' · Practice edition'),
    el('h2', 'np-mast', 'The Daily Aspirant'), el('div', 'np-rule'));
  const cols = el('div', 'np-cols');
  const s1 = el('section'); s1.append(el('h3', '', 'Term of the day'), el('h4', '', term), el('p', '', def));
  const s2 = el('section'); s2.append(el('h3', '', 'Editorial practice'));
  [0, 1, 2].forEach(i => s2.append(el('p', 'np-q', '✎ ' + PROMPTS[(doy + i * 3) % PROMPTS.length])));
  const s3 = el('section'); s3.append(el('h3', '', 'Fact file'),
    el('p', '', 'India has 28 states and 8 Union Territories.'), el('p', '', 'The Constitution came into force on 26 January 1950.'), el('p', '', 'Article 1: "India, that is Bharat, shall be a Union of States."'));
  const s4 = el('section'); s4.append(el('h3', '', 'Read today\'s real news'), el('p', '', 'This page is evergreen practice material. For live headlines:'));
  [['The Hindu', 'https://www.thehindu.com/'], ['Indian Express', 'https://indianexpress.com/'], ['PIB', 'https://pib.gov.in/'], ['PRS India', 'https://prsindia.org/']].forEach(([n, u]) => {
    const a = el('a', '', n + ' ↗'); a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer'; s4.append(a);
  });
  cols.append(s1, s2, s3, s4); b.append(cols);
}
