// ─────────────────────────────────────────────────────────────────────────────
// src/utils/Logger.ts
// The logging system — writes messages to VS Code's Output panel
// Uses the "Singleton" pattern — only ONE Logger ever exists
// ─────────────────────────────────────────────────────────────────────────────

import * as vscode from "vscode";

// LogLevel is an "enum" — a list of named numbers
// It lets us say "only show me important messages" or "show me everything"
export enum LogLevel {
  DEBUG = 0, // Most detailed — "I entered function X"
  INFO = 1, // Normal info — "Build started"
  WARN = 2, // Something might be wrong — "API key not set"
  ERROR = 3, // Something broke — "Build failed"
}

export class Logger implements vscode.Disposable {
  // `private static instance` means there is only one Logger in the whole program
  // `static` means it belongs to the CLASS, not any specific Logger object
  // `| undefined` means it starts as nothing until we create it
  private static instance: Logger | undefined;

  // The VS Code "Output Channel" — this is the panel at the bottom of VS Code
  // where you can see log messages
  private outputChannel: vscode.OutputChannel;

  // What level of messages to show
  // If set to WARN, we skip DEBUG and INFO messages
  private currentLevel: LogLevel;

  // `private constructor` means you can't do `new Logger()` from outside
  // You MUST use `Logger.getInstance()` instead
  // This enforces the singleton pattern
  private constructor() {
    // Create a named output channel — you'll see "DeployFlow AI" in the
    // Output dropdown in VS Code
    this.outputChannel = vscode.window.createOutputChannel("DeployFlow AI");
    this.currentLevel = LogLevel.INFO;
  }

  // This is how you GET the logger from anywhere in your code:
  // `const logger = Logger.getInstance();`
  // If no Logger exists yet, it creates one. Otherwise it returns the existing one.
  // This means every file shares the SAME logger.
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  // Set the minimum log level
  // Called by ConfigManager when reading the user's setting
  public setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  // The main log function — all other functions call this
  // `level` is how important this message is
  // `message` is the text to write
  // `...args` means "any extra stuff to print" (like error objects)
  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    // If this message's level is BELOW what we want to show, skip it
    // Example: if currentLevel is WARN, skip DEBUG and INFO messages
    if (level < this.currentLevel) {
      return;
    }

    // Create a timestamp like "2024-01-15 14:32:01"
    const timestamp = new Date()
      .toISOString()
      .replace("T", " ")
      .substring(0, 19);

    // Create a label for the level
    // LogLevel.DEBUG → "DEBUG", LogLevel.ERROR → "ERROR"
    const levelLabel = LogLevel[level].padEnd(5); // padEnd makes it always 5 chars

    // Build the full message string
    let fullMessage = `[${timestamp}] [${levelLabel}] ${message}`;

    // If there are extra arguments (like an Error object), add them
    if (args.length > 0) {
      // JSON.stringify turns objects into readable text
      // But Error objects need special treatment
      const extras = args
        .map((arg) => {
          if (arg instanceof Error) {
            // For errors, show the message and the stack trace
            return `\n  Error: ${arg.message}\n  Stack: ${arg.stack}`;
          }
          // For everything else, convert to JSON
          return typeof arg === "object"
            ? JSON.stringify(arg, null, 2)
            : String(arg);
        })
        .join(" ");
      fullMessage += " " + extras;
    }

    // Write to VS Code's output channel
    this.outputChannel.appendLine(fullMessage);

    // For errors, ALSO show them in VS Code's console
    // (useful when debugging the extension itself)
    if (level === LogLevel.ERROR) {
      console.error(fullMessage);
    }
  }

  // Convenience methods — so you write `logger.info(...)` not `logger.log(LogLevel.INFO, ...)`
  public debug(message: string, ...args: unknown[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  public info(message: string, ...args: unknown[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  public warn(message: string, ...args: unknown[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  public error(message: string, ...args: unknown[]): void {
    this.log(LogLevel.ERROR, message, ...args);
  }

  // Show the output channel panel to the user
  // `preserveFocus: true` means don't steal focus from the editor
  public show(): void {
    this.outputChannel.show(true);
  }

  // `dispose` is called when VS Code cleans up the extension
  // We implement `vscode.Disposable` to tell VS Code we know how to clean up
  public dispose(): void {
    this.outputChannel.dispose();
    Logger.instance = undefined;
  }
}
