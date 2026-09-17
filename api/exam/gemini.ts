import { modelHandler } from '../../server/productionApi';
import { requestExamAstra } from '../../server/examAstra';
export default modelHandler({ key: 'GEMINI_API_KEY', maxBytes: 2_000_000, request: requestExamAstra });
