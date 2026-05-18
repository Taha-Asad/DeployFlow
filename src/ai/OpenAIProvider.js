"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// src/ai/OpenAIProvider.ts
// Talks to OpenAI's GPT API (GPT-4, GPT-3.5-turbo)
// Requires an API key from platform.openai.com
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIProvider = void 0;
const Logger_1 = require("../utils/Logger");
class OpenAIProvider {
    apiKey;
    model;
    logger;
    constructor(apiKey, model = "gpt-4-turbo-preview") {
        this.apiKey = apiKey;
        this.model = model;
        this.logger = Logger_1.Logger.getInstance();
    }
    async isAvailable() {
        try {
            // Check by hitting the models endpoint
            const response = await fetch("https://api.openai.com/v1/models", {
                headers: { Authorization: `Bearer ${this.apiKey}` },
                signal: AbortSignal.timeout(5000),
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    async complete(prompt) {
        this.logger.debug(`Calling OpenAI (${this.model})...`);
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: this.model,
                messages: [
                    {
                        role: "system",
                        content: "You are an expert DevOps engineer and software developer. You provide precise, working solutions to build and deployment problems.",
                    },
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                temperature: 0.1, // Stay focused, not creative
                max_tokens: 4096, // Response length limit
            }),
            signal: AbortSignal.timeout(120000),
        });
        const data = (await response.json());
        if (!response.ok) {
            throw new Error(`OpenAI API error: ${data.error?.message || response.statusText}`);
        }
        return data.choices[0]?.message?.content || "";
    }
}
exports.OpenAIProvider = OpenAIProvider;
//# sourceMappingURL=OpenAIProvider.js.map