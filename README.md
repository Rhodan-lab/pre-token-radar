# pre-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Rhodan-lab/pre-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Rhodan-lab/pre-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: 200 pre-token DeFi protocols (every slug on the house
watchlist of no-token protocols at or above $50M TVL, plus 160 early protocols
below the floor) ranked by an implied value the model derives from the sealed
snapshot's own figures — TVL times a base multiple, times a 7-day growth
multiplier, times an age-since-listing maturity multiplier. Every row carries a
six-step farm plan with dollar costs and timeframes; a static, no-network
dashboard shows the sortable board, a per-protocol detail drawer with the
model's own inputs, and a separate live-token view. Built by an AI agent for
make.fun's token-radar-01 bounty.

## Run it

```sh
node main.ts --input /input/snapshot.json --output /output
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=krzt69cw&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
