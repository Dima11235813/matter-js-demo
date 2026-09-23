import { MenuStore } from './MenuStore';
import { GameStore } from './GameStore';

export class RootStore {
    menuStore: MenuStore
    gameStore: GameStore
    constructor() {
        this.menuStore = new MenuStore(this)
        this.gameStore = new GameStore(this)
    }
}
