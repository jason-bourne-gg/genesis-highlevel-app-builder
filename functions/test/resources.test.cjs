const { atest, run, assert } = require('./harness.cjs')
const { withStubs, json } = require('./stub.cjs')

Object.assign(process.env, {
  HL_CLIENT_ID: 'cid', HL_CLIENT_SECRET: 'cs',
  HL_REDIRECT_URI: 'https://x.test/cb', HL_SCOPES: 's',
})

const UID = 'uid_alice'
const DOC = `users/${UID}/private/highlevel`
const connected = {
  [DOC]: {
    accessToken: 'tok', refreshToken: 'ref',
    expiresAt: Date.now() + 3_600_000, locationId: 'loc_1',
  },
}

const withRes = (fetchHandler, body) =>
  withStubs(
    { firestore: connected, fetch: fetchHandler },
    { res: 'lib/hl/resources.js' },
    body,
  )

const routed = (map) => (url) => {
  for (const [pattern, payload] of Object.entries(map)) {
    if (url.includes(pattern)) return typeof payload === 'function' ? payload(url) : json(payload)
  }
  return json({}, 404)
}

// HighLevel's field names vary by endpoint, so responses are normalised into one shape
// here. The prompt documents that shape exactly, so a mapping slip shows up as blank
// fields in every generated app rather than as an error.
atest('contacts are normalised, and every field is present', async () => {
  await withRes(
    routed({ '/contacts/': { contacts: [{ id: 'c1', firstName: 'Asha', tags: ['lead', 7] }] } }),
    async ({ res }) => {
      const { contacts } = await res.contacts(UID)
      assert.deepStrictEqual(contacts, [
        { id: 'c1', firstName: 'Asha', lastName: '', email: '', phone: '', tags: ['lead', '7'] },
      ])
    },
  )
})

atest('a contact with nothing set becomes empty strings, never undefined', async () => {
  await withRes(routed({ '/contacts/': { contacts: [{}] } }), async ({ res }) => {
    const [c] = (await res.contacts(UID)).contacts
    for (const k of ['id', 'firstName', 'lastName', 'email', 'phone']) {
      assert.strictEqual(c[k], '', `${k} was ${JSON.stringify(c[k])}`)
    }
    assert.deepStrictEqual(c.tags, [])
  })
})

atest('a missing contacts array yields an empty list rather than throwing', async () => {
  await withRes(routed({ '/contacts/': {} }), async ({ res }) => {
    assert.deepStrictEqual((await res.contacts(UID)).contacts, [])
  })
})

atest('the contacts request is capped at 100 and scoped to the location', async () => {
  await withRes(routed({ '/contacts/': { contacts: [] } }), async ({ res }, s) => {
    await res.contacts(UID)
    const url = new URL(s.calls[0].url)
    assert.strictEqual(url.searchParams.get('limit'), '100')
    assert.strictEqual(url.searchParams.get('locationId'), 'loc_1')
  })
})

// conversations.list only ever returned the last message body, which is why the thread
// needed its own resource.
atest("conversations map HighLevel's names onto ours", async () => {
  await withRes(
    routed({
      '/conversations/search': {
        conversations: [
          { id: 'v1', contactId: 'c1', lastMessageBody: 'See you', unreadCount: 2, lastMessageDate: '2026-09-05T10:00:00Z' },
        ],
      },
    }),
    async ({ res }) => {
      const [v] = (await res.conversations(UID)).conversations
      assert.strictEqual(v.lastMessage, 'See you')
      assert.strictEqual(v.unread, 2)
      assert.strictEqual(v.updatedAt, '2026-09-05T10:00:00Z')
    },
  )
})

atest('a conversation with no date still gets one, so sorting cannot crash', async () => {
  await withRes(
    routed({ '/conversations/search': { conversations: [{ id: 'v1' }] } }),
    async ({ res }) => {
      const [v] = (await res.conversations(UID)).conversations
      assert.ok(!Number.isNaN(Date.parse(v.updatedAt)))
      assert.strictEqual(v.unread, 0)
    },
  )
})

