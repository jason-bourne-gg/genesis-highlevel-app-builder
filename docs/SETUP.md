# Setup

Connecting a HighLevel account, running it locally, and deploying.

---

## HighLevel setup

You need a HighLevel agency developer account, a marketplace app, and one
sub-account with data in it.

1. **Create the app** at marketplace.gohighlevel.com with **sub-account**
   distribution. Mine is "APP Builder", app ID `6a996ece5c8bc5c99d201e30`, still a
   draft. A draft is enough to install into your own location.
2. **Copy the client keys** from `MANAGE > Secrets > Client keys` into
   `HL_CLIENT_ID` and `HL_CLIENT_SECRET`.
3. **Tick the scopes** and put the same list in `HL_SCOPES`. A scope is one named
   permission. The five reads are always needed:
   `locations.readonly contacts.readonly conversations.readonly calendars.readonly calendars/events.readonly`
   The `hl_writes` flag additionally needs
   `contacts.write conversations/message.write calendars/events.write`. Tick them now
   even if the flag stays off — an install *is* the grant, so adding a scope later means
   uninstalling and re-authorising.
4. **Register the redirect URL** under `Advanced Settings > Auth > Redirect URLs`.
   That is where HighLevel returns the browser after you approve access, and it
   must match `HL_REDIRECT_URI` exactly:
   `https://us-central1-genesysbe-cbd7e.cloudfunctions.net/oauthCallback`
5. **Copy the version ID** from the app's Install link into `HL_VERSION_ID`.
6. **Create a sandbox location**, add contacts, a calendar and a few appointments,
   then install the app into it. Mine is `hvUQVBR0KYwxwuAw0Ogz` ("New York"), 15
   contacts, one calendar.

Three things here cost real time:

- HighLevel **rejects any redirect URL containing the string "highlevel"**. The
  first Firebase project was named `goHighLevel`, poisoning every URL it could
  produce. Project IDs are permanent, so it had to be recreated as
  `genesysbe-cbd7e`.
- A **draft app has no published version**, so the approval URL has to name one
  with `version_id`. That is what step 5 is for.
- The approval URL is `.../v2/oauth/chooselocation`, not the path most of the
  documentation gives. Found by reading the Install link HighLevel generated.

---

## Local setup

**Node 22 is required.** Node 20 cannot load one of Firebase's dependencies, and
Google switches the Node 20 cloud runtime off on 2026-10-30.

```bash
# 1. Fill in the two env files described at the top of .env.example
#    (functions/.env and frontend/.env). Both are gitignored.

# 2. Install and build
cd frontend  && npm install
cd functions && npm install && npm run build

# 3. The app, at http://localhost:6001
cd frontend && npm run dev

# 4. Local Firebase, from the repo root
firebase emulators:start

# 5. Tests
cd functions && npm test
```

Port 6001, not 6000. Port 6000 is the X11 port and browsers refuse to connect to
it.

Emulator ports come from `firebase.json`: Auth 9099, Functions 5001, Firestore
8080, Hosting 5000. Functions are served out of `functions/lib`, so the build has
to run first. To point the app at local functions rather than deployed ones, set
these in `frontend/.env`:

```
VITE_FUNCTIONS_BASE=http://localhost:5001/genesysbe-cbd7e/us-central1
VITE_GENERATE_URL=http://localhost:5001/genesysbe-cbd7e/us-central1/generate
```

`npm test` at the repo root runs everything — `functions/test` on plain node with no
framework, then `frontend/test` on vitest. `npm run test:functions` and
`npm run test:frontend` run one half; `npm run coverage --prefix functions` reports
coverage, currently 91% of statements and branches.

Two are worth knowing about:

- **The stream parser**, fed the same output at every possible split point. A file
  boundary marker split across two chunks corrupts a file silently, which is the one
  place here where a bug produces no symptom at all.
