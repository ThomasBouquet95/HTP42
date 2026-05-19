// Animated hero: the HTP42 lemniscate (∞) drawn faithfully — thick
// brand-blue stroke matching the logo, animated dash flow, and a handful
// of brand-blue particles travelling the loop. No center motif: the logo
// itself is the star. All declarative SVG / SMIL — server-renderable.

// Lemniscate traced faithfully from the real HTP42 mark on htp42.com.
// Single closed cubic-Bezier path that self-intersects at (273, 100) with
// tangents along ±45° — the visible X at the centre. Left lobe is ≈1.5×
// wider than the right and noticeably taller, matching the asymmetry of
// the brand mark.
const LEMNI =
  "M 273 100 " +
  // Crossover → top of small right lobe
  "C 309  64, 313  24, 342  24 " +
  "C 382  24, 409  58, 409  91 " +
  "C 409 127, 376 160, 343 160 " +
  "C 313 160, 309 136, 273 100 " +
  // Pass through crossover tangent (-1,-1) into the big left lobe
  "C 236  64, 194  13, 158  13 " +
  "C 122  13,  71  55,  71  96 " +
  "C  71 145, 131 187, 171 187 " +
  "C 207 187, 236 136, 273 100 " +
  "Z";

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
              <radialGradient id="hero-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0" stopColor="#1E91F9" stopOpacity="0.22" />
                <stop offset="1" stopColor="#1E91F9" stopOpacity="0" />
              </radialGradient>
              <filter id="hero-glow-blur" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3" />
              </filter>
            </defs>

            {/* Soft glow behind the loop so it sits on the page warmly. */}
            <rect x="0" y="0" width="480" height="200" fill="url(#hero-glow)" />

            {/* Thick brand-blue outer halo (very soft) so the logo glows. */}
            <path
              d={LEMNI}
              fill="none"
              stroke="#1E91F9"
              strokeWidth="40"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.18"
              filter="url(#hero-glow-blur)"
            />

            {/* Main solid stroke — chunky like the real mark (~11% of width). */}
            <path
              d={LEMNI}
              fill="none"
              stroke="#1E91F9"
              strokeWidth="30"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Bright "scan" highlight that travels the perimeter, painted on
                top of the thick stroke. Dashoffset animation gives a subtle
                living-loop feel without obscuring the logo. */}
            <path
              d={LEMNI}
              fill="none"
              stroke="#7abeff"
              strokeWidth="30"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="160 880"
              opacity="0.95"
            >
              <animate
                attributeName="stroke-dashoffset"
                from="0"
                to="-880"
                dur="7s"
                repeatCount="indefinite"
              />
            </path>

            {/* Path used by motion elements below. */}
            <path id="hero-lemni-path" d={LEMNI} fill="none" stroke="none" />

            {/* A handful of small white nodes ride on top of the loop so the
                eye picks up motion without competing with the stroke. */}
            <Dot color="#ffffff" stroke="#0d5ca6" begin="0s" />
            <Dot color="#ffffff" stroke="#1E91F9" begin="-2.3s" />
            <Dot color="#ffffff" stroke="#7abeff" begin="-4.6s" />
          </svg>
        </div>
      </div>
    </section>
  );
}

function Dot({
  color,
  stroke,
  begin,
}: {
  color: string;
  stroke: string;
  begin: string;
}) {
  return (
    <circle r="3.6" fill={color} stroke={stroke} strokeWidth="1.6">
      <animateMotion dur="7s" begin={begin} repeatCount="indefinite">
        <mpath href="#hero-lemni-path" />
      </animateMotion>
      <animate
        attributeName="r"
        values="3;4.2;3"
        dur="2.5s"
        begin={begin}
        repeatCount="indefinite"
      />
    </circle>
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
