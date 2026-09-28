import { modelHandler } from '../../server/productionApi.js';
import { requestImagesAstra } from '../../server/imagesAstra.js';
export default modelHandler({ key: 'OPENAI_API_KEY', maxBytes: 100_000, request: requestImagesAstra });
