// pre-token-radar's scoring model.
//
// One sealed snapshot of the DefiLlama protocol index goes in; a ranked board
// of protocols that record no token yet goes out. Every number the board
// carries is derived from the snapshot's own figures — TVL, the seven-day TVL
// change and how long the protocol has been tracked without a token — by the
// formula stated below and rendered on the dashboard beside each row.
//
//   base       = tvl_usd x LAUNCH_MULTIPLE                 (a launch's floor valuation)
//   growthMult = 1 + clamp(change_7d, -60, +120)/100 x GROWTH_WEIGHT
//   ageMult    = AGE_FLOOR + min(age_days, AGE_CAP)/AGE_CAP x (1 - AGE_FLOOR)
//   implied    = max(1, round(base x growthMult x ageMult))
//
// age_days = as_of minus listed_at. When DefiLlama lists no listing date the
// model assumes UNKNOWN_AGE_DAYS. No protocol name is ever special-cased: the
// same function scores every row, and the page recomputes the same arithmetic
// so a reader can check the board against the code.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, stated on the dashboard and changeable in its sandbox. */
export interface ModelConstants {
  launch_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  age_floor: number;
  age_cap_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  launch_multiple: 0.25,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  age_floor: 0.6,
  age_cap_days: 1095,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it and board.json carries it. */
export const MODEL_VERSION = 'pre-token-radar-2';

/** Pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** Live-token protocols the separate market view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step as the gate stores it: one line, action then cost then time. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One ranked row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  token_status: 'pre-token';
  implied_value_usd: number;
  model: {
    launch_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    age_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact row, with the farm plan the drawer renders. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  growth_multiplier: number;
  age_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, shown apart at the market's value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs, written to data.js. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days between as_of and listed_at, clamped at zero; null when either date is missing. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The three factors and the implied value one protocol scores under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { implied: number; growthPct: number; growthMult: number; ageMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const growthPct = Math.min(
    model.growth_cap,
    Math.max(model.growth_floor, finite(protocol.change_7d, 0)),
  );
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const ageMult =
    model.age_floor +
    (Math.min(Math.max(ageForModel, 0), model.age_cap_days) / model.age_cap_days) *
      (1 - model.age_floor);
  const base = protocol.tvl_usd * model.launch_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * ageMult));
  return { implied, growthPct, growthMult, ageMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all (no market cap, no CoinGecko id, no symbol). */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether the board may rank it: pre-token, not an exchange product, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The farm plans: per-chain bridge and gas figures the steps quote. */
const CHAIN_GAS: Record<string, { bridge: string; gas: string }> = {
  Ethereum: { bridge: 'the canonical bridge or a native route', gas: '$4-14' },
  Base: { bridge: 'the official Base bridge', gas: 'under $0.10' },
  Arbitrum: { bridge: 'the official Arbitrum bridge', gas: 'under $0.20' },
  Optimism: { bridge: 'the official OP bridge', gas: 'under $0.15' },
  Polygon: { bridge: 'the Polygon PoS bridge', gas: 'under $0.05' },
  Solana: { bridge: 'a CEX withdrawal or deBridge', gas: 'under $0.02' },
  Binance: { bridge: 'the BNB Chain bridge', gas: 'under $0.15' },
  Sui: { bridge: 'the Sui native bridge or CEX withdrawal', gas: 'under $0.03' },
  Avalanche: { bridge: 'the Avalanche bridge', gas: 'under $0.30' },
  Hyperliquid: { bridge: 'a USDC deposit to the Hyperliquid L1', gas: 'under $1' },
  Ton: { bridge: 'a CEX withdrawal or the Ton bridge', gas: 'under $0.05' },
  Tron: { bridge: 'a CEX withdrawal', gas: 'under $2' },
};

function gasFor(chain: string): string {
  return (CHAIN_GAS[chain] ?? CHAIN_GAS.Ethereum).gas;
}
function bridgeFor(chain: string): string {
  return (CHAIN_GAS[chain] ?? CHAIN_GAS.Ethereum).bridge;
}

/** Position size from TVL: the deeper the protocol, the more a farming position can carry. */
function positionFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 250_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** The qualifying hold, from how long the protocol has run without a token. */
function holdFor(age: number | null): { days: number; note: string } {
  if (age === null) return { days: 45, note: 'no listing date is recorded, so hold through two monthly reviews' };
  if (age < 120) return { days: 75, note: 'young protocols snapshot early users, so hold the longest' };
  if (age < 365) return { days: 60, note: 'hold past the quarter boundary a points program would use' };
  return { days: 30, note: 'mature protocols reward activity, not tenure, so hold one cycle' };
}

/** The category's core action, in words a farmer can follow. */
function coreAction(p: SnapshotProtocol, usd: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('risk curator') || c.includes('curator') || c.includes('allocator'))
    return `Deposit $${usd} of USDC into a ${p.name} vault on ${chain} and leave the shares untouched`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Supply $${usd} of USDC as collateral to ${p.name} on ${chain} and keep the debt position small`;
  if (c.includes('dex') || c.includes('liquidity'))
    return `Provide $${usd} of two-sided liquidity to ${p.name}'s deepest pool on ${chain}`;
  if (c.includes('yield'))
    return `Deposit $${usd} of USDC into ${p.name}'s highest-TVL strategy on ${chain}`;
  if (c.includes('stable') || c.includes('cdp'))
    return `Mint or deposit $${usd} of the stable asset through ${p.name} on ${chain}`;
  if (c.includes('rwa'))
    return `Mint $${usd} of ${p.name}'s tokenized yield asset on ${chain} and hold it`;
  if (c.includes('perp') || c.includes('derivative'))
    return `Deposit $${usd} of USDC as margin on ${p.name} and trade one small position a week`;
  if (c.includes('basis') || c.includes('delta'))
    return `Run $${usd} through ${p.name}'s basis trade on ${chain} and leave the legs open`;
  if (c.includes('bridge'))
    return `Route $${usd} through ${p.name}'s bridge to ${chain} and use the receipt in its app`;
  if (c.includes('insurance'))
    return `Buy $${usd} of cover from ${p.name} on ${chain} and keep the policy to expiry`;
  if (c.includes('chain') || c.includes('infra'))
    return `Bridge $${usd} onto ${p.name}'s chain and use its native dapps weekly`;
  return `Deposit $${usd} of USDC into ${p.name} on ${chain} and keep the position open`;
}

