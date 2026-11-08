/**
 * Ações do mestre sobre o tesouro aberto.
 * O tesouro fica numa configuração do mundo ("estado"); ao salvar, o onChange
 * redesenha a tela em todos os clientes — mestre e jogadores veem a mesma coisa.
 */
import {
  MODULE_ID,
  ROTULO_TESOURO,
  carregarTabelas,
  converterRiquezas,
  converterTCemTP,
  converterTPemTO,
  gerarTesouro,
  ndParaNumero,
  numeroParaND,
  regenerar,
  somarTibares,
  tabelas
} from "./gerador.js";

const DialogV2 = () => foundry.applications.api.DialogV2;

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const estadoAtual = () => game.settings.get(MODULE_ID, "estado") ?? {};

async function salvar(estado) {
  await game.settings.set(MODULE_ID, "estado", estado);
}

/** Aplica uma alteração ao estado e sincroniza com todos. */
export async function alterar(fn) {
  if (!game.user.isGM) return;
  const estado = foundry.utils.deepClone(estadoAtual());
  if (!estado?.id) return;
  const r = await fn(estado);
  if (r === false) return;
  await salvar(estado);
  return r;
}

/* -------------------------------------------- */
/*  Gerar                                       */
/* -------------------------------------------- */

export async function gerarEMostrar({ nd, tipo }) {
  if (!game.user.isGM) return ui.notifications.warn("Apenas o mestre pode gerar tesouros.");
  await carregarTabelas();
  await game.settings.set(MODULE_ID, "ultimoND", nd);
  if (tipo === "nenhum") {
    ui.notifications.info(`Tesouro "Nenhum": a criatura não traz tesouro (ND ${nd}).`);
    return null;
  }
  const estado = gerarTesouro({ nd, tipo });
  await salvar(estado);
  return estado;
}

/** Sugere o ND pelo maior ND entre os inimigos (disposição hostil) do combate. */
export function sugerirND(combat) {
  const hostil = CONST.TOKEN_DISPOSITIONS.HOSTILE;
  const nds = (combat?.combatants ?? [])
    .filter((c) => c.token?.disposition === hostil && !c.actor?.hasPlayerOwner)
    .map((c) => ndParaNumero(c.actor?.system?.attributes?.nd ?? c.actor?.system?.detalhes?.nd))
    .filter((n) => n != null);
  return nds.length ? numeroParaND(Math.max(...nds)) : null;
}

const DESCRICAO_TIPO = {
  nenhum: "A criatura não traz tesouro; não use a tabela.",
  metade: "Use a tabela, mas divida pela metade os resultados da coluna Dinheiro.",
  padrao: "Tesouro típico; use a tabela sem modificação.",
  dobro: "Role duas vezes em cada coluna da tabela."
};

/** Pergunta o ND e o tipo de tesouro e gera. */
export async function abrirPrompt({ ndSugerido = null } = {}) {
  if (!game.user.isGM) return;
  const T = await carregarTabelas();
  const padraoND = ndSugerido ?? game.settings.get(MODULE_ID, "ultimoND") ?? "1";

  const opcoesND = T.ordemND.map((nd) => `<option value="${nd}" ${nd === padraoND ? "selected" : ""}>ND ${nd}</option>`).join("");
  const tipos = Object.entries(ROTULO_TESOURO)
    .map(
      ([valor, rotulo]) => `
      <label class="t20t-tipo">
        <input type="radio" name="tipo" value="${valor}" ${valor === "padrao" ? "checked" : ""}>
        <span class="t20t-tipo-cartao">
          <strong>${rotulo}</strong>
          <small>${DESCRICAO_TIPO[valor]}</small>
        </span>
      </label>`
    )
    .join("");

  const content = `
    <div class="t20t-prompt">
      <div class="form-group">
        <label>Nível de desafio do encontro</label>
        <select name="nd">${opcoesND}</select>
      </div>
      ${ndSugerido ? `<p class="hint">Sugestão: maior ND entre os inimigos do combate (ND ${ndSugerido}). Para vários inimigos, use o ND do combate.</p>` : ""}
      <p class="t20t-rotulo">Tesouro</p>
      <div class="t20t-tipos">${tipos}</div>
    </div>`;

  const r = await DialogV2().wait({
    window: { title: "Gerar tesouro", icon: "fa-solid fa-gem" },
    position: { width: 520 },
    content,
    rejectClose: false,
    buttons: [
      {
        action: "gerar",
        label: "Abrir o baú",
        icon: "fa-solid fa-box-open",
        default: true,
        callback: (event, button) => ({
          nd: button.form.elements.nd.value,
          tipo: button.form.querySelector("input[name=tipo]:checked")?.value ?? "padrao"
        })
      },
      { action: "cancelar", label: "Agora não", icon: "fa-solid fa-xmark" }
    ]
  });
  if (r && typeof r === "object") return gerarEMostrar(r);
  return null;
}

