import { globalStates, ODataMode } from "./configuration";
import { IMetadataModelService } from "./contracts/IMetadataModelService";
import { Profile } from "./contracts/types";
import {
    EntitySetType,
    NavPropBindingType,
    PropertyModel,
} from "./odata2ts/data-model/DataTypeModel";
import { Disposable } from "./provider";
import * as vscode from "vscode";
import { combineODataUrl, getBaseUrl } from "./util";

export class HoverProvider extends Disposable implements vscode.HoverProvider {
    public _id: string = "HoverProvider";

    constructor(
        private metadataService: IMetadataModelService,
        private context: vscode.ExtensionContext,
    ) {
        super();
        this.subscriptions = [vscode.languages.registerHoverProvider(ODataMode, this)];
    }

    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
    ): Promise<vscode.Hover | null | undefined> {
        const wordRange = document.getWordRangeAtPosition(position);
        const word = document.getText(wordRange);

        const profile = this.context.globalState.get<Profile>(globalStates.selectedProfile);
        if (!profile) {
            return;
        }

        const metadata = await this.metadataService.getModel(profile);
        if (!metadata) {
            return;
        }

        const entityContainer = metadata.getEntityContainer();
        if (!entityContainer) {
            return;
        }

        const matchingMember = Object.values(entityContainer.entitySets).find(
            (member) => member.odataName === word,
        );
        if (matchingMember) {
            const hover = this.getEntityTypeHover(matchingMember);
            return new vscode.Hover(hover, wordRange);
        }
        // default show the selected profile and URL
        return new vscode.Hover(this.getSelectedProfileHover(document, profile));
    }

    private getEntityTypeHover(member: EntitySetType): vscode.MarkdownString {
        let hoverText = `**Entity Set**: ${member.odataName}\n\n`;

        if (member.navPropBinding) {
            hoverText += `**Navigation Property Binding**: ${member.navPropBinding.map((binding: NavPropBindingType) => `${binding.path} -> ${binding.target}`).join(", ")}\n\n`;
        }

        if (member.entityType) {
            hoverText += `**Entity Type**: ${member.entityType.odataName}\n\n`;

            if (member.entityType.props) {
                hoverText += `**Properties**: \n - ${member.entityType.props.map((prop: PropertyModel) => `${prop.odataName} (${prop.odataType})`).join("\n - ")}\n\n`;
            }
        }

        return new vscode.MarkdownString(hoverText);
    }

    private getSelectedProfileHover(
        document: vscode.TextDocument,
        profile: Profile,
    ): vscode.MarkdownString {
        let hoverText = `**Selected Profile**: ${profile.name}\n\n`;
        hoverText += `**Base URL**: ${getBaseUrl(profile.baseUrl)}\n\n`;
        const queryUrl = combineODataUrl(document.getText());
        hoverText += `**Query:** [${queryUrl}](<${queryUrl}>)`;

        return new vscode.MarkdownString(hoverText);
    }
}
