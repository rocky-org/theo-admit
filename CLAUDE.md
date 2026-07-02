# CLAUDE.md — Dolj High School Admission Simulation (EN 2026)

## Purpose

Estimate where a specific candidate will land in the computerized high school
repartition (repartizare computerizată) in Dolj county, Romania, on July 22,
2026, and produce the optimal option sheet (fișa de opțiuni). Primary target:
CN "Elena Cuza" Craiova, filologie profile. Realistic anchor: CN "Nicolae
Titulescu". Safety net: Tudor Arghezi / Henri Coandă.

**Candidate snapshot (as of June 30, 2026, before contestations):**
- Anonymized candidate code: **DJ9445089** (Școala Gimnazială "Traian" Craiova)
- Media at Evaluarea Națională (EN): **8.40**
- County hierarchy position: **1182** (out of ~4,440 listed, ~3,200 with media ≥ 5);
  verified by code lookup in the July 2 scrape. Pass the code as the second CLI
  argument to re-resolve the position automatically after contestations.
- Passed the bilingual language tests (min 6.00 required) in May 2026 for:
  **English, German, Spanish, French** → all bilingual codes are valid on her sheet.
  Verify actual pass grades per language before finalizing the sheet.

## How the repartition works (domain rules)

- Admission media = EN media only (100%), two decimals, no rounding.
- Tie-breakers at equal media, in order: (1) grades 5-8 GPA (media V-VIII),
  (2) Romanian exam grade, (3) Math exam grade.
- Algorithm: candidates are processed in strictly descending media order; each
  candidate receives the FIRST option on their list that still has free seats.
  Listing unrealistic "dream" options first carries ZERO penalty. Order options
  strictly by preference. Long lists (20+) eliminate the risk of non-placement.
- Bilingual specialization codes are valid only if the candidate passed the
  language test for that language. "Intensiv" classes do NOT require the test.
- Vocational tracks (military, pedagogic, arts, sports, theology) sit OUTSIDE
  the computerized repartition: they consume candidates from the hierarchy,
  not seats from the theoretical block. This is the source of "leakage".

## Calendar 2026 (deadlines matter)

| Date | Event |
|---|---|
| July 8 | Final EN results after contestations |
| July 9 | Official county hierarchy published (re-run scraper, update position) |
| July 13-20 | Option sheets filled in (electronic) |
| July 22 | First computerized repartition |
| July 23-28 | Enrollment dossier deposit at assigned school (missing it = losing the seat) |
| July 31+ | Second round (leftovers only; top schools never have leftovers) |

## The seat math (official ISJ Dolj brochure 2026-2027, page 12 of
`brosura-2026-2027.pdf` — the authoritative source, parsed July 2)

Top-5 block, 9th grade seats for 2026, with each school's LOWEST closing media:

| School | Seats 2026 | Min 2024 | Min 2025 |
|---|---|---|---|
| CN Frații Buzești | 224 | 8.50 | 8.90 |
| CN Carol I ("Bălcescu") | 252 | 8.50 | 8.80 |
| CN Elena Cuza | 252 | 8.45 | 8.80 |
| CN Ștefan Velovan (theoretical) | 140 | 8.65 | 9.05 |
| CN Nicolae Titulescu | 112 | 8.25 | 8.75 |
| **Total block** | **980** | | |

Uman (filologie + științe sociale) codes in the block, cutoffs 2024 → 2025:
Cuza 114 fil 28 (8.90→9.02), 115 fil EN 28 (9.05→9.17), 117 fil ES 28
(8.52→8.90), 116 fil FR 28 (8.45→8.80); Buzești 123 fil EN 28 (8.80→8.97),
124 SS 28 (8.60→9.00); Carol I 107 fil EN 28 (8.82→9.00), 109 fil ES 14
(8.57→8.87), 108 fil FR 14 (8.50→8.80); Velovan 131 fil 28 (8.65→9.05);
Titulescu 127 fil 28 (**8.40**→8.77 — 2024 closed exactly at the candidate's
media), 128 SS 28 (8.25→8.75). Total uman in block: 308 seats. No plain
(non-bilingual) filologie at Buzești or Carol I; no științe sociale at Cuza.
Full per-code data for both profiles lives in `SCHOOLS` in `docs/app.js`.

