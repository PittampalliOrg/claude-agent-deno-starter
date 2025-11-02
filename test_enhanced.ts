#!/usr/bin/env -S deno run --allow-all

import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import { ensureDir, exists } from "@std/fs";
import { join } from "@std/path";
import { unicodeWidth } from "@std/cli/unicode-width";
import { retry } from "@std/async/retry";
import { pooledMap } from "@std/async/pool";
import { parse as parseYaml, stringify as stringifyYaml } from "@std/yaml";
import { parse as parseToml, stringify as stringifyToml } from "@std/toml";
import {
  bgGreen,
  bgRed,
  bgYellow,
  bold,
  cyan,
  dim,
  rgb24,
  white,
} from "@std/fmt/colors";

/**
 * Comprehensive test suite for enhanced Claude CLI features
 * Tests all new Deno std library integrations
 */

async function testFileOperations() {
  console.log("Testing enhanced file operations...");

  // Test directory structure
  const testDir = "./test-workspace";
  await ensureDir(testDir);

  // Test file creation
  const testFile = join(testDir, "test.txt");
  await Deno.writeTextFile(testFile, "Hello, enhanced Claude CLI!");

  const fileExists = await exists(testFile);
  assertEquals(fileExists, true, "Test file should exist");

  console.log("✓ File operations test passed");

  // Cleanup
  await Deno.remove(testDir, { recursive: true });
}

async function testDirectoryStructure() {
  console.log("Testing checkpoint directory structure...");

  // Test checkpoint directories
  const claudeDir = "./.claude-cli";
  const historyDir = join(claudeDir, "history");
  const checkpointDir = join(claudeDir, "checkpoints");

  await ensureDir(historyDir);
  await ensureDir(checkpointDir);

  const historyExists = await exists(historyDir);
  const checkpointExists = await exists(checkpointDir);

  assertEquals(historyExists, true, "History directory should exist");
  assertEquals(checkpointExists, true, "Checkpoint directory should exist");

  console.log("✓ Directory structure test passed");
}

async function testFeatureAvailability() {
  console.log("Testing feature imports...");

  // Test that all new imports work
  const { ProgressBar } = await import("@std/cli/progress-bar");
  const { promptSecret } = await import("@std/cli/prompt-secret");
  const { copy, exists: fsExists } = await import("@std/fs");

  assertExists(ProgressBar, "ProgressBar should be imported");
  assertExists(promptSecret, "promptSecret should be imported");
  assertExists(copy, "copy should be imported");
  assertExists(fsExists, "exists should be imported");

  console.log("✓ Feature availability test passed");
}

function testUnicodeWidth() {
  console.log("Testing unicode width calculations...");

  // Test ASCII
  assertEquals(unicodeWidth("Hello"), 5);

  // Test emoji and CJK
  const emojiWidth = unicodeWidth("🎉");
  const cjkWidth = unicodeWidth("你好");

  assertExists(emojiWidth);
  assertExists(cjkWidth);
  assertEquals(cjkWidth >= 4, true); // CJK chars are typically double-width

  console.log("✓ Unicode width test passed");
}

function testBadges() {
  console.log("Testing status badge helpers...");

  const successBadge = bgGreen(bold(white(" ✔ SUCCESS "))) +
    " Operation completed";
  const errorBadge = bgRed(bold(white(" ✖ ERROR "))) + " Something failed";
  const warningBadge = bgYellow(bold(white(" ⚠ WARNING "))) + " Be careful";

  assertStringIncludes(successBadge, "SUCCESS");
  assertStringIncludes(errorBadge, "ERROR");
  assertStringIncludes(warningBadge, "WARNING");

  // Test RGB custom badge
  const customBadge = rgb24(" CUSTOM ", { r: 138, g: 43, b: 226 });
  assertExists(customBadge);

  console.log("✓ Status badges test passed");
}

async function testAsyncRetry() {
  console.log("Testing async retry functionality...");

  let attempts = 0;
  const operation = () => {
    attempts++;
    if (attempts < 2) {
      throw new Error("Not ready");
    }
    return Promise.resolve("success");
  };

  const result = await retry(operation, {
    maxAttempts: 3,
    minTimeout: 10,
    maxTimeout: 100,
  });

  assertEquals(result, "success");
  assertEquals(attempts, 2);

  console.log("✓ Async retry test passed");
}

async function testPooledMap() {
  console.log("Testing concurrent processing with pooledMap...");

  const items = [1, 2, 3, 4, 5];
  const results: number[] = [];

  const processor = async (item: number) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return item * 2;
  };

  for await (const result of pooledMap(2, items, processor)) {
    results.push(result);
  }

  assertEquals(results.length, 5);
  assertEquals(results.sort((a, b) => a - b), [2, 4, 6, 8, 10]);

  console.log("✓ PooledMap test passed");
}

