import { MenuStore } from './MenuStore';
import { GameStore } from './GameStore';
import { PrivacyStore } from './PrivacyStore';

export class RootStore {
    menuStore: MenuStore
    gameStore: GameStore
    privacyStore: PrivacyStore
    constructor() {
        this.menuStore = new MenuStore(this)
        this.gameStore = new GameStore(this)
        this.privacyStore = new PrivacyStore(this)
    }
}
