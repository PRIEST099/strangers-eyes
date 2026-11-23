import { Composition } from 'remotion';
import narration from '../scripts/narration.json';
import timings from '../public/timings.json';
import { StrangersEyes } from './Video';
import { FPS, PAD_SECONDS } from './theme';

const t = timings as Record<string, number>;

/** A scene lasts its narration plus a short pad (frames). */
export const sceneFrames = (id: string): number => Math.ceil(((t[id] ?? 4) + PAD_SECONDS) * FPS);

export const Root = () => {
  const total = narration.scenes.reduce((sum, s) => sum + sceneFrames(s.id), 0);
  return <Composition id="StrangersEyes" component={StrangersEyes} durationInFrames={total} fps={FPS} width={1920} height={1080} />;
};
