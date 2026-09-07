// Ours, not the model's, so the surface stays narrow and the token never leaves the server.
// The write dialog below is unskippable because these methods are the only route to the
// endpoint — that covers mistakes, not a page that calls the endpoint itself.
export const HL_CLIENT_SOURCE = `// Injected by Genesis. Talks to the Genesis proxy, never to HighLevel directly.
(function () {
  var BASE = '__PREVIEW_BASE__'
  var TOKEN = '__PREVIEW_TOKEN__'
  var WRITES = '__PREVIEW_WRITES__' === 'on'
  var cache = {}

  function url(resource, params) {
    var u = BASE + '/hlPreview/' + resource
    var q = []
    for (var k in params || {}) {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
        q.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
      }
    }
    return q.length ? u + '?' + q.join('&') : u
  }

  function unwrap(res) {
    return res.json().then(function (body) {
      if (!res.ok) throw new Error(body.error || 'HighLevel request failed')
      return body
    })
  }

  function get(resource, params) {
    var key = url(resource, params)
    if (!cache[key]) {
      cache[key] = fetch(key, { headers: { 'X-Preview-Token': TOKEN } })
        .then(unwrap)
        .catch(function (err) {
          delete cache[key]
          throw err
        })
    }
    return cache[key]
  }

  function post(action, body) {
    return fetch(BASE + '/hlPreview/' + action, {
      method: 'POST',
      headers: { 'X-Preview-Token': TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(unwrap)
  }

  // ---- the confirmation dialog -------------------------------------------------
  // In a shadow root so the generated stylesheet cannot hide or restyle it.
  function ask(title, lines) {
    if (typeof document === 'undefined') return Promise.resolve(true)

    return new Promise(function (resolve) {
      var host = document.createElement('div')
      host.style.cssText = 'position:fixed;inset:0;z-index:2147483647'
      var root = host.attachShadow ? host.attachShadow({ mode: 'closed' }) : host

      var style = document.createElement('style')
      style.textContent = [
        ':host,*{box-sizing:border-box}',
        '.b{position:fixed;inset:0;display:grid;place-items:center;padding:16px;',
        'background:rgba(15,19,25,.55);font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}',
        '.c{background:#fff;color:#12161c;border-radius:12px;max-width:380px;width:100%;',
        'padding:18px 18px 14px;box-shadow:0 18px 48px -12px rgba(0,0,0,.45)}',
        '.t{font-weight:600;font-size:15px;margin:0 0 2px}',
        '.s{color:#6b7583;font-size:12.5px;margin:0 0 12px}',
        'dl{margin:0 0 14px;display:grid;grid-template-columns:auto 1fr;gap:4px 10px;font-size:13px}',
        'dt{color:#6b7583}dd{margin:0;overflow-wrap:anywhere}',
        '.r{display:flex;gap:8px;justify-content:flex-end}',
        'button{font:inherit;font-weight:600;font-size:13px;padding:7px 13px;border-radius:7px;cursor:pointer}',
        '.no{background:#fff;border:1px solid #dce0e7;color:#3d4653}',
        '.yes{background:#2244c4;border:1px solid #2244c4;color:#fff}'
      ].join('')

      var wrap = document.createElement('div')
      wrap.className = 'b'
      var card = document.createElement('div')
      card.className = 'c'

      var h = document.createElement('p')
      h.className = 't'
      h.textContent = title
      var sub = document.createElement('p')
      sub.className = 's'
      sub.textContent = 'This changes your real HighLevel data.'

      var dl = document.createElement('dl')
      for (var i = 0; i < lines.length; i++) {
        var dt = document.createElement('dt')
        dt.textContent = lines[i][0]
        var dd = document.createElement('dd')
        dd.textContent = lines[i][1]
        dl.appendChild(dt)
        dl.appendChild(dd)
      }

      var row = document.createElement('div')
      row.className = 'r'
      var no = document.createElement('button')
      no.className = 'no'
      no.textContent = 'Cancel'
      var yes = document.createElement('button')
      yes.className = 'yes'
      yes.textContent = 'Confirm'
      row.appendChild(no)
      row.appendChild(yes)

      card.appendChild(h)
      card.appendChild(sub)
      if (lines.length) card.appendChild(dl)
      card.appendChild(row)
      wrap.appendChild(card)
      root.appendChild(style)
      root.appendChild(wrap)
      document.documentElement.appendChild(host)

      function done(ok) {
        host.remove()
        resolve(ok)
      }
      no.addEventListener('click', function () { done(false) })
      yes.addEventListener('click', function () { done(true) })
      wrap.addEventListener('click', function (e) { if (e.target === wrap) done(false) })
      yes.focus()
    })
  }

  function guard(title, lines, action, body) {
    if (!WRITES) {
      return Promise.reject(new Error('HighLevel writes are turned off for this account.'))
    }
    return ask(title, lines).then(function (ok) {
      if (!ok) {
        var e = new Error('Cancelled')
        e.cancelled = true
        throw e
      }
      // Anything cached is now stale.
      cache = {}
      return post(action, body)
    })
  }

  var pairs = function (o, keys) {
    var out = []
    for (var i = 0; i < keys.length; i++) {
      var v = o[keys[i]]
      if (v !== undefined && v !== null && v !== '') {
        out.push([keys[i], Array.isArray(v) ? v.join(', ') : String(v)])
      }
    }
    return out
  }

  var when = function (iso) {
    try { return new Date(iso).toLocaleString() } catch (e) { return String(iso) }
  }

  window.hl = {
    // True when writes are available. Hide write controls rather than letting them fail.
    writes: WRITES,

    location: {
      get: function () { return get('location').then(function (b) { return b.location }) }
    },

    contacts: {
      list: function () { return get('contacts').then(function (b) { return b.contacts }) },
      search: function (q) {
        return get('search', { q: q }).then(function (b) { return b.contacts })
      },
      create: function (fields) {
        return guard('Create this contact?', pairs(fields || {}, ['firstName', 'lastName', 'email', 'phone', 'tags']), 'createContact', fields)
          .then(function (b) { return b.contact })
      },
      update: function (id, fields) {
        var body = Object.assign({}, fields, { id: id })
        return guard('Update this contact?', [['contact', String(id)]].concat(pairs(fields || {}, ['firstName', 'lastName', 'email', 'phone', 'tags'])), 'updateContact', body)
          .then(function (b) { return b.contact })
      }
    },

    conversations: {
      list: function () { return get('conversations').then(function (b) { return b.conversations }) },
      messages: function (conversationId) {
        return get('messages', { conversationId: conversationId }).then(function (b) { return b.messages })
      },
      send: function (contactId, message) {
        return guard('Send this message?', [['to', String(contactId)], ['message', String(message)]], 'sendMessage', { contactId: contactId, message: message })
      }
    },

    calendars: {
      list: function () { return get('calendars').then(function (b) { return b.calendars }) },
      events: function () { return get('events').then(function (b) { return b.events }) },
      slots: function (calendarId, days) {
        return get('slots', { calendarId: calendarId, days: days }).then(function (b) { return b.slots })
      },
      book: function (fields) {
        var f = fields || {}
        return guard('Book this appointment?', [
          ['when', when(f.startTime)],
          ['contact', String(f.contactId || '')],
          ['title', String(f.title || 'Appointment')]
        ], 'bookAppointment', f).then(function (b) { return b.event })
      }
    },

    refresh: function () { cache = {} }
  }
})()
`
