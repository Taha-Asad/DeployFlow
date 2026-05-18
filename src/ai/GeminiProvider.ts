// ─────────────────────────────────────────────────────────────────────────────
// src/ai/GeminiProvider.ts
// Talks to Google's Gemini API
// ─────────────────────────────────────────────────────────────────────────────

import { AIProvider } from "./AIManager";
import { Logger } from "../utils/Logger";

export class GeminiProvider implements AIProvider {
  private apiKey: string;
  private model: string;
  private logger: Logger;

  constructor(apiKey: string, model: string = "gemini-pro") {
    this.apiKey = apiKey;
    this.model = model;
    this.logger = Logger.getInstance();
  }

  public async isAvailable(): Promise<boolean> {
    try {
      const url = `https://generativelanguage.googleapis.com/v1/models?key=${this.apiKey}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return response.ok;
    } catch {
      return false;
    }
  }

  public async complete(prompt: string): Promise<string> {
    this.logger.debug(`Calling Gemini (${this.model})...`);

    const url = `https://generativelanguage.googleapis.com/v1/models/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
        },
      }),
      signal: AbortSignal.timeout(120000),
    });

    const data = (await response.json()) as {
      candidates: Array<{
        content: { parts: Array<{ text: string }> };
      }>;
      error?: { message: string };
    };

    if (!response.ok) {
      throw new Error(`Gemini API error: ${data.error?.message}`);
    }

    return data.candidates[0]?.content.parts[0]?.text || "";
  }
}
