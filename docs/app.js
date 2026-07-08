/**
 * Dolj admission dashboard — client logic.
 *
 * Data flow: /api/data supplies the scraped hierarchy rows; everything else
 * (leakage, effective position, per-code chances) is computed here so the
 * assumption sliders recompute instantly without a round-trip.
 */

'use strict';

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

const FALLBACK = { code: 'DJ9445089', position: 1182, media: 8.4 };
// 9th-grade seats at the 5 target schools, from the official ISJ brochure
// 2026-2027 (page 12): 224 + 252 + 252 + 140 + 112.
const BLOCK_SEATS = 980;

/** Share of each locality bucket assumed NOT to compete for Craiova seats. */
const LEAK_RATES = {
  CRAIOVA: 0.0,
  CRAIOVA_VOCATIONAL: 0.8,
  NEAR_CRAIOVA: 0.05,
  FAR_TOWN: 0.7,
  FAR_RURAL: 0.45,
};

const BUCKET_META = {
  CRAIOVA: { label: 'Craiova', color: '#2a78d6' },
  NEAR_CRAIOVA: { label: 'lângă Craiova', color: '#1baf7a' },
  FAR_TOWN: { label: 'oraș cu licee proprii', color: '#eda100' },
  FAR_RURAL: { label: 'rural îndepărtat', color: '#eb6834' },
  CRAIOVA_VOCATIONAL: { label: 'vocațional Craiova', color: '#4a3aa7' },
};

const TRACK_LABELS = {
  PEDAGOGIC: 'Învățători / pedagogic (gimnaziul Velovan)',
  SPORT: 'Sport (LPS „Petrache Trișcu”)',
  ARTA: 'Artă (Liceul „Marin Sorescu”)',
  TEOLOGIC: 'Teologic',
};

/**
 * Target schools and codes — seats and last-admitted medias (2024/2025) taken
 * verbatim from the official ISJ Dolj brochure 2026-2027, page 12
 * (brosura-2026-2027.pdf). profil: 'uman' | 'real'.
 */
const SCHOOLS = [
  {
    id: 'cuza', name: 'CN „Elena Cuza”', priority: true, seats: 252,
    codes: [
      { code: '114', label: 'Filologie', profil: 'uman', seats: 28, cutoffs: { 2025: 9.02, 2024: 8.9 } },
      { code: '115', label: 'Filologie bilingv engleză', profil: 'uman', seats: 28, cutoffs: { 2025: 9.17, 2024: 9.05 } },
      { code: '117', label: 'Filologie bilingv spaniolă', profil: 'uman', seats: 28, cutoffs: { 2025: 8.9, 2024: 8.52 } },
      { code: '116', label: 'Filologie bilingv franceză', profil: 'uman', seats: 28, cutoffs: { 2025: 8.8, 2024: 8.45 } },
      { code: '110', label: 'Mate-info (+ intensiv informatică)', profil: 'real', seats: 56, cutoffs: { 2025: 9.02, 2024: 8.85 } },
      { code: '113', label: 'Științe nat. bilingv germană', profil: 'real', seats: 28, cutoffs: { 2025: 9.12, 2024: 8.72 } },
      { code: '111', label: 'Științe ale naturii', profil: 'real', seats: 28, cutoffs: { 2025: 9.42, 2024: 9.1 } },
      { code: '112', label: 'Științe nat. bilingv engleză', profil: 'real', seats: 28, cutoffs: { 2025: 9.52 } },
    ],
  },
  {
    id: 'buzesti', name: 'CN „Frații Buzești”', seats: 224,
    codes: [
      { code: '123', label: 'Filologie bilingv engleză', profil: 'uman', seats: 28, cutoffs: { 2025: 8.97, 2024: 8.8 } },
      { code: '124', label: 'Științe sociale', profil: 'uman', seats: 28, cutoffs: { 2025: 9.0, 2024: 8.6 } },
      { code: '118', label: 'Mate-info (+ intensiv informatică)', profil: 'real', seats: 84, cutoffs: { 2025: 9.17, 2024: 8.92 } },
      { code: '119', label: 'Mate-info bilingv engleză', profil: 'real', seats: 28, cutoffs: { 2025: 9.5, 2024: 9.32 } },
      { code: '120', label: 'Mate-info bilingv franceză', profil: 'real', seats: 14, cutoffs: { 2025: 8.9, 2024: 8.6 } },
      { code: '121', label: 'Mate-info bilingv germană', profil: 'real', seats: 14, cutoffs: { 2025: 8.92, 2024: 8.5 } },
      { code: '122', label: 'Științe ale naturii', profil: 'real', seats: 28, cutoffs: { 2025: 9.75, 2024: 9.67 } },
    ],
  },
  {
    id: 'carol', name: 'CN „Carol I” (Bălcescu)', seats: 252,
    codes: [
      { code: '107', label: 'Filologie bilingv engleză', profil: 'uman', seats: 28, cutoffs: { 2025: 9.0, 2024: 8.82 } },
      { code: '109', label: 'Filologie bilingv spaniolă', profil: 'uman', seats: 14, cutoffs: { 2025: 8.87, 2024: 8.57 } },
      { code: '108', label: 'Filologie bilingv franceză', profil: 'uman', seats: 14, cutoffs: { 2025: 8.8, 2024: 8.5 } },
      { code: '104', label: 'Mate-info', profil: 'real', seats: 112, cutoffs: { 2025: 9.1, 2024: 8.97 } },
      { code: '105', label: 'Mate-info bilingv engleză', profil: 'real', seats: 28, cutoffs: { 2025: 9.1, 2024: 8.9 } },
      { code: '106', label: 'Științe ale naturii', profil: 'real', seats: 56, cutoffs: { 2025: 9.4, 2024: 9.15 } },
    ],
  },
  {
    id: 'velovan', name: 'CN „Ștefan Velovan” (teoretic)', seats: 140,
    codes: [
      { code: '131', label: 'Filologie', profil: 'uman', seats: 28, cutoffs: { 2025: 9.05, 2024: 8.65 } },
      { code: '129', label: 'Mate-info', profil: 'real', seats: 56, cutoffs: { 2025: 9.07, 2024: 8.72 } },
      { code: '130', label: 'Științe ale naturii', profil: 'real', seats: 56, cutoffs: { 2025: 9.07, 2024: 8.72 } },
    ],
  },
  {
    id: 'titulescu', name: 'CN „Nicolae Titulescu”', seats: 112,
    codes: [
      { code: '127', label: 'Filologie', profil: 'uman', seats: 28, cutoffs: { 2025: 8.77, 2024: 8.4 } },
      { code: '128', label: 'Științe sociale', profil: 'uman', seats: 28, cutoffs: { 2025: 8.75, 2024: 8.25 } },
      { code: '126', label: 'Științe nat. intensiv engleză', profil: 'real', seats: 28, cutoffs: { 2025: 8.75, 2024: 8.25 } },
      { code: '125', label: 'Mate-info', profil: 'real', seats: 28, cutoffs: { 2025: 8.8, 2024: 8.37 } },
    ],
  },
];

