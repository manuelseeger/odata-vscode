Development: 
- This is a VSCode extension built in TypeScript
- Webview frontend code goes into ./assets/main.js and ./assets/style.css

Testing: 
- Use mocha and assert for testing. Write tests in mocha TDD style using the suite and test functions
- Use ts-mockito for mocking
- Unit tests go in ./src/test/unit . Only tests that don't depend on the VScode API go here. 
- Integration tests go in ./src/test/integration . Integration tests are run in VSCode development host and have access to the vscode API.

General: 
- Don't be lazy, always make sure all steps you want to do are also completed. 