(function () {
    const vscode = acquireVsCodeApi();

    document.addEventListener("DOMContentLoaded", () => {
        vscode.postMessage({ command: "webviewLoaded" });

        const addHeaderButton = document.getElementById("addHeaderButton");
        if (addHeaderButton) {
            addHeaderButton.addEventListener("click", () => {
                const container = document.getElementById("headersContainer");
                const row = headerRow("", "");
                container.appendChild(row);
            });
        }

        const headersContainer = document.getElementById("headersContainer");
        if (headersContainer) {
            headersContainer.addEventListener("click", (e) => {
                const target = e.target;
                if (target.classList.contains("codicon-trash")) {
                    const parentDiv = target.closest("div.icon").parentElement;
                    if (parentDiv) {
                        parentDiv.remove();
                        autoSaveProfile();
                    }
                }
            });
        }

        const requestMetadataButton = document.getElementById("requestMetadataButton");
        const progressRing = document.getElementById("progressRing");
        if (requestMetadataButton) {
            requestMetadataButton.addEventListener("click", () => {
                progressRing.style.display = "inline-block";
                vscode.postMessage({ command: "requestMetadata", data: getformData() });
            });
        }

        const profileForm = document.getElementById("profileForm");
        if (profileForm) {
            const inputs = profileForm.querySelectorAll("input, select, textarea");
            inputs.forEach((input) => {
                input.addEventListener("change", autoSaveProfile);
            });
        }
    });

    const authKindSelect = document.getElementById("authKind");
    const basicFields = document.getElementById("basicFields");
    const bearerFields = document.getElementById("bearerFields");
    const clientCertFields = document.getElementById("clientCertFields");
    function updateAuthFields() {
        if (!authKindSelect || !basicFields || !bearerFields || !clientCertFields) return;
        const kind = authKindSelect.value;
        basicFields.style.display = kind === "basic" ? "block" : "none";
        bearerFields.style.display = kind === "bearer" ? "block" : "none";
        clientCertFields.style.display = kind === "cliencert" ? "block" : "none";
    }
    if (authKindSelect) {
        authKindSelect.addEventListener("change", updateAuthFields);
        updateAuthFields();
    }

    if (clientCertFields) {
        const fileIcons = clientCertFields.querySelectorAll(".codicon.codicon-symbol-file");
        fileIcons.forEach((icon) => {
            icon.addEventListener("click", () => {
                const inputEl = icon.parentElement.parentElement.querySelector("input");
                vscode.postMessage({ command: "openFileDialog", inputName: inputEl.name });
            });
        });
    }

    window.addEventListener("message", (event) => {
        const message = event.data;
        if (message.command === "requestFinished") {
            document.getElementById("progressRing").style.display = "none";
        } else if (message.command === "metadataStats") {
            updateTokenCountUI(message.limits, message.tokenCount, message.filteredCount);
        } else if (message.command === "metadataReceived") {
            const progressRing = document.getElementById("progressRing");
            if (progressRing) progressRing.style.display = "none";
            document.getElementById("metadata").value = message.data;
        } else if (message.command === "fileSelected") {
            const inputName = message.inputName;
            const inputEl = ["cert", "key", "pfx"].includes(inputName)
                ? document.getElementById(inputName)
                : undefined;
            if (inputEl) {
                inputEl.value = message.filePath;
                autoSaveProfile();
            }
        } else if (message.command === "initProfile") {
            const profile = message.profile || {};
            document.getElementById("formTitle").textContent = profile.name
                ? "Edit Profile"
                : "Create Profile";
            document.getElementById("name").value = profile.name || "";
            document.getElementById("baseUrl").value = profile.baseUrl || "";
            document.getElementById("metadata").value = profile.metadata || "";
            document.getElementById("authKind").value =
                (profile.auth && profile.auth.kind) || "none";
            document.getElementById("username").value =
                (profile.auth && profile.auth.username) || "";
            document.getElementById("password").value =
                (profile.auth && profile.auth.password) || "";
            document.getElementById("token").value = (profile.auth && profile.auth.token) || "";
            document.getElementById("cert").value = (profile.auth && profile.auth.cert) || "";
            document.getElementById("key").value = (profile.auth && profile.auth.key) || "";
            document.getElementById("pfx").value = (profile.auth && profile.auth.pfx) || "";
            const recovery = document.getElementById("recoveryData");
            document.getElementById("recoveryDetails").hidden = profile.recoveryData === undefined;
            recovery.textContent = profile.recoveryData === undefined
                ? ""
                : JSON.stringify(profile.recoveryData, null, 2);
            document.getElementById("passphrase").value =
                (profile.auth && profile.auth.passphrase) || "";
            updateAuthFields();
            const headersContainer = document.getElementById("headersContainer");
            headersContainer.replaceChildren();
            if (profile.headers) {
                Object.keys(profile.headers).forEach((key) => {
                    const row = headerRow(key, profile.headers[key]);
                    headersContainer.appendChild(row);
                });
            }
            if (
                message.tokenCount !== undefined &&
                message.filteredCount !== undefined &&
                message.limits
            ) {
                updateTokenCountUI(message.limits, message.tokenCount, message.filteredCount);
            } else {
                document.getElementById("tokenCountInfo").textContent = "";
                document.getElementById("filteredCountInfo").textContent = "";
                const modelInfoEl = document.getElementById("modelInfo");
                if (modelInfoEl) modelInfoEl.replaceChildren();
            }
        }
    });

    function headerRow(key, value) {
        const row = document.createElement("div");
        for (const [className, placeholder, fieldValue] of [
            ["headerKey", "Header Name", key],
            ["headerValue", "Header Value", value],
        ]) {
            const input = document.createElement("input");
            input.type = "text";
            input.className = `${className} vscode-textfield`;
            input.placeholder = placeholder;
            input.value = fieldValue;
            input.addEventListener("change", autoSaveProfile);
            row.appendChild(input);
        }
        const icon = document.createElement("div");
        icon.className = "icon";
        const button = document.createElement("i");
        button.className = "codicon codicon-trash";
        icon.appendChild(button);
        row.appendChild(icon);
        return row;
    }

    function autoSaveProfile() {
        const formData = getformData();
        if (!formData.name || !formData.baseUrl) {
            return;
        }
        vscode.postMessage({ command: "saveProfile", data: formData });
    }

    function getformData() {
        const authKind = document.getElementById("authKind").value;
        let auth = { kind: authKind };
        if (authKind === "basic") {
            auth.username = document.getElementById("username").value;
            auth.password = document.getElementById("password").value;
        } else if (authKind === "bearer") {
            auth.token = document.getElementById("token").value;
        } else if (authKind === "cliencert") {
            auth.cert = document.getElementById("cert").value;
            auth.key = document.getElementById("key").value;
            auth.pfx = document.getElementById("pfx").value;
            auth.passphrase = document.getElementById("passphrase").value;
        }
        return {
            name: document.getElementById("name").value,
            baseUrl: document.getElementById("baseUrl").value,
            auth: auth,
            metadata: document.getElementById("metadata").value,
            headers: Array.from(document.querySelectorAll(".headerKey")).reduce(
                (acc, header, index) => {
                    const key = header.value;
                    const value = document.querySelectorAll(".headerValue")[index].value;
                    acc[key] = value;
                    return acc;
                },
                Object.create(null),
            ),
        };
    }

    function updateTokenCountUI(limits, tokenCount, filteredCount) {
        document.getElementById("tokenCountInfo").textContent = tokenCount;
        document.getElementById("filteredCountInfo").textContent = filteredCount;
        const copilotSection = document.getElementById("copilotAdvancedSection");
        const modelInfoEl = document.getElementById("modelInfo");
        if (Array.isArray(limits) && limits.length > 0 && typeof tokenCount === "number") {
            const table = document.createElement("table");
            table.className = "model-table";
            const body = document.createElement("tbody");
            for (const lim of limits) {
                const isAbove = filteredCount > lim.maxTokens;
                const isNear =
                    !isAbove && Math.abs(filteredCount - lim.maxTokens) <= tokenCount * 0.1;
                const className = isNear ? "near" : isAbove ? "above" : "";
                const row = document.createElement("tr");
                const name = document.createElement("td");
                name.textContent = lim.name;
                const limit = document.createElement("td");
                limit.className = className;
                limit.textContent = String(lim.maxTokens);
                row.append(name, limit);
                body.appendChild(row);
            }
            table.appendChild(body);
            modelInfoEl.replaceChildren(table);
        }
        if (copilotSection && copilotSection.tagName === "DETAILS") {
            copilotSection.addEventListener("toggle", () => {
                const icon = copilotSection.querySelector(".icon-arrow");
                if (copilotSection.open) {
                    icon.classList.replace("codicon-chevron-right", "codicon-chevron-down");
                } else {
                    icon.classList.replace("codicon-chevron-down", "codicon-chevron-right");
                }
            });
        }
    }
})();
