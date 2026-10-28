import { mount } from 'svelte'

import App from './App.svelte'
import './app.css'
import { startFaro } from './lib/faro'
import { preloadPictures } from './lib/preload'
import { applyStoredTheme } from './lib/theme'

// First, so an error while the page starts up is reported too.
void startFaro()

// Before anything renders: the palette this browser chose last time.
applyStoredTheme()

const app = mount(App, {
  target: document.getElementById('app')!,
})

// After the first screen is up, so the pictures never compete with it.
addEventListener('load', () => preloadPictures())

export default app
