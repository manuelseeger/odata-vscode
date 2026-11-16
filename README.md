# OData support for VSCode

> OData query language support for VSCode. Write and run queries with syntax highlighting, metadata-aware auto-completion, and Copilot integration.

## Features

### Copilot integration: Talk to your OData service
![Copilot Integration](assets/orders-sicle.gif)

### Metadata-aware code completion and diagnostics
![Metadata awareness](assets/completions-sicle.gif)

### More Features
- Syntax highlighting and formatting for OData queries
- Diagnostics for syntax errors and for resources, properties, functions and query options your service does not know
- Supports OData V2 and V4 / 4.01 query syntax, including `$apply`, `$compute`, `$search` and lambda expressions
- Endpoint profiles with authentication and custom headers
- Run queries directly in VSCode and get code-formatted results

## Setup

Minimal setup to enable Metadata-aware completion and Copilot integration:
- Open view `OData Endpoint Profile` or run command `OData: Add Endpoint Profile`
- Add a new profile
- Request metadata for the profile

![Endpoint Profiles](assets/endpoint%20profiles.png)

Enable `odata.chat.tools.enabled` in a trusted workspace. In Copilot Chat, use `/odata` to draft a query from the selected service's compact schema. The `odata_getSchema` tool reads the schema. The `odata_openQuery` tool opens the draft for review without running it.

> **/odata** Show the five most recent orders.

## Commands

| Name                  | Description                                                                 |
|-----------------------|-----------------------------------------------------------------------------|
| `odata.run`           | Send query in active text editor to the selected profile                     |
| `odata.copy`          | Copy the combined, single-line query to clipboard                          |
| `odata.addProfile`    | Add a new endpoint profile. _Start here_                                   |
| `odata.selectProfile` | Select an endpoint profile                                                 |
| `odata.getMetadata`   | Download the metadata for the selected profile. _Use this to test if your endpoint authentication works_ |

## Settings
| Setting                        | Description                                                                                  | Default Value |
|--------------------------------|----------------------------------------------------------------------------------------------|---------------|
| `odata.defaultFormat`          | Set the default response format                                                              | `json`        |
| `odata.chat.tools.enabled`    | Enable the Copilot tools used by `/odata` in trusted workspaces.                              | `false`       |
| `odata.chat.schema.maxTokens` | Maximum approximate tokens in the compact schema shared with Copilot. Larger summaries return no schema. | `32000` |
| `odata.strictParser`           | Whether to show query syntax errors as warnings (`false`) or errors (`true`).               | `true`        |
| `odata.disableRunner`          | Disable the query runner, for example if your authentication is not supported.               | `false`       |
| `odata.openResultInNewPane`    | Open result document in new pane when running queries. Disable to open results in active view.  | `true`        |

`odata.metadata.filterNs`, `odata.metadata.filterXPath`, and `odata.metadata.xpathDefaultNsPrefix` have no effect. Copilot receives a compact query schema instead of XML, so metadata filters are not needed.

## Known Issues and Limitations

Supported HTTP authentication with OData endpoints: 
- Basic
- Client Certificate
- Bearer token (copy / paste)

Metadata-aware diagnostics and auto-completion follow the query at any depth: nested `$expand` and `$select` options, navigation and complex property paths, type casts, `any`/`all` lambda expressions, `$apply`, and special paths like `/$count`, `/$value` and `/$metadata`. What they do not cover:

- Value types are not checked. `Price eq 'abc'` gives no warning, and members of enumeration literals are not validated.
- After `$apply`, names are checked against the original type plus all aliases of the transformations. A property that `groupby` or `aggregate` removed from the result is not reported.
- Without a selected profile the service root is guessed from the shape of the URL. A singleton or parameterless operation followed by a navigation path (`/Me/Friends`) is only recognized with metadata.
- Duration literals need the `duration'P1D'` form. The bare form `P1D` of OData 4.01 is read as a property name.
- The formatter breaks lines at the resource path and at top-level query options only.

## Troubleshooting

### Corporate proxy / TLS inspection block requests

For a TLS inspection proxy, set `NODE_EXTRA_CA_CERTS` to the certificate authority file before you start VS Code.

### Endpoint authentication method is not supported

You can still use all features but the query runner. Create an endpoint profile with your service URL and manually copy the metadata into the profile. Syntax highlighting, metadata-aware completion, and Copilot integration will work. 

### Metadata file too large

The `/odata` skill reads a compact YAML query schema through `odata_getSchema`. The schema uses cached metadata and includes the service root and OData version. It excludes descriptions, UI annotations, actions, and unreachable types. It never includes profile credentials or headers.

The profile editor shows the summary size and whether it fits `odata.chat.schema.maxTokens`. If the summary exceeds this maximum, the tool returns its size and the current maximum without a schema. Raise the setting only if your Copilot model has enough context. The whole schema is returned or none of it. Summaries are never truncated. Opening a drafted query never runs it.

## Acknowledgment

This extension is modeled after https://github.com/StanislawSwierc/vscode-odata.

The OData syntax definition created by [Geoff Cox (@GeoffCox)](https://github.com/GeoffCox) is reused from vscode-odata.
