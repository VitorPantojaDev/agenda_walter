let visaoAtual = 'semana'; // 'dia' | 'semana' | 'mes'
let dataAtual = new Date(); // data sendo visualizada
let eventoEditandoId = null;
let tarefaEditandoId = null;

// Alterna entre visões ao clicar nos botões
document.querySelectorAll('.btn-visao').forEach(btn => {
    btn.addEventListener('click', () => {
        visaoAtual = btn.dataset.visao;
        renderizarCalendario();
    })
})

// Função utilitária para chamadas de API com tratamento de erro
async function apiFetch(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        // Tenta ler o corpo JSON mesmo quando a resposta não é OK,
        // porque o backend costuma mandar uma mensagem específica em
        // { erro: '...' } (ex: "Conflito de horário com outro evento").
        const corpo = await response.json().catch(() => null);

        if (!response.ok) {
            const mensagem = corpo?.erro || `Erro na requisição: ${response.statusText}`;
            throw new Error(mensagem);
        }

        return corpo;
    } catch (error) {
        console.error("Erro na API:", error);
        alert(error.message || "Ocorreu um erro ao comunicar com o servidor.");
    }
}

function atualizarLabelData() {
    const label = document.getElementById('label-data');
    if (!label) return;

    const opcoes = { day: 'numeric', month: 'long', year: 'numeric' };
    if (visaoAtual === 'mes') {
        let str = dataAtual.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        label.textContent = str.charAt(0).toUpperCase() + str.slice(1);
    } else if (visaoAtual === 'semana') {
        const inicio = inicioSemana(dataAtual);
        const fim = new Date(inicio);
        fim.setDate(fim.getDate() + 6);
        label.textContent = `${inicio.toLocaleDateString('pt-BR', {day:'numeric', month:'short'})} - ${fim.toLocaleDateString('pt-BR', {day:'numeric', month:'short'})}`;
    } else {
        label.textContent = dataAtual.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    }
}

async function renderizarCalendario() {
    const container = document.getElementById('calendario');
    if (!container) return;
    container.innerHTML = ''; 
    atualizarLabelData();

    if (visaoAtual === 'dia') await renderDia(container, dataAtual);
    else if (visaoAtual === 'semana') await renderSemana(container, dataAtual);
    else if (visaoAtual === 'mes') await renderMes(container, dataAtual);
    
    renderizarPainel(); // atualiza o painel lateral (tarefas)
}

async function renderMes(container, dataRef) {
    const ano = dataRef.getFullYear()
    const mes = dataRef.getMonth()
    const totalDias = new Date(ano, mes + 1, 0).getDate()
    const diaSemanaInicio = (new Date(ano, mes, 1).getDay() + 6) % 7 // Ajusta para segunda-feira ser o primeiro dia (0)

    // Busca eventos do mês na API
    const inicio = formatarData(ano, mes, 1)
    const fim    = formatarData(ano, mes, totalDias)
    const eventos = await buscarEventos(inicio, fim) || []

    // Grade 7 colunas
    const grade = document.createElement('div')
    grade.style.display = 'grid'
    grade.style.gridTemplateColumns = 'repeat(7, 1fr)'
    container.appendChild(grade)

    // Cabeçalho dias da semana
    const diasSemana = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
    diasSemana.forEach(d => {
        const cabecalho = document.createElement('div')
        cabecalho.textContent = d
        cabecalho.className = 'calendario-cabecalho-dia'
        grade.appendChild(cabecalho)
    })

    // Células vazias antes do dia 1
    for (let i = 0; i < diaSemanaInicio; i++) {
        grade.appendChild(document.createElement('div'))
    }

    // Células dos dias
    for (let dia = 1; dia <= totalDias; dia++) {
        const celula = document.createElement('div')
        celula.textContent = dia
        celula.style.border     = '1px solid var(--borda)'
        celula.style.padding    = '8px'
        celula.style.minHeight  = '120px'
        celula.style.cursor     = 'pointer'
        celula.classList.add('celula-dia')
        

        // Destaca hoje
        const dataHoje = new Date()
        if (dia === dataHoje.getDate() &&
            mes === dataHoje.getMonth() &&
            ano === dataHoje.getFullYear()) {
            celula.classList.add('celula-hoje')
            celula.style.fontWeight = 'bold'
        }

        // Exibe eventos do dia
        const dataStr = formatarData(ano, mes, dia)
        const eventosDoDia = eventos.filter(e => e.data === dataStr)
        eventosDoDia.forEach(ev => {
            const tag = document.createElement('div')
            tag.textContent = ev.hora_inicio ? `${ev.hora_inicio} ${ev.titulo}` : `🗓 ${ev.titulo}`
            tag.style.background   = ev.cor || '#4F8EF7'
            tag.className = 'tag-evento-calendario'

            // Clique no evento: confirma e exclui
            tag.addEventListener('click', (e) => {
                e.stopPropagation()
                abrirModalEdicao(ev)   // abre modal preenchido para editar
            })

            celula.appendChild(tag)
        })

        celula.addEventListener('click', () => {
             navegarParaDia(ano, mes, dia)
        })

        grade.appendChild(celula)
    }
}

