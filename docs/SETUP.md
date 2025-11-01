# Setup Guide

Complete setup guide for the Claude Agent SDK Deno example with Nix and direnv.

## Step-by-Step Setup

### 1. Install Nix

Install Nix with flakes support:

```bash
# Install Nix (multi-user installation recommended)
sh <(curl -L https://nixos.org/nix/install) --daemon

# Enable flakes
mkdir -p ~/.config/nix
echo "experimental-features = nix-command flakes" >> ~/.config/nix/nix.conf
```

### 2. Install direnv

Install and configure direnv:

```bash
# Option 1: Install via Nix
nix profile install nixpkgs#direnv

# Option 2: Install via package manager (Ubuntu/Debian)
sudo apt install direnv

# Option 3: Install via package manager (macOS)
brew install direnv
```

Hook direnv into your shell:

```bash
# For Bash
echo 'eval "$(direnv hook bash)"' >> ~/.bashrc
source ~/.bashrc

# For Zsh
echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc
source ~/.zshrc

# For Fish
echo 'direnv hook fish | source' >> ~/.config/fish/config.fish
source ~/.config/fish/config.fish
```

### 3. Set Up the Project

Navigate to the project directory:

```bash
cd /home/vpittamp/sdk
```

Allow direnv (this will download and install all dependencies):

```bash
direnv allow
```

You should see output like:
```
direnv: loading ~/sdk/.envrc
...
📦 Installing Claude Code CLI...
🦕 Deno version: deno 1.x.x
📗 Node.js version: v20.x.x
🤖 Claude Code CLI version: x.x.x
🚀 Development environment ready!
```

### 4. Configure API Key

**Option A: Using 1Password CLI (Recommended)**

Sign in to 1Password and create the API key item:

```bash
# Sign in to 1Password
eval $(op signin)

# Store your API key in 1Password
op item create \
  --category="API Credential" \
  --title="ANTHROPIC_API_KEY" \
  --vault="CLI" \
  credential="sk-ant-your-api-key-here"

# Reload direnv
direnv allow
```

See [1PASSWORD.md](1PASSWORD.md) for detailed instructions.

**Option B: Using Environment Variables**

Create your local environment file:

```bash
cp .envrc.local.example .envrc.local
```

Edit `.envrc.local` and add your API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Reload direnv:

```bash
direnv allow
```

### 5. Run the Application

```bash
deno task start
```

## Verification

Check that everything is set up correctly:

```bash
# Check Deno
deno --version

# Check Node.js
node --version

# Check 1Password CLI
op --version

# Check Claude Code CLI
claude --version

# Check API key (should be set if 1Password is configured)
echo $ANTHROPIC_API_KEY
```

## Troubleshooting

### direnv not loading

**Problem**: direnv doesn't automatically load when entering the directory

**Solution**: Make sure direnv is hooked into your shell:
```bash
# Add to your shell config
eval "$(direnv hook bash)"  # or zsh, fish
```

### API key not set

**Problem**: `ANTHROPIC_API_KEY not set` warning appears

**Solution**:
1. Create `.envrc.local` from the example
2. Add your API key
3. Run `direnv allow`

### Claude Code CLI not found

**Problem**: `claude: command not found`

**Solution**:
1. Exit and re-enter the directory
2. Or manually reload: `direnv reload`
3. Check `.npm-global/bin/` exists and is in PATH

### Nix flake errors

**Problem**: `error: experimental Nix feature 'flakes' is disabled`

**Solution**:
```bash
mkdir -p ~/.config/nix
echo "experimental-features = nix-command flakes" >> ~/.config/nix/nix.conf
```

### Permission denied errors

**Problem**: Cannot write to `.npm-global/`

**Solution**:
```bash
# Make sure you're in the project directory
mkdir -p .npm-global
chmod 755 .npm-global
```

## Uninstalling

To remove the development environment:

```bash
# Remove local npm packages
rm -rf .npm-global

# Remove direnv cache
rm -rf .direnv

# Nix garbage collection (removes unused packages)
nix-collect-garbage
```

## Alternative: Without Nix

If you prefer not to use Nix, you can install dependencies manually:

```bash
# Install Deno
curl -fsSL https://deno.land/install.sh | sh

# Install Node.js (use nvm, volta, or your package manager)

# Install Claude Code CLI
npm install -g @anthropic-ai/claude-code

# Set API key
export ANTHROPIC_API_KEY=your_key_here

# Run the app
deno task start
```

## Next Steps

See [README.md](./README.md) for usage instructions and examples.
