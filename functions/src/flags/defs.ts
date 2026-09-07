export interface FlagDef {
  key: string
  label: string
  description: string
  // Resolved before anyone is signed in, so there is no actor to target.
  globalOnly?: boolean
  default: boolean
}

// The registry. Adding a flag is one entry here; nothing else needs to know.
export const FLAG_DEFS: FlagDef[] = [
  {
    key: 'hl_writes',
    label: 'HighLevel write APIs',
    description:
      'Lets generated apps create and update contacts, send messages and book appointments. Off means the proxy is read only, whatever the generated code asks for.',
    default: false,
  },
  {
    key: 'hl_extended_reads',
    label: 'Extended HighLevel reads',
    description:
      'Adds server-side contact search and the message thread inside a conversation. Off means generated apps see only the original four reads. Calendar listing and free slots come with either this or writes, because booking needs them.',
    default: false,
  },
  {
    key: 'google_login',
    label: 'Sign in with Google',
    description:
      'Shows "Continue with Google" on the sign-in page. Read before anyone is signed in, so it cannot be targeted at individual users.',
    globalOnly: true,
    default: false,
  },
]

export const FLAG_KEYS = FLAG_DEFS.map((d) => d.key)

export const findDef = (key: string): FlagDef | undefined =>
  FLAG_DEFS.find((d) => d.key === key)
