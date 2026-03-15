export default function TripsLoading() {
  return (
    <div>
      {/* Header skeleton */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="h-6 w-16 bg-gray-100 rounded-lg animate-pulse" />
        <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
      </div>

      {/* Section label + button */}
      <div className="px-4 pt-5 pb-2 flex items-center justify-between">
        <div className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
        <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
      </div>

      {/* Cards */}
      <div className="px-4 space-y-3 mt-2">
        {[0, 1, 2].map((i) => (
          <TripCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

function TripCardSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-100 overflow-hidden shadow-card">
      {/* Cover */}
      <div className="h-32 bg-gray-100 animate-pulse" />
      {/* Content */}
      <div className="px-4 py-3.5 space-y-2.5">
        <div className="flex justify-between items-start">
          <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
          <div className="h-3.5 w-16 bg-gray-100 rounded-full animate-pulse" />
        </div>
        <div className="h-3 w-28 bg-gray-100 rounded animate-pulse" />
        <div className="h-3 w-52 bg-gray-100 rounded animate-pulse" />
      </div>
    </div>
  );
}
