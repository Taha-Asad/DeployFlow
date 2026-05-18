// ─────────────────────────────────────────────────────────────────────────────
// src/utils/NetworkUtils.ts
// HTTP utilities — health checks, API calls, URL polling
// ─────────────────────────────────────────────────────────────────────────────

import { Logger } from "./Logger";

export class NetworkUtils {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  // ── Make an HTTP GET request ──────────────────────────────────────────
  // Returns the response text or null on failure
  public async get(
    url: string,
    headers: Record<string, string> = {},
  ): Promise<string | null> {
    try {
      // `fetch` is built into modern Node.js (v18+)
      // It makes HTTP requests
      const response = await fetch(url, {
        method: "GET",
        headers,
        // AbortSignal.timeout cancels the request after 10 seconds
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return null;
      }

      return await response.text();
    } catch {
      return null;
    }
  }

  // ── Make an HTTP POST request ─────────────────────────────────────────
  // Used for calling AI APIs
  public async post(
    url: string,
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<unknown | null> {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json", // We're sending JSON
          ...headers, // Add any extra headers (like Authorization)
        },
        // JSON.stringify converts our JavaScript object to a JSON string
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000), // 60 second timeout for AI calls
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.warn(`HTTP POST failed: ${response.status} ${errorText}`);
        return null;
      }

      // Parse the response as JSON
      return await response.json();
    } catch (error) {
      this.logger.error("HTTP POST error", error);
      return null;
    }
  }

  // ── Poll a URL until it returns HTTP 200 ─────────────────────────────
  // After deploying, we check if the site is actually up
  // We try many times with a delay between attempts
  public async waitForHealthy(
    url: string,
    maxAttempts: number = 30, // Try up to 30 times
    delayMs: number = 5000, // Wait 5 seconds between tries
  ): Promise<boolean> {
    this.logger.info(`Waiting for ${url} to become healthy...`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(url, {
          method: "GET",
          signal: AbortSignal.timeout(5000), // 5 second timeout per check
        });

        if (response.ok) {
          // HTTP 200-299 — the site is up!
          this.logger.info(`✅ ${url} is healthy after ${attempt} attempt(s)`);
          return true;
        }

        this.logger.debug(
          `Attempt ${attempt}/${maxAttempts}: got ${response.status}`,
        );
      } catch {
        // Connection refused, timeout, DNS error, etc.
        this.logger.debug(
          `Attempt ${attempt}/${maxAttempts}: connection failed`,
        );
      }

      // If we have more attempts to try, wait before the next one
      if (attempt < maxAttempts) {
        await this.sleep(delayMs);
      }
    }

    this.logger.warn(
      `❌ ${url} did not become healthy after ${maxAttempts} attempts`,
    );
    return false;
  }

  // ── Check if a port is open on a host ────────────────────────────────
  // We check by trying to connect to http://host:port
  public async isPortOpen(host: string, port: number): Promise<boolean> {
    try {
      const response = await fetch(`http://${host}:${port}`, {
        signal: AbortSignal.timeout(3000),
      });
      // We don't care about the response code, just that something answered
      return true;
    } catch {
      return false;
    }
  }

  // ── Sleep for a given number of milliseconds ──────────────────────────
  // Used to add delays between retry attempts
  // `await sleep(5000)` pauses for 5 seconds
  public sleep(ms: number): Promise<void> {
    // `new Promise(resolve => setTimeout(resolve, ms))` creates a promise
    // that resolves (completes) after `ms` milliseconds
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
