import { RootStore } from './RootStore'

export class CommonStore {
    protected store: RootStore;

    constructor(store: RootStore) {
        this.store = store
    }
}