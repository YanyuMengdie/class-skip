import { modelHandler } from '../../server/productionApi';
import { requestReadingAstra } from '../../server/readingAstra';
export default modelHandler({ key: 'GEMINI_API_KEY', maxBytes: 48 * 1024 * 1024, request: requestReadingAstra });
