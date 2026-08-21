-- Lote Q — Final Hardening: least privilege.
-- Browser clients do not need TRUNCATE, TRIGGER or REFERENCES on
-- application tables. RLS remains responsible for row-level isolation.

begin;

revoke truncate, trigger, references
on table public.profiles
from authenticated;

revoke truncate, trigger, references
on table public.app_state
from authenticated;

commit;
