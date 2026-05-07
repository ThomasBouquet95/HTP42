"use client";

// Animated hero: the HTP42 lemniscate (∞) drawn in motion, with data
// particles travelling its full length and a horizontal DNA double helix
// rotating around its long axis at the centre. Brand-blue palette matches
// the logo. The lemniscate stroke + travelling particles are SMIL; the
// helix is JS-driven for smooth, true-3D rotation.

import { useEffect, useRef, useState } from "react";

const LEMNI =
  "M120 100 c0 -36 24 -60 54 -60 s54 24 66 60 c12 36 36 60 66 60 s54 -24 54 -60 s-24 -60 -54 -60 s-54 24 -66 60 c-12 36 -36 60 -66 60 s-54 -24 -54 -60 z";

export function HeroInfinity({ name }: { name: string }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-sky-50/40 to-brand-50/40 px-6 py-10 sm:px-10 sm:py-14">
      <DotGrid />

      <div className="relative grid items-center gap-8 sm:grid-cols-[1fr,auto]">
        <div className="max-w-xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700/70">
            HealthTech Partners 42
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold text-slate-900">
            Welcome back, <span className="text-brand-600">{name || "team"}</span>.
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            A consulting network for data and AI in pharma.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-wider">
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700 ring-1 ring-brand-100">Pharma</span>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700 ring-1 ring-brand-100">Data</span>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700 ring-1 ring-brand-100">AI</span>
          </div>
        </div>

        <div className="relative h-[200px] w-full sm:h-[220px] sm:w-[440px]">
          <svg
            viewBox="0 0 480 200"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="lemni-stroke" x1="0" x2="1">
                <stop offset="0" stopColor="#7abeff" />
                <stop offset=".5" stopColor="#1E91F9" />
                <stop offset="1" stopColor="#0d5ca6" />
              </linearGradient>
              <radialGradient id="hero-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0" stopColor="#1E91F9" stopOpacity="0.18" />
                <stop offset="1" stopColor="#1E91F9" stopOpacity="0" />
              </radialGradient>
              <filter id="soft-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2" />
              </filter>
            </defs>

            <rect x="0" y="0" width="480" height="200" fill="url(#hero-glow)" />

            <path d={LEMNI} fill="none" stroke="rgba(30,145,249,0.18)" strokeWidth="1" />

            <path
              d={LEMNI}
              fill="none"
              stroke="url(#lemni-stroke)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeDasharray="180 720"
            >
              <animate
                attributeName="stroke-dashoffset"
                from="0"
                to="-900"
                dur="9s"
                repeatCount="indefinite"
              />
            </path>

            <path id="hero-lemni-path" d={LEMNI} fill="none" stroke="none" />

            <circle r="6" fill="#1E91F9" opacity="0.32" filter="url(#soft-glow)">
              <animateMotion dur="5s" repeatCount="indefinite" rotate="auto">
                <mpath href="#hero-lemni-path" />
              </animateMotion>
            </circle>

            {/* Brand-blue particles only — drops the previous emerald/violet
                so the whole hero stays on the logo's palette. */}
            <Dot color="#1E91F9" begin="0s" />
            <Dot color="#7abeff" begin="-1.25s" />
            <Dot color="#0d5ca6" begin="-2.5s" />
            <Dot color="#4ca8ff" begin="-3.75s" />
          </svg>

          {/* Horizontal DNA helix rotating around its long axis. JS-driven
              for smooth, mathematically correct 3-D rotation. */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <DnaHorizontal />
          </div>
        </div>
      </div>
    </section>
  );
}

function Dot({ color, begin }: { color: string; begin: string }) {
  return (
    <circle r="3" fill={color}>
      <animateMotion dur="5s" begin={begin} repeatCount="indefinite">
        <mpath href="#hero-lemni-path" />
      </animateMotion>
      <animate
        attributeName="r"
        values="2.5;3.5;2.5"
        dur="2.5s"
        begin={begin}
        repeatCount="indefinite"
      />
    </circle>
  );
}

