# Claude Interactive CLI (Deno)

An interactive command-line interface for Claude using the Claude Agent SDK with Deno, Nix, and 1Password integration.

## Prerequisites

Only these tools are required - all other dependencies are managed by Nix:

1. **Nix** with flakes enabled
2. **direnv** for automatic environment loading

See [docs/SETUP.md](docs/SETUP.md) for detailed installation instructions.

## Setup

1. Clone or navigate to this directory and allow direnv:
   ```bash
   cd /path/to/sdk
   direnv allow
   ```

   This will:
   - Install Deno, Node.js, 1Password CLI, and other dependencies via Nix
   - Install Claude Code CLI to `.npm-global/`
   - Set up the development environment automatically

2. Set your Anthropic API key:

   **Option A:** Retrieve from 1Password and store in `.envrc.local`:
   ```bash
   # Get your API key from 1Password
   API_KEY=$(op read "op://CLI/ANTHROPIC_API_KEY/credential")

   # Store it in .envrc.local
   cat > .envrc.local << EOF
   export ANTHROPIC_API_KEY=$API_KEY
   EOF

   # Reload direnv
   direnv allow
   ```

   **Option B:** Set directly in `.envrc.local`:
   ```bash
   cat > .envrc.local << 'EOF'
   export ANTHROPIC_API_KEY=sk-ant-your-api-key-here
   EOF

   direnv allow
   ```

