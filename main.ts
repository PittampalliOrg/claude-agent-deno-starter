#!/usr/bin/env -S deno run --allow-all

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

/**
 * Interactive Claude CLI - A REPL for Claude Code Agent SDK
 * Using Streaming Input Mode for advanced features
 */

// ANSI color codes for better UX
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
};

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
  console.log(`${colors.bright}${colors.cyan}`);
  console.log("╔═══════════════════════════════════════════════╗");
  console.log("║   Claude Interactive CLI (Streaming Mode)    ║");
  console.log("╚═══════════════════════════════════════════════╝");
  console.log(colors.reset);
  console.log(`${colors.dim}Type your message and press Enter to chat with Claude.`);
  console.log(`Commands: /exit, /quit, /help, /clear, /image${colors.reset}\n`);
}

function printHelp() {
  console.log(`\n${colors.bright}Available Commands:${colors.reset}`);
  console.log(`  ${colors.cyan}/help${colors.reset}   - Show this help message`);
  console.log(`  ${colors.cyan}/exit${colors.reset}   - Exit the CLI`);
  console.log(`  ${colors.cyan}/quit${colors.reset}   - Exit the CLI`);
  console.log(`  ${colors.cyan}/clear${colors.reset}  - Clear the screen`);
  console.log(`  ${colors.cyan}/image <path>${colors.reset} - Attach an image to your next message\n`);
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
    console.error(
      `${colors.red}Error loading image: ${err.message}${colors.reset}\n`
    );
    return null;
  }
}

async function main() {
  printWelcome();

  const messageQueue = new MessageQueue();
  let pendingImage: { media_type: string; data: string } | null = null;
  let queryInstance: any = null;
  let isProcessing = false;
  let sessionId = ""; // Shared session ID for message queue

  // Start the query with streaming input
  const startQuery = async () => {
    try {
      queryInstance = query({
        prompt: messageQueue.generate(),
        options: {
          executable: "deno",
          executableArgs: ["--allow-all"],
          model: "claude-sonnet-4-20250514",
          permissionMode: "bypassPermissions",
          systemPrompt: {
            type: "preset",
            preset: "claude_code",
          },
          includePartialMessages: true, // Enable streaming output
        },
      });

      let assistantResponse = "";
      let currentToolUse = false;

      // Stream and display messages
      for await (const message of queryInstance) {
        switch (message.type) {
          case "system":
            if (message.subtype === "init") {
              sessionId = message.session_id;
              console.log(
                `${colors.dim}Session: ${sessionId.slice(0, 8)}... [Streaming Mode]${colors.reset}\n`
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
              }
            } else if (message.event.type === "content_block_start") {
              const block = message.event.content_block;
              if (block.type === "text") {
                // Start of text block
                if (!currentToolUse) {
                  await Deno.stdout.write(
                    new TextEncoder().encode(
                      `${colors.bright}${colors.green}Claude:${colors.reset} `
                    )
                  );
                }
              } else if (block.type === "tool_use") {
                currentToolUse = true;
              }
            } else if (message.event.type === "content_block_stop") {
              if (!currentToolUse) {
                await Deno.stdout.write(new TextEncoder().encode("\n"));
              }
              currentToolUse = false;
            }
            break;

          case "assistant":
            // Collect full assistant response
            for (const block of message.message.content) {
              if (block.type === "text") {
                assistantResponse += block.text;
              }
            }
            break;

          case "result":
            isProcessing = false;
            if (message.subtype === "success") {
              console.log(
                `${colors.dim}[${(message.duration_ms / 1000).toFixed(2)}s | $${message.total_cost_usd.toFixed(4)} | ${message.usage.input_tokens}→${message.usage.output_tokens} tokens]${colors.reset}\n`
              );
              assistantResponse = "";
            } else {
              console.error(
                `${colors.red}✗ Query failed: ${message.subtype}${colors.reset}\n`
              );
            }
            break;
        }
      }
    } catch (error) {
      const err = error as Error;
      console.error(`${colors.red}Error: ${err.message}${colors.reset}\n`);
      isProcessing = false;
    }
  };

  // Start query processing in background
  startQuery();

  // Interactive REPL loop
  while (true) {
    const input = await readInput(
      `${colors.bright}${colors.blue}You:${colors.reset} `
    );

    // Handle EOF (Ctrl+D or pipe closed)
    if (input === null) {
      messageQueue.stop();
      if (queryInstance?.interrupt) {
        await queryInstance.interrupt();
      }
      console.log(`\n${colors.cyan}Goodbye!${colors.reset}`);
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
      console.log(`\n${colors.cyan}Goodbye! 👋${colors.reset}`);
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
        console.log(
          `${colors.green}✓ Image loaded: ${imagePath}${colors.reset}`
        );
        console.log(
          `${colors.dim}Your next message will include this image${colors.reset}\n`
        );
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
      console.log(
        `${colors.dim}Including attached image in message${colors.reset}\n`
      );
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
