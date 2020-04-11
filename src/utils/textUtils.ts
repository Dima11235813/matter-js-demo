import source from './Dictionary/Dictionary'
import { stringify } from 'querystring'

export const getRandomLetterOrSpace = () => {
    let result = ' '
    let alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    let fullAlphabet = `${alphabet}${alphabet.toLocaleLowerCase()}`
    result = fullAlphabet[Math.floor(Math.random() * fullAlphabet.length)]
    // console.log(`Random letter ${result}`)
    return result
}
const notValidList = [" ", "-"]
const checkIfLetterNotValid = (letter: string): boolean => {
    let valid = false
    if (notValidList.indexOf(letter) !== -1) {
        valid = true
    }
    return valid
}
//whatever this is plus 2
const sizeOfLargestWord = 6
const checkIfDynamicKeysCharsNotValid = (index: number, array: string[]): boolean => {
    let longestKeyIsNotValid = false
    let longestPossibleKey = array.slice(index, index + sizeOfLargestWord + 2).join('')
    let count = 0
    do {
        if (longestPossibleKey.indexOf(notValidList[count]) > -1) {
            longestKeyIsNotValid = true
        }
        count += 1
    } while (count < notValidList.length || !longestKeyIsNotValid)
    console.log(`Returning ${longestKeyIsNotValid} for longest key validity`)
    return longestKeyIsNotValid
}

export class DictionaryTools {
    dict: any
    commonLetterPairs: any = {}
    letterPairs: any[] = []
    letterPairsWithFreq: any[] = []
    letterPairToFreqLookup: any = {}
    arrayOfLetterComboLookUps: any = []
    constructor() {
        this.dict = source
        // this.dict.sort((entry1: string, entry 2: string))
        Object.keys(this.dict).join(' ').split('').forEach((letter: string, index: number, array: string[]) => {
            //if on last letter don't do anything with it
            if (index === array.length ||
                checkIfLetterNotValid(letter) ||
                checkIfLetterNotValid(array[index + 1]) //||
                // checkIfDynamicKeysCharsNotValid(index, array)
            ) return
            //key the letter pair for current letter and next letter
            let key = `${letter}${array[index + 1]}`.toLocaleLowerCase()
            //TODO WIP
            // let arrayOfKeys = this.getArrayOfKeys(letter, index, array)
            // arrayOfKeys.forEach(key => {
            //     //if this is the first key for this length then create the array
            //     if (!this.arrayOfLetterComboLookUps[key.length]) {
            //         this.arrayOfLetterComboLookUps[key.length] = []
            //     }
            //     if (!this.arrayOfLetterComboLookUps[key.length][key]) {
            //         this.arrayOfLetterComboLookUps[key.length].push(key)
            //     }
            // })
            //Two letter keys
            let result = this.commonLetterPairs[key]
            if (result) {
                this.commonLetterPairs[key] += 1
            } else {
                this.commonLetterPairs[key] = 1
            }
        }, {})
        this.commonLetterPairs = Object.entries(this.commonLetterPairs).sort((item1: any, item2: any) => {
            if (item1[1] > item2[1]) {
                return -1
            } else if (item1[1] < item2[1]) {
                return 1
            } else {
                return 0
            }
        }).forEach((item: any) => {
            this.letterPairs.push(item[0])
            this.letterPairsWithFreq.push(`LetterPair: ${item[0]} ${item[1]}`)
            this.letterPairToFreqLookup[item[0]] = item[1]
            return item
        })
        const shouldLog = true
        if (shouldLog) {
            console.log("array of dynamic key creation")
            console.log(this.arrayOfLetterComboLookUps)
        }
    }
    getArrayOfKeys = (letter: string, index: number, array: any[]): any[] => {
        let keyArray = new Array(sizeOfLargestWord).fill("").map((nonusedItem: string, indexForKey: number) => {
            let lengthOfKey = indexForKey + 3
            let key = array.slice(index, index + lengthOfKey)
            return key
        })
        let keysToUse = keyArray.map(array => array.join(''))
        return keysToUse
    }

}