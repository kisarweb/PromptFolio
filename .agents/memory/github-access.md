---
name: GitHub access
description: How to reach the user's GitHub (kisarweb) from the agent
---
The Replit GitHub connection does not give the agent API or push access (gh, git credentials and the connectors all failed). Use the `GITHUB_TOKEN` secret, a token the user created, for both: `GH_TOKEN="$GITHUB_TOKEN" gh ...` and pushes to `https://kisarweb:$GITHUB_TOKEN@github.com/...`.
**Why:** a fine-grained token needs Contents: Read and write on the repo to push; without it the push returns 403.
**How to apply:** the public repo kisarweb/PromptFolio started as a single squashed "start commit" made with commit-tree; no git remote is saved locally.
