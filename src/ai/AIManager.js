"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// src/ai/AIManager.ts
// Routes AI requests to the correct provider based on user settings
// ─────────────────────────────────────────────────────────────────────────────
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIManager = void 0;
const vscode = __importStar(require("vscode"));
const Logger_1 = require("../utils/Logger");
const OllamaProvider_1 = require("./OllamaProvider");
const OpenAIProvider_1 = require("./OpenAIProvider");
const AnthropicProvider_1 = require("./AnthropicProvider");
const GeminiProvider_1 = require("./GeminiProvider");
class AIManager {
    configManager;
    secretManager;
    logger;
    // Cache the provider so we don't re-create it on every request
    cachedProvider = null;
    constructor(configManager, secretManager) {
        this.configManager = configManager;
        this.secretManager = secretManager;
        this.logger = Logger_1.Logger.getInstance();
    }
    // ── Get the active AI provider ────────────────────────────────────────
    // Creates the right provider based on user settings
    // Does NOT cache — re-reads settings each call so config changes take effect immediately
    async getProvider() {
        const providerName = this.configManager.getAiProvider();
        this.logger.info(`Using AI provider: ${providerName}`);
        switch (providerName) {
            case "openai": {
                const key = await this.secretManager.getAiKey("openai");
                if (!key) {
                    this.warnFallback("OpenAI", "No API key configured");
                    return this.fallbackToOllama();
                }
                this.cachedProvider = new OpenAIProvider_1.OpenAIProvider(key);
                break;
            }
            case "anthropic": {
                const key = await this.secretManager.getAiKey("anthropic");
                if (!key) {
                    this.warnFallback("Anthropic", "No API key configured");
                    return this.fallbackToOllama();
                }
                this.cachedProvider = new AnthropicProvider_1.AnthropicProvider(key);
                break;
            }
            case "gemini": {
                const key = await this.secretManager.getAiKey("gemini");
                if (!key) {
                    this.warnFallback("Gemini", "No API key configured");
                    return this.fallbackToOllama();
                }
                this.cachedProvider = new GeminiProvider_1.GeminiProvider(key);
                break;
            }
            default:
            case "ollama": {
                const url = this.configManager.getOllamaUrl();
                const model = this.configManager.getOllamaModel();
                const ollamaProvider = new OllamaProvider_1.OllamaProvider(url, model);
                // Check if Ollama is running
                const ollamaRunning = await ollamaProvider.isAvailable();
                if (!ollamaRunning) {
                    this.warnFallback("Ollama", `Not reachable at ${url}`);
                    return this.fallbackToOllama();
                }
                // Check if the model is pulled; auto-pull if missing
                const modelAvailable = await ollamaProvider.modelExists();
                if (!modelAvailable) {
                    this.logger.info(`Model "${model}" not found locally. Auto-pulling...`);
                    const pulled = await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: `Downloading AI model "${model}"...`,
                        cancellable: false,
                    }, async () => {
                        return ollamaProvider.pullModel((status) => {
                            this.logger.debug(`Ollama pull: ${status}`);
                        });
                    });
                    if (!pulled) {
                        this.warnFallback("Ollama", `Failed to pull model "${model}"`);
                        return this.fallbackToOllama();
                    }
                    this.logger.info(`Model "${model}" pulled successfully.`);
                }
                this.cachedProvider = ollamaProvider;
                return ollamaProvider;
            }
        }
        const available = await this.cachedProvider.isAvailable();
        if (!available) {
            this.warnFallback(providerName, "Provider is not reachable");
            return this.fallbackToOllama();
        }
        return this.cachedProvider;
    }
    // ── Show user-visible warning when falling back ─────────────────────
    warnFallback(provider, reason) {
        const msg = `⚠️ ${provider} unavailable (${reason}). Falling back to Ollama — check your settings.`;
        this.logger.warn(msg);
        vscode.window.showWarningMessage(msg, "Configure AI").then((action) => {
            if (action === "Configure AI") {
                vscode.commands.executeCommand("deployflow.configure");
            }
        });
    }
    async fallbackToOllama() {
        const url = this.configManager.getOllamaUrl();
        const model = this.configManager.getOllamaModel();
        const ollamaProvider = new OllamaProvider_1.OllamaProvider(url, model);
        try {
            const running = await ollamaProvider.isAvailable();
            if (!running) {
                throw new Error(`Ollama is not running at ${url}. Start it with: ollama serve`);
            }
            const exists = await ollamaProvider.modelExists();
            if (!exists) {
                const pulled = await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Downloading AI model "${model}" (may take several minutes)...`,
                    cancellable: true,
                }, async (_, token) => {
                    token.onCancellationRequested(() => {
                        throw new Error("Model download cancelled by user");
                    });
                    return ollamaProvider.pullModel((status) => {
                        this.logger.debug(`Ollama pull: ${status}`);
                    });
                });
                if (!pulled) {
                    throw new Error(`Failed to download model "${model}". ` +
                        `Try manually: ollama pull ${model}`);
                }
            }
            this.cachedProvider = ollamaProvider;
            return ollamaProvider;
        }
        catch (error) {
            this.cachedProvider = null;
            throw error;
        }
    }
    // ── Ask AI to fix a build error ───────────────────────────────────────
    // `errorOutput` is what the build command printed when it failed
    // `projectFiles` is a map of filename → content for context
    async fixBuildError(errorOutput, projectFiles) {
        const provider = await this.getProvider();
        // Build a detailed prompt for the AI
        // The prompt tells the AI exactly what we need
        const prompt = this.buildFixPrompt(errorOutput, projectFiles);
        this.logger.info("Asking AI to analyze build error...");
        this.logger.debug("Prompt length:", prompt.length, "characters");
        // Send the prompt and get the response
        const rawResponse = await provider.complete(prompt);
        this.logger.debug("AI response received, parsing...");
        // Parse the AI's response into our structured format
        return this.parseFixResponse(rawResponse);
    }
    // ── Build the prompt we send to the AI ───────────────────────────────
    MAX_PROMPT_SIZE = 100_000; // characters
    buildFixPrompt(errorOutput, projectFiles) {
        const MAX_ERROR_LENGTH = 15_000;
        const truncatedError = errorOutput.length > MAX_ERROR_LENGTH
            ? errorOutput.slice(0, MAX_ERROR_LENGTH) +
                `\n\n[...truncated, was ${errorOutput.length} chars]`
            : errorOutput;
        let filesContext = "";
        for (const [filePath, content] of projectFiles) {
            filesContext += `\n### File: ${filePath}\n\`\`\`\n${content}\n\`\`\`\n`;
        }
        const prompt = `You are an expert software engineer helping to fix a build error.

## Build Error Output:
\`\`\`
${truncatedError}
\`\`\`

## Project Files:
${filesContext}

## Instructions:
1. Analyze the error carefully
2. Identify the root cause
3. Provide specific file changes to fix it
4. Respond in this EXACT JSON format:

\`\`\`json
{
  "explanation": "Plain English explanation of what's wrong and how to fix it",
  "confidence": 85,
  "patches": [
    {
      "filePath": "src/index.ts",
      "description": "What this change does",
      "oldContent": "the exact current content of the file",
      "newContent": "the fixed content of the file"
    }
  ]
}
\`\`\`

Rules:
- Only suggest changes that will ACTUALLY fix the error
- Keep changes minimal — don't refactor unrelated code
- If you're not sure, set confidence to a low number (< 50)
- The filePath must be a relative path from the project root`;
        if (prompt.length > this.MAX_PROMPT_SIZE) {
            const truncated = prompt.slice(0, this.MAX_PROMPT_SIZE);
            this.logger.warn(`Prompt too large (${prompt.length} chars), truncating to ${this.MAX_PROMPT_SIZE}`);
            return truncated;
        }
        return prompt;
    }
    // ── Parse the AI's response ───────────────────────────────────────────
    parseFixResponse(rawResponse) {
        // Try to extract JSON from the response
        // The AI might wrap it in markdown code blocks like ```json ... ```
        const jsonMatch = rawResponse.match(/```json\s*([\s\S]*?)\s*```/) ||
            rawResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            this.logger.warn("AI response did not contain valid JSON, using raw response");
            return {
                explanation: rawResponse,
                patches: [],
                confidence: 0,
            };
        }
        try {
            const jsonStr = jsonMatch[1] || jsonMatch[0];
            const parsed = JSON.parse(jsonStr);
            // Validate the structure
            return {
                explanation: parsed.explanation || "No explanation provided",
                patches: Array.isArray(parsed.patches) ? parsed.patches : [],
                confidence: typeof parsed.confidence === "number" ? parsed.confidence : 50,
            };
        }
        catch (error) {
            this.logger.error("Failed to parse AI JSON response", error);
            return {
                explanation: "AI response could not be parsed",
                patches: [],
                confidence: 0,
            };
        }
    }
    // ── Ask AI to fix a deployment error ──────────────────────────────────
    async fixDeployError(errorOutput) {
        const provider = await this.getProvider();
        const prompt = this.buildDeployFixPrompt(errorOutput);
        this.logger.info("Asking AI to analyze deployment error...");
        const rawResponse = await provider.complete(prompt);
        this.logger.debug("AI response received, parsing deploy fix...");
        return this.parseDeployFixResponse(rawResponse);
    }
    // ── Build prompt for deployment error fixing ──────────────────────────
    buildDeployFixPrompt(errorOutput) {
        const MAX_ERROR_LENGTH = 15_000;
        const truncatedError = errorOutput.length > MAX_ERROR_LENGTH
            ? errorOutput.slice(0, MAX_ERROR_LENGTH) +
                `\n\n[...truncated, was ${errorOutput.length} chars]`
            : errorOutput;
        const prompt = `You are a DevOps engineer helping to fix a remote server deployment error.

## Deployment Error Output:
\`\`\`
${truncatedError}
\`\`\`

## Instructions:
1. Analyze the error carefully
2. Identify what needs to be installed or configured on the remote server
3. Provide shell commands to fix the issue
4. Respond in this EXACT JSON format:

\`\`\`json
{
  "explanation": "Plain English explanation of the problem and your fix",
  "confidence": 85,
  "remoteCommands": [
    {
      "description": "What this command does (shown to user for approval)",
      "command": "the shell command to run on the remote server",
      "requiresSudo": true
    }
  ]
}
\`\`\`

Rules:
- Only suggest commands that will ACTUALLY fix this specific error
- Use standard Linux commands (Ubuntu/Debian assumed by default)
- If a package needs installing, use apt-get or the appropriate package manager
- If the command must be run as root, set requiresSudo to true
- If you're not sure, set confidence to a low number (< 50)
- Keep commands simple and focused — one task per command`;
        if (prompt.length > this.MAX_PROMPT_SIZE) {
            const truncated = prompt.slice(0, this.MAX_PROMPT_SIZE);
            this.logger.warn(`Deploy fix prompt too large (${prompt.length} chars), truncating to ${this.MAX_PROMPT_SIZE}`);
            return truncated;
        }
        return prompt;
    }
    // ── Parse AI response for deploy fix ──────────────────────────────────
    parseDeployFixResponse(rawResponse) {
        const jsonMatch = rawResponse.match(/```json\s*([\s\S]*?)\s*```/) ||
            rawResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            this.logger.warn("AI response did not contain valid JSON, using raw response");
            return {
                explanation: rawResponse,
                confidence: 0,
                remoteCommands: [],
            };
        }
        try {
            const jsonStr = jsonMatch[1] || jsonMatch[0];
            const parsed = JSON.parse(jsonStr);
            return {
                explanation: parsed.explanation || "No explanation provided",
                confidence: typeof parsed.confidence === "number" ? parsed.confidence : 50,
                remoteCommands: Array.isArray(parsed.remoteCommands)
                    ? parsed.remoteCommands
                    : [],
            };
        }
        catch (error) {
            this.logger.error("Failed to parse AI deploy fix JSON response", error);
            return {
                explanation: "AI response could not be parsed",
                confidence: 0,
                remoteCommands: [],
            };
        }
    }
    // ── Ask AI a general question ─────────────────────────────────────────
    // Used for generating documentation, explaining errors, etc.
    async ask(prompt) {
        const provider = await this.getProvider();
        return await provider.complete(prompt);
    }
    // ── Reset the cached provider ─────────────────────────────────────────
    // Called when settings change
    resetProvider() {
        this.cachedProvider = null;
    }
}
exports.AIManager = AIManager;
//# sourceMappingURL=AIManager.js.map