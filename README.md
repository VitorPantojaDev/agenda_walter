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

1. `python -m venv venv`
2. Renomear o arquivo .env.example para .env
3. Colocar as respectivas credenciais no arquivo .env
4. `source venv/bin/activate` (ou `venv\Scripts\activate` no Windows)
5. `pip install -r requirements.txt`
6. `python app.py`
7. Acessar `http://localhost:5000`