// JS-driven 3-D helix. Each frame we recompute the strands and rungs as
// a 2-D projection of a cylinder rotating around the X axis. Per-segment
// opacity + stroke-width follow the depth (z) so points behind the
// cylinder fade and thin out — gives genuine depth rather than a flat
// scaleX flip. Brand-blue palette throughout.
function DnaHorizontal() {
  const ref = useRef<SVGSVGElement>(null);
  const phaseRef = useRef(0);
  const [, setTick] = useState(0);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = t - last;
      last = t;
      // ~0.45 turns per second; gentle enough to read as elegant, not frantic.
      phaseRef.current = (phaseRef.current + dt * 0.0028) % (Math.PI * 2);
      setTick((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Geometry — local SVG coordinates, viewBox -W/2..+W/2 horizontally.
  const W = 160; // helix length
  const R = 16; // helix radius (vertical extent of the rendered helix)
  const SEG = 64; // strand segments
  const NUM_BASES = 12;
  const PERIOD = 80; // px for one full helix turn

  // Brand palette (matches tailwind.config.ts → colors.brand)
  const STRAND_A = "#1E91F9"; // brand-500
  const STRAND_B = "#0d5ca6"; // brand-800
  const RUNG_LIGHT = "#7abeff"; // brand-300
  const RUNG_DARK = "#1474d0"; // brand-700

  const phase = phaseRef.current;
  function strandSegments(strandPhase: number) {
    const segs: Array<{
      x1: number; y1: number; z1: number;
      x2: number; y2: number; z2: number;
    }> = [];
    let prev: { x: number; y: number; z: number } | null = null;
    for (let i = 0; i <= SEG; i++) {
      const x = (i / SEG) * W - W / 2;
      const angle = (2 * Math.PI * x) / PERIOD + phase + strandPhase;
      const y = R * Math.sin(angle);
      const z = R * Math.cos(angle);
      if (prev) segs.push({ x1: prev.x, y1: prev.y, z1: prev.z, x2: x, y2: y, z2: z });
      prev = { x, y, z };
    }
    return segs;
  }
  const segsA = strandSegments(0);
  const segsB = strandSegments(Math.PI);

  // Depth → opacity (1 in front, ~0.3 behind) and stroke width.
  const depth = (z: number) => (z + R) / (2 * R); // 0..1
  const opacity = (z: number) => 0.35 + depth(z) * 0.65;
  const strokeWidth = (z: number) => 1.4 + depth(z) * 1.4;

  // Rungs: each connects strand A and strand B at the same x.
  const rungs: Array<{
    x: number; yA: number; yB: number; zA: number; zB: number; color: string;
  }> = [];
  for (let i = 0; i < NUM_BASES; i++) {
    const t = (i + 0.5) / NUM_BASES;
    const x = t * W - W / 2;
    const angle = (2 * Math.PI * x) / PERIOD + phase;
    const yA = R * Math.sin(angle);
    const zA = R * Math.cos(angle);
    const yB = -yA;
    const zB = -zA;
    rungs.push({
      x,
      yA,
      yB,
      zA,
      zB,
      color: i % 2 ? RUNG_DARK : RUNG_LIGHT,
    });
  }

  // Render strands segment-by-segment, sorted so segments with smaller
  // average z draw first (i.e. behind), front segments draw on top.
  const allSegs: Array<{
    x1: number; y1: number; x2: number; y2: number; avgZ: number;
    color: string;
  }> = [];
  for (const s of segsA) allSegs.push({ ...s, avgZ: (s.z1 + s.z2) / 2, color: STRAND_A });
  for (const s of segsB) allSegs.push({ ...s, avgZ: (s.z1 + s.z2) / 2, color: STRAND_B });
  allSegs.sort((a, b) => a.avgZ - b.avgZ);

  return (
    <svg
      ref={ref}
      viewBox={`-${W / 2 + 6} -${R + 6} ${W + 12} ${R * 2 + 12}`}
      width={W + 12}
      height={R * 2 + 12}
      aria-hidden
    >
      <defs>
        <radialGradient id="dna-h-glow" cx="50%" cy="50%" r="60%">
          <stop offset="0" stopColor="#1E91F9" stopOpacity="0.32" />
          <stop offset="1" stopColor="#1E91F9" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="0" cy="0" rx={W / 2} ry={R + 4} fill="url(#dna-h-glow)" />

      {/* Rungs first (behind the closer strand segments will draw on top of
          rungs that pass through; front rungs themselves stay strong). */}
      {rungs.map((r, i) => {
        const avgZ = (r.zA + r.zB) / 2;
        return (
          <line
            key={`rung-${i}`}
            x1={r.x}
            y1={r.yA}
            x2={r.x}
            y2={r.yB}
            stroke={r.color}
            strokeWidth={1.4 + depth(avgZ) * 1.0}
            opacity={0.4 + depth(avgZ) * 0.6}
            strokeLinecap="round"
          />
        );
      })}

      {/* Strand segments back-to-front for proper occlusion. */}
      {allSegs.map((s, i) => {
        const avgZ = s.avgZ;
        return (
          <line
            key={`seg-${i}`}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke={s.color}
            strokeWidth={strokeWidth(avgZ)}
            opacity={opacity(avgZ)}
            strokeLinecap="round"
          />
        );
      })}

      {/* Tiny base-pair dots at the ends of each rung, so the eye reads
          them as nucleotide nodes rather than empty line endpoints. */}
      {rungs.map((r, i) => (
        <g key={`bp-${i}`}>
          <circle cx={r.x} cy={r.yA} r={1.4 + depth(r.zA) * 0.6} fill="#1E91F9" opacity={opacity(r.zA)} />
          <circle cx={r.x} cy={r.yB} r={1.4 + depth(r.zB) * 0.6} fill="#0d5ca6" opacity={opacity(r.zB)} />
        </g>
      ))}
    </svg>
  );
}

function DotGrid() {
  const css = `
    .htp42-dotgrid {
      background-image: radial-gradient(circle, rgba(30,145,249,0.12) 1px, transparent 1px);
      background-size: 18px 18px;
      mask-image: linear-gradient(to bottom, transparent 0, #000 30%, #000 70%, transparent 100%);
      -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 30%, #000 70%, transparent 100%);
    }
  `;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="htp42-dotgrid pointer-events-none absolute inset-0" />
    </>
  );
}
