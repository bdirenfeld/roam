// Roam · Companion — the other two trip-changing actions
// The "Add" gate is the canonical one. Cuts and Move share its shape but
// carry different emotional weight:
//   – Cuts must feel REVERSIBLE. "Restore" sits right next to "Approve."
//   – Moves are small repositionings. The card shows the day-to-day arc.
//
// Same approval / discard primitives, same calm sienna small-cap header.
// No red. No "are you sure?" framing.

// ─────────────────────────────────────────────────────────────────
// Cut-proposal card — items shown with a minus mark, faded slightly
// to telegraph "about to disappear", but not strikethrough (that
// reads punitive). Footer reassures the action is reversible.
// ─────────────────────────────────────────────────────────────────
const CUT_PROPOSAL_ITEMS = [
  { icon: Ph.Flag,      kind: 'Visit',     name: 'Sloomoo Institute',                meta: '2:00 — 3:30 PM · 475 Broadway',         reason: 'Right after a 9-hour flight + check-in. Mia will be flat.' },
  { icon: Ph.IceCream,  kind: 'Snack',     name: "Morgenstern's Finest Ice Cream",   meta: '7:30 — 8:00 PM · 2 Rivington St',       reason: 'Dessert on top of Rubirosa. Save it for a different night.' },
];

function CutProposalCard({ density = 'compact' }) {
  const compact = density === 'compact';
  return (
    <div style={{
      background: ROAM.parchment,
      border: `1px solid ${ROAM.ruleStrong}`,
      borderRadius: 4, overflow: 'hidden', fontFamily: UI_FONT,
    }}>
      <div style={{ padding: compact ? '14px 16px 12px' : '20px 22px 16px', borderBottom: `1px solid ${ROAM.rule}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <SmallCaps color={ROAM.sienna} size={compact ? 9.5 : 10}>About to cut · Day 1</SmallCaps>
          <SmallCaps color={ROAM.captionSoft} size={compact ? 9.5 : 10}>{CUT_PROPOSAL_ITEMS.length} places</SmallCaps>
        </div>
        <Italic size={compact ? 17 : 20} weight={500}>Thinning Day 1 — both feel forced after the flight.</Italic>
      </div>
      <div>
        {CUT_PROPOSAL_ITEMS.map((p, i) => {
          const Icon = p.icon;
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '12px 14px',
              borderBottom: i < CUT_PROPOSAL_ITEMS.length - 1 ? `1px solid ${ROAM.rule}` : 'none',
              opacity: 0.72,
            }}>
              <div style={{
                flex: '0 0 auto', width: 28, height: 28, borderRadius: '50%',
                border: `1px solid ${ROAM.ruleStrong}`,
                background: ROAM.parchmentDeep, color: ROAM.ink,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={14} sw={1.3} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: ROAM.captionSoft, marginBottom: 3 }}>{p.kind}</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: ROAM.ink, letterSpacing: '-0.01em' }}>{p.name}</div>
                <div style={{ fontSize: 11.5, color: ROAM.caption, marginTop: 2 }}>{p.meta}</div>
                <div style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 13, color: ROAM.caption, marginTop: 6 }}>
                  {p.reason}
                </div>
              </div>
              <div style={{ flex: '0 0 auto', color: ROAM.captionSoft, paddingTop: 4 }}>
                <Ph.Minus size={12} color={ROAM.captionSoft} sw={1.4} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderTop: `1px solid ${ROAM.rule}`,
        background: ROAM.parchmentTint,
      }}>
        <span style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 13, color: ROAM.caption }}>
          Reversible — restore any time.
        </span>
        <ApproveDiscard size="sm" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// After-cut acknowledgment — what the chat shows once cuts are
// applied. Items appear in a quiet frame with a sienna "Restore"
// affordance — the undo is the entire point of the surface.
// ─────────────────────────────────────────────────────────────────
function CutAckCard() {
  return (
    <div style={{
      background: ROAM.parchmentTint,
      border: `1px solid ${ROAM.rule}`,
      borderRadius: 4, fontFamily: UI_FONT,
      padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <SmallCaps color={ROAM.caption} size={9.5}>Cut · 2 places from Day 1</SmallCaps>
        <button style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 0, fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 500,
          fontSize: 13, color: ROAM.sienna, letterSpacing: '-0.005em',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Ph.CornerDownLeft size={11} color={ROAM.sienna} sw={1.5} />
          Restore
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {CUT_PROPOSAL_ITEMS.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: 0.55 }}>
            <div style={{
              flex: '0 0 auto', width: 22, height: 22, borderRadius: '50%',
              border: `1px solid ${ROAM.rule}`, background: ROAM.parchment,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <p.icon size={11} color={ROAM.caption} sw={1.3} />
            </div>
            <span style={{
              fontSize: 13, color: ROAM.caption, letterSpacing: '-0.005em',
              textDecoration: 'line-through', textDecorationColor: ROAM.captionSoft,
              textDecorationThickness: 0.5,
            }}>{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Move-proposal card — single row with a from→to day arc.
// ─────────────────────────────────────────────────────────────────
function DayChip({ children, active = false }) {
  return (
    <span style={{
      padding: '3px 9px', borderRadius: 999,
      background: active ? ROAM.ink : ROAM.parchmentDeep,
      color: active ? ROAM.parchment : ROAM.label,
      fontFamily: UI_FONT, fontSize: 11, fontWeight: 500, letterSpacing: '-0.005em',
    }}>{children}</span>
  );
}

function MoveProposalCard() {
  return (
    <div style={{
      background: ROAM.parchment,
      border: `1px solid ${ROAM.ruleStrong}`,
      borderRadius: 4, overflow: 'hidden', fontFamily: UI_FONT,
    }}>
      <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${ROAM.rule}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <SmallCaps color={ROAM.sienna} size={9.5}>About to move · 1 card</SmallCaps>
          <SmallCaps color={ROAM.captionSoft} size={9.5}>Day 1 → Day 2</SmallCaps>
        </div>
        <Italic size={17} weight={500}>Letting Sloomoo land on Day 2 — it'll have air around it.</Italic>
      </div>
      {/* The card row, with from→to arc rendered prominently */}
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            flex: '0 0 auto', width: 28, height: 28, borderRadius: '50%',
            border: `1px solid ${ROAM.ruleStrong}`,
            background: ROAM.parchmentDeep, color: ROAM.ink,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Ph.Flag size={14} sw={1.3} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: ROAM.captionSoft, marginBottom: 3 }}>Visit</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: ROAM.ink, letterSpacing: '-0.01em' }}>Sloomoo Institute</div>
            <div style={{ fontSize: 11.5, color: ROAM.caption, marginTop: 2 }}>475 Broadway · 90 min</div>
          </div>
        </div>
        {/* The arc */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginTop: 14, padding: '10px 12px',
          background: ROAM.parchmentTint,
          borderRadius: 6,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DayChip>Day 1 · 2 PM</DayChip>
          </div>
          <Ph.ArrowRight size={12} color={ROAM.caption} sw={1.4} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DayChip active>Day 2 · 10 AM</DayChip>
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 12.5, color: ROAM.caption }}>
            Morning, before lunch
          </span>
        </div>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderTop: `1px solid ${ROAM.rule}`,
        background: ROAM.parchmentTint,
      }}>
        <span style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 13, color: ROAM.caption }}>
          Nothing locks until you approve.
        </span>
        <ApproveDiscard size="sm" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Three mobile frames showing each action in flow
// ─────────────────────────────────────────────────────────────────

const CUTS_LEADUP = [
  { who: 'you',  text: "honestly day 1 looks too packed once we land" },
  { who: 'roam', text: "Agreed. Two stops in particular are doing the most damage — Sloomoo right after check-in, and Morgenstern's on top of Rubirosa. The first you'll regret with a tired seven-year-old; the second is dessert on top of dessert." },
  { who: 'you',  text: "yeah cut them" },
];

const CUTS_LEADUP_AFTER = [
  ...CUTS_LEADUP,
  { who: 'roam', text: "Done — and reversible, the restore link's there if you change your mind. Day 1 has room now. Want me to keep it that way or fold one calm thing in?" },
];

const MOVE_LEADUP = [
  { who: 'you',  text: "what about not deleting sloomoo, just somewhere it works" },
  { who: 'roam', text: "Better instinct than mine, honestly. Day 2 morning is the natural slot — Mia's fresh, it's a 20-minute walk from the hotel, doors open at 10." },
];

function Action_M_CutProposal() {
  return (
    <IOSDevice width={390} height={844} dark={false}>
      <div style={{ position: 'absolute', inset: 0, background: ROAM.parchment, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 50 }} />
        <CompanionMasthead dense />
        <div style={{ flex: 1, overflow: 'hidden', padding: '18px 22px 12px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {CUTS_LEADUP.map((t, i) => <ChatTurn key={i} {...t} dense />)}
            <ChatTurn who="roam" text="Here are the two to drop." dense>
              <CutProposalCard />
            </ChatTurn>
          </div>
          <ChatComposer />
        </div>
        <div style={{ height: 34 }} />
      </div>
    </IOSDevice>
  );
}

function Action_M_CutAfter() {
  return (
    <IOSDevice width={390} height={844} dark={false}>
      <div style={{ position: 'absolute', inset: 0, background: ROAM.parchment, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 50 }} />
        <CompanionMasthead dense />
        <div style={{ flex: 1, overflow: 'hidden', padding: '18px 22px 12px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {CUTS_LEADUP_AFTER.slice(0, 3).map((t, i) => <ChatTurn key={i} {...t} dense />)}
            <ChatTurn who="roam" text={CUTS_LEADUP_AFTER[3].text} dense>
              <CutAckCard />
            </ChatTurn>
          </div>
          <ChatComposer />
        </div>
        <div style={{ height: 34 }} />
      </div>
    </IOSDevice>
  );
}

function Action_M_MoveProposal() {
  return (
    <IOSDevice width={390} height={844} dark={false}>
      <div style={{ position: 'absolute', inset: 0, background: ROAM.parchment, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 50 }} />
        <CompanionMasthead dense />
        <div style={{ flex: 1, overflow: 'hidden', padding: '18px 22px 12px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {MOVE_LEADUP.map((t, i) => <ChatTurn key={i} {...t} dense />)}
            <ChatTurn who="roam" text="Here's the move." dense>
              <MoveProposalCard />
            </ChatTurn>
          </div>
          <ChatComposer />
        </div>
        <div style={{ height: 34 }} />
      </div>
    </IOSDevice>
  );
}

Object.assign(window, {
  CutProposalCard, CutAckCard, MoveProposalCard,
  Action_M_CutProposal, Action_M_CutAfter, Action_M_MoveProposal,
});
