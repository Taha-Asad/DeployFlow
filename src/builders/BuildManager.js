"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// src/builders/BuildManager.ts
// Runs the project's build command (npm run build, pip install, etc.)
// Captures output and reports success/failure
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.BuildManager = void 0;
const ShellUtils_1 = require("../utils/ShellUtils");
const Logger_1 = require("../utils/Logger");
class BuildManager {
    shell;
    logger;
    constructor() {
        this.shell = new ShellUtils_1.ShellUtils();
        this.logger = Logger_1.Logger.getInstance();
    }
    // ── Run the project's build command ──────────────────────────────────
    async build(projectInfo, onOutput) {
        // If there's no build command, skip this step
        if (!projectInfo.buildCommand) {
            this.logger.info("No build command detected — skipping build step");
            return {
                success: true,
                output: "No build command — skipped",
                error: "",
                duration: 0,
            };
        }
        this.logger.info(`Building project: ${projectInfo.buildCommand}`);
        const startTime = Date.now();
        onOutput(`🔨 Running: ${projectInfo.buildCommand}`);
        // Split the command into command + args for streaming execution
        // e.g., "npm run build" → ["npm", "run", "build"]
        const parts = projectInfo.buildCommand.split(" ");
        const command = parts[0];
        const args = parts.slice(1);
        const result = await this.shell.runStreaming(command, args, {
            cwd: projectInfo.rootPath,
            onOutput: (line) => {
                onOutput(`  ${line}`);
            },
            // Builds can take a long time — 10 minute timeout
            timeout: 600000,
        });
        const duration = Date.now() - startTime;
        const durationStr = this.formatDuration(duration);
        if (result.success) {
            this.logger.info(`✅ Build succeeded in ${durationStr}`);
            onOutput(`✅ Build completed in ${durationStr}`);
        }
        else {
            this.logger.error(`❌ Build failed after ${durationStr}`, result.stderr);
            onOutput(`❌ Build failed after ${durationStr}`);
        }
        return {
            success: result.success,
            output: result.stdout,
            error: result.stderr || result.stdout, // On failure, stdout may have errors
            duration,
        };
    }
    // ── Install dependencies before building ──────────────────────────────
    // This runs npm install / pip install / etc.
    async installDependencies(projectInfo, onOutput) {
        const installCommand = this.getInstallCommand(projectInfo);
        if (!installCommand) {
            return {
                success: true,
                output: "No install command needed",
                error: "",
                duration: 0,
            };
        }
        this.logger.info(`Installing dependencies: ${installCommand}`);
        onOutput(`📦 Installing dependencies: ${installCommand}`);
        const startTime = Date.now();
        const parts = installCommand.split(" ");
        const result = await this.shell.runStreaming(parts[0], parts.slice(1), {
            cwd: projectInfo.rootPath,
            onOutput: (line) => {
                // Filter out noise from npm install output
                if (!line.includes("npm warn") && !line.includes("WARN deprecated")) {
                    onOutput(`  ${line}`);
                }
            },
            timeout: 300000, // 5 minutes for dependency install
        });
        const duration = Date.now() - startTime;
        if (result.success) {
            onOutput(`✅ Dependencies installed in ${this.formatDuration(duration)}`);
        }
        else {
            onOutput(`❌ Dependency installation failed`);
        }
        return {
            success: result.success,
            output: result.stdout,
            error: result.stderr,
            duration,
        };
    }
    // ── Run tests if they exist ───────────────────────────────────────────
    async runTests(projectInfo, onOutput) {
        if (!projectInfo.hasTests || !projectInfo.testCommand) {
            this.logger.info("No tests detected — skipping test step");
            return {
                success: true,
                output: "No tests — skipped",
                error: "",
                duration: 0,
            };
        }
        this.logger.info(`Running tests: ${projectInfo.testCommand}`);
        onOutput(`🧪 Running tests: ${projectInfo.testCommand}`);
        const startTime = Date.now();
        const parts = projectInfo.testCommand.split(" ");
        const result = await this.shell.runStreaming(parts[0], parts.slice(1), {
            cwd: projectInfo.rootPath,
            onOutput: (line) => onOutput(`  ${line}`),
            timeout: 300000,
        });
        const duration = Date.now() - startTime;
        if (result.success) {
            onOutput(`✅ All tests passed in ${this.formatDuration(duration)}`);
        }
        else {
            onOutput(`❌ Tests failed`);
        }
        return {
            success: result.success,
            output: result.stdout,
            error: result.stderr,
            duration,
        };
    }
    // ── Determine install command based on package manager ────────────────
    getInstallCommand(projectInfo) {
        switch (projectInfo.packageManager) {
            case "npm":
                return "npm ci"; // ci = clean install (faster, reproducible)
            case "yarn":
                return "yarn install --frozen-lockfile";
            case "pnpm":
                return "pnpm install --frozen-lockfile";
            case "bun":
                return "bun install --frozen-lockfile";
            case "pip":
                return "pip install -r requirements.txt";
            case "poetry":
                return "poetry install --no-dev";
            case "pipenv":
                return "pipenv install --deploy";
            case "composer":
                return "composer install --no-dev --optimize-autoloader";
            case "maven":
                return "./mvnw dependency:resolve";
            case "gradle":
                return "./gradlew dependencies";
            case "cargo":
                return "cargo fetch";
            case "gomod":
                return "go mod download";
            default:
                return null;
        }
    }
    // ── Format milliseconds to human readable ─────────────────────────────
    // e.g., 65000 → "1m 5s"
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) {
            return `${seconds}s`;
        }
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    }
}
exports.BuildManager = BuildManager;
//# sourceMappingURL=BuildManager.js.map