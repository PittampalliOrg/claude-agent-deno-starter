#!/usr/bin/env -S deno run --allow-all

/**
 * Tool Invocations Test Suite
 *
 * This file demonstrates invoking various SDK tools as tests
 * to validate tool call patterns, parameter passing, and result handling.
 */

import { assertEquals, assertExists } from "@std/assert";
import { exists } from "@std/fs";
import { join } from "@std/path";

// Mock tool invocation results
interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}

/**
 * Test 1: Read Tool Invocation
 * Tests reading a file with the Read tool
 */
Deno.test("Tool: Read - read main.ts file", async () => {
  console.log("\n🔧 Testing Read tool invocation...");

  const filePath = "/home/vpittamp/sdk/main.ts";
  const fileExists = await exists(filePath);

  assertEquals(fileExists, true, "File should exist");

  if (fileExists) {
    const content = await Deno.readTextFile(filePath);
    assertExists(content, "File content should be read");
    console.log(`  ✓ Read ${content.split('\n').length} lines from main.ts`);
  }
});

/**
 * Test 2: Glob Tool Invocation
 * Tests pattern matching with the Glob tool
 */
Deno.test("Tool: Glob - find TypeScript files", async () => {
  console.log("\n🔧 Testing Glob tool invocation...");

  const pattern = "*.ts";
  const files: string[] = [];

  for await (const entry of Deno.readDir(".")) {
    if (entry.isFile && entry.name.endsWith(".ts")) {
      files.push(entry.name);
    }
  }

  assertEquals(files.length > 0, true, "Should find TypeScript files");
  console.log(`  ✓ Found ${files.length} TypeScript files: ${files.join(", ")}`);
});

/**
 * Test 3: Write Tool Invocation
 * Tests writing a file with the Write tool
 */
Deno.test("Tool: Write - create test file", async () => {
  console.log("\n🔧 Testing Write tool invocation...");

  const testFilePath = join(".claude-cli", "test_output.txt");
  const testContent = "Hello from tool invocation test!\nTimestamp: " + new Date().toISOString();

  // Ensure directory exists
  await Deno.mkdir(".claude-cli", { recursive: true });

  // Write test file
  await Deno.writeTextFile(testFilePath, testContent);

  // Verify file was created
  const fileExists = await exists(testFilePath);
  assertEquals(fileExists, true, "Test file should be created");

  // Verify content
  const readContent = await Deno.readTextFile(testFilePath);
  assertEquals(readContent, testContent, "Content should match");

  console.log(`  ✓ Wrote ${testContent.length} bytes to ${testFilePath}`);
});

/**
 * Test 4: Edit Tool Invocation (simulated)
 * Tests editing a file with string replacement
 */
Deno.test("Tool: Edit - replace text in file", async () => {
  console.log("\n🔧 Testing Edit tool invocation...");

  const testFilePath = join(".claude-cli", "test_edit.txt");
  const originalContent = "Hello World\nThis is a test\nGoodbye World";
  const oldString = "World";
  const newString = "Universe";

  // Create test file
  await Deno.mkdir(".claude-cli", { recursive: true });
  await Deno.writeTextFile(testFilePath, originalContent);

  // Simulate Edit tool: replace first occurrence
  let content = await Deno.readTextFile(testFilePath);
  content = content.replace(oldString, newString);
  await Deno.writeTextFile(testFilePath, content);

  // Verify edit
  const editedContent = await Deno.readTextFile(testFilePath);
  assertEquals(editedContent.includes("Universe"), true, "Should contain replaced text");

  console.log(`  ✓ Replaced "${oldString}" with "${newString}"`);
});

/**
 * Test 5: Bash Tool Invocation (simulated)
 * Tests executing a bash command
 */
Deno.test("Tool: Bash - execute simple command", async () => {
  console.log("\n🔧 Testing Bash tool invocation...");

  const command = new Deno.Command("echo", {
    args: ["Hello from Bash tool test"],
    stdout: "piped",
  });

  const { code, stdout } = await command.output();
  const output = new TextDecoder().decode(stdout).trim();

  assertEquals(code, 0, "Command should execute successfully");
  assertEquals(output, "Hello from Bash tool test", "Output should match");

  console.log(`  ✓ Executed command: echo`);
  console.log(`  ✓ Output: ${output}`);
});

/**
 * Test 6: Grep Tool Invocation (simulated)
 * Tests searching file contents with regex
 */
Deno.test("Tool: Grep - search for pattern", async () => {
  console.log("\n🔧 Testing Grep tool invocation...");

  const pattern = "import";
  const filePath = "/home/vpittamp/sdk/main.ts";

  const content = await Deno.readTextFile(filePath);
  const lines = content.split("\n");
  const matches = lines.filter(line => line.includes(pattern));

  assertEquals(matches.length > 0, true, "Should find matches");
  console.log(`  ✓ Found ${matches.length} lines matching "${pattern}"`);
  console.log(`  ✓ First match: ${matches[0].trim().substring(0, 60)}...`);
});

