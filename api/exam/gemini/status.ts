import { modelStatusHandler } from '../../../server/productionApi';
import { GEMINI_MODEL } from '../../../server/examAstra';
export default modelStatusHandler(GEMINI_MODEL, 'GEMINI_API_KEY');
