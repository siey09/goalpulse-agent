# Discord Community Header Link

## Objective

Give dashboard visitors a persistent, trustworthy route to the GoalPulse Discord community at `https://discord.gg/vCsA8Wuwh` without adding API traffic or competing with primary product actions.

## Approved design

Add one compact `Join community` external link to the right side of the sticky top status header. Keep it outside the semantic system-status region so assistive technology does not interpret the community action as operational health.

The link uses the existing proof-purple visual language, a message icon, a quiet border, and a 44-pixel minimum touch target. It opens Discord in a new tab with `rel="noreferrer"`.

On narrow screens, the status-badge row remains horizontally scrollable and the community link remains a non-shrinking action. The visible label may remain because `Join community` is short and clearer than an icon-only control.

## Constraints

- No Discord SDK, API request, webhook change, polling, dependency, analytics event, or authentication flow.
- Do not place the link inside `role="status"`.
- Preserve the existing mobile navigation button, title hierarchy, status badges, and sticky-header behavior.
- Provide an accessible name that identifies Discord and notes that a new tab opens.
- Use the exact invite URL supplied by the user.

## Verification

- Add a smoke test for label, accessible name, exact URL, `_blank`, and safe `rel`.
- Run the focused app smoke test, full web suite, lint, TypeScript, and production build.
- Inspect desktop and narrow production layouts for visibility, overflow, correct URL, and console health without following the invite.
