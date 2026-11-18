---
sidebar_position: 6
---
# API Util

## clearCache
- `$ji.util.clearCache()`

Clear cache related to Jira requests. The cache retention time can be configured in the [plugin settings](/docs/configuration/advanced#cache-time).

## parseSearchView
- `$ji.util.parseSearchView(text: string)`

Parse the content of a `jira-search` block the same way the plugin does, so other plugins can accept the same syntax. Returns an object with `type`, `query`, `limit`, `columns`, `account` and `label`. Throws an `Error` with the message the block itself would show, such as `Invalid key: querry` or `Invalid limit: abc`.

Example:
```js
const view = $ji.util.parseSearchView('query: assignee = currentUser()\nlimit: 20')
const results = await $ji.defaulted.getSearchResults(view.query, { limit: view.limit, account: view.account })
```
