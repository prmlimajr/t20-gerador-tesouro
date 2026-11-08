/**
 * Motor de geração de tesouro — segue a planilha "T20 - Tabela de geração de tesouros".
 * Os dados vêm de data/tabelas.json (gerado por tools/converter.py).
 */
export const MODULE_ID = "t20-planilha-tesouro";

let T = null;

export async function carregarTabelas() {
  if (T) return T;
  const resp = await fetch(foundry.utils.getRoute(`modules/${MODULE_ID}/data/tabelas.json`));
  if (!resp.ok) throw new Error(`${MODULE_ID} | não foi possível carregar data/tabelas.json (${resp.status})`);
  T = await resp.json();
  return T;
}

export const tabelas = () => T;

/* -------------------------------------------- */
/*  Dados                                       */
/* -------------------------------------------- */

function rnd(faces) {
  const u = globalThis.CONFIG?.Dice?.randomUniform?.() ?? Math.random();
  return Math.floor(u * faces) + 1;
}

/** Rola uma expressão simples ("2d6+1", "1d3", "4"). */
export function rolar(expr) {
  const s = String(expr).replace(/\s+/g, "");
  let total = 0;
  const dados = [];
  for (const [, sinal, qtd, faces, num] of s.matchAll(/([+-]?)(?:(\d*)d(\d+)|(\d+))/g)) {
    const sgn = sinal === "-" ? -1 : 1;
    if (faces) {
      for (let i = 0; i < Number(qtd || 1); i++) {
        const r = rnd(Number(faces));
        dados.push(r);
        total += sgn * r;
      }
    } else total += sgn * Number(num);
  }
  const texto = dados.length && /d/.test(s) && !/^\d+$/.test(s) ? `${s} [${dados.join(", ")}] = ${total}` : `${total}`;
  return { total, texto };
}

function procurar(tabela, valor) {
  const max = Math.max(...tabela.map((e) => e.max));
  const v = Math.min(valor, max); // resultados acima do máximo (+%) usam a última linha
  return tabela.find((e) => v >= e.min && v <= e.max);
}

const sortear = (lista) => lista[Math.floor((globalThis.CONFIG?.Dice?.randomUniform?.() ?? Math.random()) * lista.length)];
const maiuscula = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const LIVROS = {
  Tormenta20: "T20",
  "Ameaças de Arton": "Ameaças",
  "Deuses de Arton": "Deuses",
  "Heróis de Arton": "Heróis"
};
const ref = (e) => (e?.livro ? `${LIVROS[e.livro] ?? e.livro}, p. ${e.pagina}` : null);

export const ROTULO_TIPO = { arma: "Arma", armadura: "Armadura/escudo", esoterico: "Esotérico", acessorio: "Acessório" };
const ROTULO_MAGICO = { arma: "Arma mágica", armadura: "Armadura/escudo mágico", esoterico: "Esotérico mágico" };
const ROTULO_ESPECIFICO = { arma: "Arma específica", armadura: "Armadura/escudo específico", esoterico: "Esotérico específico" };
export const ROTULO_CAT = { menor: "menor", media: "média", medio: "médio", maior: "maior" };
export const ROTULO_TESOURO = { nenhum: "Nenhum", metade: "Metade", padrao: "Padrão", dobro: "Dobro" };

/** Passo 1 de "Equipamento": 1-3 arma, 4-5 armadura, 6 esotérico. */
const tipoEquipamento = (r) => (r <= 3 ? "arma" : r <= 5 ? "armadura" : "esoterico");
/** Passo 1 de "Mágico": 1-2 arma, 3 armadura, 4 esotérico, 5-6 acessório. */
const tipoMagico = (r) => (r <= 2 ? "arma" : r === 3 ? "armadura" : r === 4 ? "esoterico" : "acessorio");

const ehEscudo = (nome) => /^(escudo|broquel)/i.test(nome);

function novaEntrada(dados) {
  return { id: foundry.utils.randomID(), rolagens: [], detalhes: [], ...dados };
}

function rolarEm(tabela, rol, rotulo, bonus = 0) {
  const d = rnd(100);
  const e = procurar(tabela, d + bonus);
  rol.push(`${rotulo}: d% ${d}${bonus ? ` +${bonus}` : ""} → ${e.nome}`);
  return e;
}

