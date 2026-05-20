import * as vscode from "vscode";
import { ConfigManager, DeployConfig } from "../core/ConfigManager";
import { SecretManager, SshCredentials } from "../core/SecretManager";

const TARGETS = [
  { id: "vps",        icon: "\u{1F5A5}\uFE0F", name: "VPS / SSH",       desc: "Any Linux server" },
  { id: "vercel",     icon: "\u25B2",           name: "Vercel",          desc: "Frontend & Serverless" },
  { id: "netlify",    icon: "\u{1F7E2}",        name: "Netlify",         desc: "Static Sites & Edge" },
  { id: "cloudflare", icon: "\u{1F536}",         name: "Cloudflare",     desc: "Pages & Workers" },
  { id: "aws",        icon: "\u2601\uFE0F",      name: "AWS ECS",        desc: "Container Service" },
  { id: "gcp",        icon: "\u{1F535}",         name: "Google Cloud",   desc: "Cloud Run" },
  { id: "azure",      icon: "\u{1F310}",         name: "Azure",          desc: "Container Apps" },
];

const CREDENTIAL_FIELDS: Record<string, Array<{ id: string; label: string; password?: boolean; hint?: string; placeholder?: string }>> = {
  vps: [
    { id: "vps-host", label: "Server IP / Hostname", placeholder: "192.168.1.100 or myserver.com", hint: "Public IP or domain of your VPS. Get it from your cloud provider dashboard (DigitalOcean, Linode, AWS EC2, etc.)" },
    { id: "vps-port", label: "SSH Port", placeholder: "22", hint: "Default: 22. Change if your server uses a custom SSH port." },
    { id: "vps-user", label: "SSH Username", placeholder: "root", hint: "Usually 'root' or 'ubuntu'. Use the user you SSH into the server with." },
    { id: "vps-pass", label: "SSH Password", password: true, placeholder: "Enter password", hint: "Your SSH password. Or use SSH key auth via \u2699\uFE0F Configure DeployFlow for passwordless login." },
  ],
  vercel: [
    { id: "vercel-token", label: "Vercel Token", password: true, hint: "1. Go to https://vercel.com/account/tokens  2. Click 'Create Token'  3. Name it (e.g. 'deployflow')  4. Copy the token and paste it here" },
  ],
  netlify: [
    { id: "netlify-token", label: "Netlify Auth Token", password: true, hint: "1. Go to https://app.netlify.com/user/applications  2. Under 'Personal access tokens', click 'New access token'  3. Copy the token and paste it here" },
  ],
  cloudflare: [
    { id: "cf-token", label: "Cloudflare API Token", password: true, hint: "1. Go to https://dash.cloudflare.com/profile/api-tokens  2. Click 'Create Token'  3. Use 'Edit Cloudflare Workers' template or create custom with 'Pages:Write' permission  4. Copy and paste the token here" },
    { id: "cf-account", label: "Cloudflare Account ID", hint: "1. Go to https://dash.cloudflare.com  2. In right sidebar under your account name, find 'Account ID'  3. Or go to any zone overview page and find 'Account ID' in right sidebar" },
  ],
  aws: [
    { id: "aws-key-id", label: "AWS Access Key ID", hint: "1. Go to https://console.aws.amazon.com/iam → Users → your user → Security credentials  2. Under 'Access keys', click 'Create access key'  3. Copy the 'Access key ID' here" },
    { id: "aws-secret", label: "AWS Secret Access Key", password: true, hint: "Copy the 'Secret access key' shown when you created the access key (only shown once!)" },
    { id: "aws-region", label: "AWS Region", placeholder: "us-east-1", hint: "e.g. us-east-1, us-west-2, eu-west-1, ap-southeast-1. Find it in your AWS console top-right corner." },
  ],
  gcp: [
    { id: "gcp-project", label: "GCP Project ID", hint: "1. Go to https://console.cloud.google.com  2. At the top bar, click the project dropdown → 'New Project' or select existing  3. Copy the 'Project ID' (not the name) from the project info card" },
    { id: "gcp-region", label: "GCP Region", placeholder: "us-central1", hint: "e.g. us-central1, europe-west1, asia-east1. Choose a region close to your users." },
  ],
  azure: [
    { id: "azure-sub", label: "Azure Subscription ID", hint: "1. Go to https://portal.azure.com  2. Search for 'Subscriptions' in the top bar  3. Select your subscription and copy the 'Subscription ID' (a UUID like 00000000-0000-0000-0000-000000000000)" },
    { id: "azure-rg", label: "Resource Group", hint: "1. In Azure Portal, search for 'Resource groups'  2. Create a new one or select existing  3. Enter the name here. E.g. 'deployflow-rg'" },
    { id: "azure-region", label: "Region", placeholder: "eastus", hint: "e.g. eastus, westeurope, southeastasia. Use the region closest to your users." },
  ],
};

