/**
 * compare-periods.ts — the one place that compares two measurement windows.
 *
 * NOT YET WIRED TO ANYTHING. Built ahead of the 2026-10-15 boundary so that
 * landing it is a wiring job rather than a build. Nothing imports this yet.
 *
 * WHY THIS EXISTS. Comparison is what this practice sells and it was the least
 * centralized thing in the code. Five surfaces each computed their own
 * period-over-period delta: the weekly brief, the monthly memo, the readout,
 * Atlas and the weekly digest. Each got it wrong in its own way, and fixing one
 * never reduced the others.
 *
 * FOUR CONFOUNDS, all measured on 2026-09-27 and all first attributed wrongly
 * from memory before anyone looked at the rows:
 *
 *   1. The question SET changed. hawaii-theatre measured 34 questions in
 *      August and 29 in September with 22 shared. Month totals compared
 *      different sets.
 *   2. Run VOLUME changed on the same questions. The weekly brief compared
 *      4,203 runs against 3,255 over an identical 88 questions and published
 *      "citations fell 30%".
 *   3. The engine MIX changed. openai cites least and had been failing, so its
 *      recovery took it from 322 runs to 472 between two weeks and dragged a
 *      pooled rate down with no surface changing.
 *   4. The engine IMPLEMENTATION changed. Perplexity moved to the Agent API on
 *      2026-08-23. hawaii-theatre's Perplexity rate ran 58-62% through 08-19
 *      and 27-48% from 08-24. A step at the migration, not at the month
 *      boundary. This one nearly reached a client as "you are down 17 points".
 *
 * Confounds 1 to 3 are visible in the data. Confound 4 is NOT: nothing records
 * that we changed an adapter. That is why `events` is an input here rather than
 * something this module could derive.
 *
 * THE DESIGN RULE. Every defect above was a CORRECT NUMBER rendered into a
 * FALSE SENTENCE. So this module does not return a bare delta a caller can
 * print. It returns a Movement that is either `stated` or `withheld`, and a
 * caller cannot reach the numbers without handling the refusal. Making the
 * false sentence unrepresentable is the whole point, not documenting the rule.
 */

import { engineLayer, isControlEngine } from "./engine-layer";

/**
 * A surface's layer for comparison purposes. This adds "control" as a first
 * class case, which engine-layer.ts deliberately keeps separate from its two
 * measurement layers: Bing organic still has runs and still has a denominator,
 * it just may never appear in anything described as AI behaviour.
 */
export type CompareLayer = "citation" | "model_knowledge" | "control" | "unknown";

/**
 * Either a movement or a refusal to state one. There is no third case and no
 * way to read the numbers without acknowledging which you have.
 */
export type Movement =
  | { kind: "stated"; prevRate: number; curRate: number; deltaPp: number }
  | { kind: "withheld"; reason: string };

/** An instrument change. Supplied by the caller; this module cannot derive it. */
export interface InstrumentEvent {
  occurred_at: number;
  kind: string;
  /** "global" affects every surface, "engine" only the named one, "client" one client. */
  scope: "global" | "engine" | "client";
  engine?: string | null;
  client_slug?: string | null;
  detail: string;
}

/** Raw counts for one surface across both windows, over the SHARED questions. */
export interface SurfaceCounts {
  engine: string;
  prevRuns: number;
  prevHits: number;
  curRuns: number;
  curHits: number;
}

export interface SurfaceComparison extends SurfaceCounts {
  layer: CompareLayer;
  movement: Movement;
  /** Fractional change in this surface's own run count. Mix, not performance. */
  runSkew: number;
}

export interface ComparisonInput {
  /** Questions measured in BOTH windows. Zero means there is no comparison. */
  sharedKeywords: number;
  perSurface: SurfaceCounts[];
  curWindow: { start: number; end: number };
  prevWindow: { start: number; end: number };
  /** Instrument changes overlapping either window. Default none. */
  events?: InstrumentEvent[];
}

export interface ComparisonResult {
  basis: {
    sharedKeywords: number;
    /** Non-control runs only. The control is not part of any pooled figure. */
    curRuns: number;
    prevRuns: number;
    volumeSkew: number;
  };
  perSurface: SurfaceComparison[];
  /**
   * Pooled per LAYER, never across layers. A citation share and a share of
   * answers-that-name-you have different numerators and different denominators.
   * Putting them on one scale is itself the claim that they are comparable, and
   * engine-layer.ts exists because that claim already shipped once.
   */
  pooled: Record<"citation" | "model_knowledge", Movement>;
  /** Surfaces that moved at least 2 points. Never contains the control. */
  movedSurfaces: string[];
  events: InstrumentEvent[];
}

