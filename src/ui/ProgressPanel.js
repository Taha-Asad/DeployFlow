"use strict";
// ────────────────────────────────────────────────────────────────────────────
// src/ui/ProgressPanel.ts
// WebView panel in the sidebar that shows live deployment progress
// Receives step updates and renders them as a visual pipeline
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
exports.ProgressPanel = void 0;
const vscode = __importStar(require("vscode"));
class ProgressPanel {
    static viewType = "deployflow.progressPanel";
    _view;
    _extensionUri;
    _messages = [];
    constructor(extensionUri) {
        this._extensionUri = extensionUri;
    }
    // ── Called by VS Code when the panel becomes visible ───────────────────────
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };
        // ── BUG FIX 1: Generate a nonce for CSP so inline scripts are allowed ───
        const nonce = this._getNonce();
        webviewView.webview.html = this._getHtml(nonce, webviewView.webview);
        // Handle messages from the webview (e.g., "Open URL" button clicks)
        webviewView.webview.onDidReceiveMessage((message) => {
            if (message.command === "openUrl" && message.url) {
                vscode.env.openExternal(vscode.Uri.parse(message.url));
            }
        });
        // Replay any messages that arrived before the panel was visible
        for (const update of this._messages) {
            this._postUpdate(update);
        }
    }
    // ── Show the progress panel ────────────────────────────────────────────────
    show() {
        if (this._view) {
            this._view.show(true);
        }
        else {
            vscode.commands.executeCommand("deployflow.progressPanel.focus");
        }
    }
    // ── Update progress (called by WorkflowEngine) ────────────────────────────
    MAX_MESSAGES = 500;
    update(update) {
        this._messages.push(update);
        if (this._messages.length > this.MAX_MESSAGES) {
            this._messages.splice(0, this._messages.length - this.MAX_MESSAGES);
        }
        this._postUpdate(update);
    }
    // ── Reset for a new deployment ─────────────────────────────────────────────
    reset() {
        this._messages = [];
        this._view?.webview.postMessage({ command: "reset" });
    }
    // ── Post a message to the webview ─────────────────────────────────────────
    _postUpdate(update) {
        this._view?.webview.postMessage({
            command: "update",
            step: update.step,
            message: update.message,
            completed: update.completed ?? false,
        });
    }
    // ── BUG FIX 2: Nonce generator for CSP ────────────────────────────────────
    _getNonce() {
        let text = "";
        const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
    // ── Generate the WebView HTML ──────────────────────────────────────────────
    _getHtml(nonce, webview) {
        // ── BUG FIX 3: Use webview.cspSource for a correct CSP policy ────────────
        const cspSource = webview.cspSource;
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!--
    BUG FIX 1: Content Security Policy was missing entirely.
    Without this, VS Code's webview blocks ALL inline scripts,
    which silently kills every click handler and event listener.
    The nonce must match the one on the <script> tag below.
  -->
  <meta
    http-equiv="Content-Security-Policy"
    content="
      default-src 'none';
      style-src ${cspSource} 'unsafe-inline';
      script-src 'nonce-${nonce}';
      img-src ${cspSource} data:;
    "
  >

  <title>DeployFlow Progress</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 12px;
    }
    h2 { font-size: 13px; font-weight: 600; margin-bottom: 12px; opacity: 0.8; }
    .steps { display: flex; flex-direction: column; gap: 4px; }
    .step {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 6px 8px; border-radius: 4px;
      background: var(--vscode-list-hoverBackground);
      opacity: 0.5;
      transition: opacity 0.3s;
    }
    .step.active {
      opacity: 1;
      background: var(--vscode-list-activeSelectionBackground);
    }
    .step.done { opacity: 1; }
    .step-icon { font-size: 14px; flex-shrink: 0; margin-top: 1px; }
    .step-content { flex: 1; }
    .step-name {
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .step-messages { margin-top: 4px; }
    .msg {
      font-size: 11px;
      opacity: 0.8;
      padding: 2px 0;
      word-break: break-word;
    }
    .divider {
      height: 1px;
      background: var(--vscode-widget-border);
      margin: 8px 0;
    }
    #url-container { display: none; margin-top: 12px; }
    #url-container.visible { display: block; }
    .url-btn {
      display: block;
      width: 100%;
      padding: 8px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;

      /*
        BUG FIX 2: cursor was set to pointer but focus styles were missing,
        making the button feel broken for keyboard users. Added outline reset
        and explicit :focus style via the stylesheet below.
      */
      cursor: pointer;
      font-size: 12px;
      text-align: center;
      font-family: var(--vscode-font-family);
    }
    .url-btn:hover { background: var(--vscode-button-hoverBackground); }
    .url-btn:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }
    .empty {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      text-align: center;
      padding: 20px 0;
    }
  </style>
</head>
<body>
  <h2>Deploy Progress</h2>
  <div id="empty" class="empty">Run a deployment to see progress here.</div>
  <div class="steps" id="steps" style="display:none"></div>
  <div id="url-container">
    <div class="divider"></div>
    <!--
      BUG FIX 3: Removed the inline onclick="" attribute entirely.
      Inline handlers are blocked by the CSP. The listener is
      attached via addEventListener inside the script below.
    -->
    <button class="url-btn" id="url-btn">🌐 Open Deployed App</button>
  </div>

  <!--
    The nonce attribute is REQUIRED to match the CSP header above.
    Without it the entire script block is silently dropped by VS Code.
  -->
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    function makeSteps() {
      return {
        analyze:  { label: 'Analyze',  icon: '🔍', messages: [], done: false },
        generate: { label: 'Generate', icon: '📝', messages: [], done: false },
        build:    { label: 'Build',    icon: '🔨', messages: [], done: false },
        scan:     { label: 'Scan',     icon: '🔒', messages: [], done: false },
        deploy:   { label: 'Deploy',   icon: '🚀', messages: [], done: false },
        verify:   { label: 'Verify',   icon: '✅', messages: [], done: false },
        done:     { label: 'Done',     icon: '🎉', messages: [], done: false },
      };
    }

    let steps = makeSteps();
    let currentStep = null;
    let deployedUrl  = null;

    function init() {
      window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.command === 'reset')        { resetUI();          }
        else if (msg.command === 'update')  { handleUpdate(msg);  }
      });

      const btn = document.getElementById('url-btn');
      if (btn) btn.addEventListener('click', openUrl);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

    function resetUI() {
      steps        = makeSteps();
      currentStep  = null;
      deployedUrl  = null;

      document.getElementById('empty').style.display        = 'block';
      document.getElementById('steps').style.display        = 'none';
      document.getElementById('url-container').classList.remove('visible');
      document.getElementById('url-btn').textContent        = '🌐 Open Deployed App';

      render();
    }

    function handleUpdate(msg) {
      document.getElementById('empty').style.display = 'none';
      document.getElementById('steps').style.display = 'flex';

      currentStep = msg.step;

      if (steps[msg.step]) {
        steps[msg.step].messages.push(msg.message);

        if (msg.completed) {
          steps[msg.step].done = true;
        }
      }

      const urlMatch = msg.message.match(/https?:\\/\\/[^\\s]+/);
      if (urlMatch) {
        deployedUrl = urlMatch[0];
        document.getElementById('url-container').classList.add('visible');

        const displayUrl = deployedUrl.length > 40
          ? deployedUrl.slice(0, 37) + '...'
          : deployedUrl;
        document.getElementById('url-btn').textContent = '🌐 Open: ' + displayUrl;
      }

      render();
    }

    function render() {
      const container = document.getElementById('steps');
      container.innerHTML = Object.entries(steps)
        .filter(([key]) => key !== 'done' || steps[key].messages.length > 0)
        .map(([key, s]) => {
          const isActive = key === currentStep && !s.done;
          const cls      = s.done ? 'done' : (isActive ? 'active' : '');
          const icon     = s.done ? '✅'   : (isActive ? '⏳'    : s.icon);

          const msgs = s.messages
            .slice(-5)
            .map(m => \`<div class="msg">\${escHtml(m)}</div>\`)
            .join('');

          return \`
            <div class="step \${cls}">
              <div class="step-icon">\${icon}</div>
              <div class="step-content">
                <div class="step-name">\${escHtml(s.label)}</div>
                <div class="step-messages">\${msgs}</div>
              </div>
            </div>\`;
        })
        .join('');
    }

    function openUrl() {
      if (deployedUrl) {
        vscode.postMessage({ command: 'openUrl', url: deployedUrl });
      }
    }

    function escHtml(str) {
      return String(str)
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#39;');
    }
  </script>
</body>
</html>`;
    }
}
exports.ProgressPanel = ProgressPanel;
//# sourceMappingURL=ProgressPanel.js.map