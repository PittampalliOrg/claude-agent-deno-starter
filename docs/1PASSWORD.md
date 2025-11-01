# 1Password CLI Integration

This project is configured to retrieve the Anthropic API key from 1Password CLI using the `op://` reference format.

## Prerequisites

1. **1Password account** with a CLI vault
2. **1Password CLI** installed and configured

## Setup 1Password CLI

### Install 1Password CLI

The 1Password CLI (`op`) is included in the Nix flake, so it's automatically available when you enter the project directory.

If you need to install it outside of Nix:

```bash
# macOS
brew install --cask 1password-cli

# Linux (download from 1Password)
# Visit: https://developer.1password.com/docs/cli/get-started/

# Or use Nix globally
nix profile install nixpkgs#_1password
```

### Authenticate 1Password CLI

First-time setup:

```bash
# Sign in to your 1Password account
op account add

# Follow the prompts to authenticate
# You may need to use biometric authentication or your Secret Key
```

Subsequent authentications:

```bash
# Authenticate for the current session
eval $(op signin)

# Or use the desktop app integration (recommended)
# This allows automatic authentication via the 1Password desktop app
```

## Configure API Key in 1Password

### Option 1: Using 1Password App (Recommended)

1. Open 1Password desktop app
2. Create or navigate to vault named "CLI"
3. Create a new item:
   - **Title**: `ANTHROPIC_API_KEY`
   - **Type**: API Credential or Password
   - **Field name**: `credential`
   - **Value**: Your Anthropic API key (from https://console.anthropic.com/)

### Option 2: Using CLI

```bash
# Create the item directly via CLI
op item create \
  --category="API Credential" \
  --title="ANTHROPIC_API_KEY" \
  --vault="CLI" \
  credential="sk-ant-your-api-key-here"
```

### Verify the Reference

Test that the reference works:

```bash
op read "op://CLI/ANTHROPIC_API_KEY/credential"
```

This should output your API key.

## How It Works

The `.envrc` file automatically retrieves the API key using:

```bash
export ANTHROPIC_API_KEY=$(op read "op://CLI/ANTHROPIC_API_KEY/credential")
```

When you `cd` into the project directory:

1. direnv loads the Nix environment
2. 1Password CLI becomes available
3. The API key is retrieved from 1Password
4. It's set as an environment variable
5. The Deno app can use it without storing secrets in files

## Fallback to .envrc.local

If 1Password CLI is not available or fails, the system falls back to `.envrc.local`:

```bash
# Create fallback file
cp .envrc.local.example .envrc.local

# Add your API key manually
echo 'export ANTHROPIC_API_KEY=sk-ant-your-key' >> .envrc.local

# Reload direnv
direnv allow
```

## Benefits of Using 1Password CLI

✓ **No secrets in files**: API keys never stored in your repository
✓ **Centralized management**: Update keys in one place
✓ **Audit trail**: 1Password logs when secrets are accessed
✓ **Team sharing**: Share vault access without sharing raw keys
✓ **Rotation**: Easy to rotate keys without updating multiple files
✓ **Biometric auth**: Use Touch ID/Face ID for authentication

## Troubleshooting

### "op: command not found"

**Problem**: 1Password CLI is not in PATH

**Solution**:
```bash
# Make sure you're in the project directory
cd /home/vpittamp/sdk

# Reload direnv to get Nix environment
direnv allow
```

### "401 Unauthorized" or authentication errors

**Problem**: Not signed in to 1Password

**Solution**:
```bash
# Sign in to 1Password
eval $(op signin)

# Or enable desktop app integration
# Settings → Developer → CLI → Enable integration
```

### "Item not found"

**Problem**: The reference path is incorrect

**Solution**:
```bash
# List all items in CLI vault
op item list --vault CLI

# Verify the item exists with correct name
op item get "ANTHROPIC_API_KEY" --vault CLI

# Check the field name
op item get "ANTHROPIC_API_KEY" --vault CLI --fields label=credential
```

### API key not being set

**Problem**: 1Password retrieval failed but no error shown

**Solution**:
```bash
# Test the reference manually
op read "op://CLI/ANTHROPIC_API_KEY/credential"

# Check if ANTHROPIC_API_KEY is set
echo $ANTHROPIC_API_KEY

# Enable direnv logging
export DIRENV_LOG_FORMAT="$(direnv status)"
direnv allow
```

## Customizing the Reference

To use a different vault or item structure, edit `.envrc`:

```bash
# Different vault
export ANTHROPIC_API_KEY=$(op read "op://Personal/ANTHROPIC_API_KEY/credential")

# Different item name
export ANTHROPIC_API_KEY=$(op read "op://CLI/Claude-API-Key/password")

# Different field
export ANTHROPIC_API_KEY=$(op read "op://CLI/ANTHROPIC_API_KEY/api_key")
```

## Security Best Practices

1. **Never commit `.envrc.local`** - It's in `.gitignore`
2. **Use vault access controls** - Limit who can read the CLI vault
3. **Rotate keys regularly** - Update in 1Password, automatic everywhere
4. **Use desktop app integration** - Reduces need to enter master password
5. **Enable biometric unlock** - Faster and more secure than typing

## Alternative: Environment Variables

If you prefer not to use 1Password, you can still use traditional environment variables:

```bash
# Don't use 1Password, just use .envrc.local
cp .envrc.local.example .envrc.local
# Edit .envrc.local with your key
direnv allow
```

## References

- [1Password CLI Documentation](https://developer.1password.com/docs/cli/)
- [Secret References Guide](https://developer.1password.com/docs/cli/secret-references/)
- [CLI Integration Best Practices](https://developer.1password.com/docs/cli/secrets-automation/)
