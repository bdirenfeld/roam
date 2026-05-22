// Roam · Companion — confirm gate
// The emotional core: "about to add these 5 places — approve?"
// Two placements compared, both with the same proposal:
//
//   Inline  — the proposal renders as a card inside the chat thread.
//             Feels like Roam pausing mid-conversation, holding the
//             change up for review.
//
//   Sheet   — the proposal lifts as a separate sheet/modal over the chat.
//             Feels more ceremonial; chat is paused while the user reads.
//
// Both must read as calm hand-offs, not "are you sure?" alerts. No red,
// no destructive framing. Discard is a quiet text link; Approve is the
// quiet ink-filled button shared from companion-shared.

// ─────────────────────────────────────────────────────────────────
// Gate-specific chat lead-up — same in every gate artboard so the
// comparison is gate-placement, not editorial.
// ─────────────────────────────────────────────────────────────────
const GATE_LEADUP = [
  {
    who: 'you',
    text: "shape day 2 around what mia would love — she's into craft, and we ate huge yesterday so something easier",
  },
  {
    who: 'roam',
    text: "Yes — keeping Mia at the center, not the itinerary. She liked the porcelain studio in Rome, so my instinct is Lower East Side: small makers, easy walking, food on the lighter side.",
  },
  {
    who: 'you',
    text: "yeah let's see it",
  },
];

const GATE_ROAM_PROPOSAL_INTRO = "Here's a shape for Day 2. Not locking anything in — see if it reads.";
const GATE_ROAM_SHEET_INTRO     = "Pulled together a shape for Day 2 — five places, Mia at the centre. Holding it up before anything moves.";

// ═════════════════════════════════════════════════════════════════
// 5A · Mobile inline — proposal card rendered inside the chat
// ═════════════════════════════════════════════════════════════════
function Gate_M_Inline() {
  return (
    <IOSDevice width={390} height={844} dark={false}>
      <div style={{ position: 'absolute', inset: 0, background: ROAM.parchment, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 50 }} />
        <CompanionMasthead dense />
        <div style={{ flex: 1, overflow: 'hidden', padding: '18px 22px 12px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {GATE_LEADUP.map((t, i) => <ChatTurn key={i} {...t} dense />)}
            <ChatTurn who="roam" text={GATE_ROAM_PROPOSAL_INTRO} dense>
              <ProposalCard density="compact" />
            </ChatTurn>
          </div>
          <ChatComposer />
        </div>
        <div style={{ height: 34 }} />
      </div>
    </IOSDevice>
  );
}

// ═════════════════════════════════════════════════════════════════
// 5B · Desktop inline — proposal inside the side-panel chat
// ═════════════════════════════════════════════════════════════════
function Gate_D_Inline() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <TripDesktop chrome={{
        sidePanel: (
          <div style={{
            flex: '0 0 480px', borderLeft: `1px solid ${ROAM.ruleStrong}`,
            background: ROAM.parchment, height: '100%',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <CompanionMasthead dense />
            <div style={{ flex: 1, overflow: 'hidden', padding: '20px 26px 14px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                {GATE_LEADUP.map((t, i) => <ChatTurn key={i} {...t} dense />)}
                <ChatTurn who="roam" text={GATE_ROAM_PROPOSAL_INTRO} dense>
                  <ProposalCard density="compact" />
                </ChatTurn>
              </div>
              <ChatComposer />
            </div>
          </div>
        ),
      }} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// 6A · Mobile sheet — proposal rises as a separate sheet over the chat
// ═════════════════════════════════════════════════════════════════
function Gate_M_Sheet() {
  return (
    <IOSDevice width={390} height={844} dark={false}>
      {/* Chat behind, dimmed */}
      <div style={{
        position: 'absolute', inset: 0, background: ROAM.parchment,
        display: 'flex', flexDirection: 'column',
        opacity: 0.4, filter: 'saturate(0.7)',
      }}>
        <div style={{ height: 50 }} />
        <CompanionMasthead dense onClose={false} />
        <div style={{ flex: 1, padding: '18px 22px 12px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {GATE_LEADUP.map((t, i) => <ChatTurn key={i} {...t} dense />)}
            <ChatTurn who="roam" text={GATE_ROAM_SHEET_INTRO} dense />
          </div>
        </div>
      </div>
      {/* Scrim */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,26,46,0.18)' }} />
      {/* Sheet */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: ROAM.parchment,
        borderTopLeftRadius: 18, borderTopRightRadius: 18,
        boxShadow: '0 -14px 44px rgba(26,26,46,0.22)',
        maxHeight: '88%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
          <div style={{ width: 44, height: 4, borderRadius: 2, background: ROAM.ruleStrong }} />
        </div>
        <div style={{ overflow: 'auto', padding: '14px 18px 26px' }}>
          <ProposalCard density="compact" />
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 34, background: ROAM.parchment, zIndex: 5 }} />
    </IOSDevice>
  );
}

// ═════════════════════════════════════════════════════════════════
// 6B · Desktop sheet — centered editorial modal over the trip
// ═════════════════════════════════════════════════════════════════
function Gate_D_Sheet() {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <TripDesktop chrome={{
        sidePanel: (
          <div style={{
            flex: '0 0 480px', borderLeft: `1px solid ${ROAM.ruleStrong}`,
            background: ROAM.parchment, height: '100%',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            opacity: 0.45, filter: 'saturate(0.7)',
          }}>
            <CompanionMasthead dense onClose={false} />
            <div style={{ flex: 1, padding: '20px 26px 14px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                {GATE_LEADUP.map((t, i) => <ChatTurn key={i} {...t} dense />)}
                <ChatTurn who="roam" text={GATE_ROAM_SHEET_INTRO} dense />
              </div>
            </div>
          </div>
        ),
        dim: true,
      }} />
      {/* Scrim */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,26,46,0.34)', zIndex: 40 }} />
      {/* Centered modal */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
        width: 560, maxHeight: '88%', zIndex: 50,
        background: ROAM.parchment,
        borderRadius: 6,
        boxShadow: '0 30px 80px rgba(26,26,46,0.28), 0 0 0 1px rgba(26,26,46,0.10)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <ProposalCard density="rich" />
      </div>
    </div>
  );
}

Object.assign(window, {
  Gate_M_Inline, Gate_D_Inline, Gate_M_Sheet, Gate_D_Sheet,
  GATE_LEADUP, GATE_ROAM_PROPOSAL_INTRO, GATE_ROAM_SHEET_INTRO,
});
