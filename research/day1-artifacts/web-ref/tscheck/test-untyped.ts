import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from 'firebase/ai';
import { initializeApp } from 'firebase/app';
const ai = getAI(initializeApp({}), { backend: new GoogleAIBackend() });
const model = getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE });
// Old v12-style part without `type` discriminator: does it type-check in v13?
model.generateContent(['Describe', { inlineData: { data: 'abc', mimeType: 'image/png' } }]);