Counted separately (outside computerized repartition), official 2026 numbers
from brochure p. 16/18 with last-admitted medias 2024→2025: Military College
168 (own exam: 0.2×EN media + 0.8×grid test, May 19). Pedagogic Velovan 48
(înv. primar 24: 9.25→**9.40**; educație timpurie 24: 8.95→**9.22** — nearly
all pedagogic admits rank above media 8.40). Arts "Marin Sorescu" 72
(7.18–8.11 — mostly below 8.40). Sports ~168 across 6 schools (Titulescu
volei 24: 8.21→**8.68**; Energetic 24: 8.83→**8.93**; Trișcu atletism 36:
8.30→7.33; Auto fotbal 24: →8.31; CF fotbal/handbal 24: 8.26→–). Theology 48
(Adventist 6.55, Seminar 6.99→6.00 — almost none above her). NOTE: for
arts/sports the listed media may include aptitude-test weighting, so it is
not directly comparable to EN media.

2026 media→position map for Dolj (from the site's pagination index, June 30):
600→9.05, 700→8.95, 800→8.85, 900→8.75, 1000→8.65, 1100→8.52, 1200→8.40.

## Decision rule

Compute the candidate's EFFECTIVE position = raw position minus estimated
non-competitors ranked above her (geographic leakage from the scraper +
manual add-ons: ~50-90 military admits, ~60-90 pedagogic/arts admits).

- Effective position **< ~980** (block size) → tail of the top-5 block is
  reachable: Titulescu solid, Elena Cuza bilingual FR/ES (116/117) in play.
- Effective position **> ~1030** → baseline becomes Tudor Arghezi; Elena Cuza
  stays only as free lottery tickets on sheet positions 1-4.
- Profile caveat: only ~308 of the 980 block seats are uman; the real/uman
  preference split (dashboard slider) decides how far down the uman ladder
  her effective rank reaches. Titulescu is NOT near-certain in a 2025-like
  year (fil closed 8.77); it was hers in a 2024-like year (8.40).

## Data source and its quirks

Hierarchy pages: `https://evaluare.edu.ro/Evaluare/CandFromJudIAD.aspx?Jud=18&Poz=0&PageN=N`
(Jud=18 is Dolj), 20 rows per page, ~222 pages.

- **ASP.NET session quirk**: without a valid session cookie the server may pin
  every request to the same page regardless of `PageN`. The scraper does a
  warm-up request, stores the cookie, verifies that each page's first row
  position matches `(page-1)*20+1`, and retries up to 3 times on mismatch.
- **IMPORTANT — table layout**: there is NO separate locality column. The
  locality is embedded at the END of the school-name cell, e.g.
  `SCOALA GIMNAZIALA "MIRCEA ELIADE" CRAIOVA`, sometimes with a trailing
  county marker like `/ DJ`. Both classification (`classifySchool`) and
  locality extraction (`extractLocality`) parse the full school string;
  never assume a dedicated locality field.
- Row columns: index/position, anonymized candidate code, school of origin
  (locality embedded), Romanian grade, Math grade, media. The media is the
  LAST numeric `d.dd` token in the row.
- Data is pre-contestation until July 8; the site updates in place afterward.

## Files

- `scrape-dolj-hierarchy.js` — Node 18+, zero dependencies, ESM. Dual-purpose:
  CLI (`node scrape-dolj-hierarchy.js [maxPage] [targetPositionOrCode]`,
  defaults 70 and 1182; pass DJ9445089 to auto-resolve the position) and
  module (exports `scrapeHierarchy`, `classifySchool`, `vocationalTrack`,
  CSV read/write helpers) consumed by the web dashboard.
- `server.js` — zero-dependency dashboard server, `node server.js` (or
  `npm start`) → http://localhost:7788. Serves `docs/` plus
  `GET /api/data` (rows + updatedAt) and `GET /api/refresh?pages=N`
  (SSE stream: re-scrapes, events progress/done/error, rewrites the CSV).
  WARNING: a refresh with small `pages` overwrites the CSV with fewer rows.
- Online: https://rocky-org.github.io/theo-admit/ (GitHub Pages, repo
  rocky-org/theo-admit, branch main, folder /docs). The online page runs in
  static mode: loads `docs/data.json`, hides the refresh button. Publishing
  fresh data = local refresh (rewrites data.json) + commit + push.
