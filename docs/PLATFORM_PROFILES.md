# Platform Profiles & Proportionality

Universal rules remain constant; optional profiles name hazards and relevant checks. They are **guidance**, not automatically runnable tests.

| Profile | Typical risks / appropriate gates |
| --- | --- |
| [Minecraft Bedrock](../profiles/minecraft-bedrock.md) | Addon manifests, persistent world identity, matching packs, BDS and client acceptance |
| [Arma](../profiles/arma.md) | Config syntax, addon dependencies, PBO integrity, signed server compatibility |
| [Godot](../profiles/godot.md) | Project assets, engine/export version, imported resources, saved games |
| [Python](../profiles/python.md) | Dependency locking, tests/lint, packaging, environment variables |
| [Discord](../profiles/discord.md) | Tokens, permissions, intents, command registrations, state and rate limits |
| [Generic](../profiles/generic.md) | Requirements, tests, artifact/release identification appropriate to scope |

Add a new profile only when it introduces materially different risks; don't clone the entire engineering standard into each profile. A project may select multiple profiles (e.g. Python + Discord), or generic.

**Risk-scaled evidence and documentation:** a 100-line local tool can keep evidence in its current-state handoff and ideas within its roadmap rather than maintaining every separate policy file; a stateful multiplayer service needs stronger recovery, compatibility and acceptance records. The declared contract paths must still exist. No profile requires provisioning another server merely for compliance.
