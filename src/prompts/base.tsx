import {
    AssistantMessage,
    BasePromptElementProps,
    PromptElement,
    PromptSizing,
    UserMessage,
} from '@vscode/prompt-tsx';
import * as vscode from 'vscode';
import { History } from './history';

export interface PromptProps extends BasePromptElementProps {
    version: string;
    metadata: string;
    base: string;
    context: vscode.ChatContext;
    userPrompt: string;
}

export class BasePrompt extends PromptElement<PromptProps, void> {
    
    async render(_state: void, _sizing: PromptSizing) {
        return (
            <>
                <UserMessage>
                    You help generate OData queries from EDMX medadata. Keep usage of functions,lambdas or other advanced features to a minimum. Return query code as an ```odata ``` code block and give a short explanation.<br />
                    <br />
                    OData Version: {this.props.version}. Make sure to only use syntax that is supported in this version.<br />
                    <br />
                    Metadata: <br />
                    {this.props.metadata}
                    <br />
                    Use this Uri is a base for the generated queries: {this.props.base}<br />
                    <br />
                    {this.props.version === '2.0' ? (
                        <>
                            Examples, but use the properties from the metadata in your answers: <br />
                            {this.props.base}/RequestedEntities?$filter=Name eq 'John'<br />
                            {this.props.base}/RequestedEntities?$select=Name,Age,ReferenceId<br />
                            {this.props.base}/RequestedEntities?$expand=RelatedEntity&$filter=Name eq 'John'&$select=Name,Age,RelatedEntity/ParentId,RelatedEntity/StreetName<br />
                        </>
                    ) : this.props.version === '4.0' ? (
                        <>
                            Examples, but use the properties from the metadata in your answers: <br />
                            {this.props.base}/RequestedEntities?$filter=Name eq 'John'<br />
                            {this.props.base}/RequestedEntities?$select=Name,Age,ReferenceId<br />
                            {this.props.base}/RequestedEntities?$filter=Name eq 'John'&$select=Name,Age&$expand=RelatedEntity($select=ParentId)<br />
                        </>
                    ) : null}
                    <br />
                </UserMessage>
                <History context={this.props.context} priority={10} />
                <UserMessage>
                    {this.props.userPrompt}
                </UserMessage>
            </>
        );
    }
}