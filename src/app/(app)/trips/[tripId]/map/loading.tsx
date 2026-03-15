export default function MapLoading() {
  return (
    <div className="flex flex-col h-dvh">
      {/* Full-screen map skeleton */}
      <div className="flex-1 bg-gray-100 animate-pulse" />
      {/* Filter bar placeholder */}
      <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-72 h-10 bg-white/80 rounded-full animate-pulse shadow-card" />
    </div>
  );
}
