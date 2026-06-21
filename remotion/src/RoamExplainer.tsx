import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadDMSans } from "@remotion/google-fonts/DMSans";
import {
  Compass,
  CalendarBlank,
  MapTrifold,
  ChatCircleDots,
  ForkKnife,
  Bed,
  AirplaneTilt,
  Sparkle,
} from "@phosphor-icons/react";

// ── Brand tokens (lifted verbatim from CLAUDE.md / tailwind.config.ts) ────────
const PARCHMENT = "#FAF7F2";
const INK = "#1A1A2E";
const SIENNA = "#C4622D";
const SLATE = "#6B7280";
const WHITE = "#FFFFFF";

// ── Fonts ─────────────────────────────────────────────────────────────────────
loadPlayfair("italic", { weights: ["400", "500"], subsets: ["latin"] });
const { fontFamily: PLAYFAIR } = loadPlayfair("normal", {
  weights: ["400", "500"],
  subsets: ["latin"],
});
const { fontFamily: DM_SANS } = loadDMSans("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const FPS = 30;

// Scene lengths (frames). Restrained, editorial pacing — nothing rushed.
const COVER = 105;
const STEP = 120;
const CLOSE = 110;
export const TOTAL_FRAMES = COVER + STEP * 5 + CLOSE; // 815

// ── Motion helpers ────────────────────────────────────────────────────────────
function useReveal(delay = 0, distance = 28) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200, mass: 0.7 },
  });
  return {
    opacity: s,
    transform: `translateY(${interpolate(s, [0, 1], [distance, 0])}px)`,
  };
}

// Quiet hairline label, uppercase, letterspaced — the Monocle kicker.
const Kicker: React.FC<{ children: React.ReactNode; delay?: number }> = ({
  children,
  delay = 0,
}) => {
  const r = useReveal(delay, 14);
  return (
    <div
      style={{
        ...r,
        fontFamily: DM_SANS,
        fontWeight: 600,
        fontSize: 24,
        letterSpacing: 6,
        textTransform: "uppercase",
        color: SIENNA,
      }}
    >
      {children}
    </div>
  );
};

const Heading: React.FC<{ children: React.ReactNode; delay?: number; size?: number }> = ({
  children,
  delay = 0,
  size = 104,
}) => {
  const r = useReveal(delay, 30);
  return (
    <div
      style={{
        ...r,
        fontFamily: PLAYFAIR,
        fontStyle: "italic",
        fontWeight: 400,
        fontSize: size,
        lineHeight: 1.04,
        color: INK,
        letterSpacing: -1,
      }}
    >
      {children}
    </div>
  );
};

const Body: React.FC<{ children: React.ReactNode; delay?: number }> = ({
  children,
  delay = 0,
}) => {
  const r = useReveal(delay, 22);
  return (
    <div
      style={{
        ...r,
        fontFamily: DM_SANS,
        fontWeight: 400,
        fontSize: 34,
        lineHeight: 1.5,
        color: SLATE,
        maxWidth: 760,
      }}
    >
      {children}
    </div>
  );
};

// A faithful little Roam card — white surface, soft shadow, icon chip, two lines.
const MockCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  meta: string;
  accent?: boolean;
  delay?: number;
}> = ({ icon, title, meta, accent = false, delay = 0 }) => {
  const r = useReveal(delay, 36);
  return (
    <div
      style={{
        ...r,
        display: "flex",
        alignItems: "center",
        gap: 28,
        background: WHITE,
        borderRadius: 28,
        padding: "34px 38px",
        width: 820,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 12px 28px rgba(0,0,0,0.06)",
        borderLeft: accent ? `4px solid ${SIENNA}` : "4px solid transparent",
      }}
    >
      <div
        style={{
          width: 84,
          height: 84,
          borderRadius: 22,
          background: PARCHMENT,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontFamily: DM_SANS, fontWeight: 600, fontSize: 38, color: INK }}>
          {title}
        </div>
        <div
          style={{
            fontFamily: DM_SANS,
            fontWeight: 500,
            fontSize: 26,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: SLATE,
          }}
        >
          {meta}
        </div>
      </div>
    </div>
  );
};

// Shared scene scaffold: parchment field, generous margins, top-anchored copy.
const Scene: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      background: PARCHMENT,
      padding: "200px 100px",
      display: "flex",
      flexDirection: "column",
      gap: 56,
    }}
  >
    {children}
  </AbsoluteFill>
);

// ── Scenes ────────────────────────────────────────────────────────────────────
const Cover: React.FC = () => {
  const frame = useCurrentFrame();
  const ruleW = interpolate(frame, [18, 48], [0, 120], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill
      style={{
        background: PARCHMENT,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 44,
      }}
    >
      <Kicker delay={6}>The art of the journey</Kicker>
      <div style={{ height: 2, width: ruleW, background: SIENNA, opacity: 0.7 }} />
      <Heading delay={14} size={188}>
        Roam
      </Heading>
      <Body delay={30}>
        <div style={{ textAlign: "center", color: INK, opacity: 0.55 }}>
          A quiet guide to planning beautifully.
        </div>
      </Body>
    </AbsoluteFill>
  );
};

