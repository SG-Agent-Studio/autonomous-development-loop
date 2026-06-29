Users feedback on some observation when their agents executing skill @skills/autonomous-feature-development/ .

The feature development loop in stage 0 + 1 is done well. But some issues they observed for other stages.

Let's explore the skill and plan for the solution.

---

## [ ] Issue 1 - Orchastration issue

The agent executing `autonomous-feature-development` supposed to be an orchastrator and it should deligate tasks to subagents.

But in stage 2 and stage 3, the main agent executed verify process and fix issues by itself. Aslo, when receiving code review, it fix the issues.

## [ ] Issue 2 - Review loop issue

The stage 3 code review stage is only being executed once.

The plan is to run multiple review until no actionable is raised.

And all actions supposed to be done by different subagents, no subagent should be tasked to do multiple thing.

Every chages done in this stage, should go back to stage 2 for verify again before the next review loop is triggered.

## [ ] Issue 3 - Code review log issue

The code review is not being log in the log folder. Every run of the code review should be recorded in a new markdown file in `.loop-logs/code-review/` folder.

## [ ] Issue 4 - Logs location

Currently the logs are directly placed in the folder `.loop-logs`:

```
[repo-root]/.loop-logs/logs/
[repo-root]/.loop-logs/tasks/
[repo-root]/.loop-logs/errors/
```

However, this bring up an issue, when user executing multiple plan at the same time or forgot to cleanup the logs, then the logs are mixed together, hard to identify.

I think can store the logs by the task.

```
[repo-root]/.loop-logs/[id]/logs/
[repo-root]/.loop-logs/[id]/tasks/
[repo-root]/.loop-logs/[id]/errors/
```

Example of `id`: `2026-06-29-{short-task-description}`

## [ ] Issue 5 - Lack of clean up skill

User feedback that they want to have clean up skill, which is set to be only human can trigger.
So that they can ask agent to clean up the log files for certain plan.
