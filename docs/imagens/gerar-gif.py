# Gera um GIF que reproduz, como terminal, uma execução real do /deus (stream-json do claude -p).
# Uso: claude -p "/modo-deus:deus <pedido>" --output-format stream-json --verbose > run.jsonl
#      py docs/imagens/gerar-gif.py run.jsonl docs/imagens/deus-exemplo.gif   (precisa do Pillow)
import json, re, sys
from PIL import Image, ImageDraw, ImageFont

entrada, saida = sys.argv[1], sys.argv[2]
L, A, PAD, LINHA, VISIVEIS = 980, 560, 22, 24, 20
FUNDO, TEXTO, APAGADO, LARANJA, VERDE, ROXO = (28, 23, 18), (236, 230, 220), (163, 155, 142), (232, 116, 44), (95, 154, 88), (138, 100, 184)
fonte = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 16)
negrito = ImageFont.truetype("C:/Windows/Fonts/consolab.ttf", 16)
simbolo = ImageFont.truetype("C:/Windows/Fonts/seguisym.ttf", 15)
GLIFOS = "❯✎✦◆☐✓"

def limpar(t):
    # tira caminhos da máquina e quebras
    t = re.sub(r"[A-Za-z]:[\\/]Users[\\/][^\\/\s\"']+[\\/][^\s\"']*?(tarefas-exemplo)", r"~/\1", t)
    t = re.sub(r"/c/Users/[^/\s]+/[^\s\"']*?(tarefas-exemplo)", r"~/\1", t)
    t = re.sub(r"[A-Za-z]:[\\/]Users[\\/][^\\/\s\"']+", "~", t)
    return " ".join(t.split())

def corta(t, n=88):
    return t if len(t) <= n else t[: n - 1] + "…"

linhas = []  # (texto, cor, negrito, recuo)
def add(t, cor=TEXTO, b=False, recuo=0):
    if "AppData" in t or "Temp/claude" in t:
        return  # caminho temporário da sessão: ruído e nada a mostrar
    linhas.append((corta(limpar(t), 88 - recuo // 9), cor, b, recuo))

pedido = None
for bruto in open(entrada, encoding="utf-8"):
    try:
        ev = json.loads(bruto)
    except json.JSONDecodeError:
        continue
    sub = ev.get("parent_tool_use_id") is not None
    recuo = 18 if sub else 0
    if ev.get("type") == "assistant":
        for c in ev.get("message", {}).get("content", []):
            if c.get("type") == "text" and c.get("text", "").strip() and not sub:
                primeira = next((l for l in c["text"].splitlines() if l.strip() and not l.strip().startswith(("```", "{", "}", "|", "\""))), "")
                if primeira:
                    add(primeira.strip("#* "), TEXTO, False, recuo)
            elif c.get("type") == "tool_use":
                n, i = c.get("name"), c.get("input", {})
                if n == "Skill":
                    add(f"✦ skill {i.get('skill', '')}", ROXO, False, recuo)
                elif n in ("Agent", "Task"):
                    add(f"◆ despacha {i.get('subagent_type', 'agente')}: {i.get('description', '')}", LARANJA, True, recuo)
                elif n == "Bash":
                    add(f"❯ {i.get('command', '')}", APAGADO, False, recuo)
                elif n in ("Edit", "Write", "MultiEdit"):
                    add(f"✎ {i.get('file_path', '')}", LARANJA, False, recuo)
                elif n in ("TaskCreate", "TaskUpdate"):
                    add(f"☐ {i.get('subject') or i.get('status') or 'tarefa'}", APAGADO, False, recuo)
    elif ev.get("type") == "result":
        s = ev.get("duration_ms", 0) / 1000
        add(f"✓ pronto em {s / 60:.1f} min · {ev.get('num_turns', '?')} turnos", VERDE, True)

# tira repetições seguidas e limita o tamanho
enxuto = []
for l in linhas:
    if not enxuto or enxuto[-1][0] != l[0]:
        enxuto.append(l)
linhas = enxuto[:60]
cab = ("❯ /deus mudar a mensagem de erro de título vazio para \"Escreva um título\"", LARANJA, True, 0)

def quadro(ate):
    im = Image.new("RGB", (L, A), FUNDO)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((8, 8, L - 8, A - 8), 12, outline=(70, 58, 46), width=1)
    for k, cor in enumerate([(217, 83, 74), (201, 141, 31), (95, 154, 88)]):
        d.ellipse((22 + k * 18, 20, 32 + k * 18, 30), fill=cor)
    d.text((80, 16), "modo-deus · exemplo tarefas", font=fonte, fill=APAGADO)
    mostrar = [cab] + linhas[:ate]
    mostrar = mostrar[-VISIVEIS:]
    y = 48
    for t, cor, b, recuo in mostrar:
        x = PAD + recuo
        if t[:1] in GLIFOS:
            d.text((x, y + 1), t[0], font=simbolo, fill=cor)
            t, x = t[1:], x + 18
        d.text((x, y), t, font=negrito if b else fonte, fill=cor)
        y += LINHA
    return im

quadros = [quadro(i) for i in range(0, len(linhas) + 1)]
duracoes = [900] + [550] * (len(quadros) - 2) + [3500]
quadros[0].save(saida, save_all=True, append_images=quadros[1:], duration=duracoes, loop=0, optimize=True)
print(f"{len(quadros)} quadros, {len(linhas)} linhas")
