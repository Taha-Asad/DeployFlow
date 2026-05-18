"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// src/generators/SdlcGenerator.ts
// Generates SDLC documentation using AI
// SDLC = Software Development Life Cycle
// Documents: BRD, SRS, API docs, Architecture docs
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
exports.SdlcGenerator = void 0;
const path = __importStar(require("path"));
const FileUtils_1 = require("../utils/FileUtils");
const Logger_1 = require("../utils/Logger");
class SdlcGenerator {
    aiManager;
    fileUtils;
    logger;
    constructor(aiManager) {
        this.aiManager = aiManager;
        this.fileUtils = new FileUtils_1.FileUtils();
        this.logger = Logger_1.Logger.getInstance();
    }
    // ── Generate all SDLC documents ───────────────────────────────────────
    async generate(projectInfo, onProgress) {
        const docsDir = path.join(projectInfo.rootPath, "docs");
        const documents = {};
        this.logger.info("Generating SDLC documentation...");
        // Gather project context for AI
        const context = await this.gatherProjectContext(projectInfo);
        // ── Generate BRD ──────────────────────────────────────────────────
        onProgress("📄 Generating Business Requirements Document...");
        try {
            documents.brd = await this.generateBrd(context, projectInfo);
            await this.fileUtils.writeFile(path.join(docsDir, "BRD.md"), documents.brd);
            onProgress("✅ BRD generated");
        }
        catch (error) {
            this.logger.warn("Failed to generate BRD", error);
        }
        // ── Generate SRS ──────────────────────────────────────────────────
        onProgress("📄 Generating Software Requirements Specification...");
        try {
            documents.srs = await this.generateSrs(context, projectInfo);
            await this.fileUtils.writeFile(path.join(docsDir, "SRS.md"), documents.srs);
            onProgress("✅ SRS generated");
        }
        catch (error) {
            this.logger.warn("Failed to generate SRS", error);
        }
        // ── Generate API Docs ─────────────────────────────────────────────
        if (projectInfo.type === "backend" || projectInfo.type === "fullstack") {
            onProgress("📄 Generating API Documentation...");
            try {
                documents.apiDocs = await this.generateApiDocs(context, projectInfo);
                await this.fileUtils.writeFile(path.join(docsDir, "API.md"), documents.apiDocs);
                onProgress("✅ API docs generated");
            }
            catch (error) {
                this.logger.warn("Failed to generate API docs", error);
            }
        }
        // ── Generate Architecture Doc ─────────────────────────────────────
        onProgress("📄 Generating Architecture Document...");
        try {
            documents.architecture = await this.generateArchitecture(context, projectInfo);
            await this.fileUtils.writeFile(path.join(docsDir, "ARCHITECTURE.md"), documents.architecture);
            onProgress("✅ Architecture doc generated");
        }
        catch (error) {
            this.logger.warn("Failed to generate architecture doc", error);
        }
        return documents;
    }
    // ── Generate Business Requirements Document ───────────────────────────
    async generateBrd(context, info) {
        const prompt = `You are a technical business analyst. Based on this project's code and structure,
generate a comprehensive Business Requirements Document (BRD).

Project Context:
${context}

Framework: ${info.framework}
Language: ${info.language}
Type: ${info.type}

Generate a BRD with these sections:
1. Executive Summary
2. Business Objectives
3. Project Scope (In-Scope and Out-of-Scope)
4. Stakeholders
5. Business Requirements (functional needs)
6. Non-Functional Requirements (performance, security, scalability)
7. Constraints and Assumptions
8. Success Criteria
9. Timeline and Milestones (estimated)
10. Risk Analysis

Use Markdown formatting. Be specific and professional.`;
        const response = await this.aiManager.ask(prompt);
        return `# Business Requirements Document\n\n*Generated by DeployFlow AI on ${new Date().toLocaleDateString()}*\n\n${response}`;
    }
    // ── Generate Software Requirements Specification ──────────────────────
    async generateSrs(context, info) {
        const prompt = `You are a software architect. Based on this project, generate a Software Requirements Specification (SRS).

Project Context:
${context}

Framework: ${info.framework}
Language: ${info.language}
Detected dependencies: ${JSON.stringify(Object.keys(info.files.packageJson
            ?.dependencies || {}).slice(0, 20))}

Generate a detailed SRS with:
1. Introduction (Purpose, Scope, Definitions)
2. Overall Description (Product Perspective, Functions, User Classes)
3. System Features (with use cases for each)
4. External Interface Requirements (UI, API, Hardware, Software)
5. Non-Functional Requirements
   - Performance Requirements
   - Security Requirements
   - Availability Requirements
6. Data Requirements (data models, storage)
7. System Constraints
8. Appendix

Use Markdown. Include specific technical details based on the detected framework.`;
        const response = await this.aiManager.ask(prompt);
        return `# Software Requirements Specification\n\n*Generated by DeployFlow AI on ${new Date().toLocaleDateString()}*\n\n${response}`;
    }
    // ── Generate API Documentation ────────────────────────────────────────
    async generateApiDocs(context, info) {
        const prompt = `You are an API documentation expert. Based on this ${info.framework} project, generate API documentation.

Project Context:
${context}

Generate API documentation in Markdown with:
1. Overview (base URL, authentication, versioning)
2. Authentication (how to get/use tokens)
3. Request/Response Formats
4. Error Codes and Handling
5. Endpoints (for each endpoint):
   - Method and path
   - Description
   - Request parameters
   - Request body (with example)
   - Response body (with example)
   - Error responses
6. Rate Limiting
7. Changelog/Versioning

Base this on the framework (${info.framework}) best practices.
Include realistic example endpoints for this type of application.`;
        const response = await this.aiManager.ask(prompt);
        return `# API Documentation\n\n*Generated by DeployFlow AI on ${new Date().toLocaleDateString()}*\n\n${response}`;
    }
    // ── Generate Architecture Document ────────────────────────────────────
    async generateArchitecture(context, info) {
        const prompt = `You are a solutions architect. Generate a technical Architecture Document for this project.

Project Context:
${context}

Framework: ${info.framework}
Language: ${info.language}
Type: ${info.type}
Port: ${info.port}
Package manager: ${info.packageManager}

Generate an Architecture Document with:
1. Architecture Overview
2. System Architecture Diagram (use ASCII art or Mermaid diagram syntax)
3. Technology Stack (with versions and justification)
4. Component Architecture (frontend, backend, database, cache)
5. Data Flow Diagrams
6. Deployment Architecture
   - Container setup (Docker/Kubernetes)
   - Network topology
   - Load balancing
   - SSL/TLS termination
7. Security Architecture
   - Authentication/Authorization
   - Data encryption
   - Network security
8. Scalability Considerations
9. Disaster Recovery
10. Monitoring and Observability
11. Development Workflow (CI/CD pipeline)

Use Markdown with Mermaid diagrams where appropriate.`;
        const response = await this.aiManager.ask(prompt);
        return `# Architecture Document\n\n*Generated by DeployFlow AI on ${new Date().toLocaleDateString()}*\n\n${response}`;
    }
    // ── Gather project context for AI prompts ─────────────────────────────
    async gatherProjectContext(info) {
        const parts = [];
        // Package.json summary
        if (info.files.packageJson) {
            const pkg = info.files.packageJson;
            parts.push(`Project Name: ${pkg.name || info.name}`);
            parts.push(`Description: ${pkg.description || "Not specified"}`);
            parts.push(`Version: ${pkg.version || "1.0.0"}`);
            const deps = Object.keys(pkg.dependencies || {});
            if (deps.length > 0) {
                parts.push(`Key Dependencies: ${deps.slice(0, 15).join(", ")}`);
            }
        }
        // Requirements.txt summary
        if (info.files.requirementsTxt) {
            const deps = info.files.requirementsTxt
                .split("\n")
                .filter((l) => l.trim() && !l.startsWith("#"))
                .slice(0, 15);
            parts.push(`Python Dependencies: ${deps.join(", ")}`);
        }
        // Project metadata
        parts.push(`Framework: ${info.framework}`);
        parts.push(`Language: ${info.language}`);
        parts.push(`Application Type: ${info.type}`);
        parts.push(`Port: ${info.port}`);
        parts.push(`Has Tests: ${info.hasTests}`);
        parts.push(`Environment Variables Required: ${info.envVars.join(", ") || "None detected"}`);
        // Read README if it exists
        const readme = await this.fileUtils.readFile(path.join(info.rootPath, "README.md"));
        if (readme) {
            // Only use first 2000 chars to avoid too-long prompts
            parts.push(`\nExisting README:\n${readme.substring(0, 2000)}`);
        }
        return parts.join("\n");
    }
}
exports.SdlcGenerator = SdlcGenerator;
//# sourceMappingURL=SdlcGenerator.js.map