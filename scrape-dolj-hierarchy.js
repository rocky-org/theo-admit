#!/usr/bin/env node
/**
 * Dolj EN 2026 hierarchy scraper (evaluare.edu.ro)
 *
 * Fetches the county ranking pages, extracts each candidate's position,
 * anonymized code, school of origin and exam average, classifies the school
 * by locality, and estimates how many candidates ranked ABOVE a target
 * position are likely to compete for Craiova's top high schools.
 *
 * Used both as a CLI and as a module (imported by server.js for the web UI).
 *
 * CLI usage:
 *   node scrape-dolj-hierarchy.js [maxPage] [targetPositionOrCode]
 * Defaults:
 *   maxPage = 75  (positions 1..1500), target = 1182
 * The second argument may be a candidate code (e.g. DJ9445089); the target
 * position is then resolved from the scraped data after fetching.
 *
 * Output:
 *   - dolj-hierarchy.csv  (position, code, media, locality bucket, school)
 *   - console summary with per-band breakdown, vocational-origin positions
 *     and leakage estimate
 *
 * Requires Node 18+ (built-in fetch). No external dependencies.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = 'https://evaluare.edu.ro/Evaluare/CandFromJudIAD.aspx';
const COUNTY_ID = 18; // Dolj
export const PAGE_SIZE = 20;
const REQUEST_DELAY_MS = 600;

const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const CSV_PATH = path.join(ROOT, 'dolj-hierarchy.csv');
export const DATA_JSON_PATH = path.join(ROOT, 'docs', 'data.json');

/** Communes close enough to Craiova that pupils commute daily. */
const NEAR_CRAIOVA = [
  'PODARI', 'MALU MARE', 'CARCEA', 'ISALNITA', 'SIMNICU', 'PIELESTI',
  'GHERCESTI', 'MISCHII', 'BUCOVAT', 'BREASTA', 'COSOVENI', 'CALOPAR',
  'TUGLUI', 'VARVORU', 'TERPEZITA', 'COTOFENII', 'ALMAJ', 'GOIESTI',
  'GHINDENI', 'ROBANESTI', 'TEASC',
];

/** Towns that have their own (decent) high schools; pupils tend to stay. */
const FAR_TOWNS = [
  'BAILESTI', 'CALAFAT', 'FILIASI', 'SEGARCEA', 'DABULENI', 'BECHET',
  'POIANA MARE', 'PLENITA', 'MELINESTI', 'AMARASTII', 'CETATE',
];

/** Craiova schools whose pupils typically continue on vocational tracks. */
const VOCATIONAL_HINTS = ['PETRACHE TRISCU', 'MARIN SORESCU', 'PROGRAM SPORTIV'];

/**
 * Vocational-track detection by school of origin. These pupils compete in the
 * hierarchy but mostly continue OUTSIDE the computerized repartition (sports,
 * arts, pedagogic, theology admissions have their own separate processes).
 * NOTE: the military college has no gimnaziu, so military admits can NOT be
 * detected from origin data — they stay a manual add-on.
 */
const VOCATIONAL_TRACKS = {
  SPORT: ['PETRACHE TRISCU', 'PROGRAM SPORTIV'],
  // 'MARIN SORESCU' alone is ambiguous: a rural gimnaziu in Bulzesti shares
  // the name with the Craiova arts lyceum, so require the 'LICEUL DE ARTE' form.
  ARTA: ['LICEUL DE ARTE', 'LICEUL DE ARTA'],
  PEDAGOGIC: ['VELOVAN', 'PEDAGOGIC'],
  TEOLOGIC: ['TEOLOGIC', 'SEMINAR'],
};

/** Assumed share of each bucket that does NOT compete for Craiova theory seats. */
export const LEAK_RATES = {
  CRAIOVA: 0.0,
  CRAIOVA_VOCATIONAL: 0.8,
  NEAR_CRAIOVA: 0.05,
  FAR_TOWN: 0.7,
  FAR_RURAL: 0.45,
};

function stripDiacritics(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[șş]/gi, 's')
    .replace(/[țţ]/gi, 't')
    .toUpperCase();
}

export function classifySchool(rawName) {
  const name = stripDiacritics(rawName);
  if (name.includes('CRAIOVA')) {
    if (VOCATIONAL_HINTS.some((hint) => name.includes(hint))) {
      return 'CRAIOVA_VOCATIONAL';
    }
    return 'CRAIOVA';
  }
  if (NEAR_CRAIOVA.some((loc) => name.includes(loc))) return 'NEAR_CRAIOVA';
  if (FAR_TOWNS.some((loc) => name.includes(loc))) return 'FAR_TOWN';
  return 'FAR_RURAL';
}

export function vocationalTrack(rawName) {
  const name = stripDiacritics(rawName);
  for (const [track, hints] of Object.entries(VOCATIONAL_TRACKS)) {
    if (hints.some((hint) => name.includes(hint))) return track;
  }
  return null;
}

