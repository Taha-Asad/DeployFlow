"use strict";
// ────────────────────────────────────────────────────────────────────────────
// src/commands/DeployCommand.ts
// Handles the main "deployflow.deploy" command
// Orchestrates: wizard → workflow engine → success/error feedback
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
exports.DeployCommand = void 0;
const vscode = __importStar(require("vscode"));
const DeployWizard_1 = require("../ui/DeployWizard");
class DeployCommand {
    workflowEngine;
    progressPanel;
    secretManager;
    configManager;
    constructor(workflowEngine, progressPanel, secretManager, configManager) {
        this.workflowEngine = workflowEngine;
        this.progressPanel = progressPanel;
        this.secretManager = secretManager;
        this.configManager = configManager;
    }
    async execute() {
        // ── 1. Make sure a workspace is open ──────────────────────────────────
        const workspaceFolder = this.configManager.getWorkspaceFolder();
        if (!workspaceFolder) {
            vscode.window.showErrorMessage("❌ DeployFlow: No folder open. Open a project folder first.");
            return;
        }
        // ── 2. Load existing config or show wizard ────────────────────────────
        let deployConfig = await this.configManager.loadDeployConfig();
        if (!deployConfig) {
            // First time — show the wizard
            const wizard = new DeployWizard_1.DeployWizard(this.configManager, this.secretManager);
            const extensionUri = vscode.extensions.getExtension("deployflow.deployflow-ai")?.extensionUri;
            if (!extensionUri) {
                vscode.window.showErrorMessage("Could not find extension URI");
                return;
            }
            deployConfig = await wizard.show(extensionUri);
            if (!deployConfig) {
                // User cancelled the wizard
                return;
            }
        }
        else {
            // Config exists — ask if they want to reconfigure or just deploy
            const choice = await vscode.window.showQuickPick([
                {
                    label: "🚀 Deploy Now",
                    description: `to ${deployConfig.target}`,
                    value: "deploy",
                },
                {
                    label: "⚙️ Reconfigure",
                    description: "change target or settings",
                    value: "configure",
                },
            ], { placeHolder: "What would you like to do?" });
            if (!choice) {
                return;
            }
            if (choice.value === "configure") {
                const wizard = new DeployWizard_1.DeployWizard(this.configManager, this.secretManager);
                const extensionUri = vscode.extensions.getExtension("deployflow.deployflow-ai")?.extensionUri;
                if (!extensionUri) {
                    return;
                }
                deployConfig = await wizard.show(extensionUri);
                if (!deployConfig) {
                    return;
                }
            }
        }
        // ── 3. Show the progress panel ─────────────────────────────────────────
        this.progressPanel.reset();
        this.progressPanel.show();
        // ── 4. Run the deployment workflow ────────────────────────────────────
        const result = await this.workflowEngine.run(this.progressPanel, deployConfig);
        // ── 5. Handle result ──────────────────────────────────────────────────
        if (result.success) {
            const message = result.deployedUrl
                ? `✅ Deployed successfully to ${result.deployedUrl}`
                : "✅ Deployment successful!";
            const action = result.deployedUrl
                ? await vscode.window.showInformationMessage(message, "Open App 🌐", "View Logs")
                : await vscode.window.showInformationMessage(message, "View Logs");
            if (action === "Open App 🌐" && result.deployedUrl) {
                vscode.env.openExternal(vscode.Uri.parse(result.deployedUrl));
            }
            if (action === "View Logs") {
                this.progressPanel.show();
            }
        }
        else {
            const action = await vscode.window.showErrorMessage(`❌ Deployment failed: ${result.error}`, "View Logs", "Retry");
            if (action === "View Logs") {
                this.progressPanel.show();
            }
            if (action === "Retry") {
                await this.execute();
            }
        }
    }
}
exports.DeployCommand = DeployCommand;
//# sourceMappingURL=DeployCommand.js.map