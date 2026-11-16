import { suite, test } from "mocha";

import { MetadataModelService } from "../../services/MetadataModelService";
import { AuthKind, Profile } from "../../contracts/types";
import { DataModel } from "../../odata2ts/data-model/DataModel";
import * as assert from "assert";

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
                <Annotation Term="Org.OData.Capabilities.V1.BatchSupportType">
                    <Record>
                        <PropertyValue Property="Supported" Bool="true" />
                    </Record>
                </Annotation>
            </EntityContainer>
        </Schema>
    </edmx:DataServices>
</edmx:Edmx>`;

suite("MetadataModelService", () => {
    let service: MetadataModelService;

    setup(() => {
        service = new MetadataModelService();
    });

    suite("getModel", () => {
        test("should get model", async () => {
            const profile: Profile = {
                baseUrl: "http://example.com/odata",
                metadata: metadataString,
                name: "Default",
                auth: {
                    kind: AuthKind.None,
                },
                headers: {},
            };

            const result = await service.getModel(profile);
            assert.ok(result);
            assert.strictEqual(result instanceof DataModel, true);
            assert.strictEqual(result.getEntityTypes().length, 2);
        });

        test("should throw error if metadata is missing", async () => {
            const profile: Profile = {
                baseUrl: "http://example.com/odata",
                metadata: "",
                name: "Default",
                auth: {
                    kind: AuthKind.None,
                },
                headers: {},
            };
            await assert.rejects(async () => {
                await service.getModel(profile);
            });
        });

        test("should throw error if profile missing", async () => {
            await assert.rejects(async () => {
                await service.getModel(null!);
            });
        });
    });

    suite("schema summary", () => {
        test("keeps metadata changes and service roots independent", () => {
            const first = service.getSchemaSummary(metadataString, "https://one.test/");
            const second = service.getSchemaSummary(metadataString, "https://two.test/");
            const changed = service.getSchemaSummary(
                metadataString.replace("CustomerName", "BuyerName"),
                "https://one.test/",
            );
            assert.match(first.yaml, /CustomerName/);
            assert.match(second.yaml, /https:\/\/two.test\//);
            assert.match(changed.yaml, /BuyerName/);
            assert.doesNotMatch(changed.yaml, /CustomerName/);
            service.clearCache();
            assert.deepStrictEqual(
                service.getSchemaSummary(metadataString, "https://one.test/"),
                first,
            );
        });

        test("rejects documents that are not OData metadata", () => {
            assert.throws(
                () => service.getSchemaSummary("<invalid />", "https://one.test/"),
                /not valid OData metadata/,
            );
        });
    });

    suite("isMetadataXml", () => {
        test("should return true for valid metadata XML", () => {
            const result = service.isMetadataXml(metadataString);
            assert.strictEqual(result, true);
        });

        test("should return false for invalid XML", () => {
            const invalidXml = "<invalid></invalid>";
            const result = service.isMetadataXml(invalidXml);
            assert.strictEqual(result, false);
        });
    });
});
