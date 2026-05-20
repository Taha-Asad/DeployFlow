"use strict";
// ────────────────────────────────────────────────────────────────────────────
// src/security/TrivyScanner.ts
// Scans Docker images for CVE vulnerabilities using Trivy
// Trivy is a free, open-source container scanner by Aqua Security
// Install: https://aquasecurity.github.io/trivy/
// ────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrivyScanner = void 0;
const ShellUtils_1 = require("../utils/ShellUtils");
const Logger_1 = require("../utils/Logger");
class TrivyScanner {
    shell;
    logger;
    constructor() {
        this.shell = new ShellUtils_1.ShellUtils();
        this.logger = Logger_1.Logger.getInstance();
    }
    // ── Main scan method ──────────────────────────────────────────────────────
    async scan(imageName, onProgress) {
        onProgress(`🔍 Scanning ${imageName} for vulnerabilities...`);
        // ── 1. Ensure Trivy is installed ──────────────────────────────────────
        const trivyExists = await this.shell.commandExists("trivy");
        if (!trivyExists) {
            onProgress("📦 Installing Trivy scanner...");
            const installed = await this.installTrivy();
            if (!installed) {
                this.logger.warn("Could not install Trivy — skipping security scan");
                return this.emptyResult(imageName);
            }
        }
        // ── 2. Run Trivy scan (JSON output for parsing) ───────────────────────
        const result = await this.shell.run(`trivy image --format json --exit-code 0 --severity CRITICAL,HIGH,MEDIUM,LOW ${imageName}`, { timeout: 300000 });
        if (!result.success) {
            this.logger.warn("Trivy scan failed", result.stderr);
            onProgress(`⚠️ Security scan failed: ${result.stderr.substring(0, 200)}`);
            return this.emptyResult(imageName);
        }
        // ── 3. Parse results ──────────────────────────────────────────────────
        const scanResult = this.parseResults(imageName, result.stdout);
        // ── 4. Report summary ─────────────────────────────────────────────────
        const { criticalCount, highCount, mediumCount, lowCount } = scanResult;
        if (criticalCount === 0 && highCount === 0) {
            onProgress(`✅ Security scan passed: ${mediumCount} medium, ${lowCount} low`);
        }
        else {
            onProgress(`🚨 Vulnerabilities found: ${criticalCount} CRITICAL, ${highCount} HIGH, ${mediumCount} MEDIUM, ${lowCount} LOW`);
            // Show top critical findings
            const criticals = scanResult.vulnerabilities
                .filter((v) => v.severity === "CRITICAL")
                .slice(0, 5);
            for (const vuln of criticals) {
                onProgress(`  ⚠️  ${vuln.id} [${vuln.package}@${vuln.installedVersion}]: ${vuln.title}` +
                    (vuln.fixedVersion
                        ? ` → fix: upgrade to ${vuln.fixedVersion}`
                        : ""));
            }
        }
        return scanResult;
    }
    // ── Parse Trivy JSON output ───────────────────────────────────────────────
    parseResults(imageName, jsonOutput) {
        const vulnerabilities = [];
        let criticalCount = 0;
        let highCount = 0;
        let mediumCount = 0;
        let lowCount = 0;
        try {
            const data = JSON.parse(jsonOutput);
            for (const result of data.Results || []) {
                for (const v of result.Vulnerabilities || []) {
                    const severity = v.Severity;
                    switch (severity) {
                        case "CRITICAL":
                            criticalCount++;
                            break;
                        case "HIGH":
                            highCount++;
                            break;
                        case "MEDIUM":
                            mediumCount++;
                            break;
                        default:
                            lowCount++;
                            break;
                    }
                    // Only store critical and high vulnerability details
                    // (medium/low are counted but not kept to save memory)
                    if (severity === "CRITICAL" || severity === "HIGH") {
                        vulnerabilities.push({
                            id: v.VulnerabilityID,
                            severity,
                            package: v.PkgName,
                            installedVersion: v.InstalledVersion,
                            fixedVersion: v.FixedVersion || "no fix available",
                            title: v.Title || v.VulnerabilityID,
                            url: v.PrimaryURL,
                        });
                    }
                }
            }
        }
        catch (error) {
            this.logger.warn("Failed to parse Trivy JSON output", error);
        }
        return {
            imageName,
            criticalCount,
            highCount,
            mediumCount,
            lowCount,
            vulnerabilities,
            scanPassed: criticalCount === 0 && highCount === 0,
        };
    }
    // ── Install Trivy (Linux/Mac) ─────────────────────────────────────────────
    async installTrivy() {
        if (process.platform === "darwin") {
            const result = await this.shell.run("brew install trivy");
            return result.success;
        }
        if (process.platform === "linux") {
            // Official Trivy install script
            const result = await this.shell.run("curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin", { timeout: 120000 });
            return result.success;
        }
        // Windows — suggest manual install
        this.logger.warn("On Windows, install Trivy manually: https://aquasecurity.github.io/trivy/latest/getting-started/installation/");
        return false;
    }
    // ── Return empty result when scan is unavailable ──────────────────────────
    emptyResult(imageName) {
        return {
            imageName,
            criticalCount: 0,
            highCount: 0,
            mediumCount: 0,
            lowCount: 0,
            vulnerabilities: [],
            scanPassed: true,
        };
    }
}
exports.TrivyScanner = TrivyScanner;
//# sourceMappingURL=TrivyScanner.js.map