const CREDENTIAL_MAP: Record<string, Record<string, string>> = {
  vps:        { SSH_HOST: "vps-host", SSH_PORT: "vps-port", SSH_USER: "vps-user", SSH_PASS: "vps-pass" },
  vercel:     { VERCEL_TOKEN: "vercel-token" },
  netlify:    { NETLIFY_AUTH_TOKEN: "netlify-token" },
  cloudflare: { CLOUDFLARE_API_TOKEN: "cf-token", CLOUDFLARE_ACCOUNT_ID: "cf-account" },
  aws:        { AWS_ACCESS_KEY_ID: "aws-key-id", AWS_SECRET_ACCESS_KEY: "aws-secret", AWS_REGION: "aws-region" },
  gcp:        { GCP_PROJECT_ID: "gcp-project", GCP_REGION: "gcp-region" },
  azure:      { AZURE_SUBSCRIPTION_ID: "azure-sub", AZURE_RESOURCE_GROUP: "azure-rg", AZURE_REGION: "azure-region" },
};

export class DeployWizard {
  private panel: vscode.WebviewPanel | undefined;
  private configManager: ConfigManager;
  private secretManager: SecretManager;

  constructor(configManager: ConfigManager, secretManager: SecretManager) {
    this.configManager = configManager;
    this.secretManager = secretManager;
  }