/* -------------------------------------------- */
/*  Personalização                              */
/* -------------------------------------------- */

export const remover = (id) => alterar((e) => void (e.entradas = e.entradas.filter((x) => x.id !== id)));

export const rerrolar = (id) =>
  alterar(async (e) => {
    await carregarTabelas();
    const i = e.entradas.findIndex((x) => x.id === id);
    const nova = i >= 0 ? regenerar(e.entradas[i]) : null;
    if (!nova) return false;
    nova.rolagens.unshift("(rerrolado pelo mestre)");
    e.entradas[i] = nova;
  });

/** "2D": fica com uma das duas opções. */
export const escolher = (id, indice) =>
  alterar((e) => {
    const i = e.entradas.findIndex((x) => x.id === id);
    const ent = e.entradas[i];
    if (!ent?.opcoes?.[indice]) return false;
    const escolhida = ent.opcoes[indice];
    escolhida.rolagens.unshift(...ent.rolagens, "Escolhido entre as opções do 2D");
    e.entradas[i] = escolhida;
  });

export const venderRiqueza = (id) => alterar((e) => void converterRiquezas(e, id));
export const riquezasEmMoedas = () =>
  alterar((e) => {
    if (!e.entradas.some((x) => x.categoria === "riqueza")) return false;
    converterRiquezas(e);
  });
export const tpParaTO = () => alterar((e) => (converterTPemTO(e) > 0 ? undefined : false));
export const tcParaTP = () => alterar((e) => (converterTCemTP(e) > 0 ? undefined : false));
export const definirMoeda = (chave, valor) =>
  alterar((e) => void (e.moedas[chave] = Math.max(0, Math.floor(Number(valor) || 0))));

export async function fecharTesouro() {
  await alterar((e) => void (e.aberto = false));
}

export async function reabrir() {
  await alterar((e) => void (e.aberto = true));
}

const CATEGORIAS = {
  diverso: "Item diverso",
  equipamento: "Equipamento",
  pocao: "Poção",
  superior: "Superior",
  magico: "Mágico",
  riqueza: "Riqueza"
};

function formularioItem(ent = {}) {
  const cats = Object.entries(CATEGORIAS)
    .map(([v, r]) => `<option value="${v}" ${v === (ent.categoria ?? "diverso") ? "selected" : ""}>${r}</option>`)
    .join("");
  return `
    <div class="t20t-form">
      <div class="form-group"><label>Categoria</label><select name="categoria">${cats}</select></div>
      <div class="form-group"><label>Nome</label><input type="text" name="nome" value="${esc(ent.nome)}" required></div>
      <div class="form-group"><label>Descrição curta</label><input type="text" name="rotulo" value="${esc(ent.rotulo)}" placeholder="Ex.: Arma mágica · médio"></div>
      <div class="form-group"><label>Melhorias / encantos</label><input type="text" name="detalhes" value="${esc((ent.detalhes ?? []).join(", "))}" placeholder="Separados por vírgula"></div>
      <div class="form-group"><label>Valor (T$)</label><input type="number" name="valor" min="0" step="0.5" value="${ent.valor ?? ""}"></div>
      <div class="form-group"><label>Espaços</label><input type="number" name="espacos" min="0" step="0.5" value="${ent.espacos ?? ""}"></div>
      <div class="form-group"><label>Quantidade</label><input type="number" name="quantidade" min="1" step="1" value="${ent.quantidade ?? 1}"></div>
    </div>`;
}

