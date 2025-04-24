Development: 
- This is a VSCode extension which provides programmatic language features for OData queries
- Webview frontend code goes into ./assets/main.js and ./assets/style.css
- Make sure that ./src/contracts does not depend on the VSCode API

Testing: 
- Use mocha and assert for testing. Write tests in mocha TDD style using the suite and test functions
- Use ts-mockito for mocking
- Unit tests go in ./src/test/unit . Only tests that don't depend on the VScode API go there. 
- Integration tests go in ./src/test/integration . Integration tests are run in VSCode development host and have access to the vscode API.
- Integration tests use ./src/test/integration/testutil.ts for arranging the test environment.

General: 
- Make sure to update README.md and CHANGELOG.md when adding / changing features
- Don't be lazy, always make sure all steps you plan to do are also completed