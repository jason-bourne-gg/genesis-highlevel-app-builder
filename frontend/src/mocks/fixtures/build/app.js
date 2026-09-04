import { createApp, computed, onMounted, ref } from 'vue'

const initials = (c) => (c.firstName[0] + c.lastName[0]).toUpperCase()

const when = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })

createApp({
  setup() {
    const contacts = ref([])
    const events = ref([])
    const loading = ref(true)

    const upcoming = computed(() =>
      [...events.value].sort((a, b) => a.startTime.localeCompare(b.startTime)),
    )

    const nameFor = (contactId) => {
      const c = contacts.value.find((x) => x.id === contactId)
      return c ? `${c.firstName} ${c.lastName}` : 'Unknown contact'
    }

    onMounted(async () => {
      const [list, calendar] = await Promise.all([hl.contacts.list(), hl.calendars.events()])
      contacts.value = list
      events.value = calendar
      loading.value = false
    })

    return { contacts, upcoming, loading, initials, nameFor, when }
  },
  template: `
    <header>
      <h1>Front Desk</h1>
      <p>{{ contacts.length }} contacts &middot; {{ upcoming.length }} appointments</p>
    </header>
    <main>
      <section>
        <h2>Contacts</h2>
        <p v-if="loading" class="empty">Loading&hellip;</p>
        <ul v-else>
          <li v-for="c in contacts" :key="c.id">
            <div class="avatar">{{ initials(c) }}</div>
            <div class="who">
              <strong>{{ c.firstName }} {{ c.lastName }}</strong>
              <span>{{ c.email }}</span>
            </div>
            <span v-if="c.tags[0]" class="tag">{{ c.tags[0] }}</span>
          </li>
        </ul>
      </section>
      <section>
        <h2>Appointments</h2>
        <p v-if="loading" class="empty">Loading&hellip;</p>
        <ul v-else>
          <li v-for="e in upcoming" :key="e.id">
            <div class="who">
              <strong>{{ e.title }}</strong>
              <span>{{ nameFor(e.contactId) }}</span>
            </div>
            <span class="when">{{ when(e.startTime) }}</span>
          </li>
        </ul>
      </section>
    </main>
  `,
}).mount('#app')
