import type { Card } from "@/types/database";

interface Props { card: Card }

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em] mb-2">{children}</p>;
}

export default function FoodDetail({ card }: Props) {
  const d = card.details;
  const ai = d.ai_enriched as {
    about?: string;
    must_order?: string[];
    tips?: string[];
    cuisine?: string;
    signature_dishes?: string[];
  } | undefined;

  const reservationStatus = d.reservation_status as string | undefined;
  const reservationTime = d.reservation_time as string | undefined;

  return (
    <div className="space-y-6">
      {/* About */}
      {ai?.about && (
        <p className="text-sm text-gray-700 leading-relaxed">{ai.about}</p>
      )}

      {/* Cuisine + reservation in one row */}
      {(ai?.cuisine || reservationStatus) && (
        <div className="flex items-center gap-3 flex-wrap">
          {ai?.cuisine && (
            <div className="flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-xl">
              <span className="text-xs">🍽️</span>
              <span className="text-xs font-semibold text-food">{ai.cuisine}</span>
            </div>
          )}
          {reservationStatus && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl ${
              reservationStatus === "reserved"
                ? "bg-green-50 text-green-600"
                : "bg-gray-50 text-gray-500"
            }`}>
              <span className="text-xs">{reservationStatus === "reserved" ? "✅" : "🚶"}</span>
              <span className="text-xs font-semibold">
                {reservationStatus === "reserved"
                  ? `Reserved${reservationTime ? ` · ${reservationTime}` : ""}`
                  : "Walk-in"}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Must order */}
      {ai?.must_order && ai.must_order.length > 0 && (
        <div>
          <SectionLabel>Must order</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {ai.must_order.map((item, i) => (
              <span
                key={i}
                className="text-xs font-semibold bg-amber-50 text-food border border-amber-100 px-3 py-1.5 rounded-full"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Signature dishes */}
      {ai?.signature_dishes && ai.signature_dishes.length > 0 && (
        <div>
          <SectionLabel>Signature dishes</SectionLabel>
          <ul className="space-y-2">
            {ai.signature_dishes.map((dish, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-food font-bold mt-0.5 flex-shrink-0">·</span>
                {dish}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tips */}
      {ai?.tips && ai.tips.length > 0 && (
        <div>
          <SectionLabel>Tips</SectionLabel>
          <ul className="space-y-2">
            {ai.tips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-food font-bold mt-0.5 flex-shrink-0">·</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
