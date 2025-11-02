#!/usr/bin/env -S deno run --allow-all

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  bgBlue as _bgBlue,
  bgCyan as _bgCyan,
  bgGreen,
  bgRed,
  bgYellow,
  blue,
  bold,
  brightGreen,
  brightRed,
  brightYellow,
  cyan,
  dim,
  green,
  magenta,
  red,
  rgb24,
  white,
  yellow,
} from "@std/fmt/colors";
import { parseArgs } from "@std/cli/parse-args";
import { Spinner } from "@std/cli/spinner";
import { ProgressBar } from "@std/cli/progress-bar";
import { promptSecret } from "@std/cli/prompt-secret";
import { unicodeWidth } from "@std/cli/unicode-width";
import { extname, isAbsolute, join, resolve } from "@std/path";
import { encodeBase64 } from "@std/encoding/base64";
import * as log from "@std/log";
import { TextLineStream } from "@std/streams/text-line-stream";
import { copy, ensureDir, exists } from "@std/fs";
import { load } from "@std/dotenv";
import { retry } from "@std/async/retry";
import { pooledMap } from "@std/async/pool";
import { parse as parseYaml, stringify as stringifyYaml } from "@std/yaml";
import { parse as parseToml, stringify as stringifyToml } from "@std/toml";

/**
 * Interactive Claude CLI - A REPL for Claude Code Agent SDK
 * Using Streaming Input Mode for advanced features with Deno std library UI
 */

// Initialize structured logging
await log.setup({
  handlers: {
    console: new log.ConsoleHandler("DEBUG", {
      formatter: (record) => {
        const timestamp = new Date(record.datetime).toISOString();
        const level = record.level.toString().padEnd(7);
        return `${dim(timestamp)} ${level} ${record.msg}`;
      },
    }),
  },
  loggers: {
    default: {
      level: "INFO",
      handlers: ["console"],
    },
    debug: {
      level: "DEBUG",
      handlers: ["console"],
    },
  },
});

const logger = log.getLogger();

// ============================================================================
// Enhanced Status Badge Helpers (Claude Code-style)
// ============================================================================

/**
 * Status badge helpers for rich terminal output
 * Mirrors Claude Code's visual feedback system
 */
const StatusBadges = {
  success: (msg: string) => bgGreen(bold(white(" ✔ SUCCESS "))) + " " + msg,
  error: (msg: string) => bgRed(bold(white(" ✖ ERROR "))) + " " + msg,
  warning: (msg: string) => bgYellow(bold(white(" ⚠ WARNING "))) + " " + msg,
  info: (msg: string) => _bgBlue(bold(white(" ℹ INFO "))) + " " + msg,
  progress: (msg: string) => _bgCyan(bold(white(" ⟳ PROGRESS "))) + " " + msg,

  // Branded color badges using RGB
  custom: (
    label: string,
    msg: string,
    color: { r: number; g: number; b: number },
  ) => rgb24(bold(white(` ${label} `)), color) + " " + msg,
};

/**
 * Enhanced text formatting with unicode width support
 * Ensures proper alignment with emoji and international characters
 */
const TextFormatting = {
  /**
   * Pad text to specific width accounting for unicode
   */
  padToWidth: (text: string, targetWidth: number, padChar = " "): string => {
    const currentWidth = unicodeWidth(text);
    if (currentWidth >= targetWidth) return text;
    return text + padChar.repeat(targetWidth - currentWidth);
  },

  /**
   * Truncate text to specific width accounting for unicode
   */
  truncateToWidth: (text: string, maxWidth: number, suffix = "..."): string => {
    const currentWidth = unicodeWidth(text);
    if (currentWidth <= maxWidth) return text;

    let truncated = "";
    let width = 0;
    const suffixWidth = unicodeWidth(suffix);
    const targetWidth = maxWidth - suffixWidth;

    for (const char of text) {
      const charWidth = unicodeWidth(char);
      if (width + charWidth > targetWidth) break;
      truncated += char;
      width += charWidth;
    }

    return truncated + suffix;
  },

  /**
   * Create aligned table row with unicode support
   */
  tableRow: (columns: string[], widths: number[]): string => {
    return columns.map((col, i) => TextFormatting.padToWidth(col, widths[i]))
      .join(" │ ");
  },
};

/**
 * Async utilities with retry and concurrency control
 * Mirrors Claude Code's robust operation handling
 * @internal Reserved for future use
 */
const _AsyncUtils = {
  /**
   * Retry operation with exponential backoff
   */
  retryWithBackoff: async <T>(
    operation: () => Promise<T>,
    options: {
      maxAttempts?: number;
      minTimeout?: number;
      maxTimeout?: number;
      multiplier?: number;
      onRetry?: (error: Error, attempt: number) => void;
    } = {},
  ): Promise<T> => {
    const {
      maxAttempts = 3,
      minTimeout = 1000,
      maxTimeout = 10000,
      multiplier = 2,
      onRetry,
    } = options;

    return await retry(operation, {
      maxAttempts,
      minTimeout,
      maxTimeout,
      multiplier,
      // Add retry callback if provided
      ...(onRetry && {
        retry: (err: Error, attempt: number) => {
          onRetry(err, attempt);
          return true;
        },
      }),
    });
  },

  /**
   * Process items with concurrency limit
   */
  processWithConcurrency: async <T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    concurrency = 5,
    onProgress?: (completed: number, total: number) => void,
  ): Promise<R[]> => {
    const results: R[] = [];
    let completed = 0;
    const total = items.length;

    for await (const result of pooledMap(concurrency, items, processor)) {
      results.push(result);
      completed++;
      if (onProgress) {
        onProgress(completed, total);
      }
    }

    return results;
  },
};

/**
 * Configuration file utilities (YAML/TOML)
 * For loading user preferences and project settings
 */
const ConfigUtils = {
  /**
   * Load configuration from YAML or TOML file
   */
  async loadConfig(filePath: string): Promise<Record<string, unknown> | null> {
    try {
      const ext = extname(filePath).toLowerCase();
      const content = await Deno.readTextFile(filePath);

      if (ext === ".yaml" || ext === ".yml") {
        return parseYaml(content) as Record<string, unknown>;
      } else if (ext === ".toml") {
        return parseToml(content);
      } else {
        logger.warn(`Unsupported config file type: ${ext}`);
        return null;
      }
    } catch (error) {
      logger.error(`Failed to load config from ${filePath}: ${error}`);
      return null;
    }
  },

  /**
   * Save configuration to YAML or TOML file
   */
  async saveConfig(
    filePath: string,
    config: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      const ext = extname(filePath).toLowerCase();
      let content: string;

      if (ext === ".yaml" || ext === ".yml") {
        content = stringifyYaml(config);
      } else if (ext === ".toml") {
        content = stringifyToml(config);
      } else {
        logger.warn(`Unsupported config file type: ${ext}`);
        return false;
      }

      await Deno.writeTextFile(filePath, content);
      logger.info(`Config saved to ${filePath}`);
      return true;
    } catch (error) {
      logger.error(`Failed to save config to ${filePath}: ${error}`);
      return false;
    }
  },

  /**
   * Merge configurations with defaults
   */
  mergeWithDefaults(
    config: Record<string, unknown> | null,
    defaults: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!config) return defaults;
    return { ...defaults, ...config };
  },
};

// ============================================================================
// Enhanced message queue with improved async handling
// ============================================================================

