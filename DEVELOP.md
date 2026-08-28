# How to develop

## Install dependencies

```bash
pnpm install
```

## Watch changes and build

```bash
# Continuous build
pnpm run dev

# Continuous testing
pnpm run test-watch
```

## Public Jira servers to use for testing
### Apache
URL: `https://issues.apache.org/jira`
Issues
- AAR-51868
- AAR-51861
## Jira
URL: `https://jira.atlassian.com`
Issues
- CONFSERVER-100764
- ATLAS-164

## Api Documentation
https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/#api-rest-api-3-search-get

## Publish new release

Releases are automated via GitHub Actions:
- **Option A (Automated):** Trigger the `Manually create release` GitHub Action workflow with the desired tag name (e.g. `2.0.0`).
- **Option B (Local):**
  1. Make sure tests are passing: `pnpm run test`
  2. Bump the version: `pnpm run version <x.y.z>`
  3. Commit and push the modified files (`manifest.json`, `package.json`, `versions.json`)
  4. Create and push the tag: `git tag <x.y.z> && git push --tags`
  5. The `Create new release on new tag` workflow will automatically build and attach release assets.
