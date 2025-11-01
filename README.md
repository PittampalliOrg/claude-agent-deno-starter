# Documentation

This directory contains documentation for the Claude Agent SDK and related topics.

## Getting Started

- [SETUP.md](SETUP.md) - Complete setup guide for Nix, direnv, and the development environment
- [1PASSWORD.md](1PASSWORD.md) - 1Password CLI integration for secure API key management

## Claude Agent SDK Documentation

### Core Concepts
- [overview.md](overview.md) - SDK overview and core concepts
- [typescript.md](typescript.md) - Complete TypeScript SDK API reference

### Configuration & Customization
- [modifying-system-prompts.md](modifying-system-prompts.md) - How to customize system prompts
- [permissions.md](permissions.md) - Tool permissions and security
- [sessions.md](sessions.md) - Session management and persistence

### Advanced Features
- [custom-tools.md](custom-tools.md) - Creating custom tools
- [mcp.md](mcp.md) - Model Context Protocol integration
- [plugins.md](plugins.md) - Plugin system
- [skills.md](skills.md) - Agent skills
- [subagents.md](subagents.md) - Using specialized subagents
- [slash-commands.md](slash-commands.md) - Custom slash commands

### Operational Guides
- [hosting.md](hosting.md) - Deployment and hosting strategies
- [cost-tracking.md](cost-tracking.md) - Monitoring and optimizing costs
- [streaming-vs-single-mode.md](streaming-vs-single-mode.md) - Input modes explained
- [todo-tracking.md](todo-tracking.md) - Todo tracking features

## Quick Links

### Development
- [Main Application](../main.ts) - Example Deno application
- [Nix Flake](../flake.nix) - Development environment definition
- [direnv Config](../.envrc) - Environment loader configuration

### External Resources
- [Claude Agent SDK (Official)](https://docs.claude.com/en/api/agent-sdk/overview)
- [Anthropic Console](https://console.anthropic.com/)
- [Deno Documentation](https://deno.land/manual)
- [Nix Flakes](https://nixos.wiki/wiki/Flakes)
