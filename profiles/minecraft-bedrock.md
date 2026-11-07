# Minecraft Bedrock / BDS profile

Applies only to Bedrock addons and server-connected code. Preserve pack UUIDs, script module versions, block/item IDs, world dynamic-property schemas, storage identities and compatibility with existing worlds. Confirm paired BP/RP versions, dependency identity, real BDS/client startup and gameplay behaviors **when relevant**; offline JSON/JS tests alone aren't runtime proof.

Use native Bedrock APIs where practical. Protect item custody/world state when relevant. Prefer the project's existing backup-first LAB updater and only its designated authorized test environment; don't invent a second server or modify production. Record exact BDS/client versions and runtime observations. Do not impose these requirements on other profiles.
