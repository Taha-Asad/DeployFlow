// ─────────────────────────────────────────────────────────────────────────────
// src/utils/FileUtils.ts
// Helper functions for working with files and folders
// ─────────────────────────────────────────────────────────────────────────────

// `fs` is Node.js built-in file system module
// We use `fs/promises` which gives us async versions of all file functions
import * as fs from "fs/promises";

// `path` is built-in for working with file paths
// It handles differences between Windows (\) and Linux/Mac (/) paths
import * as path from "path";

import { Logger } from "./Logger";

export class FileUtils {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  // ── Read a file as text ───────────────────────────────────────────────
  // Returns the file contents or null if the file doesn't exist
  public async readFile(filePath: string): Promise<string | null> {
    try {
      // `fs.readFile` reads the whole file
      // 'utf-8' means treat it as text (not binary data)
      return await fs.readFile(filePath, "utf-8");
    } catch {
      // File probably doesn't exist — return null instead of crashing
      return null;
    }
  }

  // ── Read a file and parse it as JSON ─────────────────────────────────
  // Returns the parsed object or null
  public async readJson<T = unknown>(filePath: string): Promise<T | null> {
    const content = await this.readFile(filePath);
    if (!content) return null;

    try {
      return JSON.parse(content) as T;
    } catch (error) {
      this.logger.warn(`Failed to parse JSON from ${filePath}`, error);
      return null;
    }
  }

  // ── Write text to a file ─────────────────────────────────────────────
  // Creates the file if it doesn't exist
  // Creates parent folders if they don't exist
  public async writeFile(filePath: string, content: string): Promise<void> {
    // First make sure the folder exists
    // `path.dirname` gets the folder part of a path
    // Example: '/home/user/project/Dockerfile' → '/home/user/project'
    await this.ensureDir(path.dirname(filePath));

    // Write the file
    // 'utf-8' means write as text
    await fs.writeFile(filePath, content, "utf-8");
    this.logger.debug(`Wrote file: ${filePath}`);
  }

  // ── Check if a file or folder exists ─────────────────────────────────
  public async exists(filePath: string): Promise<boolean> {
    try {
      // `fs.access` throws if the path doesn't exist
      // If it doesn't throw, the path exists
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // ── Create a folder (and all parent folders) ──────────────────────────
  public async ensureDir(dirPath: string): Promise<void> {
    try {
      // `recursive: true` means create parent folders too
      // Like `mkdir -p` in Linux
      await fs.mkdir(dirPath, { recursive: true });
    } catch {
      // Folder already exists — that's fine, ignore the error
    }
  }

  // ── List all files in a folder ────────────────────────────────────────
  // Returns just the file/folder names (not full paths)
  public async listDir(dirPath: string): Promise<string[]> {
    try {
      return await fs.readdir(dirPath);
    } catch {
      return []; // Folder doesn't exist or can't be read
    }
  }

  // ── Find a file by searching up the folder tree ───────────────────────
  // Start in `startDir`, look for `filename`
  // If not found, go UP one level and look again
  // Repeat until we find it or reach the filesystem root
  // This is how tools like Node.js find package.json
  public async findUpward(
    startDir: string,
    filename: string,
  ): Promise<string | null> {
    let currentDir = startDir;

    // We loop forever but will break out when we're done
    while (true) {
      const candidate = path.join(currentDir, filename);

      if (await this.exists(candidate)) {
        return candidate; // Found it!
      }

      // Go up one level
      // `path.dirname('/home/user/project')` → `'/home/user'`
      const parentDir = path.dirname(currentDir);

      // If parent is the same as current, we're at the root
      // (e.g., '/' on Linux or 'C:\' on Windows)
      // Stop to avoid infinite loop
      if (parentDir === currentDir) {
        return null; // Not found anywhere
      }

      currentDir = parentDir;
    }
  }

  // ── Get all files recursively ─────────────────────────────────────────
  // Returns all files in a folder AND all subfolders
  // Skips common folders we don't want (node_modules, .git, etc.)
  public async getFilesRecursive(
    dirPath: string,
    ignore: string[] = [
      "node_modules",
      ".git",
      "dist",
      "build",
      "__pycache__",
      ".venv",
    ],
  ): Promise<string[]> {
    const results: string[] = [];

    // Inner function that calls itself (recursion)
    const walk = async (dir: string): Promise<void> => {
      let entries: import("fs").Dirent[];

      try {
        // `withFileTypes: true` gives us info about each entry
        // (whether it's a file or folder)
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return; // Can't read this folder, skip it
      }

      for (const entry of entries) {
        // Skip ignored folders
        if (ignore.includes(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // It's a folder — go inside it (recursion)
          await walk(fullPath);
        } else if (entry.isFile()) {
          // It's a file — add to results
          results.push(fullPath);
        }
      }
    };

    await walk(dirPath);
    return results;
  }

  // ── Copy a file from one place to another ────────────────────────────
  public async copyFile(src: string, dest: string): Promise<void> {
    await this.ensureDir(path.dirname(dest));
    await fs.copyFile(src, dest);
  }

  // ── Delete a file ─────────────────────────────────────────────────────
  public async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch {
      // File doesn't exist — that's fine
    }
  }
}
