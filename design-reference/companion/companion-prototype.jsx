// Roam · Companion — clickable walkthrough
// The picks, stitched into one flowing prototype on desktop:
//   2A entry  →  4A side panel  →  conversation streams  →
//   5B inline gate  →  approve / discard ack
//
// Drives a small state machine. Roam's replies stream character by
// character; the user's lines appear at once (the user "sent" them).

const PROTO_SCRIPT = [
  { who: 'you',  text: "shape day 2 around what mia would love — she's into craft, and we ate huge yesterday so something easier" },
  { who: 'roam', text: "Yes — keeping Mia at the centre, not the itinerary. She liked the porcelain studio in Rome, so my instinct is Lower East Side: small makers, easy walking, food on the lighter side." },
  { who: 'you',  text: "yeah let's see it" },
  { who: 'roam', text: "Here's a shape for Day 2. Not locking anything in — see if it reads." },
];

function useScriptPlayer({ open }) {
  const [state, setState] = React.useState({ turnIdx: -1, charIdx: 0, proposal: false, decision: null });
  const timerRef = React.useRef(null);

  // Reset when closed
  React.useEffect(() => {
    if (!open) {
      clearTimeout(timerRef.current);
      setState({ turnIdx: -1, charIdx: 0, proposal: false, decision: null });
      return;
    }
    // Kick off
    setState({ turnIdx: 0, charIdx: 0, proposal: false, decision: null });
  }, [open]);

  // Per-render, schedule the next step.
  React.useEffect(() => {
    if (!open) return;
    if (state.decision) return;

    const turn = PROTO_SCRIPT[state.turnIdx];

    // Past the end of the script — show proposal
    if (!turn) {
      if (!state.proposal) {
        timerRef.current = setTimeout(() => setState(s => ({ ...s, proposal: true })), 380);
        return () => clearTimeout(timerRef.current);
      }
      return;
    }

    // 'you' lines appear at once
    if (turn.who === 'you') {
      if (state.charIdx < turn.text.length) {
        timerRef.current = setTimeout(() => setState(s => ({ ...s, charIdx: turn.text.length })), 220);
      } else {
        timerRef.current = setTimeout(() => setState(s => ({ ...s, turnIdx: s.turnIdx + 1, charIdx: 0 })), 520);
      }
      return () => clearTimeout(timerRef.current);
    }

    // 'roam' lines stream a few chars at a time
    if (turn.who === 'roam') {
      if (state.charIdx < turn.text.length) {
        const step = Math.min(3 + Math.floor(Math.random() * 3), turn.text.length - state.charIdx);
        timerRef.current = setTimeout(() => setState(s => ({ ...s, charIdx: s.charIdx + step })), 22);
      } else {
        timerRef.current = setTimeout(() => setState(s => ({ ...s, turnIdx: s.turnIdx + 1, charIdx: 0 })), 700);
      }
      return () => clearTimeout(timerRef.current);
    }
  }, [open, state]);

  const decide = (decision) => {
    clearTimeout(timerRef.current);
    setState(s => ({ ...s, decision }));
  };

  // Build the visible chat
  const visibleTurns = [];
  for (let i = 0; i < PROTO_SCRIPT.length; i++) {
    if (i > state.turnIdx) break;
    const turn = PROTO_SCRIPT[i];
    const isCurrent = i === state.turnIdx;
    const text = isCurrent ? turn.text.slice(0, state.charIdx) : turn.text;
    const streaming = isCurrent && turn.who === 'roam' && state.charIdx < turn.text.length;
    if (!text) continue;
    visibleTurns.push({ ...turn, text, streaming });
  }

  return { visibleTurns, showProposal: state.proposal, decision: state.decision, decide };
}

// New pin coordinates that "drop in" when the user approves
const NEW_DAY2_PINS = [
  [780, 320], [810, 350], [830, 385], [855, 420], [875, 455],
];

