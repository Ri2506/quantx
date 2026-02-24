# Non-Blocking Warnings Backlog

## Current Warnings

1. Next.js `metadataBase` warning during build.
- Message indicates fallback to `http://localhost:3000` for social metadata resolution.
- Impact: does not block build or runtime.
- Follow-up: define `metadataBase` in app metadata for production hostname.

2. Deprecated npm package warnings during install.
- Includes helper/auth package deprecations and older lint dependency warnings.
- Impact: does not block install/typecheck/build in current release.
- Follow-up: dependency modernization pass after release hardening.

3. `prisma: command not found` during frontend `postinstall`.
- Script already guarded with `|| true`.
- Impact: non-blocking for current frontend build and typecheck gates.
- Follow-up: either add Prisma CLI or remove postinstall hook if not required.

4. Python deprecation warnings in backend test gates.
- Includes `datetime.utcnow()` deprecation and Pydantic class-based config warning.
- Impact: tests still pass and runtime behavior is unaffected in this release.
- Follow-up: migrate to timezone-aware datetime and Pydantic v2 `ConfigDict` style.

## Policy

- These warnings are tracked but not release blockers for the current hardening scope.
- Any warning that changes runtime behavior or causes gate failures is reclassified as blocking.
