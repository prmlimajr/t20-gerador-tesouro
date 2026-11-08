#!/usr/bin/env python3
"""
Converte a planilha "T20 - Tabela de geração de tesouros.xlsx" em data/tabelas.json.

Uso (na raiz do módulo):
    python3 tools/converter.py "T20 - Tabela de geração de tesouros.xlsx" data/tabelas.json

Só usa a biblioteca padrão. Além de converter, valida que cada tabela cobre
o intervalo do dado inteiro, sem buracos nem sobreposições.

Observação: o Excel transformou várias células em datas (ex.: a faixa "03-04"
virou 3 de abril, e o ND "1/4" virou 1º de abril). O conversor desfaz isso.
"""
import datetime
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


# --------------------------------------------------------------------------
# Leitura do xlsx
# --------------------------------------------------------------------------

def ler_planilha(caminho):
    z = zipfile.ZipFile(caminho)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    relmap = {r.get("Id"): r.get("Target") for r in rels}
    abas = {}
    for s in wb.find("m:sheets", NS):
        alvo = relmap[s.get("{%s}id" % NS["r"])].lstrip("/")
        alvo = alvo if alvo.startswith("xl/") else "xl/" + alvo
        celulas = {}
        for c in ET.fromstring(z.read(alvo)).iter("{%s}c" % NS["m"]):
            v = c.find("m:v", NS)
            if v is None:
                continue
            val = v.text
            if c.get("t") == "s":
                val = shared[int(val)]
            col, lin = re.match(r"([A-Z]+)(\d+)", c.get("r")).groups()
            celulas[(col, int(lin))] = val
        abas[s.get("name")] = celulas
    return abas