function testYAMLConfig() {
  console.log("Testing YAML configuration...");

  const config = {
    model: "claude-sonnet-4-20250514",
    maxHistory: 1000,
    theme: {
      primaryColor: "blue",
    },
  };

  const yamlString = stringifyYaml(config);
  const parsed = parseYaml(yamlString) as Record<string, unknown>;

  assertEquals(parsed.model, config.model);
  assertEquals(parsed.maxHistory, config.maxHistory);
  assertExists(parsed.theme);

  console.log("✓ YAML config test passed");
}

function testTOMLConfig() {
  console.log("Testing TOML configuration...");

  const config = {
    model: "claude-opus-4-20250514",
    maxHistory: 500,
    logLevel: "DEBUG",
  };

  const tomlString = stringifyToml(config);
  const parsed = parseToml(tomlString);

  assertEquals(parsed.model, config.model);
  assertEquals(parsed.maxHistory, config.maxHistory);

  console.log("✓ TOML config test passed");
}

function testTextFormatting() {
  console.log("Testing text formatting utilities...");

  // Test padding
  const padToWidth = (text: string, targetWidth: number): string => {
    const currentWidth = unicodeWidth(text);
    if (currentWidth >= targetWidth) return text;
    return text + " ".repeat(targetWidth - currentWidth);
  };

  const padded = padToWidth("Hello", 10);
  assertEquals(unicodeWidth(padded), 10);

  // Test truncation
  const truncateToWidth = (text: string, maxWidth: number): string => {
    const currentWidth = unicodeWidth(text);
    if (currentWidth <= maxWidth) return text;

    let truncated = "";
    let width = 0;
    for (const char of text) {
      const charWidth = unicodeWidth(char);
      if (width + charWidth > maxWidth - 3) break;
      truncated += char;
      width += charWidth;
    }
    return truncated + "...";
  };

  const longText = "This is a very long text that needs truncation";
  const truncated = truncateToWidth(longText, 20);
  assertEquals(unicodeWidth(truncated) <= 20, true);
  assertStringIncludes(truncated, "...");

  console.log("✓ Text formatting test passed");
}

function testColorUtilities() {
  console.log("Testing color utilities...");

  // Test various color combinations
  const styledText = bold(cyan("Test"));
  const dimText = dim("Dimmed");
  const rgbText = rgb24("RGB", { r: 255, g: 100, b: 50 });

  assertExists(styledText);
  assertExists(dimText);
  assertExists(rgbText);
  assertStringIncludes(rgbText, "RGB");

  console.log("✓ Color utilities test passed");
}

function testConfigMerging() {
  console.log("Testing config merging...");

  const defaults = {
    model: "default-model",
    maxHistory: 100,
    theme: "dark",
  };

  const userConfig = {
    model: "user-model",
    theme: "light",
  };

  const merged = { ...defaults, ...userConfig };

  assertEquals(merged.model, "user-model");
  assertEquals(merged.maxHistory, 100);
  assertEquals(merged.theme, "light");

  console.log("✓ Config merging test passed");
}

async function runTests() {
  console.log(bold(cyan("╔═══════════════════════════════════════════════╗")));
  console.log(bold(cyan("║     Enhanced Claude CLI Test Suite           ║")));
  console.log(bold(cyan("╚═══════════════════════════════════════════════╝")));
  console.log();

  try {
    // Core feature tests
    await testFeatureAvailability();
    await testDirectoryStructure();
    await testFileOperations();

    // New feature tests
    testUnicodeWidth();
    testBadges();
    await testAsyncRetry();
    await testPooledMap();
    testYAMLConfig();
    testTOMLConfig();
    testTextFormatting();
    testColorUtilities();
    testConfigMerging();

    console.log();
    console.log(bgGreen(bold(white(" ✔ ALL TESTS PASSED "))) + "\n");
    console.log(dim("Enhanced features tested:"));
    console.log(dim("  ✓ Unicode width calculation and formatting"));
    console.log(dim("  ✓ Status badges with RGB colors"));
    console.log(dim("  ✓ Async retry with exponential backoff"));
    console.log(dim("  ✓ Concurrent processing with pooledMap"));
    console.log(dim("  ✓ YAML configuration parsing"));
    console.log(dim("  ✓ TOML configuration parsing"));
    console.log(dim("  ✓ Config merging and defaults"));
    console.log(dim("  ✓ Color and formatting utilities"));
    console.log(dim("  ✓ Text truncation and padding"));
    console.log();
    console.log(bold("New CLI features available:"));
    console.log(cyan("  • Command history with search (/history)"));
    console.log(cyan("  • Checkpointing system (/checkpoint)"));
    console.log(cyan("  • Progress bars for long operations"));
    console.log(cyan("  • Background task management (/tasks)"));
    console.log(cyan("  • Enhanced error handling (/errors)"));
    console.log(cyan("  • YAML/TOML config support (/config)"));
    console.log(cyan("  • Feature demonstration (/demo)"));
    console.log(cyan("  • Unicode-aware text formatting"));
    console.log(cyan("  • Async retry and concurrency control"));
    console.log();
  } catch (error) {
    console.error(bgRed(bold(white(" ✖ TEST FAILED "))) + "\n");
    console.error("Error:", error);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await runTests();
}
