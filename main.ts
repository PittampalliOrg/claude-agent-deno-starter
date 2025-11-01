#!/usr/bin/env -S deno run --allow-all

import { query } from "@anthropic-ai/claude-agent-sdk";

/**
 * Interactive Claude CLI - A REPL for Claude Code Agent SDK
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

function printWelcome() {
  console.log(`${colors.bright}${colors.cyan}`);
  console.log("╔═══════════════════════════════════════════════╗");
  console.log("║       Claude Interactive CLI (Deno)          ║");
  console.log("╚═══════════════════════════════════════════════╝");
  console.log(colors.reset);
  console.log(`${colors.dim}Type your message and press Enter to chat with Claude.`);
  console.log(`Commands: /exit, /quit, /help, /clear${colors.reset}\n`);
}

function printHelp() {
  console.log(`\n${colors.bright}Available Commands:${colors.reset}`);
  console.log(`  ${colors.cyan}/help${colors.reset}   - Show this help message`);
  console.log(`  ${colors.cyan}/exit${colors.reset}   - Exit the CLI`);
  console.log(`  ${colors.cyan}/quit${colors.reset}   - Exit the CLI`);
  console.log(`  ${colors.cyan}/clear${colors.reset}  - Clear the screen\n`);
}

async function readInput(prompt: string): Promise<string> {
  // Write prompt to stdout
  await Deno.stdout.write(new TextEncoder().encode(prompt));

  // Read line from stdin
  const buf = new Uint8Array(1024);
  const n = await Deno.stdin.read(buf);
  if (n === null) return "";

  return new TextDecoder().decode(buf.subarray(0, n)).trim();
}

async function handleQuery(userPrompt: string) {
  try {
    const result = query({
      prompt: userPrompt,
      options: {
        executable: "deno",
        executableArgs: ["--allow-all"],
        model: "claude-sonnet-4-20250514",
        permissionMode: "bypassPermissions",
        systemPrompt: {
          type: "preset",
          preset: "claude_code",
        },
      },
    });

    let sessionId = "";
    let assistantResponse = "";
    let isFirstMessage = true;

    // Stream and display messages
    for await (const message of result) {
      switch (message.type) {
        case "system":
          if (message.subtype === "init") {
            sessionId = message.session_id;
            if (isFirstMessage) {
              console.log(
                `${colors.dim}Session: ${sessionId.slice(0, 8)}...${colors.reset}\n`
              );
              isFirstMessage = false;
            }
          }
          break;

        case "assistant":
          // Collect assistant's text responses
          for (const block of message.message.content) {
            if (block.type === "text") {
              assistantResponse += block.text;
            }
          }
          break;

        case "result":
          if (message.subtype === "success") {
            // Print the complete response
            console.log(`${colors.bright}${colors.green}Claude:${colors.reset} ${assistantResponse}\n`);
            console.log(
              `${colors.dim}[${(message.duration_ms / 1000).toFixed(2)}s | $${message.total_cost_usd.toFixed(4)} | ${message.usage.input_tokens}→${message.usage.output_tokens} tokens]${colors.reset}\n`
            );
          } else {
            console.error(`${colors.red}✗ Query failed: ${message.subtype}${colors.reset}\n`);
          }
          break;
      }
    }
  } catch (error) {
    console.error(`${colors.red}Error: ${error.message}${colors.reset}\n`);
  }
}

async function main() {
  printWelcome();

  // Interactive REPL loop
  while (true) {
    const input = await readInput(`${colors.bright}${colors.blue}You:${colors.reset} `);

    // Handle empty input
    if (!input) {
      continue;
    }

    // Handle commands
    const command = input.toLowerCase().trim();

    if (command === "/exit" || command === "/quit") {
      console.log(`\n${colors.cyan}Goodbye! 👋${colors.reset}`);
      Deno.exit(0);
    } else if (command === "/help") {
      printHelp();
      continue;
    } else if (command === "/clear") {
      console.clear();
      printWelcome();
      continue;
    }

    // Process the query
    await handleQuery(input);
  }
}

// Run the main function
if (import.meta.main) {
  main();
}
