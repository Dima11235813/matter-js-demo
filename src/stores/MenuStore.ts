import { action, makeObservable, observable } from 'mobx';
import { CommonStore } from "./CommonStore"
import { RootStore } from "./RootStore";
import { AppModes } from '../matterJsComp/models/appMode';

export class MenuStore extends CommonStore {
    mode: AppModes
    constructor(store: RootStore) {
        super(store);
        this.mode = AppModes.CREATE;
        makeObservable(this, {
            mode: observable,
            setMode: action
        });
    }
    setMode = (newMode: AppModes) => {
        this.mode = newMode
    }
}
