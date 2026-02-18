
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.API_KEY || "";
const ai = new GoogleGenAI({ apiKey: apiKey });

// Helper to convert Base64 string to Blob
const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
};

/**
 * Generates a character avatar based on a text prompt.
 * Uses 'gemini-3-pro-image-preview' for high-quality results.
 */
export const generateCharacterAvatar = async (userPrompt: string): Promise<Blob> => {
  console.log("🎨 [ImageGen] Starting character generation for:", userPrompt);
  
  try {
    const fullPrompt = `
      A high-quality, anime-style character portrait (visual novel sprite) of: ${userPrompt}.
      
      Style Requirements:
      - Japanese anime style (Galgame/Visual Novel aesthetic).
      - **SOLID PURE WHITE BACKGROUND** (Critical: No checkerboard, no transparency, just #FFFFFF).
      - High resolution, vibrant colors.
      - Upper body or bust shot.
      - Facing forward or slightly to the side, looking at the viewer.
      - No text, no speech bubbles.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: { parts: [{ text: fullPrompt }] },
      config: {
        imageConfig: {
          aspectRatio: "1:1", 
          imageSize: "1K"
        }
      },
    });

    return extractImageFromResponse(response);
  } catch (error) {
    console.error("❌ [ImageGen] Character Failed:", error);
    throw error; 
  }
};

/**
 * Generates a scenic background for Galgame mode.
 */
export const generateGalgameBackground = async (userPrompt: string): Promise<Blob> => {
  console.log("🏙️ [ImageGen] Starting background generation for:", userPrompt);
  
  try {
    const fullPrompt = `
      A high-quality, anime-style background art (visual novel scenery) of: ${userPrompt}.
      
      Style Requirements:
      - Makoto Shinkai style (vibrant lighting, detailed clouds/nature/interiors).
      - 16:9 Landscape composition.
      - No characters, just scenery.
      - High resolution, atmospheric.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: { parts: [{ text: fullPrompt }] },
      config: {
        imageConfig: {
          aspectRatio: "16:9", 
          imageSize: "1K"
        }
      },
    });

    return extractImageFromResponse(response);
  } catch (error) {
    console.error("❌ [ImageGen] Background Failed:", error);
    throw error; 
  }
};

const extractImageFromResponse = (response: any): Blob => {
    let base64Data: string | null = null;
    let mimeType = 'image/png';

    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          base64Data = part.inlineData.data;
          mimeType = part.inlineData.mimeType || 'image/png';
          break;
        }
      }
    }

    if (!base64Data) {
      throw new Error("No image data found in response");
    }

    console.log("✅ [ImageGen] Generation successful.");
    return base64ToBlob(base64Data, mimeType);
};
