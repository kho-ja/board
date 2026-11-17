<!-- intent-skills:start -->
## Skill Loading

Before editing files for a substantial task:
- Run `npx @tanstack/intent@latest list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `npx @tanstack/intent@latest load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
## Agent skills

### Issue tracker

GitHub Issues (`github.com/kho-ja/board`), published with `ready-for-agent` label. Mirrored locally in `.wayfinder/tickets/` with the frontier in `docs/wayfinder-map.md`. See `docs/agents/issue-tracker.md`.

### Triage labels

Not installed (`triage` skill absent); no labels configured. See `docs/agents/triage-labels.md` if needed later.

### Domain docs

Single-context (`GLOSSARY.md`, `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`). See `docs/agents/domain.md`.

<!-- intent-skills:end -->
