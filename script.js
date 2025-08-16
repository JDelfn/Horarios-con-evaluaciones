// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyC-xvM9xOfg8SqdWej2ebMPQ75Im0mXpbc",
    authDomain: "evaluacion-profesores-df107.firebaseapp.com",
    projectId: "evaluacion-profesores-df107",
    storageBucket: "evaluacion-profesores-df107.firebasestorage.app",
    messagingSenderId: "182131194576",
    appId: "1:182131194576:web:fc4b91499a2bc1435cfcd5"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// URL pública de tu hoja de Google Sheets en formato CSV
const GOOGLE_SHEETS_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQa3aGxJT18QCegGY4ol0ZV2n3wBG2gQ_KM2kux_NxUJkvXMF7fIaDe5EVMIH3vUEjDUUoInMkZEW-T/pub?output=csv';

// Datos de evaluación (ahora se cargarán desde Firebase)
let evaluations = [];

// Elementos DOM
const semesterSelect = document.getElementById('semester');
const groupSelect = document.getElementById('group');
const searchInput = document.getElementById('search');
const tableBody = document.getElementById('table-body');
const commentsModal = document.getElementById('comments-modal');
const closeModal = document.querySelector('.close-modal');
const commentsContainer = document.getElementById('comments-container');
const professorNameElement = document.querySelector('.modal-title');
const lastUpdatedElement = document.getElementById('last-updated');
const statusText = document.getElementById('status-text');

// Variables globales
let groupsBySemester = {};
let scheduleData = [];
let lastGroup = null; // Para controlar los divisores

// Función para configurar los listeners de Firestore
function setupFirebaseListeners() {
    const evaluationsRef = db.collection('evaluaciones');

    evaluationsRef.onSnapshot((snapshot) => {
        evaluations = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            // Recorre el array de docentes
            if (Array.isArray(data.docentes)) {
                data.docentes.forEach((docente, idx) => {
                    evaluations.push({
                        professor: docente.nombre || '',
                        rating: parseFloat(docente.calificacion) || 0,
                        comment: docente.comentarios || '',
                        // Puedes agregar más campos si los necesitas
                        timestamp: data.fecha ? new Date(data.fecha.seconds * 1000) : Date.now(),
                        // Si quieres asociar grupo/semestre, puedes extraerlos así:
                        group: Array.isArray(data.grupos) ? data.grupos[idx] : '',
                        semester: Array.isArray(data.semestres) ? data.semestres[idx] : ''
                    });
                });
            }
        });

        filterData();
        updateLastUpdated();

        statusText.textContent = "Datos actualizados en tiempo real";
        statusText.style.color = "#2ecc71";
        setTimeout(() => {
            statusText.textContent = "Conectado - Esperando actualizaciones";
            statusText.style.color = "#3498db";
        }, 3000);
    }, (error) => {
        console.error("Error en Firestore listener:", error);
        statusText.textContent = "Error de conexión - Intentando reconectar";
        statusText.style.color = "#e74c3c";
    });
}