/* -------------------------------------------- */
/*  Itens                                       */
/* -------------------------------------------- */

export function gerarDiverso() {
  const rol = [];
  const e = rolarEm(T.itensDiversos, rol, "Itens diversos");
  return novaEntrada({ categoria: "diverso", rotulo: "Item diverso", nome: e.nome, ref: ref(e), rolagens: rol, gerador: { tipo: "diverso" } });
}

function definirTipo(rol, tipoFixo, mapa, rotulo) {
  if (tipoFixo) return tipoFixo;
  const r = rnd(6);
  const tipo = mapa(r);
  rol.push(`${rotulo}: 1d6 = ${r} → ${ROTULO_TIPO[tipo]}`);
  return tipo;
}

export function gerarEquipamento({ tipoEquip } = {}) {
  const rol = [];
  const tipo = definirTipo(rol, tipoEquip, tipoEquipamento, "Tipo de equipamento");
  const e = rolarEm(T.equipamentos[tipo], rol, `Equipamento (${ROTULO_TIPO[tipo]})`);
  return novaEntrada({
    categoria: "equipamento",
    subtipo: tipo,
    rotulo: `Equipamento · ${ROTULO_TIPO[tipo]}`,
    nome: e.nome,
    base: e.nome,
    ref: ref(e),
    rolagens: rol,
    gerador: { tipo: "equipamento", tipoEquip }
  });
}

export function gerarSuperior({ melhorias, tipoEquip } = {}) {
  const rol = [];
  const tipo = definirTipo(rol, tipoEquip, tipoEquipamento, "Tipo de equipamento");
  const base = rolarEm(T.equipamentos[tipo], rol, `Equipamento (${ROTULO_TIPO[tipo]})`);

  const escolhidas = [];
  let restantes = melhorias;
  for (let tentativas = 0; restantes > 0 && tentativas < 500; tentativas++) {
    const d = rnd(100);
    const m = procurar(T.superiores[tipo], d);
    const custo = m.custo ?? 1;
    if (custo > restantes) {
      rol.push(`Melhoria: d% ${d} → ${m.nome} (conta como duas, mas só resta uma; rola de novo)`);
      continue;
    }
    if (escolhidas.some((x) => x.nome === m.nome)) {
      rol.push(`Melhoria: d% ${d} → ${m.nome} (repetida; rola de novo)`);
      continue;
    }
    let rotulo = m.nome;
    if (m.material) {
      const r = rnd(6);
      rotulo = `${m.nome} (${T.materiais[r - 1]})`;
      rol.push(`Melhoria: d% ${d} → ${m.nome}; material 1d6 = ${r} → ${T.materiais[r - 1]}`);
    } else rol.push(`Melhoria: d% ${d} → ${m.nome}${custo === 2 ? " (conta como duas)" : ""}`);
    escolhidas.push({ nome: m.nome, rotulo: custo === 2 ? `${rotulo} (inclui pré-requisito)` : rotulo, ref: ref(m) });
    restantes -= custo;
  }

  return novaEntrada({
    categoria: "superior",
    subtipo: tipo,
    rotulo: `Superior · ${melhorias} ${melhorias === 1 ? "melhoria" : "melhorias"}`,
    nome: base.nome,
    base: base.nome,
    ref: ref(base),
    detalhes: escolhidas.map((m) => m.rotulo),
    rolagens: rol,
    gerador: { tipo: "superior", melhorias, tipoEquip }
  });
}

