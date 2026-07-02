import os
import logging
from logging.handlers import RotatingFileHandler
from dotenv import load_dotenv
import sqlite3
import shutil
from pathlib import Path
from datetime import datetime, timedelta
from utilitarios import gerar_imagem_resumo, enviar_email_com_anexos

load_dotenv()

EMAIL_REMETENTE = os.getenv("EMAIL_REMETENTE")
EMAIL_SENHA_APP = os.getenv("EMAIL_SENHA_APP")
EMAIL_DESTINO = os.getenv("EMAIL_DESTINO")

# ==========================================
# CONFIGURAÇÕES
# ==========================================

# Caminhos baseados na localização deste arquivo, e não no diretório
# de onde o script é chamado. Isso evita falhas quando o Agendador
# de Tarefas do Windows executa o script a partir de outra pasta.
BASE_DIR = Path(__file__).resolve().parent

DB_PATH = BASE_DIR / "agenda.db"
PASTA_BACKUPS = BASE_DIR / "backups"
PASTA_RESUMOS = BASE_DIR / "resumos"

PASTA_BACKUPS.mkdir(exist_ok=True)
PASTA_RESUMOS.mkdir(exist_ok=True)


# ==========================================
# LOG EM ARQUIVO
# ==========================================
# Como esse script roda sozinho, agendado, sem ninguém olhando o
# console, os prints foram substituídos por um logger que grava em
# backup_resumo.log (com rotação, para não crescer indefinidamente).

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        RotatingFileHandler(
            BASE_DIR / "backup_resumo.log",
            maxBytes=1_000_000,
            backupCount=3,
            encoding="utf-8"
        ),
        logging.StreamHandler(),  # mantém a saída no console também
    ]
)
log = logging.getLogger("walter_backup")


def limpar_backups_antigos(pasta, manter=8):
    """Mantém apenas os `manter` backups mais recentes, apagando o resto."""
    arquivos = sorted(
        pasta.glob("agenda_*.db"),
        key=lambda p: p.stat().st_mtime,
        reverse=True
    )
    for antigo in arquivos[manter:]:
        antigo.unlink()
        log.info(f"Backup antigo removido: {antigo.name}")


def precisa_de_backup(pasta, intervalo_dias=7):
    """
    Substitui a checagem antiga de "hoje é segunda-feira?" por uma
    checagem de "já se passaram X dias desde o último backup?".

    Isso evita perder o backup da semana caso o computador esteja
    desligado justamente na segunda-feira: o backup é feito assim que
    o script rodar de novo, independentemente do dia da semana.
    """
    arquivos = list(pasta.glob("agenda_*.db"))
    if not arquivos:
        return True
    mais_recente = max(arquivos, key=lambda p: p.stat().st_mtime)
    idade = datetime.now() - datetime.fromtimestamp(mais_recente.stat().st_mtime)
    return idade >= timedelta(days=intervalo_dias)


# ==========================================
# BACKUP DO BANCO
# ==========================================
def main():
    agora = datetime.now()
    nome_backup = None

    if precisa_de_backup(PASTA_BACKUPS, intervalo_dias=7):
        nome_backup = PASTA_BACKUPS / f"agenda_{agora.strftime('%Y-%m-%d_%H-%M-%S')}.db"
        shutil.copy2(DB_PATH, nome_backup)
        limpar_backups_antigos(PASTA_BACKUPS, manter=8)
        log.info(f"Backup criado: {nome_backup}")
    else:
        log.info("Backup recente já existe (menos de 7 dias). Nenhum novo backup necessário hoje.")


    # ==========================================
    # BUSCA DADOS DE AMANHÃ
    # ==========================================

    amanha = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    eventos = conn.execute(
        """
        SELECT titulo, descricao, data, hora_inicio, hora_fim, prioridade
        FROM eventos
        WHERE data = ?
        ORDER BY hora_inicio
        """,
        (amanha,)
    ).fetchall()

    tarefas = conn.execute(
        """
        SELECT titulo, prazo, prioridade
        FROM tarefas_semana
        WHERE concluida = 0
        ORDER BY prazo, id
        """
    ).fetchall()

    conn.close()

    eventos = [dict(e) for e in eventos]
    tarefas = [dict(t) for t in tarefas]


    # ==========================================
    # GERA IMAGEM
    # ==========================================
    # A geração da imagem em si agora vive em utilitarios.py, reaproveitada
    # também pelos botões de resumo do dia/semana no app.py.

    arquivo_imagem = PASTA_RESUMOS / f"resumo_{amanha}.png"
    arquivo_imagem_fixo = PASTA_RESUMOS / "resumo_amanha.png"

    gerar_imagem_resumo(
        "Resumo Walter",
        f"Agenda para {amanha}",
        eventos,
        tarefas,
        arquivo_imagem
    )
    shutil.copy2(arquivo_imagem, arquivo_imagem_fixo)

    log.info(f"Resumo criado: {arquivo_imagem}")


    # ==========================================
    # ENVIA E-MAIL
    # ==========================================

    corpo = f"""Bom dia, Vitor.

    Segue o resumo da sua agenda para amanhã.

    Eventos: {len(eventos)}
    Tarefas pendentes: {len(tarefas)}

    O resumo em imagem está anexado.
    """

    if nome_backup:
        corpo += "\nBackup do banco também foi criado hoje.\n"

    try:
        anexos = [arquivo_imagem_fixo]

        if nome_backup:
            anexos.append(nome_backup)

        enviar_email_com_anexos(
            EMAIL_REMETENTE,
            EMAIL_SENHA_APP,
            EMAIL_DESTINO,
            "Resumo Walter - Agenda de amanhã",
            corpo,
            anexos
        )
        log.info("E-mail enviado com sucesso.")
    except Exception as e:
        log.error(f"Falha ao enviar e-mail de resumo: {e}")
if __name__ == "__main__":
    main()