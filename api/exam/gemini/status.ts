import { modelStatusHandler } from '../../../server/productionApi.js';
import { GEMINI_MODEL } from '../../../server/examAstra.js';
export default modelStatusHandler(GEMINI_MODEL, 'GEMINI_API_KEY');