export function gerarMagico({ categoria, tipoMagico: tipoFixo } = {}) {
  const rol = [];
  const tipo = definirTipo(rol, tipoFixo, tipoMagico, "Tipo de item mágico");
  const gerador = { tipo: "magico", categoria, tipoMagico: tipoFixo };

  if (tipo === "acessorio") {
    const e = rolarEm(T.acessorios[categoria], rol, `Acessório ${ROTULO_CAT[categoria]}`);
    return novaEntrada({
      categoria: "magico",
      subtipo: "acessorio",
      rotulo: `Acessório mágico ${ROTULO_CAT[categoria]}`,
      nome: e.nome,
      base: e.nome,
      valor: e.preco ?? null,
      ref: ref(e),
      rolagens: rol,
      gerador
    });
  }

  // Menor: 1 rolagem; médio: 2; maior: 3.
  const espacos = { menor: 1, medio: 2, maior: 3 }[categoria];
  const base = rolarEm(T.equipamentos[tipo], rol, `Item base (${ROTULO_TIPO[tipo]})`);
  const escudo = tipo === "armadura" && ehEscudo(base.nome);

  const encantos = [];
  let restantes = espacos;
  for (let tentativas = 0; restantes > 0 && tentativas < 500; tentativas++) {
    const d = rnd(100);
    const e = procurar(T.magicos[tipo], d);

    if (e.especifico) {
      rol.push(`Encanto: d% ${d} → ${e.nome}`);
      const s = rolarEm(T.especificos[tipo], rol, ROTULO_ESPECIFICO[tipo]);
      return novaEntrada({
        categoria: "magico",
        subtipo: tipo,
        especifico: true,
        rotulo: `${ROTULO_ESPECIFICO[tipo]} · ${ROTULO_CAT[categoria]}`,
        nome: s.nome,
        base: s.nome,
        ref: ref(s),
        rolagens: rol,
        gerador
      });
    }

    const motivo =
      e.restricao === "armadura" && escudo
        ? "apenas armaduras"
        : e.restricao === "escudo" && !escudo
          ? "apenas escudos"
          : e.restricao === "doisEncantos" && espacos < 2
            ? "apenas para itens com pelo menos dois encantos"
            : (e.custo ?? 1) > restantes
              ? "conta como dois encantos, mas só resta um"
              : encantos.some((x) => x.nome === e.nome)
                ? "repetido"
                : null;
    if (motivo) {
      rol.push(`Encanto: d% ${d} → ${e.nome} (${motivo}; rola de novo)`);
      continue;
    }
    rol.push(`Encanto: d% ${d} → ${e.nome}${e.custo === 2 ? " (conta como dois)" : ""}`);
    encantos.push({ nome: e.nome, rotulo: e.custo === 2 ? `${e.nome} (inclui pré-requisito)` : e.nome });
    restantes -= e.custo ?? 1;
  }

  return novaEntrada({
    categoria: "magico",
    subtipo: tipo,
    rotulo: `${ROTULO_MAGICO[tipo]} · ${ROTULO_CAT[categoria]}`,
    nome: base.nome,
    base: base.nome,
    ref: ref(base),
    detalhes: encantos.map((e) => e.rotulo),
    rolagens: rol,
    gerador
  });
}

export function gerarPocao({ bonus } = {}) {
  const rol = [];
  const e = rolarEm(T.pocoes, rol, "Poção", bonus ? 20 : 0);
  return novaEntrada({
    categoria: "pocao",
    rotulo: "Poção",
    nome: e.nome,
    base: e.nome,
    valor: e.preco ?? null,
    quantidade: 1,
    ref: ref(e),
    rolagens: rol,
    gerador: { tipo: "pocao", bonus }
  });
}

export function gerarRiqueza({ categoria, bonus, metade } = {}) {
  const rol = [];
  const d = rnd(100);
  const tab = procurar(T.riquezas.tabelas[categoria], d + (bonus ? 20 : 0));
  const linha = T.riquezas.linhas[tab.linha];
  const r = rolar(linha.valor.dados);
  let valor = r.total * linha.valor.mult;
  rol.push(`Riqueza ${ROTULO_CAT[categoria]}: d% ${d}${bonus ? " +20" : ""} → ${linha.valor.texto}`);
  rol.push(`Valor: ${r.texto}${linha.valor.mult > 1 ? ` × ${linha.valor.mult.toLocaleString("pt-BR")}` : ""} = T$ ${valor.toLocaleString("pt-BR")}`);
  if (metade) {
    valor /= 2;
    rol.push(`Tesouro "metade": T$ ${valor.toLocaleString("pt-BR")}`);
  }

  let nome;
  let espacos;
  const modo = game.settings.get(MODULE_ID, "espacosRiqueza");
  if (modo === "rolar") {
    const d20 = rnd(20);
    espacos = procurar(T.riquezas.espacos, d20).espacos;
    rol.push(`Espaços: 1d20 = ${d20} → ${espacos}`);
    const grupo = linha.exemplos.find((g) => g.espacos === espacos);
    nome = grupo ? sortear(grupo.itens) : `Riqueza ${ROTULO_CAT[categoria]}`;
  } else {
    const todos = linha.exemplos.flatMap((g) => g.itens.map((it) => ({ it, esp: g.espacos })));
    const ex = sortear(todos);
    nome = ex.it;
    espacos = ex.esp;
  }

  return novaEntrada({
    categoria: "riqueza",
    rotulo: `Riqueza ${ROTULO_CAT[categoria]}`,
    nome: maiuscula(nome),
    valor,
    espacos, // null = não é carregado (veículo, animal...)
    rolagens: rol,
    gerador: { tipo: "riqueza", categoria, bonus, metade }
  });
}

