# Settings and themes

The four settings, how they are configured, and how a theme becomes a palette.

`/plugin configure flowpane`, or `pluginConfigs` in settings.json:

| Field | Values | What it does |
| --- | --- | --- |
| `orientation` | `horizontal`, `vertical`, `timeline`, or `auto` (default) — the last spelled `fits` in `/flowpane` and in the settings | `horizontal` runs the phases across the pane, `vertical` runs them down it, `auto` follows the pane's proportions. Both keep the same bargain in both directions: while a section can carry a name and stand two of its cards, the pane divides itself between the phases; past that the sections take the room they need, the drawing runs past the pane's edge and the body scrolls to the rest. Below the width a band needs for legible boxes at all, `vertical` becomes a flat list: one agent per row under each phase, no edges drawn. `timeline` swaps the graph for a trace view: a ruled time axis, one bar per agent on it, grouped by phase and indented under the nested runs they belong to, with a marker where now is. |
| `detailRows` | 5–32 (default 24) | Rows the detail dialog takes when a node is selected, capped at what the pane can inset. |
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
the idle tone, the dim text, the stopped red — sat under it too, which put the
tone that says *this phase was skipped* at 2.66 on solarized. A role that falls
short is mixed away from the ground a twentieth at a time until it clears its
floor, so a theme that is already legible keeps its colours exactly and one that
is not gives up the least it can.

Away from the ground, not toward the foreground. Mixing a role toward the
theme's own foreground drags its hue along: on solarized-light, whose foreground
is a dark slate, the yellow that says *running* came out `#827a40`, an olive
that reads as a third grey rather than as a warning. Mixed toward black instead
— white on a dark ground, black on a light one — the same role comes out
`#916e00`, which is the theme's yellow with the light taken out of it. The hue
is what the role means; the lift is only how far it stands off the page.

Two floors, because the roles do two different jobs. The ones a reader reads —
the four states, the clock, the token count, the model, the accent — clear 4.0.
The ones a reader reads past — the idle tone, the dim text, the wire — clear
3.0. Both are under the 4.5 wanted for body text, because the pane is a drawing:
held to 4.5 the quiet roles stop being quiet, and the layer meant to be read
past starts competing with the layer meant to be read. Before the second floor
the meaning-carrying roles sat where the quiet ones did — solarized-light's
model at 3.02 and its done green at 3.04, nord's failed at 3.05, monokai's
stopped at 3.10 — which is legible in the sense that a reader can find the cell,
and not in the sense that they can tell green from grey at a glance.

The one role with no floor is the track — the ground of an empty meter and the
tone of a rule. What it has to say is that nothing is there, and a track a
reader can see clearly is a meter that looks half full when it is empty. Across
all twelve themes it is the only role that measures under 3.0. `bun
dev/contrast.ts` prints the table.

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
its grey, which is a blue line on the ten palettes whose blue is blue and a
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
mixes toward whichever of them the ground is further from. What changes on a
light ground is only which way that lift runs.

The choice is remembered per session in the plugin's own store, and the ◐ button
walks the list. `/flowpane theme` prints it with `(on)` against the current one.
