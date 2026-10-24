# Contributing

Thanks for helping with obsidian-jira-issue! This plugin is maintained by a small group of volunteers in the [Obsidian-jira-plugin](https://github.com/Obsidian-jira-plugin) organization. These guidelines keep reviews quick and the plugin stable for everyone.

## Before you start

- **Every change starts with an issue.** Look for an existing one first. Issues labelled [`good first issue`](https://github.com/Obsidian-jira-plugin/obsidian-jira-issue/labels/good%20first%20issue) or [`help wanted`](https://github.com/Obsidian-jira-plugin/obsidian-jira-issue/labels/help%20wanted) are a good place to begin.
- For larger features, describe the idea in the issue before writing code, so we can agree on the approach.
- Questions and ideas are welcome in [Discussions](https://github.com/Obsidian-jira-plugin/obsidian-jira-issue/discussions).

## Setup

You need Node.js 20 and pnpm 9.

```bash
pnpm install
pnpm run dev     # continuous build into main.js
pnpm run test    # run the test suite
pnpm run build   # type check + production build, as in CI
```

To try your build in Obsidian, copy or symlink `main.js`, `manifest.json` and `styles.css` into `<your vault>/.obsidian/plugins/obsidian-jira-issue/` and reload the plugin. [DEVELOP.md](DEVELOP.md) lists public Jira servers you can test against.

## Pull requests

New contributors work from a **fork** and open a pull request against `master`.

- **One topic per PR.** Unrelated fixes or refactorings go into separate PRs, so each one can be reviewed and reverted on its own.
- **Reference the issue** in the description, e.g. `Closes #123`.
- **Don't commit build artifacts** (`main.js`, `coverage/`).
- **Add tests** for bug fixes and new logic in `test/`.
- **Test manually in Obsidian** on desktop, and on mobile when your change could behave differently there (layout, network, clipboard, file access).
- **Include screenshots or a short screen recording** when the PR changes the UI, for desktop and mobile when relevant.
- **Update the docs** in `docs-gen/docs/` when you add or change a setting, column or code block option.
- CI (build, tests, docs) must pass. Every PR needs an approving review from a maintainer before it is merged.

### Porting upstream pull requests

Many open PRs on the original repository [marc0l92/obsidian-jira-issue](https://github.com/marc0l92/obsidian-jira-issue) were never merged. You are welcome to bring them over: adopt the source changes in a new PR, link the original PR, and credit its author with a `Co-authored-by:` trailer in the commit message.

### AI-assisted contributions

AI-assisted contributions are welcome. You remain the author: review and test the generated code in depth, to the best of your knowledge and ability and following current best practice, and be ready to explain and defend every change in review.

## Roles

- **Contributors** work via fork and pull request, without organization membership.
- After a few merged PRs, contributors can be invited as organization members with the **Write** role. They can then push branches to this repository, review, label and triage.
- **Releases, tags and repository settings stay with the admins.**

## Releases

Releases are made by admins only, through a release PR followed by a tag push. See [DEVELOP.md](DEVELOP.md#publish-new-release).

## License

By contributing, you agree that your contributions are licensed under the [AGPL-3.0-or-later](LICENSE), the license of this project.
