# Tools

Scripts for tuning the scoring rules against real seasons. Nothing here is
served by the site.

## Simulate the league on real seasons
```sh
node tools/simulate.js              # current rules
node tools/simulate.js --variants   # plus ideas layered on top (weekly floor, etc.)
node tools/simulate.js --runs 200   # quicker, noisier
```
It replays every season in `tools/seasons/` through `public/js/scoring.js` with
seven simulated pickers and reports:
- how often last place (at the merge, mid-merge, before the finale) still finishes top 2,
- how often the leader going into the finale loses the title,
- each picker's win share (skill should matter without deciding everything),
- where the final gap between first and last comes from, by rule.

**Testing a rule change:** run it, edit the value in `public/js/scoring.js`, run
it again, and compare. Picks are simulated (real fans don't pick like this), so
compare rule sets against each other rather than reading any number as a forecast.

## Season data
`tools/seasons/s41.json` … `s50.json` are US seasons 41–50 in this league's data
format: every reward, immunity, chosen guest, advantage found, vote, idol, Shot
in the Dark, and boot, plus the winner, the merge episode, and each castaway's
finishing place. Opt-outs aren't included (the source doesn't say whether a
sit-out was voluntary).

To add a finished season (downloads the source data once):
```sh
node tools/convert-seasons.js 51
```
It refuses to save a season that doesn't pass the scoring engine's data check.

Source: the [survivoR](https://github.com/doehm/survivoR) dataset,
MIT License, Copyright (c) 2021 Daniel Oehm.
