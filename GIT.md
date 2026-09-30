# Git basics

Short guide for adding, committing, and pushing changes with a clear commit message.

## Branches

```bash
git branch                    # list local branches
git switch -c <branch_name>   # create and switch to a new branch (e.g. git switch -c feat/beeswarm)
git switch <branch_name>      # switch to an existing branch (e.g. git switch main)
```

Name branches like commit types, with a short kebab-case description:

| Pattern | Example |
|---------|---------|
| `feat/...` | `feat/beeswarm-chart` |
| `fix/...` | `fix/tooltip-position` |
| `docs/...` | `docs/git-guide` |

## Workflow

```bash
git status                 # see what changed
git add <file>             # stage specific files
# or
git add .                  # stage everything in the current folder

git commit -m "type: short description"
git push
```

If it is the first push on a new branch:

```bash
git push -u origin <branch-name>
```

## Commit message format

Use this pattern:

```text
type: short description of the change
```

- Keep the description short (about one line).
- Write in the imperative mood: `add`, `fix`, `update` (not `added` / `fixed`).
- Prefer several small commits over one huge commit.

### Common types

| Type | When to use it |
|------|----------------|
| `feat` | New feature or visualization |
| `fix` | Bug fix |
| `docs` | Documentation only (README, comments, this file…) |
| `style` | Formatting, CSS, no logic change |
| `refactor` | Code cleanup without changing behavior |
| `chore` | Tooling, config, dependencies, project maintenance |
| `perf` | Performance improvement |
| `test` | Add or update tests |

### Examples

```bash
git commit -m "feat: add beeswarm chart for release years"
git commit -m "fix: correct tooltip position on hover"
git commit -m "docs: explain git workflow in GIT.md"
git commit -m "style: align filters layout on mobile"
git commit -m "refactor: extract data loading into loadData.js"
git commit -m "chore: update d3 dependency"
```

## Useful commands

```bash
git status                 # working tree status
git diff                   # unstaged changes
git log --oneline          # recent commits
git pull                   # fetch and merge remote changes before pushing
```

## Tips

1. Run `git pull` before `git push` if others may have pushed to the same branch.
2. Do not commit secrets (API keys, `.env`, credentials).
3. Review `git status` before `git add .` so you do not stage unwanted files.
