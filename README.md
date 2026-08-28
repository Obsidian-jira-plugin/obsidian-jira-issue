# Obsidian jira-issue
![Test Status](https://github.com/Obsidian-jira-plugin/obsidian-jira-issue/actions/workflows/ci.yaml/badge.svg)

> ### 📢 Maintenance & Acknowledgement
> This plugin was originally created and maintained by [**@marc0l92 (Marc)**](https://github.com/marc0l92), to whom the entire community is deeply grateful for his dedication and foundational work.
> 
> It is now actively maintained and updated by the **[Obsidian-jira-plugin](https://github.com/Obsidian-jira-plugin)** community team.

This plugin allows you to track the progress of [Atlassian Jira](https://www.atlassian.com/software/jira) issues from your [Obsidian.md](https://obsidian.md/) notes.

## 🚀 Fork enhancements

> **This fork adds Android compatibility, safer credentials, flexible Jira links, animated overflow for issue tags, configurable Render Styles, and robust Epic Link/Parent alias resolution.**

- Jira responses containing valid JSON are accepted on Android even when the `Content-Type` response header is missing or uses different casing.
- Jira passwords and API tokens can be moved out of plain-text configuration into Obsidian secure storage, or encrypted with an AES-GCM master passphrase for cross-platform vault synchronization. Existing configurations remain in plain text until the storage method is changed explicitly.
- Each account can define an optional **Web Base URL** when its browser-facing Jira address differs from the API host.
- Long issue summaries and statuses stay compact and automatically scroll to reveal their complete text in inline issues, `jira-issue` blocks, and list search results.
- **Render Style Selector:** Switch dynamically between **Modern** (Obsidian-native pastel status badges and borders) and **Classic** (legacy Bulma tags) from `Settings > Jira Issue > Render style` with instant live workspace re-rendering.
- **Epic Link & Parent Aliases:** Custom field columns `$Epic Link`, `$Epic Name`, `$Parent`, and `$Parent Link` in `jira-search` queries automatically fall back to Jira's modern `parent` / `epic` API objects, preserving compatibility with both legacy Jira Server and modern Jira Cloud instances.
- Maximum widths are configurable from `Settings > Jira Issue > Rendering` and default to `20rem` for summaries and `2rem` for statuses.
- Animations are only enabled when text actually overflows and respect the operating system's reduced-motion preference.

<a href='https://ko-fi.com/marc0l92' target='_blank'><img height='35' style='border:0px;height:46px;' src='https://az743702.vo.msecnd.net/cdn/kofi3.png' border='0' alt='Buy Me a Coffee'></a>

![issues](./assets/issues.png)

![searchResults](./assets/searchResults2.png)

## Documentation
Check out the complete [documentation](https://obsidian-jira-plugin.github.io/obsidian-jira-issue) to start using Jira-Issue.

## Installation
From the obsidian app go in `Settings > Third-party plugins > Community Plugins > Browse` and search for `jira-issue`.

[Read more...](https://obsidian-jira-plugin.github.io/obsidian-jira-issue/docs/get-started/installation)

## Configuration

Use the plugin settings (`Settings > Jira Issue`) to configure your Atlassian Jira connections, security preferences, and visual styling:

- **Security & Credential Storage:** Choose between **OS Keychain (SecretStorage)** (desktop native), **Master Passphrase (AES-256-GCM)** (encrypted for synced vaults), or **Plaintext** (`data.json`).
- **Render Style:** Choose **Modern** (soft pastel badges, Obsidian-native) or **Classic** (legacy Bulma tags).
- **Web Base URL:** Optional browser-facing base URL used for links rendered in notes (useful when your public web address differs from the internal API endpoint or reverse proxy).
- **Disable Icon Fetching:** Per-account toggle to disable downloading icons and avatars from the Jira server and instead use upstream official Atlassian SVG icons.
- **Use 2025 search api:** Account toggle for modern Jira Cloud search API compatibility (prevents HTTP 410 errors).

[Read more...](https://obsidian-jira-plugin.github.io/obsidian-jira-issue/docs/get-started/basic-authentication)

## Markdown Syntax

The plugin support the following components:

### 📃`jira-issue`:
- [Documentation](https://obsidian-jira-plugin.github.io/obsidian-jira-issue/docs/components/jira-issue)
- Example:
````
```jira-issue
AAA-111
AAA-222
https://my.jira-server.com/browse/BBB-333
# This is a comment
```
````

### 🔎`jira-search`
- [Documentation](https://obsidian-jira-plugin.github.io/obsidian-jira-issue/docs/components/jira-search)
- Simple example:
````
```jira-search
resolution = Unresolved AND assignee = currentUser() AND status = 'In Progress' order by priority DESC
    ```
````
- Advanced example:
````
```jira-search
type: TABLE
query: status = 'In Progress' order by priority DESC
limit: 15
columns: KEY, SUMMARY, -ASSIGNEE, -REPORTER, STATUS, NOTES
```
````

### 🔢`jira-count`
- [Documentation](https://obsidian-jira-plugin.github.io/obsidian-jira-issue/docs/components/jira-count)
- Example:
````
```jira-count
project = REF AND status changed to (Done, "Won't Fix", Archived, "Can't Reproduce", "PM Validated") after -14d
```
````

### 🏷️Inline issues
- [Documentation](https://obsidian-jira-plugin.github.io/obsidian-jira-issue/docs/components/inline-issue)
- Example:
````
With inline issue you can insert an issue like JIRA:OPEN-351 inside your text.
The plugin will detect urls like https://jira.secondlife.com/browse/OPEN-352 and render the issue as tags.
- [ ] Issue can be extended JIRA:OPEN-353 with the summary
- [x] Or compact JIRA:-OPEN-354 without the summary
- [ ] JIRA:-OPEN-355 use the `-` symbol before the issue key to make it compact
```
The plugin searches inside the note for those patterns and replace them
JIRA:-OPEN-356
```
````
![Inline issues](./assets/inlineIssues.png)

## Contribution and Feedbacks

Feel free to share your experiences, feedbacks and suggestions in the by opening a GitHub issue.

Pull requests are welcome.

## License

Jira-Issue is licensed under the GNU AGPLv3 license. Refer to [LICENSE](https://github.com/Obsidian-jira-plugin/obsidian-jira-issue/blob/master/LICENSE) for more information.
