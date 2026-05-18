// ─────────────────────────────────────────────────────────────────────────────
// src/ai/ErrorFixer.ts
// Orchestrates the AI-powered build error fixing loop
// Strategy: run build → if error → ask AI → apply fix → repeat (up to N times)
// ─────────────────────────────────────────────────────────────────────────────

import * as path from "path";
import * as vscode from "vscode";
import { AIManager, AIFixResponse, FilePatch, RemoteCommand, DeployFixResponse } from "./AIManager";
import { FileUtils } from "../utils/FileUtils";
import { Logger } from "../utils/Logger";
import { ConfigManager } from "../core/ConfigManager";

// What ErrorFixer reports back after each fix attempt
export interface FixAttemptResult {
  attemptNumber: number;
  success: boolean;
  errorOutput?: string;
  fixApplied?: AIFixResponse;
  userApproved?: boolean;
}

// Summary of the entire fix session
export interface FixSessionResult {
  success: boolean;
  totalAttempts: number;
  fixedBy?: string; // Which attempt fixed it
  finalError?: string;
}

export class ErrorFixer {
  private aiManager: AIManager;
  private fileUtils: FileUtils;
  private logger: Logger;
  private configManager: ConfigManager;

  constructor(aiManager: AIManager, configManager: ConfigManager) {
    this.aiManager = aiManager;
    this.fileUtils = new FileUtils();
    this.logger = Logger.getInstance();
    this.configManager = configManager;
  }

  // ── Main Fix Loop ─────────────────────────────────────────────────────
  // `buildFn` is a function that runs the build and returns error output
  // We call it multiple times — each time after applying a fix
  public async fixBuildErrors(
    projectPath: string,
    errorOutput: string,
    buildFn: () => Promise<{ success: boolean; error: string }>,
    onProgress: (msg: string) => void,
    showDiff: (patch: FilePatch) => Promise<boolean>, // Returns true if user approves
  ): Promise<FixSessionResult> {
    const maxAttempts = this.configManager.getMaxFixAttempts();

    this.logger.info(`Starting AI fix loop (max ${maxAttempts} attempts)...`);

    let currentError = errorOutput;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      onProgress(
        `🤖 AI Fix Attempt ${attempt}/${maxAttempts}: Analyzing error...`,
      );
      this.logger.info(`Fix attempt ${attempt}/${maxAttempts}`);

      // ── 1. Gather context files ──────────────────────────────────
      // We send relevant files to the AI so it understands the project
      const contextFiles = await this.gatherContextFiles(
        projectPath,
        currentError,
      );

      // ── 2. Ask AI for a fix ──────────────────────────────────────
      let fixResponse: AIFixResponse;
      try {
        fixResponse = await this.aiManager.fixBuildError(
          currentError,
          contextFiles,
        );
      } catch (aiError) {
        this.logger.error("AI request failed", aiError);
        onProgress(`❌ AI request failed: ${aiError}`);
        return {
          success: false,
          totalAttempts: attempt,
          finalError: currentError,
        };
      }

      this.logger.info(
        `AI confidence: ${fixResponse.confidence}% | ` +
          `Patches: ${fixResponse.patches.length}`,
      );
      onProgress(
        `💡 AI found ${fixResponse.patches.length} fix(es) with ${fixResponse.confidence}% confidence`,
      );
      onProgress(`📝 AI says: ${fixResponse.explanation}`);

      // ── 3. Show diff and ask user to approve ────────────────────
      if (fixResponse.patches.length === 0) {
        onProgress(
          "⚠️ AI could not determine a fix. Check the error manually.",
        );
        return {
          success: false,
          totalAttempts: attempt,
          finalError: currentError,
        };
      }

      // Apply each patch after user approval
      const approvedPatches: FilePatch[] = [];
      for (const patch of fixResponse.patches) {
        const approved = await showDiff(patch);
        if (approved) {
          approvedPatches.push(patch);
        } else {
          onProgress(`⏭️ Skipped patch for ${patch.filePath}`);
        }
      }

      if (approvedPatches.length === 0) {
        onProgress("❌ All patches rejected by user. Stopping fix loop.");
        return {
          success: false,
          totalAttempts: attempt,
          finalError: currentError,
        };
      }

      // ── 4. Apply approved patches ────────────────────────────────
      await this.applyPatches(projectPath, approvedPatches, onProgress);

      // ── 5. Save error log for analysis ───────────────────────────
      await this.saveErrorLog(projectPath, attempt, currentError, fixResponse);

      // ── 6. Retry the build ───────────────────────────────────────
      onProgress(`🔨 Retrying build after fix...`);
      const buildResult = await buildFn();

      if (buildResult.success) {
        // 🎉 Build passed!
        onProgress(`✅ Build succeeded after ${attempt} fix attempt(s)!`);
        return {
          success: true,
          totalAttempts: attempt,
          fixedBy: `attempt-${attempt}`,
        };
      }

      // Build still failing — prepare for next attempt
      currentError = buildResult.error;
      onProgress(
        `⚠️ Build still failing after fix. ${
          attempt < maxAttempts ? "Trying again..." : "Max attempts reached."
        }`,
      );
    }

