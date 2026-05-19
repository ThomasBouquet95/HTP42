import Image from "next/image";

// Static welcome banner. The real HTP42 mark sits top-left; the message
// runs alongside it. No animation — the brand mark speaks for itself.
export function HeroInfinity({ name }: { name: string }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-sky-50/40 to-brand-50/40 px-6 py-8 sm:px-10 sm:py-10">
      <DotGrid />
      <div className="relative flex items-center gap-5 sm:gap-7">
        <Image
          src="/htp42-mark.png"
          alt="HealthTech Partners 42"
          width={580}
          height={326}
          priority
          className="h-16 w-auto sm:h-20 shrink-0"
        />
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900">
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
      </div>
    </section>
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
