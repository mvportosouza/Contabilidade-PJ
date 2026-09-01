# PRODUCTION OBSERVABILITY

## Purpose

Provide a safe operational signal for production failures without recording application data.

The observability layer records only:
- event name;
- category;
- operation;
- sanitized error/status code;
- HTTP status, when available;
- event timestamp.

It must never record:
- access/refresh tokens;
- passwords;
- e-mail addresses or names;
- financial/accounting state;
- Supabase user IDs;
- request bodies or application state;
- arbitrary exception messages.

## Operational categories

| Category | Examples |
|---|---|
| `auth` | session restore, sign-in/sign-up, password reset/update, sign-out |
| `database` | load, save, sync, restore, local cache/queue |
| `api` | PDF/report generation, service worker/API failures |
| `edge_function` | reserved for Edge Function invocation failures |
| `build` | CI/build failures are handled by GitHub Actions and Vercel |

## Levels

- `development`: local developer diagnostics.
- `debug`: local diagnostic detail; disabled from production transport.
- `production`: non-sensitive operational events sent to the observability endpoint.
- `error`: non-sensitive failures sent to the observability endpoint.

Production transport is intentionally fire-and-forget. A logging failure must never change application behavior.

## Production flow

```text
application event
      ↓
sanitization
      ↓
/api/observability
      ↓
Vercel runtime logs
      ↓
operational investigation
```

The endpoint accepts only a small allowlist of fields and rejects oversized/invalid payloads.

## Investigation matrix

### Auth
Look for:
- `auth.session_restore_failed`
- `auth.password_reset_failed`
- `auth.password_update_failed`
- `auth.operation_failed`
- `auth.sign_out_failed`

### Database / synchronization
Look for:
- `database.load_failed`
- `database.save_failed`
- `database.sync_failed`
- `database.restore_failed`
- `database.local_cache_*`
- `database.sync_queue_*`

### API
Look for:
- `api.report_generation_failed`
- `api.pdf_share_fallback`
- `api.service_worker_registration_failed`

### Edge Functions

When the application calls an Edge Function, record the operation as an `edge_function` event and only include the sanitized error/status code. Never forward the function payload, response body, authorization header, token, user ID, or financial data.

### Build

Build failures remain visible in:
- GitHub Actions;
- Vercel deployment/build logs.

No application data is required to diagnose a build failure.

## Governance

Any new production log event must:
1. use the central logger;
2. have a stable event name;
3. use one of the approved categories;
4. pass only sanitized metadata;
5. never log raw `Error` objects;
6. never log application state, credentials, or personal data.

Direct `console.log`, `console.warn`, or `console.error` calls in application code are prohibited except inside the logger/observability transport itself.
