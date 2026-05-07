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
            Data, AI, and a network that scales — keep the loop going.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-wider">
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-700 ring-1 ring-brand-100">Data</span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 ring-1 ring-emerald-100">AI</span>
            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700 ring-1 ring-violet-100">Network</span>
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

          {/* 3-D rotating cube fixed at the visual centre — pure CSS */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Cube />
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

// 6-face CSS 3-D cube. Rotates continuously on Y and X to feel alive.
function Cube() {
  const SIZE = 56; // cube edge in px
  const half = SIZE / 2;
  const face = (transform: string, gradient: string): React.CSSProperties => ({
    position: "absolute",
    width: SIZE,
    height: SIZE,
    background: gradient,
    border: "1px solid rgba(255,255,255,0.45)",
    boxShadow: "inset 0 0 8px rgba(255,255,255,0.18)",
    transform,
    transformOrigin: "center",
  });

  // Inline keyframes via a <style> tag so we don't need to touch globals.css.
  const css = `
    @keyframes htp42-cube-spin {
      0%   { transform: rotateX(-22deg) rotateY(0deg); }
      100% { transform: rotateX(-22deg) rotateY(360deg); }
    }
    .htp42-cube-scene { perspective: 600px; }
    .htp42-cube { transform-style: preserve-3d; animation: htp42-cube-spin 9s linear infinite; }
  `;

  return (
    <div className="htp42-cube-scene" style={{ width: SIZE, height: SIZE }}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div
        className="htp42-cube relative"
        style={{ width: SIZE, height: SIZE }}
      >
        {/* front */}
        <div style={face(`translateZ(${half}px)`, "linear-gradient(135deg,#3b82f6,#1E91F9)")} />
        {/* back */}
        <div style={face(`rotateY(180deg) translateZ(${half}px)`, "linear-gradient(135deg,#1E91F9,#60a5fa)")} />
        {/* right */}
        <div style={face(`rotateY(90deg) translateZ(${half}px)`, "linear-gradient(135deg,#a78bfa,#7c3aed)")} />
        {/* left */}
        <div style={face(`rotateY(-90deg) translateZ(${half}px)`, "linear-gradient(135deg,#60a5fa,#3b82f6)")} />
        {/* top */}
        <div style={face(`rotateX(90deg) translateZ(${half}px)`, "linear-gradient(135deg,#bae6fd,#60a5fa)")} />
        {/* bottom */}
        <div style={face(`rotateX(-90deg) translateZ(${half}px)`, "linear-gradient(135deg,#1e3a8a,#1e40af)")} />
      </div>
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
