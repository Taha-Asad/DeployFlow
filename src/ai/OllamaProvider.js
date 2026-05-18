"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// src/ai/OllamaProvider.ts
// Talks to a locally running Ollama instance
// Ollama runs AI models locally — no API key needed, fully private
// Install Ollama: https://ollama.ai | Run: ollama serve
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaProvider = void 0;
const Logger_1 = require("../utils/Logger");
class OllamaProvider {
    baseUrl; // e.g., "http://localhost:11434"
    model; // e.g., "codellama", "llama2", "mistral"
    logger;
    constructor(baseUrl, model) {
        this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
        this.model = model;
        this.logger = Logger_1.Logger.getInstance();
    }
    // ── Check if Ollama is running ───────────────────────────────────────
    async isAvailable() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`, {
                signal: AbortSignal.timeout(5000),
            });
            return response.ok;
        }
        catch {
            this.logger.warn(`Ollama is not running at ${this.baseUrl}. Start it with: ollama serve`);
            return false;
        }
    }
    // ── Check if the configured model is pulled locally ──────────────────
    async modelExists() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`, {
                signal: AbortSignal.timeout(5000),
            });
            if (!response.ok) {
                return false;
            }
            const data = (await response.json());
            return data.models.some((m) => m.name === this.model ||
                m.name === `${this.model}:latest` ||
                m.name.startsWith(`${this.model}:`));
        }
        catch {
            return false;
        }
    }
    // ── Send a prompt and get a response ─────────────────────────────────
    async complete(prompt) {
        this.logger.debug(`Calling Ollama (${this.model})...`);
        this.logger.debug(`Prompt length: ${prompt.length} characters`);
        try {
            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: this.model,
                    prompt: prompt,
                    // stream: false means we wait for the full response
                    // (vs streaming tokens one by one)
                    stream: false,
                    options: {
                        // Temperature 0 = deterministic, focused answers
                        // Higher = more creative but less reliable
                        temperature: 0.1,
                        // How many tokens to generate (1 token ≈ 4 characters)
                        num_predict: 4096,
                        // Stop generating at these strings
                        stop: ["```\n\n", "Human:", "User:"],
                    },
                }),
                // Ollama can be slow for large models — 5 minute timeout
                signal: AbortSignal.timeout(300000),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Ollama API error (${response.status}): ${errorText}`);
            }
            const data = (await response.json());
            if (data.error) {
                throw new Error(`Ollama error: ${data.error}`);
            }
            this.logger.debug(`Ollama response received (${data.response.length} chars)`);
            return data.response;
        }
        catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                throw new Error(`Ollama request timed out. The model may be too slow. ` +
                    `Try a smaller model like "mistral" or "codellama:7b".`);
            }
            throw error;
        }
    }
    // ── List all available models ─────────────────────────────────────────
    // Bonus utility method — used in the setup wizard
    async listModels() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`, {
                signal: AbortSignal.timeout(5000),
            });
            if (!response.ok) {
                return [];
            }
            const data = (await response.json());
            return data.models.map((m) => m.name);
        }
        catch {
            return [];
        }
    }
    // ── Pull a model (download it) ────────────────────────────────────────
    // Runs: ollama pull <model>
    async pullModel(onProgress) {
        try {
            const response = await fetch(`${this.baseUrl}/api/pull`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: this.model, stream: true }),
                signal: AbortSignal.timeout(600000), // 10 minutes to download
            });
            if (!response.ok) {
                return false;
            }
            // Read the streaming response
            const reader = response.body?.getReader();
            if (!reader) {
                return false;
            }
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                const text = decoder.decode(value);
                const lines = text.split("\n").filter((l) => l.trim());
                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);
                        if (onProgress) {
                            const pct = data.completed && data.total
                                ? Math.round((data.completed / data.total) * 100)
                                : 0;
                            onProgress(`${data.status}${pct ? ` (${pct}%)` : ""}`);
                        }
                    }
                    catch {
                        // Skip malformed JSON lines
                    }
                }
            }
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.OllamaProvider = OllamaProvider;
//# sourceMappingURL=OllamaProvider.js.map