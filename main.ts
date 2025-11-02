#!/usr/bin/env -S deno run --allow-all

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  bold,
  cyan,
  blue,
  green,
  red,
  yellow,
  dim,
  bgCyan,
  bgBlue,
} from "@std/fmt/colors";
import { parseArgs } from "@std/cli/parse-args";
import { Spinner } from "@std/cli/spinner";

/**
 * Interactive Claude CLI - A REPL for Claude Code Agent SDK
 * Using Streaming Input Mode for advanced features with Deno std library UI
 */

// Message queue for streaming input
class MessageQueue {
  private queue: Array<SDKUserMessage> = [];
  private resolvers: Array<(value: SDKUserMessage | null) => void> = [];
  private stopped = false;

  async *generate(): AsyncGenerator<SDKUserMessage> {
    while (!this.stopped) {
      const message = await this.dequeue();
      if (message === null) break;
      yield message;
    }
  }

  enqueue(message: SDKUserMessage) {
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve(message);
    } else {
      this.queue.push(message);
    }
  }

  private dequeue(): Promise<SDKUserMessage | null> {
    if (this.queue.length > 0) {
      return Promise.resolve(this.queue.shift()!);
    }
    if (this.stopped) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      this.resolvers.push(resolve);
    });
  }

  stop() {
    this.stopped = true;
    // Resolve all pending promises with null
    while (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve(null);
    }
  }
}

function printWelcome() {
  console.log(bold(cyan("╔═══════════════════════════════════════════════╗")));
  console.log(bold(cyan("║   Claude Interactive CLI (Streaming Mode)    ║")));
  console.log(bold(cyan("╚═══════════════════════════════════════════════╝")));
  console.log();
  console.log(dim("Type your message and press Enter to chat with Claude."));
  console.log(dim("Commands: /exit, /quit, /help, /clear, /image\n"));
}

function printHelp() {
  console.log("\n" + bold("Available Commands:"));
  console.log(`  ${cyan("/help")}   - Show this help message`);
  console.log(`  ${cyan("/exit")}   - Exit the CLI`);
  console.log(`  ${cyan("/quit")}   - Exit the CLI`);
  console.log(`  ${cyan("/clear")}  - Clear the screen`);
  console.log(`  ${cyan("/image <path>")} - Attach an image to your next message\n`);
}

async function readInput(prompt: string): Promise<string | null> {
  // Write prompt to stdout
  await Deno.stdout.write(new TextEncoder().encode(prompt));

  // Read line from stdin
  const buf = new Uint8Array(1024);
  const n = await Deno.stdin.read(buf);
  if (n === null) return null; // Return null on EOF

  return new TextDecoder().decode(buf.subarray(0, n)).trim();
}

function formatToolInput(input: any): string {
  if (!input || Object.keys(input).length === 0) {
    return "";
  }

  // Format tool input for display - show key parameters intelligently
  const parts: string[] = [];
  const maxParts = 3; // Show at most 3 parameters
  let count = 0;

  for (const [key, value] of Object.entries(input)) {
    if (count >= maxParts) {
      parts.push("...");
      break;
    }

    let displayValue: string;

    if (typeof value === "string") {
      // Truncate long strings
      if (value.length > 40) {
        displayValue = `"${value.substring(0, 40)}..."`;
      } else {
        displayValue = `"${value}"`;
      }
    } else if (Array.isArray(value)) {
      displayValue = `[${value.length} items]`;
    } else if (typeof value === "object" && value !== null) {
      const objKeys = Object.keys(value);
      if (objKeys.length > 0) {
        displayValue = `{${objKeys.slice(0, 2).join(", ")}${objKeys.length > 2 ? "..." : ""}}`;
      } else {
        displayValue = "{}";
      }
    } else if (typeof value === "boolean") {
      displayValue = value ? "true" : "false";
    } else if (typeof value === "number") {
      displayValue = String(value);
    } else {
      displayValue = String(value);
    }

    // Shorten common parameter names
    const shortKey = key === "file_path" ? "file" :
                     key === "pattern" ? "pat" :
                     key === "command" ? "cmd" : key;

    parts.push(`${shortKey}: ${displayValue}`);
    count++;
  }

  return parts.join(", ");
}

async function loadImageAsBase64(
  imagePath: string
): Promise<{ media_type: string; data: string } | null> {
  try {
    const imageData = await Deno.readFile(imagePath);
    const base64Data = btoa(String.fromCharCode(...imageData));

    // Detect media type from extension
    const ext = imagePath.toLowerCase().split(".").pop();
    const mediaTypeMap: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
    };

    const media_type = mediaTypeMap[ext || ""] || "image/png";

    return { media_type, data: base64Data };
  } catch (error) {
    const err = error as Error;
    console.error(red(`Error loading image: ${err.message}\n`));
    return null;
  }
}

