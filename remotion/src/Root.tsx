import { Composition } from "remotion";
import { FPS, HEIGHT, SLATE_SECONDS, WIDTH } from "./constants";
import { SlateScene } from "./scenes/SlateScene";
import { DemoVideo, TOTAL_SECONDS } from "./Video";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="TandemDemo" component={DemoVideo} durationInFrames={Math.round(TOTAL_SECONDS * FPS)} fps={FPS} width={WIDTH} height={HEIGHT} />
      {/* "Built with" slate, to put after the recorded live demo */}
      <Composition id="Credits" component={SlateScene} durationInFrames={Math.round(SLATE_SECONDS * FPS)} fps={FPS} width={WIDTH} height={HEIGHT} />
    </>
  );
};
