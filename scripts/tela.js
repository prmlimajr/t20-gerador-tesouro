/**
 * Tela do tesouro: baú animado + lista do conteúdo.
 * Desenhada em todos os clientes a partir do estado salvo nas configurações do mundo.
 */
import { MODULE_ID, ROTULO_TESOURO, SIMBOLO, valorTotal } from "./gerador.js";
import * as A from "./acoes.js";

const fmt = (n) => Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

let raiz = null;
let idMostrado = null;
let fechadoLocal = null; // jogador fechou a tela deste tesouro
let editando = false;
const vistos = new Set();

/* -------------------------------------------- */
/*  Arte do baú (SVG)                           */
/* -------------------------------------------- */

const SVG_BAU = `
<svg class="t20t-bau" viewBox="0 0 260 220" aria-hidden="true">
  <defs>
    <linearGradient id="t20t-madeira" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9a6332"/><stop offset="1" stop-color="#5a3517"/>
    </linearGradient>
    <linearGradient id="t20t-madeira-esc" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a210e"/><stop offset="1" stop-color="#2a170a"/>
    </linearGradient>
    <linearGradient id="t20t-ouro" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff0a8"/><stop offset=".45" stop-color="#e8b730"/><stop offset="1" stop-color="#a87400"/>
    </linearGradient>
    <radialGradient id="t20t-brilho" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#fffbe0" stop-opacity="1"/><stop offset=".5" stop-color="#ffd75a" stop-opacity=".65"/><stop offset="1" stop-color="#ffb300" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="t20t-clip-tampa"><path d="M34 118 L34 92 Q130 46 226 92 L226 118 Z"/></clipPath>
  </defs>

  <ellipse class="t20t-sombra" cx="130" cy="208" rx="104" ry="9" fill="#000" opacity=".45"/>

  <!-- tampa aberta (vista por dentro) -->
  <g class="t20t-tampa-dentro">
    <path d="M38 118 L54 34 Q130 16 206 34 L222 118 Z" fill="url(#t20t-madeira-esc)" stroke="#1d1007" stroke-width="3"/>
    <path d="M50 112 L63 44 Q130 29 197 44 L210 112" fill="none" stroke="#6b4421" stroke-width="2" opacity=".6"/>
    <rect x="58" y="40" width="14" height="76" fill="url(#t20t-ouro)" opacity=".85" transform="skewX(-6)"/>
    <rect x="198" y="40" width="14" height="76" fill="url(#t20t-ouro)" opacity=".85" transform="skewX(6) translate(-24 0)"/>
  </g>

  <ellipse class="t20t-luz" cx="130" cy="116" rx="110" ry="40" fill="url(#t20t-brilho)"/>

  <!-- tesouro dentro do baú -->
  <g class="t20t-pilha">
    <ellipse cx="130" cy="121" rx="90" ry="12" fill="#c98f12"/>
    <g fill="url(#t20t-ouro)" stroke="#9a6a00" stroke-width="1.2">
      <ellipse cx="70" cy="114" rx="9" ry="5"/><ellipse cx="88" cy="109" rx="9" ry="5"/><ellipse cx="104" cy="113" rx="9" ry="5"/>
      <ellipse cx="122" cy="106" rx="9" ry="5"/><ellipse cx="140" cy="110" rx="9" ry="5"/><ellipse cx="158" cy="105" rx="9" ry="5"/>
      <ellipse cx="174" cy="112" rx="9" ry="5"/><ellipse cx="190" cy="115" rx="9" ry="5"/><ellipse cx="96" cy="101" rx="9" ry="5"/>
      <ellipse cx="148" cy="98" rx="9" ry="5"/><ellipse cx="130" cy="95" rx="9" ry="5"/><ellipse cx="114" cy="100" rx="9" ry="5"/>
    </g>
    <polygon points="78,104 85,96 92,104 85,112" fill="#e0304a" stroke="#7a0f20"/>
    <polygon points="166,98 174,89 182,98 174,107" fill="#3a8bff" stroke="#173f80"/>
    <polygon points="134,88 140,81 146,88 140,95" fill="#3ccf7a" stroke="#14603a"/>
  </g>

  <!-- corpo -->
  <g class="t20t-corpo">
    <rect x="34" y="118" width="192" height="86" rx="8" fill="url(#t20t-madeira)" stroke="#3b220f" stroke-width="3"/>
    <line x1="36" y1="146" x2="224" y2="146" stroke="#4a2c12" stroke-width="2" opacity=".6"/>
    <line x1="36" y1="175" x2="224" y2="175" stroke="#4a2c12" stroke-width="2" opacity=".6"/>
    <rect x="52" y="118" width="16" height="86" fill="url(#t20t-ouro)" stroke="#8a6200"/>
    <rect x="192" y="118" width="16" height="86" fill="url(#t20t-ouro)" stroke="#8a6200"/>
    <rect x="34" y="194" width="192" height="10" rx="4" fill="url(#t20t-ouro)" stroke="#8a6200"/>
    <g fill="#7a5600"><circle cx="60" cy="130" r="2.2"/><circle cx="60" cy="160" r="2.2"/><circle cx="60" cy="188" r="2.2"/>
      <circle cx="200" cy="130" r="2.2"/><circle cx="200" cy="160" r="2.2"/><circle cx="200" cy="188" r="2.2"/></g>
    <rect x="113" y="118" width="34" height="32" rx="5" fill="url(#t20t-ouro)" stroke="#8a6200" stroke-width="1.5"/>
    <circle cx="130" cy="131" r="4.5" fill="#2a1a08"/><rect x="128" y="132" width="4" height="10" rx="1" fill="#2a1a08"/>
  </g>

  <!-- tampa fechada -->
  <g class="t20t-tampa-fora">
    <path d="M34 118 L34 92 Q130 46 226 92 L226 118 Z" fill="url(#t20t-madeira)" stroke="#3b220f" stroke-width="3"/>
    <g clip-path="url(#t20t-clip-tampa)">
      <rect x="52" y="40" width="16" height="80" fill="url(#t20t-ouro)" stroke="#8a6200"/>
      <rect x="192" y="40" width="16" height="80" fill="url(#t20t-ouro)" stroke="#8a6200"/>
      <path d="M34 92 Q130 46 226 92" fill="none" stroke="#3b220f" stroke-width="2" opacity=".5" transform="translate(0 12)"/>
    </g>
    <rect x="117" y="102" width="26" height="20" rx="4" fill="url(#t20t-ouro)" stroke="#8a6200" stroke-width="1.5"/>
  </g>
</svg>`;

