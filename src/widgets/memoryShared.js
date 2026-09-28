// Helpers shared by the memory widgets (Memory, Federated Vaults, Promotion
// Pipeline, Promotion Flow, Ingestion), which all read the `memory` feed.

export const days = (ms) => Math.floor((Date.now() - ms) / 864e5)
export const ago = (ms) => {
  if (!ms) return null
  const d = days(ms)
  return d <= 0 ? 'today' : `${d}d ago`
}

// The promotion stages come from the ontology so an instance can rename them.
export const promotionStages = (ontology) =>
  ontology?.flow?.pipelines?.['memory-promotion']?.stages ?? ['raw', 'wiki', 'output']

export const pipelineTotal = (memory) =>
  Object.values(memory?.stages ?? {}).reduce((a, s) => a + (s.count ?? 0), 0)