/** Rerrola uma entrada mantendo o tipo de resultado. */
export function regenerar(entrada) {
  const g = entrada.gerador;
  if (!g) return null;
  const nova =
    g.tipo === "diverso"
      ? gerarDiverso()
      : g.tipo === "equipamento"
        ? gerarEquipamento(g)
        : g.tipo === "superior"
          ? gerarSuperior(g)
          : g.tipo === "magico"
            ? gerarMagico(g)
            : g.tipo === "pocao"
              ? gerarPocao(g)
              : g.tipo === "riqueza"
                ? gerarRiqueza(g)
                : null;
  if (nova && entrada.quantidade > 1 && nova.categoria === "pocao") nova.quantidade = entrada.quantidade;
  return nova;
}

/* -------------------------------------------- */
/*  "2D": role 2d6 e escolha um deles           */
/* -------------------------------------------- */

function comDoisDados(doisD, mapa, rotulo, gerar) {
  if (!doisD) return gerar(undefined);
  const r1 = rnd(6);
  const r2 = rnd(6);
  const t1 = mapa(r1);
  const t2 = mapa(r2);
  const log = `${rotulo} (2D): 2d6 = [${r1}, ${r2}] → ${ROTULO_TIPO[t1]} / ${ROTULO_TIPO[t2]}`;
  if (t1 === t2) {
    const e = gerar(t1);
    e.rolagens.unshift(`${log} (mesmo tipo)`);
    return e;
  }
  return novaEntrada({ categoria: "escolha", opcoes: [gerar(t1), gerar(t2)], rolagens: [log] });
}

/* -------------------------------------------- */
/*  Tesouro completo                            */
/* -------------------------------------------- */

function rolarDinheiro(linha, ctx) {
  const d = rnd(100);
  const e = procurar(linha.dinheiro, d);
  ctx.log.push(`Dinheiro: d% ${d} → ${e.texto}`);
  if (e.tipo === "moedas") {
    const r = rolar(e.dados);
    let n = r.total * e.mult;
    let txt = `  ${r.texto} × ${e.mult.toLocaleString("pt-BR")} = ${n.toLocaleString("pt-BR")} ${SIMBOLO[e.moeda]}`;
    if (ctx.metade) {
      n /= 2;
      txt += ` → metade: ${n.toLocaleString("pt-BR")} ${SIMBOLO[e.moeda]}`;
    }
    ctx.log.push(txt);
    ctx.moedas[e.moeda] += n;
  } else if (e.tipo === "riqueza") {
    const q = rolar(e.qtd);
    ctx.log.push(`  Quantidade: ${q.texto}`);
    for (let i = 0; i < q.total; i++) {
      ctx.entradas.push(gerarRiqueza({ categoria: e.categoria, bonus: e.bonus, metade: ctx.metade }));
    }
  }
}

