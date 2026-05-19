# Changelog

All notable changes to the **DeployFlow AI** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-05-18

### Added

- **One-Click Deployment** to 7+ cloud platforms (VPS/SSH, Vercel, Netlify, Cloudflare, AWS ECS, Google Cloud Run, Azure)
- **AI-Powered Intelligence** — automatic Dockerfile generation, build error detection, and smart error recovery with configurable retry attempts
- **Project Analysis** — automatic detection of framework, language, package manager, dependencies, port, and monorepo structure
- **Multi-Cloud Deployers:**
  - VPS/SSH — full implementation with Docker auto-install, nginx setup, Let's Encrypt SSL, systemd service, and firewall configuration
  - Vercel — CLI-based deployment with URL output parsing
  - AWS ECS — ECR push and ECS service update with deployment stabilization
  - Netlify, Cloudflare, GCP, Azure — foundation stubs ready for extension
- **3-Step Interactive Setup Wizard** — webview-based UI for target selection, credential entry, and deployment review
- **SDLC Documentation Generation** — AI-generated BRD, SRS, API docs, and Architecture documents
- **Deployment Rollback** — restore previous deployment snapshots
- **Real-Time Progress Panel** — sidebar webview showing live deployment status
- **Configurable Settings:**
  - AI provider: Ollama (default/local), OpenAI, Anthropic, Gemini
  - Default deployment target, max fix attempts, log level
  - Optional features: Trivy vulnerability scanning, Prometheus/Grafana monitoring, Kubernetes manifests
- **6 VS Code Commands** — Deploy, Analyze, Generate Docs, Rollback, Configure, Show Progress
- **Enterprise Security** — encrypted credential storage via VS Code SecretStorage
- **Comprehensive Logging** — dedicated Output channel with configurable verbosity
- **Local AI-First** — Ollama as default provider, no API key required, auto-pulls models

### Fixed

- **UI Wizard Navigation** — resolved JavaScript event listener issues preventing step transitions
- **Element Binding** — ensured all DOM elements are properly initialized before attaching listeners
- **Null Safety** — added proper null checks and error logging throughout the wizard
- **Credential Collection** — improved null safety in credential gathering flow
- **Step Transitions** — fixed `goStep()` function to properly validate element existence before access

### Changed

- Complete rewrite of DeployWizard JavaScript for robust error handling
- Enhanced UI responsiveness with improved event listener management
- Better credential validation before deployment submission
- Improved error messages across the extension for easier troubleshooting

### Tested

- Unit tests for DeployWizard, ConfigManager, DeployCommand, WorkflowEngine
- Integration tests covering the complete deployment pipeline
- Cross-platform compatibility (Windows, macOS, Linux)

## [Unreleased]

### Planned

- GitHub Actions CI/CD pipeline generation
- GitLab CI/CD pipeline generation
- Terraform infrastructure-as-code generation
- Docker Compose multi-container support
- Helm chart generation for Kubernetes
- Auto-scaling configuration templates
- Database backup automation
- Cost estimation and optimization