function formatarData(ano, mes, dia) {
    // mes+1 porque no JS janeiro=0, mas a API espera 01 para janeiro
    const m = String(mes + 1).padStart(2, '0') // garante 2 digitos: 6 > "06"
    const d = String(dia).padStart(2, '0')
    return `${ano}-${m}-${d}`
}

document.getElementById('btn-anterior').addEventListener('click', () => {
    if (visaoAtual === 'mes') {
        dataAtual.setMonth(dataAtual.getMonth() - 1)
    } else if (visaoAtual === 'semana') {
        dataAtual.setDate(dataAtual.getDate() - 7)
    } else if (visaoAtual === 'dia') {
        dataAtual.setDate(dataAtual.getDate() - 1)
    }
    renderizarCalendario()
})

document.getElementById('btn-proximo').addEventListener('click', () => {
    if (visaoAtual === 'mes') {
        dataAtual.setMonth(dataAtual.getMonth() + 1)
    } else if (visaoAtual === 'semana') {
        dataAtual.setDate(dataAtual.getDate() + 7)
    } else if (visaoAtual === 'dia') {
        dataAtual.setDate(dataAtual.getDate() + 1)
    }
    renderizarCalendario()
})

async function buscarEventos(inicio, fim) {
    const url = `/api/eventos?inicio=${inicio}&fim=${fim}`
    return await apiFetch(url);
}

async function salvarEvento(dados) {
    return await apiFetch('/api/eventos', {
        method: 'POST',
        body: JSON.stringify(dados)
    });
}

document.getElementById('btn-excluir').addEventListener('click', async () => {
    const modo = document.getElementById('modal').dataset.modo;
    if (!confirm("Tem certeza que deseja excluir?")) return;

    if (modo === 'tarefa' && tarefaEditandoId) {
        fecharModal();
        await apiFetch(`/api/tarefas_semana/${tarefaEditandoId}`, { method: 'DELETE' });
        renderizarPainel();
    } else if (eventoEditandoId) {
        fecharModal();
        await apiFetch(`/api/eventos/${eventoEditandoId}`, { method: "DELETE" });
        await renderizarCalendario();
    }
});

