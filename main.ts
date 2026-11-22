// pre-token-radar: reads the sealed DefiLlama snapshot, ranks every protocol
// that records no token by what a launch would be worth, and hands in the
// board, the no-network dashboard that shows it, the screenshots of the page
// and the dossier the judge reads.
//
//   node main.ts --input /input/snapshot.json --output /output
//
// The scoring model lives in lib/model.ts and is stated on the dashboard
// beside every row; the farm plans are derived from each protocol's own
// chains, category, TVL tier and age in the same file.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SnapshotError, buildBoard, buildRadar } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

// The scorer's own caps: the text cap shapes what the judge reads, the rest refuse.
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
const out = arg('output', '/output');

let snapshot;
try {
  snapshot = JSON.parse(readFileSync(inputFile, 'utf8'));
} catch (error) {
  process.stderr.write(`pre-token radar: cannot read the snapshot at ${inputFile}: ${(error as Error).message}\n`);
  process.exit(2);
}

let board;
let radar;
try {
  radar = buildRadar(snapshot);
  board = buildBoard(snapshot);
} catch (error) {
  if (error instanceof SnapshotError) {
    process.stderr.write(`pre-token radar: ${error.message}\n`);
    process.exit(1);
  }
  throw error;
}

// The gate's own rows, checked here before anything ships: the ranks run
// 1..n exactly once, the implied value never rises with the rank, every
// watchlist slug is covered and every row carries a farm plan.
const rankError = (() => {
  const seen = new Set<number>();
  let previous = Number.POSITIVE_INFINITY;
  for (const row of board) {
    if (seen.has(row.rank)) return `rank ${row.rank} appears twice`;
    seen.add(row.rank);
    if (row.implied_value_usd > previous) return `rank ${row.rank} is worth more than the rank before it`;
    previous = row.implied_value_usd;
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3) return `rank ${row.rank} carries fewer than three farm steps`;
  }
  for (let i = 1; i <= board.length; ++i) {
    if (!seen.has(i)) return `rank ${i} is missing`;
  }
  return null;
})();
if (rankError !== null) {
  process.stderr.write(`pre-token radar: the model wrote a board the gate refuses: ${rankError}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), `window.RADAR = ${JSON.stringify(radar)};\n`);

// Copies one directory's regular files into `to`, skipping dotted names.
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    if (!IMAGE_NAME.test(name)) {
      process.stderr.write(`pre-token radar: ${path}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
      process.exit(1);
    }
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`pre-token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}

// The dossier is written last: the scorer rebuilds it from this /output and
// compares bytes, so it must be exactly what the vendored library writes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS }),
);

const top = board[0]!;
process.stdout.write(
  `pre-token radar: ${radar.rows.length} rows (watchlist ${radar.watchlist_size}, early ${radar.early_size}, live aside ${radar.live_size}); ` +
  `rank 1 ${top.name} at $${top.implied_value_usd.toLocaleString('en-US')} implied; ` +
  `wrote board.json, data.js, dashboard/, ${shots.length} screenshots and dossier.json to ${out}\n`,
);
