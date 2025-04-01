# OData support for VSCode

OData support for VSCode v0.0.3

This extension adds support for the OData query language to VSCode. 

## Features

- Copilot integration: Talk to your OData service
- Http Endpoint profiles
- Code completion for functions, methods
- Metadata aware code completion
- Metadata aware diagnostics

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