function PrototypeMap({ approved }) {
  return (
    <div style={{ position: 'relative', flex: 1, background: '#EDE7DA', overflow: 'hidden' }}>
      <svg width="100%" height="100%" viewBox="0 0 1080 720" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
        <rect width="1080" height="720" fill="#EDE7DA"/>
        <path d="M-20 220 C 200 200, 360 250, 520 230 S 800 280, 1100 240 L 1100 360 C 880 380, 700 330, 520 360 S 200 320, -20 360 Z" fill="#E2DBC9" opacity="0.6"/>
        <g stroke="rgba(26,26,46,0.08)" strokeWidth="0.8" fill="none">
          {Array.from({length: 12}).map((_, i) => <line key={'v'+i} x1={i*100+30} y1="0" x2={i*100+30} y2="720" />)}
          {Array.from({length: 9}).map((_, i) => <line key={'h'+i} x1="0" y1={i*90+30} x2="1080" y2={i*90+30} />)}
        </g>
        <g fontFamily={UI_FONT} fill="rgba(26,26,46,0.35)" letterSpacing="0.2em" fontSize="10">
          <text x="280" y="160">SOHO</text>
          <text x="640" y="120">EAST VILLAGE</text>
          <text x="780" y="500">L.E.S.</text>
          <text x="200" y="540">TRIBECA</text>
        </g>
        {/* Existing pins */}
        <g>
          {[[300,180],[330,200],[365,210],[290,230],[400,250],[450,220],[480,260],[520,290],[560,250],[620,300],[660,330],[700,310]].map(([x,y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <circle r="10" fill={i % 3 === 0 ? ROAM.ink : ROAM.parchment} stroke={ROAM.ink} strokeWidth="1.2"/>
              {i % 3 !== 0 && <circle r="2.5" fill={ROAM.ink}/>}
            </g>
          ))}
        </g>
        {/* New pins — animate in on approve */}
        <g>
          {NEW_DAY2_PINS.map(([x, y], i) => (
            <g key={'new'+i} transform={`translate(${x} ${y})`}
              style={{
                transition: `transform 500ms cubic-bezier(.2,.7,.3,1) ${i * 90}ms, opacity 400ms ${i * 90}ms`,
                transform: approved ? `translate(${x}px, ${y}px) scale(1)` : `translate(${x}px, ${y + 24}px) scale(0.4)`,
                opacity: approved ? 1 : 0,
                transformOrigin: 'center',
              }}>
              <circle r="13" fill={ROAM.sienna} stroke={ROAM.parchment} strokeWidth="2"/>
              <text x="0" y="2" textAnchor="middle" dominantBaseline="middle" fontFamily={UI_FONT} fontSize="10" fontWeight="600" fill={ROAM.parchment}>{i + 1}</text>
            </g>
          ))}
        </g>
      </svg>
      <div style={{ position: 'absolute', bottom: 10, right: 14 }}>
        <SmallCaps size={9} color={ROAM.captionSoft}>Mapbox</SmallCaps>
      </div>
      {/* Approved toast — quietly editorial */}
      {approved && (
        <div style={{
          position: 'absolute', left: '50%', bottom: 32, transform: 'translateX(-50%)',
          background: ROAM.ink, color: ROAM.parchment,
          padding: '12px 20px', borderRadius: 4,
          display: 'flex', alignItems: 'center', gap: 14,
          boxShadow: '0 12px 30px rgba(26,26,46,0.24)',
          animation: 'roam-toast-in 380ms cubic-bezier(.2,.7,.3,1) both',
        }}>
          <Ph.Check size={14} color={ROAM.parchment} sw={1.6} />
          <span style={{ fontFamily: UI_FONT, fontSize: 13.5, color: ROAM.parchment, letterSpacing: '-0.005em' }}>
            5 places added to Day 2
          </span>
          <span style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 13.5, color: 'rgba(250,247,242,0.7)' }}>
            Undo
          </span>
        </div>
      )}
    </div>
  );
}

// Slide-in side panel — controlled by `open`
function ProtoSidePanel({ open, children }) {
  return (
    <div style={{
      flex: open ? '0 0 480px' : '0 0 0px',
      width: open ? 480 : 0,
      borderLeft: open ? `1px solid ${ROAM.ruleStrong}` : 'none',
      background: ROAM.parchment,
      transition: 'flex-basis 360ms cubic-bezier(.2,.7,.3,1), width 360ms cubic-bezier(.2,.7,.3,1)',
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        width: 480, height: '100%',
        display: 'flex', flexDirection: 'column',
        opacity: open ? 1 : 0,
        transition: 'opacity 220ms ease 80ms',
      }}>
        {children}
      </div>
    </div>
  );
}

