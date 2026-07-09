// "billing.pdf" should out-rank every other file merely *containing*
// "billing" once the query is the exact name (or the name minus its
// extension) — otherwise a common substring can bury the one result the
// user actually typed for. Pure reorder, no new backend query: applied to
// whatever page of results already came back.
function stem(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export function promoteExactMatch<T extends { name: string }>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;

  const idx = items.findIndex((item) => {
    const name = item.name.toLowerCase();
    return name === q || stem(name) === q;
  });
  if (idx <= 0) return items;

  const reordered = items.slice();
  const [exact] = reordered.splice(idx, 1);
  reordered.unshift(exact);
  return reordered;
}
