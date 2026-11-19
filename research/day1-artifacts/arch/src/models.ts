// web/src/ai/models.ts — the ONLY file that calls getGenerativeModel. No generateContent here.
// Device rule (API-NOTES §1.3/§1.7): the device path ignores systemInstruction, generationConfig and tools, so EVERY
// instruction for a device-capable job travels in the first text part of the user turn. systemInstruction is used only
// for the cloud-only adversary (S3).
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
/** Always hand Chrome a PLAIN object (U-04: Schema instances are unverified as responseConstraint). */
const plain = (s: object): JsonSchema => JSON.parse(JSON.stringify(s)) as JsonSchema;

/** S0/S1 structured job (referee, fix plan, vault-text match, pre-screen). */
export function deviceJsonModel(ai: AI, io: LanguageModelCreateOptions, schema: object): GenerativeModel {
  return getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: { createOptions: io, promptOptions: { responseConstraint: plain(schema) } },
  });
}

/** S0 plain-text job: the explainer after a D-15 reclassification (vault text found in an S2 payload). */
export function deviceTextModel(ai: AI): GenerativeModel {
  return getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams: { createOptions: NANO_TEXT_IO } });
}

/** S4 Judge Mode: same job, PREFER_ON_DEVICE so judges without Nano see a real cloud fallback. */
export function judgeJsonModel(ai: AI, io: LanguageModelCreateOptions, schema: object, cloudModel: string, level: ThinkingLevel): GenerativeModel {
  return getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: { createOptions: io, promptOptions: { responseConstraint: plain(schema) } },
    inCloudParams: {
      model: cloudModel,
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: plain(schema), maxOutputTokens: 2048,
        thinkingConfig: { thinkingLevel: level } },
    },
  });
}

/** S2 explainer (and S4 explain in Judge Mode): public text only; real automatic cloud fallback.
 *  `mode` is PREFER_ON_DEVICE normally, ONLY_IN_CLOUD when the user turned Nano off (AC-277). */
export function explainModel(ai: AI, cloudModel: string, level: ThinkingLevel, mode: InferenceMode = InferenceMode.PREFER_ON_DEVICE): GenerativeModel {
  return getGenerativeModel(ai, {
    mode,
    onDeviceParams: { createOptions: NANO_TEXT_IO },
    inCloudParams: { model: cloudModel, generationConfig: { maxOutputTokens: 512, thinkingConfig: { thinkingLevel: level } } },
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

// --- usage sketch of what the gate does (compile check only) ---
import type { InlineDataPart, GroundingMetadata } from 'firebase/ai';
export async function sketch(m: GenerativeModel, text: string, b64: string) {
  const img: InlineDataPart = { type: 'inlineData', inlineData: { data: b64, mimeType: 'image/jpeg' } };
  const r = await m.generateContent([text, img], { timeout: 60_000 });
  const src = r.response.inferenceSource;
  const fr = r.response.candidates?.[0]?.finishReason;
  let gm: GroundingMetadata | undefined;
  const { stream, response } = await m.generateContentStream([text, img], { timeout: 90_000 });
  for await (const c of stream) { c.text(); gm = c.candidates?.[0]?.groundingMetadata ?? gm; }
  await response;
  return { src, fr, html: gm?.searchEntryPoint?.renderedContent, q: gm?.webSearchQueries, chunks: gm?.groundingChunks?.map(c => c.web?.uri) };
}