- `docs/` — the dashboard UI (index.html / styles.css / app.js), all text in
  Romanian, vanilla JS + hand-built SVG. All modeling happens client-side in
  `app.js`: assumption sliders (real/uman preference share, military,
  pedagogic, arts, sports, theology exits, geographic-leak confidence),
  effective position, uman-seat ladder, per-code chances. Seat counts and
  cutoffs live in the `SCHOOLS` config at the top of `app.js`; entries with
  `est: true` are assumptions to correct from the ISJ brochure.
- `dolj-hierarchy.csv` — scraper output (position, code, media, bucket,
  school), regenerated on each run/refresh.

### Chance model (client-side, `app.js`)

Per code, the probability blends two signals (arithmetic mean):
(1) *history* — the 2026 cutoff modeled as Normal around the 2023–2025
cutoffs, σ floored at 0.18–0.28 because year-to-year swings are 0.2–0.5;
(2) *seat flow* — effective position × uman-share compared against the
cumulative ladder of ~308 uman seats in the top-5 block, logistic with scale
60. Real-profile codes use history only. The "Elena Cuza any code" hero
number applies a correlation damping (max + 0.55 × remainder). Calibrated
July 2 on official brochure data: EC any ≈ 20% (door 116 ≈ 14%), Titulescu
fil 20% / SS 31%, any top-5 seat ≈ 69% at default sliders.

## Classification model (tunable in `LEAK_RATES`)

| Bucket | Meaning | Leak rate (does not compete) |
|---|---|---|
| CRAIOVA | Craiova city schools | 0.00 |
| CRAIOVA_VOCATIONAL | Trișcu / Marin Sorescu / sports-program origin | 0.80 |
| NEAR_CRAIOVA | Commutable communes (Podari, Ișalnița, Breasta, ...) | 0.05 |
| FAR_TOWN | Towns with own high schools (Băilești, Calafat, Filiași, Segarcea, Dăbuleni, ...) | 0.70 |
| FAR_RURAL | Everything else | 0.45 |

Recalibrate these once real per-locality counts exist. Sample evidence so far
(positions 1181-1200): 14/20 Craiova, 6/20 non-Craiova (~30%).

**July 2 scrape results (pages 1-70, positions 1-1400, pre-contestation):**
Above position 1182: CRAIOVA 966 (81.8%), FAR_TOWN 107, FAR_RURAL 65,
NEAR_CRAIOVA 35, CRAIOVA_VOCATIONAL 8. Geographic leakage ~112 → effective
~1070 before manual add-ons. Vocational ORIGINS above 1182 (likely to exit the
computerized repartition): Velovan-gimnaziu 60, Trișcu/sport 6, Teologic
Adventist 4, Liceul de Arte 2. Military admits are invisible in origin data.
Media thresholds (candidates at/above): 8.90→756, 8.80→855, 8.75→892,
8.62→1011, 8.52→1092, 8.45→1158, 8.40→1191.

## Current option sheet draft (official 2026 codes from the brochure,
order = strict preference; chances from the July 2 model at default sliders)

