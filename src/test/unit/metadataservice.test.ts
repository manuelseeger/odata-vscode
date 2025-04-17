import { suite, test } from "mocha";

import { MetadataModelService } from "../../services/MetadataModelService";
import { AuthKind, IODataConfiguration, Profile } from "../../contracts/types";
import { DataModel } from "../../odata2ts/data-model/DataModel";
import * as assert from "assert";
import * as fs from "fs";
import path from "path";

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

    suite("filterMetadataXml", () => {
        test("should filter namespace from XML", () => {
            const config = {
                metadata: {
                    filterNs: ["http://docs.oasis-open.org/odata/ns/edm"],
                    filterXPath: [],
                    xpathDefaultNsPrefix: "edm",
                },
                defaultFormat: "json",
                strictParser: true,
                disableRunner: false,
            } as IODataConfiguration;

            const result = service.getFilteredMetadataXml(metadataString, config);
            assert.ok(result);
            assert.strictEqual(result.includes("testing"), false);
            assert.strictEqual(result.includes("DataServices"), true);
        });

        test("should throw error if XML is invalid", () => {
            const invalidXml = "<invalid></invalid>";
            const config = {
                metadata: {
                    filterNs: [],
                    filterXPath: [],
                    xpathDefaultNsPrefix: "edm",
                    removeAnnotations: false,
                },
                defaultFormat: "json",
                strictParser: true,
                disableRunner: false,
            } as IODataConfiguration;

            assert.throws(() => {
                service.getFilteredMetadataXml(invalidXml, config);
            }, /The provided XML is not valid OData metadata./);
        });

        test("should filter XML with XPath", () => {
            const config = {
                metadata: {
                    filterNs: [],
                    filterXPath: ["//edm:EntityType[@Name='Order']"],
                    xpathDefaultNsPrefix: "edm",
                },
                defaultFormat: "json",
                strictParser: true,
                disableRunner: false,
            } as IODataConfiguration;

            const result = service.getFilteredMetadataXml(metadataString, config);

            assert.ok(result);
            assert.strictEqual(
                result.includes(`<EntityType Name="Order">`),
                false,
                "Order should be filtered out",
            );
            assert.strictEqual(
                result.includes(`<EntityType Name="Item">`),
                true,
                "Item should remain in the XML",
            );
        });

        test("should remove annotations", () => {
            const config = {
                metadata: {
                    filterNs: [],
                    filterXPath: ["//edm:Annotation"],
                    xpathDefaultNsPrefix: "edm",
                },
                defaultFormat: "json",
                strictParser: true,
                disableRunner: false,
            } as IODataConfiguration;

            const result = service.getFilteredMetadataXml(metadataString, config);
            assert.ok(result);
            assert.strictEqual(
                result.includes(`<Annotation Term="Org.OData.Capabilities.V1.BatchSupportType">`),
                false,
                "Annotation should be removed",
            );
        });

        test("should filter large documents", function () {
            this.skip(); // Skip this test if running in a CI environment, it takes very long
            this.timeout(15000);
            const largeXml = fs.readFileSync(
                path.join(__dirname, "..", "testdata", "msgraph.edmx"),
                "utf-8",
            );

            const config = {
                metadata: {
                    filterNs: [],
                    filterXPath: ["//edm:Annotation"],
                    xpathDefaultNsPrefix: "edm",
                },
                defaultFormat: "json",
                strictParser: true,
                disableRunner: false,
            } as IODataConfiguration;

            const result = service.getFilteredMetadataXml(largeXml, config);
            assert.ok(result);
            assert.strictEqual(
                result.includes(`<Annotation `),
                false,
                "Annotations should be removed",
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
