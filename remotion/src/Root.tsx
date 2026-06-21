import { Composition, staticFile } from "remotion";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import { RoamExplainer, FALLBACK_FRAMES, FPS, VOICEOVER_FILE } from "./RoamExplainer";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="RoamExplainer"
      component={RoamExplainer}
      durationInFrames={FALLBACK_FRAMES}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{ hasAudio: false }}
      // Auto-fit the timeline to the voiceover when it's present in public/.
      // When it isn't (e.g. before the MP3 is dropped in), fall back to the
      // silent timing so the project always renders.
      calculateMetadata={async () => {
        try {
          const seconds = await getAudioDurationInSeconds(staticFile(VOICEOVER_FILE));
          return {
            durationInFrames: Math.ceil(seconds * FPS) + FPS, // +1s tail to breathe
            props: { hasAudio: true },
          };
        } catch {
          return { durationInFrames: FALLBACK_FRAMES, props: { hasAudio: false } };
        }
      }}
    />
  );
};
