'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import GuidanceBubble, { type HintRect } from './GuidanceBubble';
import type { GuidanceScreen } from './JourneyGuidanceContext';
import type { LessonId } from './lessons';

type Hint = { element: Element; rect: HintRect; text: string };
const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight && r.left < innerWidth && r.right > 0;
};
const find = (selector: string) => Array.from(document.querySelectorAll(selector)).find(visible);
const button = (label: string, prefix = false) => Array.from(document.querySelectorAll('button')).find(el => {
  if (el.closest('[role=note]') || !visible(el)) return false;
  const text = el.getAttribute('aria-label') ?? el.textContent?.trim().replace(/^[+−]\s*/, '') ?? '';
  return prefix ? text.startsWith(label) : text === label;
});

export default function LessonPointer({ screen, lesson, step, onNext, onSkip, preview = false }: {
  screen: GuidanceScreen; lesson: LessonId; step: number; onNext: () => void; onSkip: () => void; preview?: boolean;
}) {
  const [hint, setHint] = useState<Hint | null>(null);
  useEffect(() => {
    const measure = () => {
      if (find('[role=menu]')) { setHint(null); return; }
      let anchor: Element | undefined;
      let text = '';
      const activeCards = screen.cards.filter(c => !(c as typeof c & { archived?: boolean }).archived && c.status !== 'cut');
      const opened = activeCards.find(c => c.id === screen.openedId);
      const booked = activeCards.find(c => c.confirmed || (c.details as Record<string, unknown> | null)?.confirmation);
      const planned = activeCards.find(c => c.day_id && ['activity', 'food'].includes(c.place?.type ?? ''));
      const cardElement = (id?: string) => id ? Array.from(document.querySelectorAll('[data-card-id]')).find(el => el.getAttribute('data-card-id') === id && visible(el)) : undefined;
      const upload = button('Upload a confirmation') ?? button('Upload bookings', true) ?? button('Import a booking');
      const add = button('Add to my days') ?? Array.from(document.querySelectorAll('button')).find(el => visible(el) && /^Add \d+ to my days$/.test(el.textContent?.trim() ?? ''));
      if (lesson === 'bookings') {
        if (step === 0) {
          anchor = button('Choose confirmation', true) ?? upload;
          text = preview && button('Choose confirmation', true) ? 'Choose the example confirmation for this preview. In your journey, use your own file.' : 'Already booked? Upload your confirmation so it travels with your plan.';
        } else if (step === 1) {
          anchor = add ?? upload ?? button('Choose confirmation', true);
          text = 'Check the dates and confirmation details, then add the booking to your days.';
        } else {
          anchor = opened ? button('Attachments') : cardElement(booked?.id);
          text = opened ? 'Your booking details stay on this card. Use the paperclip for any attached tickets or files.' : 'Open a booking in your agenda to find its confirmation when you need it.';
        }
      } else if (lesson === 'planning') {
        anchor = opened ? button('Done') ?? button('Change the time') ?? button('Set a time') : cardElement(planned?.id);
        text = !opened ? ['Open a place in your day to adjust when you’ll go.', 'Inside the card, tap its time to choose when you’ll go.', 'After changing the time, tap Done. Adjust other stops in the same way.'][step] : ['Each stop keeps its time here. Tap it whenever your plans change.', 'Choose a different time, then tap Done to save it.', 'When you save a new time, your agenda updates. Adjust other stops in the same way.'][step];
      } else if (lesson === 'details') {
        if (!opened) {
          anchor = cardElement(planned?.id ?? activeCards[0]?.id);
          text = ['Open a place. Its booking and practical details live on its card.', 'Inside the card, use the paperclip for tickets and booking files.', 'Open the card and scroll to Add details for the extra fields.'][step];
        } else {
          anchor = step === 2 ? button('Add details') ?? button('Hide empty fields') : button('Attachments');
          text = ['Keep the confirmation, meeting point and practical notes with this stop.', 'The paperclip holds tickets and booking files. Add your own when you need them.', 'Add details reveals the extra fields. Add what will help you on the day.'][step];
          if (!anchor) { anchor = button('Attachments'); text = 'Scroll down to Add details to reveal the extra fields.'; }
        }
      } else {
        const email = find('input[aria-label="Their email address"]');
        anchor = step === 0 ? email : step === 1 ? button('Send') ?? email : button('Copy link') ?? email;
        text = ['Enter a traveller’s email so they can follow the plan.', 'Tap Send to give them the journey link.', 'You can also copy the link and share it yourself. They’ll see the plan as it changes.'][step];
        if (preview && step === 1) text += ' No email is sent in this preview.';
      }
      if (!anchor) {
        const agenda = find(`a[href*="/trips/${screen.trip.id}/days/"]`);
        anchor = button('More options') ?? agenda ?? find(`a[href="/trips/${screen.trip.id}/map"]`);
        if (lesson === 'sharing') text = ['Open Settings from the menu. Sharing is inside.', 'Open Settings to enter their email and send the journey link.', 'Open Settings to copy the journey link and share it yourself.'][step];
        else if (lesson === 'bookings') text = ['Open Bookings from the menu to add a confirmation.', 'In Bookings, upload your confirmation and check its details.', 'Once added, open the booking in your agenda to find its confirmation.'][step];
        else text = activeCards.length ? 'Open a place in your agenda to continue this walkthrough.' : 'Add a place first, then open its card in your agenda. Pick up this walkthrough anytime from the menu.';
      }
      if (!anchor) { setHint(null); return; }
      const { x, y, width, height } = anchor.getBoundingClientRect();
      setHint(old => old?.element === anchor && old.text === text && old.rect.x === x && old.rect.y === y && old.rect.width === width && old.rect.height === height ? old : { element: anchor!, rect: { x, y, width, height }, text });
    };
    measure();
    const timer = setInterval(measure, 250);
    return () => clearInterval(timer);
  }, [screen, lesson, step, preview]);
  const next = () => {
    if (lesson === 'details' && step === 1) document.querySelector('[data-testid="add-details-target"]')?.closest('button')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    onNext();
  };
  return hint ? createPortal(<GuidanceBubble target={hint.rect} label="Journey walkthrough" text={hint.text} step={step} onNext={next} onSkip={onSkip} />, hint.element.closest('[role=dialog]') ?? document.body) : null;
}
