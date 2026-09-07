const { atest, run, assert } = require('./harness.cjs')
const { withStubs, json } = require('./stub.cjs')

Object.assign(process.env, {
  HL_CLIENT_ID: 'cid', HL_CLIENT_SECRET: 'cs',
  HL_REDIRECT_URI: 'https://x.test/cb', HL_SCOPES: 's',
})

const UID = 'uid_alice'
const connected = {
  [`users/${UID}/private/highlevel`]: {
    accessToken: 'tok', refreshToken: 'ref',
    expiresAt: Date.now() + 3_600_000, locationId: 'loc_1',
  },
}

const withWriters = (fetchHandler, body) =>
  withStubs(
    { firestore: connected, fetch: fetchHandler ?? (() => json({})) },
    { w: 'lib/hl/writes.js' },
    body,
  )

const sent = (calls) => JSON.parse(String(calls.at(-1).body))
const write = (calls) => calls.find((c) => c.init?.method && c.init.method !== 'GET')

atest('creating a contact posts the location and the allowed fields', async () => {
  await withWriters(() => json({ contact: { id: 'c9' } }), async ({ w }, s) => {
    const out = await w.writers.createContact(UID, {
      firstName: 'Asha', lastName: 'Rao', email: 'asha@x.com', phone: '+15551234', tags: ['lead'],
    })
    const call = write(s.calls)
    assert.strictEqual(call.init.method, 'POST')
    assert.match(call.url, /\/contacts\/$/)
    assert.deepStrictEqual(JSON.parse(String(call.body)), {
      locationId: 'loc_1',
      firstName: 'Asha', lastName: 'Rao', email: 'asha@x.com', phone: '+15551234', tags: ['lead'],
    })
    assert.strictEqual(out.contact.id, 'c9')
  })
})

// HighLevel needs a way to reach the person; a contact with neither is a dead record.
atest('a contact with neither email nor phone is refused before any call', async () => {
  await withWriters(null, async ({ w }, s) => {
    await assert.rejects(w.writers.createContact(UID, { firstName: 'Asha' }), (e) => {
      assert.strictEqual(e.status, 400)
      assert.match(e.message, /email or a phone/)
      return true
    })
    assert.strictEqual(s.calls.length, 0, 'called HighLevel with an invalid body')
  })
})

atest('an email alone is enough, and a phone alone is enough', async () => {
  for (const body of [{ email: 'a@b.com' }, { phone: '+15551234' }]) {
    await withWriters(() => json({ contact: { id: 'c1' } }), async ({ w }) => {
      await w.writers.createContact(UID, body)
    })
  }
})

atest('fields the caller did not send are not invented', async () => {
  await withWriters(() => json({ contact: { id: 'c1' } }), async ({ w }, s) => {
    await w.writers.createContact(UID, { email: 'a@b.com' })
    assert.deepStrictEqual(sent(s.calls), { locationId: 'loc_1', email: 'a@b.com' })
  })
})

atest('updating a contact uses PUT and the id in the path', async () => {
  await withWriters(() => json({}), async ({ w }, s) => {
    await w.writers.updateContact(UID, { id: 'c1', phone: '+15559999' })
    const call = write(s.calls)
    assert.strictEqual(call.init.method, 'PUT')
    assert.match(call.url, /\/contacts\/c1$/)
  })
})

// Including locationId on an update is how a record gets moved between sub-accounts.
atest('an update never sends locationId', async () => {
  await withWriters(() => json({}), async ({ w }, s) => {
    await w.writers.updateContact(UID, { id: 'c1', phone: '+1', locationId: 'somewhere-else' })
    assert.strictEqual('locationId' in sent(s.calls), false)
  })
})

atest('an update cannot rewrite the id it is addressing', async () => {
  await withWriters(() => json({}), async ({ w }, s) => {
    await w.writers.updateContact(UID, { id: 'c1', firstName: 'Asha' })
    assert.deepStrictEqual(sent(s.calls), { firstName: 'Asha' })
  })
})

atest('an update with nothing to change is refused', async () => {
  await withWriters(null, async ({ w }, s) => {
    await assert.rejects(w.writers.updateContact(UID, { id: 'c1' }), (e) => {
      assert.match(e.message, /Nothing to update/)
      return true
    })
    assert.strictEqual(s.calls.length, 0)
  })
})

atest('an update with no id is refused', async () => {
  await withWriters(null, async ({ w }) => {
    await assert.rejects(w.writers.updateContact(UID, { phone: '+1' }), (e) =>
      /id is required/.test(e.message))
  })
})

atest('an id needing escaping is escaped into the path', async () => {
  await withWriters(() => json({}), async ({ w }, s) => {
    await w.writers.updateContact(UID, { id: 'a/b c', firstName: 'x' })
    assert.match(write(s.calls).url, /\/contacts\/a%2Fb%20c$/)
  })
})