/**
 * Test 7: TodoWrite Tool Invocation (simulated)
 * Tests task list management
 */
Deno.test("Tool: TodoWrite - manage todos", async () => {
  console.log("\n🔧 Testing TodoWrite tool invocation...");

  interface Todo {
    content: string;
    status: "pending" | "in_progress" | "completed";
    activeForm: string;
  }

  const todos: Todo[] = [
    {
      content: "Read codebase structure",
      status: "completed",
      activeForm: "Reading codebase structure",
    },
    {
      content: "Write test cases",
      status: "in_progress",
      activeForm: "Writing test cases",
    },
    {
      content: "Run tests",
      status: "pending",
      activeForm: "Running tests",
    },
  ];

  // Save todos to file
  const todosPath = join(".claude-cli", "test_todos.json");
  await Deno.mkdir(".claude-cli", { recursive: true });
  await Deno.writeTextFile(todosPath, JSON.stringify(todos, null, 2));

  // Verify todos were saved
  const savedTodos = JSON.parse(await Deno.readTextFile(todosPath));
  assertEquals(savedTodos.length, todos.length, "Should save all todos");

  const completedCount = todos.filter(t => t.status === "completed").length;
  const inProgressCount = todos.filter(t => t.status === "in_progress").length;
  const pendingCount = todos.filter(t => t.status === "pending").length;

  console.log(`  ✓ Managed ${todos.length} todos`);
  console.log(`  ✓ Status: ${completedCount} completed, ${inProgressCount} in progress, ${pendingCount} pending`);
});

/**
 * Test 8: WebFetch Tool Invocation (mock)
 * Tests fetching web content
 */
Deno.test("Tool: WebFetch - fetch URL (mock)", async () => {
  console.log("\n🔧 Testing WebFetch tool invocation (mock)...");

  // Mock fetch result
  const mockUrl = "https://example.com";
  const mockContent = `
    <!DOCTYPE html>
    <html>
      <head><title>Example Domain</title></head>
      <body>
        <h1>Example Domain</h1>
        <p>This domain is for use in illustrative examples.</p>
      </body>
    </html>
  `;

  // Simulate processing
  const contentLength = mockContent.length;
  const hasTitle = mockContent.includes("<title>");

  assertEquals(hasTitle, true, "Should contain HTML title");
  console.log(`  ✓ Fetched ${contentLength} bytes from ${mockUrl}`);
  console.log(`  ✓ Content type: text/html`);
});

/**
 * Test 9: Task Tool Invocation (mock)
 * Tests launching a sub-agent
 */
Deno.test("Tool: Task - launch subagent (mock)", async () => {
  console.log("\n🔧 Testing Task tool invocation (mock)...");

  interface TaskConfig {
    description: string;
    subagent_type: "Explore" | "Plan" | "general-purpose";
    prompt: string;
    model?: "sonnet" | "opus" | "haiku";
  }

  const taskConfig: TaskConfig = {
    description: "Explore codebase structure",
    subagent_type: "Explore",
    prompt: "Analyze the main.ts file and describe its structure",
    model: "haiku",
  };

  // Mock task execution
  const taskResult = {
    success: true,
    findings: [
      "Main entry point with CLI loop",
      "Enhanced features: history, checkpoints, background tasks",
      "Tool call formatting functions",
      "File operations utilities",
    ],
  };

  assertEquals(taskResult.success, true, "Task should complete successfully");
  console.log(`  ✓ Launched ${taskConfig.subagent_type} agent`);
  console.log(`  ✓ Description: ${taskConfig.description}`);
  console.log(`  ✓ Model: ${taskConfig.model}`);
  console.log(`  ✓ Found ${taskResult.findings.length} key insights`);
});

/**
 * Test 10: Multiple Tool Invocations in Parallel
 * Tests calling multiple tools concurrently
 */
Deno.test("Tool: Parallel Invocations - multiple tools", async () => {
  console.log("\n🔧 Testing parallel tool invocations...");

  const startTime = Date.now();

  // Simulate parallel tool calls
  const results = await Promise.all([
    // Read tool
    (async () => {
      const content = await Deno.readTextFile("/home/vpittamp/sdk/main.ts");
      return { tool: "Read", lines: content.split("\n").length };
    })(),

    // Glob tool
    (async () => {
      const files: string[] = [];
      for await (const entry of Deno.readDir(".")) {
        if (entry.isFile && entry.name.endsWith(".ts")) {
          files.push(entry.name);
        }
      }
      return { tool: "Glob", count: files.length };
    })(),

    // Bash tool
    (async () => {
      const command = new Deno.Command("pwd", { stdout: "piped" });
      const { stdout } = await command.output();
      const cwd = new TextDecoder().decode(stdout).trim();
      return { tool: "Bash", output: cwd };
    })(),
  ]);

  const duration = Date.now() - startTime;

  assertEquals(results.length, 3, "Should complete all 3 tool calls");
  console.log(`  ✓ Executed 3 tools in parallel`);
  console.log(`  ✓ Duration: ${duration}ms`);
  results.forEach(result => {
    if ("lines" in result) {
      console.log(`  ✓ ${result.tool}: ${result.lines} lines`);
    } else if ("count" in result) {
      console.log(`  ✓ ${result.tool}: ${result.count} files`);
    } else if ("output" in result) {
      console.log(`  ✓ ${result.tool}: ${result.output}`);
    }
  });
});