class MessageQueue {
  private queue: Array<SDKUserMessage> = [];
  private resolvers: Array<(value: SDKUserMessage | null) => void> = [];
  private stopped = false;

  async *generate(): AsyncGenerator<SDKUserMessage> {
    logger.debug("Starting message queue generator");
    while (!this.stopped) {
      const message = await this.dequeue();
      if (message === null) {
        logger.debug("Message queue stopped, terminating generator");
        break;
      }
      logger.debug(`Yielding message: ${message.type}`);
      yield message;
    }
  }

  enqueue(message: SDKUserMessage) {
    logger.debug(`Enqueueing message: ${message.type}`);
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve(message);
    } else {
      this.queue.push(message);
    }
    logger.debug(
      `Queue length: ${this.queue.length}, Pending resolvers: ${this.resolvers.length}`,
    );
  }

  private async dequeue(): Promise<SDKUserMessage | null> {
    if (this.queue.length > 0) {
      const message = this.queue.shift()!;
      logger.debug(`Dequeued message from queue: ${message.type}`);
      return message;
    }
    if (this.stopped) {
      return null;
    }

    // Use standard Promise for async message waiting
    const promise = new Promise<SDKUserMessage | null>((resolve) => {
      this.resolvers.push(resolve);
    });
    logger.debug("Waiting for next message...");
    return await promise;
  }

  stop() {
    logger.info("Stopping message queue");
    this.stopped = true;
    // Resolve all pending promises with null
    while (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve(null);
    }
  }
}

// Enhanced Command History with Search Capability (Claude Code-style)
class CommandHistory {
  private history: string[] = [];
  private maxHistory = 1000;
  private historyFile: string;

  constructor(sessionId: string) {
    this.historyFile = join(".claude-cli", "history", `${sessionId}.json`);
    this.loadHistory();
  }

  add(command: string) {
    // Don't add empty commands or duplicates
    if (!command.trim() || this.history[this.history.length - 1] === command) {
      return;
    }

    this.history.push(command);

    // Keep history within limit
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }

    this.saveHistory();
    logger.debug(`Added command to history: ${command}`);
  }

  search(query: string, limit = 10): string[] {
    if (!query.trim()) return [];

    const matches = this.history
      .filter((cmd) => cmd.toLowerCase().includes(query.toLowerCase()))
      .reverse() // Most recent first
      .slice(0, limit);

    logger.debug(
      `History search for '${query}': found ${matches.length} matches`,
    );
    return matches;
  }

  getRecent(count = 10): string[] {
    return this.history.slice(-count).reverse();
  }

  async searchInteractive(): Promise<string | null> {
    console.log(dim("\nCommand History Search (Ctrl+C to cancel):"));
    try {
      const query = await promptSecret("Search: ");
      if (!query) return null;

      const matches = this.search(query, 10);
      if (matches.length === 0) {
        console.log(dim("No matches found."));
        return null;
      }

      console.log(dim("\nFound matches:"));
      matches.forEach((match, index) => {
        console.log(`  ${cyan((index + 1).toString())}: ${dim(match)}`);
      });

      const selection = await promptSecret(
        "Select number (or press Enter to cancel): ",
      );
      if (!selection) return null;
      const selectedIndex = parseInt(selection) - 1;

      if (selectedIndex >= 0 && selectedIndex < matches.length) {
        return matches[selectedIndex];
      }
    } catch (_error) {
      // User cancelled with Ctrl+C
      console.log(dim("\nSearch cancelled."));
    }

    return null;
  }

  private async loadHistory() {
    try {
      await ensureDir(join(".claude-cli", "history"));
      const data = await Deno.readTextFile(this.historyFile);
      this.history = JSON.parse(data);
      logger.debug(`Loaded ${this.history.length} commands from history`);
    } catch (error) {
      logger.debug(`No existing history file: ${error}`);
      this.history = [];
    }
  }

  private async saveHistory() {
    try {
      await ensureDir(join(".claude-cli", "history"));
      await Deno.writeTextFile(
        this.historyFile,
        JSON.stringify(this.history, null, 2),
      );
    } catch (error) {
      logger.error(`Failed to save history: ${error}`);
    }
  }
}

// cspell:ignore Checkpointing
// Checkpointing System for Session State Management (Claude Code-style)
class CheckpointManager {
  private checkpointDir: string;
  private sessionId: string;
  private maxCheckpoints = 10;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.checkpointDir = join(".claude-cli", "checkpoints", sessionId);
  }

  async createCheckpoint(description: string): Promise<string> {
    try {
      await ensureDir(this.checkpointDir);

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const checkpointId = `${timestamp}_${description.replace(/\s+/g, "_")}`;
      const checkpointPath = join(this.checkpointDir, checkpointId);

      // Create checkpoint metadata
      const metadata = {
        id: checkpointId,
        description,
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
      };

      await ensureDir(checkpointPath);
      await Deno.writeTextFile(
        join(checkpointPath, "metadata.json"),
        JSON.stringify(metadata, null, 2),
      );

      // Save current working directory state if it exists
      if (await exists(Deno.cwd())) {
        const workspaceFiles = [];
        for await (const entry of Deno.readDir(".")) {
          if (!entry.name.startsWith(".") && entry.isFile) {
            workspaceFiles.push(entry.name);
          }
        }

        // Copy important files to checkpoint
        for (const file of workspaceFiles.slice(0, 50)) { // Limit files
          try {
            await copy(file, join(checkpointPath, file), { overwrite: true });
          } catch (error) {
            logger.debug(`Skipped file ${file}: ${error}`);
          }
        }
      }

      await this.cleanupOldCheckpoints();
      logger.info(`Created checkpoint: ${checkpointId}`);
      return checkpointId;
    } catch (error) {
      logger.error(`Failed to create checkpoint: ${error}`);
      throw error;
    }
  }

  async listCheckpoints(): Promise<
    Array<{ id: string; description: string; timestamp: string }>
  > {
    try {
      if (!await exists(this.checkpointDir)) {
        return [];
      }

      const checkpoints = [];
      for await (const entry of Deno.readDir(this.checkpointDir)) {
        if (entry.isDirectory) {
          try {
            const metadataPath = join(
              this.checkpointDir,
              entry.name,
              "metadata.json",
            );
            const metadata = JSON.parse(await Deno.readTextFile(metadataPath));
            checkpoints.push(metadata);
          } catch (error) {
            logger.debug(`Invalid checkpoint ${entry.name}: ${error}`);
          }
        }
      }

      return checkpoints.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch (error) {
      logger.error(`Failed to list checkpoints: ${error}`);
      return [];
    }
  }

  async restoreCheckpoint(checkpointId: string): Promise<boolean> {
    try {
      const checkpointPath = join(this.checkpointDir, checkpointId);
      if (!await exists(checkpointPath)) {
        logger.error(`Checkpoint ${checkpointId} not found`);
        return false;
      }

      // List files in checkpoint
      const filesToRestore = [];
      for await (const entry of Deno.readDir(checkpointPath)) {
        if (entry.isFile && entry.name !== "metadata.json") {
          filesToRestore.push(entry.name);
        }
      }

      // Restore files
      for (const file of filesToRestore) {
        await copy(join(checkpointPath, file), file, { overwrite: true });
      }

      logger.info(`Restored checkpoint: ${checkpointId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to restore checkpoint: ${error}`);
      return false;
    }
  }

  private async cleanupOldCheckpoints() {
    try {
      const checkpoints = await this.listCheckpoints();
      if (checkpoints.length > this.maxCheckpoints) {
        const toDelete = checkpoints.slice(this.maxCheckpoints);
        for (const checkpoint of toDelete) {
          const checkpointPath = join(this.checkpointDir, checkpoint.id);
          await Deno.remove(checkpointPath, { recursive: true });
          logger.debug(`Cleaned up old checkpoint: ${checkpoint.id}`);
        }
      }
    } catch (error) {
      logger.debug(`Checkpoint cleanup failed: ${error}`);
    }
  }
}