async function main() {
  // Parse command-line arguments
  const args = parseArgs(Deno.args, {
    boolean: ["help", "version"],
    string: ["model"],
    alias: {
      h: "help",
      v: "version",
      m: "model",
    },
    default: {
      model: "claude-sonnet-4-20250514",
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
      `  ${cyan("-m, --model")}    Specify model (default: claude-sonnet-4-20250514)`
    );
    console.log("\nModels:");
    console.log("  • claude-sonnet-4-20250514 (default)");
    console.log("  • claude-opus-4-20250514");
    console.log("  • claude-haiku-4-20250514");
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

  printWelcome();

  const messageQueue = new MessageQueue();
  let pendingImage: { media_type: string; data: string } | null = null;
  let queryInstance: any = null;
  let isProcessing = false;
  let sessionId = ""; // Shared session ID for message queue
  let currentSpinner: Spinner | null = null;

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
            "Task",           // Launch subagents for complex tasks
            "Bash",           // Execute shell commands
            "BashOutput",     // Read background shell output
            "Edit",           // Edit files with string replacement
            "Read",           // Read files, images, PDFs, notebooks
            "Write",          // Write/create files
            "Glob",           // File pattern matching
            "Grep",           // Search file contents with regex
            "KillShell",      // Terminate background shells
            "NotebookEdit",   // Edit Jupyter notebooks
            "WebFetch",       // Fetch and analyze web content
            "WebSearch",      // Search the web
            "TodoWrite",      // Manage task lists
            "ExitPlanMode",   // Exit planning mode
            "ListMcpResources", // List MCP resources
            "ReadMcpResource",  // Read MCP resources
          ],
          includePartialMessages: true, // Enable streaming output
        },
      });

      let assistantResponse = "";
      let currentToolUse = false;
      let currentToolName = "";
      let currentToolInput: any = {};

      // Stream and display messages
      for await (const message of queryInstance) {
        switch (message.type) {
          case "system":
            if (message.subtype === "init") {
              sessionId = message.session_id;
              console.log(
                dim(`Session: ${sessionId.slice(0, 8)}... [Streaming Mode]\n`)
              );
            }
            break;

          case "stream_event":
            // Handle partial message streaming
            if (message.event.type === "content_block_delta") {
              const delta = message.event.delta;
              if (delta.type === "text_delta") {
                // Stream text as it arrives
                await Deno.stdout.write(new TextEncoder().encode(delta.text));
              } else if (delta.type === "input_json_delta") {
                // Accumulate tool input during streaming
                try {
                  const partialJson = delta.partial_json;
                  // Merge partial JSON into current tool input
                  currentToolInput = { ...currentToolInput, ...JSON.parse(partialJson) };
                } catch {
                  // Ignore parse errors for incomplete JSON
                }
              }
            } else if (message.event.type === "content_block_start") {
              const block = message.event.content_block;
              if (block.type === "text") {
                // Start of text block
                if (!currentToolUse) {
                  await Deno.stdout.write(
                    new TextEncoder().encode(bold(green("Claude: ")))
                  );
                }
              } else if (block.type === "tool_use") {
                currentToolUse = true;
                currentToolName = block.name;
                currentToolInput = block.input || {};

                // Start spinner for tool execution
                currentSpinner = new Spinner({
                  message: `${currentToolName}`,
                  color: "cyan",
                });
                currentSpinner.start();
              }
            } else if (message.event.type === "content_block_stop") {
              if (currentToolUse) {
                // Stop spinner and show tool call result
                if (currentSpinner) {
                  currentSpinner.stop();
                  currentSpinner = null;
                }

                // Show complete tool call with checkmark for completed tool
                const formattedInput = formatToolInput(currentToolInput);
                if (formattedInput) {
                  console.log(green("✓") + dim(` ${cyan(currentToolName)}(${formattedInput})`));
                } else {
                  console.log(green("✓") + dim(` ${cyan(currentToolName)}`));
                }
                currentToolName = "";
                currentToolInput = {};
              } else {
                await Deno.stdout.write(new TextEncoder().encode("\n"));
              }
              currentToolUse = false;
            }
            break;

          case "assistant":
            // Display tool calls and collect response
            for (const block of message.message.content) {
              if (block.type === "text") {
                assistantResponse += block.text;
              } else if (block.type === "tool_use") {
                // This displays complete tool info after streaming starts
                // Only show if we haven't already shown it during streaming
              }
            }
            break;

          case "result":
            isProcessing = false;
            if (message.subtype === "success") {
              console.log(
                dim(
                  `[${(message.duration_ms / 1000).toFixed(2)}s | $${message.total_cost_usd.toFixed(4)} | ${message.usage.input_tokens}→${message.usage.output_tokens} tokens]\n`
                )
              );
              assistantResponse = "";
            } else {
              console.error(red(`✗ Query failed: ${message.subtype}\n`));
            }
            break;
        }
      }
    } catch (error) {
      const err = error as Error;
      console.error(red(`Error: ${err.message}\n`));
      isProcessing = false;
    }
  };

  // Start query processing in background
  startQuery();

  // Interactive REPL loop
  while (true) {
    const input = await readInput(bold(blue("You: ")));

    // Handle EOF (Ctrl+D or pipe closed)
    if (input === null) {
      messageQueue.stop();
      if (queryInstance?.interrupt) {
        await queryInstance.interrupt();
      }
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
      messageQueue.stop();
      if (queryInstance?.interrupt) {
        await queryInstance.interrupt();
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
        console.log(green(`✓ Image loaded: ${imagePath}`));
        console.log(dim("Your next message will include this image\n"));
      }
      continue;
    }

    // Build message content
    const messageContent: any[] = [
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