  public async show(extensionUri: vscode.Uri): Promise<DeployConfig | null> {
    return new Promise((resolve) => {
      this.panel = vscode.window.createWebviewPanel(
        "deployflowWizard",
        "\u{1F680} DeployFlow \u2014 Setup Wizard",
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [extensionUri] },
      );

      const nonce = this._getNonce();
      this.panel.webview.html = this._getWizardHtml(nonce, this.panel.webview);

      this.panel.webview.onDidReceiveMessage(
        async (message: { command: string; config?: DeployConfig; credentials?: Record<string, string> }) => {
          try {
            if (message.command === "cancel") {
              this.panel?.dispose();
              resolve(null);
              return;
            }
            if (message.command === "deploy" && message.config) {
              if (message.credentials) {
                if (message.config.target === "vps") {
                  const creds = message.credentials;
                  const ssh: SshCredentials = { host: creds.SSH_HOST || "", port: parseInt(creds.SSH_PORT) || 22, username: creds.SSH_USER || "", password: creds.SSH_PASS || undefined };
                  if (ssh.host && ssh.username) await this.secretManager.storeSshCredentials(ssh);
                } else {
                  await this.secretManager.storeCloudCredentials({
                    provider: message.config.target as "vercel" | "netlify" | "cloudflare" | "aws" | "gcp" | "azure",
                    data: message.credentials,
                  });
                }
              }
              await this.configManager.saveDeployConfig(message.config);
              this.panel?.dispose();
              resolve(message.config);
            }
          } catch (e) {
            vscode.window.showErrorMessage(`DeployWizard error: ${e instanceof Error ? e.message : String(e)}`);
            this.panel?.dispose();
            resolve(null);
          }
        },
      );

      this.panel.onDidDispose(() => resolve(null));
    });
  }

  private _getNonce(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let text = "";
    for (let i = 0; i < 32; i++) text += chars[Math.floor(Math.random() * chars.length)];
    return text;
  }

  private _getWizardHtml(nonce: string, webview: vscode.Webview): string {
    const cspSource = webview.cspSource;
    const steps = [1, 2, 3];

    const cardsHtml = TARGETS.map((t) => `
      <div class="card" data-target="${t.id}">
        <div class="card-icon">${t.icon}</div>
        <div class="card-name">${t.name}</div>
        <div class="card-desc">${t.desc}</div>
      </div>`).join("");

    const step1Html = `
      <div class="step active" data-step="1">
        <h2>Choose Deployment Target</h2>
        <div class="grid" id="targetGrid">${cardsHtml}</div>
        <div class="actions">
          <button class="btn primary" id="toStep2" disabled>Next \u2192</button>
          <button class="btn secondary" id="cancel1">Cancel</button>
        </div>
      </div>`;

    const commonFieldsHtml = `
      <label>App Name</label>
      <input id="appName" placeholder="my-app" />
      <p class="hint">Used as the Docker image and service name</p>
      <label>Domain (optional)</label>
      <input id="domain" placeholder="myapp.com" />`;

    const credPanelsHtml = Object.entries(CREDENTIAL_FIELDS).map(([target, fields]) => `
      <div class="cred-panel" data-for="${target}">
        ${fields.map((f) => `
          <label>${f.label}</label>
          <input id="${f.id}"${f.password ? ' type="password"' : ""} placeholder="${f.placeholder || '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}" />
          ${f.hint ? `<p class="hint">${f.hint}</p>` : ""}`).join("")}
      </div>`).join("");

    const step2Html = `
      <div class="step" data-step="2">
        <h2>Configure Credentials</h2>
        ${commonFieldsHtml}
        <div id="credContainer">${credPanelsHtml}</div>
        <div class="actions">
          <button class="btn primary" id="toStep3">Next \u2192</button>
          <button class="btn secondary" id="back1">\u2190 Back</button>
        </div>
      </div>`;

    const step3Html = `
      <div class="step" data-step="3">
        <h2>Review &amp; Deploy</h2>
        <div id="review"></div>
        <div class="actions">
          <button class="btn primary" id="deployBtn">\u{1F680} Deploy Now</button>
          <button class="btn secondary" id="back2">\u2190 Back</button>
          <button class="btn secondary" id="cancel3">Cancel</button>
        </div>
      </div>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${cspSource} data:;">
  <title>DeployFlow Setup Wizard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 24px; max-width: 680px; margin: 0 auto; }
    h1 { font-size: 20px; margin-bottom: 2px; }
    .sub { color: var(--vscode-descriptionForeground); margin-bottom: 24px; font-size: 12px; }
    h2 { font-size: 15px; font-weight: 600; margin-bottom: 16px; }
    .step { display: none; }
    .step.active { display: block; }
    .error-box { background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-inputValidation-errorForeground); border: 1px solid var(--vscode-inputValidation-errorBorder); padding: 10px 12px; border-radius: 4px; margin-bottom: 16px; font-size: 12px; white-space: pre-wrap; display: none; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; margin-bottom: 20px; }
    .card { border: 2px solid var(--vscode-widget-border); border-radius: 8px; padding: 14px 10px; cursor: pointer; text-align: center; transition: border-color .15s, background .15s; }
    .card:hover, .card:focus { border-color: var(--vscode-focusBorder); }
    .card.selected { border-color: var(--vscode-button-background); background: var(--vscode-list-activeSelectionBackground); }
    .card-icon { font-size: 24px; display: block; margin-bottom: 4px; }
    .card-name { font-weight: 600; font-size: 12px; }
    .card-desc { font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 2px; }
    label { display: block; font-size: 12px; font-weight: 600; margin-top: 12px; margin-bottom: 3px; }
    input { width: 100%; padding: 6px 10px; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); color: var(--vscode-input-foreground); border-radius: 4px; font-size: 13px; font-family: var(--vscode-font-family); }
    input:focus { outline: 1px solid var(--vscode-focusBorder); }
    .hint { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 3px; }
    .cred-panel { display: none; }
    .cred-panel.active { display: block; }
    .actions { display: flex; gap: 8px; margin-top: 24px; }
    .btn { padding: 8px 18px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 500; font-family: var(--vscode-font-family); }
    .btn:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
    .btn.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .btn.primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
    .btn.primary:disabled { opacity: .4; cursor: not-allowed; }
    .btn.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .btn.secondary:hover { opacity: .85; }
    #review { font-size: 13px; line-height: 1.8; background: var(--vscode-list-hoverBackground); padding: 16px; border-radius: 6px; }
  </style>
</head>
<body>
  <h1>\u{1F680} DeployFlow AI</h1>
  <p class="sub">Code to Cloud in One Click \u2014 let's set up your deployment.</p>
  <div class="error-box" id="errorBox"></div>
  ${step1Html}
  ${step2Html}
  ${step3Html}
  <script nonce="${nonce}">
    (function() {
      var api = acquireVsCodeApi();
      var currentStep = 1;
      var target = "";

      function showError(msg) {
        var box = document.getElementById("errorBox");
        if (box) { box.textContent = msg; box.style.display = "block"; }
      }

      function qs(s) { return document.querySelector(s); }
      function qsa(s) { return document.querySelectorAll(s); }
      function byId(id) { return document.getElementById(id); }

      function goToStep(n) {
        qsa(".step.active").forEach(function(el) { el.classList.remove("active"); });
        var next = qs('[data-step="' + n + '"]');
        if (next) next.classList.add("active");
        currentStep = n;

        if (n === 2) {
          qsa(".cred-panel.active").forEach(function(el) { el.classList.remove("active"); });
          var cp = qs('.cred-panel[data-for="' + target + '"]');
          if (cp) cp.classList.add("active");
        }
        if (n === 3) {
          var appName = (byId("appName") ? byId("appName").value : "").trim() || "my-app";
          var domain = (byId("domain") ? byId("domain").value : "").trim();
          var review = byId("review");
          if (review) {
            review.innerHTML =
              "<b>Target:</b> " + escHtml(target.toUpperCase()) + "<br>" +
              "<b>App Name:</b> " + escHtml(appName) + "<br>" +
              (domain ? "<b>Domain:</b> " + escHtml(domain) + "<br>" : "") +
              "<br>\u2705 All credentials will be stored securely.";
          }
        }
      }

      function selectCard(el) {
        qsa(".card.selected").forEach(function(c) { c.classList.remove("selected"); });
        el.classList.add("selected");
        target = el.getAttribute("data-target");
        var btn = byId("toStep2");
        if (btn) btn.disabled = false;
      }

      function collectCreds() {
        var creds = {};
        var map = ${JSON.stringify(CREDENTIAL_MAP)};
        var fields = map[target];
        if (fields) {
          Object.keys(fields).forEach(function(key) {
            var el = byId(fields[key]);
            if (el) creds[key] = el.value || "";
          });
        }
        return creds;
      }

      function deploy() {
        try {
          var appName = (byId("appName") ? byId("appName").value : "").trim() || "my-app";
          var domain = (byId("domain") ? byId("domain").value : "").trim();
          api.postMessage({
            command: "deploy",
            config: { target: target, appName: appName, domain: domain || undefined, enableSsl: !!domain },
            credentials: collectCreds()
          });
        } catch (e) {
          showError("Deploy error: " + e.message);
        }
      }

      function cancel() { api.postMessage({ command: "cancel" }); }

      function escHtml(s) {
        return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
      }

      function init() {
        // Card clicks
        var grid = byId("targetGrid");
        if (grid) {
          grid.addEventListener("click", function(e) {
            var card = e.target.closest ? e.target.closest(".card") : null;
            if (card) selectCard(card);
          });
        } else {
          showError("targetGrid not found");
        }

        // Buttons
        var binds = [
          ["toStep2", function() { goToStep(2); }],
          ["toStep3", function() { goToStep(3); }],
          ["deployBtn", deploy],
          ["cancel1", cancel],
          ["cancel3", cancel],
          ["back1", function() { goToStep(1); }],
          ["back2", function() { goToStep(2); }],
        ];
        binds.forEach(function(pair) {
          var el = byId(pair[0]);
          if (el) el.addEventListener("click", pair[1]);
          else showError("Button " + pair[0] + " not found");
        });
      }

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
      } else {
        init();
      }
    })();
  </script>
</body>
</html>`;
  }
}
