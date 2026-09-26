import { MenuStore } from './MenuStore';
import { GameStore } from './GameStore';
import { PrivacyStore } from './PrivacyStore';
import { AccountStore } from './AccountStore';

export class RootStore {
    menuStore: MenuStore
    gameStore: GameStore
    privacyStore: PrivacyStore
    accountStore: AccountStore
    constructor() {
        this.menuStore = new MenuStore(this)
        this.gameStore = new GameStore(this)
        this.privacyStore = new PrivacyStore(this)
        this.accountStore = new AccountStore(this)
    }
}
