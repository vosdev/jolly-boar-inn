import { mount } from 'svelte'

import App from './App.svelte'
import './app.css'
import { applyStoredTheme } from './lib/theme'

// Before anything renders: the palette this browser chose last time.
applyStoredTheme()

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
