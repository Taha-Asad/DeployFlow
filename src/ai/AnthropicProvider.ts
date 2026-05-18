// ─────────────────────────────────────────────────────────────────────────────
// src/ai/AnthropicProvider.ts
// Talks to Anthropic's Claude API
// ─────────────────────────────────────────────────────────────────────────────

import { AIProvider } from "./AIManager";
import { Logger } from "../utils/Logger";

export class AnthropicProvider implements AIProvider {
  private apiKey: string;
  private model: string;
  private logger: Logger;

  constructor(apiKey: string, model: string = "claude-3-sonnet-20240229") {
    this.apiKey = apiKey;
    this.model = model;
    this.logger = Logger.getInstance();
  }

  public async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        // Tiny test message to check connectivity
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
        signal: AbortSignal.timeout(5000),
      });
      // 200 or 400 (bad request format) both mean the API key works
      return response.ok || response.status === 400;
    } catch {
      return false;
    }
  }

  public async complete(prompt: string): Promise<string> {
    this.logger.debug(`Calling Anthropic (${this.model})...`);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(120000),
    });

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
      error?: { message: string };
    };

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${data.error?.message}`);
    }

    // Anthropic returns content as an array of blocks
    const textBlock = data.content.find((b) => b.type === "text");
    return textBlock?.text || "";
  }
}