// Función para cargar datos desde Google Sheets
async function loadScheduleData() {
    try {
        statusText.textContent = "Cargando datos desde Google Sheets...";
        statusText.style.color = "#f39c12";

        const response = await fetch(GOOGLE_SHEETS_URL);
        const csvData = await response.text();

        // Convertir CSV a JSON
        const jsonData = csvToJson(csvData);
        scheduleData = jsonData;

        // Generar grupos por semestre
        generateGroupsBySemester();

        // Actualizar opciones de grupos
        updateGroupOptions();

        // Mostrar datos iniciales
        filterData();

        statusText.textContent = "Conectado - Datos cargados correctamente";
        statusText.style.color = "#2ecc71";

        return true;
    } catch (error) {
        console.error('Error al cargar los datos:', error);
        statusText.textContent = "Error al cargar datos - Intente recargar la página";
        statusText.style.color = "#e74c3c";

        // Mostrar mensaje de error en la tabla
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 30px; color: #e74c3c;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 15px;"></i>
                    <h3>Error al cargar los datos</h3>
                    <p>No se pudo cargar la información desde Google Sheets. Por favor, intente recargar la página.</p>
                </td>
            </tr>
        `;

        return false;
    }
}

// Función para convertir CSV a JSON
function csvToJson(csv) {
    const lines = csv.split('\n');
    const result = [];
    const headers = lines[0].split(',').map(h => h.trim());

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i]) continue;

        const obj = {};
        const currentline = lines[i].split(',');

        for (let j = 0; j < headers.length; j++) {
            obj[headers[j]] = currentline[j] ? currentline[j].trim() : '';
        }

        result.push(obj);
    }

    return result;
}

// Función para determinar la clase de rating según la puntuación
function getRatingClass(rating) {
    if (rating >= 4.0) return 'rating-high';
    if (rating >= 2.5) return 'rating-medium';
    return 'rating-low';
}

// Función para formatear la fecha
function formatDate(date) {
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return 'Hace unos segundos';
    if (diff < 3600) return `Hace ${Math.floor(diff / 60)} minutos`;
    if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} horas`;
    return `Hace ${Math.floor(diff / 86400)} días`;
}

// Función para actualizar el tiempo de última actualización
function updateLastUpdated() {
    const now = new Date();
    lastUpdatedElement.textContent = formatDate(now);
}

// Función para calcular el promedio y comentarios de un profesor
function calculateProfessorStats(professorName) {
    const professorEvaluations = evaluations.filter(e => e.professor === professorName);

    if (professorEvaluations.length === 0) {
        return { rating: 0, comments: [] };
    }

    const totalRating = professorEvaluations.reduce((sum, eval) => sum + eval.rating, 0);
    const averageRating = totalRating / professorEvaluations.length;

    // Recolectar todos los comentarios
    const comments = professorEvaluations
        .filter(e => e.comment && e.comment.trim() !== '')
        .map(e => ({
            text: e.comment,
            date: e.timestamp ? formatDate(new Date(e.timestamp)) : 'Fecha desconocida'
        }));

    return {
        rating: averageRating,
        comments: comments
    };
}

// Función para generar grupos por semestre
function generateGroupsBySemester() {
    groupsBySemester = {};

    scheduleData.forEach(item => {
        const semester = item.Semestre || item.semester;
        const group = item.Grupo || item.group;

        if (!groupsBySemester[semester]) {
            groupsBySemester[semester] = new Set();
        }

        groupsBySemester[semester].add(group);
    });
}

// Función para actualizar la lista de grupos
function updateGroupOptions() {
    const semester = semesterSelect.value;
    groupSelect.innerHTML = '<option value="">Todos los grupos</option>';

    if (semester && groupsBySemester[semester]) {
        const groups = Array.from(groupsBySemester[semester]).sort();

        groups.forEach(group => {
            const option = document.createElement('option');
            option.value = group;
            option.textContent = `Grupo ${group}`;
            groupSelect.appendChild(option);
        });
    }
}

// Función para combinar datos de horario y evaluaciones
function combineScheduleAndEvaluations() {
    const combinedData = [];

    scheduleData.forEach(scheduleItem => {
        const professor = scheduleItem.Profesor || scheduleItem.professor;
        const stats = calculateProfessorStats(professor);

        combinedData.push({
            semester: scheduleItem.Semestre || scheduleItem.semester,
            group: scheduleItem.Grupo || scheduleItem.group,
            subject: scheduleItem.Asignatura || scheduleItem.subject,
            professor: professor,
            rating: stats.rating,
            comments: stats.comments,
            schedule: {
                monday: scheduleItem.Lunes || scheduleItem.monday,
                tuesday: scheduleItem.Martes || scheduleItem.tuesday,
                wednesday: scheduleItem.Miercoles || scheduleItem.wednesday,
                thursday: scheduleItem.Jueves || scheduleItem.thursday,
                friday: scheduleItem.Viernes || scheduleItem.friday
            }
        });
    });

    return combinedData;
}

// Función para renderizar la tabla con divisores de grupo
function renderTable(data) {
    tableBody.innerHTML = '';
    lastGroup = null; // Reiniciar para cada renderizado

    if (data.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 30px;">
                    <i class="fas fa-info-circle" style="font-size: 3rem; color: #3498db; margin-bottom: 15px;"></i>
                    <h3 style="color: #333;">No se encontraron resultados</h3>
                    <p style="color: #666;">Intenta con otros filtros o términos de búsqueda</p>
                </td>
            </tr>
        `;
        return;
    }

    data.forEach(item => {
        const ratingClass = getRatingClass(item.rating);

        // Agregar divisor si cambió el grupo
        if (lastGroup !== null && lastGroup !== item.group) {
            const dividerRow = document.createElement('tr');
            dividerRow.className = 'group-divider';
            dividerRow.innerHTML = `<td colspan="9"></td>`;
            tableBody.appendChild(dividerRow);
        }

        lastGroup = item.group;

        const row = document.createElement('tr');

        // Aplicar color de fondo según el rating
        if (item.rating === 0) {
    row.style.backgroundColor = ''; // Fondo blanco (elimina cualquier estilo previo)
            } else if (item.rating >= 4.0) {
    row.style.backgroundColor = 'rgba(46, 204, 113, 0.1)';
            } else if (item.rating >= 2.5) {
    row.style.backgroundColor = 'rgba(243, 156, 18, 0.1)';
            } else if (item.rating >= 0.1) {
    row.style.backgroundColor = 'rgba(231, 76, 60, 0.1)';
            } else {
    // Para valores menores a 0.1 (incluyendo negativos) o undefined
    row.style.backgroundColor = ''; // Fondo blanco
        }

        row.innerHTML = `
            <td>${item.group}</td>
            <td>${item.subject}</td>
            <td class="professor-cell" data-professor="${item.professor}">
                <i class="fas fa-user-graduate"></i> ${item.professor}
            </td>
            <td>
                <span class="rating ${ratingClass}">${item.rating.toFixed(1)}</span>
            </td>
            <td class="day-cell mon">${item.schedule.monday || '-'}</td>
            <td class="day-cell tue">${item.schedule.tuesday || '-'}</td>
            <td class="day-cell wed">${item.schedule.wednesday || '-'}</td>
            <td class="day-cell thu">${item.schedule.thursday || '-'}</td>
            <td class="day-cell fri">${item.schedule.friday || '-'}</td>
        `;

        tableBody.appendChild(row);
    });

    // Agregar event listeners a las celdas de profesor
    document.querySelectorAll('.professor-cell').forEach(cell => {
        cell.addEventListener('click', () => {
            const professor = cell.getAttribute('data-professor');
            showComments(professor);
        });
    });
}

// Función para mostrar los comentarios
function showComments(professor) {
    const stats = calculateProfessorStats(professor);

    professorNameElement.textContent = `Comentarios sobre ${professor}`;

    if (stats.comments.length > 0) {
        let commentsHTML = '<ul class="comments-list">';

        stats.comments.forEach(comment => {
            commentsHTML += `
                <li class="comment-item">
                    <div class="comment-header">
                        <span><i class="far fa-calendar"></i> ${comment.date}</span>
                        <span><i class="far fa-user"></i> Estudiante</span>
                    </div>
                    <p class="comment-text">${comment.text}</p>
                </li>
            `;
        });

        commentsHTML += '</ul>';
        commentsContainer.innerHTML = commentsHTML;
    } else {
        commentsContainer.innerHTML = `
            <div class="no-comments">
                <i class="far fa-comment-slash" style="font-size: 3rem; margin-bottom: 15px;"></i>
                <h3>No hay comentarios aún</h3>
                <p>Este profesor no tiene comentarios de estudiantes</p>
            </div>
        `;
    }

    commentsModal.style.display = 'flex';
}

// Función para quitar acentos/diacríticos
function removeDiacritics(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Función para filtrar los datos
function filterData() {
    const semester = semesterSelect.value;
    const group = groupSelect.value;
    const searchTerm = removeDiacritics(searchInput.value.toLowerCase());

    const combinedData = combineScheduleAndEvaluations();

    let filteredData = combinedData;

    // Filtrar por semestre
    if (semester) {
        filteredData = filteredData.filter(item => item.semester === semester);
    }

    // Filtrar por grupo
    if (group) {
        filteredData = filteredData.filter(item => item.group === group);
    }

    // Filtrar por término de búsqueda
    if (searchTerm) {
        filteredData = filteredData.filter(item =>
            removeDiacritics(item.professor.toLowerCase()).includes(searchTerm) ||
            removeDiacritics(item.subject.toLowerCase()).includes(searchTerm)
        );
    }

    renderTable(filteredData);
}

// Función para resaltar filas actualizadas
function highlightUpdatedProfessor(professor) {
    const updatedRows = document.querySelectorAll(`[data-professor="${professor}"]`);
    updatedRows.forEach(rowCell => {
        const row = rowCell.closest('tr');
        row.classList.add('update-animation');

        // Quitar la animación después de que termine
        setTimeout(() => {
            row.classList.remove('update-animation');
        }, 1500);
    });
}

// Event listeners
semesterSelect.addEventListener('change', () => {
    updateGroupOptions();
    filterData();
});

groupSelect.addEventListener('change', filterData);
searchInput.addEventListener('input', filterData);

// Cerrar modal
closeModal.addEventListener('click', () => {
    commentsModal.style.display = 'none';
});

// Cerrar modal al hacer clic fuera del contenido
window.addEventListener('click', (e) => {
    if (e.target === commentsModal) {
        commentsModal.style.display = 'none';
    }
});

// Inicializar la aplicación
async function initApp() {
    // Cargar datos desde Google Sheets
    await loadScheduleData();

    // Configurar listeners de Firestore (no Realtime Database)
    setupFirebaseListeners();

    // Actualizar última actualización
    updateLastUpdated();
}

// Iniciar la aplicación cuando se cargue la página
window.addEventListener('DOMContentLoaded', initApp);


