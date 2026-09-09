# Decision Loop Sandbox — backend contract

The website's sandbox (`sandbox.js`) never calls a model vendor. It calls **one MemoLogs endpoint**, which is free to call whatever it likes server-side and returns the six loop stages ready to render. Until the endpoint is configured the page runs a deterministic local mock with the same shape, so the front end is testable on its own.

## Configure the page

Set the base URL on the dialog element in `index.html`:

```html
<dialog class="pbd" data-pb-dialog data-api="https://api.memologs.com" …>
```

(or `window.MEMOLOGS_API = 'https://api.memologs.com'` before `sandbox.js` loads). Empty string = mock mode; the status line then says "local mock, no backend configured".

## Request

`POST {base}/v1/loop/run` · `Content-Type: application/json` · no cookies (`credentials: omit`), so CORS needs `Access-Control-Allow-Origin` for the site origin and `Content-Type` in allowed headers. The client aborts after 20 s.

```json
{
  "lead": { "name": "Jane Roe", "email": "jane@brand.com", "company": "Brand Co" },
  "situation": {
    "revenue_musd": 40,
    "spend_kusd_month": 3500,
    "channels": ["facebook", "search", "shopping", "tiktok", "ctv", "retail"],
    "question": "Did the $412K Facebook campaign work?"
  },
  "guardrails": {
    "finance_review_kusd": 250,
    "platform_claims_block": true,
    "audience_limit_kusd": 120,
    "policy_text": "No annual commitments without a pilot first."
  },
  "sample_id": "composite-health-v1",
  "client": { "page": "memologs.com", "run": 1 }
}
```

Channel ids: `facebook`, `search`, `shopping`, `tiktok`, `ctv`, `retail`, `radio`, `sponsorship`. Money is in thousands of USD (`_kusd`) except revenue (`_musd`). `policy_text` is free text ≤ 280 chars; treat it as untrusted input. `lead` is only ever sent after the visitor submits the gate form (name, work email, company; free-mail domains are rejected client-side, re-check server-side). The lead is included on **every** run so the backend can attach runs to the contact without a session.

## Response

`200` with:

```json
{
  "run_id": "run_01J9…",
  "sample": false,
  "stages": [
    {
      "key": "frame",
      "verb": "Frame",
      "title": "Set the direction.",
      "example": "A $40M brand, $3.5M a month across six channels. …",
      "facts": [
        { "key": "record", "label": "Direction", "full": "$40M brand. Six channels. $3.5M a month." },
        { "key": "policy", "label": "Rules", "full": "Finance above $250K. Audience limit $120K." }
      ],
      "bars":  [ { "label": "Radio", "pct": 0.9, "state": "ok", "note": "+18–22% · 3/3" } ],
      "chips": [ { "text": "Finance review", "state": "warn" } ]
    }
    // … exactly six, in order: frame, evaluate, decide, act, observe, learn
  ]
}
```

Field rules:

- `stages` must be an array of exactly six objects in loop order. Missing `verb`/`title` fall back to the page's defaults for that stage; `example` is the paragraph shown (plain text, no HTML — the page escapes it).
- `facts[]`: `label` and `full` are shown; `key` is optional but keep the sample keys where they apply (`record, proposal, expectation, policy, evidence, snapshot, authorization, approval, execution, observation, outcome`).
- `bars[]`: `pct` 0–1, `state` one of `ok | warn | gap`, `note` short right-aligned text. `chips[]`: `state` one of `ok | warn | gap | on`. Both optional; omit rather than send empty arrays.
- `sample: true` tells the page to label the result as the composite rather than "your values". Normally `false`.
- The page marks a stage as **changed** when its `example` or `facts` differ from the previous run, so keep wording deterministic for unchanged inputs (temperature 0 or cached by input hash) — otherwise every stage lights up on every run.

Errors: any non-2xx, a timeout, or a body that isn't six stages makes the page keep the last result and show "MemoLogs couldn't run that just now". Return `429` with a JSON `{ "error": "…" }` for rate limits; the page does not retry on its own.

## What the backend should do with a run

1. Validate the lead (work-email domain, MX if you like), upsert the contact, and record the run against it with the full request and response — every run is itself a decision record and a lead-quality signal (which guardrails they changed says a lot).
2. Generate the six stages from the inputs. Ground the numbers in the inputs (the local mock in `sandbox.js` shows the arithmetic the page's story expects: the recommended move ≈ 13% of monthly spend, a combined-commitment check against `audience_limit_kusd`, a finance review when the move exceeds `finance_review_kusd`, and the platform-claim rule deciding whether the weak channel is refused or merely low-trust).
3. Never claim results for a real account. Keep the "illustrative" framing; the page prints that line under every result.

## Front-end states (already implemented)

sample → edited → gate (first run only, lead stored in `localStorage` as `ml-lead`) → busy (dimmed grid, pulsing dot) → live result with changed stages outlined → error (status line, last result kept). Reduced-motion: no pulse or reveal animation.