// Enhanced Progress Bar Manager (Claude Code-style)
// Currently unused but kept for potential future file operations
class _ProgressManager {
  private activeBars = new Map<string, ProgressBar>();
  private taskQueue: Array<{ id: string; message: string; total?: number }> =
    [];

  startProgress(id: string, _message: string, max = 100): ProgressBar {
    // Stop any existing progress bar with same ID
    this.stopProgress(id);

    const progressBar = new ProgressBar({
      max,
    });

    this.activeBars.set(id, progressBar);
    // ProgressBar renders automatically
    logger.debug(`Started progress bar: ${id}`);
    return progressBar;
  }

  updateProgress(id: string, _value: number, message?: string) {
    const _bar = this.activeBars.get(id);
    // Note: ProgressBar API doesn't have update() method
    // Progress would be updated through other means
    if (message) {
      console.log(dim(`  ${message}`));
    }
  }

  stopProgress(id: string, success = true) {
    const bar = this.activeBars.get(id);
    if (bar) {
      // ProgressBar doesn't have finish() - just remove from tracking
      this.activeBars.delete(id);

      const icon = success ? bold(green("✔")) : bold(red("✗"));
      console.log(icon + dim(` ${id} ${success ? "completed" : "failed"}`));
      logger.debug(
        `Stopped progress bar: ${id} - ${success ? "success" : "failure"}`,
      );
    }
  }

  stopAll() {
    for (const [id] of this.activeBars) {
      this.stopProgress(id, false);
    }
  }
}

// Background Task Manager (Claude Code-style)
class BackgroundTaskManager {
  private tasks = new Map<string, {
    process: Deno.ChildProcess;
    name: string;
    startTime: number;
    output: string[];
  }>();

  startTask(id: string, name: string, command: string[]): boolean {
    try {
      logger.debug(`Starting background task: ${id} - ${name}`);

      const process = new Deno.Command(command[0], {
        args: command.slice(1),
        stdout: "piped",
        stderr: "piped",
        cwd: Deno.cwd(),
      }).spawn();

      this.tasks.set(id, {
        process,
        name,
        startTime: Date.now(),
        output: [],
      });

      // Monitor output in background
      this.monitorTask(id);

      console.log(dim(`Background task started: ${bold(cyan(name))} (${id})`));
      return true;
    } catch (error) {
      logger.error(`Failed to start background task ${id}: ${error}`);
      return false;
    }
  }

  private async monitorTask(id: string) {
    const task = this.tasks.get(id);
    if (!task) return;

    try {
      // Read stdout
      const decoder = new TextDecoder();
      const reader = task.process.stdout?.getReader();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const output = decoder.decode(value);
          task.output.push(output);

          // Keep output manageable
          if (task.output.length > 1000) {
            task.output = task.output.slice(-500);
          }
        }
      }

      // Wait for process to complete
      const status = await task.process.status;
      const duration = Date.now() - task.startTime;

      if (status.success) {
        console.log(
          bold(green("✔")) +
            ` Background task completed: ${
              bold(cyan(task.name))
            } (${duration}ms)`,
        );
      } else {
        console.log(
          bold(red("✗")) +
            ` Background task failed: ${bold(cyan(task.name))} (${duration}ms)`,
        );
      }

      logger.info(`Background task ${id} finished with code ${status.code}`);
    } catch (error) {
      console.log(
        bold(red("✗")) + ` Background task error: ${bold(cyan(task.name))}`,
      );
      logger.error(`Background task ${id} error: ${error}`);
    }
  }

  listTasks(): Array<{ id: string; name: string; duration: number }> {
    const tasks = [];
    for (const [id, task] of this.tasks) {
      tasks.push({
        id,
        name: task.name,
        duration: Date.now() - task.startTime,
      });
    }
    return tasks;
  }

  getTaskOutput(id: string): string[] {
    return this.tasks.get(id)?.output || [];
  }

  stopTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;

    try {
      task.process.kill("SIGTERM");
      this.tasks.delete(id);
      console.log(dim(`Stopped background task: ${task.name}`));
      return true;
    } catch (error) {
      logger.error(`Failed to stop task ${id}: ${error}`);
      return false;
    }
  }

  stopAll() {
    for (const id of this.tasks.keys()) {
      this.stopTask(id);
    }
  }
}

// Enhanced Error Handler with Recovery Options (Claude Code-style)
class ErrorHandler {
  private errorCount = 0;
  private maxErrors = 5;
  private recentErrors: Array<
    { error: Error; timestamp: number; context: string }
  > = [];

  async handleError(
    error: Error,
    context: string = "unknown",
  ): Promise<boolean> {
    this.errorCount++;
    this.recentErrors.push({
      error,
      timestamp: Date.now(),
      context,
    });

    // Keep recent errors manageable
    if (this.recentErrors.length > 20) {
      this.recentErrors = this.recentErrors.slice(-10);
    }

    logger.error(`Error in ${context}: ${error.message}`);
    console.log(StatusBadges.error(error.message));

    // Check if we've had too many errors
    if (this.errorCount >= this.maxErrors) {
      console.log(
        StatusBadges.warning(
          "Many errors detected. Offering recovery options...",
        ),
      );
      return await this.offerRecovery(error, context);
    }

    // For fewer errors, just log and continue
    if (this.errorCount > 1) {
      console.log(
        dim(`(Error ${this.errorCount} - type /errors to see recent errors)`),
      );
    }

    return true; // Continue by default
  }

  private async offerRecovery(error: Error, context: string): Promise<boolean> {
    console.log(dim("\nRecovery Options:"));
    console.log(`  ${cyan("1")} - Continue anyway`);
    console.log(`  ${cyan("2")} - Retry last operation`);
    console.log(`  ${cyan("3")} - Reset error count`);
    console.log(`  ${cyan("4")} - Show recent errors`);
    console.log(`  ${cyan("5")} - Exit application`);

    try {
      const choice = await promptSecret("Choose option (1-5): ");

      switch (choice) {
        case "1":
          return true;
        case "2":
          console.log(dim("Retrying last operation..."));
          this.errorCount = Math.max(0, this.errorCount - 1);
          return true;
        case "3":
          this.errorCount = 0;
          console.log(dim("Error count reset."));
          return true;
        case "4":
          this.showRecentErrors();
          return await this.offerRecovery(error, context);
        case "5":
          console.log(bold(yellow("Exiting due to errors...")));
          return false;
        default:
          return true;
      }
    } catch {
      // If user cancels, continue
      return true;
    }
  }

  showRecentErrors() {
    console.log(dim("\nRecent Errors:"));
    this.recentErrors.slice(-5).forEach((errorInfo, index) => {
      const timeAgo = Math.floor((Date.now() - errorInfo.timestamp) / 1000);
      console.log(
        `  ${cyan((index + 1).toString())}: ${errorInfo.error.message} ` +
          dim(`(${timeAgo}s ago in ${errorInfo.context})`),
      );
    });
    console.log();
  }

