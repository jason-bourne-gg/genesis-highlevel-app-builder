// The HighLevel client every generated app gets. We write it, not the model — a
// narrow, documented surface is what stops Claude inventing endpoints, and it keeps
// the real access token on the server where the sandbox can never reach it.
//
// Both placeholders are substituted by the browser at render time, not stored:
// the preview token is short-lived and minted per render.
export const HL_CLIENT_SOURCE = `// Injected by Genesis. Talks to the Genesis proxy, never to HighLevel directly —
// the sandbox has no HighLevel credentials and could not use them if it did.
(function () {
  var BASE = '__PREVIEW_BASE__'
  var TOKEN = '__PREVIEW_TOKEN__'
  var cache = {}

  function get(resource) {
    if (!cache[resource]) {
      cache[resource] = fetch(BASE + '/hlPreview/' + resource, {
        headers: { 'X-Preview-Token': TOKEN },
      }).then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw new Error(body.error || 'HighLevel request failed')
          return body
        })
      }).catch(function (err) {
        // Let the next call retry rather than caching the failure forever.
        delete cache[resource]
        throw err
      })
    }
    return cache[resource]
  }

  window.hl = {
    location: {
      get: function () {
        return get('location').then(function (b) { return b.location })
      },
    },
    contacts: {
      list: function () {
        return get('contacts').then(function (b) { return b.contacts })
      },
    },
    conversations: {
      list: function () {
        return get('conversations').then(function (b) { return b.conversations })
      },
    },
    calendars: {
      events: function () {
        return get('events').then(function (b) { return b.events })
      },
    },
    refresh: function () { cache = {} },
  }
})()
`
