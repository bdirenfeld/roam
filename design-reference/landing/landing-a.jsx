// landing-a.jsx — Direction A · "The Plate"
// Photo-led, near-single-screen gateway. Aesop/Monocle restraint + Polarsteps
// feeling. The photograph carries the hero; the three phases are a compressed
// triptych on one short scroll. Shortest, most restrained.

const { ROAM, UI_FONT, DISPLAY_FONT, PHOTOS, Ph, GoogleButton, Wordmark, Italic, SmallCaps, Body, Terms, Photo, PriceLine } = window;
const { RoamDay, RoamMap, RoamBoard } = window;

// A framed Roam screen "plate" — rounded screenshot crop, hairline + soft shadow.
function ScreenPlate({ screen, w, h, radius = 16 }) {
  const Screen = screen;
  return (
    <div style={{
      width: w, height: h, borderRadius: radius, overflow: 'hidden',
      border: `1px solid ${ROAM.ruleStrong}`,
      boxShadow: '0 1px 2px rgba(26,26,46,0.04), 0 24px 50px -28px rgba(26,26,46,0.32)',
      background: ROAM.parchment, flex: '0 0 auto',
    }}>
      <Screen scale={w / 390} tabs={false} />
    </div>
  );
}

const PHASES_A = [
  { n: 'i',   word: 'Brainstorm', screen: RoamMap,   line: 'Throw down every place you might want to go. From a friend, a blog, a link — it all lands on one map.' },
  { n: 'ii',  word: 'Decide',     screen: RoamBoard, line: 'Figure out what you’ll actually do. Pull each place into a day, and watch the trip take shape.' },
  { n: 'iii', word: 'Go',         screen: RoamDay,   line: 'Then just follow your agenda — each place in order, one day at a time.' },
];

