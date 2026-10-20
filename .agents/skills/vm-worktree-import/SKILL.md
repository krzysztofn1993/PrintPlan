---
name: vm-worktree-import
description: Import a Git branch and its pending worktree changes from a local Multipass VM into the current repository. Use when the user provides a VM name, source worktree path, and source branch.
---

# Import a VM Worktree

Bring the selected branch and the source worktree's current tracked and untracked changes into the repository open in this session. The destination branch uses the source branch name and starts from local `master` unless the user specifies another base or destination name.

## Inputs

Collect these values from the request or ask only for missing ones:

- Multipass VM name.
- Absolute path to the source worktree inside that VM.
- Source branch name checked out in that worktree.

Treat all three as data, not shell fragments. Quote paths and names when constructing commands. Validate branch names with `git check-ref-format --branch`.

## Workflow

1. Confirm the current directory is the intended destination Git repository. Read its status, confirm it is clean, and confirm the requested base branch exists. Default base: `master`.
2. Check the VM with `multipass list`. If it is stopped, ask before starting it. Do not access a different VM as a fallback.
3. Inspect the source worktree without changing it:
   - Confirm the path is a Git worktree and its checked-out branch equals the requested source branch.
   - Record its `HEAD`, status, and untracked non-ignored paths.
   - Confirm the source branch has a merge base with the destination base branch. If there is no shared history, stop and explain.
4. Prepare temporary transfer artifacts on the VM:
   - A Git bundle containing the source branch and its `master` ref, when present.
   - A binary patch from source `HEAD` to the current worktree (`git diff HEAD`), which carries staged and unstaged tracked edits.
   - A tar archive of untracked, non-ignored files. Do not include ignored files, credentials, environment files, or generated dependencies/build output unless the user explicitly asks for them.
   - If the source directory is not accessible to the VM's normal user, request the required command approval; do not change its ownership or permissions.
5. Transfer the artifacts to temporary files inside the destination repository (not `.git`). If `multipass transfer` cannot read a VM-side artifact, copy only that artifact to a VM-user-readable temporary location, without changing the source worktree.
6. Before creating the destination branch, confirm that the destination is still clean and that no local branch with the target name already exists. If either check fails, stop without overwriting or deleting user data.
7. Fetch the bundled source branch into a unique temporary Git ref. Create the target branch from the chosen base branch, then merge the fetched source branch so its commits remain in history. If Git reports conflicts, leave the branch and conflict state intact and report what needs resolution; do not reset or abort automatically.
8. Apply the tracked worktree patch and extract untracked files. Check archive paths for collisions first. If the patch or extraction conflicts with destination content, stop and preserve the branch state for review.
9. Verify the target branch name, its base, imported commit history, and `git status`. Remove only the temporary transfer artifacts and temporary Git ref created by this run. Leave source VM, source worktree, imported uncommitted edits, and untracked files intact.
10. Report the destination branch, base commit, imported source `HEAD`, and any pending worktree changes. Do not commit, push, or run project tests unless asked.

## Boundaries

- This workflow uses the local Multipass VM and Git only. Do not fetch from a remote or use other VMs unless the user asks.
- Never discard source or destination changes, overwrite an existing destination branch, or silently omit tracked/untracked source work.
- If access, approval, or a conflict blocks a step, stop at that point and clearly report the state already created.
