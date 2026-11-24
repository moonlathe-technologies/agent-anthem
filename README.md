# Agent Anthem

Your Claude Code agent gets its own theme tune. Hear when it's busy, hear when something fails, and never miss the
moment it finishes, without watching the terminal.

- **Calm** while you read and think.
- **Busier** while the agent works: the more it does, the more the band joins in.
- **A minor turn** when a command or a test fails.
- **A settle home** when it finishes, so you know it's your turn without looking.
- **A soft bell** when it's waiting for your permission.

Four styles: **Drift** (analog pads, echoing arps, electric piano), **Classical** (recorded piano, cello and violins),
**Dance** and **Rock** (driven guitars, bass and a full kit). The music is made on the fly, so it never loops.

**Your night city:** while you work, a city grows across the top of the page. Every tool call lights a window, every
finished task tops out a tower with fireworks, and a signal shines in the sky when Claude needs you.

**The shared city:** join if you like, and your towers stand in front of everyone else's, whose lights go on and off
as they work.

**Your session as a song:** one button turns your latest session into a minute of music with a picture of how it
went, saved as a video you can post.

## Install

In Claude Code:

```
/plugin marketplace add moonlathe-technologies/agent-anthem
/plugin install agent-anthem@agent-anthem
```

Start a new session, then open **http://localhost:4777** and press **Start the music**. The server starts by itself
with each session. Needs Node.js 18 or later.

## Private by design

Everything runs on your machine. The plugin passes each hook to a small server on 127.0.0.1, which keeps only what
the music needs (the kind of moment, the tool's name, the project folder's name) in memory. It never stores or sends
your prompts, code or output, and it fetches nothing from the internet: the instrument samples ship with it. Your
city is kept in your browser.

The shared city is off until you press **Join the shared city**. Then the page sends anthem.moonlathetechnologies.com
your builder name (a random one like "Copper Heron" unless you change it) and numbers only: your tower and window
totals and the size of your newest towers. Never code, prompts, file or project names, and no IP addresses are kept.
**Leave the shared city** takes your towers down. The server's code is in `city-server/`.

## Settings

- `AGENT_ANTHEM_PORT`: use another port (default 4777).

## Credits

Code: MIT licence. Recorded instruments from [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments)
by Nicholas Brosowsky, CC BY 3.0. See NOTICE.

Made by [Moonlathe Technologies](https://moonlathetechnologies.com/), a small UK software studio.
