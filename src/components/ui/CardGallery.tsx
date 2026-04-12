'use client'

import { useState, useEffect, useRef } from 'react'

interface CardGalleryProps {
  placeId?: string | null
  coverImageUrl?: string | null
  fallbackLat?: number | null
  fallbackLng?: number | null
  cardTitle: string
  height?: number
  maxPhotos?: number
}

export function CardGallery({
  placeId,
  coverImageUrl,
  fallbackLat,
  fallbackLng,
  cardTitle,
  height = 220,
  maxPhotos = 6,
}: CardGalleryProps) {
  const [photos, setPhotos] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const touchStartX = useRef<number>(0)

  useEffect(() => {
    setActiveIndex(0)
    setLoading(true)

    if (!placeId) {
      if (coverImageUrl) {
        setPhotos([coverImageUrl])
      } else {
        setPhotos(getMapboxFallback())
      }
      setLoading(false)
      return
    }

    async function fetchPhotos() {
      try {
        const res = await fetch(`/api/places/photos?placeId=${placeId}&maxPhotos=${maxPhotos}`)
        const data = await res.json()
        if (data.photos?.length > 0) {
          setPhotos(data.photos)
        } else {
          setPhotos(getMapboxFallback())
        }
      } catch {
        setPhotos(getMapboxFallback())
      } finally {
        setLoading(false)
      }
    }

    fetchPhotos()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId])

  function getMapboxFallback(): string[] {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) return []
    const lat = fallbackLat ?? 41.9028
    const lng = fallbackLng ?? 12.4964
    const zoom = fallbackLat ? 15 : 13
    return [
      `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${lng},${lat},${zoom},0/800x400@2x?access_token=${token}`,
    ]
  }

  if (loading) {
    return <div style={{ height }} className="bg-gray-100 animate-pulse w-full flex-shrink-0" />
  }

  if (photos.length === 0) {
    return <div style={{ height }} className="bg-gray-100 w-full flex-shrink-0" />
  }

  return (
    <div
      className="relative w-full overflow-hidden flex-shrink-0"
      style={{ height }}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX
      }}
      onTouchEnd={(e) => {
        const diff = touchStartX.current - e.changedTouches[0].clientX
        if (diff > 50 && activeIndex < photos.length - 1) setActiveIndex((i) => i + 1)
        if (diff < -50 && activeIndex > 0) setActiveIndex((i) => i - 1)
      }}
    >
      {/* Photo strip */}
      <div
        className="flex h-full transition-transform duration-300 ease-out"
        style={{ transform: `translateX(-${activeIndex * 100}%)` }}
      >
        {photos.map((url, i) => (
          <div key={i} className="flex-shrink-0 w-full h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`${cardTitle} ${i + 1}`}
              className="w-full h-full object-cover"
            />
          </div>
        ))}
      </div>

      {/* Dot indicators + prev/next arrows — only when multiple photos */}
      {photos.length > 1 && (
        <>
          {/* Dots */}
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1 z-10">
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveIndex(i)}
                className={`rounded-full transition-all ${
                  i === activeIndex ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/50'
                }`}
                aria-label={`Photo ${i + 1}`}
              />
            ))}
          </div>

          {/* Prev arrow */}
          {activeIndex > 0 && (
            <button
              onClick={() => setActiveIndex((i) => i - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/25 backdrop-blur-sm flex items-center justify-center z-10"
              aria-label="Previous photo"
            >
              <svg width="12" height="12" viewBox="0 0 256 256" fill="white">
                <path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z" />
              </svg>
            </button>
          )}

          {/* Next arrow */}
          {activeIndex < photos.length - 1 && (
            <button
              onClick={() => setActiveIndex((i) => i + 1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/25 backdrop-blur-sm flex items-center justify-center z-10"
              aria-label="Next photo"
            >
              <svg width="12" height="12" viewBox="0 0 256 256" fill="white">
                <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z" />
              </svg>
            </button>
          )}
        </>
      )}
    </div>
  )
}
