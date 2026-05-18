"use strict";
// ────────────────────────────────────────────────────────────────────────────
// src/commands/GenerateDocsCommand.ts
// Generates SDLC documentation (BRD, SRS, API docs, Architecture) using AI
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
exports.GenerateDocsCommand = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const ProjectAnalyzer_1 = require("../core/ProjectAnalyzer");
const AIManager_1 = require("../ai/AIManager");
const SdlcGenerator_1 = require("../generators/SdlcGenerator");
class GenerateDocsCommand {
    configManager;
    secretManager;
    constructor(configManager, secretManager) {
        this.configManager = configManager;
        this.secretManager = secretManager;
    }
    async execute() {
        const workspaceFolder = this.configManager.getWorkspaceFolder();
        if (!workspaceFolder) {
            vscode.window.showErrorMessage("No folder open. Please open a project first.");
            return;
        }
        // Confirm AI provider is configured
        const aiProvider = this.configManager.getAiProvider();
        if (aiProvider !== "ollama") {
            const key = await this.secretManager.getAiKey(aiProvider);
            if (!key) {
                const configure = await vscode.window.showWarningMessage(`⚠️ ${aiProvider} API key not configured. SDLC generation requires AI.`, "Configure Now");
                if (configure) {
                    await vscode.commands.executeCommand("deployflow.configure");
                }
                return;
            }
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "📄 Generating SDLC Documentation...",
            cancellable: false,
        }, async (progress) => {
            const analyzer = new ProjectAnalyzer_1.ProjectAnalyzer();
            const projectInfo = await analyzer.analyze(workspaceFolder);
            const aiManager = new AIManager_1.AIManager(this.configManager, this.secretManager);
            const sdlcGenerator = new SdlcGenerator_1.SdlcGenerator(aiManager);
            const docs = await sdlcGenerator.generate(projectInfo, (msg) => {
                progress.report({ message: msg });
            });
            const docsDir = path.join(workspaceFolder, "docs");
            const generatedFiles = Object.keys(docs).length;
            const action = await vscode.window.showInformationMessage(`✅ Generated ${generatedFiles} SDLC documents in /docs`, "Open docs folder", "Close");
            if (action === "Open docs folder") {
                vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(docsDir));
            }
        });
    }
}
exports.GenerateDocsCommand = GenerateDocsCommand;
//# sourceMappingURL=GenerateDocsCommand.js.map