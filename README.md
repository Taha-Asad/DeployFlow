# DeployFlow AI 🚀 — Code to Cloud in One Click

**AI-powered deployment automation for VS Code**

DeployFlow AI is a VS Code extension that automates your deployment process from start to finish. With intelligent target detection, multi-cloud support, and AI-powered error fixing, going from code to production has never been easier.

## Features

✨ **One-Click Deployment**
- Deploy to 7+ cloud platforms instantly
- Automatic project analysis and configuration
- No complex setup required

🤖 **AI-Powered Intelligence**
- Automatic Dockerfile generation
- Intelligent build error detection and fixing
- Smart dependency analysis

☁️ **Multi-Cloud Support**
- **VPS / SSH** — Any Linux server
- **Vercel** — Frontend & Serverless functions
- **Netlify** — Static sites & edge functions
- **Cloudflare** — Pages & workers
- **AWS ECS** — Container-based deployments
- **Google Cloud Run** — Serverless containers
- **Azure Container Apps** — Managed containers

🔒 **Enterprise Security**
- End-to-end encrypted credential storage
- No credentials in your code
- Secure secret management via VS Code vault
- Vulnerability scanning (optional Trivy integration)

📊 **Deployment Monitoring**
- Live progress tracking
- Real-time logs & error messages
- Deployment history & rollback capability
- Prometheus/Grafana integration (optional)

🔄 **Smart Workflow**
1. **Analyze** — Detect project type & dependencies
2. **Configure** — Set deployment target & credentials
3. **Build** — Generate Dockerfile & build container
4. **Fix** — AI-powered error recovery
5. **Deploy** — Push to your cloud platform
6. **Monitor** — Track deployment health
7. **Rollback** — Restore previous versions if needed

## Quick Start

### Prerequisites
- VS Code 1.119 or later
- Node.js 18+ (for building your projects)
- One of the supported deployment targets (VPS, Vercel, AWS, etc.)

### Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "DeployFlow AI"
4. Click **Install**

### First Deployment

1. Open your project in VS Code
2. Run Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
3. Search for **"DeployFlow: Deploy Project"**
4. Follow the 3-step wizard:
   - **Step 1:** Choose your deployment target
   - **Step 2:** Enter credentials & configuration
   - **Step 3:** Review & deploy

That's it! 🎉

## Configuration

### Extension Settings

Open VS Code Settings and search for "deployflow" to customize:

#### AI Provider Configuration
- **`deployflow.aiProvider`** — Which AI provider to use
  - `ollama` (default) — Local, fully private
  - `openai` — ChatGPT-powered error fixing
  - `anthropic` — Claude-powered fixes
  - `gemini` — Google's Gemini model

- **`deployflow.ollamaUrl`** — URL to your local Ollama server
  - Default: `http://localhost:11434`

- **`deployflow.ollamaModel`** — Which Ollama model to use
  - Default: `codellama` (recommended for code)
  - Also supports: `llama2`, `mistral`, `neural-chat`

#### Deployment Configuration
- **`deployflow.defaultTarget`** — Your preferred deployment platform
  - Options: `vps`, `vercel`, `netlify`, `cloudflare`, `aws`, `gcp`, `azure`
  - Default: `vps`

- **`deployflow.maxFixAttempts`** — How many times AI should try to fix build errors
  - Range: 1-5
  - Default: `3`

#### Optional Features
- **`deployflow.enableTrivyScan`** — Scan Docker images for security vulnerabilities
  - Requires Docker & Trivy CLI
  - Default: `true`

- **`deployflow.enableMonitoring`** — Generate Prometheus/Grafana monitoring configs
  - For production Kubernetes deployments
  - Default: `false`

- **`deployflow.enableKubernetes`** — Generate Kubernetes manifests
  - For advanced K8s deployments
  - Default: `false`

- **`deployflow.logLevel`** — Logging verbosity
  - Options: `debug`, `info`, `warn`, `error`
  - Default: `info`

## Supported Platforms

### 🖥️ VPS / SSH
Deploy to any Linux server. Perfect for full control.
- **What you need:** Server IP, SSH username & password
- **Best for:** Custom deployments, private infrastructure
- **Price:** Your existing server costs

### ▲ Vercel
Optimized for Next.js and modern frontend frameworks.
- **What you need:** Vercel token
- **Best for:** React, Next.js, Vue, Svelte apps
- **Price:** Free tier available

### 🟢 Netlify
Static sites and edge functions at the edge.
- **What you need:** Netlify auth token
- **Best for:** Static sites, JAMstack, edge functions
- **Price:** Free tier available

### 🔶 Cloudflare
Global edge network with Workers.
- **What you need:** API token & account ID
- **Best for:** High-performance edge deployments
- **Price:** Free tier available

### ☁️ AWS ECS
Enterprise container orchestration.
- **What you need:** AWS access keys, region
- **Best for:** Large-scale container deployments
- **Price:** Per-container billing

### 🔵 Google Cloud Run
Serverless container platform.
- **What you need:** GCP project ID & region
- **Best for:** Serverless containerized apps
- **Price:** Per-invocation billing

