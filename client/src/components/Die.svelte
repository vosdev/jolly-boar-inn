<!-- The die on every re-roll button: a name in NameField, a head in the identity popover.
     Drawn in the button's own colour, so it follows whatever the button is. -->
<svg class="die" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <rect x="4" y="4" width="16" height="16" rx="3.5" />
  <circle cx="9" cy="9" r="1.4" />
  <circle cx="15" cy="15" r="1.4" />
  <circle cx="15" cy="9" r="1.4" />
  <circle cx="9" cy="15" r="1.4" />
</svg>

<style>
  .die {
    width: 22px;
    height: 22px;
    flex: none;
  }

  .die rect {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
  }

  .die circle {
    fill: currentColor;
  }
</style>
