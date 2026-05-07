// Animated hero: the HTP42 lemniscate (∞) drawn in motion, with data
// particles travelling its full length and a 3-D cube rotating at the
// crossover point. Data / AI vibe. SMIL animations for the SVG bits and
// CSS 3-D for the cube — no JS, no client component needed.
//
// SAFE on server: all motion is declarative (SMIL + CSS @keyframes).

const LEMNI =
  "M120 100 c0 -36 24 -60 54 -60 s54 24 66 60 c12 36 36 60 66 60 s54 -24 54 -60 s-24 -60 -54 -60 s-54 24 -66 60 c-12 36 -36 60 -66 60 s-54 -24 -54 -60 z";

export function HeroInfinity({ name }: { name: string }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-sky-50/40 to-violet-50/40 px-6 py-10 sm:px-10 sm:py-14">
      {/* Subtle dot grid background */}
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
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 ring-1 ring-emerald-100">Pharma</span>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700 ring-1 ring-brand-100">Data</span>
            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700 ring-1 ring-violet-100">AI</span>
          </div>
        </div>

        {/* Animation — sized via aspect ratio so it scales nicely */}
        <div className="relative h-[200px] w-full sm:h-[220px] sm:w-[440px]">
          <svg
            viewBox="0 0 480 200"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="lemni-stroke" x1="0" x2="1">
                <stop offset="0" stopColor="#60a5fa" />
                <stop offset=".5" stopColor="#1E91F9" />
                <stop offset="1" stopColor="#a78bfa" />
              </linearGradient>
              <radialGradient id="hero-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0" stopColor="#1E91F9" stopOpacity="0.18" />
                <stop offset="1" stopColor="#1E91F9" stopOpacity="0" />
              </radialGradient>
              <filter id="soft-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2" />
              </filter>
            </defs>

            {/* Glow halo behind everything */}
            <rect x="0" y="0" width="480" height="200" fill="url(#hero-glow)" />

            {/* Faint reference loop (fixed) */}
            <path
              d={LEMNI}
              fill="none"
              stroke="rgba(30,145,249,0.18)"
              strokeWidth="1"
            />

            {/* Animated stroke — draws and erases the loop */}
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

            {/* Definition of the path used by motion elements below */}
            <path id="hero-lemni-path" d={LEMNI} fill="none" stroke="none" />

            {/* Glow sphere following the path */}
            <circle r="6" fill="#1E91F9" opacity="0.35" filter="url(#soft-glow)">
              <animateMotion dur="5s" repeatCount="indefinite" rotate="auto">
                <mpath href="#hero-lemni-path" />
              </animateMotion>
            </circle>

            {/* Crisp data particles travelling at staggered offsets */}
            <Dot color="#1E91F9" begin="0s" />
            <Dot color="#a78bfa" begin="-1.25s" />
            <Dot color="#60a5fa" begin="-2.5s" />
            <Dot color="#34d399" begin="-3.75s" />
          </svg>

          {/* Pharma motif at the visual centre — a slowly-rotating molecule
              (benzene ring with a side group). Smaller than the previous
              cube and makes the data + AI + pharma story explicit. */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Molecule />
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

// Pharma motif: a benzene ring (6 atoms in a hexagon) with a small side
// group, gently rotating. Atoms pulse subtly to suggest computation /
// signal flow. Smaller than the previous cube so it doesn't dominate.
function Molecule() {
  // Hexagon vertices around (0,0), radius 14.
  const r = 14;
  const verts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return [Math.round(Math.cos(a) * r * 100) / 100, Math.round(Math.sin(a) * r * 100) / 100] as const;
  });
  // Side group: one extra atom hanging off the top vertex (vertex 0).
  const side = [verts[0][0], verts[0][1] - 10] as const;

  const css = `
    @keyframes htp42-mol-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }
    .htp42-mol-scene { display: inline-block; }
    .htp42-mol-atom { animation: htp42-mol-pulse 2.6s ease-in-out infinite; }
    .htp42-mol-atom:nth-child(2) { animation-delay: -0.4s; }
    .htp42-mol-atom:nth-child(3) { animation-delay: -0.8s; }
    .htp42-mol-atom:nth-child(4) { animation-delay: -1.2s; }
    .htp42-mol-atom:nth-child(5) { animation-delay: -1.6s; }
    .htp42-mol-atom:nth-child(6) { animation-delay: -2.0s; }
  `;

  // Bond pairs (alternating, mimicking aromatic ring).
  const ringBonds = verts.map((_, i) => [i, (i + 1) % 6] as const);

  return (
    <div className="htp42-mol-scene">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <svg viewBox="-22 -22 44 44" width="68" height="68" className="block">
        <defs>
          <radialGradient id="mol-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#1E91F9" stopOpacity="0.35" />
            <stop offset="1" stopColor="#1E91F9" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="0" cy="0" r="22" fill="url(#mol-glow)" />
        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0"
            to="360"
            dur="22s"
            repeatCount="indefinite"
          />
          {/* Side bond + atom (functional group) */}
          <line
            x1={verts[0][0]}
            y1={verts[0][1]}
            x2={side[0]}
            y2={side[1]}
            stroke="#a78bfa"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <circle cx={side[0]} cy={side[1]} r="2.6" fill="#a78bfa" />

          {/* Aromatic inner circle (signals "ring" without alternating double bonds) */}
          <circle cx="0" cy="0" r={r - 4} fill="none" stroke="#1E91F9" strokeWidth="0.8" opacity="0.55" />

          {/* Ring bonds */}
          {ringBonds.map(([a, b], i) => (
            <line
              key={i}
              x1={verts[a][0]}
              y1={verts[a][1]}
              x2={verts[b][0]}
              y2={verts[b][1]}
              stroke="#1E91F9"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          ))}

          {/* Ring atoms */}
          {verts.map(([x, y], i) => (
            <circle
              key={i}
              className="htp42-mol-atom"
              cx={x}
              cy={y}
              r="3"
              fill="#1E91F9"
              stroke="white"
              strokeWidth="1"
            />
          ))}
        </g>
      </svg>
    </div>
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
