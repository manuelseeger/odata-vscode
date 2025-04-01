# OData support for VSCode

> OData query language support for VSCode. Write and run queries with syntax highlighting, auto-completion, Copilot integration.

## Features

- Copilot integration: Talk to your OData service
- Metadata-aware code completion
- Metadata-aware diagnostics
- Run queries against your service endpoint from VSCode

## Commands


| Name | Description |
| ----- | ----- |
| `odata.run`          | Send query in ActiveTextEditor to selected profile  |
| `odata.selectProfile` | Select an endpoint profile |
| `odata.addProfile` | Add a new endpoint profile |
| `odata.getMetadata` | Download the metadata for the selected profile. _Use this to test if your endpoint authentication works_ |


## Extension Setup

Minimal setup to enable Metadata-aware completion and Copilot integration:
- Open view `OData Endpoint Profile` or run command `OData: Add Endpoint Profile`
- Add a new profile
- Request metadata for the profile

In Copilot Chat, chat with participant `@odata`, example: 

```
@odata give me all Workitems assigned to John Doe in status New
```

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
