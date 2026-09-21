<!-- The die on every re-roll button: a name in NameField, a head in the identity popover.
     A cube seen from above a corner, one, two and three pips up, because a flat square
     with four dots read as a button, a window or a grid before it read as a die.
     Drawn in the button's own colour, so it follows whatever the button is. -->
<svg class="die" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path class="top" d="M12 2.5 20.5 7 12 11.5 3.5 7z" />
  <path class="edges" d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7zM3.5 7 12 11.5 20.5 7M12 11.5v10" />
  <ellipse cx="12" cy="7" rx="1.7" ry="0.95" />
  <circle cx="6" cy="11.2" r="1.15" />
  <circle cx="9.5" cy="17.3" r="1.15" />
  <circle cx="18.3" cy="10.7" r="1.15" />
  <circle cx="16.25" cy="14.6" r="1.15" />
  <circle cx="14.2" cy="18.5" r="1.15" />
</svg>

<style>
  .die {
    width: 22px;
    height: 22px;
    flex: none;
  }

  .die .top {
    fill: currentColor;
    opacity: 0.18;
  }

  .die .edges {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linejoin: round;
  }

  .die circle,
  .die ellipse {
    fill: currentColor;
  }
</style>
