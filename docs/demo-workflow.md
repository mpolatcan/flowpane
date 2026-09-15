# The demo workflow

The one run the repository keeps, and every case of the drawing it exercises.

`dev/audit.workflow.js` is there to give the pane something to draw while it is
being worked on, and to measure it against: a benchmark is only useful if every
run of it draws the same shape. It sits under `dev/` with the other tools rather
than in the installed plugin — flowpane draws whatever workflows a project
already runs, and shipping a repository audit of its own as a skill would put a
second, unrelated thing in front of everyone who installs the pane. Run it from
a checkout: hand the script to the Workflow tool for a real run, or use
`dev/dryrun.ts` below for the stubbed pass.

It is a read-only audit of the repository it is run in. It surveys a handful of
files, branches code from prose on what the surveying agent answers, keeps
digging at each file until a pass turns up nothing new, tries to refute what it
found, escalates only what survives as blocking, and writes a report. Nothing is
written to disk. Pass a JSON array of paths as `args` to audit those instead of
the defaults. Two to five minutes, twenty to thirty agents.

One run puts every case the pane can draw in front of it:

| Case | How the run makes it happen | What the pane shows |
| --- | --- | --- |
| Branch | the `Survey` agent answers `code` or `prose`, and the script sends the file to `Review` or to `Check` on that answer | two declared lanes of different widths, neither holding every file |
| Loop | a fresh lens each pass — correctness, then edges, then drift — stopping when a pass reports nothing the earlier passes had not | one to three nodes per file in the `Review` lane, labelled `review:paint:edges` |
| Skip, mid-chain | a file with no findings throws, so `pipeline()` drops it and skips its remaining stages | a chain that reaches `Review` and goes no further |
| Skip, whole phase | `Escalate` is entered only for a finding that survived refutation *and* is blocking | a declared phase drawn as never entered, not as failed |
| Fan-out | `Verify` spawns one agent per finding, so its width is decided by what the review found rather than by the script | a lane several times wider than the ones above it, folded to fit the pane |
| Models | `Survey` and `Check` on haiku, `Review` and `Verify` on sonnet, `Escalate` and `Report` on opus | three models side by side in one run, and a legend on the run line that counts each |
| Tool calls | `wc -l` and `git log` in `Survey`, Read and Grep in `Review` and `Check`, `sed -n` in `Verify`, and a schema on all three | the busy tool named on a node while it runs, the count after it lands, and every call with its input in the detail dialog |
| Long edge | the `Report` prompt quotes each `Survey` headline verbatim, four lanes back | an edge too long to thread between the bands, drawn as a rail in the margin |

Every skip is `log()`ged as it happens, so the narrator line says what was
dropped rather than leaving the gap unexplained.

`bun dev/dryrun.ts dev/audit.workflow.js` runs the same control flow
against stubbed agents in under a second. Use it to check what a change to the
script will draw before paying for a real run:

```
Survey    5   haiku    survey:paint  survey:layout  survey:journal  survey:README  survey:plugin
Review    5   sonnet   review:paint:correctness  review:journal:correctness  review:journal:edges  …
Check     2   haiku    check:layout  check:README
Verify    9   sonnet   verify:journal:L80  verify:README:L90  …
Report    1   opus     report
declared but never entered  Escalate
dropped  hooks/paint.ts: hooks/paint.ts is clean: nothing to verify
```