/**
 * Safety-net schools outside the top-5 block (brochure p. 13). History-only
 * chance model: they sit below the block, so the uman seat ladder above does
 * not constrain them.
 */
const SAFETY_SCHOOLS = [
  {
    id: 'arghezi', name: 'LT „Tudor Arghezi”',
    codes: [
      { code: '167', label: 'Filologie', profil: 'uman', seats: 28, cutoffs: { 2025: 8.6, 2024: 8.15 } },
      { code: '168', label: 'Științe sociale', profil: 'uman', seats: 28, cutoffs: { 2025: 8.5, 2024: 8.02 } },
    ],
  },
  {
    id: 'coanda', name: 'LT „Henri Coandă”',
    codes: [
      { code: '157', label: 'Filologie bilingv engleză', profil: 'uman', seats: 28, cutoffs: { 2025: 8.45, 2024: 8.0 } },
      { code: '156', label: 'Filologie', profil: 'uman', seats: 28, cutoffs: { 2025: 8.3, 2024: 7.82 } },
    ],
  },
  {
    id: 'odobleja', name: 'Colegiul „Ștefan Odobleja”',
    codes: [
      { code: '103', label: 'Filologie', profil: 'uman', seats: 28, cutoffs: { 2025: 8.15, 2024: 7.55 } },
    ],
  },
  {
    id: 'voltaire', name: 'Liceul „Voltaire”',
    codes: [
      { code: '141', label: 'Filologie bilingv franceză', profil: 'uman', seats: 28, cutoffs: { 2025: 7.97, 2024: 7.17 } },
      { code: '142', label: 'Șt. sociale intensiv franceză', profil: 'uman', seats: 28, cutoffs: { 2025: 7.95, 2024: 7.27 } },
    ],
  },
  {
    id: 'vuia', name: 'Liceul „Traian Vuia”',
    codes: [
      { code: '137', label: 'Filologie', profil: 'uman', seats: 56, cutoffs: { 2025: 7.87, 2024: 7.25 } },
      { code: '138', label: 'Științe sociale', profil: 'uman', seats: 28, cutoffs: { 2025: 7.85, 2024: 7.05 } },
    ],
  },
  {
    id: 'laugier', name: 'Liceul „Charles Laugier”',
    codes: [
      { code: '134', label: 'Filologie', profil: 'uman', seats: 28, cutoffs: { 2025: 7.77, 2024: 6.97 } },
    ],
  },
];

/** Code → { schoolName, def } over both the block and the safety net. */
const CODE_INDEX = new Map();
for (const school of [...SCHOOLS, ...SAFETY_SCHOOLS]) {
  for (const codeDef of school.codes) {
    if (codeDef.code) CODE_INDEX.set(codeDef.code, { schoolName: school.name, def: codeDef });
  }
}

/**
 * The recommended option sheet, in strict descending preference. Rows with
 * `optional` are family decisions (profile trade-offs), not strategy.
 */
const SHEET_TIERS = [
  {
    id: 'A', title: 'Nivelul A — Elena Cuza (ținta prioritară)',
    note: 'Bilete de loterie gratuite: algoritmul nu penalizează visurile puse primele. Ordinea 2–4 e preferința de limbă — bilingv înseamnă 4 ani intensivi din limba respectivă.',
    items: [
      { code: '114' },
      { code: '116', note: 'cea mai probabilă ușă Cuza' },
      { code: '117' },
      { code: '115' },
      { code: '110', optional: true, note: 'decizie: doar dacă acceptă real la Cuza' },
      { code: '113', optional: true, note: 'decizie: real + germană intensivă' },
      { code: '111', optional: true, note: 'decizie: doar dacă acceptă real' },
      { code: '112', optional: true, note: 'decizie: doar dacă acceptă real' },
    ],
  },
  {
    id: 'B', title: 'Nivelul B — celelalte colegii de top, uman',
    note: 'Ordinea dintre ele e preferința familiei; șansele reale stau în Carol I bilingv franceză/spaniolă.',
    items: [
      { code: '124' },
      { code: '123' },
      { code: '109' },
      { code: '108' },
      { code: '107' },
      { code: '131' },
      { code: '121', optional: true, note: 'decizie: real la Buzești (germana e trecută) vs. uman la Titulescu' },
    ],
  },
  {
    id: 'C', title: 'Nivelul C — ancora realistă: Titulescu',
    note: 'Aici se joacă cel mai probabil rezultatul dintre liceele țintă. În 2024, filologie (127) a închis exact la media ei, 8.40.',
    items: [
      { code: '127' },
      { code: '128' },
      { code: '126', note: 'real, dar fără probă de limbă — statistic cea mai bună carte din tot blocul' },
      { code: '125', optional: true, note: 'decizie: doar dacă acceptă mate-info' },
    ],
  },
  {
    id: 'D', title: 'Nivelul D — plasa de siguranță (obligatorie)',
    note: 'Atenție: Arghezi filologie a închis în 2025 la 8.60 — PESTE media ei, deci Arghezi nu e siguranță, e monedă aruncată. Siguranța reală începe de la Coandă filologie în jos.',
    items: [
      { code: '167' },
      { code: '168' },
      { code: '157' },
      { code: '156', note: 'primul cod uman practic garantat' },
      { code: '103' },
      { code: '141' },
      { code: '142' },
      { code: '137', note: '56 de locuri' },
      { code: '138' },
      { code: '134', note: 'după el, adăugați 1–2 coduri sub 7.00 ca asigurare totală' },
    ],
  },
];

