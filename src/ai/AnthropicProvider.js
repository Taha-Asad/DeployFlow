"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// src/ai/AnthropicProvider.ts
// Talks to Anthropic's Claude API
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnthropicProvider = void 0;
const Logger_1 = require("../utils/Logger");
class AnthropicProvider {
    apiKey;
    model;
    logger;
    constructor(apiKey, model = "claude-3-sonnet-20240229") {
        this.apiKey = apiKey;
        this.model = model;
        this.logger = Logger_1.Logger.getInstance();
    }
    async isAvailable() {
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
        }
        catch {
            return false;
        }
    }
    async complete(prompt) {
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
        const data = (await response.json());
        if (!response.ok) {
            throw new Error(`Anthropic API error: ${data.error?.message}`);
        }
        // Anthropic returns content as an array of blocks
        const textBlock = data.content.find((b) => b.type === "text");
        return textBlock?.text || "";
    }
}
exports.AnthropicProvider = AnthropicProvider;
//# sourceMappingURL=AnthropicProvider.js.map