The sheet is also rendered live in the dashboard ("Fișa de opțiuni
recomandată" section) with per-code chances that follow the sliders — edit
`SHEET_TIERS` / `SAFETY_SCHOOLS` in `docs/app.js` to change it.

Tier A — Elena Cuza (declared priority; all free lottery tickets):
1. 114 EC filologie (9.02/8.90) ~1%
2. 116 EC fil bilingual FR (8.80/8.45) ~14% — the cheapest EC door
3. 117 EC fil bilingual ES (8.90/8.52) ~9%
4. 115 EC fil bilingual EN (9.17/9.05) ~1%
5-8. EC real codes 110/113/111/112 — ONLY if the family accepts real at EC;
     otherwise move below tier C.

Tier B — other top schools, uman:
9. 124 Buzești științe sociale (9.00/8.60) ~5%
10. 123 Buzești fil bilingual EN (8.97/8.80) ~2%
11. 109 Carol I fil bilingual ES (8.87/8.57) ~6% (14 seats)
12. 108 Carol I fil bilingual FR (8.80/8.50) ~12% (14 seats)
13. 107 Carol I fil bilingual EN (9.00/8.82) ~1%
14. 131 Velovan filologie (9.05/8.65) ~3%
Optional insert: 121 Buzești MI bilingual DE (8.92/8.50, 14 seats, ~15%) if
real-at-Buzești outranks uman-at-Titulescu for the family (DE test passed).

Tier C — the realistic anchor (Titulescu):
15. 127 fil (8.77/8.40 — 2024 closed exactly at her media) ~20%
16. 128 SS (8.75/8.25) ~31%
17. 126 SN intensiv EN (8.75/8.25, no language test) ~39% — best card in the
    whole block if real is acceptable
18. 125 MI (8.80/8.37) ~27% — only if real acceptable

Tier D — safety net. WARNING: Arghezi filologie closed 8.60 in 2025, ABOVE
her media — Arghezi is a coin flip, not safety. True safety starts at Coandă:
19. 167 Arghezi fil (8.60/8.15) ~50%
20. 168 Arghezi SS (8.50/8.02)
21. 157 Coandă fil bilingual EN (8.45/8.00)
22. 156 Coandă fil (8.30/7.82) — first near-certain uman catch
23. 103 Odobleja fil (8.15/7.55)
24. 141 Voltaire fil bilingual FR (7.97/7.17)
25. 142 Voltaire SS intensiv FR (7.95/7.27)
26. 137 Traian Vuia fil (7.87/7.25, 56 seats)
27. 138 Vuia SS (7.85/7.05)
28. 134 Charles Laugier fil (7.77/6.97) — floor; add 1-2 sub-7.00 codes after
    it for paranoia-level safety.

The bilingual FR/ES classes mean 4 years of intensive study in that language.
Order inside each tier is the candidate's personal preference, not strategy.
Never list a school she would refuse to attend: the assignment is binding
(dossier deposit July 23-28 or the seat is lost).

## Conventions

- All code, comments, variable names, docblocks, and commit messages in
  English. Conversation with the user is in Romanian.
- Be direct; push back with reasoning and sources when the user's assumptions
  are wrong (e.g., inflated seat counts, media-vs-position confusion).
- Never present the plan as a guarantee: the sheet optimizes the outcome for a
  given position; it cannot raise the probability at any single school.

## Open items

- [x] Run the scraper on current data; report the console summary (done July 2).
- [x] Web dashboard with refresh button, per-code chances, real/uman slider,
      origin-school stats (done July 2; `node server.js` → localhost:7788).
- [ ] Re-run after July 9 (final hierarchy): the dashboard refresh button, or
      `node scrape-dolj-hierarchy.js 70 DJ9445089`.
- [x] Correct seats/cutoffs in `docs/app.js` from the ISJ brochure (done
      July 2 from `brosura-2026-2027.pdf` p. 12; no `est` flags remain).
- [ ] Recalibrate `LEAK_RATES` from real locality counts.
- [ ] Confirm per-language pass grades (min 6.00) from the May test lists.
- [ ] Get the candidate's V-VIII GPA + Romanian + Math grades for tie-break analysis.
- [ ] Finalize sheet order with the family (school vs profile preference).
