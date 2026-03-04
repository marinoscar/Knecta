# Snowflake Key Pair Authentication Setup

This guide walks through generating an RSA key pair, registering the public key in Snowflake, and configuring the connection in Knecta.

---

## Overview

Snowflake is deprecating password-based authentication for human and service accounts. As of late 2025, Snowflake is enforcing multi-factor authentication (MFA) for interactive logins and recommends key pair authentication for all programmatic (server-to-server) access.

Key pair authentication offers several advantages over passwords for service accounts:

- **No MFA prompts** — tokens are signed locally, no interactive challenge required
- **No password expiry** — keys do not expire unless you choose to rotate them
- **Phishing-resistant** — private keys never leave the server and are never transmitted
- **Fine-grained rotation** — Snowflake supports two active public keys simultaneously, enabling zero-downtime rotation

For any connection from Knecta to Snowflake, key pair authentication is the recommended approach.

---

## Prerequisites

Before starting, ensure you have the following:

- **OpenSSL** installed on your workstation (version 1.1.1 or later)
  - macOS: `brew install openssl`
  - Debian/Ubuntu: `sudo apt-get install openssl`
  - Windows: OpenSSL is **not** included natively in PowerShell or CMD. Choose one of the following:
    - **Git Bash** (recommended) — installed automatically with [Git for Windows](https://git-scm.com/download/win). Open "Git Bash" from the Start menu and OpenSSL is available immediately.
    - **WSL (Windows Subsystem for Linux)** — see [Setting up WSL](#setting-up-wsl-windows-subsystem-for-linux) at the bottom of this guide for installation steps. Once installed, open a WSL terminal and run `sudo apt-get install openssl` if it is not already present.
    - **Win64 OpenSSL installer** — download the full installer from [slproweb.com/products/Win32OpenSSL.html](https://slproweb.com/products/Win32OpenSSL.html). After installation, add the `bin` directory to your PATH or use the full path to `openssl.exe`.
- A **Snowflake account** where you have the `ACCOUNTADMIN` or `SECURITYADMIN` role
- A **Snowflake user** to assign the key to

  > **Recommended:** Create a dedicated service account user with `TYPE = SERVICE`. Service users are excluded from MFA enforcement and cannot log in interactively, which is the correct security posture for programmatic access.

---

## Step 1: Generate the RSA Key Pair

Open a terminal and run the following commands.

### Windows terminal options

The commands below use standard OpenSSL syntax. Which terminal you use determines whether they work without modification:

- **Git Bash** — all commands work as-is. This is the easiest option on Windows.
- **WSL** — open WSL by typing `wsl` in PowerShell/CMD, or search for "Ubuntu" (or your installed distro) in the Start menu. All commands work as-is inside the WSL shell. The files are saved in the WSL filesystem (e.g., `~/rsa_key.p8`). To copy them to an accessible Windows folder afterwards, run:
  ```bash
  cp rsa_key.p8 /mnt/c/Users/<YourWindowsUsername>/Documents/
  cp rsa_key.pub /mnt/c/Users/<YourWindowsUsername>/Documents/
  ```
  See [Setting up WSL](#setting-up-wsl-windows-subsystem-for-linux) at the bottom of this guide if you have not installed WSL yet.
- **PowerShell with Win64 OpenSSL installed** — `openssl` is not on the PATH by default. Either add the install directory to your PATH first, or prefix each command with the full executable path:
  ```powershell
  # Add OpenSSL to PATH for the current PowerShell session
  $env:PATH += ";C:\Program Files\OpenSSL-Win64\bin"

  # Then run the same commands shown below
  openssl genrsa 2048 | openssl pkcs8 -topk8 -v2 aes-256-cbc -inform PEM -out rsa_key.p8
  ```

> **File paths on Windows:** Git Bash accepts forward slashes (`/`). PowerShell and CMD use backslashes (`\`). When pasting key file contents into Knecta, paste the file contents directly — not a file path.

### Option A: Encrypted private key (recommended)

An encrypted key requires a passphrase when it is loaded. This adds a layer of protection if the key file is ever accessed by an unauthorized party.

```bash
# Generate an encrypted PKCS#8 private key using AES-256-CBC
openssl genrsa 2048 | openssl pkcs8 -topk8 -v2 aes-256-cbc -inform PEM -out rsa_key.p8
```

You will be prompted to enter and confirm a passphrase. Store this passphrase securely — you will need it when configuring the connection in Knecta.

### Option B: Unencrypted private key

Use this only in environments where secret management infrastructure (e.g., a secrets manager or encrypted volume) provides equivalent protection.

```bash
# Generate an unencrypted PKCS#8 private key
openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -inform PEM -out rsa_key.p8
```

### Extract the public key

```bash
# Extract the public key from the private key file
openssl rsa -in rsa_key.p8 -pubout -out rsa_key.pub
```

You should now have two files:
- `rsa_key.p8` — the private key (keep this secret, never commit to version control)
- `rsa_key.pub` — the public key (safe to share with Snowflake)

---

## Step 2: Register the Public Key in Snowflake

1. Open the `rsa_key.pub` file and copy its contents.

   **Viewing the file on Windows:**
   - Git Bash: `cat rsa_key.pub`
   - PowerShell: `Get-Content rsa_key.pub`
   - CMD: `type rsa_key.pub`

2. Remove the header line (`-----BEGIN PUBLIC KEY-----`), the footer line (`-----END PUBLIC KEY-----`), and all newlines. You need the raw Base64 content as a single string.

   **Stripping headers on Windows with PowerShell:**
   ```powershell
   (Get-Content rsa_key.pub) -notmatch "BEGIN|END" -join ""
   ```
   This outputs the raw Base64 string you can paste directly into the SQL command below.

   Example of what to copy (truncated):
   ```
   MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2a3mTq...
   ```

3. Log in to Snowflake as a user with the `ACCOUNTADMIN` or `SECURITYADMIN` role and run:

```sql
-- Replace <username> with the Snowflake username
-- Replace the key value with your extracted public key content
ALTER USER <username> SET RSA_PUBLIC_KEY='MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2a3mTq...';
```

4. Verify the key was registered:

```sql
DESC USER <username>;
```

Look for the `RSA_PUBLIC_KEY_FP` property in the output. If it shows a SHA-256 fingerprint, the key was registered successfully.

---

## Step 3: Configure the Connection in Knecta

1. Navigate to **Connections** in the Knecta sidebar and click **Add Connection**.
2. Select **Snowflake** as the database type.
3. Under **Authentication Method**, select **Key Pair (Recommended)**.
4. Fill in the connection fields:

   | Field | Value |
   |---|---|
   | Account | Your Snowflake account identifier (e.g., `myorg-myaccount`) |
   | Username | The Snowflake user with the public key assigned |
   | Private Key | The full PEM content of `rsa_key.p8`, including the header and footer lines |
   | Private Key Passphrase | The passphrase you set in Step 1 (leave blank if unencrypted) |
   | Warehouse | The virtual warehouse to use for queries |
   | Role | The role to assume for this connection |
   | Database | The default database (optional) |
   | Schema | The default schema (optional) |

   > **Private Key format:** Paste the entire contents of `rsa_key.p8`, including the `-----BEGIN ENCRYPTED PRIVATE KEY-----` (or `-----BEGIN PRIVATE KEY-----`) and the matching `-----END` lines. Knecta accepts the full PEM block.

5. Click **Test Connection** to verify the credentials are valid. A successful test confirms the key pair is correctly configured end-to-end.
6. Click **Save** to store the connection.

The private key is encrypted at rest using AES-256-GCM before being stored in the database.

---

## Key Rotation (Zero-Downtime)

Snowflake allows two active public keys per user (`RSA_PUBLIC_KEY` and `RSA_PUBLIC_KEY_2`). Use this to rotate keys without any downtime.

### Rotation procedure

```sql
-- Step 1: Generate a new key pair (see Step 1 above) and register it as key 2
ALTER USER <username> SET RSA_PUBLIC_KEY_2='<new_public_key_content>';

-- Step 2: Update the connection in Knecta with the new private key
--         (Edit the connection, replace the Private Key field, test, save)

-- Step 3: After confirming the new key works, remove the old key
ALTER USER <username> UNSET RSA_PUBLIC_KEY;

-- Step 4: Optionally promote key 2 to key 1 (for clarity)
ALTER USER <username> SET RSA_PUBLIC_KEY='<new_public_key_content>';
ALTER USER <username> UNSET RSA_PUBLIC_KEY_2;
```

At no point is there a window where the connection is broken.

---

## Troubleshooting

### "JWT token is invalid"

This error means Snowflake rejected the JWT generated from the private key. Common causes:

- **Wrong user** — the `USERNAME` in the connection does not match the user who has the public key assigned.
- **Key mismatch** — the public key registered in Snowflake does not correspond to the private key in Knecta. Regenerate and re-register both.
- **Account identifier format** — Snowflake account identifiers use either the `orgname-accountname` format or the legacy `accountname.region.cloud` format. Check the exact format in your Snowflake account URL.

### "Incorrect public key"

- Open `rsa_key.pub` and confirm the content you registered does not include the header/footer lines.
- Re-run `DESC USER <username>` and confirm `RSA_PUBLIC_KEY_FP` is set.

### "Private key passphrase is incorrect"

- Verify the passphrase you entered in Knecta matches the one you used during key generation.
- If you have lost the passphrase, generate a new key pair from Step 1 and repeat the process.

### Clock skew

JWT-based authentication is time-sensitive. If the server running Knecta has a clock that is significantly out of sync (more than 30 seconds), Snowflake will reject the token. Ensure NTP is configured and the system clock is accurate.

---

## Appendix: Setting up WSL (Windows Subsystem for Linux)

WSL lets you run a full Linux terminal directly on Windows. If you prefer using WSL for key generation, follow these steps to install it.

### Requirements

- Windows 10 version 2004 or later, or Windows 11
- Administrator access (for the initial installation)

### Installation

1. **Open PowerShell as Administrator.** Right-click the Start button and select **Terminal (Admin)** or **Windows PowerShell (Admin)**.

2. **Install WSL and a default Linux distribution (Ubuntu):**

   ```powershell
   wsl --install
   ```

   This command enables the WSL feature, downloads the Linux kernel, and installs Ubuntu as the default distribution. If WSL is already enabled but no distro is installed, it will install Ubuntu.

3. **Restart your computer** when prompted.

4. **Complete the Ubuntu setup.** After restart, the Ubuntu terminal will open automatically (or search for "Ubuntu" in the Start menu). You will be asked to create a Linux username and password. These are local to WSL and do not need to match your Windows credentials.

5. **Verify the installation:**

   ```bash
   # Inside the WSL terminal
   openssl version
   ```

   You should see output like `OpenSSL 3.0.x ...`. If `openssl` is not found, install it:

   ```bash
   sudo apt-get update && sudo apt-get install -y openssl
   ```

### Opening a WSL terminal

After installation, you can open a WSL terminal in any of these ways:

- **Start menu:** Search for "Ubuntu" (or whichever distro you installed) and click it
- **PowerShell or CMD:** Type `wsl` and press Enter to drop into the Linux shell
- **Windows Terminal:** If you have Windows Terminal installed, a new "Ubuntu" profile appears in the dropdown — select it to open a WSL tab

### Accessing Windows files from WSL

Your Windows drives are mounted under `/mnt/` inside WSL:

| Windows path | WSL path |
|---|---|
| `C:\Users\oscar\Documents` | `/mnt/c/Users/oscar/Documents` |
| `D:\Projects` | `/mnt/d/Projects` |

To copy generated key files from WSL to your Windows Documents folder:

```bash
cp ~/rsa_key.p8 /mnt/c/Users/<YourWindowsUsername>/Documents/
cp ~/rsa_key.pub /mnt/c/Users/<YourWindowsUsername>/Documents/
```

### Installing a different Linux distribution (optional)

To see available distributions:

```powershell
wsl --list --online
```

To install a specific distribution (e.g., Debian):

```powershell
wsl --install -d Debian
```
