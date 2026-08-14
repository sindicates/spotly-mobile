-- ONB-1/ONB-5: the onboarding flag moved to device-local storage (MMKV).
--
-- Nothing on the server ever read this column. Onboarding gating is app routing,
-- not RLS (onboarding.md) — there is deliberately no policy keyed on it — so the
-- column was a value the client wrote and then read back to itself, costing a
-- round trip on every cold start. Dropping it rather than leaving it in place:
-- a column that no longer tracks reality is a trap for the next reader.
--
-- `profiles` stays. It is still the AUTH-3 account record, and ONB-6's survey
-- responses land on it later. Its self-only select/update policies stay with it.

alter table public.profiles
  drop column onboarding_complete;
