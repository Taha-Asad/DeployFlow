"use strict";
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
exports.ConfigureCommand = void 0;
const vscode = __importStar(require("vscode"));
const ShellUtils_js_1 = require("../utils/ShellUtils.js");
const AIManager_js_1 = require("../ai/AIManager.js");
const OLLAMA_DOWNLOAD_URL = "https://ollama.com/download";
class ConfigureCommand {
    configManager;
    secretManager;
    shell;
    constructor(configManager, secretManager) {
        this.configManager = configManager;
        this.secretManager = secretManager;
        this.shell = new ShellUtils_js_1.ShellUtils();
    }
    async execute() {
        const choice = await vscode.window.showQuickPick([
            { label: "🤖 Configure AI Provider", description: "Change which AI service is used for error fixing & docs" },
            { label: "⚙️ Open All Settings", description: "Full DeployFlow settings in VS Code" },
        ], { placeHolder: "What would you like to configure?" });
        if (!choice)
            return;
        if (choice.label.includes("Open All Settings")) {
            await vscode.commands.executeCommand("workbench.action.openSettings", "deployflow");
            return;
        }
        await this.configureAiProvider();
    }
    async configureAiProvider() {
        const currentProvider = this.configManager.getAiProvider();
        const providerChoice = await vscode.window.showQuickPick([
            {
                label: "ollama",
                description: currentProvider === "ollama" ? "✓ currently active — local, free, no API key" : "Local, free, no API key needed",
                detail: "Runs AI models locally. No data leaves your machine.",
            },
            {
                label: "openai",
                description: currentProvider === "openai" ? "✓ currently active" : "Requires API key",
                detail: "Uses GPT models via OpenAI API",
            },
            {
                label: "anthropic",
                description: currentProvider === "anthropic" ? "✓ currently active" : "Requires API key",
                detail: "Uses Claude models via Anthropic API",
            },
            {
                label: "gemini",
                description: currentProvider === "gemini" ? "✓ currently active" : "Requires API key",
                detail: "Uses Gemini models via Google AI API",
            },
        ], { placeHolder: "Select AI provider (default: ollama)" });
        if (!providerChoice)
            return;
        const provider = providerChoice.label;
        const config = vscode.workspace.getConfiguration("deployflow");
        await config.update("aiProvider", provider, vscode.ConfigurationTarget.Global);
        if (provider === "ollama") {
            await this.configureOllama(config);
        }
        else {
            await this.configureCloudProvider(provider, config);
        }
        const aiManager = new AIManager_js_1.AIManager(this.configManager, this.secretManager);
        aiManager.resetProvider();
        vscode.window.showInformationMessage(`🤖 AI provider switched to ${provider}`, "Test Connection").then(async (action) => {
            if (action === "Test Connection") {
                await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Testing ${provider} connection...` }, async () => {
                    try {
                        const testManager = new AIManager_js_1.AIManager(this.configManager, this.secretManager);
                        const available = await testManager["getProvider"]()
                            .then((p) => p.isAvailable())
                            .catch(() => false);
                        if (available) {
                            vscode.window.showInformationMessage(`✅ ${provider} is reachable and ready.`);
                        }
                        else {
                            vscode.window.showWarningMessage(`⚠️ ${provider} is configured but not reachable. Check your settings.`);
                        }
                    }
                    catch {
                        vscode.window.showErrorMessage(`❌ Could not connect to ${provider}. Check your configuration.`);
                    }
                });
            }
        });
    }
    async configureOllama(config) {
        const url = await vscode.window.showInputBox({
            prompt: "Ollama server URL",
            value: this.configManager.getOllamaUrl(),
            placeHolder: "http://localhost:11434",
        });
        if (url) {
            await config.update("ollamaUrl", url, vscode.ConfigurationTarget.Global);
        }
        const model = await vscode.window.showInputBox({
            prompt: "Ollama model name",
            value: this.configManager.getOllamaModel(),
            placeHolder: "codellama",
        });
        if (model) {
            await config.update("ollamaModel", model, vscode.ConfigurationTarget.Global);
        }
        const ollamaInstalled = await this.shell.commandExists("ollama");
        if (!ollamaInstalled) {
            const install = await vscode.window.showWarningMessage("⚠️ Ollama is not installed on your system. The AI error fixer needs it.", "Install Ollama", "Open Download Page", "Skip");
            if (install === "Install Ollama") {
                await this.installOllama();
            }
            else if (install === "Open Download Page") {
                vscode.env.openExternal(vscode.Uri.parse(OLLAMA_DOWNLOAD_URL));
            }
        }
    }
    async installOllama() {
        const platform = process.platform;
        const isFlatpak = !!(process.env.FLATPAK_ID || process.env.container === "flatpak");
        if (platform === "linux") {
            const confirmed = await vscode.window.showWarningMessage("This will run: curl -fsSL https://ollama.com/install.sh | sh\n" +
                "It requires sudo access. Your terminal may prompt for your password.", { modal: true }, "Proceed", "Cancel");
            if (confirmed !== "Proceed")
                return;
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Installing Ollama..." }, async () => {
                const cmd = isFlatpak
                    ? "flatpak-spawn --host sh -c 'curl -fsSL https://ollama.com/install.sh | sh'"
                    : "curl -fsSL https://ollama.com/install.sh | sh";
                const result = await this.shell.run(cmd, { timeout: 120000 });
                if (result.success) {
                    vscode.window.showInformationMessage("✅ Ollama installed! Start it with 'ollama serve' in your terminal.", "Open Ollama Docs").then((a) => {
                        if (a === "Open Ollama Docs") {
                            vscode.env.openExternal(vscode.Uri.parse("https://ollama.com/docs"));
                        }
                    });
                }
                else {
                    vscode.window.showWarningMessage("⚠️ Ollama install failed. Try manually: https://ollama.com/download", "Open Download Page").then((a) => {
                        if (a === "Open Download Page") {
                            vscode.env.openExternal(vscode.Uri.parse(OLLAMA_DOWNLOAD_URL));
                        }
                    });
                }
            });
        }
        else if (platform === "darwin") {
            vscode.env.openExternal(vscode.Uri.parse(OLLAMA_DOWNLOAD_URL));
        }
        else {
            vscode.env.openExternal(vscode.Uri.parse(OLLAMA_DOWNLOAD_URL));
        }
    }
    async configureCloudProvider(provider, config) {
        const existingKey = await this.secretManager.getAiKey(provider);
        const key = await vscode.window.showInputBox({
            prompt: `Enter your ${provider} API key`,
            password: true,
            placeHolder: existingKey ? "Leave empty to keep existing key" : "sk-...",
            ignoreFocusOut: true,
        });
        if (key) {
            await this.secretManager.storeAiKey(provider, key);
            vscode.window.showInformationMessage(`✅ ${provider} API key saved securely.`);
        }
        else if (!existingKey) {
            vscode.window.showWarningMessage(`⚠️ No API key set for ${provider}. The AI features won't work until you set one.`);
        }
    }
}
exports.ConfigureCommand = ConfigureCommand;
//# sourceMappingURL=ConfigureCommand.js.map