export function extractLocality(rawName) {
  // The source table has NO separate locality column: the locality is embedded
  // at the end of the school-name cell (e.g. `SCOALA GIMNAZIALA "X" CRAIOVA / DJ`).
  // Strip county markers, then take what follows the quoted school name.
  const name = stripDiacritics(rawName)
    .replace(/["„”]/g, '"')
    .replace(/\s*\/\s*[A-Z]{2}\s*$/, '')
    .trim();
  const afterQuote = name.match(/"[^"]+"\s+(.+)$/);
  if (afterQuote) return afterQuote[1].trim();
  const generic = name.match(/^(SCOALA GIMNAZIALA|LICEUL TEORETIC|LICEUL TEHNOLOGIC|COLEGIUL NATIONAL|LICEUL)\s+(.+)$/);
  if (generic) return generic[2].trim();
  return name;
}

function parseRows(html) {
  const rows = [];
  const chunks = html.split(/<tr/i);
  for (const chunk of chunks) {
    if (!chunk.includes('CandPerScoalaIAD.aspx')) continue;
    const posMatch = chunk.match(/<td[^>]*>\s*(\d{1,4})\s*<\/td>/i);
    const schoolMatch = chunk.match(/CandPerScoalaIAD\.aspx[^>]*>([^<]+)<\/a>/i);
    const codeMatch = chunk.match(/\b([A-Z]{2}\d{5,})\b/);
    const gradeMatches = chunk.match(/\b\d{1,2}\.\d{2}\b/g);
    if (!posMatch || !schoolMatch || !gradeMatches) continue;
    rows.push({
      position: parseInt(posMatch[1], 10),
      code: codeMatch ? codeMatch[1] : '',
      school: schoolMatch[1].replace(/\s+/g, ' ').trim(),
      media: parseFloat(gradeMatches[gradeMatches.length - 1]),
    });
  }
  return rows;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(pageNumber, cookie) {
  const url = `${BASE_URL}?Jud=${COUNTY_ID}&Poz=0&PageN=${pageNumber}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    redirect: 'follow',
  });
  const setCookie = response.headers.get('set-cookie');
  const html = await response.text();
  return { html, setCookie };
}

/**
 * Scrape pages 1..maxPage and return the rows sorted by position.
 * onProgress (optional) is called after each page with
 * { page, maxPage, rowsTotal }.
 */
export async function scrapeHierarchy({ maxPage = 75, onProgress = null } = {}) {
  const all = new Map(); // position -> row

  // Warm-up request to obtain the ASP.NET session cookie (without it the
  // server may pin every request to the same page regardless of PageN).
  let cookie = null;
  const warmup = await fetchPage(1, null);
  if (warmup.setCookie) cookie = warmup.setCookie.split(';')[0];

  for (let page = 1; page <= maxPage; page += 1) {
    let rows = [];
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const { html, setCookie } = await fetchPage(page, cookie);
      if (setCookie) cookie = setCookie.split(';')[0];
      rows = parseRows(html);
      const expectedFirst = (page - 1) * PAGE_SIZE + 1;
      if (rows.length > 0 && Math.abs(rows[0].position - expectedFirst) < PAGE_SIZE) break;
      await sleep(1500);
    }
    rows.forEach((row) => all.set(row.position, row));
    if (onProgress) onProgress({ page, maxPage, rowsTotal: all.size });
    await sleep(REQUEST_DELAY_MS);
  }

  return [...all.values()].sort((a, b) => a.position - b.position);
}

/** Serialize rows to CSV (inner quotes doubled per RFC 4180). */
export function rowsToCsv(rows) {
  const lines = ['position,code,media,bucket,school'];
  for (const row of rows) {
    const bucket = classifySchool(row.school);
    const school = `"${row.school.replace(/"/g, '""')}"`;
    lines.push(`${row.position},${row.code},${row.media.toFixed(2)},${bucket},${school}`);
  }
  return lines.join('\n');
}

/** Parse the CSV written by rowsToCsv back into row objects. */
export function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const match = line.match(/^(\d+),([^,]*),([\d.]+),([A-Z_]+),"(.*)"$/);
    if (!match) continue;
    rows.push({
      position: parseInt(match[1], 10),
      code: match[2],
      media: parseFloat(match[3]),
      bucket: match[4],
      school: match[5].replace(/""/g, '"'),
    });
  }
  return rows;
}

export function writeCsv(rows) {
  fs.writeFileSync(CSV_PATH, rowsToCsv(rows), 'utf8');
}

export function readCsv() {
  if (!fs.existsSync(CSV_PATH)) return null;
  return {
    rows: parseCsv(fs.readFileSync(CSV_PATH, 'utf8')),
    updatedAt: fs.statSync(CSV_PATH).mtime.toISOString(),
  };
}

/** Rows enriched with bucket + vocational track, as served to the UI. */
export function enrichRows(rows) {
  return rows.map((row) => ({
    position: row.position,
    code: row.code,
    media: row.media,
    bucket: row.bucket || classifySchool(row.school),
    track: vocationalTrack(row.school),
    school: row.school,
  }));
}

/**
 * Static snapshot for the GitHub Pages build: the online page has no API, so
 * it loads docs/data.json instead. Rewritten on every scrape/refresh.
 */
