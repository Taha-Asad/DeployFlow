"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// src/utils/ShellUtils.ts
// Run shell commands (like npm build, docker build, etc.) from TypeScript
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShellUtils = void 0;
// `child_process` is a built-in Node.js module for running system commands
// `spawn` runs a command and lets us watch its output in real time
// `exec` runs a command and gives us ALL output when it finishes
const child_process_1 = require("child_process");
// `promisify` converts "callback-style" functions to "async/await" style
// Node.js old functions use callbacks (confusing), we convert to modern style
const util_1 = require("util");
const Logger_1 = require("./Logger");
// Convert `exec` to work with async/await
// Now we can write: `const result = await execAsync('ls -la')`
// Instead of the old confusing: `exec('ls -la', (err, stdout, stderr) => { ... })`
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class ShellUtils {
    logger;
    constructor() {
        this.logger = Logger_1.Logger.getInstance();
    }
    bashEnv(extra) {
        return {
            ...process.env,
            BASH_ENV: `${process.env.HOME}/.bashrc`,
            ...(extra || {}),
        };
    }
    // ── Run a command and wait for it to finish ──────────────────────────
    // Returns ALL the output when done
    // Good for: `docker build`, `npm install`, `scp file server:`
    async run(command, options = {}) {
        this.logger.debug(`Running command: ${command}`, { cwd: options.cwd });
        try {
            const maxBuffer = options.maxBuffer || 1024 * 1024; // default 1MB
            const { stdout, stderr } = await execAsync(command, {
                cwd: options.cwd,
                shell: "/bin/bash",
                env: this.bashEnv(options.env),
                timeout: options.timeout || 300000,
                maxBuffer,
            });
            this.logger.debug(`Command succeeded: ${command}`);
            return {
                stdout: stdout.trim(), // Remove leading/trailing whitespace
                stderr: stderr.trim(),
                exitCode: 0,
                success: true,
            };
        }
        catch (error) {
            // When a command fails, Node.js throws an error
            // The error object has `stdout`, `stderr`, and `code` (exit code)
            const err = error;
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
    async runStreaming(command, args, options = {}) {
        this.logger.debug(`Running streaming command: ${command} ${args.join(" ")}`);
        const maxBuffer = options.maxBuffer || 1024 * 1024; // default 1MB
        // Shell-safe escaping: wrap each arg in single quotes, escape internal single quotes
        // This prevents bash word-splitting on args with spaces (e.g. --message "Hello World")
        const shellEscape = (s) => `'${s.replace(/'/g, "'\\''")}'`;
        const useShell = options.useShell !== false;
        const process_child = useShell
            ? (() => {
                const cmd = [command, ...args.map(shellEscape)].join(" ");
                return (0, child_process_1.spawn)("/bin/bash", ["-c", cmd], {
                    cwd: options.cwd,
                    env: this.bashEnv(options.env),
                });
            })()
            : (0, child_process_1.spawn)(command, args, {
                cwd: options.cwd,
                env: Object.assign(Object.assign({}, process.env), (options.env || {})),
            });
        // Always accumulate output to stderr (capped to maxBuffer), even when
        // onOutput is provided. Callers need stderr on failure for error reporting
        // and AI error fixing. stdout accumulation is optional and capped too.
        let stdout = "";
        let stderr = "";
        let outputCapped = false;
        let killed = false;
        let killTimer = null;
        const killProcess = () => {
            if (killed)
                return;
            killed = true;
            outputCapped = true;
            process_child.kill("SIGTERM");
            killTimer = setTimeout(() => {
                try {
                    process_child.kill("SIGKILL");
                }
                catch { /* ok */ }
            }, 2000);
        };
        const appendOutput = (buf, accumulator) => {
            if (outputCapped)
                return accumulator;
            const remaining = maxBuffer - accumulator.length;
            if (buf.length >= remaining) {
                accumulator += buf.slice(0, remaining);
                outputCapped = true;
                this.logger.warn(`Output exceeded ${maxBuffer} bytes, killing process: ${command}`);
                killProcess();
            }
            else {
                accumulator += buf;
            }
            return accumulator;
        };
        const onStdoutData = (data) => {
            if (killed)
                return;
            const text = data.toString();
            stdout = appendOutput(text, stdout);
            const lines = text.split("\n").filter((l) => l.trim());
            lines.forEach((line) => {
                this.logger.debug(`  > ${line}`);
                options.onOutput?.(line);
            });
        };
        const onStderrData = (data) => {
            if (killed)
                return;
            const text = data.toString();
            stderr = appendOutput(text, stderr);
            const lines = text.split("\n").filter((l) => l.trim());
            lines.forEach((line) => {
                this.logger.debug(`  ! ${line}`);
                options.onOutput?.(line);
            });
        };
        process_child.stdout?.on("data", onStdoutData);
        process_child.stderr?.on("data", onStderrData);
        const exitCode = await new Promise((resolve) => {
            process_child.on("close", (code) => {
                if (killTimer)
                    clearTimeout(killTimer);
                resolve(code || 0);
            });
            process_child.on("error", () => {
                if (killTimer)
                    clearTimeout(killTimer);
                resolve(1);
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
    async commandExists(command) {
        // `which` on Linux/Mac tells you if a command exists
        // `where` does the same on Windows
        // We check which OS we're on first
        const checkCommand = process.platform === "win32" ? `where ${command}` : `which ${command}`;
        const result = await this.run(checkCommand);
        return result.success;
    }
}
exports.ShellUtils = ShellUtils;
//# sourceMappingURL=ShellUtils.js.map