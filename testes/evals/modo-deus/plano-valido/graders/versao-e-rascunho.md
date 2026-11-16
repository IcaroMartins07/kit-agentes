---
type: regex
pattern: '"versao"\s*:\s*1[\s\S]*"status"\s*:\s*"rascunho"|"status"\s*:\s*"rascunho"[\s\S]*"versao"\s*:\s*1'
target: { source: file, path: .modo-deus/plano.json }
---