3. Get your API key from the [Anthropic Console](https://console.anthropic.com/)

## Running the Interactive CLI

```bash
deno task start
```

### Command-Line Options

The CLI supports several command-line arguments:

```bash
# Show help
deno task start -- --help

# Show version information
deno task start -- --version

# Specify a different model
deno task start -- --model claude-opus-4-20250514
```

**Available options:**
- `-h, --help` - Show help message and exit
- `-v, --version` - Show version information and exit
- `-m, --model MODEL` - Specify Claude model (default: claude-sonnet-4-20250514)

**Available models:**
- `claude-sonnet-4-20250514` (default) - Balanced performance and speed
- `claude-opus-4-20250514` - Most capable model
- `claude-haiku-4-20250514` - Fastest model

### Interactive Commands

Once the CLI is running, you can use these commands:

- **Type any message** - Chat with Claude
- `/help` - Show available commands
- `/clear` - Clear the screen
- `/image <path>` - Attach an image to your next message
- `/exit` or `/quit` - Exit the CLI

### Example Session

```
╔═══════════════════════════════════════════════╗
║   Claude Interactive CLI (Streaming Mode)    ║
╚═══════════════════════════════════════════════╝
Type your message and press Enter to chat with Claude.
Commands: /exit, /quit, /help, /clear, /image

You: List files in this directory
Session: acdf0652... [Streaming Mode]

Claude: I'll list the files in the current directory for you.
⠋ Bash  ← Animated spinner while tool executes
✓ Bash  ← Green checkmark when complete
Claude: Here are the files and directories:
- deno.json - Configuration file
- main.ts - Main application
- README.md - Documentation
...
[5.23s | $0.0042 | 9→256 tokens]

You: /exit

Goodbye!
```

## How It Works

### Nix Flake (`flake.nix`)
- Provides Deno, Node.js 20, 1Password CLI, and development tools
- Creates isolated environment with pinned versions
- Automatically installs Claude Code CLI on first run

### direnv (`.envrc`)
- Automatically loads the Nix environment when you `cd` into the directory
- Loads `.envrc.local` for API keys (gitignored)
- Sets up npm global path for Claude Code CLI

### Benefits
- ✓ **Interactive REPL**: Chat with Claude in real-time
- ✓ **Reproducible**: Same versions across all machines
- ✓ **Isolated**: Dependencies don't conflict with system packages
- ✓ **Automatic**: Environment loads/unloads when entering/leaving directory
- ✓ **No global installs**: Everything is project-local
- ✓ **Secure secrets**: API keys managed securely

## Features

The interactive CLI includes:
- **Streaming Input Mode**: Advanced message queue with AsyncGenerator for continuous conversations
- **Image Support**: Attach images to messages using the `/image` command with base64 encoding
- **Real-time Streaming**: Partial message streaming with `includePartialMessages` for live responses
- **Session Management**: Persistent session tracking across multiple message turns
- **Deno std/fmt Colors**: Professional terminal colors using `@std/fmt/colors` module
- **Tool Execution Spinners**: Animated spinners show real-time tool execution progress
- **Tool Status Indicators**: Green checkmarks (✓) display when tools complete successfully
- **Smart Parameter Display**: Intelligent tool parameter formatting with truncation
- **Command-line Arguments**: Support for `--help`, `--version`, and `--model` flags
- **Cost Tracking**: Display duration, cost, and token usage for each interaction
- **Graceful EOF Handling**: Properly handles piped input and interactive mode

## Configuration

The application uses streaming input mode with all default Claude Code tools enabled:

```typescript
const result = query({
  prompt: messageQueue.generate(),  // AsyncGenerator for streaming input
  options: {
    executable: "deno",              // Use Deno runtime
    executableArgs: ["--allow-all"], // Pass permissions
    model: "claude-sonnet-4-20250514", // Latest Sonnet
    permissionMode: "bypassPermissions", // Auto-approve all tools
    systemPrompt: {
      type: "preset",
      preset: "claude_code"          // Use Claude Code prompt
    },
    // All default Claude Code tools enabled
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
    includePartialMessages: true     // Enable real-time streaming
  }
});
```

### Available Tools

The CLI has access to all 16 default Claude Code tools:

**File Operations:**
- `Read` - Read files, images, PDFs, and Jupyter notebooks
- `Write` - Create or overwrite files
- `Edit` - Edit files with exact string replacement
- `Glob` - Find files using glob patterns
- `Grep` - Search file contents with regex

**Execution:**
- `Bash` - Execute shell commands
- `BashOutput` - Monitor background shell output
- `KillShell` - Terminate background processes

**Advanced:**
- `Task` - Launch specialized subagents for complex tasks
- `NotebookEdit` - Edit Jupyter notebook cells
- `WebFetch` - Fetch and analyze web pages
- `WebSearch` - Search the web
- `TodoWrite` - Manage task lists
- `ExitPlanMode` - Exit planning mode
- `ListMcpResources` - List MCP server resources
- `ReadMcpResource` - Read MCP resources

### Permission Configuration

The application uses `permissionMode: "bypassPermissions"` to automatically approve all tool usage without prompts. This is ideal for:
- Development environments
- Trusted automation scripts
- Rapid prototyping

**Note:** For production use or untrusted environments, consider using:
- `permissionMode: "default"` with a `canUseTool` callback for manual approval
- `permissionMode: "acceptEdits"` to auto-approve only file edits
- Custom permission rules via hooks

## Project Structure

```
.
├── flake.nix              # Nix flake for dependencies
├── .envrc                 # direnv configuration
├── .envrc.local.example   # Example environment variables
├── deno.json              # Deno configuration and tasks
├── main.ts                # Interactive CLI application
├── .gitignore             # Git ignore rules
└── docs/                  # All documentation
    ├── README.md          # Documentation index
    ├── SETUP.md           # Detailed setup guide
    ├── 1PASSWORD.md       # 1Password integration guide
    └── ... (SDK docs)
```

## Troubleshooting

### API key not set

If you see "ANTHROPIC_API_KEY not set" warnings:

1. Make sure you created `.envrc.local`
2. Check that it exports the API key: `cat .envrc.local`
3. Reload direnv: `direnv allow`
4. Verify: `echo $ANTHROPIC_API_KEY`

### Claude Code CLI not found

If you get "claude: command not found":

1. Exit and re-enter the directory
2. Or manually reload: `direnv reload`
3. Check `.npm-global/bin/` exists and is in PATH

### Permission errors

If you get permission errors when running:

1. Make sure you're using `deno task start` (includes `--allow-all`)
2. Or run directly: `deno run --allow-all main.ts`

## Next Steps

- Modify the prompt in `main.ts` to customize behavior
- Explore other permission modes: `default`, `acceptEdits`, `plan`
- Add custom tools with MCP servers
- Implement custom system prompts
- Add conversation history persistence

## Documentation

### Local Documentation
- [docs/SETUP.md](docs/SETUP.md) - Detailed setup guide
- [docs/1PASSWORD.md](docs/1PASSWORD.md) - 1Password CLI integration
- [docs/overview.md](docs/overview.md) - SDK overview
- [docs/typescript.md](docs/typescript.md) - TypeScript SDK reference
- [docs/hosting.md](docs/hosting.md) - Hosting and deployment guide

### Official Documentation
- [Claude Agent SDK Overview](https://docs.claude.com/en/api/agent-sdk/overview)
- [TypeScript SDK Reference](https://docs.claude.com/en/api/agent-sdk/typescript)
- [Deno Documentation](https://deno.land/manual)
