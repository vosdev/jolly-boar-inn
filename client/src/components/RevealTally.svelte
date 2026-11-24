<script lang="ts">
  /**
   * Under a reveal's buttons: how many of the room got it right, and then everyone else,
   * grouped by what they answered.
   *
   * Everything here comes from `question_closed`: `results` already carries every
   * player's row, and `unanswered` the players who could have answered and did not. "Right"
   * is `correct`, full credit; every other answer goes in a group under "Got it wrong",
   * one line each, with its count and, if the host turned them on, its names.
   *
   * A group is what a player would recognise as "what I said". A pick of one groups by
   * the option, with its gem's chip where it has a gem. Typed answers group by the form
   * the server grades them in, so "Jad!" and "jad" share a line, said the way the first
   * of them typed it; a list's picks group by entry. Both keep their three biggest groups
   * and fold the rest into one. A number's misses, typed or slid, are "close" while they
   * still scored and "further off" after, every name carrying its guess. Pick all that
   * apply groups by right picks against the reveal's `answer_indices`, because its credit
   * punishes misses and extras alike. Ordering groups by entries in place, and
   * with `picks` also those out of place, read off the value: its credit counts swaps. Grouping
   * by how many, not by which, keeps six entries to six lines. Matching groups the same
   * way, by fields right, read off `credit`, and a sort into bins says "sorted" for "matched".
   *
   * Not answering is not getting it wrong (the points slot makes the same distinction),
   * so it is its own line, last and muted.
   *
   * The names are the room's taste, so they are `settings.name_wrong_answers`, which the
   * host can turn off. The counts are always there: they answer "was that a hard one?",
   * which is what people ask each other across the table while the reveal runs. A line
   * names `NAMES_SHOWN` at most, you first so you always find yourself, then the rest
   * alphabetically.
   *
   * In a team game, a row per team with a member: its logo, name and the mean of its
   * members' points on this question, in the room's order of gods rather than ranked,
   * because a reveal carries no standings. Then a row per item that paid on this close,
   * whoever wore it, you first: items are in the open, and their points are not the answer's.
   *
   * A map question ranks its pins instead (`PinRanking`), in either form. A picture pin's misses
   * are "Close" while they still scored and "Off the spot" after.
   *
   * Last, the player who suggested the question, when they asked to be named. It sits off
   * the scroll and under everything else, so the reveal reads the same with or without it.
   *
   * As the room's results `panel` (section 10 of ideas/design.md) it is a row per answer
   * instead: the right one first, labelled with the answer, then the wrong ones and "No
   * answer", each with its count, a bar for its share of everyone who could answer, and
   * its names under it. The right row always names its players; the others only with
   * `showNames`. The TV keeps the tally as it was.
   */
  import { normalize } from '../lib/customQuestions'
  import { formatGp } from '../lib/gp'
  import { itemName, signed, type ItemPoints } from '../lib/heldItems'
  import type { PlayerResult } from '../lib/protocol'
  import { team as god, teamMeans, type TeamId } from '../lib/teams'
  import { loadVocab } from '../lib/vocab'
  import { GEMS, type Gem } from './questions/GemButton.svelte'
  import { placement } from './questions/types/Ordering.svelte'
  import ItemIcon from './ItemIcon.svelte'
  import PinRanking from './PinRanking.svelte'
  import TeamLogo from './TeamLogo.svelte'

  let {
    type,
    reveal,
    results,
    unanswered = [],
    nameOf,
    youId,
    showNames,
    suggestedBy = null,
    teams = [],
    teamOf = {},
    panel = false,
    items = [],
  }: {
    /** The question's type, which decides what an answer's group is. */
    type: string
    /** `question_closed.reveal`: the options, pick all's right ones, ordering's entries. */
    reveal: Record<string, unknown>
    results: Record<string, PlayerResult>
    /** `question_closed.unanswered`. */
    unanswered?: string[]
    /** A player's name by id; null for somebody the room no longer knows. */
    nameOf: (id: string) => string | null
    youId: string | null
    showNames: boolean
    /** `question_closed.suggested_by`. */
    suggestedBy?: string | null
    /** `settings.teams`: empty outside a team game. */
    teams?: readonly TeamId[]
    /** Each player's team by id. */
    teamOf?: Readonly<Record<string, TeamId>>
    /** Drawn as the room's results panel, a row per answer, rather than under the answers. */
    panel?: boolean
    /** Every item that paid on this close, whoever wore it. */
    items?: ItemPoints[]
  } = $props()

  const itemRows = $derived(
    items
      .map((row) => ({
        ...row,
        you: row.playerId === youId,
        name: nameOf(row.playerId) ?? 'Someone who left',
      }))
      .sort((a, b) => Number(b.you) - Number(a.you) || a.name.localeCompare(b.name)),
  )

  const NAMES_SHOWN = 8
  /** Typed answers and list picks: the groups drawn before the rest fold into one. */
  const GROUPS_SHOWN = 3

  interface Who {
    id: string
    name: string
    you: boolean
    /** Said after the name: a number's guess. */
    guess: string | null
  }

  interface Group {
    key: string
    label: string
    gem: Gem | null
    players: Who[]
    /** A muted line: the players who did not answer. */
    quiet?: boolean
  }

  const rows = $derived(Object.entries(results))
  const right = $derived(rows.filter(([, result]) => result.correct).length)
  const wrong = $derived(rows.filter(([, result]) => !result.correct))
  const options = $derived((reveal.options as unknown[] | undefined) ?? [])
  const done = $derived(reveal.bins === true ? 'sorted' : 'matched')
  const count = new Intl.NumberFormat()

  let vocab = $state<Map<number, string> | null>(null)
  $effect(() => {
    if (type !== 'pick_from_list' || typeof reveal.vocab !== 'string') return
    let live = true
    loadVocab(reveal.vocab)
      .then((list) => {
        if (live) vocab = new Map(list.entries.map((entry) => [entry.id, entry.name]))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  })

  const who = (id: string, guess: string | null = null): Who => ({
    id,
    name: nameOf(id) ?? 'Someone who left',
    you: id === youId,
    guess,
  })
  const youFirst = (a: Who, b: Who) => Number(b.you) - Number(a.you) || a.name.localeCompare(b.name)

  /** Answers that share a key share a line, in the order the first of each arrived. */
  function grouped(
    keyOf: (result: PlayerResult) => string,
    describe: (result: PlayerResult) => Omit<Group, 'key' | 'players'>,
  ): Group[] {
    const groups = new Map<string, Group>()
    for (const [id, result] of wrong) {
      const key = keyOf(result)
      const group = groups.get(key) ?? { key, players: [], ...describe(result) }
      group.players.push(who(id))
      groups.set(key, group)
    }
    return [...groups.values()]
  }

  const biggestFirst = (groups: Group[]) =>
    groups.sort((a, b) => b.players.length - a.players.length)

  /** The biggest few, and the rest as one line, unless the rest is one group anyway. */
  function capped(groups: Group[]): Group[] {
    const sorted = biggestFirst(groups)
    if (sorted.length <= GROUPS_SHOWN + 1) return sorted
    const rest = sorted.slice(GROUPS_SHOWN).flatMap((group) => group.players)
    return [
      ...sorted.slice(0, GROUPS_SHOWN),
      { key: 'rest', label: 'Something else', gem: null, players: rest },
    ]
  }

  function optionLabel(index: number): string {
    const option = options[index]
    if (typeof option === 'string') return option
    const subject = (option as { subject?: { name?: unknown } } | undefined)?.subject
    return typeof subject?.name === 'string' ? subject.name : `Option ${index + 1}`
  }

  const places = $derived(
    typeof reveal.picks === 'number'
      ? reveal.picks
      : ((reveal.entries as unknown[] | undefined)?.length ?? 0),
  )
  const answers = $derived(new Set((reveal.answer_indices as number[] | undefined) ?? []))
  /** A pick-all answer's right picks and, unless `picks` made it pick that many, its wrong ones. */
  function picked(value: unknown): { hits: number; extras: number } {
    const indices = Array.isArray(value) ? (value as number[]) : []
    const hits = indices.filter((index) => answers.has(index)).length
    return { hits, extras: 'picks' in reveal ? 0 : indices.length - hits }
  }

  /** Most right first, and among equals the most in place or picked right. */
  const byCredit = (groups: (Group & { credit: number; hits: number })[]) =>
    groups.sort((a, b) => b.credit - a.credit || b.hits - a.hits)

  /** A number's misses: credit falls with distance, so it orders them by closeness. */
  function slid(written: (value: number) => string): Group[] {
    const guesses = (rows: typeof wrong) =>
      [...rows]
        .sort((a, b) => b[1].credit - a[1].credit)
        .map(([id, { value }]) => who(id, written(Number(value))))
    const lines: Group[] = [
      {
        key: 'close',
        label: 'Close',
        gem: null,
        players: guesses(wrong.filter(([, r]) => r.credit > 0)),
      },
      {
        key: 'further',
        label: 'Further off',
        gem: null,
        players: guesses(wrong.filter(([, r]) => r.credit === 0)),
      },
    ]
    return lines.filter((line) => line.players.length > 0)
  }

  const groups = $derived.by((): Group[] => {
    switch (type) {
      case 'price_is_right':
        return slid((value) => `${formatGp(value)} gp`)
      case 'number_slider':
      case 'closest_number':
        return slid((value) => {
          const unit = typeof reveal.unit === 'string' && reveal.unit !== '' ? reveal.unit : null
          return unit === null ? count.format(value) : `${count.format(value)} ${unit}`
        })
      case 'multiple_choice':
      case 'more_less': {
        const gemmed = type !== 'more_less'
        return grouped(
          ({ value }) => String(value),
          ({ value }) => {
            const index = Number(value)
            return {
              label: optionLabel(index),
              gem: gemmed ? (GEMS[Math.min(index, GEMS.length - 1)] ?? null) : null,
            }
          },
        ).sort((a, b) => b.players.length - a.players.length || Number(a.key) - Number(b.key))
      }
      case 'free_text':
        return capped(
          grouped(
            ({ value }) => normalize(String(value)),
            ({ value }) => ({ label: `“${String(value)}”`, gem: null }),
          ),
        )
      case 'pick_from_list':
        return capped(
          grouped(
            ({ value }) => String(value),
            ({ value }) => ({ label: vocab?.get(Number(value)) ?? '…', gem: null }),
          ),
        )
      case 'pick_all_that_apply': {
        const lines = new Map<string, Group & { credit: number; hits: number }>()
        for (const [id, { credit, value }] of wrong) {
          const { hits, extras } = picked(value)
          const key = `${hits}/${extras}`
          const label =
            hits === 0
              ? 'None right'
              : `${hits} of ${answers.size} right${extras > 0 ? `, ${extras} wrong` : ''}`
          const line = lines.get(key) ?? { key, label, gem: null, players: [], credit, hits }
          line.players.push(who(id))
          lines.set(key, line)
        }
        return byCredit([...lines.values()])
      }
      case 'ordering': {
        const lines = new Map<string, Group & { credit: number; hits: number }>()
        for (const [id, { value }] of wrong) {
          const { inPlace: hits, outOfPlace } = placement(reveal, value)
          // Without `picks` credit counts swaps, so answers with as many in place differ in
          // credit; this orders the groups by what their labels say.
          const credit = (hits + outOfPlace / 2) / places
          const key = `${hits}/${outOfPlace}`
          const label =
            hits === 0 && outOfPlace === 0
              ? 'None in place'
              : `${hits} of ${places} in place${outOfPlace > 0 ? `, ${outOfPlace} out of place` : ''}`
          const line = lines.get(key) ?? { key, label, gem: null, players: [], credit, hits }
          line.players.push(who(id))
          lines.set(key, line)
        }
        return byCredit([...lines.values()])
      }
      case 'matching': {
        const fields = (reveal.fields as unknown[] | undefined)?.length ?? 0
        const lines = new Map<string, Group & { credit: number; hits: number }>()
        for (const [id, { credit }] of wrong) {
          const hits = Math.round(credit * fields)
          const key = String(hits)
          const label = hits === 0 ? 'None' : `${hits} of ${fields}`
          const line = lines.get(key) ?? { key, label, gem: null, players: [], credit, hits }
          line.players.push(who(id))
          lines.set(key, line)
        }
        return byCredit([...lines.values()])
      }
      case 'picture_pin': {
        const lines: Group[] = [
          {
            key: 'close',
            label: 'Close',
            gem: null,
            players: wrong.filter(([, r]) => r.credit > 0).map(([id]) => who(id)),
          },
          {
            key: 'off',
            label: 'Off the spot',
            gem: null,
            players: wrong.filter(([, r]) => r.credit === 0).map(([id]) => who(id)),
          },
        ]
        return lines.filter((line) => line.players.length > 0)
      }
      default:
        return grouped(
          () => 'wrong',
          () => ({ label: 'Wrong answer', gem: null }),
        )
    }
  })

  const missed = $derived<Group>({
    key: 'missed',
    label: 'No answer',
    gem: null,
    players: unanswered.map((id) => who(id)),
    quiet: true,
  })

  const teamRows = $derived(teamMeans(teams, teamOf, results))

  /** A number as the question wrote it, with its unit. */
  function written(value: number): string {
    const unit = typeof reveal.unit === 'string' && reveal.unit !== '' ? reveal.unit : null
    return unit === null ? count.format(value) : `${count.format(value)} ${unit}`
  }

  /** What the right row is called: the answer itself where there is one to say. */
  const rightLabel = $derived.by((): { label: string; gem: Gem | null } => {
    const index = Number(reveal.answer_index)
    switch (type) {
      case 'multiple_choice':
        return { label: optionLabel(index), gem: GEMS[Math.min(index, GEMS.length - 1)] ?? null }
      case 'more_less':
        return { label: optionLabel(index), gem: null }
      case 'free_text': {
        const accepted = reveal.accepted as unknown[] | undefined
        return { label: `“${String(accepted?.[0] ?? '')}”`, gem: null }
      }
      case 'pick_from_list':
        return { label: vocab?.get(Number(reveal.answer_id)) ?? '…', gem: null }
      case 'price_is_right':
        return { label: `${formatGp(Number(reveal.value))} gp`, gem: null }
      case 'number_slider':
      case 'closest_number':
        return { label: written(Number(reveal.answer)), gem: null }
      case 'pick_all_that_apply':
        return { label: 'All right', gem: null }
      case 'ordering':
        return { label: 'All in place', gem: null }
      case 'matching':
        return { label: `All ${done}`, gem: null }
      case 'picture_pin':
        return { label: 'On the spot', gem: null }
      default:
        return { label: 'Right answer', gem: null }
    }
  })

  /** Everyone who could have answered, for each row's share. */
  const everyone = $derived(rows.length + unanswered.length)

  const panelRows = $derived(
    [
      {
        key: 'right',
        ...rightLabel,
        players: rows.filter(([, result]) => result.correct).map(([id]) => who(id)),
        right: true,
      },
      // With no heading over them, matching's "2 of 4" says what it counts.
      ...groups.map((group) => ({
        ...group,
        label: type === 'matching' ? `${group.label} ${done}` : group.label,
        right: false,
      })),
      { ...missed, right: false },
    ]
      .filter((group) => group.players.length > 0)
      .map((group) => {
        const players = [...group.players].sort(youFirst)
        const named = group.right || showNames ? players.slice(0, NAMES_SHOWN) : []
        const you = players.find((player) => player.you)
        const withYou =
          you !== undefined && named.length > 0 && !named.includes(you)
            ? [...named.slice(0, -1), you]
            : named
        return {
          ...group,
          named: withYou,
          more: withYou.length === 0 ? 0 : players.length - withYou.length,
          share: everyone === 0 ? 0 : group.players.length / everyone,
        }
      }),
  )

  const shown = $derived(
    [...groups, missed]
      .filter((group) => group.players.length > 0)
      .map((group) => {
        const players = [...group.players].sort(youFirst)
        const you = players.find((player) => player.you)
        let named = players.slice(0, NAMES_SHOWN)
        if (you !== undefined && !named.includes(you)) named = [...named.slice(0, -1), you]
        const sep = players.some((player) => player.guess !== null) ? ' · ' : ', '
        return { ...group, named, sep, more: players.length - named.length }
      }),
  )
</script>

{#if panel}
  <div class="panel results" role="group" aria-label="Results">
    {#if type === 'map_pin'}
      <PinRanking {reveal} {results} {unanswered} {nameOf} {youId} />
    {:else if rows.length === 0}
      <p class="got">Nobody answered this one.</p>
    {:else}
      <p class="got">
        <strong class="number">{right} of {everyone}</strong>
        {type === 'closest_number'
          ? 'guessed it exactly'
          : type === 'matching'
            ? 'got them all'
            : type === 'picture_pin'
              ? 'found the spot'
              : 'got it right'}
      </p>
    {/if}
    {#if type !== 'map_pin'}<ul class="rows">
        {#each panelRows as row (row.key)}
          <li class="row" class:quiet={row.quiet} class:right={row.right}>
            <span class="chip {row.gem ?? 'none'}" aria-hidden="true"></span>
            <span class="label">{row.label}</span>
            <span class="number">{row.players.length}</span>
            <span class="bar" aria-hidden="true"><i style:width="{row.share * 100}%"></i></span>
            {#if row.named.length > 0}
              <span class="names">
                {#each row.named as player, index (player.id)}{index > 0 ? ', ' : ''}<span
                    class="who"
                    class:you={player.you}
                  >
                    {player.you ? 'You' : player.name}
                  </span>{#if player.guess !== null}{' '}<span class="guess">
                      {player.guess}
                    </span>{/if}{/each}{#if row.more > 0}{` and ${row.more} more`}{/if}
              </span>
            {/if}
          </li>
        {/each}
      </ul>{/if}
    {#if teamRows.length > 0}
      <p class="head">Teams</p>
      <ul class="teams">
        {#each teamRows as row (row.team)}
          <li class="team" data-team={row.team}>
            <span class="logo"><TeamLogo team={row.team} /></span>
            <span class="label">{god(row.team).name}</span>
            <span class="number points">+{count.format(row.points)}</span>
          </li>
        {/each}
      </ul>
    {/if}
    {#if itemRows.length > 0}
      <p class="head">Items</p>
      <ul class="teams items">
        {#each itemRows as row (row.playerId)}
          <li class="team">
            <span class="logo">
              <ItemIcon id={row.item} charges={row.charges} size={24} label="" />
            </span>
            <span class="label">
              <span class="who" class:you={row.you}>{row.name}{row.you ? ' (you)' : ''}</span>
              {itemName(row.item, row.charges)}
            </span>
            <span class="number points">{signed(row.points)}</span>
          </li>
        {/each}
      </ul>
    {/if}
    {#if suggestedBy !== null}
      <p class="credit">Question by {suggestedBy}</p>
    {/if}
  </div>
{:else}
  <div class="tally">
    {#if type === 'map_pin'}
      <PinRanking {reveal} {results} {unanswered} {nameOf} {youId} />
    {:else if rows.length === 0}
      <p class="count">Nobody answered this one.</p>
    {:else}
      <p class="count">
        <strong class="number">{right} of {rows.length}</strong>
        {type === 'closest_number'
          ? 'guessed it exactly'
          : type === 'matching'
            ? 'got them all'
            : type === 'picture_pin'
              ? 'found the spot'
              : 'got it right'}
      </p>
      {#if shown.length > 0}
        <p class="head">Got it wrong</p>
        <ul class="groups">
          {#each shown as group (group.key)}
            <li class="group" class:quiet={group.quiet}>
              {#if group.gem !== null}<span class="chip {group.gem}" aria-hidden="true"></span>{/if}
              <span class="label">{group.label}</span>
              <span class="number">
                ({group.players.length})
              </span>{#if showNames}:{' '}{#each group.named as player, index (player.id)}{index > 0
                    ? group.sep
                    : ''}<span class="who" class:you={player.you}>
                    {player.name}{player.you ? ' (you)' : ''}
                  </span>{#if player.guess !== null}{' '}<span class="guess">
                      {player.guess}
                    </span>{/if}{/each}{#if group.more > 0}{` and ${group.more} more`}{/if}{/if}
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
    {#if teamRows.length > 0}
      <p class="head">Teams</p>
      <ul class="teams">
        {#each teamRows as row (row.team)}
          <li class="team" data-team={row.team}>
            <span class="logo"><TeamLogo team={row.team} /></span>
            <span class="label">{god(row.team).name}</span>
            <span class="number points">+{count.format(row.points)}</span>
          </li>
        {/each}
      </ul>
    {/if}
    {#if itemRows.length > 0}
      <p class="head">Items</p>
      <ul class="teams items">
        {#each itemRows as row (row.playerId)}
          <li class="team">
            <span class="logo">
              <ItemIcon id={row.item} charges={row.charges} size={24} label="" />
            </span>
            <span class="label">
              <span class="who" class:you={row.you}>{row.name}{row.you ? ' (you)' : ''}</span>
              {itemName(row.item, row.charges)}
            </span>
            <span class="number points">{signed(row.points)}</span>
          </li>
        {/each}
      </ul>
    {/if}
    {#if suggestedBy !== null}
      <p class="credit">Question by {suggestedBy}</p>
    {/if}
  </div>
{/if}

<style>
  .tally {
    margin: 1rem 0 0;
    padding-top: 0.75rem;
    border-top: 1px solid var(--line);
    font-size: 0.95rem;
  }

  p {
    margin: 0;
  }

  .count {
    color: var(--muted);
  }

  .number,
  .guess {
    font-family: var(--font-numeric);
    font-variant-numeric: tabular-nums;
  }

  .number {
    color: var(--ink);
  }

  .head {
    margin-top: 0.6rem;
    color: var(--muted);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .groups {
    margin: 0.2rem 0 0;
    padding: 0;
    list-style: none;
  }

  .group {
    margin-top: 0.2rem;
    overflow-wrap: anywhere;
  }

  .quiet,
  .quiet .number {
    color: var(--muted);
  }

  .label {
    font-weight: 600;
  }

  .quiet .label {
    font-weight: 400;
  }

  /* The option's gem, at text size, in the theme's own fill: the button it names is
     right above it, so the two have to match. */
  .chip {
    display: inline-block;
    width: 0.7em;
    height: 0.7em;
    border: 1px solid color-mix(in srgb, var(--fill) 55%, var(--gem-ink));
    border-radius: 2px;
    background: var(--fill);
    vertical-align: -0.05em;
  }

  .sapphire {
    --fill: var(--gem-sapphire);
  }
  .emerald {
    --fill: var(--gem-emerald);
  }
  .ruby {
    --fill: var(--gem-ruby);
  }
  .red-topaz {
    --fill: var(--gem-red-topaz);
  }
  .dragonstone {
    --fill: var(--gem-dragonstone);
  }
  .zenyte {
    --fill: var(--gem-zenyte);
  }

  .who.you {
    font-weight: 600;
  }

  .guess {
    color: var(--muted);
  }

  /* One column, narrow enough that each team's points stay beside its name. */
  .teams {
    display: grid;
    gap: 0.3rem;
    max-width: 16rem;
    margin: 0.3rem 0 0;
    padding: 0;
    list-style: none;
  }

  .team {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
    padding-left: 0.45rem;
    border-left: 3px solid var(--team-trim);
  }

  .team .logo {
    flex: none;
    width: 1.3rem;
    height: 1.3rem;
  }

  .team .label {
    flex: 1;
    min-width: 0;
  }

  .points {
    font-weight: 600;
  }

  /* The room's results panel: a row per answer, its share as a bar, its names under it. */
  .results {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 0;
    padding: calc(1rem - var(--border-give));
    font-size: 0.95rem;
  }

  .got {
    color: var(--muted);
  }

  .got .number {
    font-size: 1.35rem;
    font-weight: 700;
  }

  .rows {
    display: grid;
    gap: 0.65rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    display: grid;
    grid-template-columns: 0.8rem minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.25rem 0.5rem;
    overflow-wrap: anywhere;
  }

  .row .chip {
    width: 0.8rem;
    height: 0.8rem;
  }

  .row .chip.none {
    visibility: hidden;
  }

  .row .number {
    font-weight: 700;
  }

  .row .bar {
    grid-column: 2 / 4;
    position: relative;
    height: 6px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--ink) 12%, transparent);
    overflow: hidden;
  }

  .row .bar i {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 3px;
    background: var(--ink);
  }

  .quiet .bar i {
    background: var(--muted);
  }

  .names {
    grid-column: 2 / 4;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .names .you {
    color: var(--ink);
  }

  .results .credit {
    margin-top: 0.25rem;
  }

  .credit {
    margin-top: 0.35rem;
    color: var(--muted);
    font-style: italic;
    overflow-wrap: anywhere;
  }
</style>
