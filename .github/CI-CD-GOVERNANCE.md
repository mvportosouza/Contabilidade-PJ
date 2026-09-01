# CI/CD Governance

## Production code flow

The repository follows this flow for application changes:

`feature branch → Pull Request → CI → review → merge to main → Vercel`

## Dependency flow

Dependency updates follow:

`Dependabot → Pull Request → CI → analysis/review → merge`

## Workflow permissions

GitHub Actions use `contents: read` by default. Write permissions must only be granted to a workflow when a specific, reviewed requirement exists.

## No silent production mutations

No automated workflow may silently modify, commit, or push code to `main`.

In particular, dependency repair must not use:

`push → main → npm install → commit → push`

The dependency repair workflow is therefore manual (`workflow_dispatch`) and read-only from the repository's perspective. Any resulting `package.json` or `package-lock.json` changes must be reviewed and committed by a human or introduced through a Pull Request.

## CI

CI may run on Pull Requests and after merges to `main`. CI validates the submitted code but does not write it back to the repository.
