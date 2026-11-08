import { MODULE_ID, carregarTabelas, gerarTesouro, tabelas } from "./gerador.js";
import * as A from "./acoes.js";
import { mostrarDeNovo, renderizar } from "./tela.js";

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "perguntarAoEncerrar", {
    name: "Perguntar ao encerrar um combate",
    hint: "Quando o mestre encerra um combate, pergunta o ND do encontro e o tipo de tesouro e abre o baú.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "espacosRiqueza", {
    name: "Nome e espaços das riquezas",
    hint:
      "Exemplo: sorteia um dos exemplos da linha de valor rolada (cada exemplo já diz quantos espaços ocupa). " +
      "Rolar 1d20: usa a tabela opcional de espaços e escolhe um exemplo com aquele tamanho.",
    scope: "world",
    config: true,
    type: String,
    default: "exemplo",
    choices: { exemplo: "Pelo exemplo da planilha", rolar: "Rolar 1d20 na tabela de espaços" }
  });

  // Tesouro aberto no momento (sincronizado com todos os clientes).
  game.settings.register(MODULE_ID, "estado", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: (valor) => renderizar(valor)
  });

  game.settings.register(MODULE_ID, "ultimoND", {
    scope: "client",
    config: false,
    type: String,
    default: "1"
  });

  game.modules.get(MODULE_ID).api = {
    /** Abre a pergunta de ND/tipo (mestre). */
    abrirPrompt: A.abrirPrompt,
    /** Gera e mostra direto: api.gerar({ nd: "5", tipo: "padrao" }) */
    gerar: A.gerarEMostrar,
    /** Só gera, sem mostrar (útil em macros). */
    gerarSemMostrar: async (opcoes) => (await carregarTabelas(), gerarTesouro(opcoes)),
    reabrir: () => (game.user.isGM ? A.reabrir() : mostrarDeNovo()),
    fechar: A.fecharTesouro,
    distribuir: A.abrirDistribuicao,
    tabelas
  };
});

Hooks.once("ready", async () => {
  try {
    await carregarTabelas();
  } catch (err) {
    console.error(err);
    ui.notifications.error("T20 Tesouro: não foi possível carregar as tabelas.");
    return;
  }
  const estado = game.settings.get(MODULE_ID, "estado");
  if (estado?.aberto) renderizar(estado);
});

/* Ao encerrar o combate */
Hooks.on("deleteCombat", (combat, options, userId) => {
  if (!game.user.isGM || userId !== game.user.id) return;
  if (!game.settings.get(MODULE_ID, "perguntarAoEncerrar")) return;
  if (!combat.started && !combat.round) return; // combate que nunca começou
  A.abrirPrompt({ ndSugerido: A.sugerirND(combat) });
});

/* Botão nos controles de token (mestre) */
Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user.isGM) return;
  const ferramentas = [
    {
      name: "t20t-gerar",
      title: "Gerar tesouro (T20)",
      icon: "fa-solid fa-gem",
      button: true
    },
    {
      name: "t20t-reabrir",
      title: "Reabrir último tesouro",
      icon: "fa-solid fa-box-open",
      button: true
    }
  ];
  const acoes = { "t20t-gerar": () => A.abrirPrompt(), "t20t-reabrir": () => A.reabrir() };

  if (Array.isArray(controls)) {
    // v12
    const tokens = controls.find((c) => c.name === "token");
    for (const f of ferramentas) tokens?.tools.push({ ...f, onClick: acoes[f.name] });
  } else {
    // v13+
    const tokens = controls.tokens;
    if (!tokens) return;
    let ordem = Object.keys(tokens.tools).length;
    for (const f of ferramentas) tokens.tools[f.name] = { ...f, order: ++ordem, onChange: acoes[f.name] };
  }
});
