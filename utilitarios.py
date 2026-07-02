# -*- coding: utf-8 -*-
"""
Funções compartilhadas entre app.py e backup_resumo.py.

Antes, a lógica de gerar a imagem de resumo e enviar e-mail existia
apenas dentro de backup_resumo.py. Como agora o app também precisa
gerar resumos (botões de resumo do dia/semana), essa lógica foi
extraída para cá, para não duplicar código nos dois arquivos.
"""

import smtplib
from email.message import EmailMessage
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def carregar_fonte(tamanho):
    """
    Tenta carregar Arial (padrão no Windows) e, se não encontrar,
    tenta fontes livres comuns em distribuições Linux (DejaVu Sans,
    Liberation Sans) antes de cair na fonte padrão do Pillow.

    A fonte padrão do Pillow é uma bitmap pequena, sem suporte
    adequado a acentuação — por isso vale tentar as alternativas
    antes de usá-la.
    """
    candidatos = [
        "arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for caminho in candidatos:
        try:
            return ImageFont.truetype(caminho, tamanho)
        except Exception:
            continue
    return ImageFont.load_default()


def gerar_imagem_resumo(titulo, subtitulo, eventos, tarefas, caminho_saida,
                         agrupar_por_dia=False):
    """
    Gera uma imagem PNG com o resumo de eventos e tarefas e salva em
    caminho_saida.

    eventos: lista de dicts com pelo menos titulo, data, hora_inicio,
             hora_fim e (opcionalmente) descricao.
    tarefas: lista de dicts com pelo menos titulo e (opcionalmente) prazo.
    agrupar_por_dia: quando True, insere a data como um subtítulo antes
                      de cada grupo de eventos daquele dia — usado no
                      resumo da semana, onde eventos de dias diferentes
                      aparecem juntos.
    """
    largura = 1200

    # A altura é calculada com base na quantidade de itens, para não
    # cortar conteúdo quando há muitos eventos/tarefas (ex: resumo da
    # semana) nem sobrar espaço em branco demais quando há poucos.
    altura_base = 260
    altura_por_item = 70
    altura = altura_base + altura_por_item * (len(eventos) + len(tarefas) + 4)
    altura = max(altura, 700)

    imagem = Image.new("RGB", (largura, altura), color=(250, 249, 246))
    draw = ImageDraw.Draw(imagem)

    fonte_titulo = carregar_fonte(42)
    fonte_sub = carregar_fonte(28)
    fonte_texto = carregar_fonte(24)

    y = 40

    # Cabeçalho
    draw.text((40, y), titulo, fill=(45, 90, 39), font=fonte_titulo)
    y += 60

    draw.text((40, y), subtitulo, fill=(70, 70, 70), font=fonte_sub)
    y += 80

    # Eventos
    draw.text((40, y), "EVENTOS", fill=(45, 90, 39), font=fonte_sub)
    y += 50

    if not eventos:
        draw.text((60, y), "Nenhum evento agendado.", fill=(120, 120, 120), font=fonte_texto)
        y += 50
    else:
        data_grupo_atual = None

        for evento in eventos:
            if agrupar_por_dia and evento.get("data") != data_grupo_atual:
                data_grupo_atual = evento.get("data")
                y += 10
                draw.text((50, y), data_grupo_atual or "", fill=(193, 127, 36), font=fonte_texto)
                y += 34

            horario = ""
            if evento.get("hora_inicio"):
                horario = evento["hora_inicio"]
                if evento.get("hora_fim"):
                    horario += f" - {evento['hora_fim']}"

            texto = f"• {horario} {evento.get('titulo', '')}".strip()
            draw.text((60, y), texto, fill=(0, 0, 0), font=fonte_texto)
            y += 35

            if evento.get("descricao"):
                draw.text((90, y), evento["descricao"][:120], fill=(90, 90, 90), font=fonte_texto)
                y += 30

            y += 10

    # Tarefas
    y += 40
    draw.text((40, y), "TAREFAS PENDENTES", fill=(193, 127, 36), font=fonte_sub)
    y += 50

    if not tarefas:
        draw.text((60, y), "Nenhuma tarefa pendente.", fill=(120, 120, 120), font=fonte_texto)
    else:
        for tarefa in tarefas:
            prazo = tarefa.get("prazo") or "Sem prazo"
            texto = f"• {tarefa.get('titulo', '')} (Prazo: {prazo})"
            draw.text((60, y), texto, fill=(0, 0, 0), font=fonte_texto)
            y += 35

    imagem.save(caminho_saida)
    return caminho_saida


def enviar_email_com_anexo(remetente, senha_app, destino, assunto, corpo, caminho_anexo):
    """
    Envia um e-mail via Gmail (SMTP SSL) com uma imagem PNG anexada.

    Não trata exceções internamente — quem chamar essa função decide
    como reagir a uma falha (registrar em log, devolver erro para o
    frontend etc.), em vez de a falha ser sempre silenciosa ou sempre
    derrubar o processo.
    """
    if not remetente or not senha_app or not destino:
        raise ValueError("Configuração de e-mail incompleta no .env.")

    msg = EmailMessage()
    msg["Subject"] = assunto
    msg["From"] = remetente
    msg["To"] = destino
    msg.set_content(corpo)

    with open(caminho_anexo, "rb") as f:
        msg.add_attachment(
            f.read(),
            maintype="image",
            subtype="png",
            filename=Path(caminho_anexo).name
        )

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(remetente, senha_app)
        smtp.send_message(msg)

def enviar_email_com_anexos(remetente, senha_app, destino, assunto, corpo, anexos):
    if not remetente or not senha_app or not destino:
        raise ValueError("Configuração de e-mail incompleta no .env.")

    msg = EmailMessage()
    msg["Subject"] = assunto
    msg["From"] = remetente
    msg["To"] = destino
    msg.set_content(corpo)

    for caminho in anexos:
        caminho = Path(caminho)

        with open(caminho, "rb") as f:
            msg.add_attachment(
                f.read(),
                maintype="application",
                subtype="octet-stream",
                filename=caminho.name
            )

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(remetente, senha_app)
        smtp.send_message(msg)