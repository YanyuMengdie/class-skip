import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import {
  createElevenLabsRealtimeToken,
  ElevenLabsTranscriptionError,
  transcribeWithElevenLabs,
} from './server/elevenlabsTranscription';

const readRequestBody = async (request: NodeJS.ReadableStream): Promise<Uint8Array> => {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
};

const getHeader = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
};

const parseKeyterms = (value: string): string[] => {
  if (!value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

const elevenLabsTranscriptionProxy = (apiKey: string): Plugin => ({
  name: 'class-skip-elevenlabs-transcription-proxy',
  configureServer(server) {
    server.middlewares.use('/api/elevenlabs/realtime-token', async (request, response) => {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
      if (request.method !== 'POST') {
        response.statusCode = 405;
        response.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      try {
        const token = await createElevenLabsRealtimeToken(apiKey);
        response.statusCode = 200;
        response.end(JSON.stringify({ token }));
      } catch (error) {
        response.statusCode = error instanceof ElevenLabsTranscriptionError ? error.status : 500;
        response.end(JSON.stringify({
          error: error instanceof Error ? error.message : 'Unable to start realtime transcription',
        }));
      }
    });

    server.middlewares.use('/api/elevenlabs/transcribe', async (request, response) => {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (request.method !== 'POST') {
        response.statusCode = 405;
        response.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      try {
        const result = await transcribeWithElevenLabs({
          apiKey,
          audio: await readRequestBody(request),
          mimeType: getHeader(request.headers['content-type']),
          fileName: decodeURIComponent(getHeader(request.headers['x-file-name']) || 'lecture-audio.webm'),
          languageCode: getHeader(request.headers['x-language-code']),
          numSpeakers: Number(getHeader(request.headers['x-num-speakers'])) || undefined,
          keyterms: parseKeyterms(getHeader(request.headers['x-keyterms'])),
        });
        response.statusCode = 200;
        response.end(JSON.stringify(result));
      } catch (error) {
        response.statusCode = error instanceof ElevenLabsTranscriptionError ? error.status : 500;
        response.end(JSON.stringify({
          error: error instanceof Error ? error.message : 'Transcription failed',
        }));
      }
    });
  },
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3001,
        host: '127.0.0.1',
      },
      plugins: [elevenLabsTranscriptionProxy(env.ELEVENLABS_API_KEY || ''), react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
