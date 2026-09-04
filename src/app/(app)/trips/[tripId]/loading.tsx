// The journey root resolves the default day and redirects; while it does, the
// traveller used to see nothing. A header line and three ghost rows say a
// day is on its way (UX audit, Sep 2026, finding 8).
export default function TripLoading() {
  return (
    <div className="px-4 pt-6 md:px-10 md:pt-8">
      <div className="h-7 w-56 rounded bg-[rgba(26,26,46,0.08)] animate-pulse mb-6" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 py-4 border-b border-[rgba(26,26,46,0.08)]">
          <div className="h-3 w-12 rounded bg-[rgba(26,26,46,0.06)] animate-pulse" />
          <div className="flex-1">
            <div className="h-4 w-48 rounded bg-[rgba(26,26,46,0.08)] animate-pulse mb-2" />
            <div className="h-3 w-32 rounded bg-[rgba(26,26,46,0.05)] animate-pulse" />
          </div>
          <div className="h-12 w-12 rounded-lg bg-[rgba(26,26,46,0.06)] animate-pulse" />
        </div>
      ))}
    </div>
  );
}
