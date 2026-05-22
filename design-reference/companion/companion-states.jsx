// Roam · Companion — streaming & response states + composer states
// Same iOS frame and chat skeleton as the container variants — what
// changes is the state of the conversation. Lets the user see how
// "live, flowing conversation" actually reads at rest.

// ═════════════════════════════════════════════════════════════════
// STREAMING / RESPONSE STATES
// ═════════════════════════════════════════════════════════════════

// A small editorial "tool notice" that sits inline as a stage direction.
// Used while Roam is looking something up. Italic Playfair, indented,
// no spinner — three trailing dots is enough.
function ToolNotice({ children, dotted = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0 14px' }}>
      <div style={{ width: 18, height: 1, background: ROAM.ruleStrong }} />
      <span style={{
        fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontWeight: 400,
        fontSize: 13, color: ROAM.caption, letterSpacing: '-0.005em',
      }}>
        {children}
        {dotted && (
          <span style={{ marginLeft: 6, letterSpacing: '0.3em', color: ROAM.captionSoft }}>· · ·</span>
        )}
      </span>
    </div>
  );
}

// Citation footer — a sienna-underlined reference under a Roam reply.
function Citation({ source, detail }) {
  return (
    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 18, height: 1, background: ROAM.sienna, opacity: 0.6 }} />
      <span style={{
        fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 12.5,
        color: ROAM.sienna, letterSpacing: '-0.005em',
      }}>
        {source}
      </span>
      {detail && (
        <span style={{ fontFamily: UI_FONT, fontSize: 12, color: ROAM.captionSoft, letterSpacing: '0.02em' }}>
          · {detail}
        </span>
      )}
    </div>
  );
}

// Shared shell for the streaming state artboards
function StreamingFrame({ children, composer }) {
  return (
    <IOSDevice width={390} height={844} dark={false}>
      <div style={{ position: 'absolute', inset: 0, background: ROAM.parchment, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 50 }} />
        <CompanionMasthead dense />
        <div style={{ flex: 1, overflow: 'hidden', padding: '20px 22px 12px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>{children}</div>
          {composer || <ChatComposer />}
        </div>
        <div style={{ height: 34 }} />
      </div>
    </IOSDevice>
  );
}

// 9A · Mid-stream caret — Roam typing a reply token by token
function State_Streaming() {
  return (
    <StreamingFrame>
      <ChatTurn who="you" text="what would mia love most on day 2 — porcelain studio in rome was a hit" dense />
      <ChatTurn who="roam" streaming dense
        text="Then the through-line is small makers, things she can put her hands on. Lower East Side has three I'd lean on: Wing on Wo (porcelain & tea, 40-min walk-in)" />
    </StreamingFrame>
  );
}

// 9B · Looking-up — italic stage-direction notice in the middle of Roam's reply
function State_LookingUp() {
  return (
    <StreamingFrame>
      <ChatTurn who="you" text="is the tenement museum a kid thing on sundays" dense />
      <ChatTurn who="roam" dense text="One second — let me check Sunday's calendar." />
      <ToolNotice>reading tenement.org / calendar</ToolNotice>
    </StreamingFrame>
  );
}

// 9C · Asks-back — Roam responds with a question, not an action.
// This is the "thinking partner" beat.
function State_AsksBack() {
  return (
    <StreamingFrame>
      <ChatTurn who="you" text="ok day 2 then. start small, get harder" dense />
      <ChatTurn who="roam" dense
        text="Good shape. Before I sketch — is Mia OK with a 25-minute walk between two stops if it's a calm one through Chinatown, or are we cabbing? Decides whether I lean on Wing on Wo or the Tenement Museum first." />
    </StreamingFrame>
  );
}

// 9D · With citation — Roam streams a fact and footnotes the source
function State_Citation() {
  return (
    <StreamingFrame>
      <ChatTurn who="you" text="tenement museum sundays — is that a thing for a seven-year-old" dense />
      <ChatTurn who="roam" dense
        text="Mostly the family-tour track on Sundays, 11 AM and 2 PM only — the regular guided walks are adults-only. The 11 is the calmer one. I'd grab that.">
        <Citation source="tenement.org / family-tours" detail="checked just now" />
      </ChatTurn>
    </StreamingFrame>
  );
}

// ═════════════════════════════════════════════════════════════════
// COMPOSER STATES
// ═════════════════════════════════════════════════════════════════

// Composer with a card chip pinned above the input — what happens
// when the user drags a place from the day into the chat. Acts as
// scope: "ask Roam about THIS card."
function ContextChip({ icon: Icon, label, kind, removable = true }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '6px 10px 6px 8px',
      background: ROAM.parchmentTint,
      border: `1px solid ${ROAM.ruleStrong}`,
      borderRadius: 999,
      fontFamily: UI_FONT,
    }}>
      {Icon && (
        <div style={{
          width: 20, height: 20, borderRadius: '50%',
          background: ROAM.parchmentDeep, color: ROAM.ink,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={11} sw={1.4} />
        </div>
      )}
      {kind && (
        <span style={{
          fontSize: 9.5, fontWeight: 500, letterSpacing: '0.18em',
          textTransform: 'uppercase', color: ROAM.captionSoft,
        }}>{kind}</span>
      )}
      <span style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 13.5, color: ROAM.ink, letterSpacing: '-0.005em' }}>
        {label}
      </span>
      {removable && (
        <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: ROAM.captionSoft, marginLeft: 2 }}>
          <Ph.X size={11} color={ROAM.captionSoft} sw={1.4} />
        </button>
      )}
    </div>
  );
}

