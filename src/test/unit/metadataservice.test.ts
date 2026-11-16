import { suite, test } from "mocha";

import { MetadataModelService } from "../../services/MetadataModelService";
import { AuthKind, Profile } from "../../contracts/types";
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

    suite("getCsdl", () => {
        test("returns canonical names and types", () => {
            const profile: Profile = {
                baseUrl: "http://example.com/odata",
                metadata: metadataString,
                name: "Default",
                auth: {
                    kind: AuthKind.None,
                },
                headers: {},
            };

            const result = service.getCsdl(profile);
            assert.ok(result);
            assert.deepStrictEqual(result.types.map((type) => type.qname), ["testing.Order", "testing.Item"]);
            assert.strictEqual(result.entitySets[0].name, "Orders");
            assert.strictEqual(result.entitySets[0].type, "testing.Order");
        });

        test("returns no declarations if metadata is missing", () => {
            const profile: Profile = {
                baseUrl: "http://example.com/odata",
                metadata: "",
                name: "Default",
                auth: {
                    kind: AuthKind.None,
                },
                headers: {},
            };
            assert.strictEqual(service.getCsdl(profile), undefined);
        });

        test("rejects malformed metadata", () => {
            assert.throws(() => service.getCsdl({ metadata: "<invalid />" } as Profile));
        });

        test("shares current declarations with summaries in either request order", () => {
            const profile: Profile = {
                baseUrl: "https://one.test/", name: "Default", metadata: metadataString,
                auth: { kind: AuthKind.None }, headers: {},
            };
            for (const summaryFirst of [true, false]) {
                service.clearCache();
                if (summaryFirst) {
                    service.getSchemaSummary(profile.metadata!, profile.baseUrl);
                }
                assert.strictEqual(service.getCsdl(profile)!.types[0].props[2].name, "CustomerName");
                assert.match(service.getSchemaSummary(profile.metadata!, profile.baseUrl).yaml, /CustomerName/);
                const changed = { ...profile, metadata: metadataString.replace("CustomerName", "BuyerName") };
                assert.strictEqual(service.getCsdl(changed)!.types[0].props[2].name, "BuyerName");
                const summary = service.getSchemaSummary(changed.metadata, changed.baseUrl);
                assert.match(summary.yaml, /BuyerName/);
                assert.doesNotMatch(summary.yaml, /CustomerName/);
                assert.strictEqual(service.getCsdl(profile)!.types[0].props[2].name, "CustomerName");
                assert.match(service.getSchemaSummary(changed.metadata, "https://two.test/").yaml, /https:\/\/two.test\//);
            }
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
