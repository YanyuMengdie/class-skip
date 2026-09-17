import { modelHandler } from '../../server/productionApi';
import { requestImagesAstra } from '../../server/imagesAstra';
export default modelHandler({ key: 'OPENAI_API_KEY', maxBytes: 100_000, request: requestImagesAstra });