document.getElementById('btn-salvar').addEventListener('click', async () => {
    const titulo = document.getElementById('campo-titulo').value.trim()
    const data   = document.getElementById('campo-data').value
    const modo   = document.getElementById('modal').dataset.modo

    if (!titulo) { alert('O título é obrigatório!'); return }

    if (modo === 'tarefa') {
        if (tarefaEditandoId) {
            // Edita tarefa existente
            fecharModal();
            await apiFetch(`/api/tarefas_semana/${tarefaEditandoId}`, {
                method:  'PUT',
                body:    JSON.stringify({ titulo, prazo: data, concluida: 0 })
            })
            tarefaEditandoId = null
        } else {
            // Cria nova tarefa
            fecharModal();
            await apiFetch('/api/tarefas_semana', {
                method:  'POST',
                body:    JSON.stringify({ titulo, prazo: data })
            })
        }
        document.getElementById('modal').dataset.modo = ''
        renderizarPainel()
        return
    }

    // Fluxo normal de evento
    if (!data) { alert('A data é obrigatória!'); return }
    fecharModal();

    const dados = {
        titulo,
        data,
        hora_inicio: document.getElementById('campo-hora-inicio').value,
        hora_fim:    document.getElementById('campo-hora-fim').value,
        descricao:   document.getElementById('campo-descricao').value,
        cor:         document.getElementById('campo-cor').value,
    }
    const repetir    = document.getElementById('campo-repetir').checked
    const dataFim    = document.getElementById('campo-data-fim').value
    const frequencia = document.getElementById('campo-frequencia').value
    if (eventoEditandoId) {
        await apiFetch(`/api/eventos/${eventoEditandoId}`, {
            method: 'PUT', body: JSON.stringify(dados)
        })
    } else if (repetir && dataFim) {
        if (dataFim < data) {
            alert('A data final deve ser posterior à data de início!')
            return
        }
        const datas = gerarDatasRepetidas(data, dataFim, frequencia)
        if (datas.length > 365) {
            alert('Muitas repetições! Limite de 365 ocorrências.')
            return
        }
        await Promise.all(datas.map(d => salvarEvento({...dados, data: d})))
        alert(`${datas.length} evento(s) criado(s) com sucesso!`)
    } else {
        await salvarEvento(dados)
    }
    eventoEditandoId = null
    await renderizarCalendario()
})

function inicioSemana(dataRef) {
    const d = new Date(dataRef);
    const dia = d.getDay();           // 0=dom, 1=seg ...
    const diff = (dia === 0) ? -6 : 1 - dia; // ajusta para segunda-feira
    d.setDate(d.getDate() + diff);
    return d;
}

// Fecha o modal
function fecharModal() {
    document.getElementById('modal').style.display = 'none';
}

// Vincula o botão Cancelar
document.getElementById('btn-fechar').addEventListener('click', fecharModal);

document.getElementById('campo-dia-inteiro').addEventListener('change', function() {
    const mostrar = !this.checked
    document.getElementById('campo-hora-inicio').style.display = mostrar ? 'block' : 'none'
    document.getElementById('campo-hora-fim').style.display    = mostrar ? 'block' : 'none'
    if (!mostrar) {
        document.getElementById('campo-hora-inicio').value = ''
        document.getElementById('campo-hora-fim').value    = ''
    }
})

document.getElementById('campo-repetir').addEventListener('change', function() {
    document.getElementById('campos-repeticao').style.display = this.checked ? 'block' : 'none'
})

async function renderDia(container, dataRef) {
    const ano = dataRef.getFullYear()
    const mes = dataRef.getMonth()
    const dia = dataRef.getDate()
    const dataStr = formatarData(ano, mes, dia)
    const todos = await buscarEventos(dataStr, dataStr) || []

    // Botão voltar
    const btnVoltar = document.createElement('button')
    btnVoltar.textContent = '← Voltar'
    btnVoltar.className = 'btn-voltar'
    
    btnVoltar.addEventListener('click', () => {
        visaoAtual = 'semana'
        document.querySelectorAll('.btn-visao').forEach(b => {
            b.classList.toggle('ativo', b.dataset.visao === 'semana')
        })
        renderizarCalendario()
    })
    container.appendChild(btnVoltar)

    // Mensagem se não tiver eventos
    if (todos.length === 0) {
        const vazio = document.createElement('p')
        vazio.textContent = 'Nenhum evento neste dia.'
        vazio.style.color = '#9CA3AF'
        container.appendChild(vazio)
    }

    // Cards dos eventos
    todos.forEach(ev => {
        const card = document.createElement('div')
        card.style.borderLeft = `4px solid ${ev.cor || '#4F8EF7'}`
        card.className = 'card-evento-dia'
        
        const titulo = document.createElement('div')
        titulo.style.fontWeight = 'bold'
        titulo.style.fontSize = '20px'
        titulo.textContent = ev.titulo

        const detalhes = document.createElement('div')
        detalhes.style.color = '#6B7280'
        detalhes.style.fontSize = '17px'
        detalhes.style.marginTop = '4px'

        const infoHorario = ev.hora_inicio
            ? `${ev.hora_inicio}${ev.hora_fim ? ' – ' + ev.hora_fim : ''}`
            : ''

        detalhes.textContent = infoHorario

        if (ev.descricao) {
            const descricao = document.createElement('div')
            descricao.textContent = ev.descricao
            detalhes.appendChild(descricao)
        }

        const acoes = document.createElement('div')
        acoes.className = 'card-acoes'

        const btnEditar = document.createElement('button')
        btnEditar.className = 'btn-editar-evento'
        btnEditar.title = 'Editar evento'
        btnEditar.textContent = '✏️'
        btnEditar.style.cssText = 'background:none;border:none;color:var(--verde-floresta);font-size:20px;cursor:pointer;padding:0 4px'

        const btnExcluir = document.createElement('button')
        btnExcluir.className = 'btn-excluir-evento'
        btnExcluir.title = 'Excluir evento'
        btnExcluir.textContent = '×'
        btnExcluir.style.cssText = 'background:none;border:none;color:#9CA3AF;font-size:30px;cursor:pointer;padding:0 4px'

        acoes.appendChild(btnEditar)
        acoes.appendChild(btnExcluir)

        card.appendChild(titulo)
        card.appendChild(detalhes)
        card.appendChild(acoes)

        // Event listeners em vez de onclick inline para evitar problemas de escape de JSON
        btnEditar.addEventListener('click', () => abrirModalEdicao(ev))

        btnExcluir.addEventListener('click', async () => {
            if (confirm("Excluir?")) {
                await apiFetch(`/api/eventos/${ev.id}`, { method: "DELETE" })
                renderizarCalendario()
            }
        })

        container.appendChild(card)
    })

    // Botão novo evento — SEMPRE visível
    const btnNovo = document.createElement('button')
    btnNovo.textContent = '+ Novo evento neste dia'
    btnNovo.className = 'btn-novo-evento-dia'
    btnNovo.addEventListener('click', () => abrirModalNovo(dataStr))
    container.appendChild(btnNovo)
}