atest('sending a message posts an SMS to the contact', async () => {
  await withWriters(() => json({ messageId: 'm1' }), async ({ w }, s) => {
    const out = await w.writers.sendMessage(UID, { contactId: 'c1', message: 'Hello' })
    assert.deepStrictEqual(sent(s.calls), { type: 'SMS', contactId: 'c1', message: 'Hello' })
    assert.strictEqual(out.messageId, 'm1')
  })
})

atest('an empty message is refused', async () => {
  await withWriters(null, async ({ w }) => {
    await assert.rejects(w.writers.sendMessage(UID, { contactId: 'c1', message: '   ' }), (e) =>
      /message is required/.test(e.message))
  })
})

atest('a message longer than one SMS batch is refused rather than truncated', async () => {
  await withWriters(null, async ({ w }) => {
    await assert.rejects(
      w.writers.sendMessage(UID, { contactId: 'c1', message: 'x'.repeat(1601) }),
      (e) => /longer than 1600/.test(e.message),
    )
  })
})

atest('booking posts the calendar, location, contact and window', async () => {
  await withWriters(() => json({ id: 'e1' }), async ({ w }, s) => {
    const out = await w.writers.bookAppointment(UID, {
      calendarId: 'cal1', contactId: 'c1',
      startTime: '2026-09-09T14:00:00Z', endTime: '2026-09-09T14:30:00Z',
      title: 'Consultation',
    })
    assert.match(write(s.calls).url, /\/calendars\/events\/appointments$/)
    assert.deepStrictEqual(sent(s.calls), {
      calendarId: 'cal1', locationId: 'loc_1', contactId: 'c1',
      startTime: '2026-09-09T14:00:00Z', endTime: '2026-09-09T14:30:00Z',
      title: 'Consultation', appointmentStatus: 'confirmed',
    })
    assert.strictEqual(out.event.id, 'e1')
  })
})

atest('a booking with no title still gets one', async () => {
  await withWriters(() => json({ id: 'e1' }), async ({ w }, s) => {
    await w.writers.bookAppointment(UID, {
      calendarId: 'cal1', contactId: 'c1',
      startTime: '2026-09-09T14:00:00Z', endTime: '2026-09-09T14:30:00Z',
    })
    assert.strictEqual(sent(s.calls).title, 'Appointment')
  })
})

// A backwards window would be accepted by us and rejected by HighLevel, or worse
// accepted by both and shown as a negative-length appointment.
atest('a booking that ends before it starts is refused', async () => {
  await withWriters(null, async ({ w }, s) => {
    await assert.rejects(
      w.writers.bookAppointment(UID, {
        calendarId: 'cal1', contactId: 'c1',
        startTime: '2026-09-09T15:00:00Z', endTime: '2026-09-09T14:00:00Z',
      }),
      (e) => /endTime must be after startTime/.test(e.message),
    )
    assert.strictEqual(s.calls.length, 0)
  })
})

atest('a zero-length booking is refused', async () => {
  await withWriters(null, async ({ w }) => {
    const t = '2026-09-09T14:00:00Z'
    await assert.rejects(
      w.writers.bookAppointment(UID, { calendarId: 'c', contactId: 'c1', startTime: t, endTime: t }),
      (e) => /after startTime/.test(e.message),
    )
  })
})

atest('a non-date window is refused', async () => {
  await withWriters(null, async ({ w }) => {
    await assert.rejects(
      w.writers.bookAppointment(UID, {
        calendarId: 'cal1', contactId: 'c1', startTime: 'tomorrow', endTime: 'later',
      }),
      (e) => /ISO date-time/.test(e.message),
    )
  })
})

// A missing write scope is the likeliest cause of a 403, and the operator needs telling
// what to do about it rather than "HighLevel returned 403".
atest('a 403 explains that a write scope is probably missing', async () => {
  await withWriters(() => json({}, 403), async ({ w }) => {
    await assert.rejects(w.writers.sendMessage(UID, { contactId: 'c1', message: 'hi' }), (e) => {
      assert.strictEqual(e.code, 'scope_missing')
      assert.match(e.message, /write scope/)
      return true
    })
  })
})

atest('a 422 says HighLevel rejected the values, not that we did', async () => {
  await withWriters(() => json({}, 422), async ({ w }) => {
    await assert.rejects(w.writers.sendMessage(UID, { contactId: 'c1', message: 'hi' }), (e) => {
      assert.strictEqual(e.code, 'invalid_write')
      return true
    })
  })
})

atest('a 204 with no body is a success, not a parse failure', async () => {
  await withWriters(
    () => ({ ok: true, status: 204, json: async () => { throw new Error('no body') } }),
    async ({ w }) => {
      const out = await w.writers.updateContact(UID, { id: 'c1', firstName: 'Asha' })
      assert.strictEqual(out.contact.id, 'c1')
    },
  )
})

atest('all four writers exist under the names the proxy routes to', async () => {
  await withWriters(null, async ({ w }) => {
    assert.deepStrictEqual(Object.keys(w.writers).sort(), [
      'bookAppointment', 'createContact', 'sendMessage', 'updateContact',
    ])
  })
})

run('writers')
