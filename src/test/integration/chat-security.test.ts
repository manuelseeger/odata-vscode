import * as assert from "assert";
import * as vscode from "vscode";
import { ChatParticipantProvider } from "../../chat";
import { MetadataModelService } from "../../services/MetadataModelService";

suite("Restricted chat", () => {
    test("rejects chat before profile access or model requests", async () => {
        const originalCreate = vscode.chat.createChatParticipant;
        const descriptor = Object.getOwnPropertyDescriptor(vscode.workspace, "isTrusted")!;
        vscode.chat.createChatParticipant = () =>
            ({ dispose: () => undefined }) as unknown as vscode.ChatParticipant;
        const provider = new ChatParticipantProvider(
            { extensionUri: vscode.Uri.file(process.cwd()) } as vscode.ExtensionContext,
            new MetadataModelService(),
            { approximateTokenCount: (value) => value.length },
        );
        Object.defineProperty(vscode.workspace, "isTrusted", {
            configurable: true,
            get: () => false,
        });
        try {
            await assert.rejects(
                async () =>
                    provider.chatHandler(
                        {} as vscode.ChatRequest,
                        {} as vscode.ChatContext,
                        {} as vscode.ChatResponseStream,
                        {} as vscode.CancellationToken,
                    ),
                /Trust/,
            );
        } finally {
            provider.dispose();
            vscode.chat.createChatParticipant = originalCreate;
            Object.defineProperty(vscode.workspace, "isTrusted", descriptor);
        }
    });
});
