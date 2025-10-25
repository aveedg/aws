# Team Git Workflow (24-Hour Hackathon)

## TL;DR (Do this every time)

1. **Create a branch** from `main`

   ```bash
   git checkout main && git pull
   git checkout -b feat/backend-scraper
   ```
2. **Commit small changes** with clear messages

   ```bash
   git add .
   git commit -m "feat(scraper): parse CBP bulletins list"
   git push -u origin feat/backend-scraper
   ```
3. **Open a Pull Request (PR)** into `main`, get 1 approval, merge via **Squash**.

---

## Branch protection (already configured)

* PR required to merge into `main`
* 1 approval minimum
* Block force-pushes and deletions of `main`
* Resolve all PR conversations before merge

---

## Branch naming

Use **type/area-short-description** (lowercase, hyphens):

* `feat/backend-scraper`
* `feat/api-search-endpoint`
* `fix/frontend-build`
* `docs/readme-setup`
* `chore/devcontainer`
* `refactor/parser-date-logic`

**Types:** `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`

**Area examples:** `backend`, `frontend`, `ai`, `infra`, `parser`, `api`, `db`, `docs`

---

## Commit messages (Conventional Commits)

Structure:

```
<type>(<scope>): <short summary>
```

Examples:

* `feat(api): add GET /latest endpoint`
* `fix(parser): handle missing published_date`
* `docs(readme): add setup steps`

Keep commits small and focused.

---

## PRs: how to write and merge

**PR Title** = same style as commits:

```
feat(api): search by country and topic
```

**PR Description (template):**

```markdown
## What
- Short bullet list of changes

## Why
- Problem this solves / demo impact

## How to test
- Commands or URLs

## Checklist
- [ ] Works locally
- [ ] No secrets committed
- [ ] Basic logging added
```

**Merging:**

* Get 1 approval
* Fix comments
* Use **Squash and merge**
* Delete branch after merge

---

## Git basics (copy/paste)

```bash
# First time
git clone <repo-url>
cd tradewatch-hackathon
git config pull.rebase false  # keep normal merges

# Daily start
git checkout main
git pull

# New work
git checkout -b feat/<area>-<desc>
# ...edit...
git add .
git commit -m "feat(<area>): <summary>"
git push -u origin feat/<area>-<desc>

# Update your branch with latest main (before opening PR)
git checkout main && git pull
git checkout feat/<area>-<desc>
git merge main
# resolve any conflicts, then:
git add . && git commit
git push
```

---

## Repo layout (where files go)

```
backend/      # Lambdas, SAM, common utils
frontend/     # Web app
ai/           # parsing/LLM experiments
docs/         # diagrams, pitch deck
```

---

## Do NOT commit secrets

* Never commit AWS keys, Slack webhooks, tokens.
* Put them in a local `.env` and keep `.env` in `.gitignore`.

Add these (already set but verify):

```
.env
__pycache__/
.aws-sam/
node_modules/
dist/
.build/
```

---

## Roles (example—adjust as needed)

| Area                   | Owner  |
| ---------------------- | ------ |
| Backend (AWS, API, DB) | <name> |
| Frontend (Dashboard)   | <name> |
| AI Parsing/Summary     | <name> |
| Deck & Demo            | <name> |

---

## Common mistakes & quick fixes

* **“I pushed to main by accident”** → Don’t. Use branches only. If it happened, ping the lead to revert.
* **Merge conflicts** → Pull `main`, merge into your branch, resolve, commit, push.
* **Stuck PR** → Ask for review in Slack and tag one person.

---

## Optional files you can add later

**`.github/PULL_REQUEST_TEMPLATE.md`** (use the PR template above)
**`CODEOWNERS`** (auto-request reviews for folders)

```
# Example
/backend/   @backend-owner
/frontend/  @frontend-owner
```
