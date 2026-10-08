# shared

`shared/` is reserved for small, framework-level helpers that every module may use, such as:

- money
- time
- errors
- event types
- a transaction helper

It must never contain business rules. Business rules belong in the module that owns them.

`shared/` must not import from `modules/`. This is enforced by `pnpm depcruise`.
