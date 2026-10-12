'use client';
import { useState } from 'react';
import type { createTrainingState } from './trainingState';

export default function SampleBooking({ model }: { model: ReturnType<typeof createTrainingState> }) {
  const [added, setAdded] = useState(model.cards().some(c => c.id === 'practice-booking'));
  const trip = model.currentTrip();
  function add() {
    const place = { id: 'demo-practice-hotel', title: 'Sample hotel confirmation', sub_type: 'hotel', type: 'logistics', address: `${trip.destination} · sample booking`, lat: trip.destination_lat, lng: trip.destination_lng };
    model.onWrite('places','insert',place,[]);
    model.onWrite('cards','insert',{ id:'practice-booking', trip_id:trip.id, day_id:model.days()[0].id, place_id:place.id, status:'in_itinerary', confirmed:true, start_time:'15:00:00', details:{ confirmation:'DEMO-STAY-2048', check_out:trip.end_date, notes:'Illustrative confirmation only.\nDouble room · 2 travellers.\nPaid in advance. Check-in from 3 pm; bring photo ID.' } },[]);
    setAdded(true);
    window.parent.postMessage({type:'roam-training-booking'},location.origin);
  }
  return <section className="p-6 text-activity bg-white min-h-screen">
    <p className="text-xs text-activity/60 mb-5">SIMULATED BOOKING IMPORT</p>
    <h2 className="text-xl font-medium mb-5">Your sample hotel confirmation</h2>
    <dl className="space-y-4 text-sm"><div><dt className="text-activity/50">Destination</dt><dd>{trip.destination}</dd></div><div><dt className="text-activity/50">Stay</dt><dd>{trip.start_date} → {trip.end_date}</dd></div><div><dt className="text-activity/50">Confirmation</dt><dd>DEMO-STAY-2048</dd></div><div><dt className="text-activity/50">Details</dt><dd>Double room · paid in advance · check-in from 3 pm</dd></div></dl>
    <button onClick={add} disabled={added} className="mt-6 px-5 py-3 bg-activity text-white rounded-lg disabled:opacity-60">{added ? '✓ Booking added to your journey' : 'Add this sample booking'}</button>
    <p role="status" className="text-sm mt-4">{added ? 'Done. Your confirmation is saved with the hotel card. Continue to plan your days.' : 'No file picker or personal booking needed. Try the supplied example.'}</p>
  </section>;
}