// ═══════════════════════════════════════════════════════════════════
// DESKTOP
// ═══════════════════════════════════════════════════════════════════
function LandingADesktop() {
  return (
    <div style={{ width: 1440, background: ROAM.parchment, fontFamily: UI_FONT, color: ROAM.ink }}>

      {/* ── HERO — full-bleed photograph, gateway card bottom-left ── */}
      <div style={{ position: 'relative', width: '100%', height: 812 }}>
        <Photo src={PHOTOS.amalfi} position="50% 52%" style={{ position: 'absolute', inset: 0 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(26,26,46,0.40) 0%, rgba(26,26,46,0.05) 26%, rgba(26,26,46,0.12) 64%, rgba(26,26,46,0.45) 100%)' }} />

        {/* masthead */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '34px 56px' }}>
          <Wordmark size={28} color={ROAM.parchment} />
        </div>

        {/* gateway card */}
        <div style={{ position: 'absolute', left: 56, bottom: 64, width: 560 }}>
          <div style={{ width: 46, height: 2, background: ROAM.sienna, borderRadius: 1, marginBottom: 26 }} />
          <div style={{ marginBottom: 22 }}>
            <Italic size={62} weight={500} lh={1.04} color={ROAM.parchment}>Plan your&nbsp;own trip.</Italic>
          </div>
          <div style={{ maxWidth: 470, marginBottom: 34 }}>
            <Body size={18} lh={1.6} color="rgba(250,247,242,0.92)">
              The things you want, the trip you'll love.
            </Body>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
            <GoogleButton skin="light" size="lg" />
          </div>
          <div style={{ color: 'rgba(250,247,242,0.70)' }}><Terms color="rgba(250,247,242,0.70)" /></div>
        </div>

        <div style={{ position: 'absolute', right: 40, bottom: 30 }}>
          <SmallCaps color="rgba(250,247,242,0.85)" size={10}>The Amalfi Coast · last light over Positano</SmallCaps>
        </div>
      </div>

      {/* ── THREE PHASES — compressed triptych ── */}
      <div style={{ padding: '104px 56px 96px' }}>
        <div style={{ maxWidth: 760, marginBottom: 72 }}>
          <SmallCaps color={ROAM.sienna} size={11}>How it works</SmallCaps>
          <div style={{ marginTop: 18 }}>
            <Italic size={40} weight={500} lh={1.12}>Brainstorm, decide, go.</Italic>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 48 }}>
          {PHASES_A.map((p) => (
            <div key={p.word} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 18 }}>
                <Italic size={20} color={ROAM.sienna} weight={500}>{p.n}</Italic>
                <span style={{ flex: 1, height: 1, background: ROAM.rule }} />
                <Italic size={24} weight={500}>{p.word}</Italic>
              </div>
              <div style={{ marginBottom: 22 }}>
                <Body size={15} lh={1.62} color={ROAM.inkSoft}>{p.line}</Body>
              </div>
              <ScreenPlate screen={p.screen} w={376} h={360} />
            </div>
          ))}
        </div>
      </div>

      {/* ── CLOSE ── */}
      <div style={{ background: ROAM.ink, padding: '92px 56px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 60, flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 600 }}>
            <Italic size={46} weight={500} lh={1.14} color={ROAM.parchment}>Start with the next place you want to go.</Italic>
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <GoogleButton skin="light" size="lg" />
            <div style={{ marginTop: 16, maxWidth: 320 }}>
              <Body size={12.5} lh={1.5} color="rgba(250,247,242,0.55)">$10, paid once after you sign in.</Body>
            </div>
            <div style={{ marginTop: 10, maxWidth: 320 }}><Terms color="rgba(250,247,242,0.62)" /></div>
          </div>
        </div>
      </div>

      <div style={{ padding: '34px 56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Wordmark size={20} />
        <SmallCaps color={ROAM.captionSoft} size={10}>© Roam 2026</SmallCaps>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MOBILE
// ═══════════════════════════════════════════════════════════════════
function LandingAMobile() {
  return (
    <div style={{ width: 390, background: ROAM.parchment, fontFamily: UI_FONT, color: ROAM.ink }}>

      {/* HERO — full-bleed photo */}
      <div style={{ position: 'relative', width: '100%', height: 620 }}>
        <Photo src={PHOTOS.amalfi} position="50% 52%" style={{ position: 'absolute', inset: 0 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(26,26,46,0.42) 0%, rgba(26,26,46,0.04) 30%, rgba(26,26,46,0.58) 100%)' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 22px' }}>
          <Wordmark size={24} color={ROAM.parchment} />
        </div>
        <div style={{ position: 'absolute', left: 22, right: 22, bottom: 30 }}>
          <div style={{ width: 38, height: 2, background: ROAM.sienna, borderRadius: 1, marginBottom: 16 }} />
          <Italic size={40} weight={500} lh={1.05} color={ROAM.parchment}>Plan your own trip.</Italic>
          <div style={{ marginTop: 16 }}>
            <Body size={15.5} lh={1.58} color="rgba(250,247,242,0.92)">The things you want, the trip you'll love.</Body>
          </div>
        </div>
      </div>

      {/* CTA on parchment, right under the photo */}
      <div style={{ padding: '26px 22px 8px' }}>
        <GoogleButton skin="dark" full size="md" />
      </div>

      {/* THREE PHASES — stacked */}
      <div style={{ padding: '52px 22px 40px' }}>
        <SmallCaps color={ROAM.sienna} size={10}>How it works</SmallCaps>
        <div style={{ marginTop: 14, marginBottom: 38 }}>
          <Italic size={30} weight={500} lh={1.14}>Brainstorm, decide, go.</Italic>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 44 }}>
          {PHASES_A.map((p) => (
            <div key={p.word}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
                <Italic size={17} color={ROAM.sienna} weight={500}>{p.n}</Italic>
                <span style={{ flex: 1, height: 1, background: ROAM.rule }} />
                <Italic size={21} weight={500}>{p.word}</Italic>
              </div>
              <div style={{ marginBottom: 18 }}><Body size={14.5} lh={1.6} color={ROAM.inkSoft}>{p.line}</Body></div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <ScreenPlate screen={p.screen} w={300} h={300} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PRICE + CLOSE band */}
      <div style={{ background: ROAM.ink, padding: '48px 22px' }}>
        <Italic size={31} weight={500} lh={1.14} color={ROAM.parchment}>Start with the next place you want to go.</Italic>
        <div style={{ marginTop: 24 }}><GoogleButton skin="light" full size="md" /></div>
        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <Body size={12} lh={1.5} color="rgba(250,247,242,0.55)">$10, paid once after you sign in.</Body>
        </div>
        <div style={{ marginTop: 10 }}><Terms color="rgba(250,247,242,0.62)" align="center" /></div>
      </div>

      <div style={{ padding: '24px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Wordmark size={18} />
        <SmallCaps color={ROAM.captionSoft} size={9}>© Roam 2026</SmallCaps>
      </div>
    </div>
  );
}

Object.assign(window, { LandingADesktop, LandingAMobile });
