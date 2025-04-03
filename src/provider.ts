export abstract class Disposable {
    subscriptions: Array<{ dispose: () => void }>;
    constructor() {
        this.subscriptions = [];
    }
    dispose(): void {
        if (this.subscriptions) {
            this.subscriptions.forEach((obj) => obj.dispose());
            this.subscriptions = [];
        }
    }
}
