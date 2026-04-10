'use client'

interface NavigationSheetProps {
  isOpen: boolean
  onClose: () => void
  placeName: string
  placeId?: string | null
  lat?: number | null
  lng?: number | null
}

export function NavigationSheet({ isOpen, onClose, placeName, placeId, lat, lng }: NavigationSheetProps) {
  if (!isOpen) return null

  const googleMapsUrl = placeId
    ? `https://www.google.com/maps/place/?q=place_id:${placeId}`
    : lat && lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`
    : null

  const wazeUrl = lat && lng
    ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
    : placeId
    ? `https://waze.com/ul?q=${encodeURIComponent(placeName)}&navigate=yes`
    : null

  const handleOption = (url: string | null) => {
    if (url) window.open(url, '_blank')
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[70]" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-[70] overflow-hidden max-w-mobile mx-auto">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 bg-gray-200 rounded-full" />
        </div>
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-0.5">Get directions to</p>
          <p className="text-sm font-medium text-[#1A1A2E]">{placeName}</p>
        </div>
        <button
          onClick={() => handleOption(googleMapsUrl)}
          disabled={!googleMapsUrl}
          className="w-full flex items-center gap-4 px-4 py-4 border-b border-gray-50 active:bg-gray-50 disabled:opacity-40"
        >
          <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
            <svg width="22" height="22" viewBox="0 0 92.3 132.3">
              <path fill="#4285F4" d="M46.2 0C20.7 0 0 20.7 0 46.2c0 35.5 41.8 81.5 43.6 83.4 1.4 1.5 3.7 1.5 5.1 0C50.5 127.7 92.3 81.7 92.3 46.2 92.3 20.7 71.6 0 46.2 0zm0 70.4c-13.4 0-24.2-10.8-24.2-24.2S32.8 22 46.2 22s24.2 10.8 24.2 24.2-10.9 24.2-24.2 24.2z"/>
            </svg>
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-[#1A1A2E]">Google Maps</p>
            <p className="text-xs text-gray-400 mt-0.5">Walking directions</p>
          </div>
          <svg width="14" height="14" viewBox="0 0 256 256" fill="#D1D5DB"><path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"/></svg>
        </button>
        <button
          onClick={() => handleOption(wazeUrl)}
          disabled={!wazeUrl}
          className="w-full flex items-center gap-4 px-4 py-4 active:bg-gray-50 disabled:opacity-40"
        >
          <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
            <svg width="22" height="22" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="48" fill="#33CCFF"/>
              <path fill="white" d="M50 20c-16.6 0-30 13.4-30 30 0 10 4.9 18.8 12.4 24.3L28 82l14-5.5c2.5.9 5.2 1.5 8 1.5 16.6 0 30-13.4 30-30S66.6 20 50 20zm14.5 38.5l-4-2.5c-1-.6-2.2-.3-2.9.6l-1.8 2.3c-4.3-2.2-7.8-5.7-10-10l2.3-1.8c.9-.7 1.2-1.9.6-2.9l-2.5-4c-.7-1.1-2.1-1.4-3.1-.7l-3.3 2.3c-.4.3-.6.7-.6 1.2 0 14 11.4 25.4 25.4 25.4.5 0 .9-.2 1.2-.6l2.3-3.3c.7-1 .4-2.4-.6-3z"/>
            </svg>
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-[#1A1A2E]">Waze</p>
            <p className="text-xs text-gray-400 mt-0.5">Driving directions</p>
          </div>
          <svg width="14" height="14" viewBox="0 0 256 256" fill="#D1D5DB"><path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"/></svg>
        </button>
        <button onClick={onClose} className="w-full py-4 text-sm text-gray-400 border-t border-gray-100 active:bg-gray-50">
          Cancel
        </button>
      </div>
    </>
  )
}
