# HypeChain — Claude Code Project Instructions

## Design System

Always read `frontend/DESIGN.md` before making any visual or UI decisions. All font choices, colors, spacing, corner treatments, signature moves (Case-File Ribbon, Redacted Field, Mint Certificate), and aesthetic direction are defined there.

Do not deviate from the design system without explicit user approval. In QA / review mode, flag any code that doesn't match `frontend/DESIGN.md`.

Memorable thing the design must deliver:
> "It looks like a financial terminal, not a JPEG mall."

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas / brainstorming → `/office-hours`
- Strategy / scope → `/plan-ceo-review`
- Architecture → `/plan-eng-review`
- Design system / plan review → `/design-consultation` or `/plan-design-review`
- Full review pipeline → `/autoplan`
- Bugs / errors → `/investigate`
- QA / testing site behavior → `/qa` or `/qa-only`
- Code review / diff check → `/review`
- Visual polish → `/design-review`
- Ship / deploy / PR → `/ship` or `/land-and-deploy`
- Save progress → `/context-save`
- Resume context → `/context-restore`
