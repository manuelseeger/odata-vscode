import { ProfileTreeProvider } from "../../profiles";
import { Profile, AuthKind } from "../../contracts/types";
import { Disposable } from "../../provider";
import * as vscode from "vscode";
import * as assert from "assert";

import { instance, mock, when, anything } from "ts-mockito";
import { IQueryRunner } from "../../contracts/IQueryRunner";
import { globalStates } from "../../configuration";
import { QueryRunner } from "../../services/QueryRunner";
import { Response } from "undici";

export async function setupTestEnvironment() {
    const baseUrl = "https://services.odata.org/northwind/northwind.svc/";
    const extension = vscode.extensions.getExtension("manuelseeger.odata");
    assert.ok(extension, "Extension not found");

    const context = await extension!.activate();

    const profilTree = context.subscriptions.find(
        (sub: Disposable) => sub._id === "ProfileTreeProvider",
    ) as ProfileTreeProvider;
    assert.ok(profilTree, "Profile tree provider not found");

    const profile: Profile = {
        name: "Northwind",
        baseUrl: baseUrl,
        metadata: "",
        auth: {
            kind: AuthKind.None,
        },
        headers: {},
    };
    profilTree.addProfile(profile);
    context.globalState.update("odata.selectedProfile", profile);

    return { context, baseUrl };
}

export function setupTests(records: { [key: string]: string } = {}): {
    profile: Profile;
    context: vscode.ExtensionContext;
    queryRunner: IQueryRunner;
} {
    const metadataString = `<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
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

    const profile = {
        name: "TestProfile",
        baseUrl: "https://example.com/odata/",
        metadata: metadataString,
        auth: { kind: AuthKind.None },
        headers: {},
    } as Profile;

    const mockContext = {
        globalState: {
            get: (key: string) => {
                if (key === globalStates.selectedProfile) {
                    return profile;
                } else if (key === globalStates.profiles) {
                    return [profile];
                }
                return undefined;
            },
        },
    } as unknown as vscode.ExtensionContext;

    const queryRunner: QueryRunner = mock(QueryRunner);

    // Override mock for each record: when called with the key, return its value
    for (const [key, value] of Object.entries(records!)) {
        when(queryRunner.run(key, anything())).thenResolve(
            new Response(value, {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );
    }

    return { profile, context: mockContext, queryRunner: instance(queryRunner) };
}