### 🌐 Azure
Microsoft's cloud platform.
- **What you need:** Subscription ID, resource group
- **Best for:** .NET, Azure ecosystem integration
- **Price:** Pay-as-you-go

## Commands

All commands are accessible via Command Palette (Ctrl+Shift+P):

### `DeployFlow: Deploy Project` 🚀
Start the deployment wizard. If config exists, offers quick deploy or reconfigure.

### `DeployFlow: Analyze Project` 🔍
Analyze your project without deploying. See detected framework, dependencies, port, etc.

### `DeployFlow: Generate SDLC Docs` 📄
Generate comprehensive SDLC documentation (architecture, deployment process, runbooks).

### `DeployFlow: Rollback Deployment` ⏮️
Restore the previous deployment version.

### `DeployFlow: Configure DeployFlow` ⚙️
Open extension settings for customization.

### `DeployFlow: Show Deploy Progress` 📊
Open the deployment progress panel in the sidebar.

## How It Works

### Step 1: Project Analysis
DeployFlow scans your project to detect:
- Framework & language (Node.js, Python, Go, .NET, Java, etc.)
- Dependencies & package managers (npm, pip, pip, maven, etc.)
- Port & health check endpoint
- Environment variables needed
- Database/cache requirements

### Step 2: Dockerfile Generation
Automatically creates an optimized Dockerfile with:
- Minimal base images (alpine when possible)
- Multi-stage builds for smaller images
- Security best practices
- Caching optimizations

### Step 3: Build & Test
- Builds your Docker container locally
- Runs health checks
- Scans for vulnerabilities (optional)
- Detects build errors

### Step 4: AI Error Fixing
If build fails:
- AI analyzes the error
- Suggests & attempts fixes automatically
- Retries up to `maxFixAttempts` times
- Logs all attempts for review

### Step 5: Cloud Deployment
- Pushes image to cloud registry
- Creates/updates cloud services
- Configures domains & SSL
- Sets up monitoring alerts

### Step 6: Post-Deployment
- Verifies deployment health
- Runs smoke tests
- Configures monitoring
- Displays deployment URL

### Step 7: Ongoing Management
- Track deployment health
- View real-time logs
- Rollback if issues arise
- Update when you push new code

## Keyboard Shortcuts

- **Ctrl+Shift+P** (Cmd+Shift+P on Mac) — Open Command Palette
- **Ctrl+Shift+D** (Cmd+Shift+D on Mac) — Quick deploy (configurable)

## Troubleshooting

### "No folder open" Error
**Solution:** Open a project folder in VS Code before deploying.

### "Could not connect to Ollama" Error
**Solution:** 
1. Install Ollama from ollama.ai
2. Start Ollama: `ollama serve`
3. Pull a model: `ollama pull codellama`
4. Verify URL in settings matches your Ollama server

### Build Fails with "Command not found"
**Solution:** DeployFlow will automatically attempt to fix this with AI. Check the logs for details.

### Credentials Not Saving
**Solution:** Ensure VS Code's secure storage is working:
1. Restart VS Code
2. Check VS Code version is 1.119+
3. Try entering credentials again

### Deployment Hangs
**Solution:**
1. Check the progress panel (DeployFlow → Show Deploy Progress)
2. Review logs in the Output channel (View → Output → DeployFlow)
3. Try canceling and retrying

### "Permission Denied" on VPS Deployment
**Solution:**
1. Ensure SSH user has sudo access: `sudo -l`
2. Use `root` user if necessary
3. Consider SSH key auth instead of password

## Testing

The extension includes comprehensive unit and integration tests. To run them:

```bash
# Compile TypeScript
npm run compile

# Run tests
npm run test

# Watch mode (auto-recompile & test)
npm run watch
```

Test files are located in `src/test/`:
- `DeployWizard.test.ts` — UI wizard functionality
- `ConfigManager.test.ts` — Configuration management
- `DeployCommand.test.ts` — Deploy command execution
- `WorkflowEngine.test.ts` — Deployment workflow

## Contributing

Found a bug? Have a feature request? [Open an issue on GitHub](https://github.com/deployflow/deployflow-ai/issues)

## License

MIT License — See LICENSE file for details

## Privacy

DeployFlow AI:
- ✅ Never sends your code to external servers (unless using cloud AI provider)
- ✅ Stores credentials securely in VS Code's vault
- ✅ Supports local Ollama for completely private AI
- ✅ Open source — audit the code anytime

## Support

- 📖 [Documentation](https://github.com/deployflow/deployflow-ai/wiki)
- 💬 [Discord Community](https://discord.gg/deployflow)
- 🐛 [Report Issues](https://github.com/deployflow/deployflow-ai/issues)
- 📧 [Email Support](mailto:support@deployflow.ai)

## Roadmap

- [ ] GitHub Actions integration
- [ ] GitLab CI/CD integration
- [ ] Terraform code generation
- [ ] Docker Compose multi-container support
- [ ] Helm chart generation for Kubernetes
- [ ] Auto-scaling configuration
- [ ] Database backup automation
- [ ] Cost estimation & optimization

---

**Made with ❤️ by the DeployFlow team**

*Get your code to cloud in seconds, not hours. DeployFlow AI — because deployment shouldn't be complicated.* 🚀
