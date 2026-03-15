export default function DayLoading() {
  return (
    <div className="flex flex-col animate-pulse">
      {/* App header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="space-y-1.5">
          <div className="h-5 w-12 bg-gray-100 rounded" />
          <div className="h-3 w-28 bg-gray-100 rounded" />
        </div>
        <div className="w-8 h-8 rounded-full bg-gray-100" />
      </div>

      {/* Day strip */}
      <div className="flex gap-2 px-4 py-3 border-b border-gray-100 overflow-hidden">
        {[80, 88, 84, 80, 88, 84, 80].map((w, i) => (
          <div
            key={i}
            className={`h-12 rounded-xl flex-shrink-0 ${i === 0 ? "bg-gray-200" : "bg-gray-100"}`}
            style={{ width: w }}
          />
        ))}
      </div>

      {/* Map */}
      <div className="h-48 bg-gray-100 border-b border-gray-100" />

      {/* Timeline */}
      <div className="px-4 pt-4 space-y-2">
        {/* Day label */}
        <div className="mb-4 space-y-1.5">
          <div className="h-3 w-24 bg-gray-100 rounded" />
          <div className="h-3.5 w-12 bg-gray-100 rounded" />
        </div>
        {/* Cards */}
        {[1, 2, 3, 4].map((i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 mb-2.5">
      <div className="w-8 h-8 rounded-lg bg-gray-100 flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-3/4 bg-gray-100 rounded" />
        <div className="h-3 w-1/2 bg-gray-100 rounded" />
      </div>
      <div className="h-3 w-12 bg-gray-100 rounded" />
    </div>
  );
}
