# Agent Lab

**Live: https://nsalin.github.io/agentlab/**

Agent Lab helps you decide what to build for your AI coding assistant - a prompt, a skill, an agent or a
subagent - and writes the files for **GitHub Copilot**, **Claude Code** or **OpenAI Codex**. It is a
static page that asks questions and fills in templates: no AI runs on the page, and nothing you type
leaves your browser.

## What you can do

- **Explore** - answer eight short questions about a task that keeps costing you time. You get an honest
  verdict (including "don't build this") and, for bigger requests, a build plan in small pieces with a
  starter file for each piece and one command that creates them all without overwriting existing files.
- **Create** - finish the result: the assistant's files (agents, subagents, skills and prompts), a brief
  for whoever builds it, or an approval record for whoever signs it off.
- **Setup** - describe your role and experience, and install a Mentor that coaches you at your level in
  your assistant.

Choose your role (**I'm a**) and your assistant (**I write with**) at the top of the page.

## Supported assistants

| | GitHub Copilot | Claude Code | OpenAI Codex |
|---|---|---|---|
| Agent | `.github/agents/<name>.agent.md` | `.claude/agents/<name>.md`, started with `claude --agent <name>` | a skill in `.agents/skills/<name>/SKILL.md`, started with `$<name>` |
| Subagent | `.github/agents/<name>.agent.md` | `.claude/agents/<name>.md` | `.codex/agents/<name>.toml` |
| Skill | `.github/skills/<name>/SKILL.md` | `.claude/skills/<name>/SKILL.md` | `.agents/skills/<name>/SKILL.md` |
| Prompt | a skill you run as `/<name>` | a skill you run as `/<name>` | a skill you run as `$<name>` |
| MCP access | `tools: [..., <server>/*]` | `tools: ..., mcp__<server>__*` | the MCP servers in your Codex `config.toml` |

Model levels (Inherit, Fast, Strong) are translated for each assistant, or you can give an exact model ID.

## Tools and MCP

Pick the tools your work uses from a catalogue of 99, in two groups:

- **Code:** source control, build and CI/CD, testing tools, logs and monitoring, SQL and NoSQL databases,
  programming languages.
- **Teamwork:** story trackers, documentation, test management, communication, design, diagrams,
  incidents and on-call.

Every category also takes tools that are not listed, and "Find a tool" searches names, common aliases
and categories.

- A tool **without MCP** is context: the generated files name it, follow its conventions and ask you for
  what they cannot reach.
- A tool **via MCP** is granted to the generated files, which say how to use it safely: start from exact
  identifiers, read first, and ask before any change. Read-only helper subagents are offered only for
  MCP servers.

## Privacy

Everything runs in your browser. Your answers are not stored or sent anywhere; the page remembers your
role, time in role and assistant only if you tick "Remember on this browser only". The site has no
analytics and no third-party assets, and the files it writes do not report their use. GitHub Pages may
log visits, as any host can.

## Run it locally

There is no build step and there are no dependencies. Open `index.html` in a browser, or serve the folder:

```
python -m http.server 8080
```

and open http://127.0.0.1:8080.

## Before you use a generated file

The files are starting points. MCP server IDs and subagent names must match your own setup, and
instructions such as "read only" are not security enforcement: configure tool permissions, read-only
credentials and approvals in your assistant and in the services it reaches. Test a known case, a
missing-evidence case and a forbidden action before you share a file with your team.

## License

[MIT](LICENSE)