/** Horizontal cutoff lines drawn on the hero chart. */
const CHART_CUTOFFS = [
  { media: 9.02, label: 'Cuza filologie (114)', cuza: true },
  { media: 8.9, label: 'Cuza bilingv ES (117)', cuza: true },
  { media: 8.8, label: 'Cuza bilingv FR (116)', cuza: true, labelDy: -3 },
  { media: 8.75, label: 'Titulescu (min. școală)', cuza: false, labelDy: 7 },
];

const SLIDER_DEFS = [
  { key: 'pReal', label: 'Dintre cei de deasupra, aleg profil real', min: 40, max: 80, value: 60, suffix: '%',
    hint: 'speranța „cei de la real nu vor uman” — locurile uman din top-5 sunt ~1/3 din total' },
  { key: 'geoFactor', label: 'Încredere în scurgerea geografică', min: 50, max: 150, value: 100, suffix: '%',
    hint: '100% = modelul standard (70% din orașele cu licee, 45% din rural rămân acasă)' },
  { key: 'militar', label: 'Plecări la Colegiul Militar', min: 0, max: 120, value: 70, suffix: '',
    hint: '168 locuri oficiale (broșură p. 16), admitere separată (80% test grilă) — invizibili în date' },
  { key: 'pedagogic', label: 'Plecări la învățători (Velovan)', min: 0, max: 60, value: 40, suffix: '',
    hint: '48 locuri; ultimele medii 2025: 9.40 și 9.22 — aproape toți admișii sunt peste ea; 60 provin din gimnaziul Velovan' },
  { key: 'arta', label: 'Plecări la Liceul de Arte', min: 0, max: 30, value: 8, suffix: '',
    hint: '72 locuri la „Marin Sorescu”; ultimele medii 2025: 7.41–8.11 — puțini peste 8.40' },
  { key: 'sport', label: 'Plecări suplimentare la sport', min: 0, max: 20, value: 6, suffix: '',
    hint: 'volei Titulescu (24 locuri, medie 8.68) și Energetic (8.93) închid peste ea; LPS Trișcu e deja numărat geografic' },
  { key: 'teologic', label: 'Plecări la teologic', min: 0, max: 15, value: 4, suffix: '',
    hint: '48 locuri (Adventist + Seminarul Ortodox); ultimele medii 6-7 — puțini peste ea' },
];

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const state = {
  rows: [],
  byPosition: new Map(),
  updatedAt: null,
  code: FALLBACK.code,
  assumptions: Object.fromEntries(SLIDER_DEFS.map((s) => [s.key, s.value])),
  originSort: { key: 'count', dir: -1 },
  originQuery: '',
};

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child == null) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function fmt(n, digits = 0) {
  return n.toLocaleString('ro-RO', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function normText(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Standard normal CDF (Abramowitz–Stegun approximation). */
function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return p;
}

const logistic = (x) => 1 / (1 + Math.exp(-x));

/** Union of correlated chances: full weight on the best, 55% on the rest. */
function dampedUnion(ps) {
  if (!ps.length) return 0;
  const pMax = Math.max(...ps);
  const pAny = 1 - ps.reduce((acc, p) => acc * (1 - p), 1);
  return Math.min(0.95, pMax + 0.55 * (pAny - pMax));
}

function chanceWord(p) {
  if (p >= 0.6) return 'probabil';
  if (p >= 0.3) return 'șanse reale';
  if (p >= 0.12) return 'loterie';
  return 'improbabil';
}

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

/** Ordered ladder of uman seats in the top-5 block, hardest first. */
function umanLadder() {
  const entries = [];
  for (const school of SCHOOLS) {
    for (const code of school.codes) {
      if (code.profil !== 'uman') continue;
      entries.push({ school: school.name, ...code, cutoff2025: code.cutoffs[2025] ?? 0 });
    }
  }
  entries.sort((a, b) => b.cutoff2025 - a.cutoff2025);
  let cum = 0;
  for (const entry of entries) {
    cum += entry.seats;
    entry.cumSeats = cum;
  }
  return entries;
}
const UMAN_LADDER = umanLadder();
const UMAN_TOTAL_SEATS = UMAN_LADDER.length ? UMAN_LADDER[UMAN_LADDER.length - 1].cumSeats : 0;

function findCandidate() {
  const row = state.rows.find((r) => r.code === state.code);
  if (row) return { ...row, found: true };
  return { ...FALLBACK, code: state.code, school: '—', bucket: 'CRAIOVA', found: false };
}

/** Probability that the code's 2026 cutoff lands at or below the candidate's media. */
function historyChance(codeDef, media) {
  const values = Object.values(codeDef.cutoffs);
  if (!values.length) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  // Year-to-year cutoff swings at these schools are large (0.2–0.5 between
  // 2024 and 2025), so keep wide floors even with multi-year history.
  let sigma;
  if (values.length === 1) sigma = 0.28;
  else {
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
    sigma = Math.max(values.length === 2 ? 0.2 : 0.18, Math.sqrt(variance));
  }
  return normCdf((media - mean) / sigma);
}

function computeModel() {
  const candidate = findCandidate();
  const above = state.rows.filter((r) => r.position < candidate.position);
  const a = state.assumptions;

  const bucketCounts = {};
  for (const row of above) bucketCounts[row.bucket] = (bucketCounts[row.bucket] || 0) + 1;

  let geoLeak = 0;
  for (const [bucket, count] of Object.entries(bucketCounts)) {
    geoLeak += count * (LEAK_RATES[bucket] ?? 0);
  }
  geoLeak *= a.geoFactor / 100;

  const vocLeak = a.militar + a.pedagogic + a.arta + a.sport + a.teologic;
  const totalLeak = Math.round(geoLeak + vocLeak);
  const effPos = candidate.position - totalLeak;

  const umanShare = 1 - a.pReal / 100;
  const umanRank = Math.round(effPos * umanShare);

  const blockChance = logistic((BLOCK_SEATS - effPos) / 45);

  // Per-code probabilities.
  const schools = SCHOOLS.map((school) => {
    const codes = school.codes.map((codeDef) => {
      const pHist = historyChance(codeDef, candidate.media);
      let pFlow = null;
      if (codeDef.profil === 'uman') {
        const ladderEntry = UMAN_LADDER.find((e) => e.label === codeDef.label && e.school === school.name);
        // Wide scale (60 seats): the seat-flow signal carries real model error.
        if (ladderEntry) pFlow = logistic((ladderEntry.cumSeats - umanRank) / 60);
      }
      let p;
      if (pFlow != null && pHist != null) p = (pFlow + pHist) / 2;
      else p = pHist ?? pFlow ?? 0;
      p = Math.min(0.97, Math.max(0.005, p));
      return { ...codeDef, pHist, pFlow, p };
    });
    return { ...school, codes };
  });

  // Elena Cuza overall: independence would overstate (codes correlate),
  // so damp everything beyond the single best door.
  const cuzaCodes = schools.find((s) => s.id === 'cuza').codes;
  const cuzaBest = cuzaCodes.reduce((best, c) => (c.p > best.p ? c : best), cuzaCodes[0]);
  const cuzaChance = dampedUnion(cuzaCodes.map((c) => c.p));

  // Chance per option code: block codes from the full model, safety-net
  // codes history-only (they sit below the block).
  const codeP = new Map();
  for (const school of schools) {
    for (const c of school.codes) if (c.code) codeP.set(c.code, c.p);
  }
  for (const school of SAFETY_SCHOOLS) {
    for (const c of school.codes) {
      const pHist = historyChance(c, candidate.media);
      codeP.set(c.code, Math.min(0.97, Math.max(0.005, pHist ?? 0)));
    }
  }

  return {
    candidate, above, bucketCounts,
    geoLeak: Math.round(geoLeak), vocLeak, totalLeak,
    effPos, umanShare, umanRank, blockChance, schools, cuzaChance, cuzaBest, codeP,
  };
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function renderAll() {
  if (!state.rows.length) {
    $('app').hidden = true;
    $('empty-state').hidden = false;
    $('candidate-summary').textContent = 'nu există date — apasă „Actualizează datele”';
    return;
  }
  $('app').hidden = false;
  $('empty-state').hidden = true;

  const model = computeModel();
  renderCandidateSummary(model);
  renderHero(model);
  renderKpis(model);
  renderLeakBreakdown(model);
  renderChart(model);
  renderThresholdTable(model);
  renderChances(model);
  renderSheet(model);
  renderVocational(model);
  renderBands();
  renderOriginTable(model);
  renderMethodology(model);
}

function renderCandidateSummary(model) {
  const c = model.candidate;
  const target = $('candidate-summary');
  target.textContent = '';
  if (c.found) {
    target.append(
      'poziția ', el('strong', { text: fmt(c.position) }),
      ' · media ', el('strong', { text: c.media.toFixed(2) }),
      ` · ${c.school}`
    );
  } else {
    target.append(el('span', { class: 'warn', text: `codul nu apare în primele ${fmt(state.rows.length)} poziții — folosesc poziția ${FALLBACK.position} / media ${FALLBACK.media.toFixed(2)}` }));
  }
}

function renderHero(model) {
  $('hero-chance').hidden = false;
  $('hero-pct').textContent = Math.round(model.cuzaChance * 100);
  const best = model.cuzaBest;
  $('hero-sub').textContent = `cea mai accesibilă ușă: ${best.label.toLowerCase()}${best.code ? ` (${best.code})` : ''} · ${chanceWord(model.cuzaChance)}`;
}

function renderKpis(model) {
  const tiles = [
    { label: 'Poziția reală în ierarhie', value: fmt(model.candidate.position), detail: `din ${fmt(state.rows.length)} scanate` },
    { label: 'Scurgere estimată deasupra ei', value: `−${fmt(model.totalLeak)}`, detail: `geografic ${fmt(model.geoLeak)} + vocațional/militar ${fmt(model.vocLeak)}` },
    { label: 'Poziția efectivă', value: `~${fmt(model.effPos)}`, detail: `față de ${fmt(BLOCK_SEATS)} locuri în blocul top-5` },
    { label: 'Rangul ei pe profilul uman', value: `~${fmt(model.umanRank)}`, detail: `la ~${fmt(UMAN_TOTAL_SEATS)} locuri uman în top-5` },
    { label: 'Șansa unui loc în top-5', value: `${Math.round(model.blockChance * 100)}%`, detail: chanceWord(model.blockChance) },
  ];
  const row = $('kpi-row');
  row.textContent = '';
  for (const tile of tiles) {
    row.append(el('div', { class: 'stat-tile' },
      el('div', { class: 'label', text: tile.label }),
      el('div', { class: 'value', text: tile.value }),
      el('div', { class: 'detail', text: tile.detail })
    ));
  }
}

function renderLeakBreakdown(model) {
  const parts = Object.entries(model.bucketCounts)
    .filter(([bucket]) => (LEAK_RATES[bucket] ?? 0) > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([bucket, count]) => `${BUCKET_META[bucket]?.label ?? bucket}: ${count} × ${Math.round(LEAK_RATES[bucket] * 100)}%`);
  $('leak-breakdown').textContent =
    `Deasupra poziției ${fmt(model.candidate.position)}: ${fmt(model.above.length)} candidați · scurgere geografică ~${fmt(model.geoLeak)} (${parts.join(' · ')}) · plecări vocațional/militar ~${fmt(model.vocLeak)} → poziție efectivă ~${fmt(model.effPos)}.`;
}

function renderSliders() {
  const wrap = $('sliders');
  wrap.textContent = '';
  for (const def of SLIDER_DEFS) {
    const valueSpan = el('span', { class: 'slider-value', text: `${state.assumptions[def.key]}${def.suffix}` });
    const input = el('input', {
      type: 'range', min: def.min, max: def.max, step: 1, value: state.assumptions[def.key],
      'aria-label': def.label,
      oninput: (event) => {
        state.assumptions[def.key] = parseInt(event.target.value, 10);
        valueSpan.textContent = `${state.assumptions[def.key]}${def.suffix}`;
        renderAll();
      },
    });
    wrap.append(el('div', { class: 'slider-field', title: def.hint },
      el('div', { class: 'slider-head' }, el('span', { text: def.label }), valueSpan),
      input
    ));
  }
}

/* ---------- Hero chart ---------- */

function renderChart(model) {
  const host = $('hero-chart');
  host.textContent = '';
  const rows = state.rows;
  if (!rows.length) return;

  const W = 980, H = 420;
  const M = { top: 20, right: 168, bottom: 40, left: 46 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;

  const xMax = Math.ceil(rows[rows.length - 1].position / 100) * 100;
  const yMin = Math.floor((Math.min(...rows.map((r) => r.media)) - 0.05) * 10) / 10;
  const yMax = 10;
  const x = (pos) => M.left + (pos / xMax) * plotW;
  const y = (media) => M.top + ((yMax - media) / (yMax - yMin)) * plotH;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Curba pozițiilor și mediilor în ierarhia Dolj 2026' });

  // Gridlines + axis labels.
  for (let g = Math.ceil(yMin / 0.2) * 0.2; g <= yMax + 1e-9; g += 0.2) {
    const gy = y(g);
    svg.append(svgEl('line', { x1: M.left, x2: W - M.right, y1: gy, y2: gy, stroke: 'var(--grid)', 'stroke-width': 1 }));
    const tick = svgEl('text', { x: M.left - 8, y: gy + 4, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--text-muted)' });
    tick.textContent = g.toFixed(1);
    svg.append(tick);
  }
  for (let g = 0; g <= xMax; g += 200) {
    const gx = x(g);
    svg.append(svgEl('line', { x1: gx, x2: gx, y1: H - M.bottom, y2: H - M.bottom + 4, stroke: 'var(--axis)', 'stroke-width': 1 }));
    const tick = svgEl('text', { x: gx, y: H - M.bottom + 18, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--text-muted)' });
    tick.textContent = fmt(g);
    svg.append(tick);
  }
  svg.append(svgEl('line', { x1: M.left, x2: W - M.right, y1: H - M.bottom, y2: H - M.bottom, stroke: 'var(--axis)', 'stroke-width': 1 }));
  const xTitle = svgEl('text', { x: M.left + plotW / 2, y: H - 4, 'text-anchor': 'middle', 'font-size': 11.5, fill: 'var(--text-muted)' });
  xTitle.textContent = 'poziția în ierarhia județeană';
  svg.append(xTitle);

  // Effective-position band (uncertainty ±45) + center line.
  const effLow = Math.max(1, model.effPos - 45);
  const effHigh = model.effPos + 45;
  svg.append(svgEl('rect', {
    x: x(effLow), y: M.top, width: Math.max(2, x(effHigh) - x(effLow)), height: plotH,
    fill: 'var(--wash-candidate)',
  }));
  svg.append(svgEl('line', { x1: x(model.effPos), x2: x(model.effPos), y1: M.top, y2: M.top + plotH, stroke: 'var(--candidate)', 'stroke-width': 1.5 }));
  const effLabel = svgEl('text', { x: x(model.effPos), y: M.top - 6, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--text-secondary)' });
  effLabel.textContent = `poziția efectivă ~${fmt(model.effPos)}`;
  svg.append(effLabel);

  // Block boundary (952 seats).
  svg.append(svgEl('line', { x1: x(BLOCK_SEATS), x2: x(BLOCK_SEATS), y1: M.top, y2: M.top + plotH, stroke: 'var(--axis)', 'stroke-width': 1 }));
  const blockLabel = svgEl('text', { x: x(BLOCK_SEATS) + 4, y: M.top + 12, 'font-size': 11, fill: 'var(--text-muted)' });
  blockLabel.textContent = `${fmt(BLOCK_SEATS)} locuri top-5`;
  svg.append(blockLabel);

  // Cutoff lines with right-edge labels.
  for (const cut of CHART_CUTOFFS) {
    const cy = y(cut.media);
    const color = cut.cuza ? 'var(--cuza)' : 'var(--axis)';
    svg.append(svgEl('line', { x1: M.left, x2: W - M.right, y1: cy, y2: cy, stroke: color, 'stroke-width': 1 }));
    const label = svgEl('text', { x: W - M.right + 6, y: cy + 3.5 + (cut.labelDy || 0), 'font-size': 11, fill: cut.cuza ? 'var(--cuza)' : 'var(--text-muted)' });
    label.textContent = `${cut.media.toFixed(2)} ${cut.label}`;
    svg.append(label);
  }

  // The hierarchy curve.
  let d = '';
  for (const row of rows) {
    d += `${d ? 'L' : 'M'}${x(row.position).toFixed(1)},${y(row.media).toFixed(1)}`;
  }
  svg.append(svgEl('path', { d, fill: 'none', stroke: 'var(--series-1)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

  // Candidate mark: dot with surface ring + label.
  const c = model.candidate;
  const cx = x(c.position), cy = y(c.media);
  svg.append(svgEl('circle', { cx, cy, r: 7, fill: 'var(--surface-1)' }));
  svg.append(svgEl('circle', { cx, cy, r: 5, fill: 'var(--candidate)' }));
  const candidateLabel = svgEl('text', { x: cx + 10, y: cy + 14, 'font-size': 11.5, 'font-weight': 600, fill: 'var(--text-primary)' });
  candidateLabel.textContent = `${c.code} · ${c.media.toFixed(2)}`;
  svg.append(candidateLabel);

  // Crosshair + tooltip.
  const crosshair = svgEl('line', { y1: M.top, y2: M.top + plotH, stroke: 'var(--axis)', 'stroke-width': 1, visibility: 'hidden' });
  const hoverDot = svgEl('circle', { r: 4.5, fill: 'var(--series-1)', stroke: 'var(--surface-1)', 'stroke-width': 2, visibility: 'hidden' });
  svg.append(crosshair, hoverDot);

  const tooltip = $('tooltip');
  svg.addEventListener('pointermove', (event) => {
    const rect = svg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * W;
    const pos = Math.round(((px - M.left) / plotW) * xMax);
    const row = nearestRow(pos);
    if (!row || px < M.left - 10 || px > W - M.right + 10) { hideTooltip(); return; }
    const rx = x(row.position);
    crosshair.setAttribute('x1', rx);
    crosshair.setAttribute('x2', rx);
    crosshair.setAttribute('visibility', 'visible');
    hoverDot.setAttribute('cx', rx);
    hoverDot.setAttribute('cy', y(row.media));
    hoverDot.setAttribute('visibility', 'visible');

    tooltip.textContent = '';
    tooltip.append(
      el('div', { class: 'tt-value', text: `media ${row.media.toFixed(2)} · poziția ${fmt(row.position)}` }),
      el('div', { class: 'tt-label', text: row.school }),
      el('div', { class: 'tt-label', text: BUCKET_META[row.bucket]?.label ?? row.bucket })
    );
    tooltip.style.display = 'block';
    const ttw = tooltip.offsetWidth;
    const left = Math.min(event.clientX + 14, window.innerWidth - ttw - 10);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${event.clientY + 16}px`;
  });
  svg.addEventListener('pointerleave', () => {
    hideTooltip();
    crosshair.setAttribute('visibility', 'hidden');
    hoverDot.setAttribute('visibility', 'hidden');
  });

  host.append(svg);
}

function hideTooltip() {
  $('tooltip').style.display = 'none';
}

function nearestRow(pos) {
  if (!state.rows.length) return null;
  const clamped = Math.min(Math.max(pos, state.rows[0].position), state.rows[state.rows.length - 1].position);
  for (let offset = 0; offset < 25; offset += 1) {
    if (state.byPosition.has(clamped + offset)) return state.byPosition.get(clamped + offset);
    if (state.byPosition.has(clamped - offset)) return state.byPosition.get(clamped - offset);
  }
  return null;
}

function renderThresholdTable(model) {
  const host = $('threshold-table');
  host.textContent = '';
  const cutoffs = [
    [9.05, 'Velovan filologie 2025'], [9.02, 'Cuza filologie 2025'], [9.0, 'Buzești șt. sociale / Carol I fil. EN 2025'],
    [8.97, 'Buzești fil. EN 2025'], [8.9, 'Cuza bilingv ES 2025'], [8.8, 'Cuza / Carol I bilingv FR 2025'],
    [8.77, 'Titulescu filologie 2025'], [8.75, 'Titulescu șt. sociale 2025'],
    [8.52, 'Cuza bilingv ES 2024'], [8.45, 'Cuza bilingv FR 2024'],
    [model.candidate.media, `media ei (${model.candidate.code}) — exact pragul Titulescu filologie din 2024`],
  ];
  const table = el('table');
  const thead = el('thead');
  const headRow = el('tr');
  for (const h of ['Prag de medie', 'Candidați 2026 ≥ prag', 'Reper']) headRow.append(el('th', { text: h }));
  thead.append(headRow);
  const tbody = el('tbody');
  for (const [media, label] of cutoffs) {
    const count = state.rows.filter((r) => r.media >= media - 1e-9).length;
    tbody.append(el('tr', {},
      el('td', { text: media.toFixed(2) }),
      el('td', { text: fmt(count) }),
      el('td', { class: 't-school', text: label })
    ));
  }
  table.append(thead, tbody);
  host.append(table);
}

/* ---------- Chances ---------- */

function renderChances(model) {
  const host = $('chances');
  host.textContent = '';
  for (const school of model.schools) {
    const group = el('div', { class: `school-group${school.priority ? ' is-priority' : ''}` });
    const head = el('div', { class: 'school-head' },
      el('h3', { text: school.name }),
      el('span', { class: 'seats', text: `${school.seats} locuri în 2026` })
    );
    if (school.priority) head.append(el('span', { class: 'tag-priority', text: 'țintă prioritară' }));
    group.append(head);

    for (const code of school.codes) {
      const pct = Math.round(code.p * 100);
      const cutoffText = [2023, 2024, 2025]
        .filter((yr) => code.cutoffs[yr] != null)
        .map((yr) => `’${String(yr).slice(2)}: ${code.cutoffs[yr].toFixed(2)}`)
        .join(' · ');
      const labelBits = el('div', { class: 'code-label' },
        code.code ? el('span', { class: 'cod', text: `${code.code} · ` }) : null,
        code.label,
        code.est ? el('span', { class: 'est-mark', title: 'estimare — de verificat în broșura ISJ', text: ' ~' }) : null,
        el('span', { class: 'muted', text: ` · ${code.seats} locuri` })
      );
      const detailParts = [];
      if (code.pHist != null) detailParts.push(`istoric ${Math.round(code.pHist * 100)}%`);
      if (code.pFlow != null) detailParts.push(`flux locuri ${Math.round(code.pFlow * 100)}%`);
      const row = el('div', { class: 'code-row', title: detailParts.length ? `Componente: ${detailParts.join(' · ')}` : '' },
        labelBits,
        el('div', { class: 'cutoffs', text: cutoffText || 'praguri necunoscute' }),
        el('div', { class: 'meter' }, el('div', { class: 'meter-fill', style: `width:${Math.max(1, pct)}%` })),
        el('div', { class: 'pct' }, `${pct}%`, el('span', { class: 'band-word', text: chanceWord(code.p) }))
      );
      group.append(row);
    }
    host.append(group);
  }
}

/* ---------- Recommended option sheet ---------- */

function renderSheet(model) {
  const host = $('sheet');
  host.textContent = '';
  let rowNumber = 0;

  for (const tier of SHEET_TIERS) {
    host.append(el('div', { class: 'tier-head' },
      el('h3', { text: tier.title }),
      el('p', { class: 'tier-note', text: tier.note })
    ));
    for (const item of tier.items) {
      const entry = CODE_INDEX.get(item.code);
      if (!entry) continue;
      rowNumber += 1;
      const p = model.codeP.get(item.code) ?? 0;
      const pct = Math.round(p * 100);
      const cutoffText = [2024, 2025]
        .filter((yr) => entry.def.cutoffs[yr] != null)
        .map((yr) => `’${String(yr).slice(2)}: ${entry.def.cutoffs[yr].toFixed(2)}`)
        .join(' · ');
      host.append(el('div', { class: `sheet-row${item.optional ? ' optional' : ''}${entry.schoolName.includes('Elena Cuza') ? ' is-cuza' : ''}` },
        el('div', { class: 'sheet-num', text: `${rowNumber}.` }),
        el('div', { class: 'code-label' },
          el('span', { class: 'cod', text: `${item.code} · ` }),
          `${entry.schoolName} — ${entry.def.label}`,
          item.note ? el('span', { class: 'muted', text: ` · ${item.note}` }) : null
        ),
        el('div', { class: 'cutoffs', text: cutoffText }),
        el('div', { class: 'meter' }, el('div', { class: 'meter-fill', style: `width:${Math.max(1, pct)}%` })),
        el('div', { class: 'pct' }, `${pct}%`, el('span', { class: 'band-word', text: chanceWord(p) }))
      ));
    }
  }

  // Where does she land, cumulatively? Sequential allocation over the tiers
  // (firm rows only), each tier's union damped for intra-school correlation.
  const tierUnion = (tierId) => {
    const tier = SHEET_TIERS.find((t) => t.id === tierId);
    return dampedUnion(tier.items.filter((i) => !i.optional).map((i) => model.codeP.get(i.code) ?? 0));
  };
  const uA = model.cuzaChance;
  const uB = tierUnion('B');
  const uC = tierUnion('C');
  const landA = uA;
  const landB = (1 - uA) * uB;
  const landC = (1 - uA) * (1 - uB) * uC;
  const landD = Math.max(0, 1 - landA - landB - landC);
  const outcomes = [
    ['Elena Cuza', landA],
    ['Alt colegiu de top', landB],
    ['Titulescu', landC],
    ['Plasa de siguranță', landD],
  ];
  const strip = el('div', { class: 'outcome-strip' },
    el('div', { class: 'outcome-title', text: 'Unde ajunge, estimativ (cu fișa de mai sus, fără rândurile opționale):' })
  );
  const chips = el('div', { class: 'outcome-chips' });
  for (const [label, p] of outcomes) {
    chips.append(el('div', { class: 'outcome-chip' },
      el('span', { class: 'outcome-pct', text: `${Math.round(p * 100)}%` }),
      el('span', { class: 'outcome-label', text: label })
    ));
  }
  strip.append(chips);
  host.append(strip);
}

/* ---------- Vocational ---------- */

function renderVocational(model) {
  const host = $('vocational');
  host.textContent = '';
  const groups = {};
  for (const row of model.above) {
    if (row.track) (groups[row.track] ||= []).push(row);
  }
  const order = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  for (const [track, rows] of order) {
    const wrap = el('div', { class: 'voc-track' },
      el('div', { class: 'voc-head' },
        el('span', { class: 'count', text: fmt(rows.length) }),
        el('span', { text: TRACK_LABELS[track] ?? track })
      )
    );
    const chips = el('div', { class: 'voc-positions' });
    for (const row of rows) {
      chips.append(el('span', { class: 'pos-chip', title: `${row.school} · media ${row.media.toFixed(2)}`, text: fmt(row.position) }));
    }
    wrap.append(chips);
    host.append(wrap);
  }
  host.append(el('p', { class: 'voc-note', text: 'Colegiul Militar nu are gimnaziu, deci admișii lui nu se văd aici — folosește cursorul „Plecări la Colegiul Militar” din ipoteze. Nu toți cei de mai sus pleacă efectiv pe vocațional; cursoarele decid câți.' }));
}

/* ---------- Bands ---------- */

function renderBands() {
  const host = $('bands');
  host.textContent = '';
  const maxPos = state.rows[state.rows.length - 1].position;
  for (let start = 1; start <= maxPos; start += 200) {
    const end = Math.min(start + 199, maxPos);
    const band = state.rows.filter((r) => r.position >= start && r.position <= end);
    if (!band.length) continue;
    const nonCraiova = band.filter((r) => r.bucket !== 'CRAIOVA' && r.bucket !== 'NEAR_CRAIOVA').length;
    const pct = (nonCraiova / band.length) * 100;
    host.append(el('div', { class: 'band-row' },
      el('div', { class: 'band-label', text: `${fmt(start)}–${fmt(end)}` }),
      el('div', { class: 'band-bar', title: `${nonCraiova} din ${band.length} candidați` },
        el('div', { class: 'fill', style: `width:${Math.max(1.5, pct)}%` })),
      el('div', { class: 'band-value', text: `${pct.toFixed(1)}% (${nonCraiova}/${band.length})` })
    ));
  }
}

/* ---------- Origin table ---------- */

const ORIGIN_COLUMNS = [
  { key: 'school', label: 'Școala de proveniență', numeric: false },
  { key: 'count', label: 'Elevi', numeric: true },
  { key: 'herRank', label: 'Poziția ei în școală', numeric: true },
  { key: 'bestPos', label: 'Cea mai bună poziție', numeric: true },
  { key: 'maxMedia', label: 'Media max', numeric: true },
  { key: 'minMedia', label: 'Media min', numeric: true },
  { key: 'avgMedia', label: 'Media medie', numeric: true },
];

function originStats(candidatePos) {
  const map = new Map();
  for (const row of state.rows) {
    let entry = map.get(row.school);
    if (!entry) {
      entry = { school: row.school, bucket: row.bucket, count: 0, aboveHer: 0, bestPos: Infinity, minMedia: Infinity, maxMedia: -Infinity, sum: 0 };
      map.set(row.school, entry);
    }
    entry.count += 1;
    if (row.position < candidatePos) entry.aboveHer += 1;
    entry.bestPos = Math.min(entry.bestPos, row.position);
    entry.minMedia = Math.min(entry.minMedia, row.media);
    entry.maxMedia = Math.max(entry.maxMedia, row.media);
    entry.sum += row.media;
  }
  // herRank = where the candidate would sit inside this school's cohort.
  return [...map.values()].map((e) => ({ ...e, avgMedia: e.sum / e.count, herRank: e.aboveHer + 1 }));
}

function renderOriginTable(model) {
  $('origin-note').textContent = `Statistică pe școala de gimnaziu, pentru pozițiile 1–${fmt(state.rows.length)} (partea de sus a ierarhiei — nu tot județul). „Poziția ei în școală” = pe ce loc ar fi ea, cu media ${model.candidate.media.toFixed(2)}, între elevii acelei școli aflați în top (ex. 74 / 130 = a 74-a din 130). Punct colorat = clasificarea geografică: Craiova, lângă Craiova, oraș cu licee proprii, rural, vocațional.`;

  const head = $('origin-head');
  head.textContent = '';
  for (const col of ORIGIN_COLUMNS) {
    const arrow = state.originSort.key === col.key ? (state.originSort.dir > 0 ? ' ↑' : ' ↓') : '';
    head.append(el('th', {
      class: state.originSort.key === col.key ? 'sorted' : '',
      text: col.label + arrow,
      onclick: () => {
        if (state.originSort.key === col.key) state.originSort.dir *= -1;
        else state.originSort = { key: col.key, dir: col.numeric ? -1 : 1 };
        renderOriginTable(computeModel());
      },
    }));
  }

  let stats = originStats(model.candidate.position);
  if (state.originQuery) {
    const q = normText(state.originQuery);
    stats = stats.filter((s) => normText(s.school).includes(q));
  }
  const { key, dir } = state.originSort;
  stats.sort((a, b) => {
    const va = a[key], vb = b[key];
    return (typeof va === 'string' ? va.localeCompare(vb, 'ro') : va - vb) * dir;
  });

  const body = $('origin-body');
  body.textContent = '';
  const candidateSchool = model.candidate.found ? model.candidate.school : null;
  for (const s of stats) {
    const dot = el('span', {
      class: 'bucket-dot',
      style: `background:${BUCKET_META[s.bucket]?.color ?? 'var(--axis)'}`,
      title: BUCKET_META[s.bucket]?.label ?? s.bucket,
    });
    body.append(el('tr', { class: s.school === candidateSchool ? 'is-candidate-school' : '' },
      el('td', { class: 't-school' }, dot, s.school),
      el('td', { text: fmt(s.count) }),
      el('td', { text: `${fmt(s.herRank)} / ${fmt(s.count)}`, title: `cu media ei ar fi a ${fmt(s.herRank)}-a din cei ${fmt(s.count)} elevi ai școlii aflați în top` }),
      el('td', { text: fmt(s.bestPos) }),
      el('td', { text: s.maxMedia.toFixed(2) }),
      el('td', { text: s.minMedia.toFixed(2) }),
      el('td', { text: s.avgMedia.toFixed(2) })
    ));
  }
}

/* ---------- Methodology ---------- */

function renderMethodology(model) {
  const host = $('methodology');
  host.textContent = '';
  const paragraphs = [
    `1. Scurgerea geografică: fiecare candidat de deasupra e clasificat după școala de proveniență. Se presupune că ${Math.round(LEAK_RATES.FAR_TOWN * 100)}% dintre cei din orașe cu licee proprii (Calafat, Băilești, Filiași…) și ${Math.round(LEAK_RATES.FAR_RURAL * 100)}% dintre cei din rural rămân la liceele locale. Cursorul „încredere” scalează tot modelul.`,
    `2. Plecările vocaționale (militar, învățători, artă, sport, teologic) ies din repartizarea computerizată. Militarul e complet invizibil în date; pentru pedagogic vedem ${fmt(model.above.filter((r) => r.track === 'PEDAGOGIC').length)} candidați proveniți din gimnaziul Velovan deasupra ei.`,
    `3. Poziția efectivă = poziția reală − scurgerea totală. Comparată cu cele ${fmt(BLOCK_SEATS)} de locuri din blocul celor 5 licee țintă, dă șansa unui loc oarecare în top-5.`,
    `4. Concurența pe uman: din cei ~${fmt(model.effPos)} competitori efectivi de deasupra, doar ${Math.round(model.umanShare * 100)}% (cursorul real/uman) vor locuri la uman. Rangul ei pe uman (~${fmt(model.umanRank)}) se compară cu scara cumulată a celor ~${fmt(UMAN_TOTAL_SEATS)} locuri uman, ordonate după pragul din 2025 — asta dă componenta „flux locuri”.`,
    `5. Componenta „istoric”: pragul fiecărui cod e tratat ca variabilă aleatoare centrată pe media ultimilor ani (2023–2025, unde există), cu incertitudine mai mare când avem un singur an. Probabilitatea = șansa ca pragul din 2026 să coboare sub media ei.`,
    `6. Șansa finală pe cod = media celor două componente (unde există amândouă). Șansa „Elena Cuza orice cod” combină cele 8 coduri cu o corecție de corelație (codurile aceleiași școli nu sunt independente).`,
    `Limite: modelul nu vede opțiunile reale ale celorlalți candidați; contestațiile din 8 iulie pot muta media și poziția — de aceea există butonul de actualizare. Nimic de aici nu e o garanție; fișa cu 20+ opțiuni rămâne singura plasă de siguranță reală.`,
  ];
  for (const p of paragraphs) host.append(el('p', { text: p }));
}

/* ------------------------------------------------------------------ */
/* Data loading & refresh                                              */
/* ------------------------------------------------------------------ */

function setData(payload) {
  state.rows = payload.rows;
  state.byPosition = new Map(payload.rows.map((r) => [r.position, r]));
  state.updatedAt = payload.updatedAt;
  $('refresh-status').textContent = `${state.staticMode ? 'versiune online · ' : ''}actualizat: ${formatDate(payload.updatedAt)}`;
  renderAll();
}

function formatDate(iso) {
  const date = new Date(iso);
  return date.toLocaleString('ro-RO', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

async function loadData() {
  // Local mode: the Node server exposes /api/data. Online (GitHub Pages)
  // there is no API, so fall back to the static snapshot next to the page.
  try {
    const response = await fetch('/api/data');
    if (!response.ok) throw new Error('api indisponibil');
    setData(await response.json());
    return;
  } catch { /* fall through to the static snapshot */ }
  try {
    const response = await fetch('data.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('fără snapshot');
    state.staticMode = true;
    $('refresh-btn').hidden = true; // refresh is a local-only feature
    setData(await response.json());
  } catch {
    $('refresh-status').textContent = 'nu există date — pornește serverul local sau publică data.json';
    renderAll();
  }
}

function startRefresh() {
  const btn = $('refresh-btn');
  btn.disabled = true;
  document.body.classList.add('is-refreshing');
  $('refresh-progress').hidden = false;
  $('refresh-fill').style.width = '2%';
  $('refresh-status').textContent = 'pornesc descărcarea…';

  const source = new EventSource('/api/refresh?pages=75');
  const finish = () => {
    source.close();
    btn.disabled = false;
    document.body.classList.remove('is-refreshing');
    $('refresh-progress').hidden = true;
  };

  source.addEventListener('progress', (event) => {
    const { page, maxPage, rowsTotal } = JSON.parse(event.data);
    $('refresh-fill').style.width = `${Math.round((page / maxPage) * 100)}%`;
    $('refresh-status').textContent = `pagina ${page}/${maxPage} · ${fmt(rowsTotal)} rânduri`;
  });
  source.addEventListener('done', (event) => {
    finish();
    setData(JSON.parse(event.data));
  });
  source.addEventListener('error', (event) => {
    finish();
    const message = event.data ? JSON.parse(event.data).message : 'conexiune întreruptă — încearcă din nou';
    $('refresh-status').textContent = `eroare: ${message}`;
  });
}

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */

$('refresh-btn').addEventListener('click', startRefresh);
$('code-input').addEventListener('change', (event) => {
  state.code = event.target.value.trim().toUpperCase();
  event.target.value = state.code;
  renderAll();
});
$('origin-search').addEventListener('input', (event) => {
  state.originQuery = event.target.value;
  renderOriginTable(computeModel());
});

renderSliders();
loadData();