/* -------------------------------------------- */
/*  Utilidades                                  */
/* -------------------------------------------- */

function el(tag, classe, html) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (html != null) e.innerHTML = html;
  return e;
}

function botao(icone, rotulo, aoClicar, { classe = "", desativado = false, titulo = "" } = {}) {
  const b = el("button", `t20t-btn ${classe}`, `<i class="fa-solid ${icone}"></i>${rotulo ? `<span>${rotulo}</span>` : ""}`);
  b.type = "button";
  b.disabled = desativado;
  if (titulo) b.dataset.tooltip = titulo;
  b.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    aoClicar(ev);
  });
  return b;
}

const ICONES = {
  diverso: "fa-box-open",
  pocao: "fa-flask",
  riqueza: "fa-gem",
  arma: "fa-sword",
  armadura: "fa-shield",
  esoterico: "fa-hat-wizard",
  acessorio: "fa-ring"
};
const icone = (e) => ICONES[e.categoria] ?? ICONES[e.subtipo] ?? (e.categoria === "magico" ? "fa-wand-sparkles" : "fa-box");
const classeRaridade = (e) => (e.especifico ? "lendario" : e.categoria);

function textoEspacos(e) {
  if (e.categoria !== "riqueza" && e.espacos == null) return "";
  if (e.espacos == null) return "não carregável";
  return `${fmt(e.espacos)} ${e.espacos > 1 ? "espaços" : "espaço"}`;
}

const reduzirMovimento = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* -------------------------------------------- */
/*  Construção                                  */
/* -------------------------------------------- */

