# OData support for VSCode

> OData query language support for VSCode. Write and run queries with syntax highlighting, auto-completion, Copilot integration.

## Features

- Copilot integration: Talk to your OData service
- Metadata-aware code completion
- Metadata-aware diagnostics
- Run queries against your service endpoint from VSCode

## Extension Settings

Minimal setup to enable Metadata-aware completion and Copilot integration:
- Open view `OData Endpoint Profile`
- Add a new profile
- Request metadata for the profile

In Copilot chat, chat with participant `@odata`

## Known Issues and Limitations

Supported HTTP authentication with OData endpoints: 
- Basic
- Client Certificate
- Bearer token

Metadata-aware diagnostics and auto-completion only works for top-level entities and some expand entities. Complex nested queries like `?$expand=Entity($select=Prop1,Prop2)` are not supported. 

## Troubleshooting

### Metadata file too large

Github Copilot has a character limit fo requests. If your service's metadata is above that, Copilot will refuse the request. Options:
- If your metadata includes annotations, enable `odata.metadata.removeAnnotations` in settings to filter all annotations from metadata
- If your metadata includes non-EDMX namespaces, maintain them in `odata.metadata.filterNs` to filter them out
- Manually shorten your metadata file in profiles
