// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.

(function () {
    const vscode = acquireVsCodeApi();
    
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

    document.getElementById('addHeaderButton').addEventListener('click', () => {
        const container = document.getElementById('headersContainer');
        const row = document.createElement('div');
        
        row.innerHTML = `
            <input type="text" class="headerKey vscode-textfield" placeholder="Header Name"/>
            <input type="text" class="headerValue vscode-textfield" placeholder="Header Value"/>
            <div class="icon" onclick="this.parentElement.remove();"><i class="codicon codicon-trash"></i></div>
        `;
        const inputs = row.querySelectorAll('input');
        inputs.forEach(input => {
            input.addEventListener('change', autoSaveProfile);
        });
        container.appendChild(row);
    });

    // Show the progress ring when the metadata request starts
    const requestMetadataButton = document.getElementById('requestMetadataButton');
    const progressRing = document.getElementById('progressRing');

    requestMetadataButton.addEventListener('click', () => {
        progressRing.style.display = 'inline-block';
        vscode.postMessage({ command: 'requestMetadata', data: getformData() });
    });

    // Hide the progress ring when metadata is received
    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.command === 'metadataReceived') {
            progressRing.style.display = 'none';
            document.getElementById('metadata').value = message.data;
            updateTokenCountUI(message.limits, message.tokenCount, message.filteredCount);
        } else if (message.command === 'fileSelected') {
            const inputName = message.inputName;
            const inputEl = document.querySelector(`input[name="${inputName}"]`);
            if (inputEl) {
                inputEl.value = message.filePath;
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

    // Attach auto-save to form blur events instead of input events.
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        const inputs = profileForm.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.addEventListener('change', autoSaveProfile);
        });
    }


    const authKindSelect = document.getElementById('authKind');
    const basicFields = document.getElementById('basicFields');
    const bearerFields = document.getElementById('bearerFields');
    const clientCertFields = document.getElementById('clientCertFields');
    function updateAuthFields() {
      const kind = authKindSelect.value;
      basicFields.style.display = kind === 'basic' ? 'block' : 'none';
      bearerFields.style.display = kind === 'bearer' ? 'block' : 'none';
      clientCertFields.style.display = kind === 'cliencert' ? 'block' : 'none';
    }
    authKindSelect.addEventListener('change', updateAuthFields);
    updateAuthFields();

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

    /**
     * Update the Copilot model info and token count UI.
     */
    function updateTokenCountUI(limits, tokenCount, filteredCount) {
        // Update visible token summary
        document.getElementById('tokenCountInfo').textContent = tokenCount;
        document.getElementById('filteredCountInfo').textContent = filteredCount;
        const copilotSection = document.getElementById('copilotAdvancedSection');
        const modelInfoEl = document.getElementById('modelInfo');
        if (Array.isArray(limits) && limits.length > 0 && typeof tokenCount === 'number') {
            // Build table rows for model info
            const rows = limits.map(lim => {
                const isAbove = filteredCount > lim.maxTokens;
                const isNear = !isAbove && Math.abs(filteredCount - lim.maxTokens) <= tokenCount * 0.1;
                const className = isNear ? 'near' : isAbove ? 'above' : '';
                return `<tr><td>${lim.name}</td><td class="${className}">${lim.maxTokens}</td></tr>`;
            }).join('');
            // Populate model info table
            modelInfoEl.innerHTML = `<table class="model-table">
                      <tbody>${rows}</tbody>
                    </table>`;
        } 
        // Handle arrow icon toggle
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
