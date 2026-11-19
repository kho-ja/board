# Ticket 6 — AskPanel retry after bad provider/model

**Type**: task (polish)  
**Status**: closed  
**Priority**: 2  
**Effort**: small  
**Resolution**: 2026-11-19

## Question

If Ask fails mid-stream (bad provider/model / rate limit / bad API key), retry with current settings fails again silently. Should the error state surface the failure with a hint to change settings?

## Context

- A failed run left the error visible only via "Try again" retrying the same failing request.
- The ticket asked: surface the error to the user with a hint to change settings.

## Resolution

- Added `isProviderError(error)` to `src/components/canvas/AskPanel.tsx`: detects likely provider/model misconfiguration from the failure message (api key, rate limit, 429/401/403, no ai provider, model/provider).
- The error block now renders, when `isProviderError(lastError) && onOpenSettings`, a hint — "Check your provider and model in Ask settings." — with an "Ask settings" link opening the settings dialog.

## Review

- Code review (`git diff 74d082c...HEAD`, commit `104006f`): **Standards** no hard violations (lint/typecheck clean, full suite green); minor findings (new `ask-error-hint` / `ask-error-settings-link` classes not yet registered in `styles.css` / `styles.test.ts`; terminology drift). **Spec** compliant with minor caveats (hint gated on `isProviderError` heuristic + optional callback).
