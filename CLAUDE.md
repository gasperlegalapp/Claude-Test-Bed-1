# CLAUDE.md — Claude Code Test Bed

This file provides context, conventions, and guidance for AI assistants (Claude Code and others) working in this repository.

---

## Repository Overview

**Name:** Claude-Test-Bed-1
**Owner:** gasperlegalapp
**Purpose:** A test bed repository for experimenting with Claude Code workflows, automation, and AI-assisted development patterns.

This repository serves as an environment for:
- Testing Claude Code capabilities and integrations
- Developing and validating AI-assisted development workflows
- Establishing conventions for Claude-driven repository interactions
- Demonstrating branch management, commit patterns, and code review automation

---

## Repository State

This repository is currently in its initial state (no application code yet). The structure and conventions defined here serve as the baseline for future development.

---

## Branch Strategy

### Branch Naming
All Claude-generated branches follow this convention:
```
claude/<task-slug>-<session-id>
```

Examples:
- `claude/claude-md-mls2i0bnbzju8b2a-1AEh9`
- `claude/fix-auth-bug-abc123def456`
- `claude/add-feature-xyz-789ghi`

### Branch Rules
- **Never push directly to `main`** without an explicit pull request review
- Claude Code always develops on the designated feature branch provided in the task context
- Branch names must start with `claude/` and end with the matching session ID

### Merge Strategy
- Prefer squash merges for Claude-generated branches to keep history clean
- PR descriptions must include a summary, test plan, and a link back to the originating Claude session

---

## Git Workflow

### Making Commits
Use descriptive, imperative-mood commit messages:
```
Add user authentication module
Fix null pointer in payment handler
Update CLAUDE.md with workflow conventions
```

Never:
- Commit secrets, `.env` files, or credentials
- Use `git push --force` on shared branches
- Skip pre-commit hooks with `--no-verify`

### Push Protocol
Always push with upstream tracking:
```bash
git push -u origin <branch-name>
```

Retry on network failure with exponential backoff: 2s → 4s → 8s → 16s (max 4 retries).

---

## Development Conventions

### Code Style
Until a specific language or framework is established for this repository, follow these general principles:
- Prefer readability over cleverness
- Keep functions small and focused (single responsibility)
- Validate at system boundaries; trust internal guarantees
- Avoid over-engineering: build only what is currently needed

### Comments
- Only comment where logic is non-obvious
- Do not add docstrings or type annotations to unchanged code
- Do not leave `// TODO` comments without a linked issue

### Error Handling
- Only add error handling for scenarios that can realistically occur
- Do not add defensive code for hypothetical future edge cases

### File Management
- Prefer editing existing files over creating new ones
- Do not create files (including docs) unless explicitly required by the task
- Remove unused code completely rather than commenting it out

---

## AI Assistant Instructions

### For Claude Code Specifically

**Before modifying any file:**
1. Read the file first — never propose changes to code you haven't read
2. Understand the existing patterns before introducing new ones

**Task planning:**
- Use TodoWrite to plan and track multi-step tasks
- Mark todos `in_progress` before starting, `completed` immediately after finishing
- Do not batch completions — mark done as you go

**Scope discipline:**
- Only make changes directly requested or clearly necessary
- Do not refactor, add features, or "improve" adjacent code unless asked
- A bug fix does not require surrounding cleanup

**Security:**
- Never introduce command injection, XSS, SQL injection, or other OWASP Top 10 vulnerabilities
- Flag and immediately fix any insecure code patterns encountered

**Communication:**
- Output responses as plain text (GitHub-flavored Markdown where appropriate)
- Do not use emojis unless the user explicitly requests them
- Do not give time estimates for tasks

### For Other AI Tools
This repository uses Claude Code as its primary AI assistant. Other tools should defer to the branch conventions and commit standards described above.

---

## Environment

| Property | Value |
|---|---|
| Platform | Linux |
| Default Shell | bash/zsh |
| Git Remote | `origin` via local proxy |

### Local Proxy
Git operations route through a local proxy at `127.0.0.1:40980`. This is expected and normal for this environment.

---

## Pull Request Conventions

PRs should include:
1. **Title** — Short (under 70 characters), imperative mood
2. **Summary** — 1–3 bullet points describing what changed and why
3. **Test Plan** — Checklist of steps to verify the change works
4. **Session Link** — Link to the Claude Code session that generated the PR

---

## Testing & Linting

No test suite or linter is configured yet. When added:
- Document the test command here (e.g., `npm test`, `pytest`, `go test ./...`)
- Document the lint command here (e.g., `npm run lint`, `ruff check .`)
- CI should run both before merging any PR

---

## Updating This File

This `CLAUDE.md` should be updated whenever:
- A new technology, language, or framework is added to the repository
- Development workflows or branch conventions change
- Test or build commands are established
- New AI tooling is integrated

When updating, reflect the **current** state of the repository accurately. Do not document aspirational or planned features as if they exist.

---

*Last updated: 2026-02-18*
*Generated by Claude Code (claude-sonnet-4-6) in session `mls2i0bnbzju8b2a`*
