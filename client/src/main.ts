import { mount } from 'svelte'

import App from './App.svelte'
import './app.css'
import { captureAdminToken } from './lib/session'

// Before the app mounts, not in a component's onMount: an admin link's `#t=<token>`
// leaves the address bar before the first paint (section 7 step 4).
captureAdminToken()

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