// Events are calendar-scoped, not location-scoped: you cannot ask what is on in a
// location, so the calendars are listed first and then each one is asked.
atest('events fan out over every calendar and flatten', async () => {
  await withRes(
    (url) => {
      if (url.includes('/calendars/events')) {
        const id = new URL(url).searchParams.get('calendarId')
        return json({ events: [{ id: `e_${id}`, title: `on ${id}`, startTime: '2026-09-09T14:00:00Z' }] })
      }
      if (url.includes('/calendars/')) return json({ calendars: [{ id: 'cal1' }, { id: 'cal2' }] })
      return json({}, 404)
    },
    async ({ res }) => {
      const { events } = await res.events(UID)
      assert.deepStrictEqual(events.map((e) => e.id).sort(), ['e_cal1', 'e_cal2'])
      assert.strictEqual(events[0].status, 'confirmed', 'default status')
    },
  )
})

// One broken calendar must not empty the whole appointment book.
atest('a calendar that fails is skipped, not fatal', async () => {
  await withRes(
    (url) => {
      if (url.includes('/calendars/events')) {
        const id = new URL(url).searchParams.get('calendarId')
        return id === 'cal1' ? json({}, 500) : json({ events: [{ id: 'e_ok' }] })
      }
      if (url.includes('/calendars/')) return json({ calendars: [{ id: 'cal1' }, { id: 'cal2' }] })
      return json({}, 404)
    },
    async ({ res }) => {
      const { events } = await res.events(UID)
      assert.deepStrictEqual(events.map((e) => e.id), ['e_ok'])
    },
  )
})

atest('no calendars means no events, not an error', async () => {
  await withRes(routed({ '/calendars/': { calendars: [] } }), async ({ res }) => {
    assert.deepStrictEqual((await res.events(UID)).events, [])
  })
})

atest('the event window is forward-looking only', async () => {
  await withRes(
    (url) =>
      url.includes('/calendars/events')
        ? json({ events: [] })
        : json({ calendars: [{ id: 'cal1' }] }),
    async ({ res }, s) => {
      await res.events(UID)
      const call = s.calls.find((c) => c.url.includes('/calendars/events'))
      const q = new URL(call.url).searchParams
      const start = Number(q.get('startTime'))
      const days = (Number(q.get('endTime')) - start) / 86_400_000
      assert.ok(start >= Date.now() - 5000, 'the window started in the past')
      assert.ok(Math.round(days) === 30, `window was ${days} days`)
    },
  )
})

// A hardcoded 30 minutes books the wrong duration on any calendar configured otherwise,
// which shows up as overlapping or gapped appointments in the customer's real CRM.
atest("free slots take their length from the calendar's own configuration", async () => {
  await withRes(
    (url) =>
      url.includes('free-slots')
        ? json({ '2026-09-09': { slots: ['2026-09-09T14:00:00Z'] } })
        : json({ calendar: { slotDuration: 15, slotDurationUnit: 'mins' } }),
    async ({ res }) => {
      const [slot] = (await res.slots(UID, { calendarId: 'cal1' })).slots
      const minutes = (Date.parse(slot.endTime) - Date.parse(slot.startTime)) / 60_000
      assert.strictEqual(minutes, 15)
    },
  )
})

atest('a calendar configured in hours is converted', async () => {
  await withRes(
    (url) =>
      url.includes('free-slots')
        ? json({ d: { slots: ['2026-09-09T14:00:00Z'] } })
        : json({ calendar: { slotDuration: 1, slotDurationUnit: 'hours' } }),
    async ({ res }) => {
      const [slot] = (await res.slots(UID, { calendarId: 'cal1' })).slots
      assert.strictEqual((Date.parse(slot.endTime) - Date.parse(slot.startTime)) / 60_000, 60)
    },
  )
})

atest('an unreadable calendar falls back to thirty minutes rather than failing', async () => {
  await withRes(
    (url) =>
      url.includes('free-slots')
        ? json({ d: { slots: ['2026-09-09T14:00:00Z'] } })
        : json({}, 500),
    async ({ res }) => {
      const [slot] = (await res.slots(UID, { calendarId: 'cal1' })).slots
      assert.strictEqual((Date.parse(slot.endTime) - Date.parse(slot.startTime)) / 60_000, 30)
    },
  )
})

atest('unparseable slot times are dropped rather than becoming Invalid Date', async () => {
  await withRes(
    (url) =>
      url.includes('free-slots')
        ? json({ d: { slots: ['not a time', '2026-09-09T14:00:00Z', ''] } })
        : json({ calendar: {} }),
    async ({ res }) => {
      const { slots } = await res.slots(UID, { calendarId: 'cal1' })
      assert.strictEqual(slots.length, 1)
      assert.ok(!Number.isNaN(Date.parse(slots[0].endTime)))
    },
  )
})