function lerFormularioItem(form) {
  const v = (n) => form.elements[n]?.value?.trim() ?? "";
  const num = (n) => (v(n) === "" ? null : Number(v(n)));
  return {
    categoria: v("categoria"),
    nome: v("nome"),
    rotulo: v("rotulo") || CATEGORIAS[v("categoria")],
    detalhes: v("detalhes")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    valor: num("valor"),
    espacos: num("espacos"),
    quantidade: Math.max(1, num("quantidade") ?? 1)
  };
}

async function dialogoItem(titulo, ent) {
  return DialogV2().wait({
    window: { title: titulo, icon: "fa-solid fa-pen" },
    position: { width: 460 },
    content: formularioItem(ent),
    rejectClose: false,
    buttons: [
      { action: "ok", label: "Salvar", icon: "fa-solid fa-check", default: true, callback: (ev, b) => lerFormularioItem(b.form) },
      { action: "cancelar", label: "Cancelar" }
    ]
  });
}

export async function editarEntrada(id) {
  const ent = estadoAtual().entradas?.find((x) => x.id === id);
  if (!ent) return;
  const dados = await dialogoItem("Editar item", ent);
  if (!dados || typeof dados !== "object" || !dados.nome) return;
  await alterar((e) => {
    const alvo = e.entradas.find((x) => x.id === id);
    if (!alvo) return false;
    const mudouNome = alvo.nome !== dados.nome;
    Object.assign(alvo, dados, { editado: true });
    if (mudouNome) alvo.base = dados.nome;
    if (alvo.categoria !== ent.categoria) delete alvo.gerador;
  });
}

export async function adicionarEntrada() {
  const dados = await dialogoItem("Adicionar item ao tesouro", {});
  if (!dados || typeof dados !== "object" || !dados.nome) return;
  await alterar((e) => {
    e.entradas.push({ id: foundry.utils.randomID(), ...dados, base: dados.nome, rolagens: ["Adicionado pelo mestre"], editado: true });
  });
}

/* -------------------------------------------- */
/*  Distribuição                                */
/* -------------------------------------------- */

const normalizar = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

let indiceItens = null;

