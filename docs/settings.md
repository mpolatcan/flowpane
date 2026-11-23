# Settings and themes

The five settings, how they are configured, and how a theme becomes a palette.

`/plugin configure flowpane`, or `pluginConfigs` in settings.json:

| Field | Values | What it does |
| --- | --- | --- |
| `orientation` | `horizontal`, `vertical`, `timeline`, `list`, or `auto` (default) — the last spelled `fits` in `/flowpane` and in the settings, and the first two also `across` and `down`. The names three of them carried before 0.5.0 — `flow`, `stack`, `time` — still select their layouts, so a layout picked on an earlier build survives the upgrade | `horizontal` runs the phases across the pane, `vertical` runs them down it, `auto` follows the pane's proportions. A node is the same size in every one of them at every size of pane: the drawing is laid out whole and the pane is a window on to it, so what it cannot hold it scrolls to and the rails say which way. `list` draws a row per agent under each phase with no edges between them — the compact reading of a long run, and where the loop rail, the fan stem and a nested run's gutter are drawn. `timeline` swaps the graph for a trace view: a ruled time axis, one bar per agent on it, grouped by phase and indented under the nested runs they belong to, with a marker where now is. |
| `detailRows` | 5–32 (default 24) | Rows the detail dialog takes when a node is selected, capped at what the pane can inset. |
| `feedRows` | 0–10 (default 4; 0 = off) | Rows of the activity strip at the foot of the pane: the newest file changes, commands and gate verdicts, one line each. A pane that would keep fewer than sixteen rows of drawing shows none. See [activity.md](activity.md). |
| `paneRows` | 6–80 (0 = let the surface decide) | Rows the pane asks for. A dock beside the transcript usually picks its own height. |
| `theme` | `tokyo-night` (default), `catppuccin`, `gruvbox`, `nord`, `dracula`, `solarized`, `monokai`, `vscode-dark`, `insider-one`, `github-light`, `solarized-light`, `insider-one-light` | The palette everything is drawn in, its ground included. The pane always paints on that ground, footer and all, so the drawing reads the same in every terminal rather than against whatever the terminal happens to be; the ground stops at the drawing's own right edge — see [engine.md](engine.md). |

## Themes

A theme is declared as the ten colours a terminal theme actually ships — a
ground, a surface, a foreground, a grey, and six hues — and every colour the
drawing uses is derived from those: running is the theme's yellow, done its
green, failed its red, the spend its purple, the model its cyan, an idle agent a
mix of its grey and its surface. Declaring all thirteen roles per theme would be
eighty values to keep in step, and the first one to drift would make the pane
read as a different theme in one corner.

Stopped is a role of its own: the theme's grey pulled three tenths of the way to
its foreground. An agent the run never let finish did nothing wrong, so it is
neutral — the red belongs to the one state that means something broke, and two
states in one hue make a reader check which is which. It is not the idle grey
either, which is the tone the pane uses for *nothing happened here*: a killed
run and a phase nobody reached are not the same news, and this grey sits up near
the words while that one sits down near the ground. The run line, the mark on a
node, the word on a timeline row and the heading in the run menu all take it, so
the state is one colour wherever it is said.

Every derived role is then held to a contrast floor. Terminal themes are not
designed against one: on nord, dracula and solarized the theme's own grey sits
under WCAG's 3.0 against the theme's own ground, and the roles built from it —
the idle tone, the dim text, the stopped grey — sat under it too, which put the
tone that says *this phase was skipped* at 2.66 on solarized. A role that falls
short is moved along its own lightness, a hundredth at a time, until it clears
its floor, so a colour that is already legible is kept exactly and one that is
not gives up the least it can. Legible is not the only test a colour has to pass:
the states also have to stand apart in hue, below, and on gruvbox and the two
solarized palettes that moves the theme's own green. A palette picked by name is
that palette wherever it already reads, and changed only where it would not.

Four palettes come through untouched: catppuccin, dracula, vscode-dark and
github-light. Five give up one or two roles to contrast, most often the failed
red: tokyo-night, nord, monokai, insider-one and insider-one-light. Three move
further. gruvbox has its green turned and its red lifted. solarized gives up
five roles and solarized-light seven, since the theme's own grey and its accents
sit close to its ground on both. `bun dev/contrast.ts` prints every role beside
the theme's own colour it came from.

