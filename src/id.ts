export function generateNodeId(existing: Set<string>): string {
  for (let i = 0; i < 20; i += 1) {
    const id = `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    if (!existing.has(id)) {
      return id;
    }
  }
  throw new Error('failed to generate unique node id');
}