def data_excel(v):
    """Número de série de data do Excel -> (dia, mês), ou None."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f < 40000:
        return None
    d = datetime.date(1899, 12, 30) + datetime.timedelta(days=int(f))
    return d.day, d.month


def faixa(v):
    """'01-30', '100.0', '45931.0' (=01-10), '1 a 4' -> (min, max) ou None ('—')."""
    if v is None:
        return None
    v = str(v).strip()
    if v in ("—", "-", ""):
        return None
    dm = data_excel(v)
    if dm:
        return dm[0], dm[1]
    m = re.fullmatch(r"(\d+)\s*(?:-|a)\s*(\d+)", v)
    if m:
        return int(m.group(1)), int(m.group(2))
    try:
        n = int(float(v))
        return n, n
    except ValueError:
        raise ValueError(f"Faixa inválida: {v!r}")


def nd_texto(v):
    dm = data_excel(v)
    if dm:
        return f"{dm[0]}/{dm[1]}"
    return str(int(float(v)))


def numero(v):
    if v is None:
        return None
    try:
        f = float(v)
        return int(f) if f.is_integer() else f
    except ValueError:
        return None


def texto(v):
    return None if v is None else str(v).strip()


# --------------------------------------------------------------------------
# Interpretação dos textos da aba "Tesouro por ND"
# --------------------------------------------------------------------------

MOEDAS = {"TC": "tc", "T$": "tp", "TO": "to"}
CATEGORIAS = {"menor": "menor", "menores": "menor", "média": "media", "médias": "media",
              "maior": "maior", "maiores": "maior", "médio": "medio"}


def interpretar_dinheiro(t):
    t = t.strip()
    if t == "—":
        return {"tipo": "nada", "texto": t}
    m = re.fullmatch(r"(\d+d\d+(?:\+\d+)?)x([\d.]+) (TC|T\$|TO)", t)
    if m:
        return {"tipo": "moedas", "dados": m.group(1), "mult": int(m.group(2).replace(".", "")),
                "moeda": MOEDAS[m.group(3)], "texto": t}
    m = re.fullmatch(r"(\d+(?:d\d+)?(?:\+\d+)?) riquezas? (menor|menores|média|médias|maior|maiores) ?(\+%)?", t)
    if m:
        return {"tipo": "riqueza", "qtd": m.group(1), "categoria": CATEGORIAS[m.group(2)],
                "bonus": bool(m.group(3)), "texto": t}
    raise ValueError(f"Dinheiro não reconhecido: {t!r}")


def interpretar_itens(t):
    t = t.strip()
    if t == "—":
        return {"tipo": "nada", "texto": t}
    dois = t.endswith(" 2D")
    base = t[:-3] if dois else t
    if base == "Item diverso":
        return {"tipo": "diverso", "texto": t}
    if base == "Equipamento":
        return {"tipo": "equipamento", "doisD": dois, "texto": t}
    m = re.fullmatch(r"(\d+(?:d\d+)?(?:\+\d+)?) poç(?:ão|ões) ?(\+%)?", base)
    if m:
        return {"tipo": "pocao", "qtd": m.group(1), "bonus": bool(m.group(2)), "texto": t}
    m = re.fullmatch(r"Superior \((\d) melhorias?\)", base)
    if m:
        return {"tipo": "superior", "melhorias": int(m.group(1)), "doisD": dois, "texto": t}
    m = re.fullmatch(r"Mágico \((menor|médio|maior)\)", base)
    if m:
        return {"tipo": "magico", "categoria": CATEGORIAS[m.group(1)], "doisD": dois, "texto": t}
    raise ValueError(f"Item não reconhecido: {t!r}")


# --------------------------------------------------------------------------
# Abas
# --------------------------------------------------------------------------

def tesouro_por_nd(c):
    linhas = {}
    ordem = []
    nd_atual = None
    lin = 2
    while (("B", lin) in c) or (("A", lin) in c and lin < 93):
        if ("A", lin) in c and ("B", lin) in c:
            nd_atual = nd_texto(c[("A", lin)])
            ordem.append(nd_atual)
            linhas[nd_atual] = {"dinheiro": [], "itens": []}
        if ("B", lin) in c:
            a, b = faixa(c[("B", lin)])
            linhas[nd_atual]["dinheiro"].append({"min": a, "max": b, **interpretar_dinheiro(c[("C", lin)])})
        if ("E", lin) in c:
            a, b = faixa(c[("E", lin)])
            linhas[nd_atual]["itens"].append({"min": a, "max": b, **interpretar_itens(c[("F", lin)])})
        lin += 1
    return ordem, linhas


def dividir_exemplos(texto_ex):
    """'0,5 espaço: a, b;\\n1 espaço: c' -> [{espacos: 0.5, itens: [a, b]}, ...]"""
    grupos = []
    for parte in re.split(r";?\n", texto_ex.strip().rstrip(".")):
        parte = parte.strip().rstrip(";").rstrip(".")
        if not parte:
            continue
        rotulo, _, resto = parte.partition(":")
        rotulo = rotulo.strip()
        if rotulo == "—":
            esp = None
        else:
            esp = float(re.match(r"([\d,]+)", rotulo).group(1).replace(",", "."))
            esp = int(esp) if esp.is_integer() else esp
        # separa por vírgula fora de parênteses
        itens, nivel, atual = [], 0, ""
        for ch in resto:
            if ch == "(":
                nivel += 1
            elif ch == ")":
                nivel -= 1
            if ch == "," and nivel == 0:
                itens.append(atual.strip())
                atual = ""
            else:
                atual += ch
        if atual.strip():
            itens.append(atual.strip())
        # "jarro de especiarias, como canela, gorad, pimenta ou sal" é um item só
        juntos = []
        continuando = False
        for it in itens:
            if continuando:
                juntos[-1] += ", " + it
                if " ou " in it:
                    continuando = False
            elif it.startswith("como ") and juntos:
                juntos[-1] += ", " + it
                continuando = " ou " not in it
            else:
                juntos.append(it)
        grupos.append({"espacos": esp, "itens": juntos})
    return grupos


def valor_riqueza(t):
    m = re.fullmatch(r"(\d+d\d+)(?:x([\d.]+))? \(([\d.]+)\)", t.strip())
    if not m:
        raise ValueError(f"Valor de riqueza não reconhecido: {t!r}")
    return {"dados": m.group(1), "mult": int((m.group(2) or "1").replace(".", "")),
            "media": int(m.group(3).replace(".", "")), "texto": t.strip()}


def riquezas(c):
    linhas = []
    for lin in range(3, 16):
        linhas.append({
            "menor": faixa(c.get(("A", lin))),
            "media": faixa(c.get(("B", lin))),
            "maior": faixa(c.get(("C", lin))),
            "valor": valor_riqueza(c[("D", lin)]),
            "exemplos": dividir_exemplos(c[("E", lin)]),
        })
    tabelas = {}
    for cat in ("menor", "media", "maior"):
        tabelas[cat] = [{"min": l[cat][0], "max": l[cat][1], "linha": i}
                        for i, l in enumerate(linhas) if l[cat]]
    espacos = []
    for lin in range(21, 28):
        a, b = faixa(c[("A", lin)])
        espacos.append({"min": a, "max": b, "espacos": numero(c[("B", lin)]), "descricao": texto(c[("C", lin)])})
    return {"linhas": [{"valor": l["valor"], "exemplos": l["exemplos"]} for l in linhas],
            "tabelas": tabelas, "espacos": espacos}


def tabela_simples(c, col_d, col_nome, col_livro, col_pag, col_preco=None, inicio=2, fim=None, marcas=None):
    out = []
    lin = inicio
    while True:
        if fim and lin > fim:
            break
        chave = c.get((col_d, lin))
        nome = c.get((col_nome, lin))
        if chave is None and nome is None:
            if fim is None:
                break
            lin += 1
            continue
        try:
            fx = faixa(chave)
        except ValueError:
            break  # chegou numa nota/cabeçalho
        if fx is None or nome is None:
            break
        nome = texto(nome)
        ent = {"min": fx[0], "max": fx[1]}
        m = re.fullmatch(r"(.*?)(\*+)$", nome)
        estrelas = 0
        if m:
            nome, estrelas = m.group(1).strip(), len(m.group(2))
        ent["nome"] = nome
        if marcas and estrelas:
            ent.update(marcas[estrelas])
        if col_preco:
            ent["preco"] = numero(c.get((col_preco, lin)))
        livro = texto(c.get((col_livro, lin)))
        if livro and livro.lower().startswith("role"):
            ent["especifico"] = True
        else:
            ent["livro"] = livro
            ent["pagina"] = numero(c.get((col_pag, lin)))
        out.append(ent)
        lin += 1
    return out


def achar_linha(c, col, texto_alvo):
    for (cc, lin), v in c.items():
        if cc == col and str(v).strip().upper() == texto_alvo:
            return lin
    raise ValueError(f"Cabeçalho {texto_alvo!r} não encontrado na coluna {col}")


# --------------------------------------------------------------------------
# Validação
# --------------------------------------------------------------------------

def validar(nome, tabela, ate=100):
    pos = 1
    for e in sorted(tabela, key=lambda e: e["min"]):
        if e["min"] != pos:
            raise ValueError(f"{nome}: esperava faixa começando em {pos}, achei {e['min']}-{e['max']}")
        if e["max"] < e["min"]:
            raise ValueError(f"{nome}: faixa invertida {e['min']}-{e['max']}")
        pos = e["max"] + 1
    if pos - 1 != ate:
        raise ValueError(f"{nome}: termina em {pos - 1}, esperava {ate}")


# --------------------------------------------------------------------------

def main(origem, destino):
    abas = ler_planilha(origem)

    ordem, nds = tesouro_por_nd(abas["Tesouro por ND"])
    rq = riquezas(abas["Riquezas"])

    eq = abas["Equipamentos"]
    sup = abas["Superiores"]
    mag = abas["Mágicos"]
    ace = abas["Mágicos (Acessórios)"]

    dois = {"custo": 2}
    dados = {
        "fonte": "T20 - Tabela de geração de tesouros (Guilherme Dei Svaldi; riquezas adicionais: Rafael Dei Svaldi)",
        "ordemND": ordem,
        "tesouroPorND": nds,
        "riquezas": rq,
        "itensDiversos": tabela_simples(abas["Itens Diversos"], "A", "B", "C", "D"),
        "equipamentos": {
            "arma": tabela_simples(eq, "A", "B", "C", "D", inicio=3),
            "armadura": tabela_simples(eq, "F", "G", "H", "I", inicio=3),
            "esoterico": tabela_simples(eq, "K", "L", "M", "N", inicio=3),
        },
        "pocoes": tabela_simples(abas["Poções"], "A", "B", "D", "E", col_preco="C"),
        "superiores": {
            # *  conta como duas melhorias (inclui a de pré-requisito)
            # ** material especial (role 1d6)
            "arma": tabela_simples(sup, "A", "B", "C", "D", inicio=3, marcas={1: dois, 2: {"material": True}}),
            "armadura": tabela_simples(sup, "F", "G", "H", "I", inicio=3, marcas={1: dois, 2: {"material": True}}),
            "esoterico": tabela_simples(sup, "K", "L", "M", "N", inicio=3, marcas={1: dois, 2: {"material": True}}),
        },
        "materiais": ["aço-rubi", "adamante", "gelo eterno", "madeira Tollon", "matéria vermelha", "mitral"],
        "magicos": {
            # Armas: * conta como dois encantos
            "arma": tabela_simples(mag, "A", "B", "C", "D", inicio=3, marcas={1: dois}),
            # Armaduras: * só armaduras, ** só escudos, *** conta como dois
            "armadura": tabela_simples(mag, "F", "G", "H", "I", inicio=3,
                                       marcas={1: {"restricao": "armadura"}, 2: {"restricao": "escudo"}, 3: dois}),
            # Esotéricos: * só para itens com pelo menos dois encantos
            "esoterico": tabela_simples(mag, "K", "L", "M", "N", inicio=3, marcas={1: {"restricao": "doisEncantos"}}),
        },
        "especificos": {
            "arma": tabela_simples(mag, "A", "B", "C", "D", inicio=achar_linha(mag, "A", "ARMAS ESPECÍFICAS") + 2),
            "armadura": tabela_simples(mag, "F", "G", "H", "I",
                                       inicio=achar_linha(mag, "F", "ARMADURAS & ESCUDOS ESPECÍFICOS") + 2),
            "esoterico": tabela_simples(mag, "K", "L", "M", "N", inicio=achar_linha(mag, "K", "ESOTÉRICOS ESPECÍFICOS") + 2),
        },
        "acessorios": {
            "menor": tabela_simples(ace, "A", "B", "D", "E", col_preco="C", inicio=3),
            "medio": tabela_simples(ace, "G", "H", "J", "K", col_preco="I", inicio=3),
            "maior": tabela_simples(ace, "M", "N", "P", "Q", col_preco="O", inicio=3),
        },
    }

    # ---- validações ----
    for nd in ordem:
        validar(f"ND {nd} dinheiro", nds[nd]["dinheiro"])
        validar(f"ND {nd} itens", nds[nd]["itens"])
    for cat, t in rq["tabelas"].items():
        validar(f"Riquezas {cat}", t)
    validar("Espaços das riquezas", rq["espacos"], ate=20)
    validar("Itens diversos", dados["itensDiversos"])
    validar("Poções", dados["pocoes"], ate=max(e["max"] for e in dados["pocoes"]))
    for grupo in ("equipamentos", "superiores", "magicos", "especificos", "acessorios"):
        for k, t in dados[grupo].items():
            validar(f"{grupo}.{k}", t)

    with open(destino, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=1)
        f.write("\n")

    print(f"OK: {destino}")
    print(f"  NDs: {', '.join(ordem)}")
    print(f"  Itens diversos: {len(dados['itensDiversos'])}  Poções: {len(dados['pocoes'])} (até {dados['pocoes'][-1]['max']})")
    for grupo in ("equipamentos", "superiores", "magicos", "especificos", "acessorios"):
        print(f"  {grupo}: " + ", ".join(f"{k}={len(v)}" for k, v in dados[grupo].items()))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