atest('slots without a calendarId is a 400, not a HighLevel call', async () => {
  await withRes(routed({}), async ({ res }, s) => {
    await assert.rejects(res.slots(UID, {}), (e) => {
      assert.strictEqual(e.status, 400)
      return true
    })
    assert.strictEqual(s.calls.length, 0)
  })
})

atest('the message thread is read whichever shape HighLevel returns', async () => {
  for (const payload of [
    { messages: [{ id: 'm1', direction: 'inbound', body: 'hi', dateAdded: '2026-09-05T10:00:00Z' }] },
    { messages: { messages: [{ id: 'm1', direction: 'inbound', body: 'hi', dateAdded: '2026-09-05T10:00:00Z' }] } },
  ]) {
    await withRes(routed({ '/messages': payload }), async ({ res }) => {
      const { messages } = await res.messages(UID, { conversationId: 'v1' })
      assert.strictEqual(messages.length, 1, JSON.stringify(payload))
      assert.strictEqual(messages[0].body, 'hi')
    })
  }
})

atest('messages without a conversationId is a 400', async () => {
  await withRes(routed({}), async ({ res }) => {
    await assert.rejects(res.messages(UID, {}), (e) => e.status === 400)
  })
})

atest('an empty search term makes no request at all', async () => {
  await withRes(routed({}), async ({ res }, s) => {
    assert.deepStrictEqual((await res.search(UID, { q: '  ' })).contacts, [])
    assert.strictEqual(s.calls.length, 0)
  })
})

atest('search passes the term through to HighLevel', async () => {
  await withRes(routed({ '/contacts/': { contacts: [] } }), async ({ res }, s) => {
    await res.search(UID, { q: 'asha' })
    assert.strictEqual(new URL(s.calls[0].url).searchParams.get('query'), 'asha')
  })
})

// The display name is cosmetic, and a generated app must still render without it.
atest('a location with no readable name falls back to its id', async () => {
  await withRes(routed({ '/locations/': {} }), async ({ res }) => {
    const { location } = await res.location(UID)
    assert.strictEqual(location.id, 'loc_1')
    assert.strictEqual(location.name, 'loc_1')
  })
})

atest('a failed name lookup does not fail the whole call', async () => {
  await withRes((url) => (url.includes('/locations/') ? json({}, 500) : json({})), async ({ res }) => {
    assert.strictEqual((await res.location(UID)).location.name, 'loc_1')
  })
})

// These map onto codes the frontend acts on: connection_lost is what flips the UI to
// "Reconnect" rather than showing an empty location.
atest('HighLevel status codes map onto our error codes', async () => {
  for (const [status, code] of [[401, 'connection_lost'], [429, 'rate_limited'], [500, 'hl_error']]) {
    await withRes(() => json({}, status), async ({ res }) => {
      await assert.rejects(res.contacts(UID), (e) => {
        assert.strictEqual(e.code, code, `status ${status}`)
        return true
      })
    })
  }
})

atest('every call carries the dated Version header HighLevel requires', async () => {
  await withRes(routed({ '/contacts/': { contacts: [] } }), async ({ res }, s) => {
    await res.contacts(UID)
    assert.strictEqual(s.calls[0].init.headers.Version, '2021-07-28')
    assert.strictEqual(s.calls[0].init.headers.Authorization, 'Bearer tok')
  })
})

// Previously resolved only inside events(), which meant a generated app could read
// appointments but had no way to name a calendar to book into.
atest('calendars are listed with a usable name', async () => {
  await withRes(
    routed({ '/calendars/': { calendars: [{ id: 'cal1', name: 'Consults' }, { id: 'cal2' }] } }),
    async ({ res }) => {
      const { calendars } = await res.calendars(UID)
      assert.deepStrictEqual(calendars, [
        { id: 'cal1', name: 'Consults' },
        { id: 'cal2', name: 'Calendar' },
      ])
    },
  )
})

atest('no calendars is an empty list, not a failure', async () => {
  await withRes(routed({ '/calendars/': {} }), async ({ res }) => {
    assert.deepStrictEqual((await res.calendars(UID)).calendars, [])
  })
})

run('resources')
