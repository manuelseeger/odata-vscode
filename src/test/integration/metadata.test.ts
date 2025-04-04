import * as assert from "assert";

import * as vscode from "vscode";
import { setupTestEnvironment } from "./util";

suite("Metadata", () => {
    test("Should open metadata document", async () => {
        // arrange
        const { context, baseUrl } = await setupTestEnvironment();

        // act
        await vscode.commands.executeCommand("odata.getMetadata");

        // assert
        const updateProfile = context.globalState.get("odata.selectedProfile");
        assert.notEqual(updateProfile.metadata, "", "Metadata was not fetched");
    });
});
