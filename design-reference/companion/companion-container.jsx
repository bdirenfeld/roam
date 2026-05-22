// Roam · Companion — container forks
// Three placements per screen size, so the user can compare which feels
// right where. Same conversation in every container so the comparison
// is about the placement, not the content.
//
// Mobile (3A–3C)
//   3A. Full-screen takeover
//   3B. Bottom sheet expanded (trip peek above)
//   3C. Side overlay (slides from right; trip dim on left)
//
// Desktop (4A–4C)
//   4A. Right side panel (trip stays visible alongside)
//   4B. Full-screen swap (companion replaces the trip view)
//   4C. Bottom drawer (band across full width; map visible above)

// ─────────────────────────────────────────────────────────────────
// Shared chat scenario — same turns across every container so the
// comparison is structural, not editorial.
// ─────────────────────────────────────────────────────────────────
const CHAT_LEADUP = [
  {
    who: 'you',
    text: "Day 1 is dense once we land — three things on Howard St back to back. Can we soften it?",
  },
  {
    who: 'roam',
    text: "Yes — the Sloomoo stop right after check-in is the pinch. Mia will be jet-lagged. I'd thin to two: keep 11 Howard, drop Sloomoo to morning of Day 2 where it has air around it, and let the afternoon breathe.",
  },
  {
    who: 'you',
    text: "what would we do instead with the open afternoon",
  },
];
const CHAT_STREAMING = {
  who: 'roam',
  text: "Closest to the hotel and low-effort: a slow walk through SoHo, coffee at Maman, then arrive at Rubirosa unhurried. I can pull two or three options if you want them on the page",
  streaming: true,
};

function CompanionMasthead({ onClose = true, dense = false, dragHandle = false }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: dense ? '14px 20px 12px' : '20px 24px 16px',
      borderBottom: `1px solid ${ROAM.rule}`,
      position: 'relative',
    }}>
      {dragHandle && (
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          width: 38, height: 4, borderRadius: 2, background: ROAM.ruleStrong,
        }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: dragHandle ? 8 : 0 }}>
        <Ph.Compass size={16} color={ROAM.sienna} sw={1.3}/>
        <Italic size={dense ? 17 : 19} weight={500}>Roam · Companion</Italic>
      </div>
      {onClose && (
        <button style={{
          width: 28, height: 28, border: 'none', background: 'transparent',
          cursor: 'pointer', color: ROAM.caption, padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Ph.X size={15} color={ROAM.caption} sw={1.4} />
        </button>
      )}
    </div>
  );
}

