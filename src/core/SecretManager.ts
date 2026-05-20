// ─────────────────────────────────────────────────────────────────────────────
// src/core/SecretManager.ts
// Secure storage for passwords, API keys, SSH credentials
// Uses VS Code's built-in SecretStorage which encrypts everything
// ─────────────────────────────────────────────────────────────────────────────

import * as vscode from "vscode";
import { Logger } from "../utils/Logger";
import { FileUtils } from "../utils/FileUtils";

// Defines what SSH credentials look like
export interface SshCredentials {
  host: string; // IP address or domain name of the server
  port: number; // SSH port (usually 22)
  username: string; // SSH username (like 'root' or 'ubuntu')
  password?: string; // Password (optional — may use key instead)
  privateKey?: string; // SSH private key content (optional)
  passphrase?: string; // Passphrase for the private key (optional)
}

// Defines what cloud provider credentials look like
export interface CloudCredentials {
  provider: "vercel" | "netlify" | "cloudflare" | "aws" | "gcp" | "azure";
  // `Record<string, string>` means "an object with string keys and string values"
  // Example: { apiToken: 'xxx', projectId: 'yyy' }
  data: Record<string, string>;
}

export class SecretManager {
  // `vscode.SecretStorage` is VS Code's encrypted storage API
  // It's like localStorage but encrypted and OS-level secure
  private secrets: vscode.SecretStorage;
  private logger: Logger;

  // These are the "keys" we use to store/retrieve from SecretStorage
  // Think of them like variable names in the vault
  private static readonly KEY_SSH = "deployflow.ssh.credentials";
  private static readonly KEY_AI_OPENAI = "deployflow.ai.openai.key";
  private static readonly KEY_AI_ANTHROPIC = "deployflow.ai.anthropic.key";
  private static readonly KEY_AI_GEMINI = "deployflow.ai.gemini.key";
  private static readonly KEY_CLOUD_PREFIX = "deployflow.cloud."; // + provider name

  constructor(secrets: vscode.SecretStorage) {
    this.secrets = secrets;
    this.logger = Logger.getInstance();
  }

  // ── Store SSH Credentials ─────────────────────────────────────────────
  public async storeSshCredentials(creds: SshCredentials): Promise<void> {
    // Convert the object to a JSON string to store it
    // We NEVER log the actual credentials!
    await this.secrets.store(
      SecretManager.KEY_SSH,
      JSON.stringify(creds), // Turn object to string
    );
    this.logger.info("SSH credentials stored securely");
  }

  // ── Retrieve SSH Credentials ──────────────────────────────────────────
  public async getSshCredentials(): Promise<SshCredentials | null> {
    // Get the stored string
    const stored = await this.secrets.get(SecretManager.KEY_SSH);

    if (!stored) {
      return null; // Never been set
    }

    try {
      // Parse the JSON string back into an object
      return JSON.parse(stored) as SshCredentials;
    } catch {
      this.logger.error("Failed to parse stored SSH credentials");
      return null;
    }
  }

  // ── Delete SSH Credentials ────────────────────────────────────────────
  public async deleteSshCredentials(): Promise<void> {
    await this.secrets.delete(SecretManager.KEY_SSH);
    this.logger.info("SSH credentials deleted");
  }

  // ── Store AI API Key ──────────────────────────────────────────────────
  public async storeAiKey(
    provider: "openai" | "anthropic" | "gemini",
    key: string,
  ): Promise<void> {
    // Choose the right storage key based on provider
    const storageKey =
      provider === "openai"
        ? SecretManager.KEY_AI_OPENAI
        : provider === "anthropic"
          ? SecretManager.KEY_AI_ANTHROPIC
          : SecretManager.KEY_AI_GEMINI;

    await this.secrets.store(storageKey, key);
    this.logger.info(`${provider} API key stored securely`);
  }

  // ── Retrieve AI API Key ───────────────────────────────────────────────
  public async getAiKey(
    provider: "openai" | "anthropic" | "gemini",
  ): Promise<string | null> {
    const storageKey =
      provider === "openai"
        ? SecretManager.KEY_AI_OPENAI
        : provider === "anthropic"
          ? SecretManager.KEY_AI_ANTHROPIC
          : SecretManager.KEY_AI_GEMINI;

    return (await this.secrets.get(storageKey)) || null;
  }

  // ── Store Cloud Provider Credentials ──────────────────────────────────
  public async storeCloudCredentials(creds: CloudCredentials): Promise<void> {
    const key = SecretManager.KEY_CLOUD_PREFIX + creds.provider;
    await this.secrets.store(key, JSON.stringify(creds.data));
    this.logger.info(`${creds.provider} credentials stored securely`);
  }

  // ── Retrieve Cloud Provider Credentials ───────────────────────────────
  public async getCloudCredentials(
    provider: CloudCredentials["provider"],
  ): Promise<Record<string, string> | null> {
    const key = SecretManager.KEY_CLOUD_PREFIX + provider;
    const stored = await this.secrets.get(key);

    if (!stored) {
      return null;
    }

    try {
      return JSON.parse(stored) as Record<string, string>;
    } catch {
      return null;
    }
  }

  // ── Get credentials for any deploy target ──────────────────────────────
  // Returns SSH credentials for "vps", or cloud credentials for other targets
  public async getCredentialsForTarget(
    target: string,
  ): Promise<SshCredentials | Record<string, string> | null> {
    if (target === "vps") {
      return this.getSshCredentials();
    }
    return this.getCloudCredentials(target as CloudCredentials["provider"]);
  }

  // ── Prompt User for SSH Details ────────────────────────────────────────
  // Shows VS Code input boxes to collect credentials interactively
  public async promptForSshCredentials(): Promise<SshCredentials | null> {
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
      validateInput: (value) =>
        value.trim() ? null : "Username cannot be empty",
    });

    if (!username) {
      return null;
    }

    // Ask if they want to use password or SSH key
    const authMethod = await vscode.window.showQuickPick(
      ["Password", "SSH Private Key"],
      {
        placeHolder: "Choose authentication method",
      },
    );

    if (!authMethod) {
      return null;
    }

    const creds: SshCredentials = {
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
    } else {
      // Ask for the path to the private key file
      const keyPath = await vscode.window.showInputBox({
        prompt: "Enter path to your SSH private key",
        placeHolder: "~/.ssh/id_rsa",
      });
      if (!keyPath) {
        return null;
      }

      // Read the key file
      const fileUtils = new FileUtils();

      // Expand ~ to the home directory
      const expandedPath = keyPath.replace(
        /^~/,
        process.env.HOME || process.env.USERPROFILE || "",
      );
      const keyContent = await fileUtils.readFile(expandedPath);

      if (!keyContent) {
        vscode.window.showErrorMessage(
          `Could not read SSH key file: ${expandedPath}`,
        );
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
