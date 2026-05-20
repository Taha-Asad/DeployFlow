// ─────────────────────────────────────────────────────────────────────────────
// src/ai/AIManager.ts
// Routes AI requests to the correct provider based on user settings
// ─────────────────────────────────────────────────────────────────────────────

import * as vscode from "vscode";
import { ConfigManager } from "../core/ConfigManager";
import { SecretManager } from "../core/SecretManager";
import { Logger } from "../utils/Logger";
import { OllamaProvider } from "./OllamaProvider";
import { OpenAIProvider } from "./OpenAIProvider";
import { AnthropicProvider } from "./AnthropicProvider";
import { GeminiProvider } from "./GeminiProvider";

// Every AI provider implements this interface
// This means they all have the same `complete` method
// so AIManager doesn't care WHICH provider it's talking to
export interface AIProvider {
  // Send a prompt, get a response back
  complete(prompt: string): Promise<string>;
  // Check if this provider is available (e.g., is Ollama running?)
  isAvailable(): Promise<boolean>;
}

// What the AI returns when fixing an error
export interface AIFixResponse {
  explanation: string; // What the AI says in plain English
  patches: FilePatch[]; // The actual code changes
  confidence: number; // 0-100, how confident the AI is
}

// A single file change suggestion
export interface FilePatch {
  filePath: string; // Which file to change
  oldContent: string; // What's currently there (for diff view)
  newContent: string; // What it should be changed to
  description: string; // Plain English explanation of the change
}

// A command to run on the remote server to fix a deploy issue
export interface RemoteCommand {
  description: string; // What this command does (for user approval)
  command: string; // The shell command to run
  requiresSudo: boolean; // Whether it needs root privileges
}

// AI's response when fixing a deployment error
export interface DeployFixResponse {
  explanation: string;
  confidence: number;
  remoteCommands: RemoteCommand[];
}

export class AIManager {
  private configManager: ConfigManager;
  private secretManager: SecretManager;
  private logger: Logger;

  // Cache the provider so we don't re-create it on every request
  private cachedProvider: AIProvider | null = null;

  constructor(configManager: ConfigManager, secretManager: SecretManager) {
    this.configManager = configManager;
    this.secretManager = secretManager;
    this.logger = Logger.getInstance();
  }

