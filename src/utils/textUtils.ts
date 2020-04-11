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
//whatever this is plus 1
const sizeOfLargestWord = 4

const checkIfDynamicKeysCharsNotValid = (index: number, array: string[]): boolean => {
    let longestKeyIsNotValid = false
    let endOfIndexForLongestWord = Math.min(index + sizeOfLargestWord + 2, array.length - 1)
    let longestPossibleKey = array.slice(index, endOfIndexForLongestWord)
    longestPossibleKey.forEach(char => {
        if (notValidList.indexOf(char) > -1) {
            longestKeyIsNotValid = true
        }
    })
    return longestKeyIsNotValid
}

export class DictionaryTools {
    dict: any
    commonLetterPairs: any = {}
    letterPairs: any[] = []
    letterPairsWithFreq: any[] = []
    letterPairToFreqLookup: any = {}

    arrayOfLetterComboLookUps: any = []
    letterCombos:any = []
    letterComboWithFreq: any = []
    letterComboToFreqLookup: any = []

    arrayOfKeys: any = []
    constructor() {
        this.dict = source
        // this.dict.sort((entry1: string, entry 2: string))
        Object.keys(this.dict).join(' ').split('').forEach((letter: string, index: number, array: string[]) => {
            //if on last letter don't do anything with it
            if (index === array.length) return
            //check to make sure that the current letter and the next letter aren't invalid letters

            if (checkIfLetterNotValid(letter) ||
                checkIfLetterNotValid(array[index + 1])
            ) return

            //key the letter pair for current letter and next letter
            let key = `${letter}${array[index + 1]}`.toLocaleLowerCase()

            this.arrayOfKeys = this.getArrayOfKeys(letter, index, array)
            this.arrayOfKeys.forEach((key: any) => {
                //if this is the first key for this length then create the array
                if (!this.arrayOfLetterComboLookUps[key.length]) {
                    this.arrayOfLetterComboLookUps[key.length] = []
                }
                if (!this.arrayOfLetterComboLookUps[key.length][key]) {
                    this.arrayOfLetterComboLookUps[key.length][key] = 1
                } else {
                    this.arrayOfLetterComboLookUps[key.length][key] += 1
                }
            })
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
        //Sort each array by key length
        this.arrayOfLetterComboLookUps = this.arrayOfLetterComboLookUps.map((keys: string[]) => {
            return Object.entries(keys).sort((item1: any[], item2: any[]) => {
                if (item1[1] > item2[1]) {
                    return -1
                } else if (item1[1] < item2[1]) {
                    return 1
                } else {
                    return 0
                }
            })
        })
        this.arrayOfLetterComboLookUps.map((sortedArray: any[]) => {
            sortedArray.map((letterComboArray: any[], index: number, array: any) => {
                let letterCombo: string = letterComboArray[0]
                let numberOfInstances: number = letterComboArray[1]
                let lenghtOfLetterCombo: number = letterCombo.length
                if (!this.letterComboWithFreq[lenghtOfLetterCombo]) {
                    this.letterComboWithFreq[lenghtOfLetterCombo] = []
                }
                if (!this.letterComboWithFreq[lenghtOfLetterCombo][letterCombo]) {

                    this.letterComboWithFreq[lenghtOfLetterCombo][letterCombo] = numberOfInstances
                }
                if (!this.letterCombos[lenghtOfLetterCombo]) {
                    this.letterCombos[lenghtOfLetterCombo] = {}
                }
                if (!this.letterCombos[lenghtOfLetterCombo][letterCombo]) {

                    this.letterCombos[lenghtOfLetterCombo][letterCombo] = numberOfInstances
                }
            })
        })
        const shouldLog = true
        if (shouldLog) {
            console.log("letterCombos")
            console.log(this.letterCombos)
            console.log("letterComboWithFreq")
            console.log(this.letterComboWithFreq)
            console.log("this.arrayOfLetterComboLookUps")
            console.log(this.arrayOfLetterComboLookUps)
            console.log("this.letterPairsWithFreq")
            console.log(this.letterPairsWithFreq)
        }
    }
    getArrayOfKeys = (letter: string, index: number, array: any[]): any[] => {
        let arrayOfKeys = new Array(sizeOfLargestWord).fill("").map((nonusedItem: string, indexForKey: number) => {
            let lengthOfKey = indexForKey + 2
            //check new key for not allowed chars
            let key = array.slice(index, index + lengthOfKey).join('').toLowerCase()
            notValidList.forEach((notValidChar: string) => {
                if (key.indexOf(notValidChar) > -1) {
                    key = ""
                }
            })
            return key
            //don't return keys that are one letter or empty strings
        })
        arrayOfKeys = arrayOfKeys.filter(key => {
            let keyIsntBlankString = key !== ""
            let keyIsntOneLetter = key.length !== 1
            return keyIsntOneLetter && keyIsntBlankString
        })
        return arrayOfKeys
    }

}