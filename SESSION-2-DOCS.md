# CI/CD Session 2 — Full Documentation
## Duration: 2 Hours | Prerequisites: Session 1 (CI/CD basics, GitHub Actions, pipelines, releases)

---

## Table of Contents
1. [Session Overview](#1-session-overview)
2. [Project Structure](#2-project-structure)
3. [Topic 1 — GitHub Environments & Protection Rules](#3-topic-1--github-environments--protection-rules)
4. [Topic 2 — Secrets Management](#4-topic-2--secrets-management)
5. [Topic 3 — Matrix Builds](#5-topic-3--matrix-builds)
6. [Topic 4 — Caching Dependencies](#6-topic-4--caching-dependencies)
7. [Topic 5 — Reusable Workflows](#7-topic-5--reusable-workflows)
8. [Full Workflow Reference](#8-full-workflow-reference)
9. [Demo Walkthrough (Step by Step)](#9-demo-walkthrough-step-by-step)
10. [Q&A Cheat Sheet](#10-qa-cheat-sheet)

---

## 1. Session Overview

### What We Covered in Session 1
- What is CI/CD
- GitHub Actions basics (triggers, jobs, steps)
- A pipeline that tests and publishes a backend app
- Creating releases with tags (v1.0.0)

### What We Cover Today (Session 2)
| Topic | Why It Matters |
|-------|----------------|
| GitHub Environments | Separate staging from production, control who can deploy |
| Protection Rules + Approvals | Humans approve before code reaches production |
| Secrets Management | Environment-specific secrets (staging vs prod) |
| Matrix Builds | Test on multiple Node.js versions simultaneously |
| Caching | Speed up pipelines by skipping redundant installs |
| Reusable Workflows | Write test logic once, use it everywhere |

### Today's Architecture

```
Push to main
     │
     ▼
┌─────────────┐
│  Run Tests  │  ← Reusable workflow
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ Deploy: STAGING │  ← Automatic
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  Smoke Test     │  ← Automated health checks
└──────┬──────────┘
       │
       ▼
┌──────────────────────┐
│  MANUAL APPROVAL     │  ← Human reviews staging
│  (GitHub Reviewer)   │
└──────┬───────────────┘
       │  approved
       ▼
┌──────────────────┐
│ Deploy: PROD     │  ← Only after human approval
└──────────────────┘
```

---

## 2. Project Structure

```
my-app/
├── app.js                          ← Express.js app
├── package.json
├── tests/
│   └── app.test.js                 ← Jest + Supertest tests
└── .github/
    └── workflows/
        ├── ci.yml                  ← CI: lint + matrix tests + cache
        ├── cd.yml                  ← CD: staging → approval → production
        ├── release.yml             ← Release: tag → build → GitHub Release
        └── reusable-test.yml       ← Reusable: called by other workflows
```

---

## 3. Topic 1 — GitHub Environments & Protection Rules

### What is a GitHub Environment?

A **GitHub Environment** is a named deployment target (like `staging` or `production`) that you configure in your repository settings.

It lets you:
- Set **required reviewers** (humans that must approve before deploying)
- Set **wait timers** (e.g. wait 10 minutes before deploying)
- Set **deployment branch rules** (only deploy from `main`)
- Add **environment-specific secrets** (staging DB password ≠ production DB password)

### How to Create Environments

```
GitHub Repository
  → Settings
    → Environments
      → New environment
        → Name: "staging"    (no protection rules)
        → Name: "production" (add Required Reviewers → add yourself or team)
```

### How It Looks in a Workflow

```yaml
jobs:
  deploy-production:
    runs-on: ubuntu-latest
    environment:
      name: production           # links to the GitHub Environment
      url: https://my-app.com    # shown as a clickable link in GitHub UI
    steps:
      - run: echo "Deploying..."
```

### What Happens When You Push to Main

1. GitHub Actions starts the CD pipeline
2. Staging deploys automatically
3. When the `deploy-production` job is reached, GitHub **pauses** the workflow
4. GitHub sends a **notification** to the required reviewers
5. Reviewer clicks **"Review deployments"** in GitHub Actions
6. Reviewer sees what changed, then clicks **Approve** or **Reject**
7. If approved → production deployment runs
8. If rejected → workflow fails with a message

### Protection Rule Options Explained

| Option | What It Does | When to Use |
|--------|-------------|-------------|
| Required reviewers | Specific people must approve | Always for production |
| Wait timer | Delay X minutes before deploying | Canary deployments, observation period |
| Deployment branches | Only certain branches can deploy | Prevent accidental deploys from feature branches |
| Prevent self-review | Approver cannot be the same person who triggered | Enforce 4-eyes principle |

---

## 4. Topic 2 — Secrets Management

### The Problem

You need different values for staging vs production:
- Database URLs
- API keys
- SSH deploy keys
- Passwords

You should **never hardcode** these in your workflow files.

### Three Types of Secrets in GitHub

```
Repository Secrets
  └── Available to ALL environments and workflows
  └── Go to: Settings → Secrets → Actions → Repository secrets
  └── Use for: tokens, keys shared across all environments

Environment Secrets
  └── Only available when a job uses that specific environment
  └── Go to: Settings → Environments → [env name] → Secrets
  └── Use for: staging DB URL, production DB URL (different values!)

Organization Secrets
  └── Shared across multiple repositories in your org
  └── Go to: Org Settings → Secrets
  └── Use for: shared API keys across many repos
```

### Secrets Priority (who wins when names conflict)

```
Environment Secret  >  Repository Secret  >  Organization Secret
(most specific wins)
```

### Using Secrets in Workflows

```yaml
steps:
  - name: Deploy
    env:
      # This secret comes from the current environment (staging or production)
      DB_URL: ${{ secrets.DATABASE_URL }}
      API_KEY: ${{ secrets.API_KEY }}
    run: |
      echo "Connecting to database..."
      # The actual value is NEVER printed — GitHub masks it automatically
```

### Security Rules (Tell Your Students These!)

| Rule | Reason |
|------|--------|
| Never echo a secret | GitHub masks them, but don't risk it |
| Never put secrets in env vars at the top level | They leak to all jobs |
| Use environment secrets for env-specific values | Prevents staging secrets reaching prod |
| Rotate secrets after offboarding | Former team members may have seen values |
| Use GITHUB_TOKEN for GitHub API operations | It's auto-generated, scoped, expires |

### GITHUB_TOKEN — The Special Built-in Secret

```yaml
- name: Create Release
  uses: softprops/action-gh-release@v1
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}  # auto-provided, no setup needed
```

`GITHUB_TOKEN` is automatically created for every workflow run. It can:
- Create releases
- Push to the repo
- Comment on PRs
- Create issues

---

## 5. Topic 3 — Matrix Builds

### The Problem

Your app might run on Node 16, 18, or 20 depending on the server. You want to know if it breaks on any of them.

Without matrix: run 3 separate jobs (copy-paste = bad)
With matrix: define versions once, GitHub runs them in parallel

### Basic Matrix

```yaml
strategy:
  matrix:
    node-version: ["16", "18", "20"]

steps:
  - uses: actions/setup-node@v4
    with:
      node-version: ${{ matrix.node-version }}
```

This creates **3 parallel jobs** automatically.

### Multi-Dimensional Matrix

```yaml
strategy:
  matrix:
    node-version: ["16", "18", "20"]
    os: [ubuntu-latest, windows-latest]
```

This creates **6 parallel jobs** (3 versions × 2 OS).

### Excluding Combinations

```yaml
strategy:
  matrix:
    node-version: ["16", "18", "20"]
    os: [ubuntu-latest, windows-latest]
    exclude:
      - os: windows-latest
        node-version: "16"   # Node 16 not supported on Windows
```

### fail-fast Explained

```yaml
strategy:
  fail-fast: false   # IMPORTANT!
  matrix:
    node-version: ["16", "18", "20"]
```

| `fail-fast` value | Behavior |
|-------------------|----------|
| `true` (default) | If Node 16 fails → Node 18 and 20 are CANCELLED |
| `false` | All versions run regardless — you see the full picture |

**Recommendation:** Use `fail-fast: false` for matrix tests. You want to know which specific versions fail.

### Conditional Steps in Matrix

```yaml
- name: Upload coverage
  # Only upload once, not for every matrix combination
  if: matrix.node-version == '18' && matrix.os == 'ubuntu-latest'
  uses: actions/upload-artifact@v4
  with:
    name: coverage
    path: coverage/
```

---

## 6. Topic 4 — Caching Dependencies

### The Problem

Every time a workflow runs, GitHub spins up a fresh virtual machine. That means:
- `npm ci` downloads ALL packages from scratch
- A small project: 15–30 seconds
- A large project: 2–5 minutes
- With 10 matrix jobs × 5 minutes = **50 minutes just on installs!**

### The Solution: `actions/cache`

Cache `node_modules` so that if `package-lock.json` hasn't changed, the install is skipped.

### Cache Key Strategy

```yaml
- name: Cache node_modules
  uses: actions/cache@v3
  id: cache-deps
  with:
    path: node_modules
    key: node-18-ubuntu-${{ hashFiles('package-lock.json') }}
    restore-keys: |
      node-18-ubuntu-
```

| Part | Meaning |
|------|---------|
| `path` | What folder to cache |
| `key` | Unique identifier for this cache. If key matches → cache HIT |
| `hashFiles(...)` | MD5 hash of package-lock.json. Changes when dependencies change |
| `restore-keys` | Fallback keys if exact key not found (partial match) |

### How Cache Hit/Miss Works

```
Run 1 (no cache yet):
  key: node-18-ubuntu-abc123
  → MISS → npm ci runs → cache SAVED

Run 2 (same package-lock.json):
  key: node-18-ubuntu-abc123
  → HIT → skip npm ci → 2 minutes saved!

Run 3 (package-lock.json changed):
  key: node-18-ubuntu-xyz999  ← different hash
  → MISS → npm ci runs → new cache SAVED
```

### Conditional Install

```yaml
- name: Cache node_modules
  id: cache-deps          # give it an ID to reference its outputs
  uses: actions/cache@v3
  with:
    path: node_modules
    key: ...

- name: Install dependencies
  if: steps.cache-deps.outputs.cache-hit != 'true'   # only if MISS
  run: npm ci
```

### Time Savings Demo

Show students the "Actions" tab before and after adding cache:

| | Without Cache | With Cache |
|---|---|---|
| npm install | ~45 seconds | ~2 seconds |
| 6 matrix jobs | ~270 seconds | ~12 seconds |
| Daily (10 runs) | ~45 minutes | ~2 minutes |

---

## 7. Topic 5 — Reusable Workflows

### The Problem

You have 3 workflows: CI, CD, Release. All of them need to run tests. Without reusable workflows, you copy the same 20 lines 3 times. When you change something (e.g., add a test flag), you update 3 files.

### The Solution

Define tests ONCE in `reusable-test.yml`. Call it from CI, CD, and Release.

### Structure of a Reusable Workflow

```yaml
# reusable-test.yml
on:
  workflow_call:           # This is what makes it reusable
    inputs:
      node-version:
        type: string
        default: "18"
    secrets:
      CODECOV_TOKEN:
        required: false
    outputs:
      test-result:
        value: ${{ jobs.test.outputs.result }}
```

### How to Call It

```yaml
# ci.yml, cd.yml, or release.yml
jobs:
  run-tests:
    uses: ./.github/workflows/reusable-test.yml    # path to the reusable workflow
    with:
      node-version: "18"
      upload-coverage: true
    secrets:
      CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}
```

### Inputs vs Secrets

| | Inputs | Secrets |
|---|---|---|
| What | Configuration values | Sensitive values |
| Visible in logs | Yes | No (masked) |
| Example | `node-version: "18"` | `API_KEY: xyz` |

### Using Outputs from a Reusable Workflow

```yaml
jobs:
  run-tests:
    uses: ./.github/workflows/reusable-test.yml

  next-job:
    needs: run-tests
    runs-on: ubuntu-latest
    steps:
      - name: Check test result
        run: |
          echo "Test result: ${{ needs.run-tests.outputs.test-result }}"
```

---

## 8. Full Workflow Reference

### Workflow Files Summary

| File | Trigger | Purpose |
|------|---------|---------|
| `ci.yml` | Push to main/develop, PRs | Lint + Matrix tests + Cache |
| `cd.yml` | Push to main | Deploy staging → approval → production |
| `release.yml` | Push tag `v*.*.*` | Test → Build → GitHub Release |
| `reusable-test.yml` | `workflow_call` only | Called by other workflows |

### Key Actions Used

| Action | Version | Purpose |
|--------|---------|---------|
| `actions/checkout` | v4 | Clone your repository |
| `actions/setup-node` | v4 | Install a specific Node.js version |
| `actions/cache` | v3 | Cache folders between runs |
| `actions/upload-artifact` | v4 | Save files from a workflow run |
| `actions/download-artifact` | v4 | Download previously saved files |
| `softprops/action-gh-release` | v1 | Create a GitHub Release |

---

## 9. Demo Walkthrough (Step by Step)

### Step 1 — Setup the Repository

```bash
mkdir cicd-session2
cd cicd-session2
git init
git remote add origin https://github.com/YOUR_USERNAME/cicd-session2.git
```

Copy all the files from this session into the folder.

### Step 2 — Create Environments in GitHub

1. Go to your GitHub repository
2. Click **Settings** → **Environments** → **New environment**
3. Create `staging`:
   - No protection rules
   - Add secret: `DEPLOY_KEY` = `staging-fake-key`
   - Add secret: `STAGING_HOST` = `staging.example.com`
4. Create `production`:
   - Click **Required reviewers** → add yourself
   - Add secret: `DEPLOY_KEY` = `prod-fake-key`
   - Add secret: `PROD_HOST` = `prod.example.com`

### Step 3 — Push Code and Watch CI Run

```bash
git add .
git commit -m "feat: add session 2 CI/CD setup"
git push origin main
```

Go to **Actions** tab → Watch `CI - Continuous Integration` run.

**Point out to students:**
- The matrix jobs running in parallel (Node 16, 18, 20)
- The cache MISS on first run (shows "Cache not found")
- Run it again → cache HIT (shows "Cache restored")

### Step 4 — Watch CD Pipeline and Approval

After pushing to main, the CD pipeline also starts.

**Point out:**
1. Tests run first (reusable workflow being called)
2. Staging deploys automatically
3. Production job shows **"Waiting for review"** with an orange icon
4. Click into the job → Click **"Review deployments"**
5. Check the `production` checkbox → Click **Approve and deploy**
6. Watch production deploy

### Step 5 — Create a Release

```bash
git tag v2.0.0
git push origin v2.0.0
```

Go to **Actions** → Watch the Release workflow run.
Go to **Releases** tab → See the automatically created release with the .tar.gz file attached.

### Step 6 — Show Cache Speed Difference

1. On the first run, show the Install step took 30-40 seconds
2. Trigger another push: `git commit --allow-empty -m "trigger" && git push`
3. On the second run, Install step shows "Cache restored" and takes 1-2 seconds

---

## 10. Q&A Cheat Sheet

**Q: What's the difference between CI and CD?**
> CI = test your code automatically on every push. CD = automatically deploy after CI passes.

**Q: Can I have multiple approvers for production?**
> Yes. In Environment settings, add multiple Required Reviewers. ANY one of them can approve.

**Q: What happens if nobody approves within a time limit?**
> By default there's no time limit. You can add a "Wait timer" to auto-expire after X days.

**Q: Can the person who pushed the code approve their own deployment?**
> By default yes. Enable "Prevent self-review" in environment settings to block this.

**Q: What's the difference between `npm install` and `npm ci`?**
> `npm ci` is for CI environments: it's faster, uses exact versions from package-lock.json, and fails if lock file is out of sync.

**Q: Why does the cache not work on the first run?**
> First run there's nothing in cache yet. It's a MISS — installs normally, then saves to cache. Second run onwards it's a HIT.

**Q: Can I cache other things besides node_modules?**
> Yes. Maven/Gradle `.m2` folder, Python `pip` packages, Docker layers, Ruby gems — anything that takes a long time to install.

**Q: Can a reusable workflow call another reusable workflow?**
> Yes, up to 3 levels deep (GitHub limit).

**Q: What's `GITHUB_TOKEN`?**
> An automatically generated token for every workflow run. It has permissions scoped to your repository. You don't need to set it up — GitHub creates and expires it automatically.

**Q: What's the difference between `needs` and `uses`?**
> `needs: other-job` means "wait for this job to finish before starting". `uses: ./path/to/workflow.yml` means "call this reusable workflow as a job".

---

## Next Session Ideas

- **Docker + Container Registry** — Build Docker images in CI, push to GitHub Container Registry
- **Kubernetes Deployment** — Deploy containers to a K8s cluster from CD
- **Multi-repo pipelines** — Trigger downstream pipelines when a library is updated
- **Self-hosted runners** — Run GitHub Actions on your own servers
- **Branch strategies** — GitFlow, trunk-based development, and how CI/CD fits each
