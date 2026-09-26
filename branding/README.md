# Branding

Put your own logo here and point `PUBLIC_SITE_LOGO` at it in `.env`, for example
`PUBLIC_SITE_LOGO=branding/logo.png`. It is the sign in the top bar, drawn 32px square, and the
tab icon: png, svg, webp, gif, jpg or ico. Everything in this folder but this file is gitignored.

The docker image copies only this folder into its build, so a logo anywhere else is not found
there and the bundled sign is used instead.