- **The shell contract**, in `frontend/test/contract.spec.ts`. `validate.ts` on the
  server decides whether a shell is acceptable and `preview.ts` in the browser stitches
  the files together by the same three tags, in two packages that never import each
  other. If they drift, the server saves a generation the browser renders blank, with no
  error anywhere. The test runs thirteen plausible shells through both halves and fails
  if their verdicts disagree.

Firestore and `fetch` are stubbed in `functions/test/stub.cjs`, which is what makes the
stateful paths reachable without an emulator: the single-use token refresh, the preview
pass and its write budget, project ownership, and the flag documents.

Still untested: the HTTP handlers themselves, and `generate`'s orchestration of the
model stream. Both want an integration test rather than a unit one.

**The emulator cannot connect a HighLevel account.** HighLevel has to redirect your
browser to our callback URL, and it cannot reach `localhost`. That flow is tested
against deployed functions.

---

## Deployment notes

**Firebase project.** `genesysbe-cbd7e`, region `us-central1`, set in `.firebaserc`.
The **Blaze (pay as you go) plan is required**, because current-generation Cloud
Functions run on Cloud Run and the free plan does not include it. Enable
Email/Password sign-in and create the Firestore database before the first deploy.

**Deploy in this order.** Rules first, because everything else depends on them.

```bash
firebase deploy --only firestore:rules

cd functions && npm run build && cd ..
firebase deploy --only functions

cd frontend && npm run build && cd ..
firebase deploy --only hosting
```

`firestore.indexes.json` is deliberately empty. No query in the app needs a
composite index, so there is nothing to build and nothing that can be missing when
someone first opens the page. See architecture decision 10.

**Get the Cloud Run URL for `generate`.** The manual step that matters most.
`firebase deploy --only functions` prints every function's URL when it finishes;
the Cloud Run one looks like `https://generate-<hash>-uc.a.run.app`. It is also in
the Google Cloud console under Cloud Run, as the service named `generate`. Put it
in `frontend/.env` as `VITE_GENERATE_URL` and rebuild the frontend. Never point it
at a Firebase Hosting path, for the reason in decision 1.

**Environment variables.** Functions read `functions/.env`, bundled at deploy time,
so a change means redeploying functions. Frontend values are compiled into the
bundle and are readable by anyone who opens the page, so nothing secret goes there.
Neither file is committed; `.env.example` documents both.

**The Anthropic key is not in either file.** Values in `functions/.env` are
deployed as plaintext configuration on every function in the codebase, readable by
anyone with access to the Google Cloud project. The model key lives in Google
Secret Manager instead, encrypted at rest, granted only to the one function that
needs it:

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
```

`generate` declares it with `defineSecret` and lists it in the function's `secrets`
option, so it is mounted at runtime and never appears in the service definition.

Running the frontend locally needs no Anthropic key: `VITE_GENERATE_URL` points at
the deployed function, which reads the secret itself. Only the functions emulator
needs a local copy, in `functions/.secret.local` (gitignored, one `KEY=value` per
line).
The HighLevel client secret is still an ordinary environment variable, which is the
next thing to move.

**Return origins need no configuration for the normal case.** The browser tells
`oauthStart` where it is running, the server checks that against a list and stores
it with the one-time ticket, and the callback reads it back from there. The list is
built from the project id the runtime already knows, so
`https://<project>.web.app` and `https://<project>.firebaseapp.com` work on a fresh
deploy with nothing set. Add `APP_ORIGINS`, comma separated, for a custom domain or
a local port. An origin that is not on the list falls back to the first one rather
than being honoured, because the callback is public and an unchecked redirect
target is an open redirect. `APP_ORIGIN` still works as the single-value form.

**HighLevel side.** Register the deployed callback URL in the marketplace app,
matching `HL_REDIRECT_URI` exactly, and keep `HL_VERSION_ID` filled in while the app
is a draft. Both traps are covered under HighLevel setup.

**CI/CD.** There is none. No GitHub Actions, no automated deploy, no staging
environment. Every deploy is the commands above, run by hand. For a five-day build
by one person that was the right trade, but it is a real gap and worth naming.

