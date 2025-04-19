import * as assert from "assert";
import { anything, verify } from "ts-mockito";
import * as vscode from "vscode";

import { IMetadataModelService } from "../../contracts/IMetadataModelService";
import { IQueryRunner } from "../../contracts/IQueryRunner";
import { Profile } from "../../contracts/types";
import { ProfileTreeProvider } from "../../profiles";
import { MetadataModelService } from "../../services/MetadataModelService";
import { QueryRunner } from "../../services/QueryRunner";
import { Tokenizer } from "../../services/Tokenizer";
import { setupTests } from "./testutil";
import { CommandProvider } from "../../commands";

suite("ProfileTreeProvider", () => {
    let context: vscode.ExtensionContext;
    let profile: Profile;
    let metadataService: IMetadataModelService;
    let queryRunner: IQueryRunner;
    let runnerMock: QueryRunner;
    let profileTreeProvider: ProfileTreeProvider;
    let commandProvider: CommandProvider;

    setup(async () => {
        const queryResponses = {};
        ({ profile, context, queryRunner, runnerMock } = await setupTests(queryResponses));
        metadataService = new MetadataModelService();
        const tokenizer = new Tokenizer();
        commandProvider = new CommandProvider(context, queryRunner);

        profileTreeProvider = new ProfileTreeProvider(tokenizer, metadataService, context);
    });

    test("should get metadata for profile", async () => {
        // Act
        await profileTreeProvider.getEndpointMetadata();
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Assert
        verify(
            runnerMock.fetch("https://example.com/odata/$metadata", anything(), anything()),
        ).once();
    });
});
