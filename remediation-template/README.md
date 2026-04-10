# Never Ranked Remediation Template

This is the blank template for the **remediation phase** of a Never Ranked engagement — the phase where audit findings turn into shipped code, published content, and validated results.

It parallels `audit-template/`. Together, the two templates are the Never Ranked production system:

```
audit-template/          -> discovery: find what's broken
remediation-template/    -> execution: ship the fixes
scripts/run-audit.py     -> automation for the discovery phase
scripts/verify-deploy.sh -> automation for the verification phase
```

Every Never Ranked engagement runs through the same three-phase loop: **Audit -> Remediate -> Verify.** This template scaffolds phase 2 and connects it to phase 3.

---

## How to run a remediation engagement

### 1. Start from a finished audit

You cannot run remediation without a finished audit. The audit delivers a 90-day roadmap in `audits/{client}/07-roadmap.md`. That roadmap lists the specific actions needed for this client. The remediation engagement picks actions from the roadmap and ships them.

### 2. Create the client implementation folder

```bash
mkdir -p audits/{client-name}/implementation
cp remediation-template/client-implementation-skeleton.md audits/{client-name}/implementation/README.md
```

The skeleton is a minimal per-client tracking doc: a status table and a notes log. Fill in the client name, the engagement start date, and the Month 1 action rows based on the audit roadmap. Delete rows that don't apply. Add rows the roadmap requires.

**Do not copy `remediation-template/README.md` or `remediation-template/action-catalog.md` into the client folder.** Those are template-level files. The client folder only needs its own `README.md` (the tracking doc) plus one file per action.

### 3. Create one file per action

Open `remediation-template/action-catalog.md` in place — do not copy it. It's the canonical index of A1-A11 actions with links to the Montaic reference implementation for each.

For each action in the client's roadmap:

1. If `remediation-template/implementation-stubs/{action-id}-*.md` exists, copy it into the client folder as `{action-id}-{client-topic-slug}.md`.
2. If no stub exists yet, copy the Montaic reference file (from the link in the action catalog) as a starting point and strip out Montaic-specific content.
3. Fill in the file and update the status in the client's implementation README.

**Path convention when referencing template files from a client folder:** use the repo-root-relative path (`remediation-template/voice-rubric-v0.md`), not `../../../remediation-template/voice-rubric-v0.md`. Write paths as you would `cd` from the neverranked repo root. This keeps copy-pasted content portable.

### 4. Use the content skeletons for new content work

If the roadmap calls for new pillar content (most engagements will), start from `remediation-template/content-skeletons/pillar-article-skeleton.md`. This is the Fair Housing article structure generalized for any topic.

### 5. Voice-check everything before publish

Before any content ships, run it through `remediation-template/voice-rubric-v0.md`. This is the checklist of "sounds like the client" — the thing that catches AI-generated prose that reads like AI-generated prose.

### 6. Verify every deploy

After each publish, run `scripts/verify-deploy.sh` from the neverranked repo root:

```bash
./scripts/verify-deploy.sh \
  https://{client-domain}/blog/{slug} \
  https://{client-domain}/blog \
  https://{client-domain}/sitemap.xml
```

Five automated checks plus the Rich Results Test link. This replaces the manual curl-by-curl verification that used to run after every publish.

---

## Files in this template

- `README.md` — this file. Read-only reference, never copied into a client folder.
- `client-implementation-skeleton.md` — the per-client tracking doc. Copied into `audits/{client}/implementation/README.md` at engagement start.
- `action-catalog.md` — index of canonical remediation actions (A1-A11) with pointers to the Montaic reference implementation. Read in place, never copied.
- `implementation-stubs/` — per-action starting stubs. Copy the matching stub into the client folder for each action in the roadmap. Currently populated: A11. Add stubs for other actions as patterns stabilize (after client #2).
- `voice-rubric-v0.md` — pre-publish voice checklist. Read in place.
- `content-skeletons/pillar-article-skeleton.md` — generalized pillar article structure. Read in place.
- `schema-patterns/README.md` — pointer to the canonical schema implementations in Montaic's codebase. Read in place.

## Files NOT in this template (intentionally)

- Schema utility source code — lives in the client codebase, not here. The schema-patterns/README points to the Montaic reference implementation in listing-pipeline-ai.
- Client-specific action files — live in `audits/{client}/implementation/`, not here. The action-catalog is the index, per-client files are the implementation.
- Voice rubrics for specific clients — `voice-rubric-v0.md` is the generic starting point. Each client gets their own voice rubric derived from this one once you've done one voice pass on their content.

---

## The single-line promise this template enforces

Every remediation action ships with verification. If a remediation was shipped but never verified, it doesn't count as done. `scripts/verify-deploy.sh` is how you prove it shipped correctly.

---

## Evolution plan

This template is **v0**. It is intentionally minimal and points to Montaic as the canonical reference implementation for everything that isn't a template itself.

As Never Ranked adds clients, the template will grow:

- **After client #2:** extract schema patterns from Montaic into `schema-patterns/*.ts` templates. The first set of patterns is whatever is reused between clients #1 and #2.
- **After client #3:** promote the voice rubric from v0 to v1 using patterns observed across three different client voices.
- **After client #5:** start promoting specific actions to fully autonomous subagent execution (lowest-risk first: schema generation, verification, sitemap checks).
- **After client #10:** full machine mode — audit and remediation run on subagents, human review is only at three gates: scope approval, voice check, final publish.

Right now (after client #1) the machine is the scaffold + the verification script + the Montaic reference implementation. That's enough to make client #2 roughly 40% faster than client #1 was.
