<script lang="ts">
  /** A burst of confetti from the middle of whatever it sits in: a full-credit ribbon, first place's trophy. */
  const FLAKES = [...Array(16).keys()]
</script>

<span class="confetti" aria-hidden="true">
  {#each FLAKES as flake (flake)}<i></i>{/each}
</span>

<style>
  /* Sixteen fixed flakes, each thrown its own way, in the theme's gems. */
  .confetti {
    position: absolute;
    left: 50%;
    top: 30%;
    pointer-events: none;
  }

  .confetti i {
    position: absolute;
    width: 6px;
    height: 9px;
    margin: -4px -3px;
    border-radius: 1px;
    opacity: 0;
    animation: confetti 900ms cubic-bezier(0.2, 0.7, 0.4, 1) both;
  }

  @keyframes confetti {
    0% {
      opacity: 1;
      transform: translate(0, 0) rotate(0);
    }
    40% {
      opacity: 1;
      transform: translate(calc(var(--dx) * 0.75), var(--dy)) rotate(calc(var(--r) * 0.4));
    }
    100% {
      opacity: 0;
      transform: translate(var(--dx), calc(var(--dy) + 70px)) rotate(var(--r));
    }
  }

  .confetti i:nth-child(6n + 1) {
    background: var(--gem-zenyte);
  }

  .confetti i:nth-child(6n + 2) {
    background: var(--gem-ruby);
  }

  .confetti i:nth-child(6n + 3) {
    background: var(--gem-sapphire);
  }

  .confetti i:nth-child(6n + 4) {
    background: var(--gem-emerald);
  }

  .confetti i:nth-child(6n + 5) {
    background: var(--gem-red-topaz);
  }

  .confetti i:nth-child(6n) {
    background: var(--gem-dragonstone);
  }

  .confetti i:nth-child(1) {
    --dx: -43px;
    --dy: -3px;
    --r: -217deg;
    animation-delay: 152ms;
  }
  .confetti i:nth-child(2) {
    --dx: -47px;
    --dy: -15px;
    --r: -439deg;
    animation-delay: 113ms;
  }
  .confetti i:nth-child(3) {
    --dx: -48px;
    --dy: -20px;
    --r: -303deg;
    animation-delay: 105ms;
  }
  .confetti i:nth-child(4) {
    --dx: -31px;
    --dy: -26px;
    --r: -294deg;
    animation-delay: 140ms;
  }
  .confetti i:nth-child(5) {
    --dx: -42px;
    --dy: -54px;
    --r: 205deg;
    animation-delay: 114ms;
  }
  .confetti i:nth-child(6) {
    --dx: -36px;
    --dy: -55px;
    --r: 394deg;
    animation-delay: 109ms;
  }
  .confetti i:nth-child(7) {
    --dx: -16px;
    --dy: -54px;
    --r: -232deg;
    animation-delay: 137ms;
  }
  .confetti i:nth-child(8) {
    --dx: -4px;
    --dy: -44px;
    --r: -460deg;
    animation-delay: 145ms;
  }
  .confetti i:nth-child(9) {
    --dx: 0px;
    --dy: -40px;
    --r: -434deg;
    animation-delay: 143ms;
  }
  .confetti i:nth-child(10) {
    --dx: 19px;
    --dy: -60px;
    --r: 479deg;
    animation-delay: 159ms;
  }
  .confetti i:nth-child(11) {
    --dx: 22px;
    --dy: -42px;
    --r: -537deg;
    animation-delay: 149ms;
  }
  .confetti i:nth-child(12) {
    --dx: 33px;
    --dy: -45px;
    --r: 355deg;
    animation-delay: 146ms;
  }
  .confetti i:nth-child(13) {
    --dx: 44px;
    --dy: -37px;
    --r: -240deg;
    animation-delay: 132ms;
  }
  .confetti i:nth-child(14) {
    --dx: 54px;
    --dy: -30px;
    --r: -430deg;
    animation-delay: 126ms;
  }
  .confetti i:nth-child(15) {
    --dx: 55px;
    --dy: -23px;
    --r: 354deg;
    animation-delay: 144ms;
  }
  .confetti i:nth-child(16) {
    --dx: 53px;
    --dy: -7px;
    --r: 215deg;
    animation-delay: 153ms;
  }

  @media (prefers-reduced-motion: reduce) {
    .confetti {
      display: none;
    }
  }
</style>