export function writeDataJson(rows, updatedAt = new Date().toISOString()) {
  const payload = { updatedAt, staticSnapshot: true, rows: enrichRows(rows) };
  fs.writeFileSync(DATA_JSON_PATH, JSON.stringify(payload), 'utf8');
  return payload;
}

function printSummary(rows, targetPosition) {
  const above = rows.filter((row) => row.position < targetPosition);

  const bucketCounts = {};
  const localityCounts = {};
  for (const row of above) {
    const bucket = classifySchool(row.school);
    bucketCounts[bucket] = (bucketCounts[bucket] || 0) + 1;
    if (bucket === 'FAR_TOWN' || bucket === 'FAR_RURAL') {
      const locality = extractLocality(row.school);
      localityCounts[locality] = (localityCounts[locality] || 0) + 1;
    }
  }

  console.log(`=== Candidates ranked above position ${targetPosition}: ${above.length} ===`);
  for (const [bucket, count] of Object.entries(bucketCounts).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / above.length) * 100).toFixed(1);
    console.log(`  ${bucket.padEnd(20)} ${String(count).padStart(5)}  (${pct}%)`);
  }

  console.log('\n=== Non-Craiova share per band ===');
  for (let start = 1; start < targetPosition; start += 200) {
    const end = Math.min(start + 199, targetPosition - 1);
    const band = above.filter((row) => row.position >= start && row.position <= end);
    if (band.length === 0) continue;
    const nonCraiova = band.filter((row) => {
      const bucket = classifySchool(row.school);
      return bucket !== 'CRAIOVA' && bucket !== 'NEAR_CRAIOVA';
    }).length;
    const pct = ((nonCraiova / band.length) * 100).toFixed(1);
    console.log(`  ${String(start).padStart(4)}-${String(end).padEnd(4)}  non-Craiova: ${nonCraiova}/${band.length} (${pct}%)`);
  }

  console.log('\n=== Vocational-origin candidates above target (likely OUTSIDE repartition) ===');
  const trackRows = {};
  for (const row of above) {
    const track = vocationalTrack(row.school);
    if (track) (trackRows[track] ||= []).push(row);
  }
  if (Object.keys(trackRows).length === 0) {
    console.log('  (none detected)');
  }
  for (const [track, list] of Object.entries(trackRows).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${track.padEnd(10)} ${String(list.length).padStart(3)} candidates`);
    console.log(`    positions: ${list.map((r) => r.position).join(', ')}`);
  }
  console.log('  MILITAR: not detectable from origin data (no gimnaziu at the military college);');
  console.log('  use the manual estimate below.');

  let estimatedLeak = 0;
  for (const [bucket, count] of Object.entries(bucketCounts)) {
    estimatedLeak += count * (LEAK_RATES[bucket] ?? 0);
  }
  console.log('\n=== Geographic + vocational-hint leakage estimate ===');
  console.log(`  Estimated non-competitors above target: ~${Math.round(estimatedLeak)}`);
  console.log(`  Effective position: ~${targetPosition - Math.round(estimatedLeak)}`);
  console.log('  NOTE: add separately ~50-90 military college admits and');
  console.log('  ~60-90 vocational (pedagogic/arts) admits not visible in this data.');

  console.log('\n=== Top non-Craiova localities above target ===');
  const topLocalities = Object.entries(localityCounts).sort((a, b) => b[1] - a[1]).slice(0, 15);
  for (const [locality, count] of topLocalities) {
    console.log(`  ${locality.padEnd(35)} ${count}`);
  }
}

async function cli() {
  const maxPage = parseInt(process.argv[2] || '75', 10);
  const targetArg = process.argv[3] || '1182';
  const targetCode = /^[A-Z]{2}\d+$/i.test(targetArg) ? targetArg.toUpperCase() : null;

  console.log(`Scraping Dolj hierarchy: pages 1..${maxPage} (positions 1..${maxPage * PAGE_SIZE})`);
  const rows = await scrapeHierarchy({
    maxPage,
    onProgress: ({ page, rowsTotal }) => {
      process.stdout.write(`  page ${page}: total ${rowsTotal} rows\r`);
    },
  });
  console.log('');

  let targetPosition = targetCode ? null : parseInt(targetArg, 10);
  if (targetCode) {
    const match = rows.find((row) => row.code === targetCode);
    if (match) {
      targetPosition = match.position;
      console.log(
        `Target candidate ${targetCode}: position ${match.position}, media ${match.media.toFixed(2)} (${match.school})`
      );
    } else {
      targetPosition = 1182;
      console.warn(
        `Target code ${targetCode} not found in scraped range (1..${maxPage * PAGE_SIZE}); falling back to position ${targetPosition}`
      );
    }
  }

  writeCsv(rows);
  writeDataJson(rows);
  console.log(`Wrote dolj-hierarchy.csv + docs/data.json (${rows.length} rows)\n`);
  printSummary(rows, targetPosition);
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  cli().catch((error) => {
    console.error('Fatal:', error.message);
    process.exit(1);
  });
}