/** Índice nome → uuid dos itens dos compêndios (sistema primeiro) e do mundo. */
async function indice() {
  if (indiceItens) return indiceItens;
  indiceItens = new Map();
  const packs = [...game.packs]
    .filter((p) => p.documentName === "Item")
    .sort((a, b) => (b.metadata.packageType === "system") - (a.metadata.packageType === "system"));
  for (const p of packs) {
    try {
      for (const e of await p.getIndex()) {
        const k = normalizar(e.name);
        if (!indiceItens.has(k)) indiceItens.set(k, e.uuid ?? `Compendium.${p.collection}.${e._id}`);
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | não foi possível ler o compêndio ${p.collection}`, err);
    }
  }
  for (const it of game.items) {
    const k = normalizar(it.name);
    if (!indiceItens.has(k)) indiceItens.set(k, it.uuid);
  }
  return indiceItens;
}

function tipoValido(preferido) {
  const tipos = game.documentTypes?.Item ?? Object.keys(CONFIG.Item.dataModels ?? {});
  if (tipos.includes(preferido)) return preferido;
  return tipos.find((t) => t !== "base") ?? "base";
}

export const nomeCompleto = (ent) => (ent.detalhes?.length ? `${ent.nome} (${ent.detalhes.join(", ")})` : ent.nome);

async function dadosDoItem(ent, estado) {
  const nome = nomeCompleto(ent);
  const descricao = [
    `<p><strong>${esc(ent.rotulo ?? "")}</strong>${ent.ref ? ` — ${esc(ent.ref)}` : ""}</p>`,
    ent.detalhes?.length ? `<ul>${ent.detalhes.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : "",
    ent.categoria === "riqueza" && ent.espacos == null ? "<p>Não pode ser carregado como um item comum.</p>" : "",
    `<p><em>Tesouro de ND ${esc(estado.nd)} (${esc(ROTULO_TESOURO[estado.tipo] ?? estado.tipo)}).</em></p>`
  ].join("");

  let dados = null;
  if (ent.categoria !== "riqueza") {
    const uuid = (await indice()).get(normalizar(ent.base ?? ent.nome));
    const doc = uuid ? await fromUuid(uuid) : null;
    if (doc) {
      dados = doc.toObject();
      delete dados._id;
      dados.name = nome;
      if (ent.detalhes?.length || ent.editado) {
        const antiga = foundry.utils.getProperty(dados, "system.description.value") ?? "";
        foundry.utils.setProperty(dados, "system.description.value", descricao + antiga);
      }
      if (ent.quantidade > 1) foundry.utils.setProperty(dados, "system.qtd", ent.quantidade);
    }
  }
  if (!dados) {
    dados = {
      name: nome,
      type: tipoValido(ent.categoria === "pocao" ? "consumivel" : "tesouro"),
      img: "icons/svg/item-bag.svg",
      system: {
        description: { value: descricao },
        preco: ent.valor ?? 0,
        espacos: ent.espacos ?? 0,
        qtd: ent.quantidade ?? 1
      }
    };
  }
  foundry.utils.setProperty(dados, `flags.${MODULE_ID}.tesouro`, estado.id);
  return dados;
}

/** Personagens que podem receber tesouro. */
function candidatos() {
  const pjs = game.actors.filter((a) => a.hasPlayerOwner && a.type === "character");
  return pjs.length ? pjs : game.actors.filter((a) => a.hasPlayerOwner);
}

/** Divide as moedas igualmente; o que não divide é trocado por moedas menores. */
function dividirMoedas(moedas, n) {
  let { tc, tp, to } = moedas;
  const cada = { to: Math.floor(to / n), tp: 0, tc: 0 };
  tp += (to - cada.to * n) * 10;
  cada.tp = Math.floor(tp / n);
  tc += (tp - cada.tp * n) * 10;
  cada.tc = Math.floor(tc / n);
  return { cada, sobraTC: Math.round(tc - cada.tc * n) };
}

const textoMoedas = (m) =>
  [m.to && `${m.to.toLocaleString("pt-BR")} TO`, m.tp && `${m.tp.toLocaleString("pt-BR")} T$`, m.tc && `${m.tc.toLocaleString("pt-BR")} TC`]
    .filter(Boolean)
    .join(", ") || "—";

export async function abrirDistribuicao() {
  if (!game.user.isGM) return;
  const estado = foundry.utils.deepClone(estadoAtual());
  if (!estado?.id) return;
  if (estado.distribuido) return ui.notifications.info("Este tesouro já foi distribuído.");
  if (estado.entradas.some((e) => e.categoria === "escolha")) {
    return ui.notifications.warn("Escolha uma das opções dos itens marcados com 2D antes de distribuir.");
  }
  const atores = candidatos();
  if (!atores.length) return ui.notifications.warn("Nenhum personagem de jogador encontrado para receber o tesouro.");

  const opcoesAtores = (sel) =>
    `<option value="">— Não entregar —</option>` +
    atores.map((a) => `<option value="${a.id}" ${a.id === sel ? "selected" : ""}>${esc(a.name)}</option>`).join("");

  const temMoedas = estado.moedas.tc || estado.moedas.tp || estado.moedas.to;
  const linhasItens = estado.entradas
    .map((e, i) => {
      const q = e.quantidade > 1 ? ` ×${e.quantidade}` : "";
      return `<tr><td>${esc(nomeCompleto(e))}${q}</td><td><select name="item-${e.id}">${opcoesAtores(atores[i % atores.length].id)}</select></td></tr>`;
    })
    .join("");

  const content = `
    <div class="t20t-dist">
      ${
        temMoedas
          ? `<p><strong>Moedas:</strong> ${textoMoedas(estado.moedas)} — divididas igualmente entre:</p>
             <div class="t20t-dist-atores">${atores
               .map((a) => `<label><input type="checkbox" name="moeda-${a.id}" checked> ${esc(a.name)}</label>`)
               .join("")}</div>`
          : ""
      }
      ${linhasItens ? `<table class="t20t-dist-itens"><thead><tr><th>Item</th><th>Para</th></tr></thead><tbody>${linhasItens}</tbody></table>` : ""}
    </div>`;

  const r = await DialogV2().wait({
    window: { title: "Distribuir tesouro", icon: "fa-solid fa-people-group" },
    position: { width: 560 },
    content,
    rejectClose: false,
    buttons: [
      {
        action: "ok",
        label: "Distribuir",
        icon: "fa-solid fa-hand-holding-dollar",
        default: true,
        callback: (ev, b) => ({
          moedas: atores.filter((a) => b.form.elements[`moeda-${a.id}`]?.checked).map((a) => a.id),
          itens: Object.fromEntries(estado.entradas.map((e) => [e.id, b.form.elements[`item-${e.id}`]?.value || ""]))
        })
      },
      { action: "cancelar", label: "Cancelar" }
    ]
  });
  if (!r || typeof r !== "object") return;
  return executarDistribuicao(estado, r);
}

async function executarDistribuicao(estado, { moedas: idsMoedas, itens }) {
  const resumo = new Map(); // actorId -> { moedas, itens: [] }
  const reg = (id) => {
    if (!resumo.has(id)) resumo.set(id, { moedas: { tc: 0, tp: 0, to: 0 }, itens: [] });
    return resumo.get(id);
  };
  const avisos = [];

  // Moedas
  const temMoedas = estado.moedas.tc || estado.moedas.tp || estado.moedas.to;
  if (temMoedas && idsMoedas.length) {
    const { cada, sobraTC } = dividirMoedas(estado.moedas, idsMoedas.length);
    idsMoedas.forEach((id, i) => {
      const m = reg(id).moedas;
      m.to += cada.to;
      m.tp += cada.tp;
      m.tc += cada.tc + (i === 0 ? sobraTC : 0);
    });
  }

  // Itens
  for (const ent of estado.entradas) {
    const id = itens[ent.id];
    if (id) reg(id).itens.push(ent);
  }

  for (const [id, r] of resumo) {
    const ator = game.actors.get(id);
    if (!ator) continue;
    const m = r.moedas;
    if (m.tc || m.tp || m.to) {
      if (foundry.utils.hasProperty(ator, "system.dinheiro")) {
        const d = ator.system.dinheiro;
        await ator.update({
          "system.dinheiro.tc": (Number(d.tc) || 0) + m.tc,
          "system.dinheiro.tp": (Number(d.tp) || 0) + m.tp,
          "system.dinheiro.to": (Number(d.to) || 0) + m.to
        });
      } else avisos.push(`${ator.name}: a ficha não tem o campo de dinheiro do Tormenta20; entregue as moedas manualmente.`);
    }
    if (r.itens.length) {
      const dados = [];
      for (const ent of r.itens) dados.push(await dadosDoItem(ent, estado));
      await ator.createEmbeddedDocuments("Item", dados);
    }
  }

  const linhas = [...resumo]
    .map(([id, r]) => {
      const nome = esc(game.actors.get(id)?.name ?? "?");
      const partes = [];
      if (r.moedas.tc || r.moedas.tp || r.moedas.to) partes.push(textoMoedas(r.moedas));
      partes.push(...r.itens.map((e) => esc(nomeCompleto(e)) + (e.quantidade > 1 ? ` ×${e.quantidade}` : "")));
      return `<li><strong>${nome}:</strong> ${partes.join("; ")}</li>`;
    })
    .join("");
  await ChatMessage.create({
    speaker: { alias: "Tesouro" },
    content: `<div class="t20t-chat"><h3><i class="fa-solid fa-gem"></i> Tesouro distribuído</h3>
      <p>ND ${esc(estado.nd)} · ${esc(ROTULO_TESOURO[estado.tipo])}</p><ul>${linhas || "<li>Nada foi entregue.</li>"}</ul></div>`
  });

  for (const a of avisos) ui.notifications.warn(a, { permanent: true });
  await alterar((e) => void (e.distribuido = true));
  ui.notifications.info("Tesouro distribuído!");
}

export { tabelas, somarTibares };
