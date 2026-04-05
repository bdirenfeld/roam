import type { Card } from "@/types/database";

interface Props { card: Card }

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em] mb-2">{children}</p>;
}

export default function FoodDetail({ card }: Props) {
  const d = card.details;

  const notes         = d.notes          as string | undefined;
  const reservation   = d.reservation    as string | undefined;
  const address       = d.address        as string | undefined;
  const estimatedCost = d.estimated_cost as string | undefined;
  const orderPlan     = d.order_plan     as string[] | string | undefined;
  const orderItems    = Array.isArray(orderPlan)
    ? orderPlan
    : orderPlan ? [orderPlan] : [];

  return (
    <div className="space-y-6">
      {/* Notes */}
      {notes && (
        <p className="text-sm text-gray-700 leading-relaxed">{notes}</p>
      )}

      {/* Reservation badge */}
      {reservation && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl ${
            reservation.toLowerCase().includes("reserved")
              ? "bg-green-50 text-green-600"
              : "bg-gray-50 text-gray-500"
          }`}>
            <span className="text-xs">
              {reservation.toLowerCase().includes("reserved") ? "✅" : "🚶"}
            </span>
            <span className="text-xs font-semibold">{reservation}</span>
          </div>
        </div>
      )}

      {/* Address, cost */}
      {(address || estimatedCost) && (
        <div className="space-y-2">
          {address && (
            <div className="flex items-start gap-2 text-sm text-gray-700">
              <span className="flex-shrink-0">📍</span>
              <span>{address}</span>
            </div>
          )}
          {estimatedCost && (
            <div className="flex items-start gap-2 text-sm text-gray-700">
              <span className="flex-shrink-0">💳</span>
              <span>{estimatedCost}</span>
            </div>
          )}
        </div>
      )}

      {/* Order plan */}
      {orderItems.length > 0 && (
        <div>
          <SectionLabel>Order plan</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {orderItems.map((item, i) => (
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
    </div>
  );
}
