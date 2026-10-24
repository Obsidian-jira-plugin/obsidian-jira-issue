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

Releases are made by admins. `master` only accepts changes through pull requests, so the version bump goes through a release PR:

1. Create a branch `release/<x.y.z>` from `master` and make sure tests pass: `pnpm run test`
2. Bump the version: `node version-bump.mjs <x.y.z>`
3. Commit the modified files (`manifest.json`, `package.json`, `versions.json`) and open a PR
4. After the PR is merged, tag the merge commit on `master` and push the tag: `git tag <x.y.z> && git push origin <x.y.z>`
5. The `Create new release on new tag` workflow builds and attaches the release assets.

Use a minor version bump for new settings or changed default behavior, and a patch bump for fixes.
