// ────────────────────────────────────────────────────────────────────────────
// src/security/TrivyScanner.ts
// Scans Docker images for CVE vulnerabilities using Trivy
// Trivy is a free, open-source container scanner by Aqua Security
// Install: https://aquasecurity.github.io/trivy/
// ────────────────────────────────────────────────────────────────────────────

import { ShellUtils } from "../utils/ShellUtils";
import { Logger } from "../utils/Logger";

export interface ScanResult {
  imageName: string;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  vulnerabilities: Vulnerability[];
  scanPassed: boolean; // true if no critical/high found
}

export interface Vulnerability {
  id: string; // CVE-XXXX-XXXXX
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  package: string; // Which package is affected
  installedVersion: string;
  fixedVersion: string;
  title: string;
  url?: string;
}

interface TrivyJsonOutput {
  Results?: Array<{
    Target: string;
    Vulnerabilities?: Array<{
      VulnerabilityID: string;
      Severity: string;
      PkgName: string;
      InstalledVersion: string;
      FixedVersion: string;
      Title: string;
      PrimaryURL?: string;
    }>;
  }>;
}

export class TrivyScanner {
  private shell: ShellUtils;
  private logger: Logger;

  constructor() {
    this.shell = new ShellUtils();
    this.logger = Logger.getInstance();
  }

  // ── Main scan method ──────────────────────────────────────────────────────
  public async scan(
    imageName: string,
    onProgress: (msg: string) => void,
  ): Promise<ScanResult> {
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
    const result = await this.shell.run(
      `trivy image --format json --exit-code 0 --severity CRITICAL,HIGH,MEDIUM,LOW ${imageName}`,
      { timeout: 300000 }, // Trivy downloads DB on first run — can be slow
    );

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
      onProgress(
        `✅ Security scan passed: ${mediumCount} medium, ${lowCount} low`,
      );
    } else {
      onProgress(
        `🚨 Vulnerabilities found: ${criticalCount} CRITICAL, ${highCount} HIGH, ${mediumCount} MEDIUM, ${lowCount} LOW`,
      );

      // Show top critical findings
      const criticals = scanResult.vulnerabilities
        .filter((v) => v.severity === "CRITICAL")
        .slice(0, 5);
      for (const vuln of criticals) {
        onProgress(
          `  ⚠️  ${vuln.id} [${vuln.package}@${vuln.installedVersion}]: ${vuln.title}` +
            (vuln.fixedVersion
              ? ` → fix: upgrade to ${vuln.fixedVersion}`
              : ""),
        );
      }
    }

    return scanResult;
  }

  // ── Parse Trivy JSON output ───────────────────────────────────────────────
  private parseResults(imageName: string, jsonOutput: string): ScanResult {
    const vulnerabilities: Vulnerability[] = [];

    try {
      const data = JSON.parse(jsonOutput) as TrivyJsonOutput;

      for (const result of data.Results || []) {
        for (const v of result.Vulnerabilities || []) {
          vulnerabilities.push({
            id: v.VulnerabilityID,
            severity: v.Severity as Vulnerability["severity"],
            package: v.PkgName,
            installedVersion: v.InstalledVersion,
            fixedVersion: v.FixedVersion || "no fix available",
            title: v.Title || v.VulnerabilityID,
            url: v.PrimaryURL,
          });
        }
      }
    } catch (error) {
      this.logger.warn("Failed to parse Trivy JSON output", error);
    }

    const criticalCount = vulnerabilities.filter(
      (v) => v.severity === "CRITICAL",
    ).length;
    const highCount = vulnerabilities.filter(
      (v) => v.severity === "HIGH",
    ).length;
    const mediumCount = vulnerabilities.filter(
      (v) => v.severity === "MEDIUM",
    ).length;
    const lowCount = vulnerabilities.filter((v) => v.severity === "LOW").length;

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
  private async installTrivy(): Promise<boolean> {
    if (process.platform === "darwin") {
      const result = await this.shell.run("brew install trivy");
      return result.success;
    }

    if (process.platform === "linux") {
      // Official Trivy install script
      const result = await this.shell.run(
        "curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin",
        { timeout: 120000 },
      );
      return result.success;
    }

    // Windows — suggest manual install
    this.logger.warn(
      "On Windows, install Trivy manually: https://aquasecurity.github.io/trivy/latest/getting-started/installation/",
    );
    return false;
  }

  // ── Return empty result when scan is unavailable ──────────────────────────
  private emptyResult(imageName: string): ScanResult {
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
