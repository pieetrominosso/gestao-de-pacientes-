// ============================================
// BANCO DE DADOS PERSISTENTE (IndexedDB)
// ============================================

const DB_NAME = "GestaoPacientesDB";
const DB_VERSION = 1;
let db;
let pacientesEmMemoria = []; 
let filtroAtual = 'todos';
let termoPesquisa = '';
let confirmCallback = null;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error("Erro ao abrir IndexedDB:", event.target.error);
            reject(event.target.error);
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            carregarTodosPacientes();
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains("pacientes")) {
                const objectStore = db.createObjectStore("pacientes", { keyPath: "id" });
                objectStore.createIndex("nome", "nome", { unique: false });
            }
        };
    });
}

// ============================================
// OPERAÇÕES DO BANCO (CRUD IndexedDB)
// ============================================

function salvarNoBanco(paciente) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(["pacientes"], "readwrite");
        const store = transaction.objectStore("pacientes");
        const request = store.put(paciente); 

        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

function excluirDoBanco(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(["pacientes"], "readwrite");
        const store = transaction.objectStore("pacientes");
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

function carregarTodosPacientes() {
    const transaction = db.transaction(["pacientes"], "readonly");
    const store = transaction.objectStore("pacientes");
    const request = store.getAll();

    request.onsuccess = (event) => {
        pacientesEmMemoria = event.target.result;
        atualizarLista();
        atualizarDashboard();
    };
}

function limparBancoDeDados() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(["pacientes"], "readwrite");
        const store = transaction.objectStore("pacientes");
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

// ============================================
// LÓGICA DE NEGÓCIOS
// ============================================

function gerarId() {
    return Math.floor(1000 + Math.random() * 9000).toString(); 
}

function calcularProximaVisita(ultimaVisita, periodicidade) {
    if (!ultimaVisita) return null;
    const data = new Date(ultimaVisita);
    data.setMonth(data.getMonth() + parseInt(periodicidade));
    return data.toISOString().split('T')[0];
}

function calcularStatus(proximaVisita) {
    if (!proximaVisita) return 'indefinido';
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dataProxima = new Date(proximaVisita);
    dataProxima.setHours(0, 0, 0, 0);
    
    const diffDias = Math.ceil((dataProxima - hoje) / (1000 * 60 * 60 * 24));
    
    if (diffDias < 0) return 'atrasado';
    if (diffDias <= 30) return 'proximo';
    return 'dia';
}

function formatarDataBR(dataIso) {
    if (!dataIso) return '-';
    const [ano, mes, dia] = dataIso.split('-');
    return `${dia}/${mes}/${ano}`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// AÇÕES DA INTERFACE (CRUD)
// ============================================

async function salvarPacienteSubmit(event) {
    event.preventDefault();
    
    const idAtual = document.getElementById('pacienteId').value;
    const ehEdicao = !!idAtual;
    
    const paciente = {
        id: ehEdicao ? idAtual : gerarId(),
        nome: document.getElementById('nome').value.trim(),
        telefone: document.getElementById('telefone').value.trim(),
        ultimaVisita: document.getElementById('ultimaVisita').value,
        periodicidade: document.getElementById('periodicidade').value,
        observacoes: document.getElementById('observacoes').value.trim(),
        dataCadastro: ehEdicao ? pacientesEmMemoria.find(p => p.id === idAtual).dataCadastro : new Date().toISOString()
    };

    paciente.proximaVisita = calcularProximaVisita(paciente.ultimaVisita, paciente.periodicidade);

    try {
        await salvarNoBanco(paciente); 
        carregarTodosPacientes(); 
        fecharModalPaciente();
        mostrarToast(ehEdicao ? '✅ Atualizado com sucesso!' : '✅ Cadastrado com sucesso!', 'success');
    } catch (erro) {
        mostrarToast('❌ Erro ao salvar no banco de dados', 'error');
    }
}

function editarPaciente(id) {
    const paciente = pacientesEmMemoria.find(p => p.id === id);
    if (!paciente) return;
    
    document.getElementById('modalTitle').textContent = '✏️ Editar Paciente';
    document.getElementById('pacienteId').value = paciente.id;
    
    document.getElementById('nome').value = paciente.nome;
    document.getElementById('telefone').value = paciente.telefone || '';
    document.getElementById('ultimaVisita').value = paciente.ultimaVisita;
    document.getElementById('periodicidade').value = paciente.periodicidade;
    document.getElementById('observacoes').value = paciente.observacoes || '';
    
    document.getElementById('modalPaciente').style.display = 'block';
}

function confirmarExcluir(id) {
    const paciente = pacientesEmMemoria.find(p => p.id === id);
    if (!paciente) return;
    
    document.getElementById('confirmMessage').innerHTML = `Tem certeza que deseja excluir <strong>${escapeHtml(paciente.nome)}</strong>?<br><br>Esta ação removerá o paciente permanentemente do banco de dados e não poderá ser desfeita.`;
    
    confirmCallback = async () => {
        try {
            await excluirDoBanco(id); 
            carregarTodosPacientes();
            mostrarToast('🗑️ Paciente excluído permanentemente!', 'info');
        } catch (e) {
            mostrarToast('❌ Erro ao excluir', 'error');
        }
    };
    
    document.getElementById('modalConfirm').style.display = 'block';
}

function visualizarPaciente(id) {
    const paciente = pacientesEmMemoria.find(p => p.id === id);
    if (!paciente) return;

    const div = document.getElementById('dadosVisuais');
    div.innerHTML = `
        <div class="full-width">
            <strong>Nome Completo</strong>
            <p>${escapeHtml(paciente.nome)}</p>
        </div>
        <div class="full-width">
            <strong>Telefone</strong>
            <p>${escapeHtml(paciente.telefone) || 'Não informado'}</p>
        </div>
        <div>
            <strong>Última Visita</strong>
            <p>${formatarDataBR(paciente.ultimaVisita)}</p>
        </div>
        <div>
            <strong>Próxima Visita</strong>
            <p>${formatarDataBR(paciente.proximaVisita)}</p>
        </div>
        <div class="full-width">
            <strong>Observações Médicas</strong>
            <p>${escapeHtml(paciente.observacoes) || 'Nenhuma observação cadastrada.'}</p>
        </div>
        <div class="full-width">
            <strong>Data de Cadastro no Sistema</strong>
            <p>${formatarDataBR(paciente.dataCadastro?.split('T')[0])}</p>
        </div>
    `;
    
    document.getElementById('modalVisualizar').style.display = 'block';
}

// ============================================
// ATUALIZAÇÃO DA TELA
// ============================================

function atualizarLista() {
    const tbody = document.getElementById('pacientesTableBody');
    
    let filtrados = pacientesEmMemoria;
    
    if (filtroAtual !== 'todos') {
        filtrados = filtrados.filter(p => calcularStatus(p.proximaVisita) === filtroAtual);
    }
    
    if (termoPesquisa.trim()) {
        const termo = termoPesquisa.toLowerCase().trim();
        filtrados = filtrados.filter(p => 
            (p.nome && p.nome.toLowerCase().includes(termo)) ||
            (p.telefone && p.telefone.includes(termo))
        );
    }
    
    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><span class="emoji">📭</span><h3>Nenhum paciente encontrado</h3></div></td></tr>`;
        return;
    }
    
    let html = '';
    filtrados.forEach(p => {
        const status = calcularStatus(p.proximaVisita);
        let badgeClass = '';
        let badgeText = '';
        
        if(status === 'dia') { badgeClass = 'status-dia-badge'; badgeText = '🟢 Em dia'; }
        else if(status === 'proximo') { badgeClass = 'status-proximo-badge'; badgeText = '🟡 Próximo'; }
        else { badgeClass = 'status-atrasado-badge'; badgeText = '🔴 Atrasado'; }
        
        html += `
            <tr>
                <td><strong>${escapeHtml(p.nome)}</strong></td>
                <td>${escapeHtml(p.telefone) || '-'}</td>
                <td>${formatarDataBR(p.ultimaVisita)}</td>
                <td>${formatarDataBR(p.proximaVisita)}</td>
                <td><span class="status-badge ${badgeClass}">${badgeText}</span></td>
                <td>
                    <div class="acoes">
                        <button class="btn-view" onclick="visualizarPaciente('${p.id}')">👁️ Ver</button>
                        <button class="btn-edit" onclick="editarPaciente('${p.id}')">✏️ Editar</button>
                        <button class="btn-delete" onclick="confirmarExcluir('${p.id}')">🗑️ Excluir</button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

function atualizarDashboard() {
    let vencidos = 0, proximos = 0, emDia = 0;
    
    pacientesEmMemoria.forEach(p => {
        const status = calcularStatus(p.proximaVisita);
        if (status === 'atrasado') vencidos++;
        else if (status === 'proximo') proximos++;
        else if (status === 'dia') emDia++;
    });
    
    document.getElementById('totalPacientes').textContent = pacientesEmMemoria.length;
    document.getElementById('visitasVencidas').textContent = vencidos;
    document.getElementById('visitasProximas').textContent = proximos;
    document.getElementById('pacientesEmDia').textContent = emDia;
}

// ============================================
// BACKUP E RESTAURAÇÃO
// ============================================

function exportarDados() {
    if (pacientesEmMemoria.length === 0) {
        mostrarToast('Não há dados para exportar!', 'error');
        return;
    }
    const dados = JSON.stringify(pacientesEmMemoria, null, 2);
    const blob = new Blob([dados], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_pacientes_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarToast('📤 Backup gerado com sucesso!', 'success');
}

function importarDados() {
    document.getElementById('fileInput').click();
}

function processarImportacao(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const dados = JSON.parse(e.target.result);
            if (!Array.isArray(dados)) throw new Error("Formato inválido");
            
            document.getElementById('confirmMessage').innerHTML = `Atenção: A importação irá apagar o banco atual e restaurar os <strong>${dados.length} pacientes</strong> do backup. Deseja continuar?`;
            
            confirmCallback = async () => {
                try {
                    await limparBancoDeDados();
                    for (let p of dados) {
                        await salvarNoBanco(p);
                    }
                    carregarTodosPacientes();
                    mostrarToast('📥 Backup restaurado com sucesso!', 'success');
                } catch (err) {
                    mostrarToast('❌ Erro ao restaurar no banco', 'error');
                }
            };
            document.getElementById('modalConfirm').style.display = 'block';

        } catch (error) {
            mostrarToast('❌ Arquivo de backup inválido!', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ============================================
// UTILITÁRIOS E EVENTOS
// ============================================

function mostrarToast(mensagem, tipo = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.textContent = mensagem;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function fecharModalPaciente() {
    document.getElementById('modalPaciente').style.display = 'none';
    document.getElementById('formPaciente').reset();
    document.getElementById('pacienteId').value = '';
}

function fecharModalVisualizar() {
    document.getElementById('modalVisualizar').style.display = 'none';
}

document.getElementById('formPaciente').addEventListener('submit', salvarPacienteSubmit);

document.getElementById('btnNovoPaciente').addEventListener('click', () => {
    document.getElementById('modalTitle').textContent = '📝 Cadastrar Paciente';
    document.getElementById('formPaciente').reset();
    document.getElementById('pacienteId').value = '';
    document.getElementById('modalPaciente').style.display = 'block';
});

document.querySelectorAll('.close').forEach(btn => {
    btn.addEventListener('click', () => {
        fecharModalPaciente();
        fecharModalVisualizar();
        document.getElementById('modalConfirm').style.display = 'none';
    });
});

window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) e.target.style.display = 'none';
});

document.getElementById('confirmYes').addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    document.getElementById('modalConfirm').style.display = 'none';
});

document.getElementById('confirmNo').addEventListener('click', () => {
    document.getElementById('modalConfirm').style.display = 'none';
});

document.getElementById('searchInput').addEventListener('input', (e) => {
    termoPesquisa = e.target.value;
    atualizarLista();
});

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filtroAtual = btn.dataset.filter;
        atualizarLista();
    });
});

window.onload = () => {
    initDB().then(() => console.log("💾 IndexedDB conectado e persistente."));
};