  // ── Get the active AI provider ────────────────────────────────────────
  // Creates the right provider based on user settings
  // Does NOT cache — re-reads settings each call so config changes take effect immediately
  private async getProvider(): Promise<AIProvider> {
    const providerName = this.configManager.getAiProvider();
    this.logger.info(`Using AI provider: ${providerName}`);

    switch (providerName) {
      case "openai": {
        const key = await this.secretManager.getAiKey("openai");
        if (!key) {
          this.warnFallback("OpenAI", "No API key configured");
          return this.fallbackToOllama();
        }
        this.cachedProvider = new OpenAIProvider(key);
        break;
      }

      case "anthropic": {
        const key = await this.secretManager.getAiKey("anthropic");
        if (!key) {
          this.warnFallback("Anthropic", "No API key configured");
          return this.fallbackToOllama();
        }
        this.cachedProvider = new AnthropicProvider(key);
        break;
      }

      case "gemini": {
        const key = await this.secretManager.getAiKey("gemini");
        if (!key) {
          this.warnFallback("Gemini", "No API key configured");
          return this.fallbackToOllama();
        }
        this.cachedProvider = new GeminiProvider(key);
        break;
      }

      default:
      case "ollama": {
        const url = this.configManager.getOllamaUrl();
        const model = this.configManager.getOllamaModel();
        const ollamaProvider = new OllamaProvider(url, model);

        // Check if Ollama is running
        const ollamaRunning = await ollamaProvider.isAvailable();
        if (!ollamaRunning) {
          this.warnFallback("Ollama", `Not reachable at ${url}`);
          return this.fallbackToOllama();
        }

        // Check if the model is pulled; auto-pull if missing
        const modelAvailable = await ollamaProvider.modelExists();
        if (!modelAvailable) {
          this.logger.info(
            `Model "${model}" not found locally. Auto-pulling...`,
          );
          const pulled = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Downloading AI model "${model}"...`,
              cancellable: false,
            },
            async () => {
              return ollamaProvider.pullModel((status) => {
                this.logger.debug(`Ollama pull: ${status}`);
              });
            },
          );

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

    const available = await this.cachedProvider!.isAvailable();
    if (!available) {
      this.warnFallback(providerName, "Provider is not reachable");
      return this.fallbackToOllama();
    }

    return this.cachedProvider!;
  }

  // ── Show user-visible warning when falling back ─────────────────────
  private warnFallback(provider: string, reason: string): void {
    const msg = `⚠️ ${provider} unavailable (${reason}). Falling back to Ollama — check your settings.`;
    this.logger.warn(msg);
    vscode.window.showWarningMessage(msg, "Configure AI").then((action) => {
      if (action === "Configure AI") {
        vscode.commands.executeCommand("deployflow.configure");
      }
    });
  }

  private async fallbackToOllama(): Promise<AIProvider> {
    const url = this.configManager.getOllamaUrl();
    const model = this.configManager.getOllamaModel();
    const ollamaProvider = new OllamaProvider(url, model);

    try {
      const running = await ollamaProvider.isAvailable();
      if (!running) {
        throw new Error(
          `Ollama is not running at ${url}. Start it with: ollama serve`,
        );
      }

      const exists = await ollamaProvider.modelExists();
      if (!exists) {
        const pulled = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Downloading AI model "${model}" (may take several minutes)...`,
            cancellable: true,
          },
          async (_, token) => {
            token.onCancellationRequested(() => {
              throw new Error("Model download cancelled by user");
            });
            return ollamaProvider.pullModel((status) => {
              this.logger.debug(`Ollama pull: ${status}`);
            });
          },
        );
        if (!pulled) {
          throw new Error(
            `Failed to download model "${model}". ` +
            `Try manually: ollama pull ${model}`,
          );
        }
      }

      this.cachedProvider = ollamaProvider;
      return ollamaProvider;
    } catch (error) {
      this.cachedProvider = null;
      throw error;
    }
  }

  // ── Ask AI to fix a build error ───────────────────────────────────────
  // `errorOutput` is what the build command printed when it failed
  // `projectFiles` is a map of filename → content for context
  public async fixBuildError(
    errorOutput: string,
    projectFiles: Map<string, string>,
  ): Promise<AIFixResponse> {
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
  private readonly MAX_PROMPT_SIZE = 100_000; // characters
  // Max chars per file in prompt context — prevents one huge file from blowing up memory
  private readonly MAX_FILE_CONTEXT_SIZE = 4_000;

  private buildFixPrompt(
    errorOutput: string,
    projectFiles: Map<string, string>,
  ): string {
    const MAX_ERROR_LENGTH = 15_000;
    const truncatedError =
      errorOutput.length > MAX_ERROR_LENGTH
        ? errorOutput.slice(0, MAX_ERROR_LENGTH) +
          `\n\n[...truncated, was ${errorOutput.length} chars]`
        : errorOutput;

    const fileParts: string[] = [];
    let filesTotal = 0;
    const maxFilesTotal = this.MAX_PROMPT_SIZE - MAX_ERROR_LENGTH - 2000;
    for (const [filePath, content] of projectFiles) {
      const truncated = content.length > this.MAX_FILE_CONTEXT_SIZE
        ? content.slice(0, this.MAX_FILE_CONTEXT_SIZE) +
          `\n[...truncated, was ${content.length} chars]`
        : content;
      const part = `\n### File: ${filePath}\n\`\`\`\n${truncated}\n\`\`\``;
      if (filesTotal + part.length > maxFilesTotal) break;
      fileParts.push(part);
      filesTotal += part.length;
    }
    const filesContext = fileParts.join("");

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
      this.logger.warn(
        `Prompt too large (${prompt.length} chars), truncating to ${this.MAX_PROMPT_SIZE}`,
      );
      return truncated;
    }

    return prompt;
  }

  // ── Parse the AI's response ───────────────────────────────────────────
  private parseFixResponse(rawResponse: string): AIFixResponse {
    // Try to extract JSON from the response
    // The AI might wrap it in markdown code blocks like ```json ... ```
    const jsonMatch =
      rawResponse.match(/```json\s*([\s\S]*?)\s*```/) ||
      rawResponse.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      this.logger.warn(
        "AI response did not contain valid JSON, using raw response",
      );
      return {
        explanation: rawResponse,
        patches: [],
        confidence: 0,
      };
    }

    try {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr) as AIFixResponse;

      // Validate the structure
      return {
        explanation: parsed.explanation || "No explanation provided",
        patches: Array.isArray(parsed.patches) ? parsed.patches : [],
        confidence:
          typeof parsed.confidence === "number" ? parsed.confidence : 50,
      };
    } catch (error) {
      this.logger.error("Failed to parse AI JSON response", error);
      return {
        explanation: "AI response could not be parsed",
        patches: [],
        confidence: 0,
      };
    }
  }

  // ── Ask AI to fix a deployment error ──────────────────────────────────
  public async fixDeployError(
    errorOutput: string,
  ): Promise<DeployFixResponse> {
    const provider = await this.getProvider();
    const prompt = this.buildDeployFixPrompt(errorOutput);
    this.logger.info("Asking AI to analyze deployment error...");
    const rawResponse = await provider.complete(prompt);
    this.logger.debug("AI response received, parsing deploy fix...");
    return this.parseDeployFixResponse(rawResponse);
  }

  // ── Build prompt for deployment error fixing ──────────────────────────
  private buildDeployFixPrompt(errorOutput: string): string {
    const MAX_ERROR_LENGTH = 15_000;
    const truncatedError =
      errorOutput.length > MAX_ERROR_LENGTH
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
      this.logger.warn(
        `Deploy fix prompt too large (${prompt.length} chars), truncating to ${this.MAX_PROMPT_SIZE}`,
      );
      return truncated;
    }

    return prompt;
  }

  // ── Parse AI response for deploy fix ──────────────────────────────────
  private parseDeployFixResponse(rawResponse: string): DeployFixResponse {
    const jsonMatch =
      rawResponse.match(/```json\s*([\s\S]*?)\s*```/) ||
      rawResponse.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      this.logger.warn(
        "AI response did not contain valid JSON, using raw response",
      );
      return {
        explanation: rawResponse,
        confidence: 0,
        remoteCommands: [],
      };
    }

    try {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr) as DeployFixResponse;

      return {
        explanation: parsed.explanation || "No explanation provided",
        confidence:
          typeof parsed.confidence === "number" ? parsed.confidence : 50,
        remoteCommands: Array.isArray(parsed.remoteCommands)
          ? parsed.remoteCommands
          : [],
      };
    } catch (error) {
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
  public async ask(prompt: string): Promise<string> {
    const provider = await this.getProvider();
    return await provider.complete(prompt);
  }

  // ── Reset the cached provider ─────────────────────────────────────────
  // Called when settings change
  public resetProvider(): void {
    this.cachedProvider = null;
  }
}
