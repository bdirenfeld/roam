"use client";

// Shown in place of the Plan-a-journey form when the traveller has used their
// free journey and has not paid (lib/paywall/allowance). One ask, one button:
// the button is a plain link to /checkout, which makes the Stripe session and
// sends them to Stripe's own page; Stripe returns them to /checkout/success.

import { PRICE_LABEL } from "@/lib/paywall/allowance";

export default function JourneyPaywall({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="px-6 pt-10 pb-8 text-center" data-testid="journey-paywall">
      <p className="text-[22px] font-display italic text-gray-900 leading-snug">
        Your first journey was on us
      </p>
      <p className="mt-3 text-[14px] text-gray-600 leading-relaxed">
        Unlock every journey after it for {PRICE_LABEL}, once. No subscription.
      </p>
      <a
        href="/checkout"
        className="mt-7 block w-full py-3 bg-[#1A1A2E] text-white text-[14px] font-semibold rounded-full active:scale-[0.99] transition-all"
      >
        Unlock for {PRICE_LABEL}
      </a>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-2 w-full min-h-[44px] text-[13px] text-gray-500"
      >
        Not now
      </button>
    </div>
  );
}
