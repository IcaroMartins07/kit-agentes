// Lista de tarefas em memória. É o domínio do exemplo: pequeno de propósito, para o /deus ter onde mexer.

export function criarLista() {
  const tarefas = [];
  let proximoId = 1;

  return {
    adicionar(titulo) {
      const limpo = typeof titulo === "string" ? titulo.trim() : "";
      if (!limpo) throw new Error("título obrigatório");
      const tarefa = { id: proximoId++, titulo: limpo, feita: false };
      tarefas.push(tarefa);
      return { ...tarefa };
    },
    listar() {
      return tarefas.map((t) => ({ ...t }));
    },
    concluir(id) {
      const tarefa = tarefas.find((t) => t.id === id);
      if (!tarefa) return null;
      tarefa.feita = true;
      return { ...tarefa };
    },
  };
}
