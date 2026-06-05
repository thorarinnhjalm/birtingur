# Code-Rot Remediation — handoff folder

This folder is the complete handoff for fixing the diagnosed code rot in Birtingur.
**Point the implementing agent (Gemini) at this folder.**

## Read in this order

1. **[SYSTEM-REVIEW.md](SYSTEM-REVIEW.md)** — whole-system context: architecture, data model,
   data flow, and the consolidated health/risk picture. Read first to understand the system.
2. **[DIAGNOSIS.md](DIAGNOSIS.md)** — the specific rot items (Kritískt / Mikilvægt / Snyrtilegt)
   with locations and suggested fixes.
3. **[remediation-plan.md](remediation-plan.md)** — the implementation plan. **Follow this
   task-by-task, in order (Phase A → D).** Each task has exact files, real code, TDD steps, and a
   single commit.

## How to report progress

After **every** task, append one entry to **[IMPLEMENTATION-LOG.md](IMPLEMENTATION-LOG.md)** using
the template at the bottom of that file — with real verification output, commit SHA, files
changed, and any deviation/question. See the **Report-Back Protocol** section in
`remediation-plan.md` for the full contract. Claude reviews each log entry against the plan.

## Status at handoff

- Already fixed on branch `fix/code-rot-pass-1` (not in this plan): **K1** (Vercel SPA routing),
  **M2** (orphaned slot-search), **M3** (dead serving cache code).
- Payments (Teya / Payday / Blikk) are **on hold** — out of scope.
- Emulator tests need **Java**; do not mark a backend task done until its `pnpm test:api` /
  serving tests actually pass (state explicitly if you cannot run them).