// Reusable chat body
function CompanionChat({ withProposal = false, narrow = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {CHAT_LEADUP.map((t, i) => <ChatTurn key={i} {...t} />)}
      <ChatTurn {...CHAT_STREAMING} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// MOBILE
// ═════════════════════════════════════════════════════════════════

// 3A · Full-screen
function Container_M_Full() {
  return (
    <IOSDevice width={390} height={844} dark={false}>
      <div style={{ position: 'absolute', inset: 0, background: ROAM.parchment, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 50 }} />
        <CompanionMasthead dense />
        <div style={{ flex: 1, overflow: 'hidden', padding: '20px 24px 14px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <CompanionChat />
          </div>
          <ChatComposer />
        </div>
        <div style={{ height: 34 }} />
      </div>
    </IOSDevice>
  );
}

// 3B · Bottom sheet expanded (trip peek above)
function Container_M_Sheet() {
  return (
    <IOSDevice width={390} height={844} dark={false}>
      {/* Trip dimmed behind */}
      <TripDayMobile dimmed />
      {/* Sheet over the bottom — takes ~78% of viewport */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        height: '78%',
        background: ROAM.parchment,
        borderTopLeftRadius: 18, borderTopRightRadius: 18,
        boxShadow: '0 -10px 40px rgba(26,26,46,0.18), 0 -1px 0 rgba(26,26,46,0.12)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <CompanionMasthead dense dragHandle onClose={false} />
        <div style={{ flex: 1, overflow: 'hidden', padding: '18px 22px 12px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <CompanionChat />
          </div>
          <ChatComposer />
        </div>
        <div style={{ height: 24 }} />
      </div>
    </IOSDevice>
  );
}

// 3C · Side overlay (slides from right)
function Container_M_Side() {
  return (
    <IOSDevice width={390} height={844} dark={false}>
      <TripDayMobile dimmed />
      {/* Panel pinned to right, ~86% width */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, right: 0,
        width: '86%',
        background: ROAM.parchment,
        boxShadow: '-12px 0 36px rgba(26,26,46,0.18), -1px 0 0 rgba(26,26,46,0.12)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ height: 50 }} />
        <CompanionMasthead dense />
        <div style={{ flex: 1, overflow: 'hidden', padding: '18px 22px 12px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <CompanionChat />
          </div>
          <ChatComposer />
        </div>
        <div style={{ height: 34 }} />
      </div>
    </IOSDevice>
  );
}

// ═════════════════════════════════════════════════════════════════
// DESKTOP
// ═════════════════════════════════════════════════════════════════

// Companion panel content — used by 4A/4C
function CompanionPanelBody({ withClose = true, dragHandle = false, width }) {
  return (
    <div style={{
      width, height: '100%',
      background: ROAM.parchment,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <CompanionMasthead onClose={withClose} dragHandle={dragHandle} dense />
      <div style={{ flex: 1, overflow: 'hidden', padding: '22px 26px 16px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <CompanionChat />
        </div>
        <ChatComposer />
      </div>
    </div>
  );
}

// 4A · Right side panel
function Container_D_SidePanel() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <TripDesktop chrome={{
        sidePanel: (
          <div style={{
            flex: '0 0 440px', borderLeft: `1px solid ${ROAM.ruleStrong}`,
            background: ROAM.parchment,
          }}>
            <CompanionPanelBody width={440} />
          </div>
        ),
      }} />
    </div>
  );
}

// 4B · Full-screen — companion replaces the trip view (with "back to trip")
function Container_D_Full() {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: ROAM.parchment, display: 'flex', flexDirection: 'column',
      fontFamily: UI_FONT,
    }}>
      {/* Slim top bar with back link + masthead */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 28px', borderBottom: `1px solid ${ROAM.rule}`,
      }}>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: ROAM.caption,
        }}>
          <Ph.CaretLeft size={12} color={ROAM.caption} sw={1.5} />
          <span style={{ fontFamily: UI_FONT, fontSize: 13, color: ROAM.caption, letterSpacing: '-0.005em' }}>
            Back to New York
          </span>
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Ph.Compass size={16} color={ROAM.sienna} sw={1.3} />
          <Italic size={19} weight={500}>Roam · Companion</Italic>
        </div>
        <div style={{ flex: 1 }} />
        <SmallCaps size={10} color={ROAM.captionSoft}>Day 1 · Thursday, 23 July</SmallCaps>
      </div>
      {/* Editorial column — chat centered at ~640w */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', justifyContent: 'center' }}>
        <div style={{
          width: 720, maxWidth: '100%',
          display: 'flex', flexDirection: 'column',
          padding: '38px 56px 22px',
        }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <CompanionChat />
          </div>
          <ChatComposer />
        </div>
      </div>
    </div>
  );
}

// 4C · Bottom drawer — companion as a band across the bottom; map above
function Container_D_Drawer() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <TripDesktop chrome={{
        sidePanel: (
          // Use the sidePanel slot but position absolute to span the bottom
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            height: '60%',
            background: ROAM.parchment,
            borderTop: `1px solid ${ROAM.ruleStrong}`,
            boxShadow: '0 -10px 32px rgba(26,26,46,0.10)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Drag handle + masthead row */}
            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
                width: 44, height: 4, borderRadius: 2, background: ROAM.ruleStrong,
              }} />
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '20px 32px 14px',
              borderBottom: `1px solid ${ROAM.rule}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Ph.Compass size={16} color={ROAM.sienna} sw={1.3}/>
                <Italic size={19} weight={500}>Roam · Companion</Italic>
                <span style={{ fontFamily: UI_FONT, fontSize: 12.5, color: ROAM.caption, marginLeft: 8 }}>
                  Day 1 · Thursday, 23 July
                </span>
              </div>
              <button style={{
                width: 28, height: 28, border: 'none', background: 'transparent',
                cursor: 'pointer', color: ROAM.caption, padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Ph.X size={15} color={ROAM.caption} sw={1.4} />
              </button>
            </div>
            {/* Two-column body — chat left, scratchpad-style hint right */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
              <div style={{ flex: 1, padding: '22px 32px 16px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <CompanionChat />
                </div>
                <ChatComposer />
              </div>
              <div style={{
                width: 280, flex: '0 0 280px', borderLeft: `1px solid ${ROAM.rule}`,
                background: ROAM.parchmentTint, padding: '22px 22px',
              }}>
                <SmallCaps size={9.5} color={ROAM.caption}>This conversation</SmallCaps>
                <div style={{ marginTop: 14 }}>
                  <Italic size={15} weight={500}>Reshaping Day 1's afternoon</Italic>
                </div>
                <div style={{ fontFamily: UI_FONT, fontSize: 12.5, color: ROAM.caption, marginTop: 6, lineHeight: 1.5 }}>
                  Started · 2:14 PM · 4 turns
                </div>
                <div style={{ marginTop: 22, paddingTop: 14, borderTop: `1px solid ${ROAM.rule}` }}>
                  <SmallCaps size={9.5} color={ROAM.caption}>Earlier today</SmallCaps>
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {['Where to land on Day 2', 'Mia & long flights', 'Brooklyn or Williamsburg dinner'].map(t => (
                      <div key={t} style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 14, color: ROAM.label, letterSpacing: '-0.005em' }}>{t}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ),
        dim: true,
      }} />
    </div>
  );
}

Object.assign(window, {
  Container_M_Full, Container_M_Sheet, Container_M_Side,
  Container_D_SidePanel, Container_D_Full, Container_D_Drawer,
  CompanionMasthead, CompanionChat, CompanionPanelBody,
  CHAT_LEADUP, CHAT_STREAMING,
});
