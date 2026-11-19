---
sidebar_position: 6
---
# API Util

## clearCache
- `$ji.util.clearCache()`

Clear cache related to Jira requests. The cache retention time can be configured in the [plugin settings](/docs/configuration/advanced#cache-time).

## parseSearchView
- `$ji.util.parseSearchView(text: string)`

Parse the content of a `jira-search` block the same way the plugin does, so other plugins can accept the same syntax. Throws an `Error` with the message the block itself would show, such as `Invalid key: querry` or `Invalid limit: abc`.

Returns a plain object:
- `type`: `TABLE` or `LIST`, `TABLE` when omitted
- `query`: the JQL query
- `limit`: a number, `null` when omitted
- `columns`: the parsed columns, `[]` when omitted (the block then uses the default columns from the settings)
- `account`: the account object, as returned by [`$ji.account.getAccountByAlias`](/docs/api/api-account#getAccountByAlias), `null` when omitted
- `label`: a string, `null` when omitted

An unknown custom field column (`$Typo`) is only rejected once the custom field names are loaded, so right after startup or offline it passes.

Example:
```js
const view = $ji.util.parseSearchView('query: assignee = currentUser()\nlimit: 20')
const results = await $ji.defaulted.getSearchResults(view.query, { limit: view.limit, account: view.account })
```
