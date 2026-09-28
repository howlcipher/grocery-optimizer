# Grocery Optimizer Mission Framework

Campaign: `2026-09-27-continuous-improvement`

This document defines the durable mission-continuation framework for Grocery
Optimizer. It exists so an outer Howl Factory campaign can keep developing
this product mission-by-mission. Individual mission specifications (for
example `docs/MISSION_001.md`) remain the authoritative specifications for
their own scope; this document governs how missions chain together.

Grocery Optimizer is an independent consumer application. The Howl
ecosystem is used to plan, execute, verify, and review missions, but no Howl
code or runtime belongs in the application code.

---

## 1. Product Roadmap (direction, not schedule)

This roadmap is direction only. Mission numbers must never be advanced
solely because the roadmap contains another idea; every successor mission
must be evidence-driven.

| Mission | Focus |
| --- | --- |
| 002 | Official Kroger API integration |
| 003 | Stronger normalization and cross-retailer matching |
| 004 | Product/store preferences and controlled substitutions |
| 005 | Saved staples, recent purchases/lists, quick-add |
| 006 | Sale discovery and observed price history |
| 007 | Another retailer integration where a legitimate supported data path exists |
| Later | Unit pricing, package equivalence, extra-stop penalty, distance, routes, smarter recommendations |

Before a successor mission assumes a roadmap direction is viable, it must
reconcile:

- predecessor mission technical debt
- unresolved defects
- architectural findings
- test gaps
- consumer workflow problems
- data model limitations
- provider abstraction maturity
- external API prerequisites
- legitimate retailer API availability and access requirements

If unresolved P0/P1 work would make the next roadmap step unsafe or
structurally unsound, the successor mission must first address those
blockers. Never fabricate retailer access or credentials.

---

## 2. Mission Numbering and Successor Contract

Mission N may generate `docs/MISSION_N+1.md` after its own acceptance.

- Generating the next mission specification is allowed and expected.
- Executing the next mission from within the current mission is forbidden.
- Never overwrite previous mission specifications.
- A successor mission file is created only when the evidence supports
  proceeding.

Each successor mission specification must contain:

- predecessor
- campaign ID
- product state inherited from predecessor
- delivered capabilities
- unresolved findings
- dependencies
- objective
- consumer value
- scope
- non-goals
- architecture constraints
- implementation expectations
- deterministic verification requirements
- independent audit requirements
- definition of done
- completion report requirements
- successor-generation contract

Each mission must complete, in order:

1. planning
2. implementation
3. deterministic verification
4. independent review/audit
5. remediation of valid in-scope findings
6. affected verification reruns
7. final acceptance
8. completion report
9. successor specification generation (when justified by evidence)

---

## 3. Product Findings

Grocery Optimizer findings use structured IDs: `GO-*`.

Severity classification (do not inflate severity):

| Severity | Meaning |
| --- | --- |
| P0 | integrity/security/data corruption issue |
| P1 | primary consumer workflow broken |
| P2 | substantial correctness/reliability/architecture issue |
| P3 | meaningful UX/diagnostics/maintainability issue |
| P4 | optional enhancement |

A finding record includes:

- `id`
- `campaign_id`
- `mission`
- `severity`
- `category`
- `summary`
- `evidence`
- `reproduction`
- `expected_behavior`
- `dependencies`
- `status`

---

## 4. Mission State

Canonical mission state lives in `.product/mission_state.json`

Schema `grocery_optimizer.mission_state/v1` fields:

- `campaign_id`
- `latest_completed_mission` (null when none has completed)
- `next_mission` (path to the next executable mission spec)
- `status` (`READY`, `BLOCKED`, `COMPLETE`)
- `open_findings` (map of `GO-*` IDs to finding summaries/status)
- `updated_at`

Missions update this file at acceptance and after generating a successor
specification. State must reflect reality: a mission that has not completed
is never recorded as completed.

---

## 5. Factory Handoff

Every mission completion report must end with this trailer for the outer
Howl Factory supervisor:

```
MISSION_STATUS:
NEXT_MISSION:
OPEN_P0:
OPEN_P1:
OPEN_P2:
OPEN_P3:
BLOCKED:
CONSUMER_VALUE_DELIVERED:
RECOMMENDED_PRIORITY:
FACTORY_NOTES:
```

The project may recommend its next mission, but the master Factory
determines when it runs relative to other repositories.

---

## 6. Execution Boundary

Every mission must explicitly state:

- Do not recursively call `howl orchestrate`.
- Do not recursively call `howl factory`.
- Generate the next mission specification, then return control to the
  outer Factory.
