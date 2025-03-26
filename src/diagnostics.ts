import * as vscode from 'vscode';
import { SyntaxError, LocationRange, ParsedTree } from './parser/syntaxparser';
import { MetadataModelService } from './services/MetadataModelService';
import { Profile } from './profiles';
import { DataModel } from './odata2ts/data-model/DataModel';

function rangeFromPeggyRange(span: LocationRange): vscode.Range {
    return new vscode.Range(
        new vscode.Position(span.start.line - 1, span.start.column - 1),
        new vscode.Position(span.end.line - 1, span.end.column - 1));
}


export class ODataDiagnosticProvider {

    constructor(private diagnostics: vscode.DiagnosticCollection, private metadataService: MetadataModelService, private context: vscode.ExtensionContext) {

    }

    /**
     * Add syntax errors from parsing a document's OData text to the diagnostics collection.
     * 
     * @param uri vscode.Uri of the document to set the diagnostics for
     * @param error SyntaxError to set as a diagnostic 
     */
    public handleSyntaxError(uri: vscode.Uri, error: SyntaxError) {
        const diagnostics: vscode.Diagnostic[] = [];
        const range = rangeFromPeggyRange(error.location);
        const diagnostic = new vscode.Diagnostic(range, error.message, vscode.DiagnosticSeverity.Error);
        diagnostics.push(diagnostic);
        this.diagnostics.set(uri, diagnostics);
    }


    /**
     * Add metadata aware warning diagnostics to the diagnostics collection.
     * 
     * This method is called when the OData query is successfully parsed.
     * It checks identified parts of the OData query against the metadata model and 
     * adds warnings to the diagnostics collection if the parts can't be found in 
     * the metadata model.
     * 
     * @param uri vscode.Uri of the document to set the diagnostics for
     * @param tree ODataUri object representing the parsed OData query
     */
    public async handleParseSucess(uri: vscode.Uri, tree: ParsedTree) {
        const diagnostics: vscode.Diagnostic[] = [];
        this.diagnostics.set(uri, diagnostics);

        const document = await vscode.workspace.openTextDocument(uri);
        const text = document.getText();

        const profile = this.context.globalState.get<Profile>('selectedProfile');
        const metadata = await this.metadataService.getModel(profile!);
        if (!metadata) {
            return;
        }

        this.diagnoseResourcePath(diagnostics, metadata, tree, profile!);

        this.diagnostics.set(uri, diagnostics);
    }

    private diagnoseResourcePath(diagnostics: vscode.Diagnostic[], metadata: DataModel, tree: ParsedTree, profile: Profile) {
        const resourcePath = tree.odataRelativeUri!.resourcePath;
        const resourcePathName = resourcePath.value;
        const entityContainer = metadata.getEntityContainer();
        if (!entityContainer) {
            return;
        }

        const members = [
            ...Object.values(entityContainer.entitySets),
            ...Object.values(entityContainer.singletons),
            ...Object.values(entityContainer.functions),
            ...Object.values(entityContainer.actions),
        ];

        const matchingMember = members.find(member => member.name === resourcePathName);
        if (!matchingMember) {
            const range = rangeFromPeggyRange(resourcePath.span);
            const diagnostic = new vscode.Diagnostic(
                range,
                `Resource path '${resourcePathName}' not found in the entity container of profile ${profile.name}.`,
                vscode.DiagnosticSeverity.Warning
            );
            diagnostics.push(diagnostic);
        }
    }
}