# Adding the voiceover

The explainer auto-fits its timeline to a narration track when one is present.

- **No audio present** → renders silent at `FALLBACK_FRAMES` (~28s). This is the
  default and always works.
- **Audio present** → the composition reads the MP3's duration in
  `Root.tsx` (`calculateMetadata`), stretches the seven scenes across it in
  proportion to `SCENE_WEIGHTS`, and plays the track. No manual retiming.

## Finish the voiced cut

The narration was generated with Higgsfield TTS (voice: Alistair, ElevenLabs
model). The audio lives on Higgsfield's CDN, which the Claude-on-web sandbox
cannot reach (`x-deny-reason: host_not_allowed`), so the last step happens
wherever you have open network access:

1. Download the generated MP3 from your Higgsfield workspace
   (job `c52ef8b4-2db1-4d23-9a8f-9917ba885318`).
2. Save it as `remotion/public/voiceover.mp3`.
3. `npm run render` → `out/roam-explainer.mp4`, now voiced and auto-timed.

Alternatively, allowlist `d1xarpci4ikg0w.cloudfront.net` (and `remotion.media`)
in the environment's network egress settings and the whole pipeline runs inside
a web session.

## Script

> This is Roam — a quieter way to plan the journeys that matter most.
> Begin with a name and a place. Roam holds it in preparation, until the details arrive.
> Lay the trip out, day by day — each one a page of its own.
> Then add what belongs: the hotel, the table, the flight.
> See every place on the map, and take in a day at a glance.
> And when you're unsure, ask your Companion — a considered second opinion.
> Roam. Every journey, beautifully kept.
