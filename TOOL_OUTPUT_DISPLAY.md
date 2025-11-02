# Tool Output Display Implementation

## Summary

This document describes how tool outputs are captured and displayed in the CLI application, based on the Claude Agent SDK documentation and message flow analysis.

## Problem

Tool parameters were displaying correctly after implementing JSON buffer accumulation, but tool outputs were not showing in the terminal despite tools executing successfully.

## Root Cause Analysis

After reviewing the Claude Agent SDK documentation (`docs/typescript.md`), we identified that tool outputs can come through multiple channels:

1. **`tool_result` blocks in Assistant messages**: When the SDK executes tools and feeds results back to Claude, Claude may include these in subsequent assistant messages
2. **`tool_progress` events**: Real-time progress updates during tool execution
3. **User message `tool_result` blocks**: Tool execution results that are sent back to Claude (handled internally by SDK)

## Implementation

### 1. Tool Result Handler in Assistant Messages (main.ts:1633-1678)

Added comprehensive handling for `tool_result` blocks that appear in assistant message content:

```typescript
else if (block.type === "tool_result" && block.tool_use_id) {
  // Display tool result output
  const toolInfo = toolExecutions.get(block.tool_use_id);
  if (toolInfo) {
    let resultText = "";

    if (typeof block.content === "string") {
      resultText = block.content;
    } else if (Array.isArray(block.content)) {
      // Extract text from content blocks
      resultText = block.content
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text)
        .join("\n");
    }

    if (resultText && resultText.trim()) {
      const outputLabel = block.is_error
        ? brightRed("  Error:")
        : dim("  Output:");
      console.log(outputLabel + formatToolResult(resultText));
    }
  }
}
```

**Key features:**
- Handles both string and array content formats
- Distinguishes between errors and normal output
- Uses existing `formatToolResult()` for consistent formatting
- Links tool results to tool executions via `tool_use_id`

### 2. Enhanced Tool Progress Handler (main.ts:1680-1736)

Improved the `tool_progress` event handler to capture outputs from multiple possible field names:

```typescript
case "tool_progress": {
  const toolProgressMsg = message as {
    type: "tool_progress";
    subtype?: string;
    tool_use_id?: string;
    output?: string | unknown;
    result?: string | unknown;
    content?: string | Array<{ type: string; text?: string }>;
    [key: string]: unknown;
  };

  // Try multiple field names: output, result, content
  // Log available fields for debugging
  // Display using formatToolResult()
}
```

**Key features:**
- Checks multiple field names (`output`, `result`, `content`)
- Handles string, object, and array formats
- Enhanced debug logging shows available fields
- Gracefully handles missing or undefined outputs

### 3. Debug Logging Improvements (main.ts:1692-1696, 1727-1731, 1772-1776)

Added comprehensive logging to understand message flow:

```typescript
logger.debug(
  `tool_progress: ${toolProgressMsg.subtype} for ${toolProgressMsg.tool_use_id}, keys: ${
    Object.keys(toolProgressMsg).join(", ")
  }`,
);
```

**Benefits:**
- Helps diagnose missing outputs
- Shows actual message structure
- Only appears when log level is DEBUG
- Doesn't clutter normal output

## Message Flow

The actual flow of tool execution in the SDK:

```
1. User sends message
2. Claude responds with tool_use block
   ↓ [We display: ✔ ToolName with parameters]
3. SDK executes tool internally
   ↓ [tool_progress events MAY be sent]
4. SDK sends tool_result back to Claude (internal)
5. Claude processes result and responds
   ↓ [tool_result blocks MAY appear in assistant message]
6. Claude's text response includes findings
   ↓ [We display Claude's text response]
```

## Testing

To verify tool outputs are displaying:

1. **Enable debug logging:**
   ```bash
   export LOG_LEVEL=DEBUG
   deno task start
   ```

2. **Test with simple tool:**
   ```
   You: What files are in the current directory?
   ```

3. **Expected output:**
   ```
   ✔ Bash
     cmd: "ls", desc: "List directory contents"
     Output:
       main.ts
       deno.json
       ...

   Claude: The current directory contains...
   ```

4. **Check debug logs for:**
   - `tool_progress` events with available fields
   - `tool_result` blocks in assistant messages
   - Any unhandled message types

## Key Differences from Original Implementation

| Aspect | Before | After |
|--------|--------|-------|
| **Assistant message handling** | Only handled `text` and `tool_use` blocks | Now handles `tool_result` blocks |
| **tool_progress field names** | Only checked `output` field | Checks `output`, `result`, and `content` |
| **Content format support** | Only string | Handles string, object, and array formats |
| **Error handling** | No distinction | Displays errors in red vs normal output |
| **Debug logging** | Basic | Comprehensive with field listings |

## Future Improvements

If outputs still don't appear:

1. **Add message capture mode:** Save all raw messages to a file for analysis
2. **Hook into PostToolUse:** Use SDK hooks to capture tool outputs at execution time
3. **Stream event inspection:** Log all `stream_event` types to find outputs in real-time events
4. **SDK version check:** Verify tool output behavior in SDK CHANGELOG

## References

- `docs/typescript.md`: TypeScript SDK type definitions
- `docs/streaming-vs-single-mode.md`: Message flow documentation
- `docs/custom-tools.md`: Tool result format examples
- Lines 1633-1736 in `main.ts`: Implementation
