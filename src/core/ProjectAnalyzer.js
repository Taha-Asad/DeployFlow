"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// src/core/ProjectAnalyzer.ts
// Analyzes a project folder and extracts all information needed for deployment
// This is the most important analysis step — everything else depends on it
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
exports.ProjectAnalyzer = void 0;
const path = __importStar(require("path"));
const FileUtils_1 = require("../utils/FileUtils");
const Logger_1 = require("../utils/Logger");
class ProjectAnalyzer {
    fileUtils;
    logger;
    constructor() {
        this.fileUtils = new FileUtils_1.FileUtils();
        this.logger = Logger_1.Logger.getInstance();
    }
    // ── MAIN METHOD: Analyze a project folder ────────────────────────────
    // This is what gets called from WorkflowEngine
    // It returns a complete ProjectInfo object
    async analyze(projectPath) {
        this.logger.info(`🔍 Analyzing project at: ${projectPath}`);
        // Start with default values — we'll fill them in below
        const info = {
            rootPath: projectPath,
            type: "unknown",
            language: "unknown",
            framework: "unknown",
            packageManager: "unknown",
            buildCommand: "",
            startCommand: "",
            port: 3000, // Default port
            name: path.basename(projectPath), // Use folder name as default
            version: "1.0.0",
            runtimeVersion: "",
            isMonorepo: false,
            hasDockerfile: false,
            hasDockerCompose: false,
            entryPoint: "",
            files: {},
            envVars: [],
            hasTests: false,
            testCommand: "",
            warnings: [],
        };
        // Run all detection steps
        // Each step fills in parts of `info`
        await this.detectLanguageAndRuntime(projectPath, info);
        await this.detectFrameworkAndCommands(projectPath, info);
        await this.detectPackageManager(projectPath, info);
        await this.detectPort(projectPath, info);
        await this.detectMonorepo(projectPath, info);
        await this.detectExistingInfrastructure(projectPath, info);
        await this.detectEnvironmentVariables(projectPath, info);
        await this.detectTests(projectPath, info);
        this.logger.info(`✅ Project analysis complete: ${info.framework} (${info.language})`);
        this.logger.debug("Project info:", info);
        return info;
    }
    // ── STEP 1: Detect Language & Runtime ────────────────────────────────
    async detectLanguageAndRuntime(projectPath, info) {
        // Check for Node.js project (has package.json)
        const packageJsonPath = path.join(projectPath, "package.json");
        const packageJson = await this.fileUtils.readJson(packageJsonPath);
        if (packageJson) {
            info.files.packageJson = packageJson;
            info.name = packageJson.name || info.name;
            info.version = packageJson.version || info.version;
            // Check if it's TypeScript
            const devDeps = packageJson.devDependencies || {};
            const deps = packageJson.dependencies || {};
            if (devDeps.typescript || deps.typescript) {
                info.language = "typescript";
            }
            else {
                info.language = "javascript";
            }
            // Get the Node.js version from .nvmrc or .node-version or engines field
            const nvmrc = await this.fileUtils.readFile(path.join(projectPath, ".nvmrc"));
            const nodeVersion = nvmrc ||
                packageJson.engines?.node?.replace(/[^0-9.]/g, "") ||
                "18";
            // Extract just the major version number: '18.12.0' → '18'
            info.runtimeVersion = nodeVersion.split(".")[0];
        }
        // Check for Python project
        const requirementsTxt = await this.fileUtils.readFile(path.join(projectPath, "requirements.txt"));
        const pyprojectToml = await this.fileUtils.readFile(path.join(projectPath, "pyproject.toml"));
        const setupPy = await this.fileUtils.exists(path.join(projectPath, "setup.py"));
        if (requirementsTxt || pyprojectToml || setupPy) {
            info.language = "python";
            info.files.requirementsTxt = requirementsTxt || undefined;
            info.files.pyprojectToml = pyprojectToml || undefined;
            // Try to detect Python version
            const pythonVersionFile = await this.fileUtils.readFile(path.join(projectPath, ".python-version"));
            info.runtimeVersion = pythonVersionFile?.trim() || "3.11";
        }
        // Check for Go project (has go.mod)
        const goMod = await this.fileUtils.exists(path.join(projectPath, "go.mod"));
        if (goMod) {
            info.language = "go";
            info.files.goMod = true;
            info.runtimeVersion = "1.21"; // Default Go version
        }
        // Check for Java with Maven (pom.xml)
        const pomXml = await this.fileUtils.exists(path.join(projectPath, "pom.xml"));
        if (pomXml) {
            info.language = "java";
            info.files.pomXml = true;
            info.runtimeVersion = "17"; // Default Java LTS version
        }
        // Check for Java with Gradle (build.gradle or build.gradle.kts)
        const buildGradle = (await this.fileUtils.exists(path.join(projectPath, "build.gradle"))) ||
            (await this.fileUtils.exists(path.join(projectPath, "build.gradle.kts")));
        if (buildGradle) {
            info.language = "java";
            info.files.buildGradle = true;
            info.runtimeVersion = "17";
        }
        // Check for Rust (Cargo.toml)
        const cargoToml = await this.fileUtils.exists(path.join(projectPath, "Cargo.toml"));
        if (cargoToml) {
            info.language = "rust";
            info.files.cargoToml = true;
            info.runtimeVersion = "stable";
        }
    }
    // ── STEP 2: Detect Framework & Commands ──────────────────────────────
    async detectFrameworkAndCommands(projectPath, info) {
        const pkg = info.files.packageJson;
        if (pkg) {
            const deps = pkg.dependencies || {};
            const devDeps = pkg.devDependencies || {};
            const scripts = pkg.scripts || {};
            // All dependencies merged together for easy checking
            const allDeps = { ...deps, ...devDeps };
            // ── JavaScript/TypeScript Frameworks ──────────────────────────
            // Check for Next.js — it's both a frontend AND backend framework
            if (allDeps.next) {
                info.framework = "nextjs";
                info.type = "fullstack";
                info.buildCommand = "npm run build";
                info.startCommand = "npm start";
                info.port = 3000;
                info.entryPoint = "pages/index.tsx";
            }
            // Check for Nuxt.js (Vue's fullstack framework)
            else if (allDeps.nuxt || allDeps["nuxt3"] || allDeps["nuxt/kit"]) {
                info.framework = "nuxtjs";
                info.type = "fullstack";
                info.buildCommand = "npm run build";
                info.startCommand = "node .output/server/index.mjs";
                info.port = 3000;
            }
            // Check for React (without Next.js)
            else if (allDeps.react && !allDeps.next) {
                // Check if it uses Create React App or Vite
                if (allDeps["react-scripts"]) {
                    info.framework = "react-cra";
                    info.buildCommand = "npm run build";
                }
                else if (allDeps.vite || devDeps.vite) {
                    info.framework = "react-vite";
                    info.buildCommand = "npm run build";
                }
                else {
                    info.framework = "react";
                    info.buildCommand = "npm run build";
                }
                info.type = "frontend";
                info.startCommand = "npx serve -s build -l 3000";
                info.port = 3000;
                info.entryPoint = "src/index.tsx";
            }
            // Check for Vue.js (without Nuxt)
            else if (allDeps.vue && !allDeps.nuxt) {
                info.framework = allDeps.vite ? "vue-vite" : "vue-cli";
                info.type = "frontend";
                info.buildCommand = "npm run build";
                info.startCommand = "npx serve -s dist -l 3000";
                info.port = 3000;
                info.entryPoint = "src/main.ts";
            }
            // Check for Angular
            else if (allDeps["@angular/core"]) {
                info.framework = "angular";
                info.type = "frontend";
                info.buildCommand = "npm run build -- --configuration production";
                info.startCommand = "npx serve -s dist -l 3000";
                info.port = 3000;
                info.entryPoint = "src/main.ts";
            }
            // Check for Svelte/SvelteKit
            else if (allDeps["@sveltejs/kit"]) {
                info.framework = "sveltekit";
                info.type = "fullstack";
                info.buildCommand = "npm run build";
                info.startCommand = "node build";
                info.port = 3000;
            }
            else if (allDeps.svelte) {
                info.framework = "svelte";
                info.type = "frontend";
                info.buildCommand = "npm run build";
                info.port = 3000;
            }
            // Check for NestJS (Node.js backend)
            else if (allDeps["@nestjs/core"]) {
                info.framework = "nestjs";
                info.type = "backend";
                info.buildCommand = "npm run build";
                info.startCommand = "node dist/main";
                info.port = 3000;
                info.entryPoint = "src/main.ts";
            }
            // Check for Express (Node.js backend)
            else if (allDeps.express) {
                info.framework = "express";
                info.type = "backend";
                // Express usually doesn't have a build step
                info.buildCommand = scripts.build ? "npm run build" : "";
                info.startCommand = scripts.start ? "npm start" : "node index.js";
                info.port = 3000;
                info.entryPoint = "index.js";
            }
            // Check for Vite (without React/Vue — could be vanilla JS)
            else if (allDeps.vite || devDeps.vite) {
                info.framework = "vite";
                info.type = "frontend";
                info.buildCommand = "npm run build";
                info.port = 3000;
            }
            // Use existing scripts if no framework detected
            if (scripts.build) {
                info.buildCommand = info.buildCommand || "npm run build";
            }
            if (scripts.start) {
                info.startCommand = info.startCommand || "npm start";
            }
        }
        // ── Python Frameworks ─────────────────────────────────────────────
        if (info.language === "python") {
            const requirements = info.files.requirementsTxt || "";
            const pyproject = info.files.pyprojectToml || "";
            const allContent = requirements + pyproject;
            if (allContent.includes("django")) {
                info.framework = "django";
                info.type = "fullstack";
                // Django uses gunicorn in production
                info.buildCommand = "pip install -r requirements.txt";
                info.startCommand =
                    "gunicorn myproject.wsgi:application --bind 0.0.0.0:8000";
                info.port = 8000;
                info.entryPoint = "manage.py";
            }
            else if (allContent.includes("fastapi")) {
                info.framework = "fastapi";
                info.type = "backend";
                info.buildCommand = "pip install -r requirements.txt";
                info.startCommand = "uvicorn main:app --host 0.0.0.0 --port 8000";
                info.port = 8000;
                info.entryPoint = "main.py";
            }
            else if (allContent.includes("flask")) {
                info.framework = "flask";
                info.type = "backend";
                info.buildCommand = "pip install -r requirements.txt";
                info.startCommand = "gunicorn app:app --bind 0.0.0.0:5000";
                info.port = 5000;
                info.entryPoint = "app.py";
            }
            else {
                info.framework = "python-generic";
                info.type = "backend";
                info.buildCommand = "pip install -r requirements.txt";
                info.startCommand = "python main.py";
                info.port = 8000;
            }
        }
        // ── Java Frameworks ───────────────────────────────────────────────
        if (info.language === "java") {
            // Check for Spring Boot by looking inside pom.xml or build.gradle
            const pomContent = info.files.pomXml
                ? (await this.fileUtils.readFile(path.join(info.rootPath, "pom.xml"))) || ""
                : "";
            if (pomContent.includes("spring-boot") ||
                pomContent.includes("springframework")) {
                info.framework = "spring-boot";
                info.type = "backend";
                info.buildCommand = "./mvnw package -DskipTests";
                info.startCommand = "java -jar target/*.jar";
                info.port = 8080;
                info.entryPoint = "src/main/java";
            }
            else if (info.files.buildGradle) {
                info.framework = "gradle-app";
                info.type = "backend";
                info.buildCommand = "./gradlew build";
                info.startCommand = "java -jar build/libs/*.jar";
                info.port = 8080;
            }
        }
        // ── Go ────────────────────────────────────────────────────────────
        if (info.language === "go") {
            // Check for popular Go frameworks
            const goModContent = (await this.fileUtils.readFile(path.join(info.rootPath, "go.mod"))) ||
                "";
            if (goModContent.includes("gin-gonic/gin")) {
                info.framework = "gin";
            }
            else if (goModContent.includes("labstack/echo")) {
                info.framework = "echo";
            }
            else if (goModContent.includes("gofiber/fiber")) {
                info.framework = "fiber";
            }
            else {
                info.framework = "go-stdlib";
            }
            info.type = "backend";
            info.buildCommand = "go build -o app .";
            info.startCommand = "./app";
            info.port = 8080;
            info.entryPoint = "main.go";
        }
        // ── Rust ──────────────────────────────────────────────────────────
        if (info.language === "rust") {
            info.framework = "rust";
            info.type = "backend";
            info.buildCommand = "cargo build --release";
            info.startCommand = "./target/release/app";
            info.port = 8080;
            info.entryPoint = "src/main.rs";
        }
    }
    // ── STEP 3: Detect Package Manager ───────────────────────────────────
    async detectPackageManager(projectPath, info) {
        // The lock file tells us which package manager was used
        if (await this.fileUtils.exists(path.join(projectPath, "bun.lockb"))) {
            info.packageManager = "bun";
        }
        else if (await this.fileUtils.exists(path.join(projectPath, "pnpm-lock.yaml"))) {
            info.packageManager = "pnpm";
        }
        else if (await this.fileUtils.exists(path.join(projectPath, "yarn.lock"))) {
            info.packageManager = "yarn";
        }
        else if (await this.fileUtils.exists(path.join(projectPath, "package-lock.json"))) {
            info.packageManager = "npm";
        }
        else if (await this.fileUtils.exists(path.join(projectPath, "poetry.lock"))) {
            info.packageManager = "poetry";
        }
        else if (await this.fileUtils.exists(path.join(projectPath, "Pipfile.lock"))) {
            info.packageManager = "pipenv";
        }
        else if (info.language === "python") {
            info.packageManager = "pip";
        }
        else if (info.language === "go") {
            info.packageManager = "gomod";
        }
        else if (info.language === "rust") {
            info.packageManager = "cargo";
        }
        else if (info.files.pomXml) {
            info.packageManager = "maven";
        }
        else if (info.files.buildGradle) {
            info.packageManager = "gradle";
        }
        else if (info.files.packageJson) {
            info.packageManager = "npm"; // Default for Node.js
        }
        // Update build command to use detected package manager
        // If package manager is pnpm, use 'pnpm run build' instead of 'npm run build'
        if (info.packageManager === "pnpm") {
            info.buildCommand = info.buildCommand.replace(/^npm/, "pnpm");
            info.startCommand = info.startCommand.replace(/^npm/, "pnpm");
        }
        else if (info.packageManager === "yarn") {
            info.buildCommand = info.buildCommand.replace(/^npm run/, "yarn");
            info.startCommand = info.startCommand.replace(/^npm /, "yarn ");
        }
        else if (info.packageManager === "bun") {
            info.buildCommand = info.buildCommand.replace(/^npm/, "bun");
            info.startCommand = info.startCommand.replace(/^npm/, "bun");
        }
    }
    // ── STEP 4: Detect Port ───────────────────────────────────────────────
    async detectPort(projectPath, info) {
        // Look for PORT in common config files
        const envExample = (await this.fileUtils.readFile(path.join(projectPath, ".env.example"))) ||
            (await this.fileUtils.readFile(path.join(projectPath, ".env.sample"))) ||
            (await this.fileUtils.readFile(path.join(projectPath, ".env")));
        if (envExample) {
            // Look for PORT=3000 or PORT = 8080 in the env file
            const portMatch = envExample.match(/PORT\s*=\s*(\d+)/);
            if (portMatch) {
                info.port = parseInt(portMatch[1]);
                return;
            }
        }
        // Look for common port patterns in source files
        // We check the main entry file
        if (info.entryPoint) {
            const entryContent = await this.fileUtils.readFile(path.join(projectPath, info.entryPoint));
            if (entryContent) {
                // Look for patterns like: .listen(3000) or port = 3000 or PORT || 3000
                const portMatch = entryContent.match(/\.listen\((\d{4,5})\)/) ||
                    entryContent.match(/port[:\s=]+(\d{4,5})/i) ||
                    entryContent.match(/PORT[^=]*\|\|[^0-9]*(\d{4,5})/);
                if (portMatch) {
                    info.port = parseInt(portMatch[1]);
                }
            }
        }
        // If still no port, the defaults set in framework detection are used
    }
    // ── STEP 5: Detect Monorepo ───────────────────────────────────────────
    async detectMonorepo(projectPath, info) {
        // Nx monorepo — has nx.json
        if (await this.fileUtils.exists(path.join(projectPath, "nx.json"))) {
            info.isMonorepo = true;
            info.monorepoTool = "nx";
        }
        // Turborepo — has turbo.json
        else if (await this.fileUtils.exists(path.join(projectPath, "turbo.json"))) {
            info.isMonorepo = true;
            info.monorepoTool = "turborepo";
        }
        // Lerna — has lerna.json
        else if (await this.fileUtils.exists(path.join(projectPath, "lerna.json"))) {
            info.isMonorepo = true;
            info.monorepoTool = "lerna";
        }
        // Also check for `workspaces` in package.json (npm/yarn workspaces)
        const pkg = info.files.packageJson;
        if (pkg?.workspaces) {
            info.isMonorepo = true;
            // workspaces can be an array or an object with a packages key
            if (Array.isArray(pkg.workspaces)) {
                info.workspaces = pkg.workspaces;
            }
            else if (typeof pkg.workspaces === "object") {
                const ws = pkg.workspaces;
                info.workspaces = ws.packages || [];
            }
        }
        if (info.isMonorepo) {
            info.warnings.push(`Monorepo detected (${info.monorepoTool}). ` +
                "You may need to adjust the build command to target a specific app.");
        }
    }
    // ── STEP 6: Detect Existing Infrastructure ────────────────────────────
    async detectExistingInfrastructure(projectPath, info) {
        info.hasDockerfile = await this.fileUtils.exists(path.join(projectPath, "Dockerfile"));
        info.hasDockerCompose =
            (await this.fileUtils.exists(path.join(projectPath, "docker-compose.yml"))) ||
                (await this.fileUtils.exists(path.join(projectPath, "docker-compose.yaml")));
        if (info.hasDockerfile) {
            this.logger.info("Existing Dockerfile found — will use it or generate alongside it");
        }
    }
    // ── STEP 7: Detect Environment Variables ─────────────────────────────
    async detectEnvironmentVariables(projectPath, info) {
        const envExample = (await this.fileUtils.readFile(path.join(projectPath, ".env.example"))) ||
            (await this.fileUtils.readFile(path.join(projectPath, ".env.sample")));
        if (!envExample) {
            return;
        }
        // Parse each line of the .env.example file
        // Lines look like: DATABASE_URL=postgres://... or # This is a comment
        const lines = envExample.split("\n");
        for (const line of lines) {
            const trimmed = line.trim();
            // Skip empty lines and comments (lines starting with #)
            if (!trimmed || trimmed.startsWith("#")) {
                continue;
            }
            // Extract the variable name (everything before the = sign)
            const varName = trimmed.split("=")[0].trim();
            if (varName) {
                info.envVars.push(varName);
            }
        }
    }
    // ── STEP 8: Detect Tests ──────────────────────────────────────────────
    async detectTests(projectPath, info) {
        const pkg = info.files.packageJson;
        if (pkg) {
            const scripts = pkg.scripts || {};
            if (scripts.test && scripts.test !== 'echo "Error: no test specified"') {
                info.hasTests = true;
                info.testCommand = "npm test";
            }
        }
        // Python tests
        if (info.language === "python") {
            const hasPytest = (await this.fileUtils.exists(path.join(projectPath, "pytest.ini"))) ||
                (await this.fileUtils.exists(path.join(projectPath, "tests")));
            if (hasPytest) {
                info.hasTests = true;
                info.testCommand = "pytest";
            }
        }
        // Go tests — always has test support built in
        if (info.language === "go") {
            info.hasTests =
                (await this.fileUtils.exists(path.join(projectPath, "main_test.go"))) ||
                    (await this.fileUtils.getFilesRecursive(projectPath, undefined, 100)).some((f) => f.endsWith("_test.go"));
            if (info.hasTests) {
                info.testCommand = "go test ./...";
            }
        }
    }
}
exports.ProjectAnalyzer = ProjectAnalyzer;
//# sourceMappingURL=ProjectAnalyzer.js.map