/**
 * A protocol's farm plan: six steps derived from the protocol's own record —
 * its chains, its category, its TVL tier and its age — never a list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chains = p.chains.length > 0 ? p.chains.slice(0, 3) : ['its main chain'];
  const primary = chains[0]!;
  const usd = positionFor(p);
  const hold = holdFor(age);
  const gas = gasFor(primary);
  const steps: FarmStep[] = [
    {
      text: 'Open a fresh wallet used only for this position and keep its seed phrase offline; fund it with the position size plus gas.',
      cost: `about $${Math.max(2, Math.round(usd * 0.01))} to move funds in`,
      time: '10 minutes',
    },
    {
      text: `Bridge the position to ${primary} via ${bridgeFor(primary)}; the chain's typical transfer gas is ${gas}.`,
      cost: `${gas} in bridge and gas fees`,
      time: '5-30 minutes depending on the route',
    },
    {
      text: `${coreAction(p, usd, primary)}.`,
      cost: `$${usd} of capital plus ${gas} of interaction gas`,
      time: '15 minutes to set up',
    },
  ];
  if (chains.length > 1) {
    const second = chains[1]!;
    steps.push({
      text: `Repeat a smaller $${Math.round(usd / 3)} position on ${second} (gas ${gasFor(second)}) so the activity spans the protocol's chains.`,
      cost: `$${Math.round(usd / 3)} of capital`,
      time: '15 minutes',
    });
  }
  steps.push({
    text: `Keep the position alive for at least ${hold.days} days and interact once a week; ${hold.note}.`,
    cost: `${gas} a week of interaction gas`,
    time: `${hold.days} days, 5 minutes a week`,
  });
  steps.push({
    text: `Watch ${p.name}'s governance forum, X account and docs RSS for a token announcement; if one lands, claim through the official site only and never sign a seed-phrase request.`,
    cost: 'free',
    time: '10 minutes a week',
  });
  return steps;
}

const stepText = (step: FarmStep): string => {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
};

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The ranked board: every watchlist slug, the early radar, ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const s = impliedValue(p, snapshot.as_of, model);
    return { p, ...s };
  });
  scored.sort((x, y) => y.implied - x.implied || (x.p.slug < y.p.slug ? -1 : 1));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.age,
    on_watchlist: snapshot.watchlist.includes(s.p.slug),
    token_status: 'pre-token' as const,
    implied_value_usd: s.implied,
    model: {
      launch_multiple: model.launch_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      age_multiplier: round4(s.ageMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** The live-token set the dashboard shows apart, by market cap. */
export function buildLive(snapshot: Snapshot, cap = LIVE_ROWS): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, cap)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** The dashboard's data document. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): RadarData {
  const rows = buildBoard(snapshot, model);
  const live = buildLive(snapshot);
  return {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: rows.length,
    early_size: rows.filter((r) => !r.on_watchlist).length,
    live_size: live.length,
    rows: rows.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      listed_at: r.listed_at,
      age_days: r.age_days,
      on_watchlist: r.on_watchlist,
      implied_value_usd: r.implied_value_usd,
      growth_multiplier: r.model.growth_multiplier,
      age_multiplier: r.model.age_multiplier,
      farm_steps: r.farm_steps,
    })),
    live,
  };
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}