/** Aggregate run volume gap above which a pooled figure is not stated. */
export const VOLUME_SKEW_LIMIT = 0.10;
/**
 * A single surface's run-count swing above which the pooled figure for its
 * layer is not stated, even when the aggregate looks stable.
 *
 * Aggregate skew alone misses the mix shift that actually happened: in the week
 * of 2026-09-14 the citation layer moved 1,521 runs to 1,622, a calm 6.6%,
 * while openai inside it went 322 to 472, a 47% swing on the lowest-citing
 * surface. The pooled rate fell and no surface had changed.
 */
export const SURFACE_MIX_LIMIT = 0.20;
/** Movement below this is reported as flat rather than as a direction. */
export const FLAT_PP = 2;

const rate = (hits: number, runs: number): number | null =>
  runs > 0 ? (hits / runs) * 100 : null;

const skew = (prev: number, cur: number): number =>
  prev > 0 ? Math.abs(cur - prev) / prev : cur > 0 ? Infinity : 0;

function layerOf(engine: string): CompareLayer {
  // Control is checked FIRST. Bing sits inside LAYER1_ENGINE_KEYS because it
  // produces cited URLs and needs its own denominator, so asking engineLayer()
  // first would classify the control as citation-grade.
  if (isControlEngine(engine)) return "control";
  const l = engineLayer(engine);
  return l === "unknown" ? "unknown" : l;
}

/** Events that bear on a given surface: global ones, plus its own. */
function eventsFor(engine: string, events: InstrumentEvent[]): InstrumentEvent[] {
  return events.filter(
    (e) => e.scope === "global" || e.scope === "client" || (e.scope === "engine" && e.engine === engine),
  );
}

/**
 * Compare two windows. Pure: all measurement is passed in, nothing is fetched.
 *
 * Kept free of the database on purpose. Every case this module has to get right
 * is a specific set of counts whose correct answer is already known by hand,
 * and a pure function is the only shape those cases can be pinned as tests.
 */
export function computeComparison(input: ComparisonInput): ComparisonResult {
  const events = input.events ?? [];

  // A comparison with no shared question is not a weak comparison, it is not a
  // comparison. Everything downstream is withheld rather than zeroed.
  const noSharedBasis = input.sharedKeywords <= 0;

  const perSurface: SurfaceComparison[] = input.perSurface.map((s) => {
    const layer = layerOf(s.engine);
    const prevRate = rate(s.prevHits, s.prevRuns);
    const curRate = rate(s.curHits, s.curRuns);
    const runSkew = skew(s.prevRuns, s.curRuns);
    const own = eventsFor(s.engine, events);

    let movement: Movement;
    if (noSharedBasis) {
      movement = { kind: "withheld", reason: "no question was measured in both windows" };
    } else if (prevRate === null || curRate === null) {
      // A window with no runs is not a 0% rate. Reporting it as one is how an
      // absence became a value seven separate times in this codebase.
      movement = {
        kind: "withheld",
        reason: `not measured in ${prevRate === null ? "the prior" : "this"} window, so it has no rate there`,
      };
    } else if (own.length > 0) {
      const e = own[0];
      movement = {
        kind: "withheld",
        reason: `an instrument change lands inside the window (${e.kind}: ${e.detail})`,
      };
    } else {
      movement = { kind: "stated", prevRate, curRate, deltaPp: curRate - prevRate };
    }

    return { ...s, layer, movement, runSkew };
  });

  const nonControl = perSurface.filter((s) => s.layer !== "control");
  const basisPrev = nonControl.reduce((a, s) => a + s.prevRuns, 0);
  const basisCur = nonControl.reduce((a, s) => a + s.curRuns, 0);

  const pooled = {
    citation: pooledFor("citation", perSurface, events, noSharedBasis),
    model_knowledge: pooledFor("model_knowledge", perSurface, events, noSharedBasis),
  };

  // The control is excluded whatever it does. "A surface that moved" reads as
  // an AI tool changing behaviour, and the control is not one. Its own numbers
  // still travel in perSurface.
  const movedSurfaces = perSurface
    .filter((s) => s.layer !== "control" && s.movement.kind === "stated" && Math.abs(s.movement.deltaPp) >= FLAT_PP)
    .map((s) => {
      const m = s.movement as Extract<Movement, { kind: "stated" }>;
      return `${s.engine} ${m.deltaPp >= 0 ? "up" : "down"} ${Math.abs(m.deltaPp).toFixed(1)}pp`;
    });

  return {
    basis: {
      sharedKeywords: input.sharedKeywords,
      curRuns: basisCur,
      prevRuns: basisPrev,
      volumeSkew: skew(basisPrev, basisCur),
    },
    perSurface,
    pooled,
    movedSurfaces,
    events,
  };
}

