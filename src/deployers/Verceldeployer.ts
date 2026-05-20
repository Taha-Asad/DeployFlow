// ────────────────────────────────────────────────────────────────────────────
// src/deployers/VercelDeployer.ts
// Deploy to Vercel using the Vercel CLI or REST API
// ────────────────────────────────────────────────────────────────────────────

import * as vscode from "vscode";
import { ProjectInfo } from "../core/ProjectAnalyzer";
import { DeployConfig } from "../core/ConfigManager";
import { BaseDeployer, DeployResult } from "./BaseDeployer";
import { ShellUtils } from "../utils/ShellUtils";

export class VercelDeployer extends BaseDeployer {
  private shell: ShellUtils;

  constructor() {
    super();
    this.shell = new ShellUtils();
  }

  public async deploy(
    projectInfo: ProjectInfo,
    config: DeployConfig,
    credentials: Record<string, string>,
    onProgress: (msg: string) => void,
  ): Promise<DeployResult> {
    try {
      this.validateCredentials(credentials, ["VERCEL_TOKEN"]);

      const token = credentials["VERCEL_TOKEN"];
      let appName = config.appName || projectInfo.name;
      appName = appName
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "-")
        .replace(/---+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 100);

      // ── 1. Check Vercel CLI is installed ───────────────────────────────
      const cliExists = await this.shell.commandExists("vercel");
      if (!cliExists) {
        onProgress("Installing Vercel CLI...");
        const install = await this.shell.run("npm install -g vercel");
        if (!install.success) {
          throw new Error(`Failed to install Vercel CLI: ${install.stderr}`);
        }
      }

      // ── 2. Git setup ──────────────────────────────────────────────────
      const gitResult = await this.ensureGitSetup(projectInfo, onProgress);

      // ── 3. Link Vercel to git (skip if already linked) ────────────────
      const isLinked = await this.isVercelLinked(projectInfo);
      let gitUrl: string | undefined;

      if (!isLinked) {
        if (gitResult.gitAvailable) {
          gitUrl = await this.ensureVercelLink(
            projectInfo, token, appName, gitResult.remoteUrl, onProgress,
          );
        }
      } else {
        onProgress("Vercel project already linked — updating existing deployment");
      }

      // ── 4. Deploy ──────────────────────────────────────────────────────
      const deployAction = isLinked ? "Updating" : "Deploying";
      onProgress(`${deployAction} to Vercel...`);

      const args = ["--token", token, "--name", appName, "--yes", "--prod"];

      if (config.domain) {
        args.push("--alias", config.domain);
      }

      // Capture URL from streaming output since result.stdout is empty
      // when onOutput callback is provided
      let capturedUrl: string | undefined;
      const outputLines: string[] = [];

      const result = await this.shell.runStreaming("vercel", args, {
        cwd: projectInfo.rootPath,
        onOutput: (line) => {
          outputLines.push(line);
          const url = this.extractVercelUrl(line);
          if (url) capturedUrl = url;
          onProgress(`  ${line}`);
        },
        timeout: 300000,
      });

      if (!result.success) {
        const stderr = result.stderr || outputLines.join("\n");
        throw new Error(stderr || "Vercel deployment failed");
      }

      const deployedUrl = capturedUrl
        || this.extractVercelUrl(outputLines.join("\n"))
        || `https://${appName}.vercel.app`;

      onProgress(`Deployed to Vercel: ${deployedUrl}`);

      await this.waitForDeployment(deployedUrl, onProgress);

      return { success: true, url: deployedUrl };
    } catch (error) {
      return this.errorResult(error);
    }
  }

  // ── Ensure git is initialized and has a commit ────────────────────────────
  private async ensureGitSetup(
    projectInfo: ProjectInfo,
    onProgress: (msg: string) => void,
  ): Promise<{ gitAvailable: boolean; remoteUrl?: string }> {
    const gitExists = await this.shell.commandExists("git");
    if (!gitExists) {
      onProgress("Git not found — skipping git setup");
      return { gitAvailable: false };
    }

    const isRepo = await this.shell.run("git rev-parse --git-dir", {
      cwd: projectInfo.rootPath,
    });

    if (!isRepo.success) {
      onProgress("Initializing git repository...");
      const init = await this.shell.run("git init", {
        cwd: projectInfo.rootPath,
      });
      if (!init.success) {
        onProgress("Failed to init git — skipping");
        return { gitAvailable: true };
      }
      onProgress("Git repository initialized");
    }

    // Check if there's at least one commit
    const hasCommit = await this.shell.run("git rev-parse HEAD", {
      cwd: projectInfo.rootPath,
    });

    if (!hasCommit.success) {
      onProgress("Creating initial commit...");
      await this.shell.run("git add -A", { cwd: projectInfo.rootPath });
      const commit = await this.shell.run(
        'git commit -m "Initial commit from DeployFlow AI"',
        { cwd: projectInfo.rootPath },
      );
      if (!commit.success) {
        onProgress("No files to commit — continuing");
      } else {
        onProgress("Initial commit created");
      }
    }

    // Try to detect the git remote URL
    const remote = await this.shell.run("git remote get-url origin", {
      cwd: projectInfo.rootPath,
    });

    if (remote.success && remote.stdout) {
      return { gitAvailable: true, remoteUrl: remote.stdout };
    }

    return { gitAvailable: true };
  }

  // ── Link the project to Vercel (connects git repo) ───────────────────────
  private async ensureVercelLink(
    projectInfo: ProjectInfo,
    token: string,
    appName: string,
    remoteUrl: string | undefined,
    onProgress: (msg: string) => void,
  ): Promise<string | undefined> {
    // Check if already linked (Vercel stores project link in .vercel/)
    const linkCheck = await this.shell.run(
      "vercel --token $VERCEL_TOKEN link --yes 2>&1 || true",
      {
        cwd: projectInfo.rootPath,
        env: { VERCEL_TOKEN: token },
        timeout: 30000,
      },
    );

    // If we have a remote URL, return it
    if (remoteUrl) {
      return remoteUrl;
    }

    // No remote URL — ask the user to provide the git repo URL
    const userUrl = await vscode.window.showInputBox({
      prompt: "Enter your Git repository URL (e.g., https://github.com/user/repo)",
      placeHolder: "https://github.com/your-username/your-repo",
      ignoreFocusOut: true,
    });

    if (userUrl) {
      onProgress(`Using git URL: ${userUrl}`);
      await this.shell.run(`git remote add origin "${userUrl}"`, {
        cwd: projectInfo.rootPath,
      });
      return userUrl;
    }

    return undefined;
  }

  // ── Check if the project is already linked to Vercel ─────────────────────
  // Vercel creates .vercel/project.json with {orgId, projectId} after linking
  private async isVercelLinked(projectInfo: ProjectInfo): Promise<boolean> {
    const result = await this.shell.run(
      "test -f .vercel/project.json && echo linked || echo not-linked",
      { cwd: projectInfo.rootPath },
    );
    return result.stdout === "linked";
  }

  // ── Extract a Vercel deployment URL from a line of text ──────────────────
  private extractVercelUrl(text: string): string | undefined {
    const match = text.match(/https:\/\/[^\s]+\.vercel\.app/);
    return match?.[0] || undefined;
  }
}
