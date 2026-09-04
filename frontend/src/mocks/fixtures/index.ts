import type { ProjectFile } from '@/types'
import { hlClientSource } from './hlClient'
import buildApp from './build/app.js?raw'
import buildHtml from './build/index.html?raw'
import buildCss from './build/styles.css?raw'
import refineApp from './refine/app.js?raw'
import refineCss from './refine/styles.css?raw'

export interface Fixture {
  intro: string
  outro: string
  files: ProjectFile[]
}

export function scaffold(): Fixture {
  return {
    intro:
      "I'll build a front-desk view for the Acme Dental location. It reads contacts and " +
      'calendar events through the injected `hl` client and renders them side by side.\n\n' +
      'Writing the shell first, then the HighLevel client, the styles, and the app.\n\n',
    outro:
      '\n\nFour files, no build step — Vue 3 over a CDN import map.\n\n' +
      '- `index.html` sets up the import map and the mount point\n' +
      '- `hl.js` is the narrow HighLevel surface: contacts, conversations, calendars\n' +
      '- `styles.css` keeps it close to the HighLevel look\n' +
      '- `app.js` loads both lists in parallel on mount\n\n' +
      'Ask for a search box or filters next and I can layer them on.',
    files: [
      { path: 'index.html', content: buildHtml },
      { path: 'hl.js', content: hlClientSource() },
      { path: 'styles.css', content: buildCss },
      { path: 'app.js', content: buildApp },
    ],
  }
}

export function refine(): Fixture {
  return {
    intro:
      'Good call. I can do that without touching the shell or the HighLevel client — only ' +
      '`app.js` and `styles.css` need to change.\n\n' +
      'Adding a search field over the contact list, status chips over the appointments, and ' +
      'an unread badge pulled from `hl.conversations`.\n\n',
    outro:
      '\n\nTwo files updated. The contact filter matches on name, email and tags; the chips ' +
      'filter appointments by status and the coloured dot mirrors it. `index.html` and `hl.js` ' +
      'are untouched.',
    files: [
      { path: 'app.js', content: refineApp },
      { path: 'styles.css', content: refineCss },
    ],
  }
}
