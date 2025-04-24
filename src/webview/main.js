// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.

(function () {
    const vscode = acquireVsCodeApi();

    document.addEventListener('DOMContentLoaded', () => {
        // Notify extension host that the webview is loaded and ready for initial data
        vscode.postMessage({ command: 'webviewLoaded' });

        // Add event listener for addHeaderButton
        const addHeaderButton = document.getElementById('addHeaderButton');
        if (addHeaderButton) {
            addHeaderButton.addEventListener('click', () => {
                const container = document.getElementById('headersContainer');
                const row = document.createElement('div');
                row.innerHTML = `
                    <input type="text" class="headerKey vscode-textfield" placeholder="Header Name"/>
                    <input type="text" class="headerValue vscode-textfield" placeholder="Header Value"/>
                    <div class="icon"><i class="codicon codicon-trash"></i></div>
                `;
                const inputs = row.querySelectorAll('input');
                inputs.forEach(input => {
                    input.addEventListener('change', autoSaveProfile);
                });
                container.appendChild(row);
            });
        }

        // Event delegation for trash icon removal
        const headersContainer = document.getElementById('headersContainer');
        if (headersContainer) {
            headersContainer.addEventListener('click', (e) => {
                const target = e.target;
                if (target.classList.contains('codicon-trash')) {
                    const parentDiv = target.closest('div.icon').parentElement;
                    if (parentDiv) {
                        parentDiv.remove();
                        autoSaveProfile();
                    }
                }
            });
        }

        // Show the progress ring when the metadata request starts
        const requestMetadataButton = document.getElementById('requestMetadataButton');
        const progressRing = document.getElementById('progressRing');
        if (requestMetadataButton) {
            requestMetadataButton.addEventListener('click', () => {
                progressRing.style.display = 'inline-block';
                vscode.postMessage({ command: 'requestMetadata', data: getformData() });
            });
        }

        // Attach auto-save to form blur events instead of input events.
        const profileForm = document.getElementById('profileForm');
        if (profileForm) {
            const inputs = profileForm.querySelectorAll('input, select, textarea');
            inputs.forEach(input => {
                input.addEventListener('change', autoSaveProfile);
            });
        }
    });

    // Auth fields logic (move to top-level scope)
    const authKindSelect = document.getElementById('authKind');
    const basicFields = document.getElementById('basicFields');
    const bearerFields = document.getElementById('bearerFields');
    const clientCertFields = document.getElementById('clientCertFields');
    function updateAuthFields() {
      if (!authKindSelect || !basicFields || !bearerFields || !clientCertFields) return;
      const kind = authKindSelect.value;
      basicFields.style.display = kind === 'basic' ? 'block' : 'none';
      bearerFields.style.display = kind === 'bearer' ? 'block' : 'none';
      clientCertFields.style.display = kind === 'cliencert' ? 'block' : 'none';
    }
    if (authKindSelect) {
        authKindSelect.addEventListener('change', updateAuthFields);
        updateAuthFields();
    }

    // Add file selection handlers
    if (clientCertFields) {
        const fileIcons = clientCertFields.querySelectorAll('.codicon.codicon-symbol-file');
        fileIcons.forEach(icon => {
            icon.addEventListener('click', () => {
                const inputEl = icon.parentElement.parentElement.querySelector('input');
                vscode.postMessage({ command: 'openFileDialog', inputName: inputEl.name });
            });
        });
    }

    // Listen for messages from the extension host
    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.command === 'metadataReceived') {
            const progressRing = document.getElementById('progressRing');
            if (progressRing) progressRing.style.display = 'none';
            document.getElementById('metadata').value = message.data;
            updateTokenCountUI(message.limits, message.tokenCount, message.filteredCount);
        } else if (message.command === 'fileSelected') {
            const inputName = message.inputName;
            const inputEl = document.querySelector(`input[name="${inputName}"]`);
            if (inputEl) {
                inputEl.value = message.filePath;
            }
        } else if (message.command === 'initProfile') {
            const profile = message.profile || {};
            // Set form title
            document.getElementById('formTitle').textContent = profile.name ? 'Edit Profile' : 'Create Profile';
            // Set fields
            document.getElementById('name').value = profile.name || '';
            document.getElementById('baseUrl').value = profile.baseUrl || '';
            document.getElementById('metadata').value = profile.metadata || '';
            // Auth
            if (profile.auth) {
                document.getElementById('authKind').value = profile.auth.kind || 'none';
                if (profile.auth.kind === 'basic') {
                    document.getElementById('username').value = profile.auth.username || '';
                    document.getElementById('password').value = profile.auth.password || '';
                } else if (profile.auth.kind === 'bearer') {
                    document.getElementById('token').value = profile.auth.token || '';
                } else if (profile.auth.kind === 'cliencert') {
                    document.getElementById('cert').value = (profile.auth.cert && profile.auth.cert.path) || '';
                    document.getElementById('key').value = (profile.auth.key && profile.auth.key.path) || '';
                    document.getElementById('pfx').value = (profile.auth.pfx && profile.auth.pfx.path) || '';
                    document.getElementById('passphrase').value = profile.auth.passphrase || '';
                }
                // Update auth fields visibility after setting value
                updateAuthFields();
            }
            // Headers
            const headersContainer = document.getElementById('headersContainer');
            headersContainer.innerHTML = '';
            if (profile.headers) {
                Object.keys(profile.headers).forEach(key => {
                    const row = document.createElement('div');
                    row.innerHTML = `
                        <input type="text" class="headerKey vscode-textfield" placeholder="Header Name" value="${key}"/>
                        <input type="text" class="headerValue vscode-textfield" placeholder="Header Value" value="${profile.headers[key]}"/>
                        <div class="icon"><i class="codicon codicon-trash"></i></div>
                    `;
                    const inputs = row.querySelectorAll('input');
                    inputs.forEach(input => {
                        input.addEventListener('change', autoSaveProfile);
                    });
                    headersContainer.appendChild(row);
                });
            }
            // If token/model info is present, update UI immediately
            if (message.tokenCount !== undefined && message.filteredCount !== undefined && message.limits) {
                updateTokenCountUI(message.limits, message.tokenCount, message.filteredCount);
            }
        }
    });

    function autoSaveProfile() {
        const formData = getformData();
        if (!formData.name || !formData.baseUrl) {
            // Don't save if name or baseUrl is empty
            return;
        }
        vscode.postMessage({ command: 'saveProfile', data: formData });
    }

    function getformData() {
        const authKind = document.getElementById('authKind').value;
        let auth = { kind: authKind };
        if (authKind === 'basic') {
            auth.username = document.getElementById('username').value;
            auth.password = document.getElementById('password').value;
        } else if (authKind === 'bearer') {
            auth.token = document.getElementById('token').value;
        } else if (authKind === 'cliencert') {
            auth.cert = document.getElementById('cert').value;
            auth.key = document.getElementById('key').value;
            auth.pfx = document.getElementById('pfx').value;
            auth.passphrase = document.getElementById('passphrase').value;
        }
        return {
            name: document.getElementById('name').value,
            baseUrl: document.getElementById('baseUrl').value,
            auth: auth,
            metadata: document.getElementById('metadata').value,
            headers: Array.from(document.querySelectorAll('.headerKey')).reduce((acc, header, index) => {
                const key = header.value;
                const value = document.querySelectorAll('.headerValue')[index].value;
                acc[key] = value;
                return acc;
            }, {})
        };
    }

    function updateTokenCountUI(limits, tokenCount, filteredCount) {
        document.getElementById('tokenCountInfo').textContent = tokenCount;
        document.getElementById('filteredCountInfo').textContent = filteredCount;
        const copilotSection = document.getElementById('copilotAdvancedSection');
        const modelInfoEl = document.getElementById('modelInfo');
        if (Array.isArray(limits) && limits.length > 0 && typeof tokenCount === 'number') {
            const rows = limits.map(lim => {
                const isAbove = filteredCount > lim.maxTokens;
                const isNear = !isAbove && Math.abs(filteredCount - lim.maxTokens) <= tokenCount * 0.1;
                const className = isNear ? 'near' : isAbove ? 'above' : '';
                return `<tr><td>${lim.name}</td><td class="${className}">${lim.maxTokens}</td></tr>`;
            }).join('');
            modelInfoEl.innerHTML = `<table class="model-table">
                      <tbody>${rows}</tbody>
                    </table>`;
        }
        if (copilotSection && copilotSection.tagName === 'DETAILS') {
            copilotSection.addEventListener('toggle', () => {
                const icon = copilotSection.querySelector('.icon-arrow');
                if (copilotSection.open) {
                    icon.classList.replace('codicon-chevron-right', 'codicon-chevron-down');
                } else {
                    icon.classList.replace('codicon-chevron-down', 'codicon-chevron-right');
                }
            });
        }
    }
}());