const StepScene: React.FC<{
  index: string;
  title: string;
  body: string;
  children: React.ReactNode;
}> = ({ index, title, body, children }) => (
  <Scene>
    <Kicker delay={4}>{index}</Kicker>
    <Heading delay={10}>{title}</Heading>
    <Body delay={20}>{body}</Body>
    <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 26 }}>
      {children}
    </div>
  </Scene>
);

const Closing: React.FC = () => {
  const frame = useCurrentFrame();
  const ruleW = interpolate(frame, [16, 46], [0, 120], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill
      style={{
        background: INK,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 40,
      }}
    >
      <div
        style={{
          fontFamily: PLAYFAIR,
          fontStyle: "italic",
          fontSize: 150,
          color: PARCHMENT,
          ...useReveal(8, 26),
        }}
      >
        Roam
      </div>
      <div style={{ height: 2, width: ruleW, background: SIENNA }} />
      <div
        style={{
          fontFamily: DM_SANS,
          fontWeight: 500,
          fontSize: 32,
          letterSpacing: 3,
          textTransform: "uppercase",
          color: "rgba(250,247,242,0.6)",
          ...useReveal(26, 18),
        }}
      >
        Every journey, beautifully kept
      </div>
    </AbsoluteFill>
  );
};

// ── Composition ───────────────────────────────────────────────────────────────
export const RoamExplainer: React.FC = () => {
  const ICON = { size: 46, weight: "light" as const, color: INK };
  let at = 0;
  const next = (len: number) => {
    const from = at;
    at += len;
    return from;
  };

  return (
    <AbsoluteFill style={{ background: PARCHMENT }}>
      <Sequence from={next(COVER)} durationInFrames={COVER}>
        <Cover />
      </Sequence>

      <Sequence from={next(STEP)} durationInFrames={STEP}>
        <StepScene
          index="One"
          title={"Plan a\njourney"}
          body="Begin with a name and a place. Roam keeps it in preparation until the details arrive."
        >
          <MockCard
            icon={<Compass {...ICON} color={SIENNA} />}
            title="Kyoto in Bloom"
            meta="In preparation"
            accent
            delay={30}
          />
        </StepScene>
      </Sequence>

      <Sequence from={next(STEP)} durationInFrames={STEP}>
        <StepScene
          index="Two"
          title={"Build the\ndays"}
          body="Lay out the journey day by day. Each one its own page, in order."
        >
          <MockCard
            icon={<CalendarBlank {...ICON} />}
            title="Day One — Arrival"
            meta="Gion · Evening"
            delay={28}
          />
          <MockCard
            icon={<AirplaneTilt {...ICON} />}
            title="Day Two — Higashiyama"
            meta="Temples · Tea"
            delay={42}
          />
        </StepScene>
      </Sequence>

      <Sequence from={next(STEP)} durationInFrames={STEP}>
        <StepScene
          index="Three"
          title={"Add to\nthis day"}
          body="Hotels, tables, flights — drop each into the day it belongs to."
        >
          <MockCard
            icon={<Bed {...ICON} />}
            title="Aman Kyoto"
            meta="Check-in · 15:00"
            delay={28}
          />
          <MockCard
            icon={<ForkKnife {...ICON} color={SIENNA} />}
            title="Kikunoi Honten"
            meta="Reservation · 19:30"
            accent
            delay={42}
          />
        </StepScene>
      </Sequence>

      <Sequence from={next(STEP)} durationInFrames={STEP}>
        <StepScene
          index="Four"
          title={"See it on\nthe map"}
          body="Every place, pinned. Understand a day at a glance, then walk it."
        >
          <MockCard
            icon={<MapTrifold {...ICON} />}
            title="Higashiyama, mapped"
            meta="6 places · 1 day"
            delay={30}
          />
        </StepScene>
      </Sequence>

      <Sequence from={next(STEP)} durationInFrames={STEP}>
        <StepScene
          index="Five"
          title={"Travel with\nyour Companion"}
          body="A considered second opinion — ask, and it answers in the spirit of the trip."
        >
          <MockCard
            icon={<ChatCircleDots {...ICON} color={SIENNA} />}
            title="“Where for a quiet late dinner?”"
            meta="Companion · Replies"
            accent
            delay={30}
          />
        </StepScene>
      </Sequence>

      <Sequence from={next(CLOSE)} durationInFrames={CLOSE}>
        <Closing />
      </Sequence>

      {/* Persistent corner mark — a quiet sparkle, like a watermark. */}
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: 90, right: 90, opacity: 0.35 }}>
          <Sparkle size={40} weight="light" color={SIENNA} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