function rolarItens(linha, ctx) {
  const d = rnd(100);
  const e = procurar(linha.itens, d);
  ctx.log.push(`Itens: d% ${d} → ${e.texto}`);
  switch (e.tipo) {
    case "diverso":
      ctx.entradas.push(gerarDiverso());
      break;
    case "equipamento":
      ctx.entradas.push(comDoisDados(e.doisD, tipoEquipamento, "Tipo de equipamento", (t) => gerarEquipamento({ tipoEquip: t })));
      break;
    case "pocao": {
      const q = rolar(e.qtd);
      if (q.texto !== "1") ctx.log.push(`  Quantidade: ${q.texto}`);
      const pocoes = [];
      for (let i = 0; i < q.total; i++) {
        const p = gerarPocao({ bonus: e.bonus });
        const igual = pocoes.find((x) => x.nome === p.nome);
        if (igual) {
          igual.quantidade++;
          igual.rolagens.push(...p.rolagens);
        } else pocoes.push(p);
      }
      ctx.entradas.push(...pocoes);
      break;
    }
    case "superior":
      ctx.entradas.push(
        comDoisDados(e.doisD, tipoEquipamento, "Tipo de equipamento", (t) => gerarSuperior({ melhorias: e.melhorias, tipoEquip: t }))
      );
      break;
    case "magico":
      ctx.entradas.push(comDoisDados(e.doisD, tipoMagico, "Tipo de item mágico", (t) => gerarMagico({ categoria: e.categoria, tipoMagico: t })));
      break;
  }
}

export const SIMBOLO = { tc: "TC", tp: "T$", to: "TO" };

/**
 * Gera um tesouro.
 * @param {object} p
 * @param {string} p.nd     "1/4", "1/2", "1" ... "20"
 * @param {"nenhum"|"metade"|"padrao"|"dobro"} p.tipo
 */
export function gerarTesouro({ nd, tipo = "padrao" }) {
  if (!T) throw new Error(`${MODULE_ID} | tabelas não carregadas`);
  const linha = T.tesouroPorND[nd];
  if (!linha) throw new Error(`${MODULE_ID} | ND inválido: ${nd}`);

  const ctx = { moedas: { tc: 0, tp: 0, to: 0 }, entradas: [], log: [], metade: tipo === "metade" };
  if (tipo !== "nenhum") {
    const vezes = tipo === "dobro" ? 2 : 1;
    for (let i = 0; i < vezes; i++) {
      if (vezes > 1) ctx.log.push(`— Rolagem ${i + 1} de ${vezes} —`);
      rolarDinheiro(linha, ctx);
      rolarItens(linha, ctx);
    }
  }

  return {
    id: foundry.utils.randomID(),
    aberto: true,
    nd,
    tipo,
    moedas: ctx.moedas,
    entradas: ctx.entradas,
    log: ctx.log,
    distribuido: false
  };
}

/* -------------------------------------------- */
/*  Conversões                                  */
/* -------------------------------------------- */

/** Valor total em T$ (moedas + riquezas + itens com preço conhecido). */
export function valorTotal(estado) {
  const m = estado.moedas;
  let total = m.tc / 10 + m.tp + m.to * 10;
  for (const e of estado.entradas) if (e.categoria !== "escolha" && e.valor) total += e.valor * (e.quantidade ?? 1);
  return total;
}

/** Soma um valor em T$ às moedas (frações viram TC). */
export function somarTibares(moedas, valor) {
  const emTC = Math.round(valor * 10);
  moedas.tp += Math.floor(emTC / 10);
  moedas.tc += emTC % 10;
}

export function converterTPemTO(estado) {
  const m = estado.moedas;
  const to = Math.floor(m.tp / 10);
  m.to += to;
  m.tp -= to * 10;
  return to;
}

export function converterTCemTP(estado) {
  const m = estado.moedas;
  const tp = Math.floor(m.tc / 10);
  m.tp += tp;
  m.tc -= tp * 10;
  return tp;
}

/** Converte riquezas em moedas. Sem id, converte todas. */
export function converterRiquezas(estado, id = null) {
  let total = 0;
  estado.entradas = estado.entradas.filter((e) => {
    if (e.categoria !== "riqueza" || (id && e.id !== id)) return true;
    total += e.valor ?? 0;
    return false;
  });
  somarTibares(estado.moedas, total);
  return total;
}

/* -------------------------------------------- */
/*  ND                                          */
/* -------------------------------------------- */

/** "1/4" -> 0.25, "S+" -> 20 */
export function ndParaNumero(nd) {
  const s = String(nd ?? "").trim().toUpperCase();
  if (!s) return null;
  if (s.startsWith("S")) return 20;
  const m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function numeroParaND(n) {
  if (n == null) return null;
  if (n < 0.375) return "1/4";
  if (n < 1) return "1/2";
  return String(Math.min(20, Math.max(1, Math.round(n))));
}
