import { test } from "node:test";
import assert from "node:assert/strict";
import { criarLista } from "../src/tarefas.mjs";
import { criarServidor } from "../src/servidor.mjs";

test("adiciona, lista e conclui uma tarefa", () => {
  const lista = criarLista();
  const t = lista.adicionar("  comprar pão  ");
  assert.deepEqual(t, { id: 1, titulo: "comprar pão", feita: false });
  assert.equal(lista.concluir(1).feita, true);
  assert.equal(lista.listar()[0].feita, true);
});

test("recusa título vazio e ignora id inexistente", () => {
  const lista = criarLista();
  assert.throws(() => lista.adicionar("   "), /título obrigatório/);
  assert.equal(lista.concluir(99), null);
});

test("API: cria pela rota e responde 400 para JSON inválido", async () => {
  const servidor = criarServidor().listen(0);
  const base = `http://localhost:${servidor.address().port}`;
  try {
    const criada = await fetch(`${base}/tarefas`, { method: "POST", body: JSON.stringify({ titulo: "estudar" }) });
    assert.equal(criada.status, 201);
    const ruim = await fetch(`${base}/tarefas`, { method: "POST", body: "{" });
    assert.equal(ruim.status, 400);
    assert.equal((await (await fetch(`${base}/tarefas`)).json()).length, 1);
  } finally {
    servidor.close();
  }
});
