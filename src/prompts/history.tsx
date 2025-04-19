import {
	UserMessage,
	AssistantMessage,
	PromptElement,
	BasePromptElementProps,
	PrioritizedList,

} from '@vscode/prompt-tsx';

import * as vscode from 'vscode';


interface IHistoryProps extends BasePromptElementProps {
	priority: number;
    context: vscode.ChatContext;
}

export class History extends PromptElement<IHistoryProps, void> {
	render() {
		return (
            
			<>
                <PrioritizedList priority={this.props.priority} descending={false}>
                {this.props.context.history.map((message) => {
					if (message instanceof vscode.ChatRequestTurn) {
						return (
							<>
								<UserMessage>{message.prompt}</UserMessage>
							</>
						);
					} else if (message instanceof vscode.ChatResponseTurn) {
						return <AssistantMessage>{chatResponseToString(message)}</AssistantMessage>;
					}
                    return null;
                })}
                </PrioritizedList>
			</>
		);
	}
}


/**
 * Convert the stream of chat response parts into something that can be rendered in the prompt.
 */
function chatResponseToString(response: vscode.ChatResponseTurn): string {
	return response.response
		.map((r) => {
			if (r instanceof vscode.ChatResponseMarkdownPart) {
				return r.value.value;
			} else if (r instanceof vscode.ChatResponseAnchorPart) {
				if (r.value instanceof vscode.Uri) {
					return r.value.fsPath;
				} else {
					return r.value.uri.fsPath;
				}
			}

			return '';
		})
		.join('');
}
