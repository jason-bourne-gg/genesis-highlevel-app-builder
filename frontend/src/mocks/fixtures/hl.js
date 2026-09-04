const data = __SNAPSHOT__

const latency = () => new Promise((resolve) => setTimeout(resolve, 120 + Math.random() * 180))

window.hl = {
  location: data.location,
  contacts: {
    async list() {
      await latency()
      return data.contacts
    },
  },
  conversations: {
    async list() {
      await latency()
      return data.conversations
    },
  },
  calendars: {
    async events() {
      await latency()
      return data.events
    },
  },
}
