import { Composition } from "remotion";
import { FPS, HEIGHT, WIDTH } from "./constants";
import { DemoVideo, TOTAL_SECONDS } from "./Video";

export const RemotionRoot: React.FC = () => {
  return <Composition id="TandemDemo" component={DemoVideo} durationInFrames={Math.round(TOTAL_SECONDS * FPS)} fps={FPS} width={WIDTH} height={HEIGHT} />;
};
