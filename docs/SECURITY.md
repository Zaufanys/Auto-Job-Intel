# Security and Privacy Baseline

- Never place provider API secrets in browser code.
- Use server-side authorization checks for every tenant-owned record.
- Encrypt sensitive integration tokens at rest and rotate them regularly.
- Record auditable events for privileged actions and external communications.
- Add rate limits, input validation, content-size limits, and anti-automation controls.
- Provide account export and deletion workflows.
- Keep AI actions reviewable. High-impact actions require explicit human approval.
- Treat imported email, documents, web pages, and job descriptions as untrusted input; defend against prompt injection.
- Do not train on customer data without explicit opt-in.
- Define retention periods for logs, uploaded files, and generated content.

## Job-intelligence controls
- Respect site terms, rate limits, and robots directives.
- Do not bypass authentication, bot defenses, or CAPTCHAs.
- Prefer official APIs, feeds, and structured data where available.
- Sanitize job text before model use and defend against prompt injection.
- Store only necessary resume/profile data and support deletion/export.
