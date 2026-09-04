// The HighLevel client every generated app gets. We write it, not the model, so the surface
// stays narrow and the real access token never leaves the server.
export const HL_CLIENT_SOURCE = `// Injected by Genesis. Talks to the Genesis proxy, never to HighLevel directly.
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