Along its own lightness, so the hue and the saturation stay. The lift used to be
a mix — first toward the theme's foreground, which on solarized-light dragged
the running yellow to `#827a40`, an olive that read as a third grey; then toward
white or black, which kept the hue but still greyed the colour on the way. That
mix is why the floors were set low: at 4.5 it pulled a muted palette's `done`
and `model` so far toward white that they stopped reading as green and cyan.
Held in lightness instead, solarized's green comes out a lighter green and its
cyan a lighter cyan. The mix is kept only as the last step, for a colour no
lightness clears the floor with.

Three floors, because the roles do three jobs:

| Floor | Roles | Why |
| --- | --- | --- |
| 7.0 | the text | Every other word stands somewhere between the text and the ground, and they need room to stand apart from it. The two solarized palettes put their text at 5.6 and 5.0, which left a cut-off card's frame held to 4.5 nearly the colour of the words inside it. |
| 4.5 | the four states, the clock, the token count, the model, the accent, the dim text | Everything else the pane writes in words: WCAG's bar for body text. These were held to 4.0, and the dim text to 3.0, while the lift greyed what it moved. |
| 3.0 | the idle tone, the wire | Marks and lines rather than words: WCAG's bar for a graphic. |

The one role with no floor is the track — the ground of an empty meter and the
tone of a rule. What it has to say is that nothing is there, and a track a
reader can see clearly is a meter that looks half full when it is empty. Across
all twelve themes it is the only role that measures under 3.0. `bun
dev/contrast.ts` prints the table and exits non-zero when a role falls short.

The states are held apart on the wheel as well as off the ground. `done`,
`running` and `failed` are told apart by hue first, and a terminal theme is not
drawn against that: gruvbox's green is a yellow-green 19 degrees from its own
gold, and solarized's 22, so a finished card and a working one were one colour
at a glance and only the mark in the corner differed. Where the green or the red
stands under 40 degrees from the yellow it is turned round the wheel, the way it
already leans, until it stands 40 off — keeping its saturation and lightness —
so gruvbox's green becomes a truer green rather than an orange. Ten of the
twelve palettes clear 40 as they ship, and two move.

Twelve of them ship: `tokyo-night`, `catppuccin`, `gruvbox`, `nord`, `dracula`,
`solarized`, `monokai`, `vscode-dark` and `insider-one` on dark grounds,
`github-light`, `solarized-light` and `insider-one-light` on light ones. The
first eight are the terminal themes people already run; `insider-one` is built
from what insiderone.com is actually set in — the near-black `#261a28` it sets
type in, the warm off-white `#efebe4` it sets that type *on* rather than plain
white, and orange as the one accent (`#ff6900`, and the `#f4482b` glow behind
its cards). `insider-one-light` is the same pairing the way the site itself uses
it, paper under ink.

Read off the page's CSS custom properties instead, the theme came out indigo on
navy: `--blue: #2047ed` and `--navyblue: #051236` are Bootstrap's own defaults
carried through the WordPress theme, and nothing on the page is drawn in either.
A declaration is not a decision. What the site is recognisably made of is the
off-white, the near-black and the orange, which is what the theme is made of.

Orange crowds three of the pane's roles at once — accent, running and failed are
all warm — so the accent keeps the brand's orange and the other two are pushed
apart from it: gold for running, a true red for failed. A drawing where *this
agent is running* and *this one broke* are two shades of the same orange says
neither.

The edges are the fourth. They were the theme's blue mixed a fifth of the way to
its grey; they are the theme's hue unmixed now, because on a palette whose blue
is already muted — gruvbox's is a grey-green — the fifth of grey left every line
between two phases the colour of the boundaries. That was a blue line on the ten palettes whose blue is blue and a
red-orange line on the two whose accent is a brand colour — nineteen degrees off
their own gold and their own red, close enough that a wire on the light one read
as a row of small failures. An edge is not a state: what it has to say is that
two agents are joined, and which state they are in is said by the cards at its
ends. So the hue is chosen rather than fixed. The blue is taken where it stands
at least 45 degrees off every one of done, running and failed — which it does on
ten of the twelve, by 56 degrees at the closest — and where it does not, the
edges take whichever of the purple and the cyan stands furthest from all three.
On both Insider palettes that is the purple, and the wires come out violet at 92
and 96 degrees of clearance. The bar sits at 45 because that is where the gap
in the measurements is; no other palette moves. `bun dev/contrast.ts` prints
that table under the contrast one.

The light ones needed no special case. Every role is checked against the theme's
own ground and lifted away from it, so the arithmetic never assumes which way
round the two are: `readable` compares white and black against the ground and
moves the colour's lightness toward whichever of them the ground is further
from. What changes on a light ground is only which way that lift runs.

The choice is remembered per session in the plugin's own store, and the ◐ button
walks the list. `/flowpane theme` prints it with `(on)` against the current one.
