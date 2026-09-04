import hlSource from './hl.js?raw'
import { contacts, conversations, events, location } from '../hlData'

// The client the generated app talks to. Real HighLevel data arrives via the proxy;
// until the preview token exists, the location's data is baked in so the iframe works.
export function hlClientSource(): string {
  const snapshot = JSON.stringify({ location, contacts, conversations, events }, null, 2)
  return hlSource.replace('__SNAPSHOT__', snapshot)
}
