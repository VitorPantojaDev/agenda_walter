# Walter - Agenda Pessoal

Walter é um sistema de gerenciamento de tarefas e eventos com visualização por dia, semana e mês.

## Estrutura do Projeto
```text
walter/
├── app.py              # Backend Flask e API
├── agenda.db           # Banco de dados SQLite (gerado automaticamente)
├── static/
│   ├── css/style.css   # Estilização
│   ├── js/app.js       # Lógica do frontend
│   └── images/         # Recursos visuais
└── templates/
    └── index.html      # Estrutura HTML
```

## Tecnologias Utilizadas
- **Backend**: Python com Flask e SQLite.
- **Frontend**: JavaScript puro, HTML5 e CSS3.

## Como Executar
Detailed instructions in INSTALL.md (manual run):
1. `python -m venv venv`
2. `source venv/bin/activate` (ou `venv\Scripts\activate` no Windows)
3. `pip install -r requirements.txt`
4. `python app.py`