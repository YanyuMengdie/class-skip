import {
  createElevenLabsRealtimeToken,
  ElevenLabsTranscriptionError,
} from '../../server/elevenlabsTranscription';

export default async function handler(request: any, response: any) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const token = await createElevenLabsRealtimeToken(process.env.ELEVENLABS_API_KEY || '');
    response.setHeader('Cache-Control', 'no-store');
    response.status(200).json({ token });
  } catch (error) {
    const status = error instanceof ElevenLabsTranscriptionError ? error.status : 500;
    response.status(status).json({
      error: error instanceof Error ? error.message : 'Unable to start realtime transcription',
    });
  }
}