    return {
      success: false,
      totalAttempts: maxAttempts,
      finalError: currentError,
    };
  }

  // ── Deploy Error Fix Loop ────────────────────────────────────────────
  // `deployFn` re-runs the deploy step
  // `runRemoteCommand` executes a shell command on the target server
  public async fixDeployErrors(
    errorOutput: string,
    runRemoteCommand: (command: string) => Promise<string>,
    deployFn: () => Promise<{ success: boolean; error: string }>,
    onProgress: (msg: string) => void,
  ): Promise<FixSessionResult> {
    const maxAttempts = this.configManager.getMaxFixAttempts();

    this.logger.info(
      `Starting AI deploy fix loop (max ${maxAttempts} attempts)...`,
    );

    let currentError = errorOutput;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      onProgress(
        `🤖 AI Deploy Fix Attempt ${attempt}/${maxAttempts}: Analyzing error...`,
      );
      this.logger.info(`Deploy fix attempt ${attempt}/${maxAttempts}`);

      // ── 1. Ask AI for a fix ──────────────────────────────────────
      let fixResponse: DeployFixResponse;
      try {
        fixResponse = await this.aiManager.fixDeployError(currentError);
      } catch (aiError) {
        this.logger.error("AI request failed", aiError);
        onProgress(`❌ AI request failed: ${aiError}`);
        return {
          success: false,
          totalAttempts: attempt,
          finalError: currentError,
        };
      }

      this.logger.info(
        `AI confidence: ${fixResponse.confidence}% | ` +
          `Commands: ${fixResponse.remoteCommands.length}`,
      );
      onProgress(
        `💡 AI found ${fixResponse.remoteCommands.length} fix(es) with ${fixResponse.confidence}% confidence`,
      );
      onProgress(`📝 AI says: ${fixResponse.explanation}`);

      // ── 2. If no fix suggested, stop ─────────────────────────────
      if (fixResponse.remoteCommands.length === 0) {
        onProgress(
          "⚠️ AI could not determine a fix. Check the error manually.",
        );
        return {
          success: false,
          totalAttempts: attempt,
          finalError: currentError,
        };
      }

      // ── 3. Get user approval for each command ────────────────────
      const approvedCommands: RemoteCommand[] = [];
      for (const cmd of fixResponse.remoteCommands) {
        const prefix = cmd.requiresSudo ? "🔒 [sudo]" : "";
        const approve = await vscode.window.showInformationMessage(
          `${prefix} AI suggests: ${cmd.description}\n\nCommand: ${cmd.command}`,
          { modal: true },
          "Run",
          "Skip",
        );

        if (approve === "Run") {
          approvedCommands.push(cmd);
        } else {
          onProgress(`⏭️ Skipped: ${cmd.description}`);
        }
      }

      if (approvedCommands.length === 0) {
        onProgress("❌ All commands rejected by user. Stopping fix loop.");
        return {
          success: false,
          totalAttempts: attempt,
          finalError: currentError,
        };
      }

      // ── 4. Execute approved commands on remote server ────────────
      for (const cmd of approvedCommands) {
        const fullCommand = cmd.requiresSudo ? `sudo ${cmd.command}` : cmd.command;
        onProgress(`🔧 Running: ${cmd.description}...`);
        this.logger.info(`Executing remote command: ${fullCommand}`);

        try {
          const output = await runRemoteCommand(fullCommand);
          this.logger.debug(`Command output: ${output.substring(0, 200)}`);
          onProgress(`✅ ${cmd.description}`);
        } catch (cmdError) {
          const errMsg =
            cmdError instanceof Error ? cmdError.message : String(cmdError);
          this.logger.error(`Remote command failed: ${fullCommand}`, cmdError);
          onProgress(`❌ Command failed: ${errMsg}`);
          return {
            success: false,
            totalAttempts: attempt,
            finalError: `Remote command failed: ${errMsg}`,
          };
        }
      }

      // ── 5. Save error log ───────────────────────────────────────
      await this.saveDeployErrorLog(attempt, currentError, fixResponse);

      // ── 6. Retry the deploy ─────────────────────────────────────
      onProgress(`🚀 Retrying deployment after fix...`);
      const deployResult = await deployFn();

      if (deployResult.success) {
        onProgress(
          `✅ Deployment succeeded after ${attempt} fix attempt(s)!`,
        );
        return {
          success: true,
          totalAttempts: attempt,
          fixedBy: `attempt-${attempt}`,
        };
      }

      currentError = deployResult.error;
      onProgress(
        `⚠️ Deployment still failing after fix. ${
          attempt < maxAttempts ? "Trying again..." : "Max attempts reached."
        }`,
      );
    }

    return {
      success: false,
      totalAttempts: maxAttempts,
      finalError: currentError,
    };
  }

  // ── Save deploy error log for debugging ────────────────────────────────
  private async saveDeployErrorLog(
    attempt: number,
    errorOutput: string,
    fix: DeployFixResponse,
  ): Promise<void> {
    try {
      const logsDir = path.join(
        this.configManager.getWorkspaceFolder() || ".",
        ".deployflow",
        "error-logs",
      );
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const logPath = path.join(
        logsDir,
        `deploy-error-attempt-${attempt}-${timestamp}.json`,
      );

      const logData = {
        timestamp: new Date().toISOString(),
        attempt,
        errorOutput,
        aiExplanation: fix.explanation,
        confidence: fix.confidence,
        commands: fix.remoteCommands.map((c) => ({
          description: c.description,
          command: c.command,
          requiresSudo: c.requiresSudo,
        })),
      };

      await this.fileUtils.writeFile(logPath, JSON.stringify(logData, null, 2));
    } catch (error) {
      this.logger.warn("Failed to save deploy error log", error);
    }
  }

  // ── Gather relevant files to send to AI as context ────────────────────
  // We don't send ALL files — just the ones likely related to the error
  private async gatherContextFiles(
    projectPath: string,
    errorOutput: string,
  ): Promise<Map<string, string>> {
    const files = new Map<string, string>();

    // ── Always include these key config files ────────────────────────
    const alwaysInclude = [
      "package.json",
      "tsconfig.json",
      "tsconfig.*.json",
      "webpack.config.js",
      "webpack.config.ts",
      "vite.config.js",
      "vite.config.ts",
      "requirements.txt",
      "pyproject.toml",
      "pom.xml",
      "build.gradle",
      "go.mod",
      "Cargo.toml",
      "Dockerfile",
      ".env.example",
    ];

    for (const filename of alwaysInclude) {
      const filePath = path.join(projectPath, filename);
      const content = await this.fileUtils.readFile(filePath);
      if (content) {
        files.set(filename, content);
      }
    }

    // ── Extract file names mentioned in the error output ──────────────
    // Errors often say things like "Error in src/index.ts at line 42"
    // We find these file references and include those files too
    const filePattern =
      /(?:^|\s)([./\w-]+\.(?:ts|tsx|js|jsx|py|java|go|rs|php))/gm;
    const mentionedFiles = new Set<string>();
    let match;

    while ((match = filePattern.exec(errorOutput)) !== null) {
      const filePath = match[1];
      // Filter out paths that look like npm packages
      if (!filePath.includes("node_modules")) {
        mentionedFiles.add(filePath);
      }
    }

    // Read each mentioned file
    for (const relPath of mentionedFiles) {
      const fullPath = path.join(projectPath, relPath);
      const content = await this.fileUtils.readFile(fullPath);
      if (content && !files.has(relPath)) {
        files.set(relPath, content);
      }
    }

    this.logger.debug(`Gathered ${files.size} context files for AI analysis`);
    return files;
  }

  // ── Apply patches to files ────────────────────────────────────────────
  private async applyPatches(
    projectPath: string,
    patches: FilePatch[],
    onProgress: (msg: string) => void,
  ): Promise<void> {
    for (const patch of patches) {
      const fullPath = path.join(projectPath, patch.filePath);

      // Create a backup before modifying
      const existing = await this.fileUtils.readFile(fullPath);
      if (existing) {
        await this.fileUtils.writeFile(
          `${fullPath}.deployflow-backup`,
          existing,
        );
      }

      // Write the new content
      await this.fileUtils.writeFile(fullPath, patch.newContent);
      onProgress(`✏️ Applied fix to: ${patch.filePath}`);
      this.logger.info(`Applied patch to ${patch.filePath}`);
    }
  }

  // ── Save error log for debugging ──────────────────────────────────────
  private async saveErrorLog(
    projectPath: string,
    attempt: number,
    errorOutput: string,
    fix: AIFixResponse,
  ): Promise<void> {
    try {
      const logsDir = path.join(projectPath, ".deployflow", "error-logs");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const logPath = path.join(
        logsDir,
        `error-attempt-${attempt}-${timestamp}.json`,
      );

      const logData = {
        timestamp: new Date().toISOString(),
        attempt,
        errorOutput,
        aiExplanation: fix.explanation,
        confidence: fix.confidence,
        patchesApplied: fix.patches.map((p) => ({
          filePath: p.filePath,
          description: p.description,
        })),
      };

      await this.fileUtils.writeFile(logPath, JSON.stringify(logData, null, 2));
    } catch (error) {
      // Log saving is not critical — don't fail the whole process
      this.logger.warn("Failed to save error log", error);
    }
  }

  // ── Restore backups if all fixes failed ───────────────────────────────
  public async restoreBackups(
    projectPath: string,
    patches: FilePatch[],
  ): Promise<void> {
    for (const patch of patches) {
      const fullPath = path.join(projectPath, patch.filePath);
      const backupPath = `${fullPath}.deployflow-backup`;

      const backup = await this.fileUtils.readFile(backupPath);
      if (backup) {
        await this.fileUtils.writeFile(fullPath, backup);
        await this.fileUtils.deleteFile(backupPath);
        this.logger.info(`Restored backup for ${patch.filePath}`);
      }
    }
  }
}
