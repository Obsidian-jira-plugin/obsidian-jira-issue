---
sidebar_position: 3
---
# Basic authentication

Access the plugin options in `Settings > Jira Issue` to configure your Jira connection.

## Host & Web Base URL
- **Host:** The base API URL of your Jira instance (e.g., `https://mycompany.atlassian.net` or `https://jira.company.com`).
- **Web Base URL:** *(Optional)* Set this if your browser-facing URL differs from the internal API host (e.g., when behind a reverse proxy or VPN).

[Read more...](/docs/configuration/authentication#host)


## Authentication Types

The plugin supports four authentication modes:

- `Open`: Guest mode for public open source Jira instances
- `Basic Authentication`: Username and password for Jira Server / Jira Data Center
- `Jira Cloud`: Email address and Atlassian API Token for Jira Cloud
- `Bearer Token`: Personal Access Token (PAT) / OAuth2 Bearer token

[Read more...](/docs/configuration/authentication#authentication-types)

### Jira Cloud API Tokens

For Jira Cloud, enter your Atlassian account email as the **Email** and generate an API token from `Account Settings > Security > Create and manage API tokens` ([Official Documentation](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/)).

## Credential Storage & Security

Your passwords and tokens can be securely stored using:
1. **OS Keychain (SecretStorage):** Native OS keychain storage for desktop.
2. **Master Passphrase (AES-256-GCM):** Encrypted cross-device storage for synced vaults.

You can configure your preferred storage method in `Settings > Jira Issue > Security`.

[Read more...](/docs/configuration/authentication#security--credential-storage)