function PrototypeApp() {
  const [open, setOpen] = React.useState(false);
  const { visibleTurns, showProposal, decision, decide } = useScriptPlayer({ open });

  const close = () => setOpen(false);

  // Auto-scroll the chat to the bottom as content grows
  const chatBodyRef = React.useRef(null);
  React.useEffect(() => {
    if (chatBodyRef.current) chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
  }, [visibleTurns.length, visibleTurns[visibleTurns.length - 1]?.text?.length, showProposal, decision]);

  return (
    <div style={{
      width: '100%', height: '100%',
      background: ROAM.parchment, display: 'flex', flexDirection: 'column',
      fontFamily: UI_FONT, overflow: 'hidden', position: 'relative',
    }}>
      {/* Top bar with the entry-point link (pick 2A) */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '14px 22px', borderBottom: `1px solid ${ROAM.rule}`,
        background: ROAM.parchment,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Ph.CaretLeft size={13} color={ROAM.ink} />
          <Italic size={20} weight={500}>New York</Italic>
          <span style={{ fontFamily: UI_FONT, fontSize: 13, color: ROAM.caption, marginLeft: 6 }}>
            (Mia & Daddy) · Jul 23 — 26
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 14px', borderRadius: 999,
          background: ROAM.parchmentDeep,
          minWidth: 320, maxWidth: 520,
        }}>
          <Ph.MapPin size={13} color={ROAM.caption} sw={1.3} />
          <span style={{ fontFamily: UI_FONT, fontSize: 13, color: ROAM.captionSoft }}>Search places in New York, NY, USA…</span>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setOpen(true)}
          disabled={open}
          style={{
            display: 'flex', alignItems: 'center', gap: 9,
            background: 'transparent',
            border: 'none', cursor: open ? 'default' : 'pointer',
            padding: '6px 12px',
            borderRight: `1px solid ${ROAM.rule}`,
            marginRight: 6,
            opacity: open ? 0.45 : 1,
            transition: 'opacity 200ms',
          }}>
          <Ph.Compass size={16} color={ROAM.ink} sw={1.3} />
          <span style={{
            fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 500,
            fontSize: 16, color: ROAM.ink, letterSpacing: '-0.005em',
          }}>Companion</span>
        </button>
        <div style={{ width: 30, height: 30, borderRadius: 15, background: ROAM.parchmentDeep, border: `1px solid ${ROAM.rule}` }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', position: 'relative', minHeight: 0 }}>
        <DesktopSidebar />
        <div style={{ flex: 1, position: 'relative', display: 'flex', overflow: 'hidden' }}>
          <PrototypeMap approved={decision === 'approved'} />
        </div>
        <ProtoSidePanel open={open}>
          <CompanionMasthead dense />
          <div ref={chatBodyRef} style={{ flex: 1, overflow: 'auto', padding: '22px 26px 14px' }}>
            {visibleTurns.map((t, i) => {
              const isLast = i === visibleTurns.length - 1;
              const showProposalHere = isLast && showProposal && t.who === 'roam';
              return (
                <ChatTurn key={i} who={t.who} text={t.text} streaming={t.streaming} dense>
                  {showProposalHere && decision == null && <ProposalCardInteractive onDecide={decide} />}
                  {showProposalHere && decision === 'approved' && <ApprovedAck />}
                  {showProposalHere && decision === 'discarded' && <DiscardedAck />}
                </ChatTurn>
              );
            })}
          </div>
          <div style={{ padding: '0 26px 18px' }}>
            <ChatComposer />
          </div>
        </ProtoSidePanel>
      </div>

      {/* Reset button — small affordance bottom-left */}
      <button
        onClick={close}
        style={{
          position: 'absolute', left: 18, bottom: 14,
          background: 'transparent', border: 'none',
          padding: '6px 10px', cursor: 'pointer',
          fontFamily: UI_FONT, fontSize: 11, color: ROAM.captionSoft,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
        <Ph.CornerDownLeft size={12} color={ROAM.captionSoft} sw={1.5} />
        Reset prototype
      </button>
    </div>
  );
}

// Proposal card with actual approve / discard wiring
function ProposalCardInteractive({ onDecide }) {
  return (
    <div style={{
      background: ROAM.parchment,
      border: `1px solid ${ROAM.ruleStrong}`,
      borderRadius: 4, overflow: 'hidden', fontFamily: UI_FONT,
    }}>
      <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${ROAM.rule}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <SmallCaps color={ROAM.sienna} size={9.5}>About to add · Day 2</SmallCaps>
          <SmallCaps color={ROAM.captionSoft} size={9.5}>{PROPOSED_PLACES.length} places</SmallCaps>
        </div>
        <Italic size={17} weight={500}>Lower East Side, around what Mia would love.</Italic>
      </div>
      <div>
        {PROPOSED_PLACES.map((p, i) => {
          const Icon = p.icon;
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
              borderBottom: i < PROPOSED_PLACES.length - 1 ? `1px solid ${ROAM.rule}` : 'none',
              animation: `roam-row-in 320ms cubic-bezier(.2,.7,.3,1) ${i * 80}ms both`,
            }}>
              <div style={{
                flex: '0 0 auto', width: 28, height: 28, borderRadius: '50%',
                border: `1px solid ${ROAM.ruleStrong}`, background: ROAM.parchmentDeep, color: ROAM.ink,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={14} sw={1.3} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: ROAM.captionSoft, marginBottom: 3 }}>{p.kind}</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: ROAM.ink, letterSpacing: '-0.01em' }}>{p.name}</div>
                <div style={{ fontSize: 11.5, color: ROAM.caption, marginTop: 2 }}>{p.meta}</div>
              </div>
              <div style={{ flex: '0 0 auto', color: ROAM.captionSoft, paddingTop: 4 }}>
                <Ph.Plus size={12} color={ROAM.captionSoft} sw={1.4} />
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
          Nothing changes until you approve.
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <button onClick={() => onDecide('discarded')} style={{
            fontFamily: UI_FONT, fontSize: 13, fontWeight: 500, letterSpacing: '-0.005em',
            color: ROAM.caption, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
          }}>Discard</button>
          <button onClick={() => onDecide('approved')} style={{
            fontFamily: UI_FONT, fontSize: 13, fontWeight: 500, letterSpacing: '-0.005em',
            color: ROAM.parchment, background: ROAM.ink, border: 'none', cursor: 'pointer',
            padding: '8px 14px', borderRadius: 6,
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
            Approve
            <Ph.Check size={13} color={ROAM.parchment} sw={1.6} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ApprovedAck() {
  return (
    <div style={{
      background: ROAM.parchmentTint, border: `1px solid ${ROAM.rule}`, borderRadius: 4,
      padding: '14px 16px', fontFamily: UI_FONT,
      animation: 'roam-row-in 320ms cubic-bezier(.2,.7,.3,1) both',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Ph.Check size={14} color={ROAM.ink} sw={1.6} />
          <SmallCaps color={ROAM.label} size={10}>Added · 5 places to Day 2</SmallCaps>
        </div>
        <button style={{
          background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
          fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 13, color: ROAM.sienna,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Ph.CornerDownLeft size={11} color={ROAM.sienna} sw={1.5} />
          Undo
        </button>
      </div>
    </div>
  );
}

function DiscardedAck() {
  return (
    <div style={{
      padding: '10px 0', fontFamily: DISPLAY_FONT, fontStyle: 'italic',
      fontSize: 14, color: ROAM.caption,
      animation: 'roam-row-in 280ms cubic-bezier(.2,.7,.3,1) both',
    }}>
      Discarded — nothing moved. Want me to try a different shape for Day 2?
    </div>
  );
}

// Animation keyframes
if (typeof document !== 'undefined' && !document.getElementById('roam-proto-anim')) {
  const s = document.createElement('style');
  s.id = 'roam-proto-anim';
  s.textContent = `
    @keyframes roam-row-in {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes roam-toast-in {
      from { opacity: 0; transform: translate(-50%, 14px); }
      to   { opacity: 1; transform: translate(-50%, 0); }
    }
  `;
  document.head.appendChild(s);
}

Object.assign(window, {
  PrototypeApp, ProposalCardInteractive, ApprovedAck, DiscardedAck,
  PrototypeMap, ProtoSidePanel, useScriptPlayer,
});
