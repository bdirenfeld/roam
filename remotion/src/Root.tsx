import { Composition } from "remotion";
import { RoamExplainer, TOTAL_FRAMES, FPS } from "./RoamExplainer";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="RoamExplainer"
      component={RoamExplainer}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1080}
      height={1920}
    />
  );
};