async function renderSemana(container, dataRef) {
    // Encontra a segunda-feira da semana
    const inicio = inicioSemana(dataRef)

    // Busca eventos da semana toda
    const fim = new Date(inicio);
    fim.setDate(fim.getDate() + 6);
    const inicioStr = formatarData(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
    const fimStr = formatarData(fim.getFullYear(), fim.getMonth(), fim.getDate());
    const eventos = await buscarEventos(inicioStr, fimStr) || [];

    const grade = document.createElement('div')
    grade.style.display             = 'grid'
    grade.style.gridTemplateColumns = 'repeat(7, 1fr)'
    grade.style.gap                 = '8px'
    container.appendChild(grade)

    const diasNomes = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

    for (let i = 0; i < 7; i++) {
        const diaAtual = new Date(inicio)
        diaAtual.setDate(diaAtual.getDate() + i)

        const dataStr   = formatarData(diaAtual.getFullYear(), diaAtual.getMonth(), diaAtual.getDate())
        const ehHoje    = dataStr === formatarData(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())

        const coluna = document.createElement('div')
        coluna.style.border      = ehHoje ? '2px solid var(--verde-floresta)' : '1px solid var(--borda)'
        coluna.style.borderRadius= '8px'
        coluna.style.padding     = '8px'
        coluna.style.minHeight   = '450px'
        coluna.style.background  = ehHoje ? 'var(--destaque)' : 'rgba(255, 255, 255, 0.6)'
        coluna.style.cursor      = 'pointer'
        coluna.classList.add('celula-dia')

        const cabecalho = document.createElement('div')
        cabecalho.style.fontWeight  = 'bold'
        cabecalho.style.marginBottom= '6px'
        cabecalho.style.color       = ehHoje ? 'var(--verde-floresta)' : 'var(--verde)'
        cabecalho.style.fontSize    = '18px'
        cabecalho.textContent       = `${diasNomes[i]} ${diaAtual.getDate()}`
        coluna.appendChild(cabecalho)

        // Eventos do dia
        const eventosDoDia = eventos.filter(e => e.data === dataStr)
        eventosDoDia.forEach(ev => {
            const tag = document.createElement('div')
            tag.textContent = ev.hora_inicio ? `${ev.hora_inicio} ${ev.titulo}` : `🗓 ${ev.titulo}`
            tag.style.background   = ev.cor || 'var(--verde-floresta)'
            tag.style.color        = 'white'
            tag.style.borderRadius = '4px'
            tag.style.padding      = '3px 6px'
            tag.style.fontSize     = '14px'
            tag.style.marginBottom = '4px'
            tag.style.cursor       = 'pointer'
            tag.style.overflow     = 'hidden'
            tag.style.whiteSpace   = 'nowrap'
            tag.style.textOverflow = 'ellipsis'

            tag.addEventListener('click', (e) => {
                e.stopPropagation()
                abrirModalEdicao(ev)   // abre modal preenchido para editar
            })
            coluna.appendChild(tag)
        })

        // Clique na coluna abre modal
        coluna.addEventListener('click', () => {
            navegarParaDia(diaAtual.getFullYear(), diaAtual.getMonth(), diaAtual.getDate())
        })
        grade.appendChild(coluna)
    }
}

function abrirModalEdicao(ev) {
    eventoEditandoId = ev.id
    document.getElementById('modal-titulo').textContent         = 'Editar Evento'
    document.getElementById('campo-titulo').value               = ev.titulo
    document.getElementById('campo-data').value                 = ev.data
    document.getElementById('campo-hora-inicio').value          = ev.hora_inicio || ''
    document.getElementById('campo-hora-fim').value             = ev.hora_fim    || ''
    document.getElementById('campo-descricao').value            = ev.descricao   || ''
    document.getElementById('campo-cor').value                  = ev.cor         || '#4A7C59'
    document.getElementById('modal').style.display              = 'flex'
    const diaInteiro = !ev.hora_inicio
    document.getElementById('campo-dia-inteiro').checked        = diaInteiro
    document.getElementById('campo-hora-inicio').style.display  = diaInteiro ? 'none' : 'block'
    document.getElementById('campo-hora-fim').style.display     = diaInteiro ? 'none' : 'block'
    document.getElementById('modal').dataset.modo               = 'evento'
    document.getElementById('btn-excluir').style.display        = 'block'
}

function abrirModalNovo(dataStr) {
    eventoEditandoId = null   // ← garante que não está editando
    document.getElementById('modal-titulo').textContent = 'Novo Evento'
    document.getElementById('campo-titulo').value       = ''
    document.getElementById('campo-data').value         = dataStr
    document.getElementById('campo-hora-inicio').value  = ''
    document.getElementById('campo-hora-fim').value     = ''
    document.getElementById('campo-descricao').value    = ''
    document.getElementById('campo-cor').value          = '#4A7C59'
    document.getElementById('modal').style.display      = 'flex'
    document.getElementById('campo-dia-inteiro').checked          = false
    document.getElementById('campo-hora-inicio').style.display    = 'block'
    document.getElementById('campo-hora-fim').style.display       = 'block'
    document.getElementById('modal').dataset.modo               = 'evento'
    document.getElementById('btn-excluir').style.display        = 'none'
}

function abrirModalEdicaoTarefa(t) {
    tarefaEditandoId = t.id
    document.getElementById('modal-titulo').textContent         = '📋 Editar Tarefa'
    document.getElementById('campo-titulo').value               = t.titulo
    document.getElementById('campo-data').value                 = t.prazo || ''
    document.getElementById('campo-hora-inicio').value          = ''
    document.getElementById('campo-hora-fim').value             = ''
    document.getElementById('campo-descricao').value            = ''
    document.getElementById('campo-cor').value                  = '#4A7C59'
    document.getElementById('campo-dia-inteiro').checked        = false
    document.getElementById('campo-hora-inicio').style.display  = 'none'
    document.getElementById('campo-hora-fim').style.display     = 'none'
    document.getElementById('campo-repetir').checked            = false
    document.getElementById('campos-repeticao').style.display   = 'none'
    document.getElementById('modal').dataset.modo               = 'tarefa'
    document.getElementById('modal').style.display              = 'flex'
    document.getElementById('btn-excluir').style.display        = 'block'
}

function navegarParaDia(ano, mes, dia) {
    dataAtual = new Date(ano, mes, dia) // atualiza data global
    visaoAtual = 'dia' // muda visão para dia
    document.querySelectorAll('.btn-visao').forEach(b => {
        b.classList.toggle('ativo', b.dataset.visao === 'dia')
    })
    renderizarCalendario()
}

// ── PAINEL DE TAREFAS ─────────────────────────────

async function renderizarPainel() {
    await limparTarefasConcluidasVencidas()
    const painel = document.getElementById('painel-lateral')
    painel.innerHTML = ''

    const h = document.createElement('h3')
    h.textContent = '✅ Tarefas da semana'
    painel.appendChild(h)
        
    const tarefas = await apiFetch('/api/tarefas_semana') || []

    if (tarefas.length === 0) {
        const vazio = document.createElement('p')
        vazio.textContent = 'Nenhuma tarefa esta semana.'
        vazio.style.cssText = 'color:#9CA3AF;font-size:16px'
        painel.appendChild(vazio)
    }

    const lista = document.createElement('div')
    lista.id = 'lista-tarefas'
    painel.appendChild(lista)

    tarefas.forEach(t => {
        const item = document.createElement('div')
        item.className      = 'tarefa-item' + (t.concluida ? ' concluida' : '')
        item.dataset.id     = t.id
        item.draggable      = true

        // Handle de arrastar
        const handle = document.createElement('span')
        handle.textContent  = '⠿'
        handle.style.cssText = 'color:#9CA3AF;cursor:grab;font-size:22px;padding:0 6px 0 0;user-select:none'
        handle.title        = 'Arraste para reordenar'

        const check = document.createElement('input')
        check.type    = 'checkbox'
        check.checked = !!t.concluida
        check.addEventListener('change', async () => {
            await apiFetch(`/api/tarefas_semana/${t.id}`, {
                method:  'PUT',
                body:    JSON.stringify({...t, concluida: check.checked ? 1 : 0})
            })
            renderizarPainel()
        })

        const texto = document.createElement('div')
        texto.style.flex = '1'
        texto.innerHTML = `
            <div style="font-size:17px">${t.titulo}</div>
            ${t.prazo ? `<div class="tarefa-prazo">⏰ até ${formatarDataBR(t.prazo)}</div>` : ''}
        `

        const btnEdit = document.createElement('button')
        btnEdit.textContent = '✏️'
        btnEdit.title       = 'Editar tarefa'
        btnEdit.style.cssText = 'background:none;border:none;color:var(--verde-floresta);font-size:20px;cursor:pointer;padding:0 4px'
        btnEdit.addEventListener('click', (e) => {
            e.stopPropagation()
            abrirModalEdicaoTarefa(t)
        })

        const btnDel = document.createElement('button')
        btnDel.textContent = '×'
        btnDel.title       = 'Excluir tarefa'
        btnDel.style.cssText = 'background:none;border:none;color:#9CA3AF;font-size:30px;cursor:pointer;padding:0 4px'
        btnDel.addEventListener('click', async () => {
            if (confirm(`Excluir "${t.titulo}"?`)) {
                await apiFetch(`/api/tarefas_semana/${t.id}`, { method: 'DELETE' })
                renderizarPainel()
            }
        })

        item.appendChild(handle)
        item.appendChild(check)
        item.appendChild(texto)
        item.appendChild(btnEdit)
        item.appendChild(btnDel)
        lista.appendChild(item)
    })

    // Drag-and-drop
    ativarDragDrop(lista)

    const btn = document.createElement('button')
    btn.id          = 'btn-nova-tarefa'
    btn.textContent = '+ Nova tarefa'
    btn.addEventListener('click', abrirModalTarefa)
    painel.appendChild(btn)
    
}

// ── RESUMOS (dia / semana) ────────────────────────
// Gera e disponibiliza para download, ou envia por e-mail, uma
// imagem com o resumo dos eventos e tarefas do dia atual ou da
// semana atual. Reaproveita a mesma geração de imagem usada pelo
// backup_resumo.py (via utilitarios.py, no backend).

function renderizarSecaoResumos(painel) {
    const secao = document.createElement('div')
    secao.className = 'secao-resumos'

    const titulo = document.createElement('h3')
    titulo.textContent = '📤 Resumos'
    secao.appendChild(titulo)

    secao.appendChild(criarBotaoResumo('Baixar resumo do dia', baixarResumoDia))
    secao.appendChild(criarBotaoResumo('Enviar resumo do dia por e-mail', enviarResumoDiaEmail))
    secao.appendChild(criarBotaoResumo('Baixar resumo da semana', baixarResumoSemana))
    secao.appendChild(criarBotaoResumo('Enviar resumo da semana por e-mail', enviarResumoSemanaEmail))

    painel.appendChild(secao)
}

function criarBotaoResumo(texto, aoClicar) {
    const btn = document.createElement('button')
    btn.className = 'btn-resumo'
    btn.textContent = texto
    btn.addEventListener('click', aoClicar)
    return btn
}

function baixarResumoDia() {
    window.location.href = '/api/resumo/dia/imagem?baixar=1'
}

function baixarResumoSemana() {
    window.location.href = '/api/resumo/semana/imagem?baixar=1'
}

async function enviarResumoDiaEmail() {
    const resultado = await apiFetch('/api/resumo/dia/email', { method: 'POST' })
    if (resultado && resultado.ok) {
        alert('Resumo do dia enviado por e-mail.')
    }
}

async function enviarResumoSemanaEmail() {
    const resultado = await apiFetch('/api/resumo/semana/email', { method: 'POST' })
    if (resultado && resultado.ok) {
        alert('Resumo da semana enviado por e-mail.')
    }
}

function ativarDragDrop(lista) {
    let arrastando = null

    lista.querySelectorAll('.tarefa-item').forEach(item => {

        item.addEventListener('dragstart', () => {
            arrastando = item
            setTimeout(() => item.style.opacity = '0.4', 0)
        })

        item.addEventListener('dragend', async () => {
            item.style.opacity = '1'
            arrastando = null

            // Coleta a nova ordem e salva
            const ids = [...lista.querySelectorAll('.tarefa-item')]
                .map(el => parseInt(el.dataset.id))
            await apiFetch('/api/tarefas_semana/reordenar', {
                method:  'POST',
                body:    JSON.stringify({ ids })
            })
        })

        item.addEventListener('dragover', e => {
            e.preventDefault()
            if (!arrastando || arrastando === item) return
            const rect  = item.getBoundingClientRect()
            const meio  = rect.top + rect.height / 2
            if (e.clientY < meio) {
                lista.insertBefore(arrastando, item)
            } else {
                lista.insertBefore(arrastando, item.nextSibling)
            }
        })
    })
}

async function limparTarefasConcluidasVencidas() {
    const resp    = await fetch('/api/tarefas_semana')
    const tarefas = await resp.json()
    const hoje    = new Date()
    hoje.setHours(0, 0, 0, 0)

    const paraExcluir = tarefas.filter(t => {
        if (!t.concluida || !t.prazo) return false
        const prazo = new Date(t.prazo + 'T00:00:00')
        return prazo < hoje  // prazo passou e está concluída
    })

    await Promise.all(paraExcluir.map(t =>
        fetch(`/api/tarefas_semana/${t.id}`, { method: 'DELETE' })
    ))
}

function formatarDataBR(dataStr) {
    if (!dataStr) return ''
    const [ano, mes, dia] = dataStr.split('-')
    return `${dia}/${mes}/${ano}`
}

function gerarDatasRepetidas(dataInicio, dataFim, frequencia) {
    const datas = []
    const atual = new Date(dataInicio + 'T00:00:00')
    const fim   = new Date(dataFim    + 'T00:00:00')

    while (atual <= fim) {
        datas.push(formatarData(atual.getFullYear(), atual.getMonth(), atual.getDate()))
        if (frequencia === 'diario')        atual.setDate(atual.getDate() + 1)
        else if (frequencia === 'semanal')  atual.setDate(atual.getDate() + 7)
        else if (frequencia === 'mensal')   atual.setMonth(atual.getMonth() + 1)
    }
    return datas
}

// Modal de tarefa — reaproveita o modal existente
function abrirModalTarefa() {
    tarefaEditandoId = null
    eventoEditandoId = null
    document.getElementById('modal-titulo').textContent = '📋 Nova Tarefa'
    document.getElementById('campo-titulo').value       = ''
    document.getElementById('campo-data').value         = ''
    document.getElementById('campo-hora-inicio').value  = ''
    document.getElementById('campo-hora-fim').value     = ''
    document.getElementById('campo-descricao').value    = ''
    document.getElementById('campo-cor').value          = '#4A7C59'
    document.getElementById('modal').style.display      = 'flex'
    // Marca que é uma tarefa e não um evento
    document.getElementById('modal').dataset.modo = 'tarefa'
    document.getElementById('btn-excluir').style.display = 'none'
}

function renderizarSecaoPlanoDeFundo(painel) {

    const secao = document.createElement('div')
    secao.className = 'secao-resumos'

    const titulo = document.createElement('h3')
    titulo.textContent = '🖼️ Plano de Fundo'

    const btnEscolher = document.createElement('button')
    btnEscolher.className = 'btn-resumo'
    btnEscolher.textContent = 'Escolher imagem'

    const btnRemover = document.createElement('button')
    btnRemover.className = 'btn-resumo'
    btnRemover.textContent = 'Remover imagem'

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.style.display = 'none'

    btnEscolher.addEventListener('click', () => {
        input.click()
    })

    input.addEventListener('change', () => {
        const arquivo = input.files[0]

        if (!arquivo) return

        const leitor = new FileReader()

        leitor.onload = () => {

            const imagem = leitor.result

            localStorage.setItem(
                'walter_fundo',
                imagem
            )

            aplicarPlanoDeFundo(imagem)
        }

        leitor.readAsDataURL(arquivo)
    })

    btnRemover.addEventListener('click', () => {
        localStorage.removeItem('walter_fundo')

        document.body.style.backgroundImage = ''
    })

    secao.appendChild(titulo)
    secao.appendChild(btnEscolher)
    secao.appendChild(btnRemover)
    secao.appendChild(input)

    painel.appendChild(secao)
}

function aplicarPlanoDeFundo(imagem) {

    document.body.style.backgroundImage =
        `linear-gradient(
            rgba(250,249,246,.6),
            rgba(250,249,246,.6)
        ),
        url('${imagem}')`

    document.body.style.backgroundSize = '100% auto'
    document.body.style.backgroundPosition = 'center 160px'
    document.body.style.backgroundRepeat = 'no-repeat'
    document.body.style.backgroundAttachment = 'fixed'
}

const fundoSalvo =
    localStorage.getItem('walter_fundo')

if (fundoSalvo) {
    aplicarPlanoDeFundo(fundoSalvo)
}

function renderizarSecaoBackup(painel) {
    const secao = document.createElement('div')
    secao.className = 'secao-resumos'

    const titulo = document.createElement('h3')
    titulo.textContent = '💾 Backup'

    const btnBaixar = document.createElement('button')
    btnBaixar.className = 'btn-resumo'
    btnBaixar.textContent = 'Baixar backup do banco'

    btnBaixar.addEventListener('click', () => {
        window.location.href = '/api/backup/baixar'
    })

    secao.appendChild(titulo)
    secao.appendChild(btnBaixar)

    painel.appendChild(secao)
}

document.getElementById('btn-menu-resumos').addEventListener('click', () => {
    const escolha = prompt(
        'Escolha uma opção:\n\n' +
        '1 - Baixar resumo do dia\n' +
        '2 - Enviar resumo do dia por e-mail\n' +
        '3 - Baixar resumo da semana\n' +
        '4 - Enviar resumo da semana por e-mail'
    )

    if (escolha === '1') {
        baixarResumoDia()
    } else if (escolha === '2') {
        enviarResumoDiaEmail()
    } else if (escolha === '3') {
        baixarResumoSemana()
    } else if (escolha === '4') {
        enviarResumoSemanaEmail()
    }
})

document.getElementById('btn-menu-fundo').addEventListener('click', () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'

    input.addEventListener('change', () => {
        const arquivo = input.files[0]
        if (!arquivo) return

        const leitor = new FileReader()

        leitor.onload = () => {
            const imagem = leitor.result
            localStorage.setItem('walter_fundo', imagem)
            aplicarPlanoDeFundo(imagem)
        }

        leitor.readAsDataURL(arquivo)
    })

    input.click()
})

document.getElementById('btn-backup-header').addEventListener('click', () => {
    window.location.href = '/api/backup/baixar'
})

renderizarCalendario()