function construir(estado) {
  raiz = el("div", "t20t-tela");
  raiz.id = "t20t-tela";
  const vazio = !temConteudo(estado);
  raiz.classList.toggle("vazio", vazio);

  const palco = el("div", "t20t-palco");

  const cab = el("header", "t20t-cabecalho");
  cab.append(
    el("h1", "t20t-titulo", vazio ? "Nada de valor..." : "Tesouro encontrado!"),
    el("p", "t20t-subtitulo", `ND ${estado.nd} · Tesouro ${ROTULO_TESOURO[estado.tipo] ?? estado.tipo}`)
  );

  const area = el("div", "t20t-bau-area");
  area.append(el("div", "t20t-raios"), el("div", "t20t-bau-wrap", SVG_BAU));
  const brilhos = el("div", "t20t-brilhos");
  for (let i = 0; i < 12; i++) {
    const s = el("span", "t20t-brilho", "✦");
    s.style.left = `${8 + Math.random() * 84}%`;
    s.style.top = `${4 + Math.random() * 70}%`;
    s.style.animationDelay = `${1.6 + Math.random() * 2.5}s`;
    s.style.fontSize = `${10 + Math.random() * 14}px`;
    brilhos.append(s);
  }
  area.append(brilhos);

  const painel = el("section", "t20t-painel");
  painel.append(el("div", "t20t-moedas"), el("div", "t20t-aviso"), el("ol", "t20t-lista"), el("details", "t20t-log"));

  const barra = el("footer", "t20t-barra");

  palco.append(cab, area, painel, barra);
  raiz.append(palco);
  document.body.append(raiz);

  if (!reduzirMovimento()) {
    void raiz.offsetWidth; // força o estilo inicial antes de iniciar as animações
    raiz.classList.add("abrindo");
    if (!vazio) setTimeout(() => chuvaDeMoedas(area, estado), 1300);
  } else raiz.classList.add("abrindo", "sem-animacao");
}

function temConteudo(estado) {
  const m = estado.moedas ?? {};
  return Boolean(m.tc || m.tp || m.to || estado.entradas?.length);
}

function chuvaDeMoedas(area, estado) {
  if (!raiz) return;
  const gemas = estado.entradas.some((e) => e.categoria === "riqueza");
  const n = 30;
  for (let i = 0; i < n; i++) {
    const gema = gemas && i % 4 === 0;
    const m = el("span", gema ? "t20t-gema" : "t20t-moeda");
    m.style.setProperty("--dx", `${(Math.random() * 2 - 1) * 260}px`);
    m.style.setProperty("--dy", `${-120 - Math.random() * 170}px`);
    m.style.setProperty("--rot", `${(Math.random() * 2 - 1) * 540}deg`);
    m.style.animationDelay = `${Math.random() * 0.35}s`;
    if (gema) m.style.setProperty("--cor", ["#e0304a", "#3a8bff", "#3ccf7a", "#b36bff"][i % 4]);
    area.append(m);
    setTimeout(() => m.remove(), 2600);
  }
}

/* -------------------------------------------- */
/*  Conteúdo                                    */
/* -------------------------------------------- */

function animarNumero(span, alvo, atraso) {
  const inicio = performance.now() + atraso;
  const dur = 1100;
  const passo = (agora) => {
    if (!span.isConnected) return;
    const t = Math.min(1, Math.max(0, (agora - inicio) / dur));
    span.textContent = fmt(Math.round(alvo * (1 - Math.pow(1 - t, 3))));
    if (t < 1) requestAnimationFrame(passo);
  };
  span.textContent = "0";
  requestAnimationFrame(passo);
}

function desenharMoedas(estado, primeira) {
  const caixa = raiz.querySelector(".t20t-moedas");
  caixa.replaceChildren();
  const m = estado.moedas;
  const gm = game.user.isGM;
  for (const chave of ["to", "tp", "tc"]) {
    const pilula = el("div", `t20t-moeda-pilula ${chave}`);
    pilula.append(el("i", `fa-solid fa-coins`));
    if (gm && editando && !estado.distribuido) {
      const inp = el("input");
      inp.type = "number";
      inp.min = "0";
      inp.step = "1";
      inp.value = m[chave];
      inp.addEventListener("change", () => A.definirMoeda(chave, inp.value));
      pilula.append(inp);
    } else {
      const v = el("span", "valor", fmt(m[chave]));
      pilula.append(v);
      if (primeira && m[chave]) animarNumero(v, m[chave], 1700);
    }
    pilula.append(el("span", "simbolo", SIMBOLO[chave]));
    caixa.append(pilula);
  }
  caixa.append(el("div", "t20t-total", `Valor estimado: <strong>T$ ${fmt(valorTotal(estado))}</strong>`));
}

