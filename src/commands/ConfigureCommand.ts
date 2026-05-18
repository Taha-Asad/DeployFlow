import * as vscode from "vscode";
import { ConfigManager } from "../core/ConfigManager";
import { SecretManager } from "../core/SecretManager";
import { ShellUtils } from "../utils/ShellUtils";
import { AIManager, AIProvider } from "../ai/AIManager";

const OLLAMA_DOWNLOAD_URL = "https://ollama.com/download";

export class ConfigureCommand {
  private configManager: ConfigManager;
  private secretManager: SecretManager;
  private shell: ShellUtils;

  constructor(configManager: ConfigManager, secretManager: SecretManager) {
    this.configManager = configManager;
    this.secretManager = secretManager;
    this.shell = new ShellUtils();
  }

  public async execute(): Promise<void> {
    const choice = await vscode.window.showQuickPick(
      [
        { label: "🤖 Configure AI Provider", description: "Change which AI service is used for error fixing & docs" },
        { label: "⚙️ Open All Settings", description: "Full DeployFlow settings in VS Code" },
      ],
      { placeHolder: "What would you like to configure?" },
    );

    if (!choice) return;

    if (choice.label.includes("Open All Settings")) {
      await vscode.commands.executeCommand("workbench.action.openSettings", "deployflow");
      return;
    }

    await this.configureAiProvider();
  }

  private async configureAiProvider(): Promise<void> {
    const currentProvider = this.configManager.getAiProvider();

    const providerChoice = await vscode.window.showQuickPick(
      [
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
      ],
      { placeHolder: "Select AI provider (default: ollama)" },
    );

    if (!providerChoice) return;

    const provider = providerChoice.label as "ollama" | "openai" | "anthropic" | "gemini";

    const config = vscode.workspace.getConfiguration("deployflow");
    await config.update("aiProvider", provider, vscode.ConfigurationTarget.Global);

    if (provider === "ollama") {
      await this.configureOllama(config);
    } else {
      await this.configureCloudProvider(provider, config);
    }

    const aiManager = new AIManager(this.configManager, this.secretManager);
    aiManager.resetProvider();

    vscode.window.showInformationMessage(`🤖 AI provider switched to ${provider}`, "Test Connection").then(async (action) => {
      if (action === "Test Connection") {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: `Testing ${provider} connection...` },
          async () => {
            try {
              const testManager = new AIManager(this.configManager, this.secretManager);
              const available = await (testManager as any)["getProvider"]()
                .then((p: AIProvider) => p.isAvailable())
                .catch(() => false);
              if (available) {
                vscode.window.showInformationMessage(`✅ ${provider} is reachable and ready.`);
              } else {
                vscode.window.showWarningMessage(`⚠️ ${provider} is configured but not reachable. Check your settings.`);
              }
            } catch {
              vscode.window.showErrorMessage(`❌ Could not connect to ${provider}. Check your configuration.`);
            }
          },
        );
      }
    });
  }

  private async configureOllama(config: vscode.WorkspaceConfiguration): Promise<void> {
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
      const install = await vscode.window.showWarningMessage(
        "⚠️ Ollama is not installed on your system. The AI error fixer needs it.",
        "Install Ollama",
        "Open Download Page",
        "Skip",
      );

      if (install === "Install Ollama") {
        await this.installOllama();
      } else if (install === "Open Download Page") {
        vscode.env.openExternal(vscode.Uri.parse(OLLAMA_DOWNLOAD_URL));
      }
    }
  }

  private async installOllama(): Promise<void> {
    const platform = process.platform;
    const isFlatpak = !!(process.env.FLATPAK_ID || process.env.container === "flatpak");

    if (platform === "linux") {
      const confirmed = await vscode.window.showWarningMessage(
        "This will run: curl -fsSL https://ollama.com/install.sh | sh\n" +
        "It requires sudo access. Your terminal may prompt for your password.",
        { modal: true },
        "Proceed",
        "Cancel",
      );

      if (confirmed !== "Proceed") return;

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Installing Ollama..." },
        async () => {
          const cmd = isFlatpak
            ? "flatpak-spawn --host sh -c 'curl -fsSL https://ollama.com/install.sh | sh'"
            : "curl -fsSL https://ollama.com/install.sh | sh";

          const result = await this.shell.run(cmd, { timeout: 120000 });

          if (result.success) {
            vscode.window.showInformationMessage(
              "✅ Ollama installed! Start it with 'ollama serve' in your terminal.",
              "Open Ollama Docs",
            ).then((a) => {
              if (a === "Open Ollama Docs") {
                vscode.env.openExternal(vscode.Uri.parse("https://ollama.com/docs"));
              }
            });
          } else {
            vscode.window.showWarningMessage(
              "⚠️ Ollama install failed. Try manually: https://ollama.com/download",
              "Open Download Page",
            ).then((a) => {
              if (a === "Open Download Page") {
                vscode.env.openExternal(vscode.Uri.parse(OLLAMA_DOWNLOAD_URL));
              }
            });
          }
        },
      );
    } else if (platform === "darwin") {
      vscode.env.openExternal(vscode.Uri.parse(OLLAMA_DOWNLOAD_URL));
    } else {
      vscode.env.openExternal(vscode.Uri.parse(OLLAMA_DOWNLOAD_URL));
    }
  }

  private async configureCloudProvider(
    provider: "openai" | "anthropic" | "gemini",
    config: vscode.WorkspaceConfiguration,
  ): Promise<void> {
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
    } else if (!existingKey) {
      vscode.window.showWarningMessage(`⚠️ No API key set for ${provider}. The AI features won't work until you set one.`);
    }
  }
}
