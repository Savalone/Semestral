document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const logoutButton = document.getElementById('logoutButton');
    const usersTableBody = document.querySelector('#usersTable tbody');
    const messageDiv = document.getElementById('message');

    // Función para mostrar mensajes
    function showMessage(msg, type = 'info') {
        messageDiv.textContent = msg;
        messageDiv.className = `message show ${type}`;
        setTimeout(() => {
            messageDiv.className = 'message';
        }, 3000); // Ocultar después de 3 segundos
    }

    // --- Lógica de Login ---
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = loginForm.elements.username.value;
            const password = loginForm.elements.password.value;

            try {
                const response = await fetch('/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                if (response.ok) {
                    const data = await response.json();
                    showMessage('Login exitoso.', 'success');
                    window.location.href = data.redirect;
                } else {
                    const errorText = await response.text();
                    showMessage(`Error al iniciar sesión: ${errorText}`, 'error');
                }
            } catch (error) {
                console.error('Error:', error);
                showMessage('Error de conexión al servidor.', 'error');
            }
        });
    }

    // --- Lógica de Registro ---
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = registerForm.elements.username.value;
            const password = registerForm.elements.password.value;

            try {
                const response = await fetch('/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                if (response.ok) {
                    const data = await response.json();
                    showMessage('Registro exitoso. Redirigiendo...', 'success');
                    window.location.href = data.redirect;
                } else {
                    const errorText = await response.text();
                    showMessage(`Error al registrar: ${errorText}`, 'error');
                }
            } catch (error) {
                console.error('Error:', error);
                showMessage('Error de conexión al servidor.', 'error');
            }
        });
    }

    // --- Lógica del Dashboard ---
    if (usersTableBody) {
        async function fetchUsers() {
            try {
                const response = await fetch('/api/users');
                if (response.ok) {
                    const users = await response.json();
                    usersTableBody.innerHTML = ''; // Limpiar tabla
                    users.forEach(user => {
                        const row = usersTableBody.insertRow();
                        row.insertCell(0).textContent = user.id;
                        row.insertCell(1).textContent = user.username;
                        row.insertCell(2).textContent = user.is_admin ? 'Sí' : 'No';
                        row.insertCell(3).textContent = new Date(user.created_at).toLocaleDateString();

                        const actionsCell = row.insertCell(4);
                        // Solo permite borrar si el usuario no es el actual y es un admin
                        // (la verificación de ser admin se hace en el backend)
                        const deleteButton = document.createElement('button');
                        deleteButton.textContent = 'Eliminar';
                        deleteButton.onclick = () => deleteUser(user.id, user.username);
                        actionsCell.appendChild(deleteButton);
                    });
                } else if (response.status === 403) {
                    showMessage('No tienes permiso para ver los usuarios.', 'error');
                } else {
                    const errorText = await response.text();
                    showMessage(`Error al cargar usuarios: ${errorText}`, 'error');
                }
            } catch (error) {
                console.error('Error al cargar usuarios:', error);
                showMessage('Error de conexión al servidor al cargar usuarios.', 'error');
            }
        }

        async function deleteUser(userId, username) {
            if (confirm(`¿Estás seguro de que quieres eliminar al usuario "${username}"?`)) {
                try {
                    const response = await fetch(`/api/users/${userId}`, {
                        method: 'DELETE'
                    });
                    if (response.ok) {
                        showMessage('Usuario eliminado correctamente.', 'success');
                        fetchUsers(); // Recargar la lista de usuarios
                    } else {
                        const errorData = await response.json();
                        showMessage(`Error al eliminar usuario: ${errorData.error || response.statusText}`, 'error');
                    }
                } catch (error) {
                    console.error('Error al eliminar usuario:', error);
                    showMessage('Error de conexión al servidor al eliminar usuario.', 'error');
                }
            }
        }

        // Cargar usuarios al cargar el dashboard
        fetchUsers();
    }

    // --- Lógica de Logout ---
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            try {
                const response = await fetch('/logout');
                if (response.ok) {
                    window.location.href = '/login';
                } else {
                    showMessage('Error al cerrar sesión.', 'error');
                }
            } catch (error) {
                console.error('Error:', error);
                showMessage('Error de conexión al servidor.', 'error');
            }
        });
    }
});
