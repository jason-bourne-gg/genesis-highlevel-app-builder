# Genesis — Plan

AI app builder for HighLevel. Sign in, describe an app, watch Claude stream it into
existence, see it running against real HighLevel data.

POC-first: one happy path working end to end, then thicken.

## Architecture

```
Vue 3 SPA (Firebase Hosting)
  |
  |-- Firebase Auth ......... email/password, client SDK
  |-- Firestore ............. projects, files, snapshots (client SDK + rules)
  |
  |-- generate (Cloud Run URL, direct) ...... SSE stream from Claude
  |-- oauth/callback (Cloud Function) ....... HL token exchange
  \-- hl/* (Cloud Function) ................. HL API proxy, injects token
                                                    |
                                              services.leadconnectorhq.com
```

Two rules that shape everything:

- The SSE endpoint is called at its **direct function URL**. Hosting rewrites buffer
  responses at the CDN, so streaming through them never streams.
- The preview iframe never sees a HighLevel token. It calls our proxy; the proxy
  attaches credentials server-side.

## Data model

```
users/{uid}
  hlTokens: { accessToken, refreshToken, expiresAt, locationId, companyId }

projects/{projectId}
  ownerUid, name, description, locationId, createdAt, deletedAt

  files/{fileId}          path, content, updatedAt
  messages/{messageId}    role, content, createdAt
  snapshots/{snapshotId}  createdAt, prompt, files[]
```

Everything is scoped by `ownerUid` and enforced in security rules. Tokens live under
`users/{uid}` and are never client-readable — functions only.

## Generated apps

Plain Vue 3 over CDN + import map, four files:

```
index.html   import map, mount point
app.js       createApp, the actual UI
hl.js        injected client -> our proxy
styles.css
```

Preview concatenates them into an iframe `srcdoc`. No bundler. The file tree stays
genuinely multi-file — separate docs in Firestore, separately editable, separately
versioned.

`hl.js` is written by us, not the LLM, and injected on every generation. It exposes a
narrow surface — `hl.contacts.list()`, `hl.conversations.list()`, `hl.calendars.events()`
— which is what stops the model inventing endpoints.

The iframe is sandboxed `allow-scripts` without `allow-same-origin`, so it runs on an
opaque origin and sends `Origin: null` with no cookies. `hl.js` therefore carries a
short-lived signed preview token, minted per render and scoped to one project, and the
proxy accepts `Origin: null` on those routes. The real HighLevel token never leaves the
function.

## SSE protocol

```
{ type: 'text',  text }             assistant prose -> chat
{ type: 'file',  path }             file boundary, editor opens a tab
{ type: 'token', path, text }       append to that file
{ type: 'done' }                    generation complete
{ type: 'error', message }          partial work preserved
```

Client uses `fetch` + `ReadableStream`, not `EventSource` — EventSource can't send an
`Authorization` header.

Stopping emits nothing. The stream just closes and the caller infers it from its own
`AbortSignal`, which is what the frontend already does.

## Generation pipeline

1. Assemble context: system prompt, `hl.js` surface, current files, recent messages.
2. `client.messages.stream()` with `claude-opus-5`, adaptive thinking.
3. Emit tokens as they arrive, tracking file boundaries.
4. On completion, parse into file operations and validate.
5. Write files, snapshot, persist the message.

Interrupted streams keep whatever completed. Malformed output fails the generation with
the previous file state intact.

## Build order

| Day | Target |
| --- | --- |
| 1 | Repo, Firebase project, Auth, Firestore rules, project CRUD |
| 2 | HL OAuth end to end + proxy function returning real contacts |
| 3 | Generation function, SSE, streaming into Monaco |
| 4 | Preview iframe, snapshots, restore |
| 5 | Deploy, README, Loom, bonuses if time |

The demo path — sign up, connect HL, prompt, stream, real data, edit, restore — has to
work before anything else gets polish. It is the deliverable.

## Open

- Prereqs: HL dev account + app credentials, sandbox location, Firebase Blaze, Anthropic key.
- Bonuses to attempt: cancellation and iterative refinement are near-free. Diff view,
  rate limiting, pagination if time. Webhooks only if everything else lands early.

## Out of scope

Multiple HL locations per user, collaborative editing, npm packages in generated apps,
hard delete.