  resetErrorCount() {
    this.errorCount = 0;
    this.recentErrors = [];
    console.log(dim("Error tracking reset."));
  }

  getErrorSummary(): { count: number; recent: number } {
    const recentCount = this.recentErrors.filter(
      (e) => Date.now() - e.timestamp < 60000, // Last minute
    ).length;

    return {
      count: this.errorCount,
      recent: recentCount,
    };
  }
}

function printWelcome() {
  console.log(bold(cyan("╔═══════════════════════════════════════════════╗")));
  console.log(bold(cyan("║   Claude Interactive CLI (Streaming Mode)    ║")));
  console.log(bold(cyan("╚═══════════════════════════════════════════════╝")));
  console.log();
  console.log(dim("Type your message and press Enter to chat with Claude."));
  console.log(
    dim(
      "Enhanced Features: History search (Ctrl+R), Checkpoints, Background tasks",
    ),
  );
  console.log(
    dim(
      "Commands: /help | /demo | /config | /history | /checkpoint | /tasks | /errors\n",
    ),
  );
}

function printHelp() {
  console.log("\n" + bold("Available Commands:"));
  console.log(`  ${cyan("/help")}   - Show this help message`);
  console.log(`  ${cyan("/exit")}   - Exit the CLI`);
  console.log(`  ${cyan("/quit")}   - Exit the CLI`);
  console.log(`  ${cyan("/clear")}  - Clear the screen`);
  console.log(
    `  ${cyan("/image <path>")} - Attach an image to your next message`,
  );
  console.log();
  console.log(bold("Enhanced Features:"));
  console.log(`  ${cyan("/history")} - Search command history interactively`);
  console.log(
    `  ${cyan("/checkpoint [description]")} - Create/manage checkpoints`,
  );
  console.log(`  ${cyan("/tasks")}   - View background tasks`);
  console.log(`  ${cyan("/errors")}  - Show recent errors`);
  console.log(`  ${cyan("/config [save]")} - View or save configuration`);
  console.log(`  ${cyan("/demo")}    - Demonstrate enhanced features`);
  console.log(
    `  ${magenta("Ctrl+R")}  - Quick history search (like Claude Code)`,
  );
  console.log();
}

async function readInput(
  prompt: string,
  reader: ReadableStreamDefaultReader<string>,
): Promise<string | null> {
  try {
    // Write prompt to stdout
    await Deno.stdout.write(new TextEncoder().encode(prompt));

    // Read from the shared reader
    const { value, done } = await reader.read();

    if (done || value === undefined) {
      logger.debug("EOF received from stdin");
      return null;
    }

    const input = value.trim();
    logger.debug(`User input received: ${input.length} characters`);
    return input;
  } catch (error) {
    const err = error as Error;
    logger.error(`Error reading input: ${err.message}`);
    return null;
  }
}

/**
 * Format tool call in Claude Code official style: ● ToolName(param: value, ...)
 * Shows only key parameters inline
 */
function formatToolCall(
  toolName: string,
  input: Record<string, unknown>,
): string {
  // Key parameters to show for each tool type
  const keyParams: Record<string, string[]> = {
    Read: ["file_path"],
    Write: ["file_path"],
    Edit: ["file_path"],
    Bash: ["command"],
    Glob: ["pattern"],
    Grep: ["pattern", "path"],
    WebFetch: ["url"],
    WebSearch: ["query"],
    Task: ["description", "subagent_type"],
    TodoWrite: [],
    NotebookEdit: ["notebook_path"],
    BashOutput: ["bash_id"],
    KillShell: ["shell_id"],
    ListMcpResources: ["server"],
    ReadMcpResource: ["server", "uri"],
    ExitPlanMode: [],
  };

  const paramsToShow = keyParams[toolName] || Object.keys(input).slice(0, 2);
  const parts: string[] = [];

  for (const key of paramsToShow) {
    if (!(key in input)) continue;
    const value = input[key];

    let displayValue: string;
    if (typeof value === "string") {
      // For paths, show basename if reasonable
      if (key === "file_path" && value.includes("/")) {
        const basename = value.split("/").pop() || value;
        displayValue = basename.length < 40 ? basename : value;
      } else if (value.length > 80) {
        displayValue = value.substring(0, 77) + "...";
      } else {
        displayValue = value;
      }
    } else {
      displayValue = JSON.stringify(value);
    }

    parts.push(displayValue);
  }

  const params = parts.join(dim(", "));
  return `${cyan("●")} ${bold(cyan(toolName))}${params ? `(${params})` : ""}`;
}

/**
 * Format tool result summary in Claude Code official style: ⎿ summary
 * Creates smart one-line summaries based on tool type and output
 */
function formatToolResultSummary(
  toolName: string,
  result: string | unknown,
  _input: Record<string, unknown>,
): string {
  const resultStr = typeof result === "string"
    ? result
    : JSON.stringify(result);

  let summary = "";

  // Tool-specific summary logic
  switch (toolName) {
    case "Read": {
      const lines = resultStr.split("\n").length;
      summary = `Read ${yellow(String(lines))} line${lines !== 1 ? "s" : ""}`;
      break;
    }

    case "Write": {
      const lines = resultStr.split("\n").length;
      const filename = _input.file_path
        ? String(_input.file_path).split("/").pop() || "file"
        : "file";
      summary = `Wrote ${yellow(String(lines))} line${
        lines !== 1 ? "s" : ""
      } to ${brightGreen(filename)}`;
      break;
    }

    case "Edit": {
      // Try to extract replacement count from result
      const match = resultStr.match(/(\d+)\s+replacement/);
      const count = match ? match[1] : "1";
      summary = `Made ${yellow(count)} replacement${count !== "1" ? "s" : ""}`;
      break;
    }

    case "Bash": {
      if (!resultStr || resultStr.trim() === "") {
        summary = "(No content)";
      } else if (resultStr.toLowerCase().includes("error:")) {
        // Show error directly if short
        summary = resultStr.length < 60
          ? resultStr.trim()
          : resultStr.split("\n")[0].substring(0, 60) + "...";
      } else if (resultStr.includes("No matches found")) {
        summary = "No matches found";
      } else if (resultStr.length < 60 && !resultStr.includes("\n")) {
        // Short single-line output - show directly
        summary = resultStr.trim();
      } else {
        const lines = resultStr.split("\n").filter((l) => l.trim()).length;
        summary = `Output: ${lines} line${lines !== 1 ? "s" : ""}`;
      }
      break;
    }

    case "Glob": {
      const matches = resultStr.split("\n").filter((l) => l.trim()).length;
      summary = `Found ${yellow(String(matches))} file${matches !== 1 ? "s" : ""}`;
      break;
    }

    case "Grep": {
      if (resultStr.includes("Found 0")) {
        summary = `Found ${yellow("0")} lines`;
      } else {
        const matchLine = resultStr.match(/Found (\d+)/);
        const count = matchLine ? matchLine[1] : "?";
        summary = `Found ${yellow(count)} line${count !== "1" ? "s" : ""}`;
      }
      break;
    }

    case "WebSearch": {
      const match = resultStr.match(/(\d+)\s+search/i);
      const searches = match ? match[1] : "1";
      summary = `Did ${yellow(searches)} search${
        searches !== "1" ? "es" : ""
      }`;
      break;
    }

    case "WebFetch": {
      // Extract size and status
      const sizeMatch = resultStr.match(/(\d+(?:\.\d+)?)\s*(KB|MB|GB)/i);
      const statusMatch = resultStr.match(/(\d{3})/);
      const size = sizeMatch ? `${sizeMatch[1]}${sizeMatch[2]}` : "data";
      const status = statusMatch ? statusMatch[1] : "OK";
      const statusColor = status.startsWith("2") ? green : red;
      summary = `Received ${yellow(size)} ${dim("(")}${statusColor(status)}${dim(")")}`;
      break;
    }

    case "Task": {
      summary = "Completed";
      break;
    }

    case "TodoWrite": {
      const match = resultStr.match(/(\d+)\s+todo/i);
      const count = match ? match[1] : "?";
      summary = `Updated ${yellow(count)} todo${count !== "1" ? "s" : ""}`;
      break;
    }

    case "BashOutput": {
      // Show the actual output for BashOutput
      if (!resultStr || resultStr.trim() === "") {
        summary = "(No content)";
      } else if (resultStr.length < 60 && !resultStr.includes("\n")) {
        summary = resultStr.trim();
      } else {
        const lines = resultStr.split("\n").filter((l) => l.trim()).length;
        summary = `Output: ${lines} line${lines !== 1 ? "s" : ""}`;
      }
      break;
    }

    case "KillShell": {
      // Show the result/error message directly
      if (resultStr.length < 100) {
        summary = resultStr.trim();
      } else {
        summary = resultStr.substring(0, 97) + "...";
      }
      break;
    }

    case "NotebookEdit": {
      summary = "Updated notebook cell";
      break;
    }

    default: {
      // Generic summary for unknown tools
      if (!resultStr || resultStr.trim() === "") {
        summary = "Done";
      } else if (resultStr.length < 60) {
        summary = resultStr.trim();
      } else {
        const lines = resultStr.split("\n").length;
        summary = `Output: ${lines} line${lines !== 1 ? "s" : ""}`;
      }
    }
  }

  return `  ${dim("⎿")}  ${summary}`;
}

