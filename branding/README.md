# Branding

Put your own logo here and point `PUBLIC_SITE_LOGO` at it in `.env`, for example
`PUBLIC_SITE_LOGO=branding/logo.png`. It is the sign in the top bar, drawn 32px square, and the
tab icon: png, svg, webp, gif, jpg or ico. Everything in this folder but this file is gitignored.

Optional, beside the logo: `logo-<theme>.png` (the logo's own extension) is that theme's sign and
tab icon instead, `apple-touch-icon.png`, 180px square, is a phone's home-screen icon, and
`og-card.png`, 1200×630, is the picture a shared link shows on Discord, Reddit or X.

The docker image copies only this folder into its build, so a logo anywhere else is not found
there and the bundled sign is used instead.
