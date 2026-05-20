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
        // Loop instead of recursion for retry — avoids stack growth
        while (true) {
            // ── 1. Make sure a workspace is open ────────────────────────────────
            const workspaceFolder = this.configManager.getWorkspaceFolder();
            if (!workspaceFolder) {
                vscode.window.showErrorMessage("❌ DeployFlow: No folder open. Open a project folder first.");
                return;
            }
            // ── 2. Load existing config or show wizard ──────────────────────────
            let deployConfig = await this.configManager.loadDeployConfig();
            if (!deployConfig) {
                const wizard = new DeployWizard_1.DeployWizard(this.configManager, this.secretManager);
                const extensionUri = vscode.extensions.getExtension("deployflow.deployflow-ai")?.extensionUri;
                if (!extensionUri) {
                    vscode.window.showErrorMessage("Could not find extension URI");
                    return;
                }
                deployConfig = await wizard.show(extensionUri);
                if (!deployConfig) {
                    return;
                }
            }
            else {
                const items = [];
                const isRedeploy = !!deployConfig.lastDeployedUrl;
                if (isRedeploy) {
                    items.push({
                        label: "🔄 Re-deploy",
                        description: `Update ${deployConfig.target} deployment at ${deployConfig.lastDeployedUrl}`,
                        value: "deploy",
                    });
                }
                items.push({
                    label: isRedeploy ? "🚀 Deploy (new project)" : "🚀 Deploy Now",
                    description: `to ${deployConfig.target}`,
                    value: "deploy",
                });
                items.push({
                    label: "⚙️ Reconfigure",
                    description: "change target or settings",
                    value: "configure",
                });
                const choice = await vscode.window.showQuickPick(items, {
                    placeHolder: "What would you like to do?",
                });
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
            // ── 3. Show the progress panel ───────────────────────────────────────
            this.progressPanel.reset();
            this.progressPanel.show();
            // ── 4. Run the deployment workflow ──────────────────────────────────
            const result = await this.workflowEngine.run(this.progressPanel, deployConfig);
            // ── 5. Handle result ────────────────────────────────────────────────
            if (result.success) {
                // Save the deployed URL so future runs know it's been deployed
                if (result.deployedUrl) {
                    deployConfig.lastDeployedUrl = result.deployedUrl;
                    deployConfig.lastDeployedAt = new Date().toISOString();
                    await this.configManager.saveDeployConfig(deployConfig);
                }
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
                return; // Success — exit the loop
            }
            const errorMsg = result.error
                ? `❌ Deployment failed: ${result.error}`
                : "❌ Deployment failed (unknown error — check logs)";
            const action = await vscode.window.showErrorMessage(errorMsg, "View Logs", "Retry");
            if (action === "View Logs") {
                this.progressPanel.show();
                return;
            }
            if (action !== "Retry") {
                return;
            }
            // Otherwise, loop back and retry
        }
    }
}
exports.DeployCommand = DeployCommand;
//# sourceMappingURL=DeployCommand.js.map