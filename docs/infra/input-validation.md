# Input validation

How text fields are validated on the client. Three small pieces, one principle.

> **Client validation is an affordance, not a gate.** Every rule a field checks is
> *also* enforced in the database, and the server is the side that actually
> decides. This layer exists to show a person the message *before* the round trip,
> and to get the timing of that message right. Nothing here is a security
> boundary — it is copy that happens to be computed.

Related: [`DESIGN.md` → Forms](../DESIGN.md) · [authentication.md](../features/authentication.md) · [reviews.md](../features/reviews.md)

---

## The pieces

| File | Job |
| --- | --- |
| [`src/lib/validation.ts`](../../src/lib/validation.ts) | The validators — pure `(value) => error \| null` functions, and `firstError` to compose them. No React. |
| [`src/hooks/use-field.ts`](../../src/hooks/use-field.ts) | One field's state, and — the part worth centralising — **when** its error is allowed to show. |
| [`src/components/field-error.tsx`](../../src/components/field-error.tsx) | The message under the field. One treatment (`small`, `text-destructive`, hidden when empty), decided once. |

Build downward, like everywhere else: a validator is the smallest unit, `useField`
wires validators to a field, `FieldError` renders the result. A screen composes
them; it does not re-implement any layer below.

---

## A validator is a function

```ts
export type Validator = (value: string) => string | null;
```

Return the message to show, or `null` when the value passes. That is the whole
contract — no class, no schema object, no async. Compose them with `firstError`,
which returns the **first** non-null message, so validator order is priority:

```ts
firstError(value, [required(), minWords(15)]);
// '' → "This can’t be empty."   (required fires first)
// 'too short' → "13 more words to go."
// 'a full fifteen word review …' → null
```

### Built-ins

| Validator | Passes when |
| --- | --- |
| `required(msg?)` | The value is not blank. **The only validator that fires on empty.** |
| `minLength(n, msg?)` / `maxLength(n, msg?)` | Length is in range. |
| `minWords(n, msg?)` | At least `n` whitespace-separated words. Counts with `countWords`, so it agrees with the review word floor rather than becoming a fourth definition of "a word". |
| `pattern(re, msg)` | The trimmed value matches `re`. |
| `caseEmail(msg?)` | AUTH-1 — a `case.edu` address. Wraps the canonical `CASE_EMAIL_RE`. |

### The empty-skip convention

**Format validators skip a blank value** — `minWords`, `pattern`, `caseEmail`,
`minLength` all return `null` for `''`. Emptiness is `required`'s job, and only
`required`'s. This is what lets an optional-but-constrained field ("blank is fine,
but if you type something it must be an email") be exactly `[caseEmail()]` with no
special-casing at the call site. A required email is `[required(), caseEmail()]`.

---

## `useField`: value plus *when to show the error*

The error itself is not stored — it is recomputed from the validators every
render, so there is never a second copy to keep in sync. What `useField` holds is
one boolean: whether the error is currently allowed to show.

**The timing is the rule** (DESIGN.md → Forms): a message appears after a **blur**
or a **submit attempt**, never on the keystroke still being typed. So:

- Typing (`onChangeText`) hides the error.
- Blurring (`onBlur`) reveals it.
- The submit handler calls `revealErrors()` on any field that is still invalid.

```ts
const email = useField({ validators: [caseEmail()] });

<Input value={email.value} onChangeText={email.onChangeText} onBlur={email.onBlur} … />
<FieldError error={email.showError ? email.error : null} />

<Button disabled={!email.value.trim() || sending} onPress={submit}>…</Button>
```

| Field member | Is |
| --- | --- |
| `value` / `onChangeText` / `onBlur` | Spread onto the `Input`. |
| `error` | The current message, shown or not. |
| `showError` | Whether to render it now (blur/submit-timed). Drives `FieldError`. |
| `isValid` | No validator failing. What `disabled` and the submit guard read. |
| `revealErrors()` | Force the error visible — from the submit handler. |
| `reset(value?)` | Back to pristine, e.g. after a successful submit. |

There is no `useForm` aggregate. A multi-field form is one `useField` per field;
the submit handler checks each `isValid` and calls `revealErrors()` on the
failures. This is deliberate minimalism, the same call `useAsync` makes — grow it
into a form library the day a screen actually needs cross-field rules, not before.

```ts
function submit() {
  if (!email.isValid || !name.isValid) {
    email.revealErrors();
    name.revealErrors();
    return;
  }
  // …fire the write, render server errors inline (below)
}
```

---

## The server always wins

A field error is a guess about what the server will say. When the server actually
answers — a rate limit, a rule the client can't see, a reworded message — **its
message replaces the field's**. Keep server errors in their own state and give
them precedence in the shared slot:

```ts
const [serverError, setServerError] = useState('');
…
<FieldError error={serverError || (email.showError ? email.error : null)} />
```

`sign-in.tsx` is the reference implementation of this whole pattern — the
`case.edu` affordance, blur timing, and a server rejection taking the slot.

### Where the real gate is

Every client rule has a server counterpart. The client copy explains; these
enforce.

| Field rule (affordance) | Enforced by |
| --- | --- |
| `caseEmail()` | `before_user_created_hook` on `auth.users` (AUTH-1) |
| `minWords(15)` on a review | `reviews_body_word_floor` check constraint (REV-10) |
| Check-in cadence | `enforce_check_in_rate_limit` trigger (OCC-6) |

See [supabase.md](supabase.md) for those mechanisms.

---

## Two things this layer does *not* own

- **The review body.** It has its own component, [`ReviewBodyField`](../../src/components/review-body-field.tsx), because the prompt (REV-11) and the live word counter (REV-10) travel together across three screens. Gate its submit with `meetsWordFloor(body)` from `lib/reviews.ts`; `minWords(15)` exists here for any *other* field that needs a floor, and both count the same way.
- **Anything async.** A validator is synchronous. "Is this spot already listed" is a database round trip, not a validator — it is the duplicate guard on the add-spot form, which fetches and renders matches inline.

---

## Adding a validator

Add a function to `validation.ts` that returns `(value) => string | null`, skip
the blank value unless it is a `required`-style check, and give it a default
message that states the fix without scolding. If the rule is also a server rule
(it usually is), leave a comment pointing at the enforcing migration so the two
don't drift.
