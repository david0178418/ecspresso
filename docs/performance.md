# Performance Tips

- Use `changed` query filters to skip unchanged entities in render sync, transform propagation, and similar systems
- Call `markChanged` after in-place mutations so downstream systems can detect the change
- Extract business logic into testable helper functions using query type utilities
- Group related systems into plugins for better organization and reusability
- Use system phases to separate concerns (physics in `fixedUpdate`, rendering in `render`) and priorities for ordering within a phase
- Use resource factories for expensive initialization (textures, audio, etc.)
- Consider component callbacks for immediate reactions to state changes
- Minimize the number of components in queries when possible to leverage indexing
