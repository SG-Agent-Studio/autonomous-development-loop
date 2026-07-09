# User feedbacks on 2026-07-09

## [ ] Issue 1 - Just command missing

Not everyone is using `just` command. But using of `just` is baked into the skills in @skills/autonomous-feature-development/ .
In this case, the agents will flag out the `just` command missing in the repo.

### Actionable to modify skill

- Remove just commands from the skill.
- Agent should explore codebase if there is existing command for `lint` or other commands (eg. code formatting, running tests). For example, PNPM / NPM commands or uv commands.
- If no command found, clarify with users what command to run, and bake them into the memory files (eg. `CLAUDE.md`, `AGENTS.md` or others).

## [ ] Issue 2 - fallback for MCP servers

In this plugin, the Playwright MCP is configured for verifiying implementation. However, there are cases that MCP is disabled for the agent.

In this case, agent should generate a detailed verification plan to verify the work, according to the requirements in @skills/autonomous-feature-development/stage-verify.md . So that human can take over the verification work after agent completed the implementation.

### Expected behaviour

After implementation is completed by agent/sub agents, prompt the user to take over verification.
Create a .md file and create a checklist for user to go through the detailed verification plan to gather feedback from user and iterate accordingly

## [ ] Issue 3 - Fallback for auto commit

User might have set rules or memory to disallow the agent from creating git commits. The works in the git worktree should be carry over to the branch, then human will review and commit manually.

After the subagents work are done, the changes are carried over, but the git worktree is not clean up properly.

### Expected behaviour

After all subagents completed and ready to commit state, all changes should just be reflected unstaged in the branch itself. The `.worktree` folder cleaned up.
