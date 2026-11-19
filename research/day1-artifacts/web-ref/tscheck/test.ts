import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  AgentPlatformBackend,
  InferenceMode,
  InferenceSource,
  Schema,
  AIError,
  AIErrorCode,
  ThinkingLevel,
  type InlineDataPart,
  type TextPart,
  type GroundingMetadata,
} from 'firebase/ai';

const app = initializeApp({ apiKey: 'x', projectId: 'p', appId: 'a' });
initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider('site-key'), isTokenAutoRefreshEnabled: true });

const ai = getAI(app, { backend: new GoogleAIBackend() });
const aiVertex = getAI(app, { backend: new AgentPlatformBackend('global') });

const cueSchema = Schema.object({
  properties: {
    summary: Schema.string(),
    risk: Schema.enumString({ enum: ['low', 'medium', 'high'] }),
    items: Schema.array({ items: Schema.string() }),
    confidence: Schema.number(),
  },
  optionalProperties: ['items'],
});

const model = getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_ON_DEVICE,
  onDeviceParams: {
    createOptions: {
      expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
      initialPrompts: [{ role: 'system', content: [{ type: 'text', value: 'You are concise.' }] }],
    },
    promptOptions: { responseConstraint: cueSchema },
  },
  inCloudParams: {
    model: 'gemini-3.5-flash-lite',
    systemInstruction: 'You are concise.',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: cueSchema,
      maxOutputTokens: 1024,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  },
});

async function run(base64: string) {
  await model.initializeDeviceModel((p) => console.log(Math.round(p * 100) + '%'));
  const imagePart: InlineDataPart = { type: 'inlineData', inlineData: { data: base64, mimeType: 'image/jpeg' } };
  const textPart: TextPart = { type: 'text', text: 'Describe' };
  const r = await model.generateContent(['Describe this image', imagePart]);
  const r2 = await model.generateContent([textPart, imagePart]);
  if (r.response.inferenceSource === InferenceSource.ON_DEVICE) console.log('device');
  const json = JSON.parse(r.response.text());
  console.log(json, r2);

  const s = await model.generateContentStream('hello', { signal: new AbortController().signal });
  for await (const chunk of s.stream) console.log(chunk.text(), chunk.inferenceSource);
  const final = await s.response;
  console.log(final.usageMetadata);

  const searchModel = getGenerativeModel(ai, { model: 'gemini-3.8-flash', tools: [{ googleSearch: {} }] });
  const g = await searchModel.generateContent('news');
  const gm: GroundingMetadata | undefined = g.response.candidates?.[0]?.groundingMetadata;
  const html = gm?.searchEntryPoint?.renderedContent;
  const queries = gm?.webSearchQueries;
  const chunks = gm?.groundingChunks?.map((c) => c.web?.uri);
  const supports = gm?.groundingSupports?.map((s) => [s.segment?.text, s.groundingChunkIndices]);
  console.log(html, queries, chunks, supports);

  try {
    const strict = getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE });
    await strict.generateContent('x');
  } catch (e) {
    if (e instanceof AIError && (e.code === AIErrorCode.UNSUPPORTED || e.code === AIErrorCode.API_NOT_ENABLED)) console.log(e.code);
  }
  console.log(aiVertex);
}
run('');