function linhaEntrada(e, { acoes = true } = {}) {
  const li = el("li", `t20t-item cat-${classeRaridade(e)}`);
  li.dataset.id = e.id;

  const ic = el("div", "t20t-item-icone", `<i class="fa-solid ${icone(e)}"></i>`);
  const txt = el("div", "t20t-item-texto");
  txt.append(el("div", "t20t-item-nome", `${A.esc(e.nome)}${e.quantidade > 1 ? ` <span class="qtd">×${e.quantidade}</span>` : ""}`));
  const sub = [A.esc(e.rotulo ?? ""), e.ref ? `<span class="ref">${A.esc(e.ref)}</span>` : ""].filter(Boolean).join(" · ");
  if (sub) txt.append(el("div", "t20t-item-rotulo", sub));
  if (e.detalhes?.length) txt.append(el("div", "t20t-item-detalhes", e.detalhes.map((d) => `<span>${A.esc(d)}</span>`).join("")));

  const dir = el("div", "t20t-item-valor");
  if (e.valor != null) dir.append(el("strong", null, `T$ ${fmt(e.valor * (e.quantidade ?? 1))}`));
  const esp = textoEspacos(e);
  if (esp) dir.append(el("small", null, esp));

  li.append(ic, txt, dir);

  if (e.rolagens?.length) {
    const rol = el("ul", "t20t-item-rolagens", e.rolagens.map((r) => `<li>${A.esc(r)}</li>`).join(""));
    li.append(rol);
    li.classList.add("expansivel");
    li.addEventListener("click", () => li.classList.toggle("expandido"));
  }

  const estado = A.estadoAtual();
  if (acoes && game.user.isGM && editando && !estado.distribuido) {
    const ac = el("div", "t20t-item-acoes");
    if (e.gerador) ac.append(botao("fa-dice", "", () => A.rerrolar(e.id), { titulo: "Rerrolar este item" }));
    ac.append(botao("fa-pen", "", () => A.editarEntrada(e.id), { titulo: "Editar" }));
    if (e.categoria === "riqueza") ac.append(botao("fa-coins", "", () => A.venderRiqueza(e.id), { titulo: "Converter em moedas" }));
    ac.append(botao("fa-trash", "", () => A.remover(e.id), { classe: "perigo", titulo: "Remover do tesouro" }));
    li.append(ac);
  }
  return li;
}

function linhaEscolha(e) {
  const li = el("li", "t20t-item t20t-escolha");
  li.dataset.id = e.id;
  li.append(el("div", "t20t-escolha-titulo", `<i class="fa-solid fa-dice-two"></i> 2D — escolha um: <small>${A.esc(e.rolagens?.[0] ?? "")}</small>`));
  const grade = el("div", "t20t-escolha-opcoes");
  e.opcoes.forEach((op, i) => {
    const caixa = el("div", "t20t-opcao");
    const lista = el("ol", "t20t-lista-interna");
    lista.append(linhaEntrada(op, { acoes: false }));
    caixa.append(lista);
    if (game.user.isGM && !A.estadoAtual().distribuido) caixa.append(botao("fa-hand-pointer", "Escolher", () => A.escolher(e.id, i), { classe: "primario" }));
    grade.append(caixa);
  });
  li.append(grade);
  if (game.user.isGM && editando) {
    const ac = el("div", "t20t-item-acoes");
    ac.append(botao("fa-trash", "", () => A.remover(e.id), { classe: "perigo", titulo: "Remover do tesouro" }));
    li.append(ac);
  }
  return li;
}

