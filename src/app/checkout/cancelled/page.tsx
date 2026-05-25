import Link from "next/link";

const INK = "#1A1A2E";
const PARCHMENT = "#FAF7F2";

export default function CheckoutCancelledPage() {
  return (
    <main
      className="mobile-container flex flex-col"
      style={{
        background: PARCHMENT,
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "calc(28px + env(safe-area-inset-bottom))",
      }}
    >
      <div style={{ padding: "24px 24px 18px" }}>
        <h1
          className="font-display italic"
          style={{
            fontWeight: 500,
            fontSize: "28px",
            lineHeight: 0.95,
            letterSpacing: "-0.015em",
            color: INK,
          }}
        >
          Roam
        </h1>
      </div>

      <div style={{ margin: "0 24px", height: "1px", background: "rgba(26,26,46,0.18)" }} />

      <div className="flex-1" style={{ padding: "32px 24px 0" }}>
        <p
          className="font-display italic"
          style={{
            fontWeight: 400,
            fontSize: "22px",
            lineHeight: 1.25,
            letterSpacing: "-0.01em",
            color: INK,
          }}
        >
          Your journey awaits.
        </p>
        <p
          className="font-sans"
          style={{
            marginTop: "14px",
            fontWeight: 400,
            fontSize: "14px",
            lineHeight: 1.55,
            color: "rgba(26, 26, 46, 0.65)",
          }}
        >
          Early access requires a one-time payment. Continue when you&apos;re ready.
        </p>
      </div>

      <div style={{ margin: "0 24px" }}>
        <Link
          href="/checkout"
          className="font-sans"
          style={{
            display: "flex",
            width: "100%",
            height: "54px",
            borderRadius: "12px",
            background: INK,
            color: PARCHMENT,
            fontWeight: 500,
            fontSize: "15px",
            letterSpacing: "-0.005em",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          Continue to payment
        </Link>
      </div>
    </main>
  );
}
