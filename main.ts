#!/usr/bin/env -S deno run --allow-all

import { query } from "@anthropic-ai/claude-agent-sdk";

/**
 * Minimal Claude Agent SDK example using Deno
 */
async function main() {
  console.log("Starting Claude Agent SDK with Deno...\n");

  try {
    // Create a query with minimal configuration
    const result = query({
      prompt: "What is 2 + 2? Just give me the answer.",
      options: {
        executable: "deno", // Explicitly use Deno runtime
        executableArgs: ["--allow-all"], // Pass permissions to Deno subprocess
        model: "claude-sonnet-4-20250514", // Latest Sonnet model
        permissionMode: "bypassPermissions", // Auto-approve all actions for demo
        systemPrompt: {
          type: "preset",
          preset: "claude_code", // Use Claude Code's system prompt
        },
        stderr: (data: string) => {
          // Log stderr from Claude Code process
          console.error("Claude Code stderr:", data);
        },
      },
    });

    // Stream and display messages as they arrive
    for await (const message of result) {
      switch (message.type) {
        case "system":
          if (message.subtype === "init") {
            console.log("✓ Session initialized");
            console.log(`  Model: ${message.model}`);
            console.log(`  Session ID: ${message.session_id}`);
            console.log(`  Tools available: ${message.tools.length}\n`);
          }
          break;

        case "assistant":
          // Display assistant's text responses
          for (const block of message.message.content) {
            if (block.type === "text") {
              console.log(`🤖 Claude: ${block.text}\n`);
            }
          }
          break;

        case "result":
          if (message.subtype === "success") {
            console.log("✓ Query completed successfully");
            console.log(`  Duration: ${(message.duration_ms / 1000).toFixed(2)}s`);
            console.log(`  Turns: ${message.num_turns}`);
            console.log(`  Cost: $${message.total_cost_usd.toFixed(4)}`);
            console.log(
              `  Tokens: ${message.usage.input_tokens} in, ${message.usage.output_tokens} out`
            );
          } else {
            console.error(`✗ Query failed: ${message.subtype}`);
          }
          break;
      }
    }
  } catch (error) {
    console.error("Error:", error.message);
    Deno.exit(1);
  }
}

// Run the main function
if (import.meta.main) {
  main();
}
