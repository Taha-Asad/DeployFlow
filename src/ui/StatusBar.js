"use strict";
// ────────────────────────────────────────────────────────────────────────────
// src/ui/StatusBar.ts
// Creates the 🚀 Deploy button in VS Code's bottom status bar
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
exports.StatusBar = void 0;
const vscode = __importStar(require("vscode"));
class StatusBar {
    statusBarItem;
    constructor() {
        // Create a status bar item on the LEFT side with high priority (appears near left)
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.command = "deployflow.deploy";
        this.setIdle();
        this.statusBarItem.show();
    }
    // ── Set to idle state (ready to deploy) ────────────────────────────────────
    setIdle() {
        this.statusBarItem.text = "$(rocket) Deploy";
        this.statusBarItem.tooltip = "DeployFlow AI: Click to deploy your project";
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.command = "deployflow.deploy";
    }
    // ── Set to deploying state (spinning) ─────────────────────────────────────
    setDeploying(step) {
        this.statusBarItem.text = `$(loading~spin) ${step}`;
        this.statusBarItem.tooltip = `DeployFlow AI is deploying: ${step}`;
        this.statusBarItem.command = "deployflow.showProgress"; // Click shows progress
    }
    // ── Set to success state ───────────────────────────────────────────────────
    setSuccess(url) {
        this.statusBarItem.text = "$(check) Deployed!";
        this.statusBarItem.tooltip = url
            ? `DeployFlow AI: Deployed to ${url} — click to redeploy`
            : "DeployFlow AI: Deployment successful — click to redeploy";
        this.statusBarItem.command = "deployflow.deploy";
        // Auto-reset back to idle after 8 seconds
        setTimeout(() => this.setIdle(), 8000);
    }
    // ── Set to error state ─────────────────────────────────────────────────────
    setError(errorMsg) {
        this.statusBarItem.text = "$(error) Deploy Failed";
        this.statusBarItem.tooltip = errorMsg
            ? `DeployFlow AI: ${errorMsg.substring(0, 100)} — click to retry`
            : "DeployFlow AI: Deployment failed — click to retry";
        this.statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
        this.statusBarItem.command = "deployflow.deploy";
        // Auto-reset after 15 seconds
        setTimeout(() => this.setIdle(), 15000);
    }
    // ── Cleanup when extension is deactivated ─────────────────────────────────
    dispose() {
        this.statusBarItem.dispose();
    }
}
exports.StatusBar = StatusBar;
//# sourceMappingURL=StatusBar.js.map