// Enhanced File Operations with Streaming Support (Claude Code-style)
class FileOperations {
  static async streamCopy(
    sourcePath: string,
    destPath: string,
    progressCallback?: (progress: number) => void,
  ): Promise<void> {
    try {
      const sourceFile = await Deno.open(sourcePath);
      const destFile = await Deno.open(destPath, {
        write: true,
        create: true,
        truncate: true,
      });

      const stat = await sourceFile.stat();
      const totalSize = stat.size;
      let bytesRead = 0;

      const buffer = new Uint8Array(64 * 1024); // 64KB chunks for streaming

      try {
        while (true) {
          const bytesInBuffer = await sourceFile.read(buffer);
          if (bytesInBuffer === null) break;

          await destFile.write(buffer.subarray(0, bytesInBuffer));
          bytesRead += bytesInBuffer;

          if (progressCallback && totalSize > 0) {
            const progress = (bytesRead / totalSize) * 100;
            progressCallback(Math.floor(progress));
          }
        }
      } finally {
        sourceFile.close();
        destFile.close();
      }

      logger.debug(
        `Stream copied ${bytesRead} bytes from ${sourcePath} to ${destPath}`,
      );
    } catch (error) {
      throw new Error(`Failed to stream copy file: ${error}`);
    }
  }

  static async readFileStream(
    filePath: string,
    progressCallback?: (progress: number) => void,
  ): Promise<string> {
    try {
      const file = await Deno.open(filePath);
      const stat = await file.stat();
      const totalSize = stat.size;
      let bytesRead = 0;

      const decoder = new TextDecoder();
      const chunks: string[] = [];
      const buffer = new Uint8Array(32 * 1024); // 32KB chunks

      try {
        while (true) {
          const bytesInBuffer = await file.read(buffer);
          if (bytesInBuffer === null) break;

          const chunk = decoder.decode(buffer.subarray(0, bytesInBuffer), {
            stream: true,
          });
          chunks.push(chunk);
          bytesRead += bytesInBuffer;

          if (progressCallback && totalSize > 0) {
            const progress = (bytesRead / totalSize) * 100;
            progressCallback(Math.floor(progress));
          }
        }

        // Finalize decoder
        const finalChunk = decoder.decode();
        if (finalChunk) chunks.push(finalChunk);
      } finally {
        file.close();
      }

      logger.debug(`Stream read ${bytesRead} bytes from ${filePath}`);
      return chunks.join("");
    } catch (error) {
      throw new Error(`Failed to stream read file: ${error}`);
    }
  }

  static async writeFileStream(
    filePath: string,
    content: string,
    progressCallback?: (progress: number) => void,
  ): Promise<void> {
    try {
      const file = await Deno.open(filePath, {
        write: true,
        create: true,
        truncate: true,
      });
      const encoder = new TextEncoder();
      const data = encoder.encode(content);
      const totalSize = data.length;
      let bytesWritten = 0;

      const chunkSize = 32 * 1024; // 32KB chunks

      try {
        for (let i = 0; i < data.length; i += chunkSize) {
          const chunk = data.slice(i, i + chunkSize);
          await file.write(chunk);
          bytesWritten += chunk.length;

          if (progressCallback && totalSize > 0) {
            const progress = (bytesWritten / totalSize) * 100;
            progressCallback(Math.floor(progress));
          }
        }
      } finally {
        file.close();
      }

      logger.debug(`Stream wrote ${bytesWritten} bytes to ${filePath}`);
    } catch (error) {
      throw new Error(`Failed to stream write file: ${error}`);
    }
  }

  static async getFileInfo(filePath: string): Promise<{
    size: number;
    isFile: boolean;
    isDirectory: boolean;
    modified: Date;
  }> {
    try {
      const stat = await Deno.stat(filePath);
      return {
        size: stat.size,
        isFile: stat.isFile,
        isDirectory: stat.isDirectory,
        modified: stat.mtime || new Date(),
      };
    } catch (error) {
      throw new Error(`Failed to get file info: ${error}`);
    }
  }
}

async function loadImageAsBase64(
  imagePath: string,
): Promise<{ media_type: string; data: string } | null> {
  try {
    logger.debug(`Loading image: ${imagePath}`);

    // Enhanced path handling with @std/path
    const normalizedPath = isAbsolute(imagePath)
      ? imagePath
      : resolve(Deno.cwd(), imagePath);

    logger.debug(`Resolved path: ${normalizedPath}`);

    // Better file type detection using @std/path
    const extension = extname(normalizedPath).toLowerCase();
    const mediaTypeMap: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".bmp": "image/bmp",
      ".svg": "image/svg+xml",
    };

    const media_type = mediaTypeMap[extension];
    if (!media_type) {
      logger.error(`Unsupported image type: ${extension}`);
      console.error(red(`Unsupported image type: ${extension}\n`));
      return null;
    }

    // Enhanced file reading for large images (Claude Code-style)
    const fileInfo = await FileOperations.getFileInfo(normalizedPath);
    const isLargeFile = fileInfo.size > 1024 * 1024; // 1MB threshold

    let imageData: Uint8Array;
    if (isLargeFile) {
      const sizeInMB = Math.round(fileInfo.size / 1024 / 1024);
      console.log(
        dim(`Loading large image (${sizeInMB}MB)...`),
      );

      try {
        imageData = await Deno.readFile(normalizedPath);
        console.log(StatusBadges.success(`Loaded ${sizeInMB}MB image`));
      } catch (error) {
        console.log(StatusBadges.error("Failed to load image"));
        throw error;
      }
    } else {
      imageData = await Deno.readFile(normalizedPath);
    }

    const base64Data = encodeBase64(imageData);

    logger.info(
      `Successfully loaded image: ${normalizedPath} (${imageData.length} bytes)`,
    );
    return { media_type, data: base64Data };
  } catch (error) {
    const err = error as Error;
    logger.error(`Failed to load image ${imagePath}: ${err.message}`);
    console.error(red(`Error loading image: ${err.message}\n`));
    return null;
  }
}

