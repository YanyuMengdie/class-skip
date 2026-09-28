// Keep explicit .js extensions for the emitted Node ESM functions on Vercel.
import { modelHandler } from '../../server/productionApi.js';
import { requestReadingAstra } from '../../server/readingAstra.js';
export default modelHandler({ key: 'GEMINI_API_KEY', maxBytes: 48 * 1024 * 1024, request: requestReadingAstra });
