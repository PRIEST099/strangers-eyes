// web/src/ai/models.ts — the ONLY file that calls getGenerativeModel. No generateContent here.
import { getGenerativeModel, InferenceMode, ThinkingLevel, type AI, type GenerativeModel, type LanguageModelCreateOptions } from 'firebase/ai';

export const NANO_TEXT_IO: LanguageModelCreateOptions = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};
export const NANO_IMAGE_IO: LanguageModelCreateOptions = {
  expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};
type JsonSchema = Record<string, unknown>;
const plain = (s: object): JsonSchema => JSON.parse(JSON.stringify(s)) as JsonSchema;

/** S0/S1 (and S4 device-side) structured job. Instructions travel in the user turn (device ignores systemInstruction). */
export function deviceJsonModel(ai: AI, io: LanguageModelCreateOptions, schema: object): GenerativeModel {
  return getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: { createOptions: io, promptOptions: { responseConstraint: plain(schema) } },
  });
}

/** S4 Judge Mode: same job, but PREFER_ON_DEVICE so judges without Nano see a real cloud fallback. */
export function judgeJsonModel(ai: AI, io: LanguageModelCreateOptions, schema: object, cloudModel: string): GenerativeModel {
  return getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: { createOptions: io, promptOptions: { responseConstraint: plain(schema) } },
    inCloudParams: {
      model: cloudModel,
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: plain(schema), maxOutputTokens: 2048,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
    },
  });
}

/** S2 explainer: public text only; real automatic cloud fallback. */
export function explainModel(ai: AI, system: string, cloudModel: string): GenerativeModel {
  return getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: { createOptions: { ...NANO_TEXT_IO, initialPrompts: [{ role: 'system', content: [{ type: 'text', value: system }] }] } },
    inCloudParams: { model: cloudModel, systemInstruction: system,
      generationConfig: { maxOutputTokens: 512, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } },
  });
}

/** S3 pass A: grounded, streamed, display-only. */
export function adversaryAModel(ai: AI, system: string, model: string, level: ThinkingLevel): GenerativeModel {
  return getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: { model, systemInstruction: system, tools: [{ googleSearch: {} }],
      generationConfig: { maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: level } } },
  });
}

/** S3 pass B: ungrounded structured JSON. Never sees pass A. */
export function adversaryBModel(ai: AI, system: string, model: string, level: ThinkingLevel, schema: object): GenerativeModel {
  return getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: { model, systemInstruction: system,
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: plain(schema), maxOutputTokens: 8192,
        thinkingConfig: { thinkingLevel: level } } },
  });
}

// --- usage sketch that the gate performs (compile check only) ---
import type { InlineDataPart, GroundingMetadata } from 'firebase/ai';
export async function sketch(m: GenerativeModel, text: string, b64: string) {
  const img: InlineDataPart = { type: 'inlineData', inlineData: { data: b64, mimeType: 'image/jpeg' } };
  const r = await m.generateContent([text, img]);
  const src = r.response.inferenceSource;
  const fr = r.response.candidates?.[0]?.finishReason;
  let gm: GroundingMetadata | undefined;
  const { stream, response } = await m.generateContentStream([text, img]);
  for await (const c of stream) { c.text(); gm = c.candidates?.[0]?.groundingMetadata ?? gm; }
  await response;
  return { src, fr, html: gm?.searchEntryPoint?.renderedContent, q: gm?.webSearchQueries, chunks: gm?.groundingChunks?.map(c => c.web?.uri) };
}
