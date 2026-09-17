#!/bin/sh
# Puts the working tree in front of a live Claude Code session, beside the
# released plugin rather than in place of it.
#
# The dev marketplace at ~/claude-dev-marketplaces/flowpane-dev holds a copy of
# this repo. A copy, not a symlink: a symlinked plugin source installs files that
# look right — the engine's cache comes out byte-identical to the tree — and then
# never loads, with no error printed anywhere. `/flowpane` comes back `Unknown
# command` while `claude plugin details` still reports the plugin as installed.
#
# The copy is then renamed to `flowpane-dev`, because the two builds collide on
# every name they register: one command name, one pane id, one `tool.call` hook
# opening one pane. Renamed, both can be enabled at once — the released
# `/flowpane` keeps working while `/flowpane-dev` draws this tree. The names are
# patched in the copy, never in the repo, so what ships is unchanged.
#
# Only the names the engine keys off. The title the pane draws is left alone: a
# build is told apart by the version it already prints, and a product name bent
# out of shape to serve a dev install is a dev install leaking into the picture.
#
# The engine installs its own copy under the manifest's version, and an install
# over a version already installed is a no-op, so the cached copy goes first.
# Restart the session afterwards — hooks are read once, when it starts.
#
#   sh dev/reload.sh
set -e

root=$(cd "$(dirname "$0")/.." && pwd)
market=$HOME/claude-dev-marketplaces/flowpane-dev
plugin=$market/plugins/flowpane-dev
version=$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' "$root/.claude-plugin/plugin.json" | head -1)

rsync -a --delete --exclude .git --exclude node_modules "$root/" "$plugin/"

# The names the engine keys off, moved aside by one word.
sed -i '' 's/"name": "flowpane"/"name": "flowpane-dev"/' "$plugin/.claude-plugin/plugin.json"
sed -i '' "s/^const PANE_ID = 'flowpane'/const PANE_ID = 'flowpane-dev'/" "$plugin/hooks/register.ts"
sed -i '' "s/^export const COMMAND = 'flowpane'/export const COMMAND = 'flowpane-dev'/" "$plugin/hooks/register.ts"

# The marketplace entry names the version the install resolves, so it moves with
# the manifest or the install asks for one the copy no longer is. The
# marketplace's own metadata version is its own and is left where it is, which a
# blanket replace over the file did not manage.
python3 - "$market/.claude-plugin/marketplace.json" "$version" <<'JSON'
import json, sys

path, version = sys.argv[1], sys.argv[2]
market = json.load(open(path))

for entry in market['plugins']:
    entry['version'] = version

json.dump(market, open(path, 'w'), indent=2)
open(path, 'a').write('\n')
JSON

# Every cached version, not the one about to be installed: the engine treats a
# plugin already in its list as installed whatever version the marketplace now
# offers, so the old copy has to stop existing and the record has to go with it.
rm -rf "$HOME/.claude/plugins/cache/flowpane-dev/flowpane-dev"
claude plugin uninstall flowpane-dev@flowpane-dev --scope user >/dev/null 2>&1 || true
claude plugin marketplace update flowpane-dev >/dev/null
claude plugin install flowpane-dev@flowpane-dev --scope user -y

echo "flowpane-dev $version from $root — /flowpane-dev in a new session"
