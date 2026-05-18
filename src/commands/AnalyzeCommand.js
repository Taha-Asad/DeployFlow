"use strict";
// ────────────────────────────────────────────────────────────────────────────
// src/commands/AnalyzeCommand.ts
// Analyzes the project and shows a summary — without deploying
// ────────────────────────────────────────────────────────────────────────────
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
exports.AnalyzeCommand = void 0;
const vscode = __importStar(require("vscode"));
const ProjectAnalyzer_1 = require("../core/ProjectAnalyzer");
class AnalyzeCommand {
    configManager;
    analyzer;
    constructor(configManager) {
        this.configManager = configManager;
        this.analyzer = new ProjectAnalyzer_1.ProjectAnalyzer();
    }
    async execute() {
        const workspaceFolder = this.configManager.getWorkspaceFolder();
        if (!workspaceFolder) {
            vscode.window.showErrorMessage("No folder open. Please open a project first.");
            return;
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "🔍 Analyzing project...",
            cancellable: false,
        }, async () => {
            const info = await this.analyzer.analyze(workspaceFolder);
            const lines = [
                `**Framework:** ${info.framework}`,
                `**Language:** ${info.language} ${info.runtimeVersion ? `(v${info.runtimeVersion})` : ""}`,
                `**Type:** ${info.type}`,
                `**Package Manager:** ${info.packageManager}`,
                `**Port:** ${info.port}`,
                `**Build Command:** ${info.buildCommand || "(none)"}`,
                `**Start Command:** ${info.startCommand || "(none)"}`,
                `**Has Tests:** ${info.hasTests ? "✅" : "❌"}`,
                `**Has Dockerfile:** ${info.hasDockerfile ? "✅" : "❌ (will be generated)"}`,
                `**Is Monorepo:** ${info.isMonorepo ? `✅ (${info.monorepoTool})` : "❌"}`,
                info.envVars.length > 0
                    ? `**Env Vars Needed:** ${info.envVars.slice(0, 8).join(", ")}`
                    : "",
                info.warnings.length > 0
                    ? `⚠️ **Warnings:** ${info.warnings.join("; ")}`
                    : "",
            ]
                .filter(Boolean)
                .join("\n");
            const action = await vscode.window.showInformationMessage(`Project Analysis: ${info.framework} (${info.language})`, { detail: lines.replace(/\*\*/g, ""), modal: true }, "Deploy Now 🚀", "Close");
            if (action === "Deploy Now 🚀") {
                await vscode.commands.executeCommand("deployflow.deploy");
            }
        });
    }
}
exports.AnalyzeCommand = AnalyzeCommand;
//# sourceMappingURL=AnalyzeCommand.js.map