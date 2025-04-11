import { Profile, AuthKind } from "../../contracts/types";
import * as vscode from "vscode";

import { instance, mock, when, anything } from "ts-mockito";
import { IQueryRunner } from "../../contracts/IQueryRunner";
import { globalStates } from "../../configuration";
import { QueryRunner } from "../../services/QueryRunner";
import { Response } from "undici";

export const metadataString = `<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
    <edmx:DataServices>
        <Schema Namespace="testing" xmlns="http://docs.oasis-open.org/odata/ns/edm">
            <EntityType Name="Order">
                <Key>
                    <PropertyRef Name="OrderID"/>
                </Key>
                <Property Name="OrderID" Type="Edm.Int32"/>
                <Property Name="OrderDate" Type="Edm.DateTimeOffset"/>
                <Property Name="CustomerName" Type="Edm.String"/>
                <NavigationProperty Name="Items" Type="Collection(testing.Item)" Nullable="false"/>
            </EntityType>
            <EntityType Name="Item">
                <Key>
                    <PropertyRef Name="ItemID"/>
                </Key>
                <Property Name="ItemID" Type="Edm.Int32"/>
                <Property Name="ItemName" Type="Edm.String"/>
                <Property Name="Quantity" Type="Edm.Int32"/>
            </EntityType>
            <EntityContainer Name="DefaultContainer">
                <EntitySet Name="Orders" EntityType="testing.Order"/>
                <EntitySet Name="Items" EntityType="testing.Item"/>
            </EntityContainer>
        </Schema>
    </edmx:DataServices>
</edmx:Edmx>`;

export async function setupTests(
    queryRunnerMap: { [key: string]: string } = {},
    profile?: Profile,
): Promise<{
    profile: Profile;
    context: vscode.ExtensionContext;
    queryRunner: IQueryRunner;
    runnerMock: any;
}> {
    await setTabSize(4);
    await setEOL("\n");

    if (!profile) {
        profile = {
            name: "TestProfile",
            baseUrl: "https://example.com/odata/",
            metadata: metadataString,
            auth: { kind: AuthKind.None },
            headers: {},
        } as Profile;
    }

    const globalStateMock: vscode.Memento & { setKeysForSync(keys: readonly string[]): void } =
        mock<vscode.Memento & { setKeysForSync(keys: readonly string[]): void }>();

    const mockContext: vscode.ExtensionContext = mock<vscode.ExtensionContext>();

    when(mockContext.globalState).thenReturn(instance(globalStateMock));

    when(globalStateMock.get(globalStates.selectedProfile)).thenReturn(profile);
    when(globalStateMock.get(globalStates.profiles, anything())).thenReturn([profile]);

    const queryRunner: QueryRunner = mock(QueryRunner);

    // Override mock for each record: when called with the key, return its value
    for (const [key, value] of Object.entries(queryRunnerMap!)) {
        const url = new URL(key);
        url.searchParams.append("$format", "json");
        when(queryRunner.run(url.href, anything())).thenResolve(
            new Response(value, {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );
    }

    const doesnotexist = new URL(`${profile.baseUrl}DoesNotExist`);
    doesnotexist.searchParams.append("$format", "json");
    when(queryRunner.run(doesnotexist.href, anything())).thenResolve(
        new Response("", {
            status: 404,
            headers: { "Content-Type": "application/json" },
        }),
    );

    when(queryRunner.fetch(`${profile.baseUrl}$metadata`, anything(), anything())).thenResolve(
        new Response(metadataString, {
            status: 200,
            headers: { "Content-Type": "application/xml" },
        }),
    );

    return {
        profile,
        context: instance(mockContext),
        queryRunner: instance(queryRunner),
        runnerMock: queryRunner,
    };
}

export async function setTabSize(size: number) {
    const config = vscode.workspace.getConfiguration("editor");
    await config.update("tabSize", size, vscode.ConfigurationTarget.Global);
}

export async function setEOL(eol: string) {
    const config = vscode.workspace.getConfiguration("files");
    await config.update("eol", eol, vscode.ConfigurationTarget.Global);
}