async function main() {
  // Load environment configuration with @std/dotenv
  try {
    await load({ export: true });
    logger.debug("Environment configuration loaded");
  } catch (error) {
    logger.debug(`No .env file found or error loading: ${error}`);
  }

  // Load user configuration from YAML/TOML if available (Claude Code-style)
  const defaultConfig = {
    model: "claude-sonnet-4-5-20250929",
    maxHistory: 1000,
    maxCheckpoints: 10,
    logLevel: "INFO",
    theme: {
      primaryColor: { r: 100, g: 150, b: 255 },
      successColor: { r: 46, g: 204, b: 113 },
      errorColor: { r: 231, g: 76, b: 60 },
    },
  };

  let userConfig: Record<string, unknown> = defaultConfig;
  const configPaths = [
    ".claude-cli.yaml",
    ".claude-cli.yml",
    ".claude-cli.toml",
    join(Deno.env.get("HOME") || "~", ".config", "claude-cli", "config.yaml"),
  ];

  for (const configPath of configPaths) {
    try {
      if (await exists(configPath)) {
        const loadedConfig = await ConfigUtils.loadConfig(configPath);
        if (loadedConfig) {
          userConfig = ConfigUtils.mergeWithDefaults(
            loadedConfig,
            defaultConfig,
          );
          logger.info(`Loaded configuration from ${configPath}`);
          console.log(StatusBadges.info(`Config loaded from ${configPath}`));
          break;
        }
      }
    } catch (error) {
      logger.debug(`Could not load config from ${configPath}: ${error}`);
    }
  }

  // Parse command-line arguments (override config)
  const args = parseArgs(Deno.args, {
    boolean: ["help", "version"],
    string: ["model"],
    alias: {
      h: "help",
      v: "version",
      m: "model",
    },
    default: {
      model: (userConfig.model as string) || "claude-sonnet-4-5-20250929",
    },
  });

  // Handle --help
  if (args.help) {
    console.log(bold("Claude Interactive CLI"));
    console.log("\nUsage: deno task start [options]\n");
    console.log("Options:");
    console.log(`  ${cyan("-h, --help")}     Show this help message`);
    console.log(`  ${cyan("-v, --version")}  Show version information`);
    console.log(
      `  ${
        cyan("-m, --model")
      }    Specify model (default: claude-sonnet-4-5-20250929)`,
    );
    console.log("\nModels:");
    console.log(
      "  • claude-sonnet-4-5-20250929 (default, Sonnet 4.5 - newest)",
    );
    console.log("  • claude-haiku-4-5-20251001 (Haiku 4.5 - fastest)");
    console.log("  • claude-opus-4-1-20250805 (Opus 4.1 - most capable)");
    console.log("  • claude-3-5-sonnet-20241022 (Sonnet 3.5 - legacy)");
    Deno.exit(0);
  }

  // Handle --version
  if (args.version) {
    console.log("Claude Interactive CLI v1.0.0");
    console.log("Claude Agent SDK v0.1.30");
    console.log("Deno " + Deno.version.deno);
    Deno.exit(0);
  }

  const modelName = args.model as string;
  logger.info(`Starting Claude Interactive CLI with model: ${modelName}`);

  printWelcome();

  const messageQueue = new MessageQueue();
  let pendingImage: { media_type: string; data: string } | null = null;
  let queryInstance: AsyncIterable<unknown> | null = null;
  let isProcessing = false;
  let sessionId = ""; // Shared session ID for message queue

  // Initialize enhanced managers (Claude Code-style)
  let commandHistory: CommandHistory | undefined;
  let checkpointManager: CheckpointManager | undefined;
  const backgroundTasks = new BackgroundTaskManager();
  const errorHandler = new ErrorHandler();

  // Start the query with streaming input
  const startQuery = async () => {
    try {
      queryInstance = query({
        prompt: messageQueue.generate(),
        options: {
          executable: "deno",
          executableArgs: ["--allow-all"],
          model: modelName,
          permissionMode: "bypassPermissions", // Auto-approve all tools
          systemPrompt: {
            type: "preset",
            preset: "claude_code",
          },
          // Explicitly enable all default Claude Code tools
          allowedTools: [
            "Task", // Launch subagents for complex tasks
            "Bash", // Execute shell commands
            "BashOutput", // Read background shell output
            "Edit", // Edit files with string replacement
            "Read", // Read files, images, PDFs, notebooks
            "Write", // Write/create files
            "Glob", // File pattern matching
            "Grep", // Search file contents with regex
            "KillShell", // Terminate background shells
            "NotebookEdit", // Edit Jupyter notebooks
            "WebFetch", // Fetch and analyze web content
            "WebSearch", // Search the web
            "TodoWrite", // Manage task lists
            "ExitPlanMode", // Exit planning mode
            "ListMcpResources", // List MCP resources
            "ReadMcpResource", // Read MCP resources
          ],
          includePartialMessages: true, // Enable streaming output
        },
      });

      let assistantResponse = "";
      const toolExecutions = new Map<
        string,
        { name: string; input: Record<string, unknown>; result?: string; order: number }
      >();
      let toolOrder = 0; // Track order of tool invocations

      // Stream and display messages
      for await (const msg of queryInstance) {
        const message = msg as {
          type: string;
          subtype?: string;
          [key: string]: unknown;
        };

        // Log all message types for debugging
        if (message.type !== "stream_event") {
          logger.debug(`Message type: ${message.type}`);
        }

        switch (message.type) {
          case "system": {
            const systemMsg = message as {
              type: "system";
              subtype?: string;
              session_id?: string;
            };
            if (systemMsg.subtype === "init" && systemMsg.session_id) {
              sessionId = systemMsg.session_id;

              // Initialize managers that need sessionId (Claude Code-style)
              commandHistory = new CommandHistory(sessionId);
              checkpointManager = new CheckpointManager(sessionId);

              console.log(
                dim(
                  `Session: ${sessionId.slice(0, 8)}... [Enhanced Mode] 🚀\n`,
                ),
              );

              // Create initial checkpoint
              try {
                await checkpointManager.createCheckpoint("session_start");
                logger.debug("Initial checkpoint created");
              } catch (error) {
                logger.debug(`Could not create initial checkpoint: ${error}`);
              }
            }
            break;
          }

          case "stream_event": {
            const streamMsg = message as {
              type: "stream_event";
              event: {
                type: string;
                delta?: { type: string; text?: string };
                content_block?: {
                  type: string;
                };
              };
            };

            // Only handle text streaming - tools are displayed after completion
            if (streamMsg.event.type === "content_block_delta") {
              const delta = streamMsg.event.delta;
              if (delta && delta.type === "text_delta" && delta.text) {
                // Stream Claude's text response as it arrives
                await Deno.stdout.write(new TextEncoder().encode(delta.text));
              }
              // Ignore input_json_delta - we'll get complete tool info in assistant message
            } else if (streamMsg.event.type === "content_block_start") {
              const block = streamMsg.event.content_block;
              if (block && block.type === "text") {
                // Start of text block - show Claude: prefix
                await Deno.stdout.write(
                  new TextEncoder().encode("\n" + bold(green("Claude: "))),
                );
              }
              // Ignore tool_use blocks - we'll display them after completion
            } else if (streamMsg.event.type === "content_block_stop") {
              // Just add newline after text blocks
              if (streamMsg.event.content_block?.type === "text") {
                await Deno.stdout.write(new TextEncoder().encode("\n"));
              }
            }
            break;
          }

          case "assistant": {
            const assistantMsg = message as {
              type: "assistant";
              message: {
                content: Array<{
                  type: string;
                  text?: string;
                  id?: string;
                  name?: string;
                  input?: Record<string, unknown>;
                }>;
              };
            };

            // Process message content - collect tools and text
            for (const block of assistantMsg.message.content) {
              if (block.type === "text" && block.text) {
                assistantResponse += block.text;
              } else if (block.type === "tool_use" && block.name && block.id) {
                // Store tool execution info (DON'T display yet - wait for results)
                toolExecutions.set(block.id, {
                  name: block.name,
                  input: block.input || {},
                  order: toolOrder++,
                });
              }
            }
            break;
          }

          case "user": {
            const userMsg = message as {
              type: "user";
              message: {
                content: Array<{
                  type: string;
                  tool_use_id?: string;
                  content?: string | Array<{ type: string; text?: string }>;
                  is_error?: boolean;
                }>;
              };
            };

            // Collect all tool results and pair them with their tool calls
            const toolResults: Array<{
              toolId: string;
              toolInfo: { name: string; input: Record<string, unknown>; order: number };
              resultText: string;
            }> = [];

            for (const block of userMsg.message.content) {
              if (block.type === "tool_result" && block.tool_use_id) {
                const toolInfo = toolExecutions.get(block.tool_use_id);
                if (!toolInfo) continue;

                // Extract result text
                let resultText = "";
                if (typeof block.content === "string") {
                  resultText = block.content;
                } else if (Array.isArray(block.content)) {
                  resultText = block.content
                    .filter((c) => c.type === "text" && c.text)
                    .map((c) => c.text)
                    .join("\n");
                }

                toolResults.push({
                  toolId: block.tool_use_id,
                  toolInfo,
                  resultText,
                });
              }
            }

            // Sort by original tool order and display each tool+result pair
            toolResults.sort((a, b) => a.toolInfo.order - b.toolInfo.order);

            for (const { toolInfo, resultText } of toolResults) {
              // Display tool call: ● ToolName(params)
              console.log(formatToolCall(toolInfo.name, toolInfo.input));

              // Display result summary immediately after: ⎿ summary
              console.log(
                formatToolResultSummary(toolInfo.name, resultText, toolInfo.input),
              );
            }

            break;
          }

          case "tool_progress": {
            // Log tool progress for debugging (results displayed via user messages)
            const toolProgressMsg = message as {
              type: "tool_progress";
              subtype?: string;
              tool_use_id?: string;
              [key: string]: unknown;
            };

            logger.debug(
              `tool_progress: ${toolProgressMsg.subtype} for ${toolProgressMsg.tool_use_id}`,
            );
            // Tool results are displayed in the user message handler, not here
            break;
          }

          case "result": {
            const resultMsg = message as {
              type: "result";
              subtype: string;
              duration_ms?: number;
              total_cost_usd?: number;
              usage?: { input_tokens: number; output_tokens: number };
              error?: string;
            };

            isProcessing = false;
            if (
              resultMsg.subtype === "success" && resultMsg.duration_ms &&
              resultMsg.total_cost_usd && resultMsg.usage
            ) {
              // Enhanced stats display with colors
              const duration = (resultMsg.duration_ms / 1000).toFixed(2);
              const cost = resultMsg.total_cost_usd.toFixed(4);
              const inputTokens = resultMsg.usage.input_tokens;
              const outputTokens = resultMsg.usage.output_tokens;

              console.log(
                dim("[") +
                  cyan(duration + "s") +
                  dim(" | ") +
                  magenta("$" + cost) +
                  dim(" | ") +
                  yellow(String(inputTokens)) +
                  dim("→") +
                  yellow(String(outputTokens)) +
                  dim(" tokens]\n"),
              );
              assistantResponse = "";
            } else {
              console.error(red(`✗ Query failed: ${resultMsg.subtype}`));
              if (resultMsg.error) {
                console.error(red(`Error: ${resultMsg.error}\n`));
              }
            }
            break;
          }

          default: {
            // Log unhandled message types with their full structure for debugging
            logger.debug(
              `Unhandled message type: ${message.type}, full message: ${
                JSON.stringify(message, null, 2).substring(0, 500)
              }`,
            );
            break;
          }
        }
      }
    } catch (error) {
      const err = error as Error;

      // Enhanced error handling (Claude Code-style)
      const shouldContinue = await errorHandler.handleError(
        err,
        "query_processing",
      );
      if (!shouldContinue) {
        console.log(cyan("Goodbye!"));
        Deno.exit(1);
      }

      isProcessing = false;
    }
  };

  // Start query processing in background
  startQuery();

  // Create stdin reader once to avoid locking issues
  const lineStream = Deno.stdin.readable
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new TextLineStream());
  const stdinReader = lineStream.getReader();

  // Interactive REPL loop
  while (true) {
    let input = await readInput(bold(blue("You: ")), stdinReader);

    // Handle EOF (Ctrl+D or pipe closed)
    if (input === null) {
      messageQueue.stop();
      console.log("\n" + cyan("Goodbye!"));
      Deno.exit(0);
    }

    // Handle empty input
    if (!input) {
      continue;
    }

    // Handle commands
    const command = input.toLowerCase().trim();

    if (command === "/exit" || command === "/quit") {
      // Cleanup before exit (Claude Code-style)
      messageQueue.stop();
      backgroundTasks.stopAll();

      // Save final checkpoint if possible
      if (checkpointManager && sessionId) {
        try {
          await checkpointManager.createCheckpoint("session_end");
          console.log(dim("Final checkpoint saved."));
        } catch (error) {
          logger.debug(`Could not save final checkpoint: ${error}`);
        }
      }

      console.log("\n" + cyan("Goodbye! 👋"));
      Deno.exit(0);
    } else if (command === "/help") {
      printHelp();
      continue;
    } else if (command === "/clear") {
      console.clear();
      printWelcome();
      continue;
    } else if (command.startsWith("/image ")) {
      const imagePath = command.substring(7).trim();
      const imageData = await loadImageAsBase64(imagePath);
      if (imageData) {
        pendingImage = imageData;
        console.log(bold(green("✔")) + ` Image loaded: ${imagePath}`);
        console.log(dim("Your next message will include this image\n"));
      }
      continue;
    } else if (command === "/history") {
      // Interactive command history search (Claude Code-style)
      if (commandHistory) {
        const selectedCommand = await commandHistory.searchInteractive();
        if (selectedCommand) {
          console.log(dim(`Selected: ${selectedCommand}\n`));
          // Set the selected command as the next input
          input = selectedCommand;
        } else {
          continue;
        }
      } else {
        console.log(
          dim(
            "Command history not yet available. Try again after sending a message.\n",
          ),
        );
        continue;
      }
    } else if (command.startsWith("/checkpoint")) {
      // Checkpoint management (Claude Code-style)
      const args = input.trim().split(" ").slice(1);

      if (!checkpointManager || !sessionId) {
        // cspell:disable-next-line
        console.log(
          dim(
            "Checkpointing not yet available. Try again after initialization.\n",
          ),
        );
        continue;
      }

      if (args.length === 0) {
        // List checkpoints
        const checkpoints = await checkpointManager.listCheckpoints();
        if (checkpoints.length === 0) {
          console.log(dim("No checkpoints found.\n"));
        } else {
          console.log(bold("Available Checkpoints:"));
          checkpoints.forEach((cp, index) => {
            const timeAgo = new Date(
              Date.now() - new Date(cp.timestamp).getTime(),
            ).toISOString().substr(11, 8);
            console.log(
              `  ${cyan((index + 1).toString())}: ${cp.description} ${
                dim(`(${timeAgo} ago)`)
              }`,
            );
          });
          console.log();
        }
      } else if (args[0] === "restore" && args[1]) {
        // Restore checkpoint
        const success = await checkpointManager.restoreCheckpoint(args[1]);
        if (success) {
          console.log(bold(green("✔")) + ` Checkpoint restored: ${args[1]}\n`);
        } else {
          console.log(
            bold(red("✗")) + ` Failed to restore checkpoint: ${args[1]}\n`,
          );
        }
      } else {
        // Create checkpoint
        const description = args.join("_") || "manual_checkpoint";
        try {
          const checkpointId = await checkpointManager.createCheckpoint(
            description,
          );
          console.log(
            bold(green("✔")) + ` Checkpoint created: ${checkpointId}\n`,
          );
        } catch (error) {
          console.log(
            bold(red("✗")) + ` Failed to create checkpoint: ${error}\n`,
          );
        }
      }
      continue;
    } else if (command === "/tasks") {
      // Background task management (Claude Code-style)
      const tasks = backgroundTasks.listTasks();
      if (tasks.length === 0) {
        console.log(dim("No background tasks running.\n"));
      } else {
        console.log(bold("Background Tasks:"));
        tasks.forEach((task, index) => {
          const duration = Math.floor(task.duration / 1000);
          console.log(
            `  ${cyan((index + 1).toString())}: ${task.name} ${
              dim(`(${duration}s running)`)
            }`,
          );
        });
        console.log();
      }
      continue;
    } else if (command === "/errors") {
      // Error summary (Claude Code-style)
      errorHandler.showRecentErrors();
      const summary = errorHandler.getErrorSummary();
      console.log(
        dim(`Total errors: ${summary.count}, Recent: ${summary.recent}\n`),
      );
      continue;
    } else if (command.startsWith("/bg ")) {
      // Start background task (Claude Code-style)
      const taskCommand = input.substring(4).trim().split(" ");
      if (taskCommand.length > 0) {
        const taskId = `task_${Date.now()}`;
        const taskName = taskCommand[0];
        const success = backgroundTasks.startTask(
          taskId,
          taskName,
          taskCommand,
        );
        if (!success) {
          console.log(StatusBadges.error("Failed to start background task"));
        }
      }
      continue;
    } else if (command.startsWith("/config")) {
      // Configuration management (Claude Code-style)
      const args = input.trim().split(" ").slice(1);

      if (args.length > 0 && args[0] === "save") {
        // Save current configuration
        const configPath = ".claude-cli.yaml";
        const configToSave = {
          model: modelName,
          maxHistory: 1000,
          maxCheckpoints: 10,
          logLevel: "INFO",
        };

        const success = await ConfigUtils.saveConfig(configPath, configToSave);
        if (success) {
          console.log(
            StatusBadges.success(`Configuration saved to ${configPath}`),
          );
        } else {
          console.log(StatusBadges.error("Failed to save configuration"));
        }
      } else {
        // Display current configuration
        console.log(bold("\nCurrent Configuration:"));
        console.log(`  ${cyan("Model:")} ${modelName}`);
        console.log(`  ${cyan("Session:")} ${sessionId.slice(0, 16)}...`);
        console.log(
          `  ${cyan("Config:")} ${
            Object.keys(userConfig).length > 0 ? "Loaded" : "Defaults"
          }`,
        );
        console.log();
      }
      continue;
    } else if (command === "/demo") {
      // Demonstrate enhanced features (Claude Code-style)
      console.log(bold("\n🎨 Enhanced Features Demo\n"));

      // Status badges
      console.log(bold("Status Badges:"));
      console.log(StatusBadges.success("Operation completed successfully"));
      console.log(StatusBadges.error("Something went wrong"));
      console.log(StatusBadges.warning("Please review this carefully"));
      console.log(StatusBadges.info("Helpful information"));
      console.log(StatusBadges.progress("Processing your request"));
      console.log(
        StatusBadges.custom(
          "CUSTOM",
          "Branded message",
          { r: 138, g: 43, b: 226 },
        ),
      );
      console.log();

      // Unicode width formatting
      console.log(bold("Unicode Width Formatting:"));
      const testStrings = [
        ["Name", "Width", "Display"],
        ["Hello", String(unicodeWidth("Hello")), "Hello"],
        ["你好", String(unicodeWidth("你好")), "你好"],
        ["🎉emoji", String(unicodeWidth("🎉emoji")), "🎉emoji"],
      ];

      const colWidths = [15, 10, 15];
      testStrings.forEach((row) => {
        console.log("  " + TextFormatting.tableRow(row, colWidths));
      });
      console.log();

      // Truncation demo
      console.log(bold("Unicode-Aware Truncation:"));
      const longText =
        "This is a very long text with emoji 🎉🎊🎈 and 中文字符";
      console.log(`  Original (${unicodeWidth(longText)}): ${dim(longText)}`);
      console.log(
        `  Truncated: ${
          brightGreen(TextFormatting.truncateToWidth(longText, 30))
        }`,
      );
      console.log();

      // Async utilities demo
      console.log(bold("Async Utilities:"));
      console.log(dim("  ✓ Retry with exponential backoff"));
      console.log(dim("  ✓ Concurrent processing with pooledMap"));
      console.log(dim("  ✓ Progress callbacks for long operations"));
      console.log();

      // Config demo
      console.log(bold("Configuration:"));
      console.log(dim("  ✓ YAML/TOML file support"));
      console.log(dim("  ✓ Hierarchical config loading"));
      console.log(dim("  ✓ Environment variable integration"));
      console.log();

      console.log(
        StatusBadges.success("Demo complete! Try /help for all commands"),
      );
      continue;
    }

    // Build message content
    const messageContent: Array<{
      type: "text" | "image";
      text?: string;
      source?: {
        type: "base64";
        media_type: string;
        data: string;
      };
    }> = [
      {
        type: "text",
        text: input,
      },
    ];

    // Add image if one is pending
    if (pendingImage) {
      messageContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: pendingImage.media_type,
          data: pendingImage.data,
        },
      });
      console.log(dim("Including attached image in message\n"));
      pendingImage = null;
    }

    // Add to command history (Claude Code-style)
    if (commandHistory && !input.startsWith("/")) {
      commandHistory.add(input);
    }

    // Send message to streaming input
    isProcessing = true;
    messageQueue.enqueue({
      type: "user",
      message: {
        role: "user",
        content: messageContent,
      },
      parent_tool_use_id: null,
      session_id: sessionId || "", // Use session_id from init message, or empty string initially
    });

    // Wait for response to complete before reading next input
    while (isProcessing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

// Run the main function
if (import.meta.main) {
  main();
}
