import { AbsoluteFill, Audio, Series, staticFile } from 'remotion';
import narration from '../scripts/narration.json';
import timings from '../public/timings.json';
import { Subtitles } from './anim';
import { sceneFrames } from './Root';
import { SCENES } from './scenes';
import { C, FONT } from './theme';

const T = timings as Record<string, number>;

export const StrangersEyes = () => (
  <AbsoluteFill style={{ backgroundColor: C.bg, color: C.fg, fontFamily: FONT }}>
    <Series>
      {narration.scenes.map((s) => {
        const Scene = SCENES[s.id];
        return (
          <Series.Sequence key={s.id} durationInFrames={sceneFrames(s.id)} name={s.id}>
            <Audio src={staticFile(`audio/${s.id}.wav`)} />
            {Scene ? <Scene /> : null}
            <Subtitles text={s.text} seconds={T[s.id] ?? 4} />
          </Series.Sequence>
        );
      })}
    </Series>
  </AbsoluteFill>
);
