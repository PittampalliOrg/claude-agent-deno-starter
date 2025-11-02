# Tool Display Patterns (Claude Code Official Format)

## Format

```
● ToolName(key_param: value, key_param2: value)
  ⎿  One-line summary of result
```

## Patterns from User's Example

### Read Tool
```
● Read(docs/README.md)
  ⎿  Read 47 lines
```

### Bash Tool
```
● Bash(ls /home/vpittamp/sdk/docs/ | grep -i cli)
  ⎿  No matches found

● Bash(which claude || which claude-code || echo "Not in PATH")
  ⎿  /home/vpittamp/sdk/.npm-global/bin/claude

● Bash(echo "..." | /home/.../claude --print --cwd /home/vpittamp/sdk 2>&1 | head -80) timeout: 30s
  ⎿  error: unknown option '--cwd'
```

### Grep/Search Tool
```
● Search(pattern: "tool.*output|tool.*display|tool.*result", path: "docs", output_mode: "content")
  ⎿  Found 0 lines
```

### Web Search Tool
```
● Web Search("Claude Code CLI tool output display behavior 2025")
  ⎿  Did 1 search in 21s
```

### WebFetch Tool
```
● Fetch(https://docs.claude.com/en/docs/claude-code/cli-reference)
  ⎿  Received 1.5MB (200 OK)

● Fetch(https://docs.claude.com/en/docs/claude-code/common-workflows)
  ⎿  Received 2MB (200 OK)
```

## Display Rules

### Parameter Display
- Show only **key parameters** inline, not all JSON
- Use natural format: `ToolName(param: value, param2: value)`
- For paths: show relative or basename if reasonable
- For long values: truncate with ellipsis
- For commands: show full command text

### Output Summary Rules

#### Read Tool
- Format: `Read {N} lines`
- Example: `Read 47 lines`, `Read 1,234 lines`

#### Write Tool
- Format: `Wrote {N} bytes to {file}`
- Example: `Wrote 523 bytes to test.txt`

#### Edit Tool
- Format: `Made {N} replacement(s) in {file}`
- Example: `Made 3 replacements in main.ts`

#### Bash Tool
- If empty: `No output`
- If error: show error message directly
- If short (< 60 chars): show output directly
- If long: `Output: {N} lines` or show first line + `...`
- If no matches from grep: `No matches found`

#### Glob Tool
- Format: `Found {N} files` or `Found {N} matches`
- Example: `Found 18 files`

#### Grep Tool
- Format: `Found {N} lines` or `Found {N} matches in {M} files`
- Example: `Found 0 lines`, `Found 23 matches in 5 files`

#### WebSearch Tool
- Format: `Did {N} search(es) in {time}`
- Example: `Did 1 search in 21s`

#### WebFetch Tool
- Format: `Received {size} ({status})`
- Example: `Received 1.5MB (200 OK)`, `Received 2MB (200 OK)`

#### Task/Subagent Tool
- Format: `Completed in {time}` or show brief result
- Example: `Completed in 5.2s`

#### TodoWrite Tool
- Format: `Updated {N} todos`
- Example: `Updated 8 todos`

## Implementation Notes

### No Streaming Display
- **DO NOT** stream JSON fragments
- **DO NOT** show spinners during execution
- Display complete tool call AFTER execution finishes

### Timing
- Show execution time for long-running tools (>1s)
- Format: "in {N}s" or "in {N}m {N}s"

### Colors
- `●` - Use cyan or default color
- Tool name - Use bold
- Parameters - Use default color
- `⎿` - Use dim/gray color
- Summary - Use default color
- Errors - Use red

### Display Flow
```
[Claude is thinking...]

● Read(docs/README.md)
  ⎿  Read 47 lines

● Bash(ls docs/ | wc -l)
  ⎿  18

Claude: Based on the files I found...
[rest of Claude's response streams in]
```

## Character Reference
- Bullet: `●` (U+25CF BLACK CIRCLE)
- Corner: `⎿` (U+23BF BOTTOM RIGHT CORNER)
- Indentation: 2 spaces
