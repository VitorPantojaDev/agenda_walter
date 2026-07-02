import sqlite3
from flask import Flask, render_template, request, jsonify, g, send_file
import os
from pathlib import Path
from dotenv import load_dotenv
from datetime import datetime, timedelta
import json
from utilitarios import gerar_imagem_resumo, enviar_email_com_anexo
import shutil

load_dotenv()
app = Flask(__name__)

SECRET_KEY = os.getenv("SECRET_KEY")

if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY não encontrada no arquivo .env"
    )

app.secret_key = SECRET_KEY

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / 'agenda.db'

PASTA_RESUMOS = BASE_DIR / 'resumos'
PASTA_RESUMOS.mkdir(exist_ok=True)

app = Flask(__name__)

EMAIL_REMETENTE = os.getenv('EMAIL_REMETENTE')
EMAIL_SENHA_APP = os.getenv('EMAIL_SENHA_APP')
EMAIL_DESTINO = os.getenv('EMAIL_DESTINO')

def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(e=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def init_db():
    with app.app_context():
        conn = get_db()
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS eventos (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            titulo      TEXT NOT NULL,
            descricao   TEXT,
            data        TEXT NOT NULL,
            hora_inicio TEXT,
            hora_fim    TEXT,
            tipo        TEXT DEFAULT 'evento',
            cor         TEXT DEFAULT '#4F8EF7'
        );

        CREATE TABLE IF NOT EXISTS tarefas_semana (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            titulo    TEXT NOT NULL,
            prazo     TEXT,
            concluida INTEGER DEFAULT 0,
            ordem     INTEGER DEFAULT 0
        );                                           
    """)
        conn.commit()

        # --- MIGRACAO: adiciona coluna de prioridade se ainda nao existir ---
        colunas_eventos = [c[1] for c in conn.execute(
            "PRAGMA table_info(eventos)").fetchall()]
        if 'prioridade' not in colunas_eventos:
            conn.execute("ALTER TABLE eventos ADD COLUMN prioridade TEXT DEFAULT 'media'")
        
        colunas_tarefas = [c[1] for c in conn.execute(
            "PRAGMA table_info(tarefas_semana)").fetchall()]
        if 'prioridade' not in colunas_tarefas:
            conn.execute("ALTER TABLE tarefas_semana ADD COLUMN prioridade TEXT DEFAULT 'media'")
        conn.commit()

def localizar_eventos(conn, acao):
    """
    Localiza eventos por:
    - id
    - texto (titulo ou descricao)
    - data opcional

    Retorna: lista de dicts
    """

    # 1. Busca por ID
    if acao.get('id'):
        rows = conn.execute(
            'SELECT * FROM eventos WHERE id = ?',
            (acao['id'],)
        ).fetchall()

        return [dict(r) for r in rows]

    # 2. Obtém texto de busca
    texto = (
        acao.get('alvo_texto')
        or acao.get('titulo')
        or ''
    ).strip()

    data = acao.get('data')
    if not texto and not data:
        return []

    query = '''
        SELECT *
        FROM eventos
        WHERE 1=1
    '''

    params = []

    # 3. Busca em título e descrição
    if texto:
        query += '''
            AND (
                titulo LIKE ?
                OR descricao LIKE ?
            )
        '''
        termo = f'%{texto}%'
        params.extend([termo, termo])

    # 4. Filtro opcional por data
    if data:
        query += ' AND data = ?'
        params.append(data)

    query += '''
        ORDER BY
            data,
            hora_inicio
    '''

    rows = conn.execute(query, params).fetchall()

    return [dict(r) for r in rows]

def existe_conflito_evento(conn, data, inicio, fim, ignorar_id=None):
    if not data or not inicio or not fim:
        return []

    query = '''
        SELECT *
        FROM eventos
        WHERE data = ?
          AND hora_inicio IS NOT NULL
          AND hora_inicio != ''
          AND hora_fim IS NOT NULL
          AND hora_fim != ''
    '''

    params = [data]

    if ignorar_id is not None:
        query += ' AND id != ?'
        params.append(ignorar_id)

    query += '''
        ORDER BY hora_inicio
    '''

    eventos = conn.execute(query, params).fetchall()

    conflitos = []

    for evento in eventos:
        inicio_existente = evento['hora_inicio']
        fim_existente = evento['hora_fim']

        if inicio < fim_existente and fim > inicio_existente:
            conflitos.append(dict(evento))

    return conflitos

def localizar_tarefas(conn, acao):
    """
    Localiza tarefas por:
    - id
    - texto (titulo)
    - prazo opcional

    Retorna: lista de dicts
    """

    # 1. Busca por ID
    if acao.get('id'):
        rows = conn.execute(
            'SELECT * FROM tarefas_semana WHERE id = ?',
            (acao['id'],)
        ).fetchall()

        return [dict(r) for r in rows]

    # 2. Obtém texto de busca
    texto = (
        acao.get('alvo_texto')
        or acao.get('titulo')
        or ''
    ).strip()

    prazo = acao.get('prazo') or acao.get('data')
    if not texto and not prazo:
        return []
    
    query = '''
        SELECT *
        FROM tarefas_semana
        WHERE 1=1
    '''

    params = []

    # 3. Busca por título
    if texto:
        query += '''
            AND titulo LIKE ?
        '''
        params.append(f'%{texto}%')

    # 4. Filtro opcional por prazo
    if prazo:
        query += '''
            AND prazo = ?
        '''
        params.append(prazo)

    query += '''
        ORDER BY
            concluida,
            prazo,
            id
    '''

    rows = conn.execute(query, params).fetchall()

    return [dict(r) for r in rows]

@app.route('/')
def index():
    return render_template('index.html')    

# EVENTOS
# Listar eventos
@app.route('/api/eventos', methods=['GET'])
def listar_eventos():
    inicio  = request.args.get('inicio')
    fim     = request.args.get('fim')
    conn    = get_db()
    if inicio and fim:
        rows = conn.execute(
            'SELECT * FROM eventos WHERE data >= ? AND data <= ? ORDER BY data, hora_inicio',
            (inicio, fim)
        ).fetchall()
    else:
        rows = conn.execute(
            'SELECT * FROM eventos ORDER BY data, hora_inicio'
        ).fetchall()
    return jsonify([dict(r) for r in rows])

# Criar novo evento
@app.route('/api/eventos', methods=['POST'])
def criar_eventos():
    d = request.json
    if not d or not d.get('titulo') or not d.get('data'):
        return jsonify({'erro': 'Título e data são obrigatórios'}), 400
    conn = get_db()

    if d.get('hora_inicio') and d.get('hora_fim'):
        if d['hora_fim'] <= d['hora_inicio']:
            return jsonify({
                'erro': 'O horário de término deve ser depois do horário de início.'
            }), 400

        conflitos = existe_conflito_evento(
            conn, d['data'], d['hora_inicio'], d['hora_fim']
        )
        if conflitos:
            return jsonify({
                'erro': 'Conflito de horário com outro evento.',
                'conflitos': conflitos
            }), 409

    cur = conn.execute(
        '''
        INSERT INTO eventos
        (titulo, descricao, data, hora_inicio, hora_fim, tipo, cor, prioridade)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''',
        (
            d['titulo'],
            d.get('descricao', ''),
            d['data'],
            d.get('hora_inicio'),
            d.get('hora_fim'),
            d.get('tipo', 'evento'),
            d.get('cor', '#4F8EF7'),
            d.get('prioridade', 'media')
        )
    )
    conn.commit()
    return jsonify({'id': cur.lastrowid}), 201

# Editar evento existente
@app.route('/api/eventos/<int:eid>', methods=['PUT'])
def editar_evento(eid):
    d = request.json
    if not d or not d.get('titulo') or not d.get('data'):
        return jsonify({'erro': 'Título e data são obrigatórios'}), 400
        
    conn = get_db()

    if d.get('hora_inicio') and d.get('hora_fim'):
        if d['hora_fim'] <= d['hora_inicio']:
            return jsonify({
                'erro': 'O horário de término deve ser depois do horário de início.'
            }), 400

        conflitos = existe_conflito_evento(
            conn, d['data'], d['hora_inicio'], d['hora_fim'],
            ignorar_id=eid
        )
        if conflitos:
            return jsonify({
                'erro': 'Conflito de horário com outro evento.',
                'conflitos': conflitos
            }), 409

    conn.execute(
        '''
        UPDATE eventos
        
        SET titulo=?,
            descricao=?,
            data=?,
            hora_inicio=?,
            hora_fim=?,
            tipo=?,
            cor=?,
            prioridade=?
        WHERE id=?
        ''',
        (
            d['titulo'],
            d.get('descricao', ''),
            d['data'],
            d.get('hora_inicio'),
            d.get('hora_fim'),
            d.get('tipo', 'evento'),
            d.get('cor', '#4F8EF7'),
            d.get('prioridade', 'media'),
            eid
        )
    )
    conn.commit()
    return jsonify({'ok': True})

# Deletar evento
@app.route('/api/eventos/<int:eid>', methods=['DELETE'])
def deletar_evento(eid):
    conn = get_db()
    conn.execute('DELETE FROM eventos WHERE id=?', (eid,))
    conn.commit()
    return jsonify({'ok': True})

# TAREFAS DA SEMANA
@app.route('/api/tarefas_semana', methods=['GET'])
def listar_tarefas_semana():
    conn = get_db()
    rows = conn.execute(
        'SELECT * FROM tarefas_semana ORDER BY concluida, ordem, id'
    ).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/tarefas_semana', methods=['POST'])
def criar_tarefa_semana():
    d = request.json
    if not d or not d.get('titulo'):
        return jsonify({'erro': 'Título é obrigatório'}), 400
    conn = get_db()
    cur = conn.execute(
        '''
        INSERT INTO tarefas_semana
        (titulo, prazo, prioridade)
        VALUES (?, ?, ?)
        ''',
        (
            d['titulo'],
            d.get('prazo'),
            d.get('prioridade', 'media')
        )
    )
    conn.commit()
    return jsonify({'id': cur.lastrowid}), 201

@app.route('/api/tarefas_semana/reordenar', methods=['POST'])
def reordenar_tarefas():
    # Recebe lista de ids na nova ordem: [3, 1, 5, 2]
    ids = request.json.get('ids', [])
    conn = get_db()
    for posicao, tid in enumerate(ids):
        conn.execute('UPDATE tarefas_semana SET ordem=? WHERE id=?', (posicao, tid))
    conn.commit()
    return jsonify({'ok': True})

@app.route('/api/tarefas_semana/<int:tid>', methods=['PUT'])
def editar_tarefa_semana(tid):
    d = request.json
    conn = get_db()
    conn.execute(
        '''
        UPDATE tarefas_semana
        SET titulo=?,
            prazo=?,
            concluida=?,
            prioridade=?
        WHERE id=?
        ''',
        (
            d['titulo'],
            d.get('prazo'),
            d.get('concluida', 0),
            d.get('prioridade', 'media'),
            tid
        )
    )
    conn.commit()
    return jsonify({'ok': True})

@app.route('/api/tarefas_semana/<int:tid>', methods=['DELETE'])
def deletar_tarefa_semana(tid):
    conn = get_db()
    conn.execute('DELETE FROM tarefas_semana WHERE id=?', (tid,))
    conn.commit()
    return jsonify({'ok': True})

# RESUMO DO DIA / SEMANA (botões da interface)
# Reaproveita as mesmas funções de geração de imagem e envio de
# e-mail usadas pelo backup_resumo.py, agora em utilitarios.py.

def buscar_dados_dia(data_str):
    conn = get_db()
    eventos = conn.execute(
        '''
        SELECT titulo, descricao, data, hora_inicio, hora_fim
        FROM eventos
        WHERE data = ?
        ORDER BY hora_inicio
        ''',
        (data_str,)
    ).fetchall()
    tarefas = conn.execute(
        '''
        SELECT titulo, prazo
        FROM tarefas_semana
        WHERE concluida = 0
        ORDER BY prazo, id
        '''
    ).fetchall()
    return [dict(e) for e in eventos], [dict(t) for t in tarefas]


def buscar_dados_semana():
    conn = get_db()
    hoje = datetime.now()
    inicio = hoje - timedelta(days=hoje.weekday())
    fim = inicio + timedelta(days=6)

    eventos = conn.execute(
        '''
        SELECT titulo, descricao, data, hora_inicio, hora_fim
        FROM eventos
        WHERE data >= ? AND data <= ?
        ORDER BY data, hora_inicio
        ''',
        (inicio.strftime('%Y-%m-%d'), fim.strftime('%Y-%m-%d'))
    ).fetchall()
    tarefas = conn.execute(
        '''
        SELECT titulo, prazo
        FROM tarefas_semana
        WHERE concluida = 0
        ORDER BY prazo, id
        '''
    ).fetchall()
    return [dict(e) for e in eventos], [dict(t) for t in tarefas], inicio, fim


@app.route('/api/resumo/dia/imagem', methods=['GET'])
def resumo_dia_imagem():
    hoje = datetime.now().strftime('%Y-%m-%d')
    eventos, tarefas = buscar_dados_dia(hoje)

    caminho = PASTA_RESUMOS / 'resumo_dia_atual.png'
    gerar_imagem_resumo(
        'Resumo Walter',
        f'Agenda de hoje ({hoje})',
        eventos, tarefas, caminho
    )

    baixar = request.args.get('baixar') == '1'
    return send_file(
        caminho,
        mimetype='image/png',
        as_attachment=baixar,
        download_name=f'resumo_dia_{hoje}.png'
    )


@app.route('/api/resumo/semana/imagem', methods=['GET'])
def resumo_semana_imagem():
    eventos, tarefas, inicio, fim = buscar_dados_semana()

    caminho = PASTA_RESUMOS / 'resumo_semana_atual.png'
    gerar_imagem_resumo(
        'Resumo Walter',
        f'Semana de {inicio.strftime("%d/%m")} a {fim.strftime("%d/%m")}',
        eventos, tarefas, caminho,
        agrupar_por_dia=True
    )

    baixar = request.args.get('baixar') == '1'
    return send_file(
        caminho,
        mimetype='image/png',
        as_attachment=baixar,
        download_name=f'resumo_semana_{inicio.strftime("%Y-%m-%d")}.png'
    )


@app.route('/api/resumo/dia/email', methods=['POST'])
def resumo_dia_email():
    hoje = datetime.now().strftime('%Y-%m-%d')
    eventos, tarefas = buscar_dados_dia(hoje)

    caminho = PASTA_RESUMOS / 'resumo_dia_atual.png'
    gerar_imagem_resumo(
        'Resumo Walter',
        f'Agenda de hoje ({hoje})',
        eventos, tarefas, caminho
    )

    try:
        enviar_email_com_anexo(
            EMAIL_REMETENTE, EMAIL_SENHA_APP, EMAIL_DESTINO,
            'Resumo Walter - Agenda de hoje',
            f'Segue o resumo da sua agenda de hoje.\n\n'
            f'Eventos: {len(eventos)}\nTarefas pendentes: {len(tarefas)}',
            caminho
        )
    except Exception as e:
        return jsonify({'erro': f'Falha ao enviar e-mail: {e}'}), 502

    return jsonify({'ok': True})


@app.route('/api/resumo/semana/email', methods=['POST'])
def resumo_semana_email():
    eventos, tarefas, inicio, fim = buscar_dados_semana()

    caminho = PASTA_RESUMOS / 'resumo_semana_atual.png'
    gerar_imagem_resumo(
        'Resumo Walter',
        f'Semana de {inicio.strftime("%d/%m")} a {fim.strftime("%d/%m")}',
        eventos, tarefas, caminho,
        agrupar_por_dia=True
    )

    try:
        enviar_email_com_anexo(
            EMAIL_REMETENTE, EMAIL_SENHA_APP, EMAIL_DESTINO,
            'Resumo Walter - Agenda da semana',
            f'Segue o resumo da sua agenda desta semana.\n\n'
            f'Eventos: {len(eventos)}\nTarefas pendentes: {len(tarefas)}',
            caminho
        )
    except Exception as e:
        return jsonify({'erro': f'Falha ao enviar e-mail: {e}'}), 502

    return jsonify({'ok': True})

@app.route('/api/backup/baixar', methods=['GET'])
def baixar_backup_banco():
    agora = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
    nome_backup = f'backup_agenda_{agora}.db'

    return send_file(
        DB_PATH,
        mimetype='application/octet-stream',
        as_attachment=True,
        download_name=nome_backup
    )

@app.errorhandler(404)
def nao_encontrado(e):
    return jsonify({'erro': 'Recurso não encontrado'}), 404

@app.errorhandler(500)
def erro_interno(e):
    return jsonify({'erro': 'Erro interno no servidor'}), 500

if __name__ == '__main__':
    init_db()
    debug = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(host='127.0.0.1', debug=debug, port=5000)