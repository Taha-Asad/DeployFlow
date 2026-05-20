"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// src/core/SecretManager.ts
// Secure storage for passwords, API keys, SSH credentials
// Uses VS Code's built-in SecretStorage which encrypts everything
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
exports.SecretManager = void 0;
const vscode = __importStar(require("vscode"));
const Logger_1 = require("../utils/Logger");
const FileUtils_1 = require("../utils/FileUtils");
class SecretManager {
    // `vscode.SecretStorage` is VS Code's encrypted storage API
    // It's like localStorage but encrypted and OS-level secure
    secrets;
    logger;
    // These are the "keys" we use to store/retrieve from SecretStorage
    // Think of them like variable names in the vault
    static KEY_SSH = "deployflow.ssh.credentials";
    static KEY_AI_OPENAI = "deployflow.ai.openai.key";
    static KEY_AI_ANTHROPIC = "deployflow.ai.anthropic.key";
    static KEY_AI_GEMINI = "deployflow.ai.gemini.key";
    static KEY_CLOUD_PREFIX = "deployflow.cloud."; // + provider name
    constructor(secrets) {
        this.secrets = secrets;
        this.logger = Logger_1.Logger.getInstance();
    }
    // ── Store SSH Credentials ─────────────────────────────────────────────
    async storeSshCredentials(creds) {
        // Convert the object to a JSON string to store it
        // We NEVER log the actual credentials!
        await this.secrets.store(SecretManager.KEY_SSH, JSON.stringify(creds));
        this.logger.info("SSH credentials stored securely");
    }
    // ── Retrieve SSH Credentials ──────────────────────────────────────────
    async getSshCredentials() {
        // Get the stored string
        const stored = await this.secrets.get(SecretManager.KEY_SSH);
        if (!stored) {
            return null; // Never been set
        }
        try {
            // Parse the JSON string back into an object
            return JSON.parse(stored);
        }
        catch {
            this.logger.error("Failed to parse stored SSH credentials");
            return null;
        }
    }
    // ── Delete SSH Credentials ────────────────────────────────────────────
    async deleteSshCredentials() {
        await this.secrets.delete(SecretManager.KEY_SSH);
        this.logger.info("SSH credentials deleted");
    }
    // ── Store AI API Key ──────────────────────────────────────────────────
    async storeAiKey(provider, key) {
        // Choose the right storage key based on provider
        const storageKey = provider === "openai"
            ? SecretManager.KEY_AI_OPENAI
            : provider === "anthropic"
                ? SecretManager.KEY_AI_ANTHROPIC
                : SecretManager.KEY_AI_GEMINI;
        await this.secrets.store(storageKey, key);
        this.logger.info(`${provider} API key stored securely`);
    }
    // ── Retrieve AI API Key ───────────────────────────────────────────────
    async getAiKey(provider) {
        const storageKey = provider === "openai"
            ? SecretManager.KEY_AI_OPENAI
            : provider === "anthropic"
                ? SecretManager.KEY_AI_ANTHROPIC
                : SecretManager.KEY_AI_GEMINI;
        return (await this.secrets.get(storageKey)) || null;
    }
    // ── Store Cloud Provider Credentials ──────────────────────────────────
    async storeCloudCredentials(creds) {
        const key = SecretManager.KEY_CLOUD_PREFIX + creds.provider;
        await this.secrets.store(key, JSON.stringify(creds.data));
        this.logger.info(`${creds.provider} credentials stored securely`);
    }
    // ── Retrieve Cloud Provider Credentials ───────────────────────────────
    async getCloudCredentials(provider) {
        const key = SecretManager.KEY_CLOUD_PREFIX + provider;
        const stored = await this.secrets.get(key);
        if (!stored) {
            return null;
        }
        try {
            return JSON.parse(stored);
        }
        catch {
            return null;
        }
    }
    // ── Get credentials for any deploy target ──────────────────────────────
    // Returns SSH credentials for "vps", or cloud credentials for other targets
    async getCredentialsForTarget(target) {
        if (target === "vps") {
            return this.getSshCredentials();
        }
        return this.getCloudCredentials(target);
    }
    // ── Prompt User for SSH Details ────────────────────────────────────────
    // Shows VS Code input boxes to collect credentials interactively
    async promptForSshCredentials() {
        // Show a text input box for the host
        // `vscode.window.showInputBox` shows a dialog asking the user to type something
        const host = await vscode.window.showInputBox({
            prompt: "Enter your VPS IP address or hostname",
            placeHolder: "e.g. 192.168.1.100 or myserver.com",
            validateInput: (value) => {
                // Validate — return error message if invalid, or null if valid
                return value.trim() ? null : "Host cannot be empty";
            },
        });
        // If user pressed Escape (cancelled), host is undefined
        if (!host) {
            return null;
        }
        const portStr = await vscode.window.showInputBox({
            prompt: "Enter SSH port",
            placeHolder: "22",
            value: "22", // Default value shown in the input
            validateInput: (value) => {
                const num = parseInt(value);
                return num > 0 && num < 65536
                    ? null
                    : "Port must be between 1 and 65535";
            },
        });
        if (!portStr) {
            return null;
        }
        const username = await vscode.window.showInputBox({
            prompt: "Enter SSH username",
            placeHolder: "root",
            validateInput: (value) => value.trim() ? null : "Username cannot be empty",
        });
        if (!username) {
            return null;
        }
        // Ask if they want to use password or SSH key
        const authMethod = await vscode.window.showQuickPick(["Password", "SSH Private Key"], {
            placeHolder: "Choose authentication method",
        });
        if (!authMethod) {
            return null;
        }
        const creds = {
            host: host.trim(),
            port: parseInt(portStr),
            username: username.trim(),
        };
        if (authMethod === "Password") {
            // `password: true` hides the input (shows dots like a password field)
            const password = await vscode.window.showInputBox({
                prompt: "Enter SSH password",
                password: true,
            });
            if (!password) {
                return null;
            }
            creds.password = password;
        }
        else {
            // Ask for the path to the private key file
            const keyPath = await vscode.window.showInputBox({
                prompt: "Enter path to your SSH private key",
                placeHolder: "~/.ssh/id_rsa",
            });
            if (!keyPath) {
                return null;
            }
            // Read the key file
            const fileUtils = new FileUtils_1.FileUtils();
            // Expand ~ to the home directory
            const expandedPath = keyPath.replace(/^~/, process.env.HOME || process.env.USERPROFILE || "");
            const keyContent = await fileUtils.readFile(expandedPath);
            if (!keyContent) {
                vscode.window.showErrorMessage(`Could not read SSH key file: ${expandedPath}`);
                return null;
            }
            creds.privateKey = keyContent;
            // Optionally ask for passphrase
            const passphrase = await vscode.window.showInputBox({
                prompt: "Enter passphrase for SSH key (leave empty if none)",
                password: true,
            });
            if (passphrase) {
                creds.passphrase = passphrase;
            }
        }
        return creds;
    }
}
exports.SecretManager = SecretManager;
//# sourceMappingURL=SecretManager.js.map