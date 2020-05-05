import { action, observable } from 'mobx';
import { CommonStore } from "./CommonStore"
import { RootStore } from "./RootStore";
import { AppModes } from '../matterJsComp/models/appMode';

export class MenuStore extends CommonStore {
    @observable mode: AppModes
    constructor(store: RootStore) {
        super(store);
        this.mode =  AppModes.CREATE
    }
    @action setMode = (newMode: AppModes) => {
        this.mode = newMode
    }
}

//THIS pattern requires
// "emitDecoratorMetadata": true,
// "experimentalDecorators": true,
//in tsconfig 

//TODO research if there's any implication in this decision - the above is easier to write

//https://stackoverflow.com/questions/38271273/experimental-decorators-warning-in-typescript-compilation