// Custom composer that takes a "chips above" slot and a "typing" mode.
function ChatComposerStated({ chips, typed, placeholder = 'Think aloud with Roam…' }) {
  return (
    <div style={{ paddingTop: 14, borderTop: `1px solid ${ROAM.rule}` }}>
      {chips && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingBottom: 12 }}>
          {chips}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, padding: '6px 0' }}>
        <div style={{ flex: 1, minHeight: 30, display: 'flex', alignItems: 'center' }}>
          {typed
            ? (
              <span style={{ fontFamily: UI_FONT, fontSize: 15.5, color: ROAM.ink, letterSpacing: '-0.005em', display: 'inline-flex', alignItems: 'center' }}>
                {typed}
                <span style={{
                  display: 'inline-block', width: 1.5, height: 18, background: ROAM.ink, marginLeft: 2,
                  animation: 'roam-caret 1s steps(2) infinite',
                }} />
              </span>
            )
            : <span style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic', fontSize: 16, color: ROAM.captionSoft }}>{placeholder}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: ROAM.caption }}>
          <SmallCaps size={9.5} color={ROAM.captionSoft}>Return to send</SmallCaps>
          <Ph.CornerDownLeft size={13} color={ROAM.caption} sw={1.5} />
        </div>
      </div>
    </div>
  );
}

// Shared shell for composer-state mobile frames — chat above is constant
// so the user can compare the composer alone.
function ComposerFrame({ composer, chatTrail }) {
  return (
    <IOSDevice width={390} height={844} dark={false}>
      <div style={{ position: 'absolute', inset: 0, background: ROAM.parchment, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 50 }} />
        <CompanionMasthead dense />
        <div style={{ flex: 1, overflow: 'hidden', padding: '20px 22px 12px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <ChatTurn who="you" text="day 1 is dense once we land — three things on howard st back to back" dense />
            <ChatTurn who="roam" dense
              text="Yes — the Sloomoo stop right after check-in is the pinch. Mia will be jet-lagged. I'd thin to two and let the afternoon breathe." />
            {chatTrail}
          </div>
          {composer}
        </div>
        <div style={{ height: 34 }} />
      </div>
    </IOSDevice>
  );
}

// 10A · Typing — user mid-thought
function State_ComposerTyping() {
  return (
    <ComposerFrame
      composer={<ChatComposerStated typed="what would mia love most on day 2" />}
    />
  );
}

// 10B · Attached card chip — user dragged Sloomoo into the chat to ask
//       about that card specifically.
function State_ComposerCardChip() {
  return (
    <ComposerFrame
      composer={
        <ChatComposerStated
          chips={<ContextChip icon={Ph.Flag} kind="Visit" label="Sloomoo Institute" />}
          placeholder="What about this one?"
        />
      }
    />
  );
}

// 10C · Day-scoped context chip — companion opened from a specific day
//       carries a quiet scope chip.
function State_ComposerDayScope() {
  return (
    <ComposerFrame
      composer={
        <ChatComposerStated
          chips={<ContextChip icon={Ph.Notebook} kind="In context" label="Day 1 · Thursday" />}
          placeholder="Think aloud about Day 1…"
        />
      }
    />
  );
}

Object.assign(window, {
  ToolNotice, Citation, ContextChip, ChatComposerStated,
  State_Streaming, State_LookingUp, State_AsksBack, State_Citation,
  State_ComposerTyping, State_ComposerCardChip, State_ComposerDayScope,
});
