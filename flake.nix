{
  description = "Claude Agent SDK with Deno development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Runtime dependencies
            deno
            nodejs_20

            # Development tools
            direnv
            git
            _1password  # 1Password CLI for secrets management
          ];

          shellHook = ''
            # Install Claude Code CLI globally in local node_modules
            export NPM_CONFIG_PREFIX=$PWD/.npm-global
            export PATH=$PWD/.npm-global/bin:$PATH

            # Create npm global directory if it doesn't exist
            mkdir -p .npm-global

            # Check if claude-code is installed, if not install it
            if [ ! -f ".npm-global/bin/claude" ]; then
              echo "📦 Installing Claude Code CLI..."
              npm install -g @anthropic-ai/claude-code
            fi

            # Display versions
            echo "🦕 Deno version: $(deno --version | head -n 1)"
            echo "📗 Node.js version: $(node --version)"
            echo "🤖 Claude Code CLI version: $(claude --version 2>/dev/null || echo 'installing...')"
            echo ""

            # Check for API key
            if [ -z "$ANTHROPIC_API_KEY" ]; then
              echo "⚠️  ANTHROPIC_API_KEY not set"
              echo "   Add it to .envrc.local or export it manually"
              echo ""
            else
              echo "✓ ANTHROPIC_API_KEY is set"
              echo ""
            fi

            echo "🚀 Development environment ready!"
            echo "   Run: deno task start"
          '';
        };
      }
    );
}
