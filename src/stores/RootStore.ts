import { MenuStore } from './MenuStore';

export class RootStore {
    menuStore: MenuStore
    constructor() {
        this.menuStore = new MenuStore(this)
    }
}
