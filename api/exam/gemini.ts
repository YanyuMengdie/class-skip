import { modelHandler } from '../../server/productionApi.js';
import { requestExamAstra } from '../../server/examAstra.js';
export default modelHandler({ key: 'GEMINI_API_KEY', maxBytes: 2_000_000, request: requestExamAstra });