function desenharLista(estado, primeira) {
  const lista = raiz.querySelector(".t20t-lista");
  lista.replaceChildren();
  let ordem = 0;
  for (const e of estado.entradas) {
    const li = e.categoria === "escolha" ? linhaEscolha(e) : linhaEntrada(e);
    if (!vistos.has(e.id)) {
      li.classList.add("entrando");
      li.style.animationDelay = primeira ? `${1.9 + ordem++ * 0.13}s` : "0s";
      vistos.add(e.id);
    }
    lista.append(li);
  }
  if (!estado.entradas.length) {
    lista.append(el("li", "t20t-vazio", temConteudo(estado) ? "Apenas moedas." : "O baú está vazio. Nenhuma rolagem resultou em tesouro."));
  }

  const aviso = raiz.querySelector(".t20t-aviso");
  aviso.replaceChildren();
  if (estado.distribuido) aviso.append(el("div", "t20t-faixa ok", `<i class="fa-solid fa-check"></i> Tesouro distribuído`));
  else if (estado.entradas.some((e) => e.categoria === "escolha")) {
    aviso.append(
      el("div", "t20t-faixa", `<i class="fa-solid fa-circle-info"></i> Há itens com <strong>2D</strong>: os jogadores escolhem uma das opções.`)
    );
  }

  const log = raiz.querySelector(".t20t-log");
  log.innerHTML = `<summary><i class="fa-solid fa-dice-d20"></i> Rolagens na tabela "Tesouro por ND"</summary>
    <ul>${(estado.log ?? []).map((l) => `<li>${A.esc(l)}</li>`).join("")}</ul>
    <p class="fonte">Clique em um item para ver as rolagens dele.</p>`;
}

function desenharBarra(estado) {
  const barra = raiz.querySelector(".t20t-barra");
  barra.replaceChildren();
  if (!game.user.isGM) {
    barra.append(botao("fa-xmark", "Fechar", () => fecharLocal()));
    return;
  }
  const fechado = estado.distribuido;
  const temRiquezas = estado.entradas.some((e) => e.categoria === "riqueza");
  const pendente = estado.entradas.some((e) => e.categoria === "escolha");

  barra.append(
    botao(editando ? "fa-check" : "fa-pen-to-square", editando ? "Concluir" : "Personalizar", () => {
      editando = !editando;
      atualizar(A.estadoAtual());
    }, { desativado: fechado, classe: editando ? "ativo" : "" })
  );
  if (editando) barra.append(botao("fa-plus", "Adicionar item", () => A.adicionarEntrada(), { desativado: fechado }));
  barra.append(
    botao("fa-arrow-right-arrow-left", "T$ → TO", () => A.tpParaTO(), { desativado: fechado || estado.moedas.tp < 10, titulo: "Converte cada 10 T$ em 1 TO" }),
    botao("fa-arrow-right-arrow-left", "TC → T$", () => A.tcParaTP(), { desativado: fechado || estado.moedas.tc < 10, titulo: "Converte cada 10 TC em 1 T$" }),
    botao("fa-gem", "Riquezas → moedas", () => A.riquezasEmMoedas(), {
      desativado: fechado || !temRiquezas,
      titulo: "Vende todas as riquezas pelo valor e soma às moedas"
    }),
    botao("fa-people-group", "Distribuir", () => A.abrirDistribuicao(), {
      classe: "primario",
      desativado: fechado || pendente || !temConteudo(estado),
      titulo: pendente ? "Resolva as escolhas 2D primeiro" : "Dividir entre os jogadores"
    }),
    botao("fa-xmark", "Fechar", () => A.fecharTesouro(), { titulo: "Fecha a tela para todos" })
  );
}

function atualizar(estado, primeira = false) {
  if (!raiz) return;
  raiz.classList.toggle("editando", editando && game.user.isGM);
  desenharMoedas(estado, primeira);
  desenharLista(estado, primeira);
  desenharBarra(estado);
}

/* -------------------------------------------- */
/*  API da tela                                 */
/* -------------------------------------------- */

function destruir() {
  raiz?.remove();
  raiz = null;
  idMostrado = null;
}

function fecharLocal() {
  fechadoLocal = idMostrado;
  if (!raiz) return;
  const r = raiz;
  raiz = null;
  idMostrado = null;
  r.classList.add("saindo");
  setTimeout(() => r.remove(), 450);
}

/** Desenha (ou atualiza) a tela a partir do estado. */
export function renderizar(estado) {
  if (!estado?.id || !estado.aberto) {
    if (raiz) {
      fechadoLocal = null;
      fecharLocal();
      fechadoLocal = null;
    }
    return;
  }
  if (fechadoLocal === estado.id) return;
  const novo = !raiz || idMostrado !== estado.id;
  if (novo) {
    destruir();
    vistos.clear();
    editando = false;
    construir(estado);
    idMostrado = estado.id;
  }
  atualizar(estado, novo);
}

/** Reabre localmente (jogador que fechou). */
export function mostrarDeNovo() {
  fechadoLocal = null;
  renderizar(A.estadoAtual());
}
