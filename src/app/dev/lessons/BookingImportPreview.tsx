'use client';
import { useState } from 'react';
import ConfirmationPreviewSheet from '@/components/plan/ConfirmationPreviewSheet';
import type { createTrainingState } from '@/app/demo/trainingState';
import type { DayWithCards } from '@/types/database';

export default function BookingImportPreview({ model, onClose }: { model: ReturnType<typeof createTrainingState>; onClose: () => void }) {
  const [review, setReview] = useState(false);
  const trip = model.currentTrip();
  const place = { id: 'demo-onboarding-hotel', google_place_id: 'demo-onboarding-hotel', title: 'Your hotel', type: 'logistics', sub_type: 'hotel', address: trip.destination, lat: trip.destination_lat, lng: trip.destination_lng };
  const choose = () => { model.onWrite('places', 'upsert', place, []); setReview(true); };
  if (review) return <ConfirmationPreviewSheet
    items={[{ type: 'hotel', title: place.title, date: trip.start_date, time: '15:00', end_time: null, check_out_date: trip.end_date, check_out_time: '11:00', confirmation_number: 'EXAMPLE-2048', address: null, phone: null, website: null, notes: 'Example confirmation for this local preview. Double room · check-in from 3 pm.' }]}
    fileName="hotel-confirmation.pdf" fileType="application/pdf"
    days={model.days().map(d => ({ ...d, cards: model.cards().filter(c => c.day_id === d.id) })) as DayWithCards[]}
    tripId={trip.id} onClose={onClose}
    onCardsCreated={() => { model.notify(); onClose(); }}
  />;
  return <div className="fixed inset-0 z-[200] flex items-end justify-center bg-activity/30 sm:items-center" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-label="Upload a booking" className="w-full max-w-lg rounded-t-2xl bg-white p-6 text-activity sm:rounded-2xl" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between"><h2 className="text-lg font-medium">Upload a booking</h2><button aria-label="Close booking import" className="min-h-11 min-w-11" onClick={onClose}>×</button></div>
      <p className="mt-2 text-sm text-activity/60">Choose your confirmation. Check the details, then add it to your days.</p>
      <button onClick={choose} className="my-5 min-h-24 w-full rounded-xl border border-dashed border-activity/30 text-sm">Choose confirmation <span className="mt-1 block text-xs text-activity/50">PDF or photo</span></button>
      <p className="text-xs text-activity/50">This local mockup uses an example file. No personal file is uploaded.</p>
      <button onClick={onClose} className="mt-4 min-h-11 text-sm underline">Not now</button>
    </section>
  </div>;
}
