"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// src/ai/GeminiProvider.ts
// Talks to Google's Gemini API
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiProvider = void 0;
const Logger_1 = require("../utils/Logger");
class GeminiProvider {
    apiKey;
    model;
    logger;
    constructor(apiKey, model = "gemini-pro") {
        this.apiKey = apiKey;
        this.model = model;
        this.logger = Logger_1.Logger.getInstance();
    }
    async isAvailable() {
        try {
            const url = `https://generativelanguage.googleapis.com/v1/models?key=${this.apiKey}`;
            const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    async complete(prompt) {
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
        const data = (await response.json());
        if (!response.ok) {
            throw new Error(`Gemini API error: ${data.error?.message}`);
        }
        return data.candidates[0]?.content.parts[0]?.text || "";
    }
}
exports.GeminiProvider = GeminiProvider;
//# sourceMappingURL=GeminiProvider.js.map