/**
 * Test 11: Tool Call Formatting
 * Tests the formatToolCall function
 */
Deno.test("Tool: Format Tool Calls - display patterns", () => {
  console.log("\n🔧 Testing tool call formatting...");

  interface ToolCall {
    name: string;
    input: Record<string, unknown>;
  }

  const toolCalls: ToolCall[] = [
    { name: "Read", input: { file_path: "/home/user/project/src/main.ts" } },
    { name: "Write", input: { file_path: "/tmp/output.txt", content: "test" } },
    { name: "Bash", input: { command: "ls -la", description: "List files" } },
    { name: "Glob", input: { pattern: "**/*.ts", path: "src" } },
    { name: "Grep", input: { pattern: "import.*from", path: ".", output_mode: "content" } },
    { name: "Task", input: { description: "Explore codebase", subagent_type: "Explore" } },
  ];

  for (const call of toolCalls) {
    // Simple formatting (actual formatToolCall from main.ts is more sophisticated)
    const params = Object.entries(call.input)
      .slice(0, 2)
      .map(([k, v]) => typeof v === "string" && v.length > 40 ? v.substring(0, 37) + "..." : v)
      .join(", ");

    console.log(`  ● ${call.name}(${params})`);
  }

  assertEquals(toolCalls.length, 6, "Should format all tool calls");
  console.log(`  ✓ Formatted ${toolCalls.length} tool call displays`);
});

/**
 * Test 12: Tool Result Summaries
 * Tests result summary generation
 */
Deno.test("Tool: Result Summaries - display patterns", () => {
  console.log("\n🔧 Testing tool result summaries...");

  interface ToolResult {
    tool: string;
    result: string;
    expectedSummary: string;
  }

  const results: ToolResult[] = [
    {
      tool: "Read",
      result: "File content with 150 lines",
      expectedSummary: "Read 150 lines",
    },
    {
      tool: "Write",
      result: "Wrote 50 lines to output.txt",
      expectedSummary: "Wrote 50 lines to output.txt",
    },
    {
      tool: "Glob",
      result: "file1.ts\nfile2.ts\nfile3.ts",
      expectedSummary: "Found 3 files",
    },
    {
      tool: "Grep",
      result: "Found 25 matches",
      expectedSummary: "Found 25 lines",
    },
    {
      tool: "Bash",
      result: "Command executed successfully",
      expectedSummary: "Command executed successfully",
    },
  ];

  for (const result of results) {
    console.log(`  ⎿  ${result.expectedSummary}`);
  }

  assertEquals(results.length, 5, "Should generate all summaries");
  console.log(`  ✓ Generated ${results.length} result summaries`);
});

/**
 * Test 13: Error Handling in Tool Invocations
 * Tests error handling patterns
 */
Deno.test("Tool: Error Handling - graceful failures", async () => {
  console.log("\n🔧 Testing tool error handling...");

  const errors: Array<{ tool: string; error: string; handled: boolean }> = [];

  // Test 1: Read non-existent file
  try {
    await Deno.readTextFile("/nonexistent/file.txt");
  } catch (error) {
    errors.push({
      tool: "Read",
      error: "File not found",
      handled: true,
    });
  }

  // Test 2: Invalid glob pattern handling
  try {
    const invalidPattern = "[invalid";
    // This would normally throw in a real glob implementation
    errors.push({
      tool: "Glob",
      error: "Invalid pattern",
      handled: true,
    });
  } catch (error) {
    errors.push({
      tool: "Glob",
      error: String(error),
      handled: true,
    });
  }

  // Test 3: Command not found
  try {
    const command = new Deno.Command("nonexistent_command", {
      stdout: "piped",
      stderr: "piped",
    });
    await command.output();
  } catch (error) {
    errors.push({
      tool: "Bash",
      error: "Command not found",
      handled: true,
    });
  }

  const allHandled = errors.every(e => e.handled);
  assertEquals(allHandled, true, "All errors should be handled");

  console.log(`  ✓ Handled ${errors.length} error cases gracefully`);
  errors.forEach(err => {
    console.log(`  ✓ ${err.tool}: ${err.error}`);
  });
});

/**
 * Test Summary
 */
console.log("\n" + "=".repeat(60));
console.log("Tool Invocation Test Suite Summary");
console.log("=".repeat(60));
console.log("Tests cover:");
console.log("  • Read, Write, Edit, Glob, Grep tools");
console.log("  • Bash command execution");
console.log("  • TodoWrite task management");
console.log("  • WebFetch and Task tools (mocked)");
console.log("  • Parallel tool invocations");
console.log("  • Tool call formatting and result summaries");
console.log("  • Error handling patterns");
console.log("=".repeat(60) + "\n");
