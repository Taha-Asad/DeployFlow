// ─────────────────────────────────────────────────────────────────────────────
// src/utils/ShellUtils.ts
// Run shell commands (like npm build, docker build, etc.) from TypeScript
// ─────────────────────────────────────────────────────────────────────────────

// `child_process` is a built-in Node.js module for running system commands
// `spawn` runs a command and lets us watch its output in real time
// `exec` runs a command and gives us ALL output when it finishes
import { spawn, exec } from "child_process";

// `promisify` converts "callback-style" functions to "async/await" style
// Node.js old functions use callbacks (confusing), we convert to modern style
import { promisify } from "util";

import { Logger } from "./Logger";

// Convert `exec` to work with async/await
// Now we can write: `const result = await execAsync('ls -la')`
// Instead of the old confusing: `exec('ls -la', (err, stdout, stderr) => { ... })`
const execAsync = promisify(exec);

// What `runCommand` returns when done
export interface CommandResult {
  stdout: string; // Normal output from the command
  stderr: string; // Error output from the command
  exitCode: number; // 0 = success, anything else = failure
  success: boolean; // true if exitCode is 0
}

// Options you can pass when running a command
export interface CommandOptions {
  cwd?: string; // Which folder to run the command in
  env?: Record<string, string>; // Extra environment variables
  timeout?: number; // How long to wait (milliseconds) before giving up
  maxBuffer?: number; // Max bytes to accumulate from stdout/stderr (default 10MB)
  onOutput?: (line: string) => void; // Callback for each line of output
}

export class ShellUtils {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  private bashEnv(extra?: Record<string, string>): Record<string, string> {
    return {
      ...process.env,
      BASH_ENV: `${process.env.HOME}/.bashrc`,
      ...(extra || {}),
    };
  }

  // ── Run a command and wait for it to finish ──────────────────────────
  // Returns ALL the output when done
  // Good for: `docker build`, `npm install`, `scp file server:`
  public async run(
    command: string,
    options: CommandOptions = {},
  ): Promise<CommandResult> {
    this.logger.debug(`Running command: ${command}`, { cwd: options.cwd });

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: options.cwd,
        shell: "/bin/bash",
        env: this.bashEnv(options.env),
        timeout: options.timeout || 300000,
        maxBuffer: options.maxBuffer || 1024 * 1024 * 10,
      });

      this.logger.debug(`Command succeeded: ${command}`);

      return {
        stdout: stdout.trim(), // Remove leading/trailing whitespace
        stderr: stderr.trim(),
        exitCode: 0,
        success: true,
      };
    } catch (error: unknown) {
      // When a command fails, Node.js throws an error
      // The error object has `stdout`, `stderr`, and `code` (exit code)
      const err = error as {
        stdout?: string;
        stderr?: string;
        code?: number;
        message?: string;
      };

      const stdout = err.stdout?.trim() || "";
      const stderr = err.stderr?.trim() || err.message || "Unknown error";
      const exitCode = err.code || 1;

      this.logger.debug(`Command failed (exit ${exitCode}): ${command}`);

      return {
        stdout,
        stderr,
        exitCode,
        success: false,
      };
    }
  }

  // ── Run a command AND stream its output in real-time ─────────────────
  // Good for long-running commands where you want to see progress
  // For example: `npm install` shows each package being installed
  public async runStreaming(
    command: string,
    args: string[], // Command arguments as an array ['--no-cache', '-t', 'myapp']
    options: CommandOptions = {},
  ): Promise<CommandResult> {
    this.logger.debug(
      `Running streaming command: ${command} ${args.join(" ")}`,
    );

    const maxBuffer = options.maxBuffer || 1024 * 1024 * 10; // default 10MB

    // `spawn` starts a process and gives us streams to read from
    // We separate the command from its arguments for safety
    // (prevents shell injection attacks)
    const process_child = spawn(command, args, {
      cwd: options.cwd,
      env: this.bashEnv(options.env),
      shell: "/bin/bash",
    });

    // Collect all output
    let stdout = "";
    let stderr = "";
    let killed = false;

    const killProcess = (): void => {
      if (killed) return;
      killed = true;
      process_child.kill("SIGTERM");
      setTimeout(() => {
        try { process_child.kill("SIGKILL"); } catch { /* ok */ }
      }, 2000);
    };

    // `stdout` is a "stream" — data comes out piece by piece
    // We listen for 'data' events, convert to string, and collect
    process_child.stdout?.on("data", (data: Buffer) => {
      if (killed) return;
      // Buffer is raw bytes — `.toString()` converts to text
      const text = data.toString();
      stdout += text;

      if (stdout.length > maxBuffer || stderr.length > maxBuffer) {
        this.logger.warn(
          `Output exceeded ${maxBuffer} bytes, killing process: ${command}`,
        );
        killProcess();
        return;
      }

      // Split into lines and report each one
      // This lets the caller show progress line by line
      const lines = text.split("\n").filter((l) => l.trim());
      lines.forEach((line) => {
        this.logger.debug(`  > ${line}`);
        options.onOutput?.(line); // Call the callback if provided
      });
    });

    // Same but for error output (stderr)
    process_child.stderr?.on("data", (data: Buffer) => {
      if (killed) return;
      const text = data.toString();
      stderr += text;

      if (stdout.length > maxBuffer || stderr.length > maxBuffer) {
        this.logger.warn(
          `Output exceeded ${maxBuffer} bytes, killing process: ${command}`,
        );
        killProcess();
        return;
      }

      const lines = text.split("\n").filter((l) => l.trim());
      lines.forEach((line) => {
        this.logger.debug(`  ! ${line}`);
        options.onOutput?.(line);
      });
    });

    // Wait for the process to finish
    // We wrap it in a Promise so we can use async/await
    const exitCode = await new Promise<number>((resolve) => {
      // 'close' event fires when the process is done
      // `code` is the exit code (0 = success)
      process_child.on("close", (code: number | null) => {
        resolve(code || 0);
      });

      // Handle if the process crashes with an error
      process_child.on("error", () => {
        resolve(1); // Treat as failure
      });
    });

    return {
      stdout: stdout.trim(),
      stderr: killed
        ? `Command output exceeded ${maxBuffer} bytes and was terminated.\n${stderr.trim()}`
        : stderr.trim(),
      exitCode: killed ? 1 : exitCode,
      success: !killed && exitCode === 0,
    };
  }

  // ── Check if a command exists on the system ──────────────────────────
  // Example: check if Docker is installed before trying to use it
  public async commandExists(command: string): Promise<boolean> {
    // `which` on Linux/Mac tells you if a command exists
    // `where` does the same on Windows
    // We check which OS we're on first
    const checkCommand =
      process.platform === "win32" ? `where ${command}` : `which ${command}`;

    const result = await this.run(checkCommand);
    return result.success;
  }
}