function pooledFor(
  layer: "citation" | "model_knowledge",
  perSurface: SurfaceComparison[],
  events: InstrumentEvent[],
  noSharedBasis: boolean,
): Movement {
  if (noSharedBasis) {
    return { kind: "withheld", reason: "no question was measured in both windows" };
  }

  const members = perSurface.filter((s) => s.layer === layer);
  if (members.length === 0) {
    return { kind: "withheld", reason: `no ${layer.replace("_", " ")} surface was measured` };
  }

  const prevRuns = members.reduce((a, s) => a + s.prevRuns, 0);
  const curRuns = members.reduce((a, s) => a + s.curRuns, 0);
  const prevRate = rate(members.reduce((a, s) => a + s.prevHits, 0), prevRuns);
  const curRate = rate(members.reduce((a, s) => a + s.curHits, 0), curRuns);
  if (prevRate === null || curRate === null) {
    return { kind: "withheld", reason: `this layer has no runs in ${prevRate === null ? "the prior" : "this"} window` };
  }

  // Any instrument change touching a contributing surface poisons the pool,
  // even though each unaffected surface can still speak for itself.
  for (const s of members) {
    const own = eventsFor(s.engine, events);
    if (own.length > 0) {
      return {
        kind: "withheld",
        reason: `an instrument change affects ${s.engine} inside the window (${own[0].kind}: ${own[0].detail})`,
      };
    }
  }

  const aggSkew = skew(prevRuns, curRuns);
  if (aggSkew >= VOLUME_SKEW_LIMIT) {
    return {
      kind: "withheld",
      reason: `we ran ${Math.round(aggSkew * 100)}% ${curRuns < prevRuns ? "fewer" : "more"} queries on this layer than last period, so the count difference is our coverage and not the market`,
    };
  }

  const mixed = members.find((s) => s.runSkew >= SURFACE_MIX_LIMIT);
  if (mixed) {
    return {
      kind: "withheld",
      reason: `${mixed.engine}'s own run count moved ${Math.round(mixed.runSkew * 100)}%, so the balance between surfaces changed and part of any pooled move is that mix`,
    };
  }

  // Surfaces disagreeing in direction average to a number that describes none
  // of them. Report them individually instead.
  const stated = members
    .map((s) => s.movement)
    .filter((m): m is Extract<Movement, { kind: "stated" }> => m.kind === "stated");
  const anyUp = stated.some((m) => m.deltaPp >= FLAT_PP);
  const anyDown = stated.some((m) => m.deltaPp <= -FLAT_PP);
  if (anyUp && anyDown) {
    return {
      kind: "withheld",
      reason: "surfaces on this layer moved in opposite directions, so a pooled figure describes none of them",
    };
  }

  return { kind: "stated", prevRate, curRate, deltaPp: curRate - prevRate };
}

/**
 * Render a Movement for a human. Exists so no caller has to reach into the
 * union and re-invent the sentence, which is where the false sentences came
 * from in the first place.
 */
export function describeMovement(m: Movement, subject: string): string {
  if (m.kind === "withheld") return `${subject}: no movement can be stated because ${m.reason}.`;
  const dir = Math.abs(m.deltaPp) < FLAT_PP ? "flat" : m.deltaPp > 0 ? "up" : "down";
  const size = dir === "flat" ? "" : ` ${Math.abs(m.deltaPp).toFixed(1)} percentage points`;
  return `${subject}: ${m.prevRate.toFixed(1)}% to ${m.curRate.toFixed(1)}%, ${dir}${size}.`;
}
