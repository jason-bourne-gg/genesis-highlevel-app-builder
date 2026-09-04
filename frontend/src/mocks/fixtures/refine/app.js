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
    const conversations = ref([])
    const loading = ref(true)
    const query = ref('')
    const status = ref('all')

    const matches = (c) => {
      const q = query.value.trim().toLowerCase()
      if (!q) return true
      return `${c.firstName} ${c.lastName} ${c.email} ${c.tags.join(' ')}`.toLowerCase().includes(q)
    }

    const visible = computed(() => contacts.value.filter(matches))

    const upcoming = computed(() =>
      [...events.value]
        .filter((e) => status.value === 'all' || e.status === status.value)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    )

    const nameFor = (contactId) => {
      const c = contacts.value.find((x) => x.id === contactId)
      return c ? `${c.firstName} ${c.lastName}` : 'Unknown contact'
    }

    const unreadFor = (contactId) => {
      const convo = conversations.value.find((x) => x.contactId === contactId)
      return convo ? convo.unread : 0
    }

    onMounted(async () => {
      const [list, calendar, threads] = await Promise.all([
        hl.contacts.list(),
        hl.calendars.events(),
        hl.conversations.list(),
      ])
      contacts.value = list
      events.value = calendar
      conversations.value = threads
      loading.value = false
    })

    return {
      contacts,
      visible,
      upcoming,
      loading,
      query,
      status,
      initials,
      nameFor,
      unreadFor,
      when,
    }
  },
  template: `
    <header>
      <h1>Front Desk</h1>
      <p>{{ contacts.length }} contacts &middot; {{ upcoming.length }} appointments</p>
    </header>
    <main>
      <section>
        <h2>Contacts</h2>
        <div class="toolbar">
          <input v-model="query" class="search" type="search" placeholder="Search contacts" />
        </div>
        <p v-if="loading" class="empty">Loading&hellip;</p>
        <p v-else-if="!visible.length" class="empty">No contacts match &ldquo;{{ query }}&rdquo;</p>
        <ul v-else>
          <li v-for="c in visible" :key="c.id">
            <div class="avatar">{{ initials(c) }}</div>
            <div class="who">
              <strong>{{ c.firstName }} {{ c.lastName }}</strong>
              <span>{{ c.email }}</span>
            </div>
            <span v-if="unreadFor(c.id)" class="unread">{{ unreadFor(c.id) }}</span>
            <span v-if="c.tags[0]" class="tag">{{ c.tags[0] }}</span>
          </li>
        </ul>
      </section>
      <section>
        <h2>Appointments</h2>
        <div class="toolbar">
          <button
            v-for="s in ['all', 'confirmed', 'pending', 'cancelled']"
            :key="s"
            class="chip"
            :class="{ on: status === s }"
            @click="status = s"
          >
            {{ s }}
          </button>
        </div>
        <p v-if="loading" class="empty">Loading&hellip;</p>
        <p v-else-if="!upcoming.length" class="empty">Nothing {{ status }}</p>
        <ul v-else>
          <li v-for="e in upcoming" :key="e.id">
            <span class="dot" :class="e.status"></span>
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
