// The Plan is the heaviest page — five queries before the first paint. It
// used to show a blank frame while they ran (UX audit, Sep 2026, finding 8).
// A parchment frame with four ghost columns holds the shape until the board
// arrives.
export default function PlanLoading() {
  return (
    <div className="flex flex-col h-dvh md:h-[calc(100dvh-64px)] overflow-hidden bg-white md:bg-[#FAF7F2]">
      <div className="hidden md:flex items-center gap-3 px-7 pt-5 pb-3">
        <div className="h-8 w-28 rounded-full bg-[rgba(26,26,46,0.06)] animate-pulse" />
        <span className="flex-1" />
        <div className="h-8 w-32 rounded-full bg-[rgba(26,26,46,0.06)] animate-pulse" />
        <div className="h-8 w-24 rounded-full bg-[rgba(26,26,46,0.06)] animate-pulse" />
      </div>
      <div className="md:hidden h-11 mx-3 mt-1 rounded-lg bg-[rgba(26,26,46,0.04)] animate-pulse" />
      <div className="flex gap-4 px-3 md:px-7 pt-4 overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="w-[280px] flex-shrink-0 hidden first:block md:block">
            <div className="h-3 w-20 rounded bg-[rgba(26,26,46,0.06)] animate-pulse mb-3" />
            <div className="h-6 w-36 rounded bg-[rgba(26,26,46,0.08)] animate-pulse mb-5" />
            {[0, 1, 2].map((j) => (
              <div key={j} className="h-14 rounded-xl bg-white/80 shadow-card animate-pulse mb-2" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
