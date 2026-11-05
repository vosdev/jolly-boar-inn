import { mount } from 'svelte'

import App from './App.svelte'
import './app.css'
import { listenForUnlock } from './lib/audio'
import { startFaro } from './lib/faro'
import { preloadPictures } from './lib/preload'
import { applyStoredTheme } from './lib/theme'
import { listenForNewVersion } from './lib/version'

// First, so an error while the page starts up is reported too.
void startFaro()

// Before anything renders: the palette this browser chose last time.
applyStoredTheme()

// Before the first screen, so a missing chunk on it already reloads.
listenForNewVersion()

// Before the first screen, so the first tap on it already counts.
listenForUnlock()

const app = mount(App, {
  target: document.getElementById('app')!,
})

// After the first screen is up, so the pictures never compete with it.
addEventListener('load', () => preloadPictures())

export default app
