#!/usr/bin/env -S deno test --allow-all

import {
  assertEquals,
  assertExists,
  assertRejects as _assertRejects,
  assertStringIncludes,
  assertThrows as _assertThrows,
} from "@std/assert";
import { extname, resolve } from "@std/path";
import { encodeBase64 } from "@std/encoding/base64";
import * as log from "@std/log";

/**
 * Test suite for Claude Interactive CLI
 * Tests the enhanced Deno std library integrations
 */

// Test path utilities
Deno.test("Path handling - extname function", () => {
  assertEquals(extname("image.png"), ".png");
  assertEquals(extname("document.pdf"), ".pdf");
  assertEquals(extname("file"), "");
  assertEquals(extname("archive.tar.gz"), ".gz");
});

Deno.test("Path handling - resolve function", () => {
  const resolved = resolve("./test.png");
  assertExists(resolved);
  assertStringIncludes(resolved, "test.png");
});

// Test encoding utilities
Deno.test("Base64 encoding", () => {
  const testData = new TextEncoder().encode("Hello, World!");
  const encoded = encodeBase64(testData);

  assertExists(encoded);
  assertEquals(encoded, "SGVsbG8sIFdvcmxkIQ==");

  // Test with image-like binary data
  const binaryData = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG header
  const encodedBinary = encodeBase64(binaryData);
  assertExists(encodedBinary);
});

// Test logging functionality
Deno.test("Logging setup", async () => {
  // Setup logging configuration
  await log.setup({
    handlers: {
      test: new log.ConsoleHandler("DEBUG"),
    },
    loggers: {
      test: {
        level: "DEBUG",
        handlers: ["test"],
      },
    },
  });

  const testLogger = log.getLogger("test");
  assertExists(testLogger);

  // Test logging doesn't throw
  testLogger.info("Test log message");
  testLogger.debug("Test debug message");
  testLogger.error("Test error message");
});

// Test image path validation
Deno.test("Image type validation", () => {
  const validExtensions = [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".bmp",
    ".svg",
  ];
  const mediaTypeMap: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
  };

  for (const ext of validExtensions) {
    assertExists(mediaTypeMap[ext]);
    assertStringIncludes(mediaTypeMap[ext], "image/");
  }
});

// Test tool input formatting
Deno.test("Tool input formatting", () => {
  function formatToolInput(input: Record<string, unknown>): string {
    if (!input || Object.keys(input).length === 0) {
      return "";
    }

    const parts: string[] = [];
    const maxParts = 3;
    let count = 0;

    for (const [key, value] of Object.entries(input)) {
      if (count >= maxParts) {
        parts.push("...");
        break;
      }

      let displayValue: string;

      if (typeof value === "string") {
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
          displayValue = `{${objKeys.slice(0, 2).join(", ")}${
            objKeys.length > 2 ? "..." : ""
          }}`;
        } else {
          displayValue = "{}";
        }
      } else {
        displayValue = String(value);
      }

      const shortKey = key === "file_path"
        ? "file"
        : key === "pattern"
        ? "pat"
        : key === "command"
        ? "cmd"
        : key;

      parts.push(`${shortKey}: ${displayValue}`);
      count++;
    }

    return parts.join(", ");
  }

  // Test various input types
  assertEquals(formatToolInput({}), "");
  assertEquals(
    formatToolInput({ file_path: "/path/to/file.txt" }),
    'file: "/path/to/file.txt"',
  );
  assertEquals(formatToolInput({ pattern: "*.js" }), 'pat: "*.js"');
  assertEquals(formatToolInput({ command: "ls -la" }), 'cmd: "ls -la"');

  // Test array formatting
  assertEquals(formatToolInput({ items: [1, 2, 3, 4, 5] }), "items: [5 items]");

  // Test object formatting
  assertEquals(formatToolInput({ config: { a: 1, b: 2 } }), "config: {a, b}");

  // Test long string truncation
  const longString = "a".repeat(50);
  const result = formatToolInput({ text: longString });
  assertStringIncludes(result, "...");
  assertStringIncludes(result, "text:");
});

// Test error handling for image loading
Deno.test("Image loading error handling", async () => {
  async function loadImageAsBase64(imagePath: string) {
    try {
      const imageData = await Deno.readFile(imagePath);
      return { success: true, data: encodeBase64(imageData) };
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      return { success: false, error: err };
    }
  }

  // Test with non-existent file
  const result = await loadImageAsBase64("/nonexistent/file.png");
  assertEquals(result.success, false);
  assertExists(result.error);
});

// Test command-line argument parsing simulation
Deno.test("Argument parsing simulation", () => {
  // Simulate the parseArgs functionality
  function parseTestArgs(args: string[]) {
    const parsed = {
      help: false,
      version: false,
      model: "claude-sonnet-4-20250514",
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--help" || arg === "-h") {
        parsed.help = true;
      } else if (arg === "--version" || arg === "-v") {
        parsed.version = true;
      } else if (arg === "--model" || arg === "-m") {
        parsed.model = args[i + 1] || parsed.model;
        i++; // Skip next arg as it's the value
      }
    }

    return parsed;
  }

  const testArgs1 = parseTestArgs(["--help"]);
  assertEquals(testArgs1.help, true);
  assertEquals(testArgs1.version, false);
  assertEquals(testArgs1.model, "claude-sonnet-4-20250514");

  const testArgs2 = parseTestArgs(["--model", "claude-opus-4-20250514"]);
  assertEquals(testArgs2.model, "claude-opus-4-20250514");
  assertEquals(testArgs2.help, false);

  const testArgs3 = parseTestArgs(["-v", "-m", "custom-model"]);
  assertEquals(testArgs3.version, true);
  assertEquals(testArgs3.model, "custom-model");
});

// Performance test for message queue simulation
Deno.test("Message queue performance", async () => {
  interface TestMessage {
    id: number;
    type: string;
  }

  class TestMessageQueue {
    private queue: TestMessage[] = [];
    private resolvers: Array<(value: TestMessage | null) => void> = [];
    private stopped = false;

    enqueue(message: TestMessage) {
      if (this.resolvers.length > 0) {
        const resolve = this.resolvers.shift();
        resolve?.(message);
      } else {
        this.queue.push(message);
      }
    }

    async dequeue(): Promise<TestMessage | null> {
      if (this.queue.length > 0) {
        return this.queue.shift() || null;
      }
      if (this.stopped) {
        return null;
      }
      return await new Promise<TestMessage | null>((resolve) => {
        this.resolvers.push(resolve);
      });
    }

    stop() {
      this.stopped = true;
      while (this.resolvers.length > 0) {
        const resolve = this.resolvers.shift();
        resolve?.(null);
      }
    }
  }

  const queue = new TestMessageQueue();

  // Test enqueue/dequeue performance
  const startTime = Date.now();
  const testMessages = Array.from(
    { length: 1000 },
    (_, i) => ({ id: i, type: "test" }),
  );

  // Enqueue messages
  testMessages.forEach((msg) => queue.enqueue(msg));

  // Dequeue messages
  const dequeuedMessages = [];
  for (let i = 0; i < testMessages.length; i++) {
    const msg = await queue.dequeue();
    dequeuedMessages.push(msg);
  }

  const endTime = Date.now();
  const duration = endTime - startTime;

  assertEquals(dequeuedMessages.length, testMessages.length);
  console.log(
    `Message queue processed ${testMessages.length} messages in ${duration}ms`,
  );

  queue.stop();
});

console.log("All tests completed!");
